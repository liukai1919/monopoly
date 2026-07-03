@echo off
chcp 65001 >nul
title 大富翁 · 加拿大版 服务器
cd /d %~dp0

where node >nul 2>nul
if errorlevel 1 (
  echo [!] 没有找到 Node.js, 请先安装: https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo 首次运行, 正在安装依赖...
  call npm install --no-audit --no-fund
)

if not exist client\dist (
  echo 正在构建前端页面...
  call npm run build
)

echo.
echo ============================================
echo   服务器启动中...
echo   大屏/电视: 浏览器打开 http://localhost:3000
echo   手机: 连同一个 Wi-Fi, 扫大屏上的二维码
echo   停止服务器: 按 Ctrl+C 或直接关掉本窗口
echo ============================================
echo.
start "" http://localhost:3000
call npm run start
