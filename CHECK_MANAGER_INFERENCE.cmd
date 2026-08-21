@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0manager_training\scripts\check_inference.ps1"
set "groverExit=%errorlevel%"
echo.
echo Press any key to close this window.
pause >nul
exit /b %groverExit%
