import sqlite3
import os
import json
import time
from storage import create_project_workspace
from app_config import get_database_path

DB_PATH = get_database_path()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db():
    conn = get_conn()
    c = conn.cursor()

    c.execute("""CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY DEFAULT 'default',
        name TEXT NOT NULL DEFAULT 'My Audiobook',
        global_art_style TEXT NOT NULL DEFAULT '',
        video_aspect_ratio TEXT NOT NULL DEFAULT '16:9',
        video_duration INTEGER NOT NULL DEFAULT 8,
        video_model_profile TEXT NOT NULL DEFAULT 'ultra_low_priority',
        flowkit_project_id TEXT NOT NULL DEFAULT '',
        tts_speed REAL NOT NULL DEFAULT 1.0,
        project_root TEXT DEFAULT '',
        media_root TEXT DEFAULT '',
        storage_version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )""")

    _migrate_project_storage_fields()

    c.execute("INSERT OR IGNORE INTO projects (id) VALUES ('default')")

    c.execute("SELECT project_root FROM projects WHERE id='default'")
    row = c.fetchone()
    if not row or not row["project_root"]:
        print("[DB] Initializing default project workspace...")
        workspace = create_project_workspace('default', 'My Audiobook')
        c.execute(
            "UPDATE projects SET project_root=?, media_root=? WHERE id='default'",
            (workspace["project_root"], workspace["media_root"])
        )
        conn.commit()


    c.execute("""CREATE TABLE IF NOT EXISTS entities (
        id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default',
        type TEXT NOT NULL DEFAULT 'character',
        name TEXT NOT NULL DEFAULT '',
        description TEXT DEFAULT '',
        image_prompt TEXT DEFAULT '',
        local_image_path TEXT DEFAULT '',
        media_id TEXT DEFAULT '',
        media_project_id TEXT DEFAULT '',
        last_uploaded_at INTEGER DEFAULT 0,
        variation_context TEXT DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (id, project_id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS entity_variations (
        id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default',
        local_image_path TEXT DEFAULT '',
        media_id TEXT DEFAULT '',
        prompt TEXT DEFAULT '',
        name TEXT DEFAULT '',
        is_official INTEGER NOT NULL DEFAULT 0,
        is_reference INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (id, entity_id, project_id),
        FOREIGN KEY (entity_id, project_id) REFERENCES entities(id, project_id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS voice_params (
        speaker TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default',
        gender TEXT NOT NULL DEFAULT 'female',
        age TEXT NOT NULL DEFAULT 'adult',
        pitch TEXT NOT NULL DEFAULT 'moderate',
        is_locked INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (speaker, project_id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS script_lines (
        id INTEGER PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        speaker TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        image_prompt TEXT DEFAULT '',
        motion_prompt TEXT DEFAULT '',
        video_url TEXT DEFAULT '',
        order_idx INTEGER NOT NULL DEFAULT 0,
        selected INTEGER NOT NULL DEFAULT 0,
        speed REAL NOT NULL DEFAULT 1.0,
        FOREIGN KEY (project_id) REFERENCES projects(id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS script_line_visual_refs (
        script_line_id INTEGER NOT NULL,
        entity_id TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default',
        PRIMARY KEY (script_line_id, entity_id),
        FOREIGN KEY (script_line_id) REFERENCES script_lines(id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS inline_video_nodes (
        id TEXT PRIMARY KEY,
        script_line_id INTEGER NOT NULL,
        project_id TEXT NOT NULL DEFAULT 'default',
        order_idx INTEGER NOT NULL DEFAULT 0,
        user_intent TEXT DEFAULT '',
        negative_prompt TEXT DEFAULT '',
        ai_prompt TEXT DEFAULT '',
        direct_prompt TEXT DEFAULT '',
        last_frame_url TEXT DEFAULT '',
        last_frame_media_id TEXT DEFAULT '',
        op_name TEXT DEFAULT '',
        media_id TEXT DEFAULT '',
        video_url TEXT DEFAULT '',
        FOREIGN KEY (script_line_id) REFERENCES script_lines(id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS timeline_audio_clips (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        line_id INTEGER,
        speaker TEXT NOT NULL DEFAULT '',
        audio_file TEXT NOT NULL DEFAULT '',
        track INTEGER NOT NULL DEFAULT 0,
        start_time REAL NOT NULL DEFAULT 0,
        duration REAL NOT NULL DEFAULT 2.0,
        volume REAL NOT NULL DEFAULT 1.0,
        FOREIGN KEY (project_id) REFERENCES projects(id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS timeline_video_clips (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        line_id INTEGER,
        video_file TEXT NOT NULL DEFAULT '',
        video_url TEXT DEFAULT '',
        start_time REAL NOT NULL DEFAULT 0,
        duration REAL NOT NULL DEFAULT 8.0,
        track INTEGER NOT NULL DEFAULT 0,
        trim_start REAL NOT NULL DEFAULT 0,
        keep_sound INTEGER NOT NULL DEFAULT 0,
        volume REAL NOT NULL DEFAULT 100.0,
        FOREIGN KEY (project_id) REFERENCES projects(id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        scene_id TEXT DEFAULT '',
        type TEXT NOT NULL DEFAULT 'video',
        prompt TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PROCESSING',
        operation_name TEXT DEFAULT '',
        media_id TEXT DEFAULT '',
        url TEXT DEFAULT '',
        local_file TEXT DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (project_id) REFERENCES projects(id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS video_graph_state (
        project_id TEXT PRIMARY KEY DEFAULT 'default',
        nodes_json TEXT NOT NULL DEFAULT '[]',
        edges_json TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (project_id) REFERENCES projects(id)
    )""")

    conn.commit()
    conn.close()

    _migrate_jobs_db_if_exists()
    _migrate_legacy_json_if_exists()
    _migrate_script_lines_speed()
    _migrate_project_tts_params()


