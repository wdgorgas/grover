@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0manager_training\scripts\review.ps1"
set "groverExit=%errorlevel%"
echo.
if not "%groverExit%"=="0" echo The review window could not be opened. The message above explains what needs attention.
echo Press any key to close this console. The review window stays open separately.
pause >nul
exit /b %groverExit%
