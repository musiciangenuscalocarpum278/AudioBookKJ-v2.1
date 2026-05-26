import os
import time
from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from flow_service import flow_service
from database import (
    get_all_entities, get_entity, save_entity, patch_entity, delete_entity,
    delete_entity_variation, save_entity_variation, get_reference_variations, get_conn,
)

router = APIRouter()


class AssetImageRequest(BaseModel):
    asset_id: str
    prompt: str
    project_id: str
    reference_media_ids: Optional[List[str]] = []


class DownloadAssetRequest(BaseModel):
    asset_id: str
    url: str
    media_id: Optional[str] = None
    prompt: Optional[str] = None
    name: Optional[str] = None
    project_id: str = "default"


class DeleteVariationRequest(BaseModel):
    asset_id: str
    variation_id: str
    project_id: str = "default"


class UpdateAssetRequest(BaseModel):
    id: str
    field: str
    value: str
    project_id: str = "default"


class SetOfficialVariationRequest(BaseModel):
    asset_id: str
    variation_id: str
    project_id: str = "default"


class ToggleReferenceVariationRequest(BaseModel):
    asset_id: str
    variation_id: str
    project_id: str = "default"


class CreateAssetRequest(BaseModel):
    type: str = "character"
    name: str = "New Asset"
    description: str = ""
    image_prompt: str = ""
    project_id: str = "default"


class ImportEntitiesRequest(BaseModel):
    characters: dict
    project_id: str = "default"


@router.post("/api/create-asset")
async def api_create_asset(req: CreateAssetRequest):
    import re
    # Build a stable slug from the name
    slug = re.sub(r'[^a-z0-9]+', '_', req.name.lower()).strip('_') or 'asset'
    base_id = slug
    entity_id = base_id
    # Avoid collisions with existing entities
    suffix = 1
    while get_entity(entity_id, req.project_id):
        entity_id = f"{base_id}_{suffix}"
        suffix += 1
    save_entity(entity_id, {
        'type': req.type,
        'name': req.name,
        'description': req.description,
        'image_prompt': req.image_prompt,
        'local_image_path': '',
        'media_id': '',
        'last_uploaded_at': 0,
    }, req.project_id)
    return {"status": "success", "id": entity_id, "metadata": get_all_entities(req.project_id)}


@router.post("/api/import-entities")
async def api_import_entities(req: ImportEntitiesRequest):
    """Replace all entities in SQLite with those from an imported project file."""
    pid = req.project_id
    existing = get_all_entities(pid)
    for entity_id in existing:
        delete_entity(entity_id, pid)

    for entity_id, meta in req.characters.items():
        save_entity(entity_id, {
            'type': meta.get('type', 'character'),
            'name': meta.get('name', entity_id),
            'description': meta.get('description', ''),
            'image_prompt': meta.get('image_prompt', ''),
            'local_image_path': meta.get('local_image_path', ''),
            'media_id': meta.get('media_id', ''),
            'media_project_id': meta.get('media_project_id', ''),
            'last_uploaded_at': meta.get('last_uploaded_at', 0),
            'variation_context': meta.get('variation_context', ''),
        }, pid)
        for var in meta.get('variations', []):
            if not var.get('id'):
                continue
            save_entity_variation(
                var['id'], entity_id, pid,
                local_image_path=var.get('local_image_path', ''),
                media_id=var.get('media_id', ''),
                prompt=var.get('prompt', ''),
                name=var.get('name', ''),
                is_official=var.get('is_official', False),
                is_reference=var.get('is_reference', False),
            )

    return {"status": "success", "metadata": get_all_entities(pid)}


@router.get("/api/image")
async def api_get_image(path: str, project_id: str = "default"):
    if os.path.isabs(path) and os.path.exists(path):
        return FileResponse(path)
    
    from storage import get_project_root, resolve_project_path
    project_root = get_project_root(project_id)
    try:
        full_path = resolve_project_path(project_root, path)
        if os.path.exists(full_path):
            return FileResponse(full_path)
    except ValueError:
        pass
    raise HTTPException(404, "Not found")


@router.delete("/api/entity/{entity_id}")
async def api_delete_entity(entity_id: str, project_id: str = Query('default')):
    entity = get_entity(entity_id, project_id)
    if not entity:
        return {"status": "error", "message": "Entity not found"}

    # Remove main image from disk
    path = entity.get("local_image_path")
    if path:
        if not os.path.isabs(path):
            from storage import get_project_root, project_media_path
            path = project_media_path(get_project_root(project_id), "", path)
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass

    # Remove variation images from disk
    conn = get_conn()
    var_paths = conn.execute(
        "SELECT local_image_path FROM entity_variations WHERE entity_id=? AND project_id=?", (entity_id, project_id)
    ).fetchall()
    conn.close()
    for row in var_paths:
        path = row["local_image_path"]
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass

    delete_entity(entity_id, project_id)
    return {"status": "success", "metadata": get_all_entities(project_id)}