# ── One-time migrations ────────────────────────────────────────────────────

def _migrate_project_tts_params():
    conn = get_conn()
    c = conn.cursor()
    c.execute("PRAGMA table_info(projects)")
    columns = [row["name"] for row in c.fetchall()]
    changed = False
    
    if "tts_denoise" not in columns:
        try:
            c.execute("ALTER TABLE projects ADD COLUMN tts_denoise INTEGER NOT NULL DEFAULT 1")
            changed = True
        except Exception as e:
            print(f"[DB] Migration failed to add tts_denoise: {e}")
            
    if "tts_postprocess" not in columns:
        try:
            c.execute("ALTER TABLE projects ADD COLUMN tts_postprocess INTEGER NOT NULL DEFAULT 0")
            changed = True
        except Exception as e:
            print(f"[DB] Migration failed to add tts_postprocess: {e}")
            
    if "tts_num_step" not in columns:
        try:
            c.execute("ALTER TABLE projects ADD COLUMN tts_num_step INTEGER NOT NULL DEFAULT 32")
            changed = True
        except Exception as e:
            print(f"[DB] Migration failed to add tts_num_step: {e}")
            
    if "tts_guidance_scale" not in columns:
        try:
            c.execute("ALTER TABLE projects ADD COLUMN tts_guidance_scale REAL NOT NULL DEFAULT 2.0")
            changed = True
        except Exception as e:
            print(f"[DB] Migration failed to add tts_guidance_scale: {e}")
            
    if "tts_speed" not in columns:
        try:
            c.execute("ALTER TABLE projects ADD COLUMN tts_speed REAL NOT NULL DEFAULT 1.0")
            changed = True
        except Exception as e:
            print(f"[DB] Migration failed to add tts_speed: {e}")

    if "video_model_profile" not in columns:
        try:
            c.execute("ALTER TABLE projects ADD COLUMN video_model_profile TEXT NOT NULL DEFAULT 'ultra_low_priority'")
            changed = True
        except Exception as e:
            print(f"[DB] Migration failed to add video_model_profile: {e}")
            
    if changed:
        conn.commit()
    conn.close()


def _migrate_script_lines_speed():
    conn = get_conn()
    c = conn.cursor()
    c.execute("PRAGMA table_info(script_lines)")
    columns = [row["name"] for row in c.fetchall()]
    if "speed" not in columns:
        try:
            c.execute("ALTER TABLE script_lines ADD COLUMN speed REAL NOT NULL DEFAULT 1.0")
            conn.commit()
        except Exception:
            conn.rollback()
    conn.close()

