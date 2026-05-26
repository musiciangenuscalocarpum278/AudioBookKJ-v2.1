import os
import uuid
import base64
import subprocess
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from flow_service import flow_service
from visual_pipeline import generate_storyboard, generate_intent_prompt

router = APIRouter()


def slice_storyboard_grid(image_path: str, temp_dir: str) -> list[str]:
    """
    Slices a 2x2 grid image located at image_path into 4 quadrants.
    Saves the slices into temp_dir as slice_1.png, slice_2.png, slice_3.png, slice_4.png.
    Returns the absolute paths to the 4 sliced images.
    """
    from PIL import Image
    
    img = Image.open(image_path)
    width, height = img.size
    
    # Define the 4 quadrants: Top-Left, Top-Right, Bottom-Left, Bottom-Right
    w_half = width // 2
    h_half = height // 2
    
    quadrants = [
        (0, 0, w_half, h_half),          # Top-Left
        (w_half, 0, width, h_half),      # Top-Right
        (0, h_half, w_half, height),     # Bottom-Left
        (w_half, h_half, width, height)  # Bottom-Right
    ]
    
    slice_paths = []
    for i, box in enumerate(quadrants, start=1):
        slice_img = img.crop(box)
        slice_path = os.path.join(temp_dir, f"slice_{i}.png")
        slice_img.save(slice_path)
        slice_paths.append(slice_path)
        
    return slice_paths


class GenerateSceneVideoRequest(BaseModel):
    prompt: str
    project_id: str
    scene_id: str
    start_image_media_id: Optional[str] = None
    reference_media_ids: Optional[list[str]] = None
    aspect_ratio: str = "16:9"
    duration_seconds: int = 8
    is_grid_mode: Optional[bool] = False
    start_image_url: Optional[str] = None


class SceneFrameRequest(BaseModel):
    prompt: str
    project_id: str
    reference_media_ids: list[str] = None
    aspect_ratio: str = "16:9"


class ExtractLastFrameRequest(BaseModel):
    video_path: str
    project_id: str


class IntentPromptRequest(BaseModel):
    user_intent: str
    negative_prompt: str = ""
    scene_context: str = ""
    global_art_style: str = "Cinematic, highly detailed, Unreal Engine 5"
    director_notes: str = ""
    last_frame_path: Optional[str] = None


class StoryboardRequest(BaseModel):
    script: list[dict]
    metadata: dict


@router.post("/api/generate-scene-video")
async def api_generate_scene_video(req: GenerateSceneVideoRequest):
    if req.is_grid_mode:
        # Resolve start image URL/path
        grid_img_path = None
        if req.start_image_url:
            import urllib.parse
            from storage import get_project_root, resolve_project_path
            parsed = urllib.parse.urlparse(req.start_image_url)
            if "/api/project-media/" in parsed.path:
                parts = parsed.path.split("/api/project-media/")[1].split("/")
                p_id = parts[0]
                rel_path = "/".join(parts[1:])
                grid_img_path = resolve_project_path(get_project_root(p_id), rel_path)
            elif os.path.exists(req.start_image_url):
                grid_img_path = req.start_image_url
            else:
                # Try downloading it to a temporary file if it's a URL
                try:
                    import urllib.request
                    import tempfile
                    temp_fd, temp_path = tempfile.mkstemp(suffix=".png")
                    os.close(temp_fd)
                    urllib.request.urlretrieve(req.start_image_url, temp_path)
                    grid_img_path = temp_path
                except Exception as e:
                    print(f"Failed to download external grid image: {e}")
        
        if not grid_img_path or not os.path.exists(grid_img_path):
            raise HTTPException(400, f"Cannot resolve start grid image path: {req.start_image_url}")

        import tempfile
        temp_dir = tempfile.mkdtemp(prefix="grid_slice_")
        slices_files = []
        try:
            slices_files = slice_storyboard_grid(grid_img_path, temp_dir)
            media_ids = []
            for s_path in slices_files:
                with open(s_path, "rb") as sf:
                    img_b64 = base64.b64encode(sf.read()).decode("utf-8")
                res = await flow_service.upload_image(img_b64, project_id=req.project_id)
                if not res.get("success"):
                    # Retry once
                    res = await flow_service.upload_image(img_b64, project_id=req.project_id)
                if not res.get("success"):
                    raise HTTPException(500, f"FlowKit upload of grid slice failed: {res.get('error')}")
                media_ids.append(res["media_id"])
        finally:
            # Clean up temp sliced images
            try:
                for s_path in slices_files:
                    if os.path.exists(s_path):
                        os.remove(s_path)
                if os.path.exists(temp_dir):
                    os.rmdir(temp_dir)
            except Exception as e:
                print(f"Cleanup error for temp slices: {e}")

        # Request video requests sequentially for the 4 quadrants with a 500ms delay to prevent ID/rate-limit collision
        results = []
        for idx, m_id in enumerate(media_ids):
            if idx > 0:
                await asyncio.sleep(0.5)
            
            res_quad = await flow_service.request_scene_video(
                prompt=req.prompt,
                project_id=req.project_id,
                scene_id=f"{req.scene_id}_grid_{idx}",
                start_image_media_id=m_id,
                reference_media_ids=req.reference_media_ids or [],
                aspect_ratio=req.aspect_ratio,
                duration_seconds=2, # Each sub-video is 2 seconds
            )
            results.append(res_quad)

        # Check if any request failed
        for idx, r in enumerate(results):
            if not r.get("success"):
                error_obj = r.get("error", {})
                raise HTTPException(status_code=error_obj.get("status", 500), detail=f"Grid video request {idx} failed: {error_obj}")

        # Return the list of 4 independent slice generation tasks
        slices_data = []
        for idx, (r, m_id) in enumerate(zip(results, media_ids)):
            slices_data.append({
                "idx": idx,
                "operation_name": r.get("operation_name"),
                "media_id": r.get("primary_media_id"),
                "start_image_media_id": m_id
            })

        return {
            "is_grid": True,
            "slices": slices_data
        }
    else:
        # Standard video generation
        res = await flow_service.request_scene_video(
            prompt=req.prompt,
            project_id=req.project_id,
            scene_id=req.scene_id,
            start_image_media_id=req.start_image_media_id,
            reference_media_ids=req.reference_media_ids or [],
            aspect_ratio=req.aspect_ratio,
            duration_seconds=req.duration_seconds,
        )
        if res.get("success"):
            out = {"job_id": res["job_id"], "operation_name": res["operation_name"]}
            if "primary_media_id" in res:
                out["primary_media_id"] = res["primary_media_id"]
            return out
        error_obj = res.get("error", {})
        raise HTTPException(status_code=error_obj.get("status", 500), detail=str(error_obj))


