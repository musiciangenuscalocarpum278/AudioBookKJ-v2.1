import asyncio
import json
import uuid
import time
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

from database import add_job

class FlowService:
    def __init__(self):
        self.active_ws = None
        self.flow_key = None
        self.pending_requests = {}
        self._dotenv_loaded = False

    def resolve_request(self, data):
        req_id = data.get("id")
        if req_id and req_id in self.pending_requests:
            if not self.pending_requests[req_id].done():
                self.pending_requests[req_id].set_result(data)
                
    async def _send(self, method, params, timeout=180):
        if not self.active_ws:
            return {"error": "Extension not connected via WS"}
            
        req_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending_requests[req_id] = future
        
        payload = {
            "id": req_id,
            "method": method,
            "params": params
        }
        
        try:
            await self.active_ws.send_json(payload)
            result = await asyncio.wait_for(future, timeout)
            return result
        except RuntimeError as e:
            if "Cannot call" in str(e) or "send" in str(e):
                self.active_ws = None
                return {"error": "Extension disconnected. Please refresh Chrome Extension."}
            return {"error": str(e)}
        except asyncio.TimeoutError:
            return {"error": "Timeout"}
        except Exception as e:
            return {"error": str(e)}
        finally:
            self.pending_requests.pop(req_id, None)

    def _get_api_key(self):
        key = (os.environ.get("GOOGLE_API_KEY") or "").strip()
        if key:
            return key

        if not self._dotenv_loaded:
            env_path = Path(__file__).resolve().parent / ".env"

            # Preferred path: python-dotenv if available.
            if load_dotenv is not None:
                load_dotenv(env_path, override=False)
                key = (os.environ.get("GOOGLE_API_KEY") or "").strip()
                if key:
                    self._dotenv_loaded = True
                    return key

            # Hard fallback: parse .env manually so API key still works without python-dotenv.
            if env_path.exists():
                try:
                    for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                        raw = line.strip()
                        if not raw or raw.startswith("#") or "=" not in raw:
                            continue
                        k, v = raw.split("=", 1)
                        if k.strip() == "GOOGLE_API_KEY":
                            parsed = v.strip().strip('"').strip("'")
                            if parsed:
                                os.environ["GOOGLE_API_KEY"] = parsed
                                self._dotenv_loaded = True
                                return parsed
                except Exception:
                    pass

        return ""

    def _build_url(self, path):
        base = "https://aisandbox-pa.googleapis.com"
        key = self._get_api_key()
        if not key:
            raise RuntimeError("GOOGLE_API_KEY not set — add it to audiobook_builder/.env")
        sep = "&" if "?" in path else "?"
        return f"{base}{path}{sep}key={key}"

    def _client_context(self, project_id):
        return {
            "projectId": project_id,
            "recaptchaContext": {
                "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
                "token": "",
            },
            "sessionId": f";{int(time.time() * 1000)}",
            "tool": "PINHOLE",
            "userPaygateTier": "PAYGATE_TIER_TWO"
        }

    async def upload_image(self, image_base64: str, project_id: str = ""):
        # Xoá phần đầu của base64 nếu có (ví dụ: data:image/jpeg;base64,...)
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]
            
        body = {
            "clientContext": self._client_context(project_id),
            "fileName": "reference.jpg",
            "imageBytes": image_base64,
            "isHidden": False,
            "isUserUploaded": True,
            "mimeType": "image/jpeg",
        }
        url = self._build_url("/v1/flow/uploadImage")
        
        res = await self._send("api_request", {
            "url": url,
            "method": "POST",
            "headers": {"content-type": "application/json"},
            "body": body,
            "captchaAction": "IMAGE_GENERATION"
        })
        
        if res.get("status") == 200:
            data = res.get("data", {})
            media_id = data.get("media", {}).get("name")
            print(f"[Flow Service] Upload ảnh thành công, media_id: {media_id}")
            return {"success": True, "media_id": media_id}
            
        print(f"[Flow Service] Lỗi khi upload ảnh: {res}")
        return {"success": False, "error": res}


    async def request_scene_frame(self, prompt: str, project_id: str, reference_media_ids: list = None, aspect_ratio: str = "16:9"):
        """Generate an image (synchronous) returning url directly."""
        import uuid, time
        aspect_ratio_api = "IMAGE_ASPECT_RATIO_LANDSCAPE" if aspect_ratio == "16:9" else "IMAGE_ASPECT_RATIO_PORTRAIT"
        request_item = {
            "clientContext": {**self._client_context(project_id), "sessionId": f";{int(time.time()*1000)}"},
            "seed": int(time.time()) % 10000,
            "structuredPrompt": {"parts": [{"text": prompt}]},
            "imageAspectRatio": aspect_ratio_api,
            "imageModelName": "GEM_PIX_2"
        }
        
        if reference_media_ids:
            request_item["imageInputs"] = [
                {"name": mid, "imageInputType": "IMAGE_INPUT_TYPE_REFERENCE"}
                for mid in reference_media_ids
            ]
            
        body = {
            "clientContext": self._client_context(project_id),
            "mediaGenerationContext": {"batchId": str(uuid.uuid4())},
            "useNewMedia": True,
            "requests": [request_item],
        }
        
        url = self._build_url(f"/v1/projects/{project_id}/flowMedia:batchGenerateImages")
        
        res = await self._send("api_request", {
            "url": url,
            "method": "POST",
            "headers": {"content-type": "application/json"},
            "body": body,
            "captchaAction": "IMAGE_GENERATION"
        })
        
        if res.get("status") == 200:
            data = res.get("data", {})
            media = data.get("media", [])
            if media:
                media_id = media[0].get("name")
                image_obj = media[0].get("image", {})
                gen_image = image_obj.get("generatedImage", {})
                if not gen_image and media[0].get("video"):
                    gen_image = media[0]["video"].get("generatedImage", {})
                fife_url = gen_image.get("fifeUrl")
                if fife_url:
                    return {"success": True, "media_id": media_id, "url": fife_url}
        return {"success": False, "error": res}

    async def request_scene_video(self, prompt: str, project_id: str, scene_id: str, start_image_media_id: str = None, reference_media_ids: list = None, aspect_ratio: str = "16:9", duration_seconds: int = 8):
        aspect_ratio_api = "VIDEO_ASPECT_RATIO_LANDSCAPE" if aspect_ratio == "16:9" else "VIDEO_ASPECT_RATIO_PORTRAIT"
        
        model_type = "i2v" if start_image_media_id else "t2v"
        model_key = f"veo_3_1_{model_type}_lite_low_priority"
            
        request_item = {
            "aspectRatio": aspect_ratio_api,
            "seed": int(time.time()) % 10000,
            "textInput": {"structuredPrompt": {"parts": [{"text": prompt}]}},
            "videoModelKey": model_key,
            "metadata": {"sceneId": scene_id},
        }
        
        if start_image_media_id:
            request_item["startImage"] = {"mediaId": start_image_media_id}
            
        # Note: Veo video generation API currently does not support 'imageInputs' 
        # (it only supports 'startImage'). Character consistency is maintained via 
        # the text prompt descriptions and the start_image_media_id.
        body = {
            "mediaGenerationContext": {"batchId": str(uuid.uuid4())},
            "clientContext": self._client_context(project_id),
            "requests": [request_item],
            "useV2ModelConfig": True,
        }
        
        if start_image_media_id:
            path = "/v1/video:batchAsyncGenerateVideoStartImage"
        else:
            # Fallback for text to video (without start image)
            path = "/v1/video:batchAsyncGenerateVideo"
            
        url = self._build_url(path)
        
        res = await self._send("api_request", {
            "url": url,
            "method": "POST",
            "headers": {"content-type": "application/json"},
            "body": body,
            "captchaAction": "VIDEO_GENERATION"
        })
        
        if res.get("status") == 200:
            data = res.get("data", {})
            out = {"success": True}
            operations = data.get("operations", [])
            if operations and len(operations) > 0:
                out["operation_name"] = operations[0].get("name")
            else:
                workflows = data.get("workflows", [])
                if workflows and len(workflows) > 0:
                    out["operation_name"] = workflows[0].get("name")
                    out["primary_media_id"] = workflows[0].get("metadata", {}).get("primaryMediaId")
            
            if "operation_name" in out:
                job_id = str(uuid.uuid4())
                add_job(job_id, "video", prompt, out["operation_name"], out.get("primary_media_id"))
                out["job_id"] = job_id
            return out
        return {"success": False, "error": res}

    async def check_media_status(self, media_id: str):
        url = self._build_url(f"/v1/media/{media_id}?clientContext.tool=PINHOLE")
        res = await self._send("api_request", {
            "url": url,
            "method": "GET",
            "headers": {"content-type": "application/json"},
            "body": None
        })
        return res

    async def check_video_status(self, operations: list):
        op = operations[0]
        # Fallback to check_media_status since batch status endpoints are deprecated
        return await self.check_media_status(op)

flow_service = FlowService()