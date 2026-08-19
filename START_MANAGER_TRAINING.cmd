@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0manager_training\scripts\start.ps1"
set "groverExit=%errorlevel%"
echo.
if not "%groverExit%"=="0" echo Training was not started. The message above explains what needs attention.
echo Press any key to close this window. Training will continue in the background.
pause >nul
exit /b %groverExit%
