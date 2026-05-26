import os
import time
import soundfile as sf
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pydub import AudioSegment
from state import audio_gen, TEMP_DIR, OUTPUT_DIR, normalize_speaker_id

router = APIRouter()


from typing import Optional

class VoiceParams(BaseModel):
    gender: str = "female"
    age: str = "adult"
    pitch: str = "moderate"

class RenderLineRequest(BaseModel):
    id: int
    text: str
    speaker: str
    project_id: str = "default"
    voice_params: Optional[VoiceParams] = None
    speed: float = 1.0


class AssembleAudioRequest(BaseModel):
    filenames: list[str]
    project_id: str = "default"


class TestVoiceRequest(BaseModel):
    text: str
    speaker: str
    project_id: str = "default"
    voice_params: Optional[VoiceParams] = None
    speed: float = 1.0


class SyntheticVoiceRequest(BaseModel):
    speaker: str
    instruct: str
    project_id: str = "default"
    sample_text: str = (
        "Xin chào, hệ thống đã ghi nhận thành công chất giọng chuẩn của tôi. "
        "Với thiết lập này, tôi có thể truyền đạt mọi cung bậc cảm xúc một cách tự nhiên nhất, "
        "từ những lời thì thầm bí ẩn cho đến những đoạn cao trào dữ dội. "
        "Hãy lưu giữ bản ghi âm mẫu này thật kỹ để đảm bảo độ nhất quán tuyệt đối "
        "cho toàn bộ câu chuyện dài kỳ của chúng ta nhé."
    )


def _get_ref_audio_path(speaker_id: str, project_root: str) -> str | None:
    from storage import project_media_path
    voice_dir = os.path.join(os.path.dirname(__file__), "..", "Voice_ref")
    candidates = [
        project_media_path(project_root, "voices/uploaded", f"{speaker_id}_voice.wav"),
        project_media_path(project_root, "voices/synthetic", f"{speaker_id}_synthetic.wav"),
        os.path.join(TEMP_DIR, f"voice_{speaker_id}.wav"),
        os.path.join(voice_dir, f"{speaker_id}_voice.wav"),
        os.path.join(voice_dir, f"{speaker_id}_synthetic.wav"),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def _get_project_tts_params(project_id: str) -> dict:
    from database import get_conn
    try:
        conn = get_conn()
        row = conn.execute(
            "SELECT tts_denoise, tts_postprocess, tts_num_step, tts_guidance_scale FROM projects WHERE id=?", 
            (project_id,)
        ).fetchone()
        conn.close()
        if row:
            return {
                "denoise": bool(row["tts_denoise"]),
                "postprocess_output": bool(row["tts_postprocess"]),
                "num_step": int(row["tts_num_step"]),
                "guidance_scale": float(row["tts_guidance_scale"])
            }
    except Exception as e:
        print(f"[Audio API] Error fetching TTS project settings: {e}")
    return {
        "denoise": True,
        "postprocess_output": False,
        "num_step": 32,
        "guidance_scale": 2.0
    }


@router.get("/api/audio")
async def api_get_audio(request: Request, path: str):
    if os.path.exists(path):
        origin = request.headers.get("origin", "*")
        return FileResponse(
            path, 
            media_type="audio/wav",
            headers={"Access-Control-Allow-Origin": origin}
        )
    raise HTTPException(404, "Not found")


@router.post("/api/render-line")
async def api_render_line(req: RenderLineRequest):
    from storage import get_project_root, project_media_path, to_project_relative
    
    project_root = get_project_root(req.project_id)
    filename = f"line_{req.id}_{int(time.time())}.wav"
    wav_path = project_media_path(project_root, "audio/rendered-lines", filename)
    os.makedirs(os.path.dirname(wav_path), exist_ok=True)
    
    vp = req.voice_params.dict() if req.voice_params else None
    ref_audio_path = _get_ref_audio_path(normalize_speaker_id(req.speaker), project_root)
    tts_params = _get_project_tts_params(req.project_id)
    success = audio_gen.generate(
        req.text, wav_path, req.speaker, 
        voice_params=vp, speed=req.speed, 
        ref_audio_path=ref_audio_path,
        denoise=tts_params["denoise"],
        postprocess_output=tts_params["postprocess_output"],
        num_step=tts_params["num_step"],
        guidance_scale=tts_params["guidance_scale"]
    )
    if not success:
        raise HTTPException(500, "Render failed")
    try:
        info = sf.info(wav_path)
        duration = info.frames / info.samplerate
    except Exception:
        try:
            audio = AudioSegment.from_wav(wav_path)
            duration = len(audio) / 1000.0
        except Exception as e:
            raise HTTPException(500, f"Audio rendered but unreadable: {e}")
            
    rel_path = to_project_relative(project_root, wav_path)
    return {"audio_path": wav_path, "file": rel_path, "duration": duration}


@router.post("/api/assemble-audio")
async def api_assemble_audio(req: AssembleAudioRequest):
    from storage import get_project_root, project_media_path
    project_root = get_project_root(req.project_id)
    output_dir = project_media_path(project_root, "exports/audio", "")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"assembled_{int(time.time())}.mp3")
    
    combined = AudioSegment.empty()
    silence = AudioSegment.silent(duration=800)
    for f in req.filenames:
        if os.path.isabs(f) and os.path.exists(f):
            combined += AudioSegment.from_wav(f) + silence
        else:
            full_path = project_media_path(project_root, "", f)
            if os.path.exists(full_path):
                combined += AudioSegment.from_wav(full_path) + silence
            elif os.path.exists(f):
                combined += AudioSegment.from_wav(f) + silence
                
    combined.export(output_path, format="mp3", bitrate="192k")
    return FileResponse(output_path, media_type="audio/mpeg")


