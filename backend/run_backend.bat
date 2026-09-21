@echo off
setlocal
cd /d "%~dp0\.."

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found in PATH.
  pause
  exit /b 1
)

python -m pip install -r backend\requirements.txt
if errorlevel 1 (
  echo Failed to install HelpDesk Pro dependencies.
  pause
  exit /b 1
)

echo.
echo Starting HelpDesk Pro...
echo Open http://127.0.0.1:8790
echo.
python backend\helpdesk_api.py
pause
