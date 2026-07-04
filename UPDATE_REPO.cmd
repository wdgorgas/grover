@echo off
REM == GROVER repo: recover v2 commit + reorganize by version ==
REM Run by double-clicking, or from a terminal in C:\Grover v2

cd /d "%~dp0"

echo [1/5] Making sure we are on master with a clean tree...
git checkout master
if errorlevel 1 (echo FAILED at checkout - stop and ask Claude. & pause & exit /b 1)
git checkout -- .

echo [2/5] Fast-forwarding master to the v2 workspace commit...
git merge loop/product-quality-pass-5
if errorlevel 1 (echo MERGE FAILED - stop and ask Claude. & pause & exit /b 1)
if not exist "grover_v2_handoff.md" (echo Merge did not restore v2 files - stop and ask Claude. & pause & exit /b 1)

echo [3/5] Reorganizing into version-based layout...
mkdir planning
mkdir design
move "grover_v2_handoff.md" "planning\" >nul
move "grover_v2_scope_understanding.md" "planning\" >nul
move "PLANNING_BOARD.md" "planning\" >nul
move "chatgpt_handoffs" "planning\chatgpt_handoffs" >nul
move "ART INSPIRATION" "design\ART INSPIRATION" >nul
move "GROVER command center UI design" "design\GROVER command center UI design" >nul
copy /Y "archive\grover_v1\.gitattributes" ".gitattributes" >nul

echo [4/5] Applying updated status docs...
move /Y "_v2_updates\README.md" "README.md" >nul
move /Y "_v2_updates\JACKSON_START_HERE.md" "JACKSON_START_HERE.md" >nul
move /Y "_v2_updates\GIT_SETUP.md" "GIT_SETUP.md" >nul
move /Y "_v2_updates\PLANNING_BOARD.md" "planning\PLANNING_BOARD.md" >nul
move /Y "_v2_updates\grover_v2_handoff.md" "planning\grover_v2_handoff.md" >nul
rmdir /s /q "_v2_updates"

echo [5/5] Staging everything. REVIEW THE STATUS BELOW:
git add -A
git status
echo.
echo ================================================================
echo CHECK: nothing under archive/grover_v1/data/ or vault/ or any
echo secrets.json may appear above. If clean, run:
echo.
echo   git commit -m "Reorganize repo by version; update project status"
echo   git push origin master
echo   git branch -D loop/product-quality-pass-2 loop/product-quality-pass-3 loop/product-quality-pass-4 loop/product-quality-pass-5
echo   git push origin --delete loop/product-quality-pass-2 loop/product-quality-pass-3 loop/product-quality-pass-4
echo.
echo (Ignore "not found" errors on the last line.)
echo ===============================