@router.post("/api/test-voice")
async def api_test_voice(req: TestVoiceRequest):
    from storage import get_project_root, project_media_path
    speaker_id = normalize_speaker_id(req.speaker)
    project_root = get_project_root(req.project_id)
    filename = f"test_{speaker_id}_{int(time.time())}.wav"
    wav_path = project_media_path(project_root, "audio/previews", filename)
    os.makedirs(os.path.dirname(wav_path), exist_ok=True)
    
    vp = req.voice_params.dict() if req.voice_params else None
    ref_audio_path = _get_ref_audio_path(speaker_id, project_root)
    tts_params = _get_project_tts_params(req.project_id)
    if audio_gen.generate(
        req.text, wav_path, req.speaker, 
        voice_params=vp, speed=req.speed, 
        ref_audio_path=ref_audio_path,
        denoise=tts_params["denoise"],
        postprocess_output=tts_params["postprocess_output"],
        num_step=tts_params["num_step"],
        guidance_scale=tts_params["guidance_scale"]
    ):
        return FileResponse(wav_path, media_type="audio/wav")
    raise HTTPException(500, "Generate failed")


@router.post("/api/create-synthetic-voice")
async def api_create_synthetic_voice(req: SyntheticVoiceRequest):
    speaker_id = normalize_speaker_id(req.speaker)
    from storage import get_project_root, project_media_path
    project_root = get_project_root(req.project_id)
    perm_path = project_media_path(project_root, "voices/synthetic", f"{speaker_id}_synthetic.wav")
    os.makedirs(os.path.dirname(perm_path), exist_ok=True)
    
    success = audio_gen.create_synthetic_voice(req.sample_text, perm_path, req.instruct)
    if not success:
        raise HTTPException(500, "Generate failed")
        
    # Xóa file upload cũ nếu có để tránh xung đột độ ưu tiên
    uploaded_path = project_media_path(project_root, "voices/uploaded", f"{speaker_id}_voice.wav")
    if os.path.exists(uploaded_path):
        try:
            os.remove(uploaded_path)
            print(f"[Voice Casting] Đã dọn dẹp file upload cũ tại {uploaded_path} để chuyển sang giọng Ảo.")
        except Exception as e:
            print(f"[Voice Casting] Lỗi khi dọn dẹp file upload cũ: {e}")
        
    audio_gen.voice_cache[speaker_id] = perm_path
    
    return {"status": "success"}


@router.post("/api/upload-voice-ref")
async def api_upload_voice_ref(speaker: str, project_id: str = "default", file: UploadFile = File(...)):
    speaker_id = normalize_speaker_id(speaker)
    from storage import get_project_root, project_media_path
    project_root = get_project_root(project_id)
    perm_path = project_media_path(project_root, "voices/uploaded", f"{speaker_id}_voice.wav")
    os.makedirs(os.path.dirname(perm_path), exist_ok=True)
    
    contents = await file.read()
    with open(perm_path, "wb") as f:
        f.write(contents)
        
    # Xóa file synthetic cũ nếu có để tránh xung đột độ ưu tiên
    synthetic_path = project_media_path(project_root, "voices/synthetic", f"{speaker_id}_synthetic.wav")
    if os.path.exists(synthetic_path):
        try:
            os.remove(synthetic_path)
            print(f"[Voice Casting] Đã dọn dẹp file synthetic cũ tại {synthetic_path} để chuyển sang giọng Upload.")
        except Exception as e:
            print(f"[Voice Casting] Lỗi khi dọn dẹp file synthetic cũ: {e}")
        
    audio_gen.voice_cache[speaker_id] = perm_path
    return {"status": "success"}


@router.get("/api/voice-ref/{speaker}")
async def api_get_voice_ref(speaker: str, project_id: str = "default"):
    speaker_id = normalize_speaker_id(speaker)
    from storage import get_project_root
    project_root = get_project_root(project_id)
    ref_path = _get_ref_audio_path(speaker_id, project_root)
    if ref_path:
        return FileResponse(ref_path, media_type="audio/wav")
    raise HTTPException(404, "Voice reference not found")
