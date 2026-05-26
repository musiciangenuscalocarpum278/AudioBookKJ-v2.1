import os
import re
import math
import time
import asyncio
import subprocess
from collections import deque
from typing import List
from urllib.parse import urlparse, parse_qs
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pydub import AudioSegment
from state import TEMP_DIR, OUTPUT_DIR

router = APIRouter()


class TimelineClipRequest(BaseModel):
    filename: str
    startTime: float
    track: int
    volume: float = 100.0


class TimelineVideoClipRequest(BaseModel):
    videoUrl: str
    startTime: float
    duration: float
    trimStart: float = 0.0
    keepSound: bool = False
    volume: float = 100.0
    track: int = 0


class MixTimelineRequest(BaseModel):
    clips: List[TimelineClipRequest]
    track_volumes: dict[int, float] = {}
    project_id: str = "default"


class MixVideoTimelineRequest(BaseModel):
    audio_clips: List[TimelineClipRequest]
    video_clips: List[TimelineVideoClipRequest]
    aspect_ratio: str = "16:9"
    output_filename: str | None = None
    track_volumes: dict[int, float] = {}
    video_track_volumes: dict[int, float] = {}
    project_id: str = "default"


def _apply_gain(audio: AudioSegment, clip_vol: float, track_vol: float) -> AudioSegment:
    factor = (clip_vol / 100.0) * (track_vol / 100.0)
    if factor <= 0:
        return audio - 100
    if abs(factor - 1.0) < 0.001:
        return audio
    return audio + (20 * math.log10(factor))


def _resolve_clip_path(filename: str, project_id: str = "default") -> str | None:
    if not filename or not filename.strip():
        return None
        
    from storage import get_project_root, project_media_path
    from urllib.parse import urlparse, unquote
    
    print(f"DEBUG: Resolving clip path for: {filename}")
    if filename.startswith("http://") or filename.startswith("https://") or filename.startswith("blob:"):
        parsed = urlparse(filename)
        if "/api/project-media/" in parsed.path:
            parts = parsed.path.split("/api/project-media/")
            if len(parts) > 1:
                pid_and_path = parts[1].split("/", 1)
                if len(pid_and_path) == 2:
                    pid, rel_path = pid_and_path
                    category = os.path.dirname(unquote(rel_path)).replace("\\", "/")
                    base_filename = os.path.basename(unquote(rel_path))
                    local_path = project_media_path(get_project_root(pid), category, base_filename)
                    if os.path.isfile(local_path):
                        return local_path
        filename = unquote(os.path.basename(parsed.path))
        print(f"DEBUG: Parsed basename: {filename}")

    project_root = get_project_root(project_id)
    print(f"DEBUG: Project root: {project_root}")
    if os.path.isabs(filename) and os.path.isfile(filename):
        return filename
    
    candidates = [
        os.path.join(project_root, filename) if not filename.startswith("http") else "",
        os.path.join(project_root, "media", filename) if not filename.startswith("http") else "",
        os.path.join(project_root, filename.replace("media/", "media/audio/")) if "media/" in filename else "",
        project_media_path(project_root, "audio/rendered-lines", os.path.basename(filename)),
        project_media_path(project_root, "audio/previews", os.path.basename(filename)),
        project_media_path(project_root, "video/generated-scenes", os.path.basename(filename)),
        filename,
        os.path.join(TEMP_DIR, os.path.basename(filename)),
        os.path.join(OUTPUT_DIR, os.path.basename(filename))
    ]
    for candidate in candidates:
        exists = os.path.isfile(candidate)
        print(f"DEBUG: Checking {candidate} -> exists: {exists}")
        if exists:
            return candidate
    print(f"DEBUG: Could not resolve clip path for {filename}")
    return None


def _parse_ffmpeg_time(time_str: str) -> float:
    parts = time_str.split(":")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])


def _get_export_dimensions(aspect_ratio: str) -> tuple[int, int]:
    if aspect_ratio == "9:16":
        return 1080, 1920
    return 1920, 1080


