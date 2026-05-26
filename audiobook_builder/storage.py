import os
import re

# Base directory for all new projects
GLOBAL_PROJECTS_ROOT = os.path.join(os.path.dirname(__file__), "projects")

def _sanitize_slug(name: str) -> str:
    slug = re.sub(r'[^a-zA-Z0-9_\-]+', '-', name).strip('-').lower()
    return slug or "untitled-project"

def create_project_workspace(project_id: str, name: str, root: str = None) -> dict:
    if root:
        project_root = root
    else:
        slug = _sanitize_slug(name)
        project_root = os.path.join(GLOBAL_PROJECTS_ROOT, f"{slug}-{project_id[:8]}")
        
    media_root = os.path.join(project_root, "media")
    
    # Create directory structure
    dirs = [
        project_root,
        media_root,
        os.path.join(media_root, "audio", "rendered-lines"),
        os.path.join(media_root, "audio", "previews"),
        os.path.join(media_root, "video", "generated-scenes"),
        os.path.join(media_root, "video", "thumbnails"),
        os.path.join(media_root, "video", "last-frames"),
        os.path.join(media_root, "images", "assets"),
        os.path.join(media_root, "images", "references"),
        os.path.join(media_root, "voices", "uploaded"),
        os.path.join(media_root, "voices", "synthetic"),
        os.path.join(media_root, "exports", "audio"),
        os.path.join(media_root, "exports", "video"),
        os.path.join(media_root, "cache", "downloads"),
        os.path.join(media_root, "cache", "scratch"),
    ]
    
    for d in dirs:
        os.makedirs(d, exist_ok=True)
        
    return {
        "project_root": project_root,
        "media_root": media_root
    }

def get_project_root(project_id: str) -> str:
    from database import get_conn
    conn = get_conn()
    row = conn.execute("SELECT project_root FROM projects WHERE id=?", (project_id,)).fetchone()
    conn.close()
    return row["project_root"] if row else ""

def resolve_project_path(project_root: str, rel_path: str) -> str:
    """Resolve a project-relative path securely against the project root."""
    if not project_root:
        # Fallback to current global behavior if not migrated
        return os.path.join(os.path.dirname(__file__), rel_path)
        
    abs_path = os.path.abspath(os.path.join(project_root, rel_path))
    # Path traversal check
    if not abs_path.startswith(os.path.abspath(project_root)):
        raise ValueError("Path traversal detected")
    return abs_path

def to_project_relative(project_root: str, abs_path: str) -> str:
    """Convert an absolute path to a project-relative path."""
    if not project_root:
        return abs_path
    
    abs_root = os.path.abspath(project_root)
    abs_target = os.path.abspath(abs_path)
    
    if abs_target.startswith(abs_root):
        rel = os.path.relpath(abs_target, abs_root)
        # Convert windows slashes to forward slashes for DB consistency
        return rel.replace("\\", "/")
    return abs_path

def project_media_path(project_root: str, category: str, filename: str) -> str:
    """Generate an absolute path for a new media file."""
    if not project_root:
        # Fallback for old projects
        fallback_dirs = {
            "audio/rendered-lines": "temp_audio",
            "audio/previews": "temp_audio",
            "video/generated-scenes": "temp_audio",
            "video/thumbnails": "temp_thumbnails",
            "video/last-frames": "last_frames",
            "images/assets": "images",
            "images/references": "images",
            "voices/uploaded": "Voice_ref",
            "voices/synthetic": "Voice_ref",
            "exports/audio": "output",
            "exports/video": "output",
            "cache/downloads": "temp_audio",
            "cache/scratch": "temp_audio",
        }
        fallback_dir = fallback_dirs.get(category, "temp_audio")
        return os.path.join(os.path.dirname(__file__), fallback_dir, filename)
        
    return os.path.join(project_root, "media", category.replace("/", os.sep), filename)
