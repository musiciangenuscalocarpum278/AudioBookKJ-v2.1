import sys
import traceback
import torch
import soundfile as sf
import os
import re
import transformers

# Tắt các dòng log warning phiền phức của thư viện transformers
transformers.logging.set_verbosity_error()

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    # Fallback thủ công tự động nếu môi trường hiện tại chưa cài python-dotenv
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip().strip("'\"")

from omnivoice import OmniVoice

class AudioGenerator:
    def __init__(self):
        model_name = os.getenv("TTS_MODEL_NAME", "k2-fsa/OmniVoice")
        
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        
        # Check standard HuggingFace Hub cache path to alert user if a download is about to start
        try:
            from huggingface_hub.constants import HF_HUB_CACHE
            cache_dir = os.path.join(HF_HUB_CACHE, f"models--{model_name.replace('/', '--')}")
            is_cached = os.path.exists(cache_dir)
        except Exception:
            is_cached = False
            
        print("\n" + "#"*70)
        print(" 🤖 [OMNIVOICE AUDIOBOOK BUILDER] - SYSTEM INITIALIZATION")
        print("#"*70)
        print(f" Target Model: '{model_name}'")
        print(f" Device Map:  {self.device} | Precision: {self.dtype}")
        print(" ")
        print(" 📦 CACHE SETTINGS:")
        print("  - Caching weights in the default HuggingFace home directory.")
        if is_cached:
            print("  - [OK] Cấu hình cache hợp lệ. Đã tìm thấy model weights cục bộ.")
            print("  - Đang nạp model vào bộ nhớ...")
        else:
            print("  - [LẦN ĐẦU CHẠY] Không tìm thấy model weights trong thư mục cache.")
            print("  - Tiến trình sẽ tải tự động ~1.2 GB dữ liệu từ HuggingFace Hub.")
            print("  - Vui lòng duy trì kết nối Internet ổn định.")
            print(" ")
            print(" ⚠️  QUAN TRỌNG: VUI LÒNG GIỮ NGUYÊN CỬA SỔ DÒNG LỆNH NÀY.")
            print("  - Quá trình tải có thể mất từ 1 đến 5 phút tùy băng thông mạng.")
            print("  - TUYỆT ĐỐI KHÔNG TẮT terminal/dòng lệnh lúc này.")
        print("#"*70 + "\n")
        
        self.model = OmniVoice.from_pretrained(
            model_name,
            device_map=self.device,
            dtype=self.dtype
        )
        print(f"OmniVoice model ({model_name}) đã sẵn sàng trên thiết bị: {self.device}")
        
        # Load Reference Audio Paths cho Voice Cloning
        self.voice_cache = {}
        base_dir = os.path.dirname(os.path.abspath(__file__))
        voice_dir = os.path.join(base_dir, "Voice_ref")
        
        # Quét thư mục Voice_ref để nạp toàn bộ các giọng
        if os.path.exists(voice_dir):
            for file in os.listdir(voice_dir):
                from state import normalize_speaker_id
                if file.endswith("_synthetic.wav"):
                    speaker_name = normalize_speaker_id(file.split("_synthetic")[0])
                    self.voice_cache[speaker_name] = os.path.join(voice_dir, file)
                    print(f"[Voice Cache] Đã nạp giọng Ảo (Synthetic) cho: {speaker_name}")
                elif file.endswith("_voice.wav"):
                    speaker_name = normalize_speaker_id(file.split("_voice")[0])
                    self.voice_cache[speaker_name] = os.path.join(voice_dir, file)
                    print(f"[Voice Cache] Đã nạp giọng Thật (Clone) cho: {speaker_name}")
            
        print(f"Đã map thành công {len(self.voice_cache)} đường dẫn giọng mẫu (Voice Cloning).")

    def generate(self, text, output_path, speaker="narration", voice_params=None, speed=1.0, ref_audio_path=None, denoise=True, postprocess_output=False, num_step=32, guidance_scale=2.0):
        """
        Sinh audio và lưu ra output_path.
        Ưu tiên dùng Voice Cloning nếu có file mẫu trong Cache.
        """
        # --- TIỀN XỬ LÝ VĂN BẢN TRƯỚC KHI ĐƯA VÀO TTS ---
        # 1. Loại bỏ các ghi chú ngoài lề (không dùng ngoặc vuông)
        text = re.sub(r'\(.*?\)', '', text)       # Xóa (thở dài)
        text = re.sub(r'\*.*?\*', '', text)       # Xóa *cười*
        
        # 2. Thay thế dấu ba chấm bằng dấu chấm, CosyVoice rất hay vấp/lắp bắp khi gặp "..."
        text = text.replace("...", ". ").replace("..", ". ")

        # 3. Xử lý phần text ngoài và trong ngoặc vuông
        def process_text_parts(match):
            tag = match.group(1) or ""
            text_outside = match.group(2) or ""
            
            # Xử lý tag: Nếu tag ko chứa khoảng trắng và ko chứa số -> đó là paralinguistic tag của OmniVoice (vd [SIGH] -> [sigh])
            # Nếu có chứa khoảng trắng/số -> CMU tag, giữ nguyên (vd [B EY1 S])
            if tag:
                if not any(char.isdigit() or char.isspace() for char in tag):
                    tag = tag.lower()
                    
            return tag + text_outside.lower()
        
        parts = re.findall(r'(\[.*?\])?([^\[]*)', text)
        text = "".join(process_text_parts(re.match(r'(\[.*?\])?([^\[]*)', p[0] + p[1])) for p in parts if p[0] or p[1])
        
        # Dọn dẹp khoảng trắng thừa
        text = text.replace("  ", " ").strip()
        # ------------------------------------------------
        
        from state import normalize_speaker_id
        speaker_lower = normalize_speaker_id(speaker)
        instruct = None
        
        # Luôn ưu tiên lấy từ ref_audio_path được truyền vào, sau đó mới tới Voice Cache
        if ref_audio_path and os.path.exists(ref_audio_path):
            pass
        # Cập nhật: Kiểm tra file vật lý tồn tại thực tế của Cache RAM
        elif speaker_lower in self.voice_cache and os.path.exists(self.voice_cache[speaker_lower]):
            ref_audio_path = self.voice_cache[speaker_lower]
        else:
            ref_audio_path = None
            if voice_params:
                gender = voice_params.get("gender", "female")
                pitch = voice_params.get("pitch", "moderate")
                if not pitch.endswith("pitch"):
                    pitch = f"{pitch} pitch"
                age = voice_params.get("age", "adult")
                instruct = f"{gender}, {pitch}, {age}"
            else:
                if "narration" in speaker_lower or "người kể" in speaker_lower:
                    instruct = "male, low pitch, middle-aged"
                else:
                    instruct = "female, moderate pitch, young adult"
            
        try:
            # Tham số an toàn giúp ngắt câu dài thành các chunk (tránh bị mất chữ, ngắt hơi quá dài)
            kwargs = {
                "audio_chunk_duration": 10.0,
                "audio_chunk_threshold": 15.0,
                "speed": float(speed),
                "denoise": bool(denoise),
                "postprocess_output": bool(postprocess_output),
                "num_step": int(num_step),
                "guidance_scale": float(guidance_scale)
            }
            
            if ref_audio_path is not None:
                audio = self.model.generate(text=text, ref_audio=ref_audio_path, **kwargs)
            elif instruct:
                audio = self.model.generate(text=text, instruct=instruct, **kwargs)
            else:
                audio = self.model.generate(text=text, **kwargs)
                
            sf.write(output_path, audio[0], 24000)
            return True
        except Exception as e:
            print(f"[AudioGenerator] generate() FAILED: {e}", flush=True)
            traceback.print_exc(file=sys.stderr)
            return False

    def create_synthetic_voice(self, text, output_path, instruct):
        try:
            print(f"Creating synthetic voice with instruct: {instruct}")
            kwargs = {
                "audio_chunk_duration": 10.0,
                "audio_chunk_threshold": 15.0
            }
            audio = self.model.generate(text=text, instruct=instruct, **kwargs)
            sf.write(output_path, audio[0], 24000)
            return True
        except Exception as e:
            print(f"[AudioGenerator] create_synthetic_voice() FAILED: {e}", flush=True)
            traceback.print_exc(file=sys.stderr)
            return False
