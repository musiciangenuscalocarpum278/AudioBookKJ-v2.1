import os
import time
import json
import shutil
import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional

from state import audio_gen

router = APIRouter()

PLAYGROUND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "agy_tmp", "playground"))
REF_DIR = os.path.join(PLAYGROUND_DIR, "ref")
METADATA_FILE = os.path.join(PLAYGROUND_DIR, "metadata.json")

# Bảo đảm các thư mục tồn tại
os.makedirs(PLAYGROUND_DIR, exist_ok=True)
os.makedirs(REF_DIR, exist_ok=True)

def load_metadata():
    if not os.path.exists(METADATA_FILE):
        return []
    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_metadata(data):
    try:
        with open(METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Playground] Lỗi khi lưu metadata: {e}")

class GeneratePlaygroundRequest(BaseModel):
    text: str
    mode: str  # "instruct" or "clone"
    language: Optional[str] = None
    instruct: Optional[str] = None
    ref_audio_filename: Optional[str] = None
    ref_text: Optional[str] = None
    speed: Optional[float] = None
    duration: Optional[float] = None
    num_step: int = 32
    guidance_scale: float = 2.0
    denoise: bool = True
    postprocess_output: bool = True

@router.get("/api/playground/history")
async def get_playground_history():
    return load_metadata()