def _build_video_mix_assets(req: MixVideoTimelineRequest):
    """Download videos, build audio mix, return (audio_out, downloaded_videos, max_duration_sec, ffmpeg_cmd)."""
    import requests as _requests

    audio_objects = []
    max_duration = 0
    from storage import get_project_root, project_media_path, to_project_relative
    project_root = get_project_root(req.project_id)

    missing_audio = []
    for clip in req.audio_clips:
        if not _resolve_clip_path(clip.filename, req.project_id):
            missing_audio.append(clip.filename)
    if missing_audio:
        raise HTTPException(422, detail={"error": "missing_audio_files", "files": missing_audio})

    for clip in req.audio_clips:
        path = _resolve_clip_path(clip.filename, req.project_id)
        audio = AudioSegment.from_file(path)
        track_vol = req.track_volumes.get(clip.track, 100.0)
        audio = _apply_gain(audio, clip.volume, track_vol)
        end_ms = int(clip.startTime * 1000) + len(audio)
        if end_ms > max_duration:
            max_duration = end_ms
        audio_objects.append((audio, int(clip.startTime * 1000)))

    temp_vid_dir = project_media_path(project_root, "exports/temp_videos", "")
    os.makedirs(temp_vid_dir, exist_ok=True)
    downloaded_videos = []
    print("=== DEBUG: AUDIO CLIPS ===")
    for c in req.audio_clips:
        print(c.dict())
    print("=== DEBUG: VIDEO CLIPS ===")
    for c in req.video_clips:
        print(c.dict())

    for i, vc in enumerate(req.video_clips):
        parsed = urlparse(vc.videoUrl)
        qs = parse_qs(parsed.query)
        local_path = None
        
        if "path" in qs and os.path.isfile(qs["path"][0]):
            local_path = qs["path"][0]
        elif "/api/project-media/" in parsed.path:
            parts = parsed.path.split("/api/project-media/")
            if len(parts) > 1:
                pid_and_path = parts[1].split("/", 1)
                if len(pid_and_path) == 2:
                    pid, rel_path = pid_and_path
                    category = os.path.dirname(rel_path).replace("\\", "/")
                    filename = os.path.basename(rel_path)
                    local_path = project_media_path(get_project_root(pid), category, filename)
                    if not os.path.isfile(local_path):
                        local_path = None
        elif parsed.scheme == "file":
             # Handle file:/// URLs which might come from drag&drop or local tests
             # Removing the leading slash on Windows (e.g. /C:/...)
             fs_path = parsed.path
             if os.name == 'nt' and fs_path.startswith('/'):
                 fs_path = fs_path[1:]
             if os.path.isfile(fs_path):
                 local_path = fs_path

        if not local_path:
            local_path = os.path.join(temp_vid_dir, f"video_{i}.mp4")
            try:
                r = _requests.get(vc.videoUrl, stream=True, timeout=15)
                if r.status_code == 200:
                    with open(local_path, "wb") as f:
                        for chunk in r.iter_content(8192):
                            f.write(chunk)
                else:
                    continue
            except Exception as e:
                print(f"Error downloading {vc.videoUrl}: {e}")
                continue

        video_end_ms = int((vc.startTime + vc.duration) * 1000)
        if video_end_ms > max_duration:
            max_duration = video_end_ms
        downloaded_videos.append({
            "path": local_path, "start": vc.startTime,
            "dur": vc.duration, "trimStart": vc.trimStart,
            "keepSound": vc.keepSound, "volume": vc.volume, "track": vc.track,
        })

    if not audio_objects and not downloaded_videos:
        raise Exception("No valid clips found.")

    final_audio = AudioSegment.silent(duration=math.ceil(max_duration))
    for audio, pos in audio_objects:
        final_audio = final_audio.overlay(audio, position=pos)
    for dv in downloaded_videos:
        if not dv["keepSound"]:
            continue
        try:
            vid_audio = AudioSegment.from_file(dv["path"])
            trim_ms = int(dv["trimStart"] * 1000)
            vid_audio = vid_audio[trim_ms: trim_ms + int(dv["dur"] * 1000)]
            vid_track_vol = req.video_track_volumes.get(dv["track"], 100.0)
            vid_audio = _apply_gain(vid_audio, dv["volume"], vid_track_vol)
            final_audio = final_audio.overlay(vid_audio, position=int(dv["start"] * 1000))
        except Exception:
            pass

    ts = int(time.time())
    ratio_safe = req.aspect_ratio.replace(":", "x")
    audio_out_dir = project_media_path(project_root, "exports/audio", "")
    os.makedirs(audio_out_dir, exist_ok=True)
    audio_out = os.path.join(audio_out_dir, f"export_{ts}_{ratio_safe}.mp3")
    final_audio.export(audio_out, format="mp3")

    if not downloaded_videos:
        raise Exception("No valid video clips were downloaded.")

    video_out_dir = project_media_path(project_root, "exports/video", "")
    os.makedirs(video_out_dir, exist_ok=True)
    if req.output_filename:
        out_video = os.path.join(video_out_dir, req.output_filename)
    else:
        out_video = os.path.join(video_out_dir, f"export_{ts}_{ratio_safe}.mp4")
    width, height = _get_export_dimensions(req.aspect_ratio)
    inputs = []
    filter_complex = f"color=c=black:s={width}x{height}:d={max_duration / 1000}[base];"
    for i, dv in enumerate(downloaded_videos):
        inputs.extend(["-i", dv["path"]])
        filter_complex += (
            f"[{i}:v]trim=start={dv['trimStart']}:duration={dv['dur']},"
            f"setpts=PTS-STARTPTS+{dv['start']}/TB,"
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v{i}];"
        )
    prev = "[base]"
    for i, dv in enumerate(downloaded_videos):
        nxt = f"[ov{i}]" if i < len(downloaded_videos) - 1 else "[v_out]"
        filter_complex += f"{prev}[v{i}]overlay=enable='between(t,{dv['start']},{dv['start'] + dv['dur']})'{nxt};"
        prev = nxt
    inputs.extend(["-i", audio_out])

    cmd = ["ffmpeg", "-y"] + inputs + [
        "-filter_complex", filter_complex,
        "-map", "[v_out]",
        "-map", f"{len(downloaded_videos)}:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
        out_video,
    ]
    return audio_out, downloaded_videos, max_duration / 1000, cmd, out_video


