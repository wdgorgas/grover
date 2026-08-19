@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0manager_training\scripts\stop_and_reset.ps1"
set "groverExit=%errorlevel%"
echo.
if not "%groverExit%"=="0" echo Reset did not finish. The message above explains what needs attention.
echo Press any key to close this window.
pause >nul
exit /b %groverExit%
