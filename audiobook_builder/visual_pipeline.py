import os
import json
import subprocess
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

METADATA_FILE = os.path.join(os.path.dirname(__file__), "characters_metadata.json")
FACS_PATH = os.path.join(os.path.dirname(__file__), "..", "Docsref", "FACS_Prompt_Guide.md")
CINEMATIC_LANG_PATH = os.path.join(os.path.dirname(__file__), "..", "Docsref", "AICinematicPromptlanguage.md")
ACTION_GUIDE_PATH = os.path.join(os.path.dirname(__file__), "..", "Docsref", "ActionGuidePrompt.md")
TRANSITION_PATH = os.path.join(os.path.dirname(__file__), "..", "Docsref", "CinematicTransitionLanguage.md")


def smart_minify(text: str) -> str:
    # Remove HTML attributes or comments
    text = re.sub(r'\s+id="[^"]+"', '', text)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    text = re.sub(r'^-+\s*$', '', text, flags=re.MULTILINE)
    
    lines = text.split('\n')
    output = []
    
    in_code_block = False
    in_table = False
    table_rows = []
    skip_mode = False
    
    for line in lines:
        line_strip = line.strip()
        if not line_strip:
            continue
            
        # Skip weak example sections entirely
        if "weak example" in line_strip.lower() or "weak action description" in line_strip.lower():
            skip_mode = True
            continue
        if skip_mode:
            if "strong example" in line_strip.lower() or "strong action description" in line_strip.lower() or line_strip.startswith('#'):
                skip_mode = False
            else:
                continue
                
        # Detect code blocks
        if line_strip.startswith('```'):
            in_code_block = not in_code_block
            output.append(line_strip)
            continue
            
        if in_code_block:
            output.append(line_strip)
            continue
            
        # Detect tables
        if line_strip.startswith('|') and line_strip.endswith('|'):
            if '---' in line_strip:
                continue
            parts = [p.strip() for p in line_strip.split('|')[1:-1]]
            parts = [p for p in parts if p]
            if parts:
                table_rows.append(" -> ".join(parts))
            in_table = True
            continue
        else:
            if in_table:
                if table_rows:
                    output.append("[" + " | ".join(table_rows) + "]")
                table_rows = []
                in_table = False
                
        # Filter other structural elements
        if line_strip.startswith('#'):
            # Headers
            output.append(line_strip)
        elif line_strip.startswith('*') or line_strip.startswith('-'):
            # Only keep lists with bold keys or code formatting
            if '**' in line_strip or '`' in line_strip:
                # Keep only the first sentence to save characters
                parts = line_strip.split('.')
                if len(parts) > 1 and not line_strip.startswith('`') and not ('`' in line_strip and '+' in line_strip):
                    first_sent = parts[0]
                    if first_sent.count('**') == 1:
                        first_sent += '**'
                    first_sent += '.'
                    output.append(first_sent)
                else:
                    output.append(line_strip)
        elif "instead of" in line_strip.lower() or "use facs" in line_strip.lower():
            # Crucial FACS formatting guidelines
            output.append(line_strip)
        elif re.match(r'^\d+\.', line_strip):
            # Numbered lists (like the combat rhythm)
            output.append(line_strip)
            
    # Reassemble and minor cleanup
    result = "\n".join(output)
    result = re.sub(r'\n+', '\n', result)
    result = re.sub(r' {2,}', ' ', result)
    
    return result.strip()


def get_combined_cinematic_reference() -> str:
    facs_content = ""
    if os.path.exists(FACS_PATH):
        try:
            with open(FACS_PATH, "r", encoding="utf-8") as f:
                facs_content = f.read()
        except Exception as e:
            print(f"Error reading FACS guide: {e}")

    cinematic_content = ""
    if os.path.exists(CINEMATIC_LANG_PATH):
        try:
            with open(CINEMATIC_LANG_PATH, "r", encoding="utf-8") as f:
                cinematic_content = f.read()
        except Exception as e:
            print(f"Error reading Cinematic language: {e}")

    action_content = ""
    if os.path.exists(ACTION_GUIDE_PATH):
        try:
            with open(ACTION_GUIDE_PATH, "r", encoding="utf-8") as f:
                action_content = f.read()
        except Exception as e:
            print(f"Error reading Action Guide: {e}")

    transition_content = ""
    if os.path.exists(TRANSITION_PATH):
        try:
            with open(TRANSITION_PATH, "r", encoding="utf-8") as f:
                transition_content = f.read()
        except Exception as e:
            print(f"Error reading Transition Guide: {e}")

    combined = f"{facs_content}\n\n{cinematic_content}\n\n{action_content}\n\n{transition_content}"
    return smart_minify(combined)


_ANTIGRAVITY_TIMEOUT = 120  # seconds per Antigravity CLI call


class AntigravityCLIError(Exception):
    """Raised when Antigravity CLI returns non-zero exit code or times out."""
    pass