@router.post("/api/mix-timeline")
async def api_mix_timeline(req: MixTimelineRequest):
    try:
        audio_objects = []
        max_duration = 0
        from storage import get_project_root, project_media_path
        project_root = get_project_root(req.project_id)

        missing_audio = [c.filename for c in req.clips if not _resolve_clip_path(c.filename, req.project_id)]
        if missing_audio:
            raise HTTPException(422, detail={"error": "missing_audio_files", "files": missing_audio})

        for clip in req.clips:
            path = _resolve_clip_path(clip.filename, req.project_id)
            audio = AudioSegment.from_file(path)
            track_vol = req.track_volumes.get(clip.track, 100.0)
            audio = _apply_gain(audio, clip.volume, track_vol)
            end_ms = int(clip.startTime * 1000) + len(audio)
            if end_ms > max_duration:
                max_duration = end_ms
            audio_objects.append((audio, int(clip.startTime * 1000)))

        if not audio_objects:
            raise Exception("No valid audio clips found to mix.")

        final = AudioSegment.silent(duration=math.ceil(max_duration))
        for audio, pos in audio_objects:
            final = final.overlay(audio, position=pos)

        audio_out_dir = project_media_path(project_root, "exports/audio", "")
        os.makedirs(audio_out_dir, exist_ok=True)
        out = os.path.join(audio_out_dir, f"export_{int(time.time())}.mp3")
        final.export(out, format="mp3")
        return FileResponse(out, media_type="audio/mpeg", filename=os.path.basename(out))
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/api/mix-video-timeline")
async def api_mix_video_timeline(req: MixVideoTimelineRequest):
    try:
        _, _, _, cmd, out_video = _build_video_mix_assets(req)
        print("Running FFmpeg:", " ".join(cmd))
        try:
            subprocess.run(cmd, check=True, timeout=3600)
        except subprocess.TimeoutExpired:
            raise HTTPException(500, "FFmpeg timeout sau 1 giờ")
        return FileResponse(out_video, media_type="video/mp4")
    except HTTPException:
        raise
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(500, str(e))


