import json
import time
from text_processor import chunk_text
from visual_pipeline import _run_antigravity_cli, parse_antigravity_json, AntigravityCLIError

def build_story_bible(text: str) -> str:
    """Extracts global context: character list, setting, main plot."""
    # Giới hạn text xuống 6500 ký tự để cộng với prompt system không vượt quá 8191 chars của lệnh Windows
    sample_text = text[:6500]
    
    system_prompt = """You are an AI assistant specialized in analyzing screenplays and stories.
Your task is to create a concise "Story Bible" based on the provided text.
Please extract:
1. SETTING: Space, time, world.
2. CHARACTERS: List of appearing characters, physical traits, and personalities.
   MANDATORY NAME PRESERVATION RULE: For all Vietnamese, Sino-Vietnamese (Hán-Việt) names, or character descriptions, you MUST keep their original names from the text in the CHARACTERS list. DO NOT translate them to English or Pinyin. For example, use "Xa Kỵ" (or "Xa Ky") instead of "Xia Qi", "Mã Lương" (or "Ma Luong") instead of "Ma Liang", "Lục Dực" instead of "Lu Yi", "Lão già béo" instead of "Plump Elder".
3. PLOT SUMMARY: Main plot of this segment.

Please output the content in English (except for the original Vietnamese character names which must be preserved as instructed above), completely in plain text, without markdown, and keep it under 500 words. UTF-8 Vietnamese encoding is fully supported."""
    
    full_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\nUSER INPUT:\n{sample_text}\n"
    
    print("\n[Antigravity - Story Bible] Đang trích xuất Story Bible...")
    try:
        stdout_data = _run_antigravity_cli(full_prompt)
        ai_text = stdout_data.strip()
        try:
            telemetry = json.loads(ai_text)
            if isinstance(telemetry, dict) and 'response' in telemetry:
                ai_text = telemetry.get('response', '').strip()
        except Exception:
            pass

        print("[Antigravity - Story Bible] Đã tạo xong Story Bible.")
        return ai_text.strip()
    except AntigravityCLIError as e:
        print(f"Antigravity CLI Error (Story Bible): {e}")
        return ""
    except Exception as e:
        print(f"Unexpected error in build_story_bible: {e}")
        return ""

def process_script_chunk(text_chunk: str, story_bible: str = "", previous_summary: str = "") -> list:
    """Calls Antigravity CLI to process a single chunk into script lines."""
    system_prompt = """You are a professional Audiobook Director. Your task is to prepare the script for the AI Text-To-Speech (TTS) system.
Please read the provided Vietnamese text chunk and perform the following:
1. Add commas (,) or ellipses (...) appropriately in the 'text' field to make the AI pause at the correct emotional rhythm of the story. Keep English terms or names (e.g. Kael, Elara, Architect) EXACTLY as they are; DO NOT phonetically translate them to Vietnamese.
2. If a character has strong emotions (panicked, angry, shouting): use multiple exclamation marks (!!!) or question marks (?!). CRITICAL: DO NOT WRITE IN ALL CAPS because the Voice AI cannot read Vietnamese ALL CAPS properly. Write in normal lowercase with standard capitalization.
3. Separate narration ('narration') from character dialogue. MANDATORY RULE FOR SPEAKER ID: Use the original character names from the text for the 'speaker' field, converted to lowercase with no spaces or diacritics (tone-less lowercase, e.g., 'xa_ky' for Xa Kỵ, 'ma_luong' for Mã Lương, 'lao_gia_beo' for Lão già béo, 'luc_duc' for Lục Dực). DO NOT use English translations or Chinese Pinyin (e.g., DO NOT use 'xia_qi', 'ma_liang', 'plump_elder').
4. Add an 'image_prompt' field in English describing the visual scene of the sentence in detail (camera angle, character, lighting, art style like cinematic, dark sci-fi).
5. Non-verbal audio effects: you can insert these tags at the beginning or middle of the dialogue to increase realism.
ALLOWED TAGS: [laughter], [sigh], [confirmation-en], [question-en], [question-ah], [question-oh], [question-ei], [question-yi], [surprise-ah], [surprise-oh], [surprise-wa], [surprise-yo], [dissatisfaction-hnn].
6. CRITICAL: PRESERVE 100% OF THE ORIGINAL WORDS from the input text in the 'text' field (only add tags and punctuation). DO NOT truncate, edit, or summarize the text.
7. SEGMENT SPLITTING RULE: Do NOT put a long continuous narrative text block into a single line object in the 'lines' array. Split long narrative blocks into multiple lines. Each line object should ideally contain only 1 to 2 sentences (roughly 100-250 characters). This is critical for us to generate high-fidelity, matching 'image_prompt's for every visual scene. When joining the 'text' fields of all lines, they must reconstruct the original input text 100% word-for-word, without any deletions, edits, or additions.

YOU MUST RETURN A SINGLE JSON OBJECT, with no extra explanatory text, and no markdown formatting (```json). Structure:
{
  "summary": "A short summary of the events in this chunk in English.",
  "lines": [
    {
      "speaker": "narration",
      "text": "Vietnamese text with added pauses and non-verbal tags...",
      "image_prompt": "A detailed English visual prompt..."
    }
  ]
}"""

    context_block = ""
    if story_bible:
        context_block += f"\nSTORY BIBLE (For character consistency):\n{story_bible}\n"
    if previous_summary:
        context_block += f"\nPREVIOUS CHUNK SUMMARY (Context from previous chunk):\n{previous_summary}\n"

    full_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n{context_block}\nUSER INPUT:\n{text_chunk}\n"
    
    print(f"\n[Antigravity - Audio Director] Bắt đầu xử lý script chunk ({len(text_chunk)} ký tự)...")
    
    try:
        stdout_data = _run_antigravity_cli(full_prompt)
        print(f"[Antigravity - Audio Director] Đã nhận kết quả thành công.")
        
        parsed = parse_antigravity_json(stdout_data, "")
        if parsed is None:
            raise ValueError("Không thể tìm thấy JSON kịch bản hợp lệ trong đầu ra CLI")
        return parsed
    except Exception as e:
        print(f"Lỗi Parse JSON từ Antigravity: {e}")
        raise e

