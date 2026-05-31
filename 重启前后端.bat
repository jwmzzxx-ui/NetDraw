@echo off
setlocal
cd /d "%~dp0"

echo Stopping NetDraw ports 3001 and 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001"') do taskkill /F /PID %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173"') do taskkill /F /PID %%a >nul 2>nul

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b %errorlevel%
)

echo Restarting NetDraw backend and frontend...
echo Backend: http://127.0.0.1:3001
echo Frontend: http://127.0.0.1:5173
call npm run dev