@router.get("/api/output-file")
async def get_output_file(project_id: str = "default", output_id: str = None):
    """Serve the most recently assembled output file (video or audio) for a project, or a specific file."""
    from storage import get_project_root, project_media_path
    project_root = get_project_root(project_id)
    
    if output_id:
        video_path = project_media_path(project_root, "exports/video", output_id)
        audio_path = project_media_path(project_root, "exports/audio", output_id)
        if os.path.exists(video_path):
            return FileResponse(video_path, media_type="video/mp4", filename=os.path.basename(video_path))
        if os.path.exists(audio_path):
            return FileResponse(audio_path, media_type="audio/mpeg", filename=os.path.basename(audio_path))
        raise HTTPException(404, "Requested output file not found.")

    candidates = []
    vid_dir = project_media_path(project_root, "exports/video", "")
    aud_dir = project_media_path(project_root, "exports/audio", "")
    
    if os.path.exists(vid_dir):
        candidates.extend([os.path.join(vid_dir, f) for f in os.listdir(vid_dir) if f.endswith(".mp4")])
    if os.path.exists(aud_dir):
        candidates.extend([os.path.join(aud_dir, f) for f in os.listdir(aud_dir) if f.endswith(".mp3")])

    if not candidates:
        raise HTTPException(404, "No output file found in project. Run a mix first.")
        
    latest = max(candidates, key=os.path.getmtime)
    if latest.endswith(".mp4"):
        return FileResponse(latest, media_type="video/mp4", filename=os.path.basename(latest))
    return FileResponse(latest, media_type="audio/mpeg", filename=os.path.basename(latest))


@router.websocket("/ws/mix-progress")
async def ws_mix_progress(websocket: WebSocket):
    """Mix video timeline with real-time FFmpeg progress streamed over WebSocket."""
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        req = MixVideoTimelineRequest(**data)

        await websocket.send_json({"type": "status", "message": "Đang tải video và ghép audio..."})
        loop = asyncio.get_event_loop()

        # Heavy setup (download + pydub) runs in a thread to avoid blocking the event loop
        _, _, total_seconds, cmd, out_video = await loop.run_in_executor(
            None, _build_video_mix_assets, req
        )

        await websocket.send_json({"type": "status", "message": "Đang chạy FFmpeg..."})

        # Run FFmpeg in a thread and stream stderr progress back via asyncio.Queue
        progress_queue: asyncio.Queue = asyncio.Queue()

        def ffmpeg_thread():
            proc = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
            buf = b""
            while True:
                chunk = proc.stderr.read(512)
                if not chunk:
                    break
                buf += chunk
                while True:
                    idx_r = buf.find(b"\r")
                    idx_n = buf.find(b"\n")
                    candidates = [i for i in [idx_r, idx_n] if i >= 0]
                    if not candidates:
                        break
                    idx = min(candidates)
                    line = buf[:idx].decode("utf-8", errors="replace").strip()
                    buf = buf[idx + 1:]
                    if line:
                        loop.call_soon_threadsafe(progress_queue.put_nowait, ("line", line))
            try:
                proc.wait(timeout=3600)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()
                loop.call_soon_threadsafe(progress_queue.put_nowait, ("error", "FFmpeg timeout sau 1 giờ"))
                return
            loop.call_soon_threadsafe(progress_queue.put_nowait, ("done", proc.returncode))

        loop.run_in_executor(None, ffmpeg_thread)

        stderr_tail: deque[str] = deque(maxlen=20)
        while True:
            msg_type, value = await progress_queue.get()
            if msg_type == "line":
                stderr_tail.append(value)
                match = re.search(r"time=(\d+:\d+:\d+\.\d+)", value)
                if match and total_seconds > 0:
                    time_str = match.group(1)
                    elapsed = _parse_ffmpeg_time(time_str)
                    percent = min(99, int(elapsed / total_seconds * 100))
                    await websocket.send_json({
                        "type": "progress",
                        "message": time_str,
                        "percent": percent,
                    })
            elif msg_type == "error":
                await websocket.send_json({"type": "error", "message": value, "stderr": list(stderr_tail)})
                return
            elif msg_type == "done":
                returncode = value
                break

        if returncode == 0:
            await websocket.send_json({"type": "done"})
        else:
            await websocket.send_json({
                "type": "error",
                "message": "FFmpeg thất bại (returncode != 0)",
                "stderr": list(stderr_tail),
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        import traceback; traceback.print_exc()
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