@router.post("/api/playground/upload-ref")
async def upload_playground_ref(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận định dạng file .wav")
    
    # Tạo tên file độc nhất để tránh đè
    filename = f"ref_{int(time.time())}_{file.filename}"
    file_path = os.path.join(REF_DIR, filename)
    
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi lưu file upload: {e}")
        
    return {"filename": filename, "path": file_path}

@router.post("/api/playground/generate")
async def generate_playground_voice(req: GeneratePlaygroundRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Văn bản không được để trống")
    
    # Định nghĩa tên file đầu ra
    filename = f"play_{int(time.time())}_{int(np.random.randint(1000, 9999))}.wav"
    output_path = os.path.join(PLAYGROUND_DIR, filename)
    
    # Chuẩn bị tham số
    ref_audio_path = None
    if req.mode == "clone" and req.ref_audio_filename:
        # Kiểm tra xem có phải là file tải lên tạm trong sandbox hay là file voice của dự án
        sandbox_path = os.path.join(REF_DIR, req.ref_audio_filename)
        voice_ref_global_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Voice_ref", req.ref_audio_filename))
        
        if os.path.exists(sandbox_path):
            ref_audio_path = sandbox_path
        elif os.path.exists(voice_ref_global_path):
            ref_audio_path = voice_ref_global_path
        else:
            raise HTTPException(status_code=404, detail="Không tìm thấy file ref audio được yêu cầu")

    # Xây dựng kwargs gọi trực tiếp thư viện OmniVoice
    kwargs = {
        "num_step": int(req.num_step),
        "guidance_scale": float(req.guidance_scale),
        "denoise": bool(req.denoise),
        "postprocess_output": bool(req.postprocess_output),
        "audio_chunk_duration": 10.0,
        "audio_chunk_threshold": 15.0
    }
    
    # Đọc ngôn ngữ
    lang = req.language if req.language and req.language.lower() != "auto" else None
    
    try:
        t_start = time.time()
        
        # Gọi trực tiếp model generate để bỏ qua các bộ xử lý tự động của app
        if req.mode == "clone" and ref_audio_path:
            audio = audio_gen.model.generate(
                text=req.text,
                language=lang,
                ref_audio=ref_audio_path,
                ref_text=req.ref_text if req.ref_text and req.ref_text.strip() else None,
                speed=req.speed,
                duration=req.duration,
                **kwargs
            )
        else:
            # Instruct Mode
            audio = audio_gen.model.generate(
                text=req.text,
                language=lang,
                instruct=req.instruct if req.instruct and req.instruct.strip() else "female, moderate pitch, young adult",
                speed=req.speed,
                duration=req.duration,
                **kwargs
            )
            
        t_duration = time.time() - t_start
        
        # Lưu file
        sf.write(output_path, audio[0], 24000)
        
        # Đo thời lượng thực tế của file âm thanh đầu ra
        info = sf.info(output_path)
        audio_len = info.frames / info.samplerate
        
    except Exception as e:
        print(f"[Playground] Lỗi khi sinh âm thanh: {e}")
        if os.path.exists(output_path):
            os.remove(output_path)
        raise HTTPException(status_code=500, detail=f"Lỗi suy luận OmniVoice: {e}")
        
    # Lưu metadata
    new_entry = {
        "id": f"play_{int(time.time())}",
        "filename": filename,
        "text": req.text,
        "mode": req.mode,
        "language": req.language or "Auto",
        "instruct": req.instruct if req.mode == "instruct" else None,
        "ref_audio": req.ref_audio_filename if req.mode == "clone" else None,
        "ref_text": req.ref_text if req.mode == "clone" else None,
        "speed": req.speed or 1.0,
        "duration_limit": req.duration,
        "audio_duration": round(audio_len, 2),
        "num_step": req.num_step,
        "guidance_scale": req.guidance_scale,
        "denoise": req.denoise,
        "postprocess_output": req.postprocess_output,
        "generation_time": round(t_duration, 2),
        "timestamp": int(time.time())
    }
    
    history = load_metadata()
    history.insert(0, new_entry) # Đẩy lên đầu
    save_metadata(history)
    
    return new_entry

@router.get("/api/playground/audio/{filename}")
async def get_playground_audio(filename: str, request: Request):
    file_path = os.path.join(PLAYGROUND_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy file audio thử nghiệm")
    
    origin = request.headers.get("origin", "*")
    return FileResponse(
        file_path,
        media_type="audio/wav",
        headers={"Access-Control-Allow-Origin": origin}
    )

@router.delete("/api/playground/clear")
async def clear_playground_history():
    try:
        # Xóa toàn bộ file và thư mục tạm
        if os.path.exists(PLAYGROUND_DIR):
            shutil.rmtree(PLAYGROUND_DIR)
        os.makedirs(PLAYGROUND_DIR, exist_ok=True)
        os.makedirs(REF_DIR, exist_ok=True)
        save_metadata([])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi dọn dẹp Sandbox: {e}")
    return {"status": "success"}

@router.delete("/api/playground/delete/{id}")
async def delete_playground_entry(id: str):
    history = load_metadata()
    entry_to_remove = None
    for item in history:
        if item["id"] == id:
            entry_to_remove = item
            break
            
    if not entry_to_remove:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục yêu cầu")
        
    # Xóa file vật lý
    file_path = os.path.join(PLAYGROUND_DIR, entry_to_remove["filename"])
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"[Playground] Lỗi khi xóa file {file_path}: {e}")
            
    # Cập nhật metadata
    history = [item for item in history if item["id"] != id]
    save_metadata(history)
    return {"status": "success"}


class ApplyPlaygroundVoiceRequest(BaseModel):
    entry_id: str
    speaker: str
    project_id: str = "default"
    mode: str  # "clone" or "params"


@router.post("/api/playground/apply-to-speaker")
async def apply_playground_voice(req: ApplyPlaygroundVoiceRequest):
    history = load_metadata()
    entry = None
    for item in history:
        if item["id"] == req.entry_id:
            entry = item
            break
            
    if not entry:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi thử nghiệm trong lịch sử")
        
    sandbox_file_path = os.path.join(PLAYGROUND_DIR, entry["filename"])
    if not os.path.exists(sandbox_file_path):
        raise HTTPException(status_code=404, detail="File âm thanh thử nghiệm đã bị xóa hoặc dọn dẹp")
        
    from state import normalize_speaker_id
    speaker_id = normalize_speaker_id(req.speaker)
    
    from storage import get_project_root, project_media_path
    project_root = get_project_root(req.project_id)
    
    if req.mode == "clone":
        # Sao chép vật lý file sang voices/uploaded
        perm_path = project_media_path(project_root, "voices/uploaded", f"{speaker_id}_voice.wav")
        os.makedirs(os.path.dirname(perm_path), exist_ok=True)
        shutil.copy2(sandbox_file_path, perm_path)
        
        # Xóa file synthetic cũ nếu có để tránh xung đột
        synthetic_path = project_media_path(project_root, "voices/synthetic", f"{speaker_id}_synthetic.wav")
        if os.path.exists(synthetic_path):
            try:
                os.remove(synthetic_path)
            except Exception as e:
                print(f"[Playground Sync] Lỗi khi dọn dẹp file synthetic cũ: {e}")
                
        # Cập nhật DB: set is_locked = 1
        from database import get_conn
        conn = get_conn()
        conn.execute("""
            INSERT INTO voice_params (speaker, project_id, is_locked)
            VALUES (?, ?, 1)
            ON CONFLICT(speaker, project_id) DO UPDATE SET
                is_locked = 1
        """, (speaker_id, req.project_id))
        conn.commit()
        conn.close()
        
        # Cập nhật cache RAM
        audio_gen.voice_cache[speaker_id] = perm_path
        
    elif req.mode == "params":
        # Trích xuất và phân tích tham số
        gender = "female"
        age = "adult"
        pitch = "moderate"
        
        instruct_str = entry.get("instruct") or ""
        parts = [p.strip().lower() for p in instruct_str.split(",") if p.strip()]
        for p in parts:
            if p in ["male", "female"]:
                gender = p
            elif p in ["child", "teenager", "young adult", "adult", "middle-aged", "elderly"]:
                age = p
            elif "pitch" in p:
                pitch = p.replace(" pitch", "").strip()
                
        # Cập nhật DB: set is_locked = 0 và gán params mới
        from database import get_conn
        conn = get_conn()
        conn.execute("""
            INSERT INTO voice_params (speaker, project_id, gender, age, pitch, is_locked)
            VALUES (?, ?, ?, ?, ?, 0)
            ON CONFLICT(speaker, project_id) DO UPDATE SET
                gender = excluded.gender,
                age = excluded.age,
                pitch = excluded.pitch,
                is_locked = 0
        """, (speaker_id, req.project_id, gender, age, pitch))
        conn.commit()
        conn.close()
        
        # Xóa file voice clone và synthetic hiện có để fallback về params
        uploaded_path = project_media_path(project_root, "voices/uploaded", f"{speaker_id}_voice.wav")
        synthetic_path = project_media_path(project_root, "voices/synthetic", f"{speaker_id}_synthetic.wav")
        
        if os.path.exists(uploaded_path):
            try:
                os.remove(uploaded_path)
            except Exception as e:
                print(f"[Playground Sync] Lỗi khi xóa file uploaded: {e}")
        if os.path.exists(synthetic_path):
            try:
                os.remove(synthetic_path)
            except Exception as e:
                print(f"[Playground Sync] Lỗi khi xóa file synthetic: {e}")
                
        # Xóa khỏi cache RAM
        if speaker_id in audio_gen.voice_cache:
            del audio_gen.voice_cache[speaker_id]
            
    return {"status": "success"}