@router.get("/api/check-video-status")
async def api_check_video_status(request: Request, operation_name: str = None, media_id: str = None, project_id: str = "default"):
    if operation_name and operation_name.startswith("parent_grid:"):
        op_names = operation_name.split("parent_grid:")[1].split(",")
        tasks = [flow_service.check_media_status(op) for op in op_names]
        results = await asyncio.gather(*tasks)
        
        all_completed = True
        sub_video_paths = []
        
        # Verify if any call returned error or is still pending
        for idx, r in enumerate(results):
            if r.get("status") != 200:
                all_completed = False
                break
            video_data = r.get("data", {}).get("video", {})
            if "encodedVideo" not in video_data:
                all_completed = False
                break
                
        if not all_completed:
            # If any sub-video has an error, return the error
            for r in results:
                if r.get("status") and r["status"] >= 400:
                    error_obj = r.get("error", {})
                    raise HTTPException(status_code=r["status"], detail=str(error_obj))
            # Otherwise, it's just in progress
            return {"status": 202, "message": "Grid video clips generating in parallel..."}
            
        # All completed! Concatenate using FFmpeg
        import tempfile
        concat_dir = tempfile.mkdtemp(prefix="grid_concat_")
        try:
            for idx, r in enumerate(results):
                video_data = r["data"]["video"]
                encoded = video_data.get("encodedVideo")
                video_bytes = base64.b64decode(encoded, validate=False)
                sub_vid_path = os.path.join(concat_dir, f"sub_video_{idx}.mp4")
                with open(sub_vid_path, "wb") as f:
                    f.write(video_bytes)
                sub_video_paths.append(sub_vid_path)
                
            mylist_path = os.path.join(concat_dir, "mylist.txt")
            with open(mylist_path, "w") as f:
                for p in sub_video_paths:
                    safe_p = p.replace("\\", "/")
                    f.write(f"file '{safe_p}'\n")
                    
            output_vid_filename = f"video_grid_{str(uuid.uuid4())[:8]}.mp4"
            from storage import get_project_root, project_media_path, to_project_relative
            project_root = get_project_root(project_id)
            output_vid_path = project_media_path(project_root, "video/generated-scenes", output_vid_filename)
            os.makedirs(os.path.dirname(output_vid_path), exist_ok=True)
            
            ffmpeg_cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", mylist_path, "-c", "copy", output_vid_path]
            try:
                await asyncio.to_thread(
                    subprocess.run,
                    ffmpeg_cmd,
                    capture_output=True,
                    check=True,
                    timeout=60
                )
            except subprocess.CalledProcessError:
                # Re-encode fallback
                ffmpeg_cmd_reencode = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", mylist_path, "-c:v", "libx264", "-pix_fmt", "yuv420p", output_vid_path]
                await asyncio.to_thread(
                    subprocess.run,
                    ffmpeg_cmd_reencode,
                    capture_output=True,
                    check=True,
                    timeout=60
                )
                
            rel_path = to_project_relative(project_root, output_vid_path)
            base_url = str(request.base_url).rstrip('/')
            fife_url = f"{base_url}/api/project-media/{project_id}/{rel_path}"
            
            return {
                "status": 200,
                "data": {
                    "video": {
                        "fifeUrl": fife_url,
                        "aspectRatio": results[0]["data"]["video"].get("aspectRatio"),
                        "duration": "8.0s"
                    }
                }
            }
        finally:
            # Cleanup temp files
            try:
                for p in sub_video_paths:
                    if os.path.exists(p):
                        os.remove(p)
                mylist_path = os.path.join(concat_dir, "mylist.txt")
                if os.path.exists(mylist_path):
                    os.remove(mylist_path)
                os.rmdir(concat_dir)
            except Exception as e:
                print(f"Cleanup error for temp grid concat files: {e}")
                
    else:
        # Standard status check
        if media_id:
            res = await flow_service.check_media_status(media_id)
        elif operation_name:
            res = await flow_service.check_video_status([operation_name])
        else:
            raise HTTPException(400, "Missing operation_name or media_id")

        error_obj = res.get("error", {})
        if res.get("status") and res["status"] >= 400:
            raise HTTPException(status_code=res["status"], detail=str(error_obj))

        if res.get("status") == 200 and "data" in res:
            video_data = res["data"].get("video", {})
            if "encodedVideo" in video_data:
                encoded = video_data.get("encodedVideo")
                try:
                    video_bytes = base64.b64decode(encoded, validate=False)
                    is_mp4 = len(video_bytes) >= 12 and video_bytes[4:8] == b"ftyp"
                    if is_mp4:
                        video_data.pop("encodedVideo")
                        vid_id = str(media_id if media_id else operation_name)
                        vid_filename = "video_" + "".join(c for c in vid_id if c.isalnum() or c in "-_.") + ".mp4"
                        from storage import get_project_root, project_media_path, to_project_relative
                        project_root = get_project_root(project_id)
                        vid_path = project_media_path(project_root, "video/generated-scenes", vid_filename)
                        with open(vid_path, "wb") as f:
                            f.write(video_bytes)
                        rel_path = to_project_relative(project_root, vid_path)
                        base_url = str(request.base_url).rstrip('/')
                        video_data["fifeUrl"] = f"{base_url}/api/project-media/{project_id}/{rel_path}"
                except Exception as e:
                    print(f"Failed to decode video: {e}")
        return res


