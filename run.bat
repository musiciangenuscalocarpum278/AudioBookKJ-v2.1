@echo off
setlocal EnableExtensions

title AudioBook KJ - One Click Setup
set "ROOT=%~dp0"
set "FRONTEND_DIR=%ROOT%frontend"
set "BACKEND_DIR=%ROOT%audiobook_builder"
set "VENV_DIR=%BACKEND_DIR%\venv"
set "BACKEND_PY=%VENV_DIR%\Scripts\python.exe"
set "PYTHON_CMD=python"
set "MISSING_REQUIRED=0"
set "NVIDIA_SMI=nvidia-smi"
set "PYTORCH_CUDA_INDEX=https://download.pytorch.org/whl/cu121"

cd /d "%ROOT%"

echo.
echo ============================================================
echo  AudioBook KJ - One Click Setup / Launcher
echo ============================================================
echo.
echo This launcher will:
echo  - Check required software
echo  - Offer to install missing software with winget
echo  - Install frontend dependencies
echo  - Create Python virtual environment
echo  - Install backend dependencies
echo  - Start backend and frontend in separate windows
echo.
echo NOTE: AI/TTS dependencies can be large and may take a long time.
echo.

call :ensure_tool git Git.Git "Git"
call :ensure_node
call :ensure_python
call :ensure_tool ffmpeg Gyan.FFmpeg "FFmpeg"

if "%MISSING_REQUIRED%"=="1" (
  echo.
  echo One or more required tools are still missing.
  echo If winget installed something, close this window, open it again,
  echo then double-click run.bat one more time.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Preparing frontend
echo ============================================================
if not exist "%FRONTEND_DIR%\package.json" (
  echo ERROR: Cannot find frontend\package.json
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%\.env" (
  echo Creating frontend\.env
  > "%FRONTEND_DIR%\.env" echo VITE_API_URL=http://localhost:8000
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo Installing frontend dependencies...
  pushd "%FRONTEND_DIR%"
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
) else (
  echo frontend\node_modules already exists. Skipping npm install.
)

echo.
echo ============================================================
echo  Preparing backend
echo ============================================================
if not exist "%BACKEND_DIR%\requirements.txt" (
  echo ERROR: Cannot find audiobook_builder\requirements.txt
  pause
  exit /b 1
)

if not exist "%BACKEND_DIR%\.env" (
  if exist "%BACKEND_DIR%\.env.sample" (
    echo Creating audiobook_builder\.env from .env.sample
    copy "%BACKEND_DIR%\.env.sample" "%BACKEND_DIR%\.env" >nul
  ) else (
    echo WARNING: audiobook_builder\.env.sample not found. Backend .env will not be created.
  )
)

call :ensure_backend_venv
if errorlevel 1 (
  pause
  exit /b 1
)

echo Upgrading pip...
"%BACKEND_PY%" -m pip install --upgrade pip
if errorlevel 1 (
  echo.
  echo WARNING: pip upgrade failed. Continuing anyway.
)

echo.
echo Backend dependencies include AI/TTS packages such as torch and OmniVoice.
echo They may download large files and can take a while.
choice /C YN /M "Install/update backend Python dependencies now"
if errorlevel 2 goto skip_backend_deps

call :install_torch_backend
if errorlevel 1 (
  echo.
  echo ERROR: PyTorch install failed.
  echo The backend may still run on a previous install, but TTS/GPU may not work.
  pause
  exit /b 1
)

"%BACKEND_PY%" -m pip install -r "%BACKEND_DIR%\requirements.txt"
if errorlevel 1 (
  echo.
  echo ERROR: Backend dependency install failed.
  echo You can still inspect the source, but the backend may not run.
  pause
  exit /b 1
)

:skip_backend_deps
if not exist "%BACKEND_DIR%\output" mkdir "%BACKEND_DIR%\output"
if not exist "%BACKEND_DIR%\outputs" mkdir "%BACKEND_DIR%\outputs"
if not exist "%BACKEND_DIR%\temp_audio" mkdir "%BACKEND_DIR%\temp_audio"
if not exist "%BACKEND_DIR%\Voice_ref" mkdir "%BACKEND_DIR%\Voice_ref"

echo.
echo ============================================================
echo  Starting app
echo ============================================================
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Two terminal windows will open. Keep them running while using the app.
echo.

start "AudioBook KJ Backend" /D "%BACKEND_DIR%" "%ComSpec%" /k ""%BACKEND_PY%" "%BACKEND_DIR%\server.py""
timeout /t 4 /nobreak >nul
start "AudioBook KJ Frontend" /D "%FRONTEND_DIR%" "%ComSpec%" /k "npm run dev -- --host 127.0.0.1"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Done. If the browser shows an error, wait a little and refresh.
echo If the backend window is downloading AI models, let it finish.
echo.
pause
exit /b 0

:ensure_tool
set "TOOL=%~1"
set "WINGET_ID=%~2"
set "LABEL=%~3"
where "%TOOL%" >nul 2>nul
if not errorlevel 1 (
  echo [OK] %LABEL% found.
  exit /b 0
)

echo [MISSING] %LABEL% was not found.
call :install_with_winget "%WINGET_ID%" "%LABEL%"
where "%TOOL%" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] %LABEL% is still missing.
  set "MISSING_REQUIRED=1"
) else (
  echo [OK] %LABEL% found after install.
)
exit /b 0