def extract_json_by_bracket_counting(s: str):
    """
    Finds the first balanced [...] array or {...} object in the string by scanning
    and finding valid JSON using combination search, which is extremely robust.
    """
    # 1. Try combinations of [ and ]
    starts_arr = [i for i, c in enumerate(s) if c == '[']
    ends_arr = [i for i, c in enumerate(s) if c == ']']
    combinations_arr = []
    for start in starts_arr:
        for end in ends_arr:
            if start < end:
                combinations_arr.append((start, end))
    combinations_arr.sort(key=lambda x: x[1] - x[0], reverse=True)
    
    for start, end in combinations_arr:
        sub = s[start:end+1].strip()
        try:
            val = json.loads(sub)
            return val
        except Exception:
            pass
            
    # 2. Try combinations of { and }
    starts_obj = [i for i, c in enumerate(s) if c == '{']
    ends_obj = [i for i, c in enumerate(s) if c == '}']
    combinations_obj = []
    for start in starts_obj:
        for end in ends_obj:
            if start < end:
                combinations_obj.append((start, end))
    combinations_obj.sort(key=lambda x: x[1] - x[0], reverse=True)
    
    for start, end in combinations_obj:
        sub = s[start:end+1].strip()
        try:
            val = json.loads(sub)
            return val
        except Exception:
            pass
            
    return None




def decode_bytes(data: bytes) -> str:
    if not data:
        return ""
    for encoding in ('utf-8', 'utf-8-sig', 'utf-16', 'cp1252', 'latin-1'):
        try:
            text = data.decode(encoding)
            ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
            text = ansi_escape.sub('', text)
            return text
        except UnicodeDecodeError:
            continue
    return data.decode('utf-8', errors='ignore')


def parse_antigravity_json(stdout_data: str, stderr_data: str):
    """
    Parses a robust JSON array or object from either stdout or stderr,
    handling any leading or trailing telemetry, markdown wrappers, or warning logs.
    """
    # Xóa toàn bộ ANSI color codes (nếu có) do CLI in ra để tránh lỗi json.loads
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    if stdout_data:
        stdout_data = ansi_escape.sub('', stdout_data)
    if stderr_data:
        stderr_data = ansi_escape.sub('', stderr_data)

    try:
        log_file = os.path.join(os.path.dirname(__file__), "last_cli_output.log")
        with open(log_file, "w", encoding="utf-8") as f:
            f.write(f"=== STDOUT ===\n{stdout_data}\n=== STDERR ===\n{stderr_data}\n")
    except Exception as e:
        print(f"Failed to write last_cli_output.log: {e}")
    
    candidates = [stdout_data or "", stderr_data or ""]
    
    for cand in candidates:
        text = cand.strip()
        if not text:
            continue
            
        try:
            val = json.loads(text)
            if isinstance(val, dict) and 'response' in val:
                response_str = val.get('response', '').strip()
                res = parse_antigravity_json(response_str, "")
                if res is not None:
                    return res
            return val
        except Exception:
            pass
            
        val = extract_json_by_bracket_counting(text)
        if val is not None:
            if isinstance(val, dict) and 'response' in val:
                response_str = val.get('response', '').strip()
                res = parse_antigravity_json(response_str, "")
                if res is not None:
                    return res
            return val

    return None


def resolve_agy_cmd():
    import shutil
    import os
    if shutil.which("agy"):
        return "agy"
    user_profile = os.environ.get("USERPROFILE") or os.environ.get("HOME")
    if user_profile:
        fallback = os.path.join(user_profile, "AppData", "Local", "agy", "bin", "agy.exe")
        if os.path.exists(fallback):
            return fallback
    return "agy"


def resolve_gemini_js_cmd():
    import os
    import shutil
    
    # 1. Find node executable
    node_exe = shutil.which("node")
    if not node_exe:
        node_exe = "node" # fallback
        
    # 2. Find gemini.js
    user_profile = os.environ.get("USERPROFILE") or os.environ.get("HOME")
    if user_profile:
        # Standard global npm location on Windows
        js_path = os.path.join(user_profile, "AppData", "Roaming", "npm", "node_modules", "@google", "gemini-cli", "bundle", "gemini.js")
        if os.path.exists(js_path):
            return [node_exe, js_path]
            
    # Fallback to cmd.exe /c gemini
    return ['cmd.exe', '/c', 'gemini']


def _run_antigravity_cli(full_prompt: str) -> str:
    agy_exe = resolve_agy_cmd()
    
    # Create a temporary working directory
    agy_tmp = os.path.join(os.path.dirname(__file__), "agy_tmp")
    os.makedirs(agy_tmp, exist_ok=True)
    
    import uuid
    temp_in = os.path.join(agy_tmp, f"in_{uuid.uuid4().hex}.txt")
    temp_out = os.path.join(agy_tmp, f"out_{uuid.uuid4().hex}.json")
    
    # Yêu cầu AI dùng tool xuất trực tiếp ra file tĩnh
    prompt_with_file_instruction = full_prompt + f"\n\nCRITICAL INSTRUCTION: You MUST use your write_to_file tool to save the EXACT final JSON output to this absolute file path: {temp_out}. Do NOT output the JSON in your conversational response."
    
    # Ghi toàn bộ prompt vào file tạm đầu vào để giải quyết vĩnh viễn lỗi WinError 206 (CLI length limit)
    try:
        with open(temp_in, "w", encoding="utf-8") as f:
            f.write(prompt_with_file_instruction)
    except Exception as e:
        raise AntigravityCLIError(f"Không thể tạo file tạm đầu vào: {e}")
        
    # CLI nhận chỉ dẫn đọc file tạm đầu vào. agy là Agent AI nên sẽ tự động dùng tool đọc file này để xử lý!
    prompt_to_cli = f"Please read the cinematic director instructions from this absolute file path: {temp_in}. Follow the instructions inside it carefully to generate the storyboard/scene/intent details."
    
    cmd = [agy_exe, '--print', prompt_to_cli, '--dangerously-skip-permissions']
    
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=agy_tmp,
        text=True,
        encoding='utf-8'
    )
    
    try:
        stdout_data, stderr_data = process.communicate(timeout=_ANTIGRAVITY_TIMEOUT)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        raise AntigravityCLIError("Antigravity CLI timeout sau 120 giây")
    finally:
        # Luôn luôn dọn dẹp file đầu vào tạm thời
        if os.path.exists(temp_in):
            try:
                os.remove(temp_in)
            except Exception:
                pass
        
    if not os.path.exists(temp_out):
        if process.returncode != 0:
            err_msg = stderr_data.strip() if stderr_data else stdout_data.strip()
            if "not logged" in err_msg.lower():
                raise AntigravityCLIError("Bạn chưa đăng nhập vào Antigravity CLI.")
            raise AntigravityCLIError(f"Antigravity CLI lỗi: {err_msg}")
        raise AntigravityCLIError(f"AI không tạo ra file JSON. Output CLI:\n{stdout_data}\n{stderr_data}")
        
    try:
        with open(temp_out, "r", encoding="utf-8", errors="ignore") as f:
            output_data = f.read()
    finally:
        # Luôn luôn dọn dẹp file đầu ra tạm thời
        if os.path.exists(temp_out):
            try:
                os.remove(temp_out)
            except Exception:
                pass
        
    return output_data