@router.get("/api/video")
async def api_get_video(path: str):
    if os.path.exists(path):
        ext = os.path.splitext(path)[1].lower()
        mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png" if ext == ".png" else "video/mp4"
        return FileResponse(path, media_type=mime)
    raise HTTPException(404, "Not found")


@router.get("/api/video/thumbnail")
async def api_get_video_thumbnail(url: str, project_id: str = "default"):
    import urllib.parse
    import hashlib
    from storage import get_project_root, project_media_path, resolve_project_path
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    
    video_path = url
    if "path" in qs:
        video_path = qs["path"][0]
    elif "/api/project-media/" in url:
        parts = url.split("/api/project-media/")[1].split("/")
        p_id = parts[0]
        rel_path = "/".join(parts[1:])
        video_path = resolve_project_path(get_project_root(p_id), rel_path)
        
    url_hash = hashlib.md5(url.encode()).hexdigest()
    project_root = get_project_root(project_id)
    thumb_path = project_media_path(project_root, "video/thumbnails", f"{url_hash}.jpg")
    
    if not os.path.exists(thumb_path):
        try:
            subprocess.run(
                ["ffmpeg", "-i", video_path, "-ss", "00:00:00.500", "-vframes", "1", "-q:v", "2", "-y", thumb_path],
                capture_output=True,
                check=True,
                timeout=30,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            subprocess.run(
                ["ffmpeg", "-i", video_path, "-vframes", "1", "-q:v", "2", "-y", thumb_path],
                capture_output=True,
                timeout=30,
            )
            
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path, media_type="image/jpeg")
    raise HTTPException(404, "Cannot extract thumbnail")


