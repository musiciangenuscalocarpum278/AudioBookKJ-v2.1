import os
from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from database import (
    get_all_entities, get_project_profile, save_project_profile,
    get_project_state,
    get_video_graph, save_video_graph,
    get_timeline_clips, save_timeline_clips,
    get_script_lines, save_script_lines,
    get_all_projects, create_project, delete_project,
)

router = APIRouter()


class CreateProjectRequest(BaseModel):
    name: str = "New Project"
    project_root: str | None = None


@router.get("/api/projects")
async def api_list_projects():
    return get_all_projects()


@router.post("/api/projects")
async def api_create_project(req: CreateProjectRequest):
    project = create_project(req.name, req.project_root)
    return {"status": "success", "project": project}


@router.delete("/api/projects/{project_id}")
async def api_delete_project(project_id: str):
    if project_id == "default":
        raise HTTPException(400, "Không thể xóa project mặc định")
    try:
        delete_project(project_id)
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"status": "success", "deleted": project_id}


@router.get("/api/characters-metadata")
async def get_characters_metadata(project_id: str = Query('default')):
    return get_all_entities(project_id)


@router.get("/api/project-profile")
async def api_get_project_profile(project_id: str = Query('default')):
    return get_project_profile(project_id)


@router.post("/api/project-profile")
async def api_update_project_profile(req: Request):
    data = await req.json()
    project_id = data.get("project_id", "default")
    save_project_profile(data, project_id)
    return {"status": "success"}


@router.get("/api/project-state")
async def api_get_project_state(project_id: str = Query('default')):
    return get_project_state(project_id)


@router.get("/api/video-graph")
async def api_get_video_graph(project_id: str = Query('default')):
    return get_video_graph(project_id)


@router.post("/api/video-graph")
async def api_save_video_graph(req: Request):
    data = await req.json()
    save_video_graph(data.get("nodes", []), data.get("edges", []), data.get("project_id", "default"))
    return {"status": "success"}


@router.get("/api/script-lines")
async def api_get_script_lines(project_id: str = Query('default')):
    return get_script_lines(project_id)


@router.post("/api/script-lines")
async def api_save_script_lines(req: Request):
    data = await req.json()
    save_script_lines(data.get("lines", []), data.get("project_id", "default"))
    return {"status": "success"}


@router.get("/api/timeline-clips")
async def api_get_timeline_clips(project_id: str = Query('default')):
    return get_timeline_clips(project_id)


@router.post("/api/timeline-clips")
async def api_save_timeline_clips(req: Request):
    data = await req.json()
    save_timeline_clips(data.get("audio", []), data.get("video", []), data.get("project_id", "default"))
    return {"status": "success"}


@router.post("/api/cleanup")
async def api_cleanup_cache():
    """Delete all files in temp_audio/ and return stats."""
    from app_config import get_temp_dir
    temp_dir = get_temp_dir()
    deleted_count = 0
    freed_bytes = 0
    if os.path.isdir(temp_dir):
        for fname in os.listdir(temp_dir):
            fpath = os.path.join(temp_dir, fname)
            if os.path.isfile(fpath):
                try:
                    freed_bytes += os.path.getsize(fpath)
                    os.remove(fpath)
                    deleted_count += 1
                except OSError:
                    pass
    return {
        "status": "success",
        "deleted_files": deleted_count,
        "freed_mb": round(freed_bytes / (1024 * 1024), 1),
    }


@router.get("/api/project-media/{project_id}/{path:path}")
async def api_serve_project_media(project_id: str, path: str, request: Request):
    from database import get_conn
    from storage import resolve_project_path
    
    conn = get_conn()
    row = conn.execute("SELECT project_root FROM projects WHERE id=?", (project_id,)).fetchone()
    conn.close()
    
    project_root = row["project_root"] if row else ""
    
    # Check allowed origins for manual CORS headers injection
    origin = request.headers.get("origin")
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
        "chrome-extension://afbgooleplghmdlphioflcbnpccggodb",
    ]
    if origin in allowed_origins or (
        origin and (
            origin.startswith("http://localhost:")
            or origin.startswith("http://127.0.0.1:")
            or origin.endswith(".tauri.localhost")
        )
    ):
        cors_headers = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    else:
        cors_headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }

    try:
        abs_path = resolve_project_path(project_root, path)
        if os.path.isfile(abs_path):
            return FileResponse(abs_path, headers=cors_headers)
        raise HTTPException(status_code=404, detail="File not found", headers=cors_headers)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path", headers=cors_headers)
