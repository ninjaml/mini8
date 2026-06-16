@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "start.ps1" %*
if errorlevel 1 (
    echo.
    echo 启动失败，按任意键退出...
    pause >nul
)