def call_gemini_for_entities(markdown_text, existing_metadata):
    system_prompt = f"""You are a Director of Photography and Concept Art Expert.
Your task is to read the Markdown script and extract the important LOCATIONS and CHARACTERS.
Here is the list of existing characters/locations in the system:
{json.dumps(existing_metadata, ensure_ascii=False)}

IMPORTANT RULES:
1. Analyze and return the COMPLETE list of entities (both old and new) appearing in the script.
2. MANDATORY SORTING OF THE OUTPUT JSON ARRAY: The entities of type "location" MUST be at the very top (first), followed by entities of type "character" below.
3. For "image_prompt", you must write an EXTREMELY DETAILED description (clothing, facial angle, physique, color, art style, lighting) in English to ensure the highest consistency when fed into image generation AI. Use professional keywords (e.g. cinematic lighting, 8k, hyper-detailed, character design sheet).
4. MANDATORY NAME PRESERVATION RULE FOR ENTITIES:
   - For 'id': Use the tone-less lowercase name of the character/location with no spaces or diacritics (e.g., 'xa_ky' for Xa Kỵ, 'ma_luong' for Mã Lương, 'lao_gia_beo' for Lão già béo, 'luc_duc' for Lục Dực). DO NOT translate the ID to English/Pinyin (do not use 'xia_qi', 'ma_liang', 'plump_elder').
   - For 'name': Keep the original Vietnamese/Hán-Việt name EXACTLY as it appears in the text (e.g., "Xa Kỵ", "Mã Lương", "Lão già béo"). UTF-8 is fully supported.
   - For 'description' and 'image_prompt': These must be written in detailed English to ensure the highest consistency when fed into image/video generation AIs.

Return EXACTLY the following JSON array format, with no extra text and no markdown block:
[
  {{
    "id": "spaceship_bridge",
    "type": "location",
    "name": "Spaceship Bridge",
    "description": "Ruined spaceship bridge, flickering neon blue and orange lights, shattered control panels, dark sci-fi atmosphere.",
    "image_prompt": "Interior of a ruined spaceship bridge, flickering neon blue and orange lights, shattered metallic control panels, glowing static screens, dark sci-fi atmosphere, volumetric fog, highly detailed, Unreal Engine 5 render, cinematic"
  }},
  {{
    "id": "kael",
    "type": "character",
    "name": "Kael",
    "description": "Young man around 20, short messy black hair, wearing torn astronaut suit, determined gaze, dark sci-fi style.",
    "image_prompt": "Portrait of a 20-year-old young man, short messy black hair, sharp jawline, determined piercing brown eyes, wearing a heavily worn and torn futuristic white and grey astronaut suit with neon accents, dark sci-fi style, cinematic rim lighting, dramatic shadows, photorealistic, 8k resolution, highly detailed character concept art"
  }}
]
ONLY return entities that actually appear in the script below.
"""
    full_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\nUSER SCRIPT:\n{markdown_text}\n"
    
    print(f"\n[Antigravity - Entity Extractor] Bắt đầu quét kịch bản ({len(markdown_text)} ký tự) để tìm thực thể...")
    
    try:
        stdout_data = _run_antigravity_cli(full_prompt)
        print(f"[Antigravity - Entity Extractor] Phân tích hoàn tất.")
        parsed = parse_antigravity_json(stdout_data, "")
        if parsed is None:
            raise ValueError("Không thể tìm thấy JSON thực thể hợp lệ trong đầu ra CLI")
        return parsed
    except AntigravityCLIError:
        raise
    except Exception as e:
        print(f"Lỗi Parse JSON Entity từ Antigravity: {e}")
        return []