def _migrate_project_storage_fields():
    conn = get_conn()
    c = conn.cursor()
    c.execute("PRAGMA table_info(projects)")
    columns = [row["name"] for row in c.fetchall()]
    if "project_root" not in columns:
        print("[DB] Migrating projects table to add storage fields...")
        try:
            c.execute("ALTER TABLE projects ADD COLUMN project_root TEXT DEFAULT ''")
            c.execute("ALTER TABLE projects ADD COLUMN media_root TEXT DEFAULT ''")
            c.execute("ALTER TABLE projects ADD COLUMN storage_version INTEGER NOT NULL DEFAULT 1")
            conn.commit()
            print("[DB] Storage fields added successfully.")
        except Exception as e:
            print(f"[DB] Failed to add storage fields: {e}")
            conn.rollback()
    conn.close()

def _migrate_jobs_db_if_exists():
    jobs_db = os.path.join(os.path.dirname(__file__), "jobs.db")
    if not os.path.exists(jobs_db):
        return
    print("[DB] Migrating jobs.db → audiobook.db video_jobs...")
    try:
        old = sqlite3.connect(jobs_db)
        old.row_factory = sqlite3.Row
        rows = old.execute("SELECT * FROM flow_jobs").fetchall()
        old.close()

        conn = get_conn()
        for r in rows:
            conn.execute("""
                INSERT OR IGNORE INTO video_jobs
                    (id, type, prompt, status, operation_name, media_id, url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (r["id"], r["type"] or "video", r["prompt"] or "",
                  r["status"] or "PROCESSING", r["operation_name"] or "",
                  r["media_id"] or "", r["url"] or ""))
        conn.commit()
        conn.close()
        os.rename(jobs_db, jobs_db + ".migrated")
        print(f"[DB] Migrated {len(rows)} job(s). jobs.db → jobs.db.migrated")
    except Exception as e:
        print(f"[DB] jobs.db migration skipped: {e}")


def _migrate_legacy_json_if_exists():
    base = os.path.dirname(__file__)
    metadata_file = os.path.join(base, "characters_metadata.json")
    profile_file = os.path.join(base, "project_profile.json")

    if os.path.exists(metadata_file):
        print("[DB] Migrating characters_metadata.json → entities / entity_variations...")
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
            conn = get_conn()
            for entity_id, data in metadata.items():
                conn.execute("""
                    INSERT OR REPLACE INTO entities
                        (id, project_id, type, name, description, image_prompt,
                         local_image_path, media_id, media_project_id,
                         last_uploaded_at, variation_context)
                    VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    entity_id,
                    data.get("type", "character"),
                    data.get("name", entity_id),
                    data.get("description", ""),
                    data.get("image_prompt", ""),
                    data.get("local_image_path", ""),
                    data.get("media_id", ""),
                    data.get("media_project_id", ""),
                    int(data.get("last_uploaded_at") or 0),
                    data.get("variation_context", ""),
                ))
                for v in data.get("variations", []):
                    conn.execute("""
                        INSERT OR REPLACE INTO entity_variations
                            (id, entity_id, project_id, local_image_path, media_id,
                             prompt, name, is_official, is_reference, created_at)
                        VALUES (?, ?, 'default', ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        str(v.get("id", "")),
                        entity_id,
                        v.get("local_image_path", ""),
                        v.get("media_id", ""),
                        v.get("prompt", ""),
                        v.get("name", ""),
                        1 if v.get("is_official") else 0,
                        1 if v.get("is_reference") else 0,
                        int(v.get("created_at") or time.time()),
                    ))
            conn.commit()
            conn.close()
            os.rename(metadata_file, metadata_file + ".migrated")
            print("[DB] characters_metadata.json migrated.")
        except Exception as e:
            print(f"[DB] characters_metadata.json migration skipped: {e}")

    if os.path.exists(profile_file):
        print("[DB] Migrating project_profile.json → voice_params / projects...")
        try:
            with open(profile_file, "r", encoding="utf-8") as f:
                profile = json.load(f)
            conn = get_conn()

            flowkit_pid = profile.get("flowkitProjectId", "")
            if flowkit_pid:
                conn.execute(
                    "UPDATE projects SET flowkit_project_id=? WHERE id='default'",
                    (flowkit_pid,)
                )

            locked = profile.get("lockedVoices", {})
            for speaker, params in profile.get("speakerVoiceParams", {}).items():
                conn.execute("""
                    INSERT OR REPLACE INTO voice_params
                        (speaker, project_id, gender, age, pitch, is_locked)
                    VALUES (?, 'default', ?, ?, ?, ?)
                """, (
                    speaker,
                    params.get("gender", "female"),
                    params.get("age", "adult"),
                    params.get("pitch", "moderate"),
                    1 if locked.get(speaker) else 0,
                ))
            conn.commit()
            conn.close()
            os.rename(profile_file, profile_file + ".migrated")
            print("[DB] project_profile.json migrated.")
        except Exception as e:
            print(f"[DB] project_profile.json migration skipped: {e}")


# ── Video job helpers — same API as old flow_service.py inline functions ──
# flowkit.py imports these from flow_service which re-exports them here.

def add_job(job_id: str, job_type: str, prompt: str, operation_name: str, media_id: str = None):
    conn = get_conn()
    conn.execute("""
        INSERT OR IGNORE INTO video_jobs
            (id, type, prompt, operation_name, media_id, status)
        VALUES (?, ?, ?, ?, ?, 'PROCESSING')
    """, (job_id, job_type, prompt, operation_name, media_id or ""))
    conn.commit()
    conn.close()


def update_job_status(job_id: str, status: str, media_id: str = None, url: str = None):
    conn = get_conn()
    conn.execute("""
        UPDATE video_jobs
        SET status=?,
            media_id=COALESCE(?, media_id),
            url=COALESCE(?, url),
            updated_at=unixepoch()
        WHERE id=?
    """, (status, media_id, url, job_id))
    conn.commit()
    conn.close()


def get_pending_jobs() -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, operation_name, media_id FROM video_jobs WHERE status='PROCESSING'"
    ).fetchall()
    conn.close()
    return [{"id": r["id"], "operation_name": r["operation_name"], "media_id": r["media_id"]} for r in rows]


# ── Project profile helpers ───────────────────────────────────────────────

def _ensure_project_row(conn: sqlite3.Connection, project_id: str):
    """Create a minimal project row when the frontend still references a stale local project id."""
    project_id = project_id or "default"
    exists = conn.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone()
    if exists:
        return

    print(f"[DB] Project '{project_id}' missing; creating a compatibility project row.", flush=True)
    workspace = create_project_workspace(project_id, project_id)
    conn.execute(
        "INSERT OR IGNORE INTO projects (id, name, project_root, media_root) VALUES (?, ?, ?, ?)",
        (project_id, project_id, workspace["project_root"], workspace["media_root"]),
    )


def get_project_profile(project_id: str = 'default') -> dict:
    """Return profile in the same shape the frontend expects from GET /api/project-profile."""
    conn = get_conn()
    project = conn.execute(
        "SELECT * FROM projects WHERE id=?", (project_id,)
    ).fetchone()
    voice_rows = conn.execute(
        "SELECT * FROM voice_params WHERE project_id=?", (project_id,)
    ).fetchall()
    conn.close()

    speaker_params: dict = {}
    locked_voices: dict = {}
    for row in voice_rows:
        spk = row['speaker']
        speaker_params[spk] = {
            "gender": row['gender'],
            "age": row['age'],
            "pitch": row['pitch'],
        }
        if row['is_locked']:
            locked_voices[spk] = True

    return {
        "speakerVoiceParams": speaker_params,
        "lockedVoices": locked_voices,
        "flowkitProjectId": project['flowkit_project_id'] if project else '',
        "globalArtStyle": project['global_art_style'] if project else '',
        "videoAspectRatio": project['video_aspect_ratio'] if project else '16:9',
        "videoDuration": project['video_duration'] if project else 8,
        "videoModelProfile": project['video_model_profile'] if (project and 'video_model_profile' in project.keys()) else 'ultra_low_priority',
        "ttsDenoise": bool(project['tts_denoise']) if (project and 'tts_denoise' in project.keys()) else True,
        "ttsPostprocess": bool(project['tts_postprocess']) if (project and 'tts_postprocess' in project.keys()) else False,
        "ttsNumStep": project['tts_num_step'] if (project and 'tts_num_step' in project.keys()) else 32,
        "ttsGuidanceScale": project['tts_guidance_scale'] if (project and 'tts_guidance_scale' in project.keys()) else 2.0,
        "ttsSpeed": project['tts_speed'] if (project and 'tts_speed' in project.keys()) else 1.0,
    }


def save_project_profile(data: dict, project_id: str = 'default'):
    """Persist profile data from the frontend into projects + voice_params tables."""
    conn = get_conn()
    try:
        _ensure_project_row(conn, project_id)
        conn.execute("""
            UPDATE projects SET
                flowkit_project_id = COALESCE(?, flowkit_project_id),
                global_art_style   = COALESCE(?, global_art_style),
                video_aspect_ratio = COALESCE(?, video_aspect_ratio),
                video_duration     = COALESCE(?, video_duration),
                video_model_profile = COALESCE(?, video_model_profile),
                tts_denoise        = COALESCE(?, tts_denoise),
                tts_postprocess    = COALESCE(?, tts_postprocess),
                tts_num_step       = COALESCE(?, tts_num_step),
                tts_guidance_scale = COALESCE(?, tts_guidance_scale),
                tts_speed          = COALESCE(?, tts_speed),
                updated_at         = unixepoch()
            WHERE id = ?
        """, (
            data.get('flowkitProjectId') or None,
            data.get('globalArtStyle') or None,
            data.get('videoAspectRatio') or None,
            int(data['videoDuration']) if data.get('videoDuration') is not None else None,
            data.get('videoModelProfile') or None,
            1 if data.get('ttsDenoise') is True else (0 if data.get('ttsDenoise') is False else None),
            1 if data.get('ttsPostprocess') is True else (0 if data.get('ttsPostprocess') is False else None),
            int(data['ttsNumStep']) if data.get('ttsNumStep') is not None else None,
            float(data['ttsGuidanceScale']) if data.get('ttsGuidanceScale') is not None else None,
            float(data['ttsSpeed']) if data.get('ttsSpeed') is not None else None,
            project_id,
        ))

        locked = data.get('lockedVoices', {})
        from state import normalize_speaker_id
        for speaker, params in data.get('speakerVoiceParams', {}).items():
            speaker_id = normalize_speaker_id(speaker)
            conn.execute("""
                INSERT INTO voice_params (speaker, project_id, gender, age, pitch, is_locked)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(speaker, project_id) DO UPDATE SET
                    gender    = excluded.gender,
                    age       = excluded.age,
                    pitch     = excluded.pitch,
                    is_locked = excluded.is_locked
            """, (
                speaker_id, project_id,
                params.get('gender', 'female'),
                params.get('age', 'adult'),
                params.get('pitch', 'moderate'),
                1 if locked.get(speaker) else 0,
            ))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_project_state(project_id: str = 'default') -> dict:
    """Single-call snapshot: project settings + entities + voice params."""
    conn = get_conn()
    project = conn.execute(
        "SELECT * FROM projects WHERE id=?", (project_id,)
    ).fetchone()
    voice_rows = conn.execute(
        "SELECT * FROM voice_params WHERE project_id=?", (project_id,)
    ).fetchall()
    conn.close()

    speaker_params: dict = {}
    locked_voices: dict = {}
    for row in voice_rows:
        spk = row['speaker']
        speaker_params[spk] = {"gender": row['gender'], "age": row['age'], "pitch": row['pitch']}
        if row['is_locked']:
            locked_voices[spk] = True

    return {
        "project": {
            "globalArtStyle":    project['global_art_style']    if project else '',
            "videoAspectRatio":  project['video_aspect_ratio']  if project else '16:9',
            "videoDuration":     project['video_duration']       if project else 8,
            "videoModelProfile": project['video_model_profile'] if (project and 'video_model_profile' in project.keys()) else 'ultra_low_priority',
            "flowkitProjectId":  project['flowkit_project_id']  if project else '',
            "projectRoot":       project['project_root']        if project and 'project_root' in project.keys() else '',
            "mediaRoot":         project['media_root']          if project and 'media_root' in project.keys() else '',
            "ttsDenoise":        bool(project['tts_denoise'])   if project and 'tts_denoise' in project.keys() else True,
            "ttsPostprocess":    bool(project['tts_postprocess']) if project and 'tts_postprocess' in project.keys() else False,
            "ttsNumStep":        project['tts_num_step']        if project and 'tts_num_step' in project.keys() else 32,
            "ttsGuidanceScale":  project['tts_guidance_scale']  if project and 'tts_guidance_scale' in project.keys() else 2.0,
            "ttsSpeed":          project['tts_speed']          if project and 'tts_speed' in project.keys() else 1.0,
        },
        "entities":      get_all_entities(project_id),
        "voiceParams":   speaker_params,
        "lockedVoices":  locked_voices,
        "timelineClips":  get_timeline_clips(project_id),
        "script":         get_script_lines(project_id),
        "videoGraph":     get_video_graph(project_id),
        "processingJobs": get_processing_jobs(project_id),
    }


# ── Job status helpers ────────────────────────────────────────────────────

def get_processing_jobs(project_id: str = 'default') -> dict:
    conn = get_conn()
    rows = conn.execute(
        "SELECT operation_name, media_id FROM video_jobs WHERE status='PROCESSING' AND project_id=?",
        (project_id,)
    ).fetchall()
    conn.close()
    return {
        "operationNames": [r["operation_name"] for r in rows if r["operation_name"]],
        "mediaIds":       [r["media_id"]       for r in rows if r["media_id"]],
    }


# ── Video graph helpers ───────────────────────────────────────────────────

def get_video_graph(project_id: str = 'default') -> dict:
    conn = get_conn()
    row = conn.execute(
        "SELECT nodes_json, edges_json FROM video_graph_state WHERE project_id=?",
        (project_id,)
    ).fetchone()
    conn.close()
    if not row:
        return {"nodes": [], "edges": []}
    return {
        "nodes": json.loads(row["nodes_json"]),
        "edges": json.loads(row["edges_json"]),
    }


def save_video_graph(nodes: list, edges: list, project_id: str = 'default'):
    conn = get_conn()
    try:
        _ensure_project_row(conn, project_id)
        conn.execute("""
            INSERT INTO video_graph_state (project_id, nodes_json, edges_json, updated_at)
            VALUES (?, ?, ?, unixepoch())
            ON CONFLICT(project_id) DO UPDATE SET
                nodes_json = excluded.nodes_json,
                edges_json = excluded.edges_json,
                updated_at = unixepoch()
        """, (project_id, json.dumps(nodes, ensure_ascii=False), json.dumps(edges, ensure_ascii=False)))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Script line helpers ───────────────────────────────────────────────────

def get_script_lines(project_id: str = 'default') -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM script_lines WHERE project_id=? ORDER BY order_idx",
        (project_id,)
    ).fetchall()
    ref_rows = conn.execute(
        "SELECT script_line_id, entity_id FROM script_line_visual_refs WHERE project_id=?",
        (project_id,)
    ).fetchall()
    conn.close()

    refs_by_line: dict = {}
    for r in ref_rows:
        refs_by_line.setdefault(r["script_line_id"], []).append(r["entity_id"])

    return [{
        "id":                row["id"],
        "speaker":           row["speaker"],
        "text":              row["text"],
        "image_prompt":      row["image_prompt"] or "",
        "motion_prompt":     row["motion_prompt"] or "",
        "video_url":         row["video_url"] or "",
        "selected":          bool(row["selected"]),
        "speed":             row["speed"] if "speed" in row.keys() else 1.0,
        "visual_references": refs_by_line.get(row["id"], []),
    } for row in rows]


def save_script_lines(lines: list, project_id: str = 'default'):
    from state import normalize_speaker_id
    conn = get_conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        _ensure_project_row(conn, project_id)
        conn.execute("DELETE FROM script_line_visual_refs WHERE project_id=?", (project_id,))
        conn.execute("DELETE FROM script_lines WHERE project_id=?", (project_id,))
        for idx, line in enumerate(lines):
            conn.execute("""
                INSERT INTO script_lines
                    (id, project_id, speaker, text, image_prompt, motion_prompt, video_url, order_idx, selected, speed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                line["id"], project_id,
                normalize_speaker_id(line.get("speaker", "")),
                line.get("text", ""),
                line.get("image_prompt", "") or "",
                line.get("motion_prompt", "") or "",
                line.get("video_url", "") or "",
                idx,
                1 if line.get("selected") else 0,
                line.get("speed", 1.0)
            ))
            for entity_id in line.get("visual_references", []):
                conn.execute("""
                    INSERT OR IGNORE INTO script_line_visual_refs (script_line_id, entity_id, project_id)
                    VALUES (?, ?, ?)
                """, (line["id"], entity_id, project_id))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