:ensure_node
where node >nul 2>nul
if errorlevel 1 (
  echo [MISSING] Node.js was not found.
  call :install_with_winget "OpenJS.NodeJS.LTS" "Node.js LTS"
) else (
  node -e "const v=process.versions.node.split('.').map(Number); process.exit(((v[0]===20&&v[1]>=19)||v[0]>=22)?0:1)" >nul 2>nul
  if errorlevel 1 (
    echo [WARNING] Node.js is installed, but this project expects Node 20.19+ or 22.12+.
    choice /C YN /M "Install/update Node.js LTS with winget"
    if not errorlevel 2 call :install_with_winget "OpenJS.NodeJS.LTS" "Node.js LTS"
  ) else (
    echo [OK] Node.js version looks good.
  )
)

where node >nul 2>nul
if errorlevel 1 set "MISSING_REQUIRED=1"
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  set "MISSING_REQUIRED=1"
) else (
  echo [OK] npm found.
)
exit /b 0

:install_torch_backend
echo.
echo ============================================================
echo  Checking PyTorch / CUDA
echo ============================================================

where nvidia-smi >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\NVIDIA Corporation\NVSMI\nvidia-smi.exe" (
    set "NVIDIA_SMI=%ProgramFiles%\NVIDIA Corporation\NVSMI\nvidia-smi.exe"
  ) else (
    set "NVIDIA_SMI="
  )
)

if not "%NVIDIA_SMI%"=="" (
  echo [OK] NVIDIA GPU tool found: %NVIDIA_SMI%
  "%NVIDIA_SMI%" --query-gpu=name,driver_version --format=csv,noheader
  echo.
  echo Installing PyTorch CUDA build from:
  echo %PYTORCH_CUDA_INDEX%
  echo.
  echo This can be several GB and may take a while.
  "%BACKEND_PY%" -m pip uninstall -y torch torchaudio torchvision
  "%BACKEND_PY%" -m pip install --upgrade torch torchaudio --index-url "%PYTORCH_CUDA_INDEX%"
  if errorlevel 1 exit /b 1
) else (
  echo [WARNING] nvidia-smi was not found. Installing CPU PyTorch build.
  echo If you have an NVIDIA GPU, install/update NVIDIA drivers and rerun this launcher.
  "%BACKEND_PY%" -m pip install --upgrade torch torchaudio
  if errorlevel 1 exit /b 1
)

echo.
echo Verifying PyTorch device support...
"%BACKEND_PY%" -c "import torch; print('torch:', torch.__version__); print('cuda available:', torch.cuda.is_available()); print('cuda version:', torch.version.cuda); print('device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU only')"
if errorlevel 1 exit /b 1
exit /b 0

