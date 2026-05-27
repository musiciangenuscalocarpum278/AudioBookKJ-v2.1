# --- Fix for Windows ConnectionResetError in asyncio ---
import sys
if sys.platform == "win32":
    import asyncio
    from functools import wraps
    try:
        from asyncio.proactor_events import _ProactorBasePipeTransport
        _orig = _ProactorBasePipeTransport._call_connection_lost

        @wraps(_orig)
        def _silence(self, *args, **kwargs):
            try:
                return _orig(self, *args, **kwargs)
            except (ConnectionResetError, RuntimeError):
                pass

        _ProactorBasePipeTransport._call_connection_lost = _silence
    except ImportError:
        pass
# -------------------------------------------------------

# Load .env before any module that reads environment variables
import os
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

import asyncio
import time
import traceback
from contextlib import asynccontextmanager
from starlette.requests import Request
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import init_db
from routers import audio, video, script, assets, export, project, flowkit, migration, playground, diagnostics


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    print("Khởi chạy hệ thống Background Job Polling cho FlowKit...")
    asyncio.create_task(flowkit.poll_jobs_loop())
    yield


app = FastAPI(title="Audiobook Factory Studio API", lifespan=lifespan)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    print(f"[Server] Unhandled exception on {request.method} {request.url.path}: {exc}", flush=True)
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    print(f"[HTTP] --> {request.method} {request.url.path}", flush=True)
    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started) * 1000
        print(
            f"[HTTP] !! {request.method} {request.url.path} failed after {elapsed_ms:.1f}ms: {exc}",
            flush=True,
        )
        traceback.print_exc()
        raise

    elapsed_ms = (time.perf_counter() - started) * 1000
    print(
        f"[HTTP] <-- {request.method} {request.url.path} {response.status_code} {elapsed_ms:.1f}ms",
        flush=True,
    )
    return response


DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
    "chrome-extension://afbgooleplghmdlphioflcbnpccggodb",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audio.router)
app.include_router(video.router)
app.include_router(script.router)
app.include_router(assets.router)
app.include_router(export.router)
app.include_router(project.router)
app.include_router(flowkit.router)
app.include_router(migration.router)
app.include_router(playground.router)
app.include_router(diagnostics.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, ws_max_size=1024 * 1024 * 50)