# ── Timeline clip helpers ─────────────────────────────────────────────────

def get_timeline_clips(project_id: str = 'default') -> dict:
    conn = get_conn()
    audio_rows = conn.execute(
        "SELECT * FROM timeline_audio_clips WHERE project_id=? ORDER BY start_time",
        (project_id,)
    ).fetchall()
    video_rows = conn.execute(
        "SELECT * FROM timeline_video_clips WHERE project_id=? ORDER BY start_time",
        (project_id,)
    ).fetchall()
    conn.close()

    return {
        "audio": [{
            "id":        r["id"],
            "lineId":    r["line_id"],
            "speaker":   r["speaker"],
            "filename":  r["audio_file"],
            "track":     r["track"],
            "startTime": r["start_time"],
            "duration":  r["duration"],
            "volume":    r["volume"],
        } for r in audio_rows],
        "video": [{
            "id":        r["id"],
            "lineId":    r["line_id"],
            "videoUrl":  r["video_url"],
            "startTime": r["start_time"],
            "duration":  r["duration"],
            "track":     r["track"],
            "trimStart": r["trim_start"],
            "keepSound": bool(r["keep_sound"]),
            "volume":    r["volume"],
        } for r in video_rows],
    }


def save_timeline_clips(audio_clips: list, video_clips: list, project_id: str = 'default'):
    conn = get_conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        _ensure_project_row(conn, project_id)
        conn.execute("DELETE FROM timeline_audio_clips WHERE project_id=?", (project_id,))
        for c in audio_clips:
            from state import normalize_speaker_id
            conn.execute("""
                INSERT INTO timeline_audio_clips
                    (id, project_id, line_id, speaker, audio_file, track, start_time, duration, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                c["id"], project_id,
                c.get("lineId"), normalize_speaker_id(c.get("speaker", "")),
                c.get("filename", ""),
                c.get("track", 0),
                c.get("startTime", 0),
                c.get("duration", 2.0),
                c.get("volume", 100.0),
            ))

        conn.execute("DELETE FROM timeline_video_clips WHERE project_id=?", (project_id,))
        for c in video_clips:
            conn.execute("""
                INSERT INTO timeline_video_clips
                    (id, project_id, line_id, video_url, start_time, duration, track, trim_start, keep_sound, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                c["id"], project_id,
                c.get("lineId"),
                c.get("videoUrl", ""),
                c.get("startTime", 0),
                c.get("duration", 8.0),
                c.get("track", 0),
                c.get("trimStart", 0),
                1 if c.get("keepSound") else 0,
                c.get("volume", 100.0),
            ))

        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


