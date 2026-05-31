@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo [NetDraw] 正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo [NetDraw] 依赖安装失败，请检查 npm 环境。
    pause
    exit /b 1
  )
)

echo [NetDraw] 正在启动网页...
call npm run web:dev

if errorlevel 1 (
  echo [NetDraw] 启动失败，请检查终端输出。
  pause
  exit /b 1
)