def update_entities_metadata(markdown_text, _existing_metadata: dict = None, project_id: str = "default"):
    from database import get_all_entities, save_entity, patch_entity

    metadata = get_all_entities(project_id)
    new_entities = call_gemini_for_entities(markdown_text, metadata)

    for ent in new_entities:
        eid = ent.get("id")
        if not eid:
            continue
        if eid not in metadata:
            save_entity(eid, {
                "type": ent.get("type", "character"),
                "name": ent.get("name", eid),
                "description": ent.get("description", ""),
                "image_prompt": ent.get("image_prompt", ""),
                "local_image_path": "",
                "media_id": "",
                "last_uploaded_at": 0,
            }, project_id=project_id)
            print(f"[Visual Pipeline] Phát hiện thực thể mới: {eid} ({ent.get('type')})")
        elif not metadata[eid].get("image_prompt"):
            patch_entity(eid, project_id=project_id, image_prompt=ent.get("image_prompt", ""))

    return get_all_entities(project_id)


def regenerate_line_prompt(line_text, context_text, visual_references):
    from database import get_all_entities

    metadata = get_all_entities()
            
    ref_descriptions = []
    for ref_id in visual_references:
        if ref_id in metadata:
            ref = metadata[ref_id]
            ref_descriptions.append(f"- {ref.get('name', ref_id)} ({ref.get('type', 'unknown')}): {ref.get('image_prompt', '')}")
            
    refs_str = "\n".join(ref_descriptions)
    
    system_prompt = f"""You are a Cinematographer and Concept Art Expert.
Your task is to write a short, concise Cinematic Video Prompt (under 50 words) in English to render a video for a dialogue/action line in a script.
Context and characters involved in this scene:
{refs_str}

Rules:
1. DO NOT repeat generic character names if they are already in visual_references. Describe the actions, expressions, or the environment.
2. Use standard Cinematic vocabulary: "Cinematic lighting", "8k resolution", "shot on 35mm lens", "hyper-detailed".
3. ONLY return the text string of the prompt, do not explain anything else."""

    user_prompt = f"""Previous context: {context_text}
Current line: {line_text}
Please write the English prompt for this scene:"""

    full_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\nUSER PROMPT:\n{user_prompt}\n"

    print(f"\n[Antigravity - Line Prompt] Đang sinh cinematic prompt cho đoạn hội thoại...")

    try:
        stdout_data = _run_antigravity_cli(full_prompt)
        ai_text = stdout_data.strip()
        try:
            telemetry = json.loads(ai_text)
            if isinstance(telemetry, dict) and 'response' in telemetry:
                ai_text = telemetry.get('response', '').strip()
        except Exception:
            pass

        print(f"[Antigravity - Line Prompt] Hoàn tất sinh prompt.")
        
        # Cleanup markdown and extra characters
        if ai_text.startswith('```markdown'): ai_text = ai_text.replace('```markdown\n', '', 1)
        if ai_text.startswith('```text'): ai_text = ai_text.replace('```text\n', '', 1)
        if ai_text.startswith('```'): ai_text = ai_text.replace('```\n', '', 1)
        if ai_text.endswith('```'): ai_text = ai_text[:-3].strip()
        if ai_text.startswith('"') and ai_text.endswith('"'): ai_text = ai_text[1:-1].strip()
        
        return ai_text.strip()
    except Exception as e:
        print(f"Error parsing Antigravity CLI output: {e}")
        return ""


def call_gemini_director_storyboard(script_list, metadata_dict):
    system_prompt = f"""You are a professional Video Director and Storyboard Artist.
Your task is to take an Audio Script and the available Visual Assets, and break the script down into a sequence of camera "Shots" (Storyboard Nodes).

AVAILABLE ASSETS:
{json.dumps(metadata_dict, ensure_ascii=False)}

RULES:
1. Group short continuous dialogue lines into a single shot if they happen in the same camera angle. Split very long lines into multiple shots (roughly 5-8 seconds per shot).
2. For each shot, specify an array of 'asset_ids' (from the AVAILABLE ASSETS) that appear in the shot.
3. For each shot, write a detailed English 'visual_prompt' describing the camera angle, lighting, environment, and what the characters are doing. Use keywords like cinematic, 8k, highly detailed.
4. Return ONLY a JSON array of objects representing the shots.
5. All fields in the response MUST be in English. Do not output any Vietnamese or non-ASCII characters to prevent encoding errors.

Format:
[
  {{
    "id": "shot_1",
    "script_line_ids": [0, 1],
    "asset_ids": ["spaceship_bridge", "kael"],
    "visual_prompt": "Wide angle shot, Kael standing in the ruined spaceship bridge..."
  }}
]
"""
    user_prompt = f"AUDIO SCRIPT:\n{json.dumps(script_list, ensure_ascii=False)}"
    full_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\nUSER SCRIPT:\n{user_prompt}\n"
    
    print(f"\n[Antigravity - Storyboard Artist] Đang phân tích {len(script_list)} dòng thoại để tạo Shots...")
    
    try:
        stdout_data = _run_antigravity_cli(full_prompt)
        ai_text = stdout_data.strip()
        try:
            telemetry = json.loads(ai_text)
            if isinstance(telemetry, dict) and 'response' in telemetry:
                ai_text = telemetry.get('response', '').strip()
        except Exception:
            pass

        print(f"[Antigravity - Storyboard Artist] Phân tích hoàn tất.")

        # Cleanup JSON
        if ai_text.startswith('```json'): ai_text = ai_text.replace('```json\n', '', 1)
        if ai_text.endswith('```'): ai_text = ai_text[:-3].strip()
        if ai_text.startswith('```'): ai_text = ai_text.replace('```\n', '', 1)

        return json.loads(ai_text)
    except AntigravityCLIError:
        raise
    except Exception as e:
        print(f"Lỗi Parse JSON Storyboard từ Antigravity: {e}")
        return []