# ── Entity helpers ────────────────────────────────────────────────────────

def get_all_entities(project_id: str = 'default') -> dict:
    """Return all entities as a dict matching the old characters_metadata.json shape."""
    conn = get_conn()
    entities = conn.execute(
        "SELECT * FROM entities WHERE project_id=? ORDER BY created_at", (project_id,)
    ).fetchall()
    result = {}
    for e in entities:
        eid = e['id']
        variations = conn.execute(
            "SELECT * FROM entity_variations WHERE entity_id=? AND project_id=? ORDER BY created_at",
            (eid, project_id)
        ).fetchall()
        result[eid] = {
            "type": e['type'],
            "name": e['name'],
            "description": e['description'],
            "image_prompt": e['image_prompt'],
            "local_image_path": e['local_image_path'],
            "media_id": e['media_id'],
            "media_project_id": e['media_project_id'],
            "last_uploaded_at": e['last_uploaded_at'],
            "variation_context": e['variation_context'],
            "variations": [
                {
                    "id": v['id'],
                    "local_image_path": v['local_image_path'],
                    "media_id": v['media_id'],
                    "prompt": v['prompt'],
                    "name": v['name'],
                    "is_official": bool(v['is_official']),
                    "is_reference": bool(v['is_reference']),
                    "created_at": v['created_at'],
                }
                for v in variations
            ],
        }
    conn.close()
    return result