@router.post("/api/upload-character-image")
async def api_upload_character_image(
    character_id: str = Form(...),
    project_id: str = Form("default"),
    flowkit_project_id: str = Form(""),
    file: UploadFile = File(...),
):
    from storage import get_project_root, project_media_path, to_project_relative
    project_root = get_project_root(project_id)
    timestamp = int(time.time())
    file_ext = os.path.splitext(file.filename)[1] or ".jpg"
    file_path = project_media_path(project_root, "images/assets", f"{character_id}_{timestamp}{file_ext}")
    rel_path = to_project_relative(project_root, file_path)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    file_bytes = await file.read()
    with open(file_path, "wb") as buf:
        buf.write(file_bytes)

    import base64
    base64_data = base64.b64encode(file_bytes).decode("utf-8")
    upload_res = await flow_service.upload_image(base64_data, project_id=flowkit_project_id)
    media_id = upload_res.get("media_id") if upload_res.get("success") else None

    if get_entity(character_id, project_id):
        updates = {"local_image_path": rel_path}
        if media_id:
            updates["media_id"] = media_id
        patch_entity(character_id, project_id, **updates)

    return {"status": "success", "file_path": rel_path, "metadata": get_all_entities(project_id)}


@router.post("/api/generate-asset-image")
async def api_generate_asset_image(req: AssetImageRequest):
    try:
        res = await flow_service.request_scene_frame(
            prompt=req.prompt,
            project_id=req.project_id,
            reference_media_ids=req.reference_media_ids,
        )
        if not res.get("success"):
            raise HTTPException(500, str(res.get("error")))
        return {"url": res["url"], "media_id": res["media_id"]}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))


_MAX_IMAGE_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/api/download-asset-image")
async def api_download_asset_image(req: DownloadAssetRequest):
    import requests as _requests
    from storage import get_project_root, project_media_path, to_project_relative
    project_root = get_project_root(req.project_id)
    timestamp = int(time.time())
    file_path = project_media_path(project_root, "images/assets", f"{req.asset_id}_{timestamp}.jpg")
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    try:
        r = _requests.get(req.url, stream=True, timeout=30)
        r.raise_for_status()

        content_type = r.headers.get("Content-Type", "")
        if not content_type.startswith("image/"):
            raise HTTPException(422, f"URL không phải ảnh (Content-Type: {content_type})")

        downloaded = 0
        with open(file_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                downloaded += len(chunk)
                if downloaded > _MAX_IMAGE_BYTES:
                    os.unlink(file_path)
                    raise HTTPException(422, "File ảnh quá lớn (giới hạn 50MB)")
                f.write(chunk)

        if get_entity(req.asset_id, req.project_id):
            rel_path = to_project_relative(project_root, file_path)
            updates = {"local_image_path": rel_path}
            if req.media_id:
                updates["media_id"] = req.media_id
            patch_entity(req.asset_id, req.project_id, **updates)

            # Also record this new image in the variations list
            import uuid
            variation_id = req.media_id if (req.media_id and req.media_id.strip()) else f"var_{uuid.uuid4()}"
            save_entity_variation(
                variation_id=variation_id,
                entity_id=req.asset_id,
                project_id=req.project_id,
                local_image_path=rel_path,
                media_id=req.media_id or '',
                prompt=req.prompt or '',
                name=req.name or 'Variation',
                is_official=True,
                is_reference=False
            )

        return {"status": "success", "file_path": to_project_relative(project_root, file_path), "metadata": get_all_entities(req.project_id)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/api/delete-variation")
async def api_delete_variation(req: DeleteVariationRequest):
    conn = get_conn()
    row = conn.execute(
        "SELECT local_image_path FROM entity_variations WHERE id=? AND entity_id=? AND project_id=?",
        (req.variation_id, req.asset_id, req.project_id),
    ).fetchone()
    conn.close()

    if row:
        path = row["local_image_path"]
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
        delete_entity_variation(req.variation_id, req.asset_id, req.project_id)

    return {"status": "success", "metadata": get_all_entities(req.project_id)}


@router.post("/api/update-asset")
async def api_update_asset(req: UpdateAssetRequest):
    if not get_entity(req.id, req.project_id):
        return {"status": "error"}
    patch_entity(req.id, req.project_id, **{req.field: req.value})
    return {"status": "success", "metadata": get_all_entities(req.project_id)}


@router.post("/api/set-official-variation")
async def api_set_official_variation(req: SetOfficialVariationRequest):
    conn = get_conn()
    var = conn.execute(
        "SELECT * FROM entity_variations WHERE id=? AND entity_id=? AND project_id=?",
        (req.variation_id, req.asset_id, req.project_id),
    ).fetchone()
    conn.close()

    if not var:
        return {"status": "error"}

    patch_entity(req.asset_id, req.project_id,
                 local_image_path=var["local_image_path"],
                 media_id=var["media_id"])
    return {"status": "success", "metadata": get_all_entities(req.project_id)}


@router.post("/api/toggle-reference-variation")
async def api_toggle_reference_variation(req: ToggleReferenceVariationRequest):
    conn = get_conn()
    var = conn.execute(
        "SELECT * FROM entity_variations WHERE id=? AND entity_id=? AND project_id=?",
        (req.variation_id, req.asset_id, req.project_id),
    ).fetchone()
    if not var:
        conn.close()
        return {"status": "error"}

    new_ref = 0 if var["is_reference"] else 1
    conn.execute(
        "UPDATE entity_variations SET is_reference=? WHERE id=? AND entity_id=? AND project_id=?",
        (new_ref, req.variation_id, req.asset_id, req.project_id),
    )
    conn.commit()
    conn.close()

    # Sync entity's main media_id / local_image_path to first reference variation
    refs = get_reference_variations(req.asset_id, req.project_id)
    if refs:
        patch_entity(req.asset_id, req.project_id,
                     media_id=refs[0]["media_id"],
                     local_image_path=refs[0]["local_image_path"])
    else:
        patch_entity(req.asset_id, req.project_id, media_id='', local_image_path='')

    return {"status": "success", "metadata": get_all_entities(req.project_id)}