def _call_antigravity_text(system_prompt: str, user_input: str, image_path: str = None) -> str:
    """Shared helper: call Antigravity CLI and return the raw response text (stripped)."""
    full_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\nUSER INPUT:\n{user_input}\n"
    if image_path and os.path.exists(image_path):
        full_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\n[Attached image: {image_path}]\n\nUSER INPUT:\n{user_input}\n"

    try:
        stdout_data = _run_antigravity_cli(full_prompt)
        ai_text = stdout_data.strip()
        try:
            telemetry = json.loads(ai_text)
            if isinstance(telemetry, dict) and 'response' in telemetry:
                ai_text = telemetry.get('response', '').strip()
        except Exception:
            pass

        # Strip common markdown wrappers
        for prefix in ('```json\n', '```text\n', '```markdown\n', '```\n'):
            if ai_text.startswith(prefix):
                ai_text = ai_text[len(prefix):]
        if ai_text.endswith('```'):
            ai_text = ai_text[:-3].strip()
        if ai_text.startswith('"') and ai_text.endswith('"'):
            ai_text = ai_text[1:-1].strip()
        return ai_text.strip()
    except Exception as e:
        print(f"Error parsing Antigravity CLI output: {e}")
        return ""


def generate_intent_prompt(
    user_intent: str,
    negative_prompt: str = "",
    scene_context: str = "",
    global_art_style: str = "Cinematic, highly detailed, Unreal Engine 5",
    director_notes: str = "",
    last_frame_path: str = None,
) -> str:
    """Expand a Vietnamese user intent into a detailed English video generation prompt."""
    combined_ref = get_combined_cinematic_reference()

    system_prompt = f"""You are a professional AI Video Director, Cinematographer, FACS, Transition, and Combat/Action Dynamics Expert.
The user provides a short intent in Vietnamese describing what should happen in a video scene.
Your task is to expand it into a highly detailed, cinematic English prompt optimizing for modern video generators (e.g. Veo, Sora).

You MUST combine the precise Facial Action Coding System (FACS) rules, the Camera/Motion Cinematic Language, the Transition keywords, and the physical force dynamics (Action Description Guide) from the references below.

<CINEMATIC_AND_FACS_REFERENCE>
{combined_ref}
</CINEMATIC_AND_FACS_REFERENCE>

RULES & DUAL-TIER STRUCTURE:
1. Output format MUST be a Dual-Tier prompt exactly as follows:
[CINEMATIC SYNTAX]
FACS: <AU codes based on FACS Guide Formulas and Intensities, e.g. AU4+AU7+AU23 or AU12>
SHOT: <ECU/CU/MCU/MS/WS/EWS/POV/OTS>
ANGLE: <LOW/HIGH/DUTCH/TOP/FPV>
CAM: <camera movements, e.g. TRK-L+ORBIT+PUSH>
LENS: <e.g. 24MM/35MM/50MM/85MM>
MOTION: <e.g. SPEED_RAMP+HITSTOP+MOTION_BLUR>
TRANSITION: <Cinematic transition keyword, e.g. WHIP_PAN_TRANSITION, SMASH_CUT, MOTION_BLUR_TRANSITION or NONE if not applicable>
FX: <e.g. ELEC_ARC+HEAT_DISTORT+SHOCKWAVE>
LIGHT: <e.g. RIM+VOLUMETRIC>
ENV: <e.g. RUINED_BATTLEFIELD+STORM_SKY>
STYLE: <e.g. DARK_FANTASY+XIANXIA+AAA_CINEMATIC>

[ACTION NARRATIVE]
<A vivid, physically realistic, and highly cinematic 1-2 paragraph description in English translating the syntax above. 
- You MUST apply the dynamics of force, weight, timing, and reaction from the Action Description Guide:
  * For active movements or combat: specify the physical combat rhythm (Anticipation e.g., shifting weight, lowering stance; Acceleration e.g., explosive lunges; Impact e.g., heavy collision; Hitstop e.g., brief frozen impact frame; Follow-through e.g., momentum continues; Recovery e.g., slides backward slightly to regain balance; and Reaction e.g., ground cracks, camera shakes violently).
  * For static or dialogue scenes: apply subtle grounded micro-movements (e.g. shifting feet, breathing, wind blowing robes/hair) to maintain realism and avoid robotic stillness.
- If a TRANSITION is specified, describe the physical visual mechanics of how the transition blends or cuts the current scene into the next scene (e.g. 'A blinding flash of magical energy erupts from the impact, transitioning the camera instantly as the frame whites out...', preserving the visual momentum).
- Include exact camera angle, lighting, precise micro-expressions using FACS codes.
- ALWAYS specify: 'A fictional anonymous character, generic facial features, strictly non-celebrity, not resembling any real prominent people.'>

2. If negative_prompt is non-empty, do NOT include those elements.
3. Keep the entire response under 100 words. No extra chatter, explanation, quotes, or conversational text. ONLY the dual-tier prompt."""

    continuation_note = ""
    if last_frame_path and os.path.exists(last_frame_path):
        continuation_note = "\n(A last-frame image has been attached — ensure the new prompt continues smoothly from it.)"

    notes_line = f"\nDirector's notes: {director_notes}" if director_notes else ""
    user_input = f"""Story context: {scene_context or 'N/A'}
User intent: {user_intent}
Avoid: {negative_prompt or 'nothing specific'}
Global art style: {global_art_style}{notes_line}{continuation_note}"""

    print(f"\n[Antigravity - Prompt Gen] Đang mở rộng ý định của user thành English Cinematic Prompt...")
    return _call_antigravity_text(system_prompt, user_input, image_path=last_frame_path)