def get_entity(entity_id: str, project_id: str = 'default') -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM entities WHERE id=? AND project_id=?", (entity_id, project_id)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def save_entity(entity_id: str, data: dict, project_id: str = 'default'):
    """Insert or replace a full entity record (upsert)."""
    conn = get_conn()
    conn.execute("""
        INSERT INTO entities
            (id, project_id, type, name, description, image_prompt,
             local_image_path, media_id, media_project_id, last_uploaded_at, variation_context)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id, project_id) DO UPDATE SET
            type=excluded.type, name=excluded.name, description=excluded.description,
            image_prompt=excluded.image_prompt, local_image_path=excluded.local_image_path,
            media_id=excluded.media_id, media_project_id=excluded.media_project_id,
            last_uploaded_at=excluded.last_uploaded_at, variation_context=excluded.variation_context
    """, (
        entity_id, project_id,
        data.get('type', 'character'),
        data.get('name', entity_id),
        data.get('description', ''),
        data.get('image_prompt', ''),
        data.get('local_image_path', ''),
        data.get('media_id') or '',
        data.get('media_project_id', ''),
        int(data.get('last_uploaded_at') or 0),
        data.get('variation_context', ''),
    ))
    conn.commit()
    conn.close()


def patch_entity(entity_id: str, project_id: str = 'default', **fields):
    """Update only the provided fields on an existing entity row."""
    allowed = {'type', 'name', 'description', 'image_prompt', 'local_image_path',
               'media_id', 'media_project_id', 'last_uploaded_at', 'variation_context'}
    safe = {k: v for k, v in fields.items() if k in allowed}
    if not safe:
        return
    conn = get_conn()
    set_clause = ', '.join(f"{k}=?" for k in safe)
    conn.execute(
        f"UPDATE entities SET {set_clause} WHERE id=? AND project_id=?",
        list(safe.values()) + [entity_id, project_id]
    )
    conn.commit()
    conn.close()


