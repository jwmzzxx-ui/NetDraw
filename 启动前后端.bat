@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b %errorlevel%
)

echo Starting NetDraw backend and frontend...
echo Backend: http://127.0.0.1:3001
echo Frontend: http://127.0.0.1:5173
call npm run dev