def generate_storyboard(script_lines, metadata):
    script_text = ""
    for line in script_lines:
        script_text += f"[{line.get('id')} - {line.get('speaker')}]: {line.get('text')}\n"
        
    metadata_text = json.dumps(metadata, ensure_ascii=False)
    combined_ref = get_combined_cinematic_reference()
    
    system_prompt = f"""You are an AI Video Director, Storyboard Artist, and Cinematic Prompt Engineer.
Your task is to analyze the audio script and split it into camera Shots (Storyboard Nodes).
Each Shot should last about 5-10 seconds (covering several lines of dialogue/action).
Here is the list of available Visual Assets (Characters & Locations) in the system:
{metadata_text}

<CINEMATIC_AND_FACS_REFERENCE>
{combined_ref}
</CINEMATIC_AND_FACS_REFERENCE>

RULES:
1. You must group multiple consecutive dialogue lines into the same shot if they occur in the same context/action.
2. For each shot, analyze the script complexity and decide on the "render_mode":
   - Use `"single"` (Single Shot Mode) for slow dialogue or static scene descriptions. Set `"grid_size"` to null.
   - Use `"grid"` (Storyboard Grid Mode) only for high-action sequences or fast movements. Set `"grid_size"` to `"2x2"` (4 panels) or `"3x4"` (12 panels) depending on complexity.
3. For `"image_prompt"` (Pix 2 image gen prompt):
   - If render_mode is `"grid"`, describe a storyboard grid panel sheet, e.g., `"A 2x2 cinematic storyboard grid containing 4 panels showing: 1: ..., 2: ..."`.
   - If render_mode is `"single"`, describe a single high-quality cinematic concept art frame containing the character and location.
4. For `"video_prompt"` (Veo video animation prompt) and `"visual_prompt"`:
   - You MUST generate a highly structured Dual-Tier Prompt combining cinematic syntax with a detailed motion narrative based on the combined reference guide.
   - In the [ACTION NARRATIVE], you MUST strictly apply the dynamics of force, weight, timing, and realistic movement from the Action Description Guide:
     * For high-action scenes (especially Storyboard Grids), detail the physical combat rhythm: Anticipation (lowering stance, shifting weight, tightening grip), Acceleration (explosive dash forward), Impact (heavy collision), Hitstop (brief frozen impact frame), Follow-through (natural momentum inertia), Recovery (sliding back, staggering slightly), and Reactions (ground cracks, dust erupting, camera shakes violently).
     * For static or slow dialogue scenes, apply subtle grounded micro-movements (shifting feet, heavy breathing, wind blowing robes/hair) to maintain physical realism and avoid robotic stillness.
   - If a TRANSITION is specified, describe the physical visual mechanics of how the transition blends or cuts the current scene into the next scene (preserving momentum and visual continuity).
   - Dual-Tier format example to embed inside "video_prompt":
     "[CINEMATIC SYNTAX]\\nFACS: AU4+AU7+AU25\\nSHOT: ECU\\nANGLE: LOW\\nCAM: PUSH\\nLENS: 24MM\\nMOTION: SPEED_RAMP+HITSTOP\\nTRANSITION: WHIP_PAN_TRANSITION\\nFX: ELEC_ARC+SHOCKWAVE\\nLIGHT: RIM+VOLUMETRIC\\nENV: RUINED_BATTLEFIELD\\nSTYLE: DARK_FANTASY+XIANXIA+AAA_CINEMATIC\\n\\n[ACTION NARRATIVE]\\nLow angle Extreme Close Up shot... A fictional anonymous character, generic facial features, strictly non-celebrity, not resembling any real prominent people. Incorporating a whip pan transition seamlessly into the next scene."
5. For characters, DO NOT use real names in prompts; use "a young man", "a woman", etc. Always append: "A fictional anonymous character, generic facial features, strictly non-celebrity, not resembling any real prominent people."

Return EXACTLY the following JSON array format, with no extra text:
[
  {{
    "shot_id": 1,
    "script_line_ids": [0, 1],
    "asset_ids": ["spaceship_bridge", "kael"],
    "render_mode": "single",
    "grid_size": null,
    "image_prompt": "Cinematic shot of a young man standing inside the ruined spaceship bridge. Cinematic lighting, photorealistic, 8k.",
    "video_prompt": "[CINEMATIC SYNTAX]\\nFACS: AU1+AU4\\nSHOT: CU\\nANGLE: HIGH\\nCAM: PULL\\nLENS: 35MM\\nMOTION: DRIFT\\nTRANSITION: NONE\\nFX: MIST_FLOW\\nLIGHT: VOLUMETRIC\\nENV: CYBER_CITY\\nSTYLE: AAA_CINEMATIC\\n\\n[ACTION NARRATIVE]\\nHigh angle Close Up shot... A fictional anonymous character, generic facial features, strictly non-celebrity, not resembling any real prominent people.",
    "visual_prompt": "[CINEMATIC SYNTAX]\\nFACS: AU1+AU4\\nSHOT: CU\\nANGLE: HIGH\\nCAM: PULL\\nLENS: 35MM\\nMOTION: DRIFT\\nTRANSITION: NONE\\nFX: MIST_FLOW\\nLIGHT: VOLUMETRIC\\nENV: CYBER_CITY\\nSTYLE: AAA_CINEMATIC\\n\\n[ACTION NARRATIVE]\\nHigh angle Close Up shot... A fictional anonymous character, generic facial features, strictly non-celebrity, not resembling any real prominent people."
  }}
]
- "asset_ids": Array containing the "id"s of the Visual Assets participating in this Shot. ONLY use ids present in the available list.
- All fields MUST be in English. Do not output any Vietnamese or non-ASCII characters to prevent encoding errors.
"""
    full_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\nUSER SCRIPT:\n{script_text}\n"
    
    print(f"\n[Antigravity - Storyboard Artist] Đang phân tích {len(script_lines)} dòng thoại để tạo Shots...")
    
    try:
        stdout_data = _run_antigravity_cli(full_prompt)
        print(f"[Antigravity - Storyboard Artist] Phân tích hoàn tất.")
        parsed = parse_antigravity_json(stdout_data, "")
        if parsed is None:
            raise ValueError("Không thể tìm thấy JSON storyboard hợp lệ trong đầu ra CLI")
        
        # Ensure fallback fields exist
        for s in parsed:
            if "render_mode" not in s:
                s["render_mode"] = "single"
            if "grid_size" not in s:
                s["grid_size"] = None
            if "image_prompt" not in s:
                s["image_prompt"] = s.get("visual_prompt", "")
            if "video_prompt" not in s:
                s["video_prompt"] = s.get("visual_prompt", "")
            if "visual_prompt" not in s:
                s["visual_prompt"] = s.get("video_prompt", "")
        
        return parsed
    except Exception as e:
        print(f"Lỗi storyboard: {e}")
        return []