def delete_entity(entity_id: str, project_id: str = 'default'):
    conn = get_conn()
    conn.execute(
        "DELETE FROM entity_variations WHERE entity_id=? AND project_id=?", (entity_id, project_id)
    )
    conn.execute(
        "DELETE FROM entities WHERE id=? AND project_id=?", (entity_id, project_id)
    )
    conn.commit()
    conn.close()


def save_entity_variation(variation_id: str, entity_id: str, project_id: str = 'default', **fields):
    conn = get_conn()
    conn.execute("""
        INSERT INTO entity_variations
            (id, entity_id, project_id, local_image_path, media_id, prompt, name, is_official, is_reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id, entity_id, project_id) DO UPDATE SET
            local_image_path=excluded.local_image_path, media_id=excluded.media_id,
            prompt=excluded.prompt, name=excluded.name,
            is_official=excluded.is_official, is_reference=excluded.is_reference
    """, (
        variation_id, entity_id, project_id,
        fields.get('local_image_path', ''),
        fields.get('media_id', ''),
        fields.get('prompt', ''),
        fields.get('name', ''),
        1 if fields.get('is_official') else 0,
        1 if fields.get('is_reference') else 0,
    ))
    conn.commit()
    conn.close()


def delete_entity_variation(variation_id: str, entity_id: str, project_id: str = 'default'):
    conn = get_conn()
    conn.execute(
        "DELETE FROM entity_variations WHERE id=? AND entity_id=? AND project_id=?",
        (variation_id, entity_id, project_id)
    )
    conn.commit()
    conn.close()