@router.post("/api/debug-veo")
async def api_debug_veo(request: Request):
    body = await request.json()
    url = flow_service._build_url("/v1/video:batchCheckAsyncVideoGenerationStatus")
    res = await flow_service._send("api_request", {
        "url": url, "method": "POST",
        "headers": {"content-type": "application/json"}, "body": body,
    })
    return res


@router.post("/api/generate-scene-frame")
async def api_generate_scene_frame(req: SceneFrameRequest):
    try:
        res = await flow_service.request_scene_frame(
            prompt=req.prompt,
            project_id=req.project_id,
            reference_media_ids=req.reference_media_ids,
            aspect_ratio=req.aspect_ratio,
        )
        if not res.get("success"):
            raise HTTPException(500, str(res.get("error")))
        return {"url": res["url"], "media_id": res["media_id"]}
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(500, str(e))


@router.post("/api/generate-storyboard")
def api_generate_storyboard(req: StoryboardRequest):
    try:
        shots = generate_storyboard(req.script, req.metadata)
        return {"shots": shots}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/api/extract-last-frame")
async def api_extract_last_frame(req: ExtractLastFrameRequest, request: Request):
    is_url = req.video_path.startswith("http://") or req.video_path.startswith("https://")
    if not is_url and not os.path.exists(req.video_path):
        raise HTTPException(404, f"Video file not found: {req.video_path}")
    output_filename = f"{uuid.uuid4()}.jpg"
    from storage import get_project_root, project_media_path, to_project_relative
    project_root = get_project_root(req.project_id)
    output_path = project_media_path(project_root, "video/last-frames", output_filename)
    
    # Đảm bảo thư mục lưu trữ tồn tại
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Xây dựng command ffmpeg cơ bản
    from state import flowkit_state
    
    ffmpeg_input = []
    if is_url and req.video_path.startswith("https://labs.google/"):
        token = flowkit_state.get("flowKey")
        if token:
            ffmpeg_input.extend(["-headers", f"Authorization: Bearer {token}\r\n"])
    ffmpeg_input.extend(["-i", req.video_path])
    
    # Cố gắng lấy frame ở 0.1s cuối cùng
    result = await asyncio.to_thread(
        subprocess.run,
        ["ffmpeg", "-sseof", "-0.1"] + ffmpeg_input + ["-frames:v", "1", "-q:v", "5", "-y", output_path],
        capture_output=True,
        timeout=60,
    )

    # Nếu ffmpeg chạy không lỗi nhưng không sinh ra file (do video quá ngắn hoặc lỗi seek)
    if not os.path.exists(output_path):
        # Fallback: Lấy frame đầu tiên của video thay vì frame cuối
        result = await asyncio.to_thread(
            subprocess.run,
            ["ffmpeg"] + ffmpeg_input + ["-frames:v", "1", "-q:v", "5", "-y", output_path],
            capture_output=True,
            timeout=60,
        )
        
    if not os.path.exists(output_path):
        err_msg = result.stderr.decode(errors="replace") if result else "Unknown error"
        raise HTTPException(500, f"Không thể trích xuất Frame từ video. Chi tiết FFmpeg: {err_msg}")
        
    with open(output_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode("utf-8")
    res = await flow_service.upload_image(image_base64, project_id=req.project_id)
    if not res.get("success"):
        raise HTTPException(500, f"FlowKit upload failed: {res.get('error')}")

    rel_path = to_project_relative(project_root, output_path)
    base_url = str(request.base_url).rstrip('/')
    return {
        "image_path": output_path,
        "image_url": f"{base_url}/api/project-media/{req.project_id}/{rel_path}",
        "media_id": res["media_id"]
    }


@router.post("/api/generate-intent-prompt")
def api_generate_intent_prompt(req: IntentPromptRequest):
    try:
        ai_prompt = generate_intent_prompt(
            user_intent=req.user_intent,
            negative_prompt=req.negative_prompt,
            scene_context=req.scene_context,
            global_art_style=req.global_art_style,
            director_notes=req.director_notes,
            last_frame_path=req.last_frame_path,
        )
        return {"ai_prompt": ai_prompt}
    except Exception as e:
        raise HTTPException(500, str(e))


class UploadLocalImageRequest(BaseModel):
    image_path: str
    project_id: str


@router.post("/api/upload-local-image")
async def api_upload_local_image(req: UploadLocalImageRequest):
    """Upload a server-side image file to FlowKit and return its media_id."""
    if not os.path.exists(req.image_path):
        raise HTTPException(404, f"Image file not found: {req.image_path}")
    with open(req.image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode("utf-8")
    res = await flow_service.upload_image(image_base64, project_id=req.project_id)
    if not res.get("success"):
        raise HTTPException(500, f"FlowKit upload failed: {res.get('error')}")
    return {"media_id": res["media_id"]}
