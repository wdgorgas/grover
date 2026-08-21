@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0manager_training\scripts\prepare_inference.ps1"
set "groverExit=%errorlevel%"
echo.
if not "%groverExit%"=="0" echo Fast-inference preparation did not complete. The message above explains what needs attention.
echo Press any key to close this window.
pause >nul
exit /b %groverExit%
