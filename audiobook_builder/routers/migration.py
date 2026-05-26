import os
import shutil
from fastapi import APIRouter
from pydantic import BaseModel
from database import get_conn
from storage import get_project_root, project_media_path, to_project_relative

router = APIRouter()

MIGRATION_CONFIG = {
    "entities": [("local_image_path", "images/assets")],
    "entity_variations": [("local_image_path", "images/references")],
    "script_lines": [("video_url", "video/generated-scenes")],
    "inline_video_nodes": [("video_url", "video/generated-scenes"), ("last_frame_url", "video/last-frames")],
    "timeline_audio_clips": [("audio_file", "audio/rendered-lines")],
    "timeline_video_clips": [("video_file", "video/generated-scenes"), ("video_url", "video/generated-scenes")],
    "video_jobs": [("url", "video/generated-scenes"), ("local_file", "video/generated-scenes")]
}

def _is_legacy_path(path: str, project_root: str) -> bool:
    if not path:
        return False
    # If path is an HTTP URL, ignore
    if path.startswith("http://") or path.startswith("https://"):
        return False
    if project_root and os.path.abspath(project_root) in os.path.abspath(path):
        return False
    # Check if it looks like an old relative path
    old_dirs = ["temp_audio", "temp_thumbnails", "Voice_ref", "images", "output"]
    if any(d in path for d in old_dirs):
        return True
    if os.path.isabs(path):
        return True
    return False

@router.get("/api/media-inventory")
async def api_media_inventory():
    conn = get_conn()
    inventory = []
    
    for table, columns in MIGRATION_CONFIG.items():
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
        for row in rows:
            project_id = row["project_id"]
            row_id = row["id"]
            project_root = get_project_root(project_id)
            if not project_root:
                continue
                
            for col, cat in columns:
                path = row[col]
                if path and _is_legacy_path(path, project_root):
                    # Some paths might be relative to audiobook_builder
                    abs_test_path = path
                    if not os.path.isabs(path):
                        abs_test_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", path))
                        
                    exists = os.path.exists(abs_test_path)
                    inventory.append({
                        "project_id": project_id,
                        "table": table,
                        "id": row_id,
                        "column": col,
                        "category": cat,
                        "path": path,
                        "abs_path": abs_test_path if exists else path,
                        "size": os.path.getsize(abs_test_path) if exists else 0,
                        "missing": not exists
                    })
    conn.close()
    return {"inventory": inventory, "legacy_count": len(inventory)}


class MigrateRequest(BaseModel):
    items: list[dict]

@router.post("/api/media-migrate")
async def api_media_migrate(req: MigrateRequest):
    conn = get_conn()
    cursor = conn.cursor()
    success_count = 0
    errors = []
    
    for item in req.items:
        if item.get("missing"):
            continue
            
        abs_path = item.get("abs_path", item["path"])
        project_id = item["project_id"]
        table = item["table"]
        row_id = item["id"]
        col = item["column"]
        cat = item["category"]
        
        if not os.path.exists(abs_path):
            errors.append(f"File not found: {abs_path}")
            continue
            
        project_root = get_project_root(project_id)
        if not project_root:
            errors.append(f"Project root missing for {project_id}")
            continue
            
        filename = os.path.basename(abs_path)
        new_abs_path = project_media_path(project_root, cat, filename)
        
        os.makedirs(os.path.dirname(new_abs_path), exist_ok=True)
        
        try:
            if os.path.abspath(abs_path) != os.path.abspath(new_abs_path):
                shutil.copy2(abs_path, new_abs_path)
            
            new_rel_path = to_project_relative(project_root, new_abs_path)
            cursor.execute(f"UPDATE {table} SET {col}=? WHERE id=? AND project_id=?", (new_rel_path, row_id, project_id))
            success_count += 1
        except Exception as e:
            errors.append(f"Failed to migrate {abs_path}: {str(e)}")
            
    conn.commit()
    conn.close()
    
    return {"status": "success", "migrated": success_count, "errors": errors}

@router.post("/api/media-cleanup-preview")
async def api_media_cleanup_preview():
    conn = get_conn()
    active_refs = set()
    
    # 1. Gather all active references from DB
    for table, columns in MIGRATION_CONFIG.items():
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
        for row in rows:
            for col, _ in columns:
                path = row[col]
                if path:
                    if not os.path.isabs(path):
                        abs_p = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", path))
                        active_refs.add(abs_p)
                    else:
                        active_refs.add(os.path.abspath(path))
    
    # 2. Scan legacy directories for orphans
    legacy_dirs = ["temp_audio", "temp_thumbnails", "last_frames", "images", "Voice_ref", "output"]
    orphans = []
    
    for d in legacy_dirs:
        dir_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", d))
        if os.path.isdir(dir_path):
            for root, _, files in os.walk(dir_path):
                for f in files:
                    file_path = os.path.abspath(os.path.join(root, f))
                    if file_path not in active_refs:
                        orphans.append({
                            "path": file_path,
                            "size": os.path.getsize(file_path),
                            "category": "orphan"
                        })
                        
    # 3. Scan project caches
    # We'll just look for any project_root in the DB and scan its cache/ folder
    rows = conn.execute("SELECT DISTINCT project_root FROM projects WHERE project_root != ''").fetchall()
    caches = []
    for row in rows:
        proot = row["project_root"]
        if proot and os.path.isdir(proot):
            cache_dir = os.path.join(proot, "media", "cache")
            if os.path.isdir(cache_dir):
                for root, _, files in os.walk(cache_dir):
                    for f in files:
                        file_path = os.path.abspath(os.path.join(root, f))
                        caches.append({
                            "path": file_path,
                            "size": os.path.getsize(file_path),
                            "category": "cache"
                        })
                        
    conn.close()
    
    total_orphan_size = sum(x["size"] for x in orphans)
    total_cache_size = sum(x["size"] for x in caches)
    
    return {
        "orphans": orphans,
        "caches": caches,
        "summary": {
            "orphan_count": len(orphans),
            "orphan_size_mb": round(total_orphan_size / (1024*1024), 2),
            "cache_count": len(caches),
            "cache_size_mb": round(total_cache_size / (1024*1024), 2)
        }
    }

class CleanupApplyRequest(BaseModel):
    files: list[str]

@router.post("/api/media-cleanup-apply")
async def api_media_cleanup_apply(req: CleanupApplyRequest):
    deleted = 0
    freed = 0
    errors = []
    
    for path in req.files:
        try:
            if os.path.exists(path) and os.path.isfile(path):
                size = os.path.getsize(path)
                os.remove(path)
                deleted += 1
                freed += size
        except Exception as e:
            errors.append(f"Failed to delete {path}: {str(e)}")
            
    return {
        "status": "success",
        "deleted_count": deleted,
        "freed_mb": round(freed / (1024*1024), 2),
        "errors": errors
    }
