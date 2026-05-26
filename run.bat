@echo off
title Audiobook Factory Studio - Launcher
chcp 65001 > nul
set PYTHONIOENCODING=utf-8
cls

echo ======================================================================
echo       AUDIOBOOK FACTORY STUDIO - HIGH-FIDELITY ORCHESTRATOR
echo ======================================================================
echo  Cinematic Audio-Video automated launcher for Audiobook-KJ
echo ======================================================================
echo.

:: 1. Verify Python Installation
echo [SYSTEM] Checking Python installation...
set "PYTHON_EXE="
if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe"
    echo [SYSTEM] Found local stable Python 3.12 at %USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe
) else if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python310\python.exe" (
    set "PYTHON_EXE=%USERPROFILE%\AppData\Local\Programs\Python\Python310\python.exe"
    echo [SYSTEM] Found local stable Python 3.10 at %USERPROFILE%\AppData\Local\Programs\Python\Python310\python.exe
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_EXE=python"
        echo [SYSTEM] Using default system Python.
    )
)

if not defined PYTHON_EXE (
    echo [ERROR] Python was not found on your system!
    echo Please install Python 3.10 or 3.12 and ensure it is available in your PATH.
    echo Cài đặt Python 3.10 hoặc 3.12 vào máy và tick chọn "Add to PATH" nhé.
    pause
    exit /b 1
)

:: 2. Verify Node.js Installation
echo [SYSTEM] Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found in your system PATH!
    echo Please install Node.js v18+ to run the React developer interface.
    pause
    exit /b 1
)

:: 3. Setup Python Virtual Environment (venv)
echo.
echo [VENV] Checking Python virtual environment...
if not exist "audiobook_builder\venv" (
    echo [VENV] Virtual environment not found. Creating new virtual environment at audiobook_builder\venv...
    "%PYTHON_EXE%" -m venv audiobook_builder\venv
)

echo [VENV] Activating virtual environment...
call audiobook_builder\venv\Scripts\activate.bat

echo [VENV] Upgrading package manager (pip)...
python -m pip install --upgrade pip

echo [VENV] Ensuring backend dependencies are installed...
pip install -r audiobook_builder/requirements.txt

:: 4. Verify Frontend Node Modules
echo.
echo [FRONTEND] Checking React frontend modules...
if not exist "frontend\node_modules" (
    echo [FRONTEND] node_modules not found. Installing node packages...
    cd frontend
    call npm install --legacy-peer-deps
    cd ..
) else (
    echo [FRONTEND] Node packages are already installed.
)

:: 5. Launch Orchestrator
echo.
echo ======================================================================
echo  AUDIOBOOK FACTORY STUDIO IS READY TO LAUNCH!
echo ======================================================================
echo  * Frontend: http://localhost:5173 (Vite Hot-Reload)
echo  * Backend API: http://localhost:8000 (FastAPI Uvicorn)
echo ======================================================================
echo.

:: Open frontend browser tab automatically
start "" "http://localhost:5173"

:: Start Frontend dev server in a new parallel CMD window
echo [LAUNCH] Starting Frontend in parallel terminal...
start "Audiobook Studio - Frontend" cmd /k "cd frontend && npm run dev"

:: Run Backend server in the current CMD window
echo [LAUNCH] Starting Backend API Server...
cd audiobook_builder
python server.py

pause
