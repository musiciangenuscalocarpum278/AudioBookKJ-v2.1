import subprocess
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from text_processor import clean_markdown
from script_generation import generate_script_from_manuscript
from visual_pipeline import update_entities_metadata, regenerate_line_prompt, AntigravityCLIError

router = APIRouter()


class ScriptRequest(BaseModel):
    text: str


class RegenPromptRequest(BaseModel):
    line_text: str
    context_text: str
    visual_references: list[str]


class ExtractEntitiesRequest(BaseModel):
    text: str
    existing_metadata: dict = {}
    project_id: str = "default"


class EnhancePromptRequest(BaseModel):
    prompt: str
    asset_type: str
    asset_name: str
    global_style: str = ""
    director_notes: str = ""


class EnhanceMotionRequest(BaseModel):
    dialogue: str
    motion_prompt: str


class GenerateScenePromptRequest(BaseModel):
    block_lines: list[dict]
    previous_context: str
    assets_metadata: dict
    global_style: str = ""
    total_duration: float = 0.0


_ANTIGRAVITY_TIMEOUT = 120


def resolve_agy_cmd():
    from visual_pipeline import resolve_agy_cmd as _resolve
    return _resolve()


def _call_antigravity(full_prompt: str, task_name: str = "Antigravity Task") -> str:
    print(f"\n[{task_name}] Bắt đầu gửi request tới Antigravity...")
    import json
    from visual_pipeline import _run_antigravity_cli, AntigravityCLIError
    
    try:
        stdout_data = _run_antigravity_cli(full_prompt)
        print(f"[{task_name}] Hoàn tất request.")
        
        ai_text = stdout_data.strip()
        try:
            telemetry = json.loads(ai_text)
            if isinstance(telemetry, dict) and 'response' in telemetry:
                ai_text = telemetry.get('response', '').strip()
        except Exception:
            pass
        return ai_text.strip()
    except AntigravityCLIError as e:
        raise HTTPException(500, detail={"error": "antigravity_failed", "message": str(e)})
    except Exception as e:
        raise HTTPException(500, f"Error calling Antigravity: {str(e)}")



@router.post("/api/generate-script")
async def api_generate_script(req: ScriptRequest):
    print(f"[Script API] /api/generate-script received {len(req.text or '')} chars", flush=True)
    cleaned = clean_markdown(req.text)
    print(f"[Script API] cleaned manuscript length: {len(cleaned)} chars", flush=True)
    result = generate_script_from_manuscript(cleaned)
    print(
        f"[Script API] generated {len(result.get('script', [])) if isinstance(result, dict) else 'unknown'} script lines",
        flush=True,
    )
    return result


@router.post("/api/regen-visual-prompt")
async def api_regen_visual_prompt(req: RegenPromptRequest):
    try:
        prompt = regenerate_line_prompt(req.line_text, req.context_text, req.visual_references)
        return {"prompt": prompt}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/api/extract-entities")
async def api_extract_entities(req: ExtractEntitiesRequest):
    if not req.text:
        raise HTTPException(400, "Empty script")
    try:
        metadata = update_entities_metadata(req.text, req.existing_metadata, req.project_id)
    except AntigravityCLIError as e:
        raise HTTPException(500, detail={"error": "antigravity_failed", "message": str(e)})
    return {"status": "success", "metadata": metadata}


@router.post("/api/enhance-prompt")
def api_enhance_prompt(req: EnhancePromptRequest):
    sys_prompt = (
        f"You are a professional Concept Art Prompt Engineer. Enhance the following short description "
        f"for a '{req.asset_type}' named '{req.asset_name}' into a highly detailed, professional image "
        f"generation prompt in English. Include details about lighting, camera angle, textures, and atmosphere."
    )
    
    if req.asset_type == "character":
        sys_prompt += " Since this is a character reference image, specify a studio portrait shot with a solid black background."
        
    if req.global_style:
        sys_prompt += f" MANDATORY ART STYLE: {req.global_style}"
    if req.director_notes:
        sys_prompt += f" Director's notes (must be reflected): {req.director_notes}"
    sys_prompt += "\nReturn ONLY the prompt string, no markdown, no quotes."
    return {"prompt": _call_antigravity(f"{sys_prompt}\n\nOriginal Description: {req.prompt}", task_name="Asset Enhancer")}


@router.post("/api/enhance-motion")
def api_enhance_motion(req: EnhanceMotionRequest):
    facs_guide_path = "../Docsref/FACS_Prompt_Guide.md"
    facs_content = ""
    if os.path.exists(facs_guide_path):
        with open(facs_guide_path, "r", encoding="utf-8") as f:
            facs_content = f.read()

    sys_prompt = f"""You are an expert Video AI Prompt Engineer specializing in Veo 3.1 and FACS (Facial Action Coding System).
Your task is to enhance the user's raw motion/emotion description into a cinematic motion prompt, incorporating precise FACS Action Units (AUs) if facial expressions are mentioned.

<FACS_REFERENCE>
{facs_content}
</FACS_REFERENCE>

Based on the dialogue and raw motion request below, output ONLY the enhanced motion prompt in English.
Make it cinematic (e.g. 'Camera pushes in slowly. Character performs AU 1+4 (sadness) while sighing.')
DO NOT output any markdown, explanations, or quotes.
"""
    full_prompt = f"{sys_prompt}\n\nDialogue: {req.dialogue}\nRaw Motion Request: {req.motion_prompt}"
    return {"prompt": _call_antigravity(full_prompt, task_name="Motion Enhancer")}


@router.post("/api/generate-scene-prompt")
async def api_generate_scene_prompt(req: GenerateScenePromptRequest):
    try:
        from visual_pipeline import generate_block_prompts
        shots = generate_block_prompts(
            req.block_lines, 
            req.previous_context, 
            req.assets_metadata, 
            req.global_style, 
            req.total_duration
        )
        return {"shots": shots}
    except Exception as e:
        raise HTTPException(500, str(e))