def get_reference_variations(entity_id: str, project_id: str = 'default') -> list[dict]:
    """Return all variations with is_reference=1, ordered by creation time."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM entity_variations WHERE entity_id=? AND project_id=? AND is_reference=1 ORDER BY created_at",
        (entity_id, project_id)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Project list / create helpers ────────────────────────────────────────

def get_all_projects() -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, name, created_at, updated_at, project_root, media_root FROM projects ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_project(name: str, requested_root: str = None) -> dict:
    project_id = f"proj_{int(time.time() * 1000)}"
    workspace = create_project_workspace(project_id, name, requested_root)
    
    conn = get_conn()
    conn.execute(
        "INSERT INTO projects (id, name, project_root, media_root) VALUES (?, ?, ?, ?)", 
        (project_id, name, workspace["project_root"], workspace["media_root"])
    )
    conn.commit()
    conn.close()
    return {
        "id": project_id, 
        "name": name,
        "project_root": workspace["project_root"],
        "media_root": workspace["media_root"]
    }


def delete_project(project_id: str):
    conn = get_conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        for table in [
            "script_line_visual_refs", "script_lines",
            "timeline_audio_clips", "timeline_video_clips",
            "entity_variations", "entities",
            "voice_params", "video_jobs", "video_graph_state",
        ]:
            conn.execute(f"DELETE FROM {table} WHERE project_id=?", (project_id,))
        conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


# Initialize on first import so DB is ready before any request arrives
init_db()