def safe_process_script_chunk(chunk: str, story_bible: str = "", previous_summary: str = "", retries: int = 3) -> list:
    for i in range(retries):
        try:
            return process_script_chunk(chunk, story_bible, previous_summary)
        except Exception as e:
            print(f"Lỗi xử lý Antigravity (lần thử {i+1}/{retries}): {e}")
            time.sleep(2)
            
    print(f"[Antigravity - Audio Director] THẤT BẠI sau {retries} lần thử. Sử dụng text gốc (Fallback).")
    return {"summary": "Error parsing, using fallback.", "lines": [{"speaker": "narration", "text": chunk, "image_prompt": "A default scene."}]}


def validate_script_lines(lines: list) -> tuple[list, list]:
    """Validates the generated script lines, fixing minor issues. Returns (validated_lines, warnings)."""
    warnings = []
    validated = []
    for idx, line in enumerate(lines):
        speaker = line.get("speaker", "narration")
        text = line.get("text", "")
        img_prompt = line.get("image_prompt", "")
        
        if not text:
            continue
            
        if not img_prompt:
            warnings.append(f"Line {idx+1}: Missing image_prompt for '{speaker}'.")
            img_prompt = f"A character named {speaker} talking, cinematic lighting, 8k resolution."
            
        validated.append({
            "speaker": speaker,
            "text": text,
            "image_prompt": img_prompt
        })
    return validated, warnings

def generate_script_from_manuscript(text: str, project_id: str = "default") -> dict:
    """Main pipeline for Phase 1: Context Chunking and Story Bible extraction."""
    # Giảm MAX_CHUNK_LENGTH xuống 3000 để đảm bảo an toàn với giới hạn CLI (8191 bytes trên Windows)
    MAX_CHUNK_LENGTH = 3000
    
    paragraphs = chunk_text(text)
    chunks = []
    current_chunk = ""
    for p in paragraphs:
        if len(current_chunk) + len(p) < MAX_CHUNK_LENGTH:
            current_chunk += p + "\n\n"
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = p + "\n\n"
    if current_chunk:
        chunks.append(current_chunk.strip())
        
    warnings = []
    all_lines = []
    
    if len(chunks) <= 1:
        # Nếu text ngắn, xử lý trong 1 lần
        res = safe_process_script_chunk(chunks[0] if chunks else text)
        lines = res.get("lines", res) if isinstance(res, dict) else res
        validated_lines, w = validate_script_lines(lines)
        all_lines.extend(validated_lines)
        warnings.extend(w)
    else:
        # Nếu text dài, xử lý đa đoạn với Story Bible
        story_bible = build_story_bible(text)
        previous_summary = ""
        
        for idx, chunk in enumerate(chunks):
            print(f"\n--- XỬ LÝ CHUNK {idx+1}/{len(chunks)} ---")
            res = safe_process_script_chunk(chunk, story_bible, previous_summary)
            
            if isinstance(res, dict):
                lines = res.get("lines", [])
                previous_summary = res.get("summary", previous_summary)
            else:
                lines = res
                
            validated_lines, w = validate_script_lines(lines)
            all_lines.extend(validated_lines)
            warnings.extend([f"[Chunk {idx+1}] " + warning for warning in w])
            
    return {
        "script": all_lines,
        "warnings": warnings,
        "stats": {
            "chunks_processed": len(chunks),
            "total_lines": len(all_lines)
        }
    }
