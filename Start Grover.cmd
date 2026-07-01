@echo off
title GROVER
cd /d "%~dp0"
node grover.mjs
if errorlevel 1 (
  echo.
  echo GROVER exited with an error. See the message above.
  pause
)