def generate_block_prompts(block_lines, previous_context, metadata, global_style, total_duration):
    script_text = ""
    for line in block_lines:
        script_text += f"[{line.get('id')} - {line.get('speaker')}]: {line.get('text')}\n"
        
    metadata_text = json.dumps(metadata, ensure_ascii=False)
    
    target_shots = max(1, round(total_duration / 7.0))
    combined_ref = get_combined_cinematic_reference()

    system_prompt = f"""You are an AI Cinematic Director, FACS/Cinematic Prompt Engineer.
Your task is to write Image/Video Prompts for a movie script block lasting about {total_duration:.1f} seconds.
We need you to generate exactly {target_shots} consecutive shots.
Available Visual Assets (Characters/Bối cảnh) in the system:
{metadata_text}

PAST HISTORY (Context Window):
{previous_context or 'This is the opening scene of the movie.'}

<CINEMATIC_AND_FACS_REFERENCE>
{combined_ref}
</CINEMATIC_AND_FACS_REFERENCE>

MANDATORY RULES:
1. You must generate exactly {target_shots} shots. The shots must logically connect and continue from the PAST HISTORY.
2. For each shot, analyze the script block's complexity and decide on the "render_mode":
   - Use `"single"` (Single Shot Mode) for slow dialogue or static scene descriptions (e.g., character standing, simple speaking). Set `"grid_size"` to null.
   - Use `"grid"` (Storyboard Grid Mode) only for high-action sequences, fast movements, or multi-step processes (e.g., character flying, magic attacks, multi-panel continuous actions). Set `"grid_size"` to `"2x2"` (4 panels) or `"3x4"` (12 panels) depending on complexity.
3. For `"image_prompt"` (Pix 2 image gen prompt):
   - If render_mode is `"grid"`, describe a storyboard grid panel sheet, e.g., `"A 2x2 cinematic storyboard grid containing 4 panels showing: 1: [Panel 1 description], 2: [Panel 2 description]..."`. Always include bối cảnh and character details.
   - If render_mode is `"single"`, describe a single high-quality cinematic concept art frame containing the character and location.
4. For `"video_prompt"` (Veo video animation prompt) and `"visual_prompt"`:
   - You MUST generate a highly structured Dual-Tier Prompt combining cinematic syntax with a detailed motion narrative based on the combined reference guide.
   - In the [ACTION NARRATIVE], you MUST strictly apply the dynamics of force, weight, timing, and realistic movement from the Action Description Guide:
     * For high-action scenes (especially Storyboard Grids), detail the physical combat rhythm: Anticipation (lowering stance, shifting weight, tightening grip), Acceleration (explosive dash forward), Impact (heavy collision), Hitstop (brief frozen impact frame), Follow-through (natural momentum inertia), Recovery (sliding back, staggering slightly), and Reactions (ground cracks, dust erupting, camera shakes violently).
     * For static or slow dialogue scenes, apply subtle grounded micro-movements (shifting feet, heavy breathing, wind blowing robes/hair) to maintain physical realism and avoid robotic stillness.
   - If a TRANSITION is specified, describe the physical visual mechanics of how the transition blends or cuts the current scene into the next scene (preserving momentum and visual continuity).
   - Dual-Tier format example to embed inside "video_prompt":
     "[CINEMATIC SYNTAX]\\nFACS: AU4+AU7+AU25\\nSHOT: ECU\\nANGLE: LOW\\nCAM: PUSH\\nLENS: 24MM\\nMOTION: SPEED_RAMP+HITSTOP\\nTRANSITION: WHIP_PAN_TRANSITION\\nFX: ELEC_ARC+SHOCKWAVE\\nLIGHT: RIM+VOLUMETRIC\\nENV: RUINED_BATTLEFIELD\\nSTYLE: DARK_FANTASY+XIANXIA+AAA_CINEMATIC\\n\\n[ACTION NARRATIVE]\\nLow angle Extreme Close Up shot... A fictional anonymous character, generic facial features, strictly non-celebrity, not resembling any real prominent people. Incorporating a whip pan transition seamlessly into the next scene."
5. For characters, DO NOT use real names in prompts; use "a young man", "a woman", etc. Always append: "A fictional anonymous character, generic facial features, strictly non-celebrity, not resembling any real prominent people."

Return EXACTLY the following JSON array format, with no extra text:
[
  {{
    "sub_id": 1,
    "asset_ids": ["spaceship_bridge", "kael"],
    "is_cut": true,
    "user_intent": "Kael frowns, looking determinedly at the ruins, exhaling a soft sigh.",
    "render_mode": "single",
    "grid_size": null,
    "image_prompt": "Cinematic shot of a young man standing inside the ruined spaceship bridge. Cinematic lighting, photorealistic, 8k.",
    "video_prompt": "[CINEMATIC SYNTAX]\\nFACS: AU1+AU4\\nSHOT: CU\\nANGLE: HIGH\\nCAM: PULL\\nLENS: 35MM\\nMOTION: DRIFT\\nTRANSITION: NONE\\nFX: MIST_FLOW\\nLIGHT: VOLUMETRIC\\nENV: CYBER_CITY\\nSTYLE: AAA_CINEMATIC\\n\\n[ACTION NARRATIVE]\\nHigh angle Close Up shot... A fictional anonymous character, generic facial features, strictly non-celebrity, not resembling any real prominent people.",
    "visual_prompt": "[CINEMATIC SYNTAX]\\nFACS: AU1+AU4\\nSHOT: CU\\nANGLE: HIGH\\nCAM: PULL\\nLENS: 35MM\\nMOTION: DRIFT\\nTRANSITION: NONE\\nFX: MIST_FLOW\\nLIGHT: VOLUMETRIC\\nENV: CYBER_CITY\\nSTYLE: AAA_CINEMATIC\\n\\n[ACTION NARRATIVE]\\nHigh angle Close Up shot... A fictional anonymous character, generic facial features, strictly non-celebrity, not resembling any real prominent people."
  }}
]
- "asset_ids": IDs of the appearing Visual Assets. ONLY use IDs from the available list.
- "is_cut": Set to `true` if this shot is a camera cut/change. Set to `false` if it is a smooth continuous flow from the previous shot.
- "user_intent": A SHORT description in English explaining the character's actions and emotions.
- "visual_prompt": Duplicate the content of "video_prompt" here for backward compatibility.
- ALL fields in the JSON response MUST be purely in English. DO NOT output any non-ASCII characters to prevent encoding errors.
{f'Global Art Style: {global_style}' if global_style else ''}
"""
    
    user_prompt = f"CURRENT SCRIPT BLOCK:\n{script_text}"
    full_prompt = f"SYSTEM INSTRUCTION:\n{system_prompt}\n\nUSER PROMPT:\n{user_prompt}\n"
    
    print(f"\n[Antigravity - Block Slicer] Đang xử lý Block dài {total_duration:.1f}s -> Yêu cầu {target_shots} Sub-scenes...")
    
    try:
        stdout_data = _run_antigravity_cli(full_prompt)
        print(f"[Antigravity - Block Slicer] Hoàn tất.")
        parsed = parse_antigravity_json(stdout_data, "")
        if parsed is None:
            raise ValueError("Không thể tìm thấy JSON block slicer hợp lệ trong đầu ra CLI")
        shots = parsed
        
        # --- Dynamic Duration Allocation ---
        count = len(shots)
        if count > 0:
            target_dur = max(4 * count, int(total_duration + 0.5))
            durations = [6] * count
            
            diff = target_dur - sum(durations)
            while diff > 0:
                upgraded = False
                for i in range(count):
                    if durations[i] < 8:
                        durations[i] += 2
                        diff -= 2
                        upgraded = True
                        break
                if not upgraded: break
            
            while sum(durations) - target_dur >= 2:
                downgraded = False
                for i in range(count):
                    if durations[i] > 4:
                        durations[i] -= 2
                        downgraded = True
                        break
                if not downgraded: break
            
            for i, s in enumerate(shots):
                s["video_duration"] = durations[i]
                # Ensure fields exist even if LLM failed to follow schema perfectly
                if "render_mode" not in s:
                    s["render_mode"] = "single"
                if "grid_size" not in s:
                    s["grid_size"] = None
                if "image_prompt" not in s:
                    s["image_prompt"] = s.get("visual_prompt", "")
                if "video_prompt" not in s:
                    s["video_prompt"] = s.get("visual_prompt", "")
                if "visual_prompt" not in s:
                    s["visual_prompt"] = s.get("video_prompt", "")
                
        return shots
    except Exception as e:
        print(f"Lỗi Parse Block JSON: {e}")
        return []