:ensure_backend_venv
if exist "%BACKEND_PY%" (
  "%BACKEND_PY%" -c "import sys; print(sys.version)" >nul 2>nul
  if errorlevel 1 (
    echo.
    echo [WARNING] Existing backend venv looks broken or incompatible.
    echo It will be backed up and recreated.
    goto backup_backend_venv
  )

  "%BACKEND_PY%" -c "import sys; raise SystemExit(0 if sys.version_info[:2] in [(3,10),(3,11)] else 1)" >nul 2>nul
  if not errorlevel 1 (
    echo Python virtual environment already exists and uses a supported Python version.
    exit /b 0
  )

  echo.
  echo [WARNING] Existing backend venv uses an unsupported Python version for PyTorch CUDA.
  "%BACKEND_PY%" -c "import sys; print('Current venv Python:', sys.version)"
  echo PyTorch CUDA wheels are expected to work with Python 3.10 or 3.11 for this project.
  choice /C YN /M "Rename this venv backup and create a new Python 3.11/3.10 venv"
  if errorlevel 2 exit /b 1

  :backup_backend_venv
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $p='%VENV_DIR%'; $parent=Split-Path -Parent $p; $stamp=Get-Date -Format 'yyyyMMdd_HHmmss'; $backup=Join-Path $parent ('venv_backup_incompatible_' + $stamp); Move-Item -LiteralPath $p -Destination $backup; Split-Path -Leaf $backup"`) do set "VENV_BACKUP=%%I"
  if errorlevel 1 (
    echo ERROR: Could not rename old venv. Close terminals using it and run again.
    exit /b 1
  )
  echo Old venv renamed to audiobook_builder\%VENV_BACKUP%
)

if not exist "%VENV_DIR%" (
  echo Creating Python virtual environment with: %PYTHON_CMD%
  %PYTHON_CMD% -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo.
    echo ERROR: Could not create Python virtual environment.
    exit /b 1
  )
)
exit /b 0

:ensure_python
where py >nul 2>nul
if not errorlevel 1 (
  py -3.11 -c "import sys; print(sys.version)" >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=py -3.11"
    echo [OK] Python 3.11 found.
    exit /b 0
  )
  py -3.10 -c "import sys; print(sys.version)" >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=py -3.10"
    echo [OK] Python 3.10 found.
    exit /b 0
  )
)

where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; raise SystemExit(0 if sys.version_info[:2] in [(3,10),(3,11)] else 1)" >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=python"
    echo [OK] Python 3.10/3.11 found.
    exit /b 0
  )
  echo [WARNING] Python is installed, but it is not Python 3.10/3.11.
  python -c "import sys; print('Found Python:', sys.version)"
)

echo [MISSING] Python 3.11 or 3.10 was not found.
call :install_with_winget "Python.Python.3.11" "Python 3.11"

where py >nul 2>nul
if not errorlevel 1 (
  py -3.11 -c "import sys; print(sys.version)" >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=py -3.11"
    echo [OK] Python 3.11 found after install.
    exit /b 0
  )
)

where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; raise SystemExit(0 if sys.version_info[:2] in [(3,10),(3,11)] else 1)" >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=python"
    echo [OK] Python 3.10/3.11 found after install.
    exit /b 0
  )
)

echo [ERROR] Python 3.11/3.10 is still missing.
set "MISSING_REQUIRED=1"
exit /b 0

:install_with_winget
set "PKG=%~1"
set "NAME=%~2"
where winget >nul 2>nul
if errorlevel 1 (
  echo [ERROR] winget is not available. Please install %NAME% manually.
  set "MISSING_REQUIRED=1"
  exit /b 0
)

choice /C YN /M "Install %NAME% with winget"
if errorlevel 2 (
  set "MISSING_REQUIRED=1"
  exit /b 0
)

winget install --id "%PKG%" -e --accept-package-agreements --accept-source-agreements
exit /b 0
