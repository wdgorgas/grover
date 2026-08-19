@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0manager_training\scripts\start.ps1"
if errorlevel 1 exit /b %errorlevel%
