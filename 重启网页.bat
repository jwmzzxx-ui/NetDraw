@echo off
setlocal

cd /d "%~dp0"

set "NETDRAW_PORT=5173"

if not exist "node_modules" (
  echo [NetDraw] 正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo [NetDraw] 依赖安装失败，请检查 npm 环境。
    pause
    exit /b 1
  )
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%NETDRAW_PORT% .*LISTENING"') do (
  echo [NetDraw] 正在关闭端口 %NETDRAW_PORT% 上的旧服务 PID=%%P ...
  taskkill /PID %%P /F >nul 2>&1
)

timeout /t 1 /nobreak >nul

echo [NetDraw] 正在重启网页服务...
call npm run web:dev

if errorlevel 1 (
  echo [NetDraw] 重启失败，请检查终端输出。
  pause
  exit /b 1
)
