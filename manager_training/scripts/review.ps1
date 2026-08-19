$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$trainingRoot = Join-Path $repoRoot 'manager_training'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'GROVER\manager-training'
$venvPython = Join-Path $runtimeRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) { throw 'Run PREPARE_MANAGER_TRAINING.cmd first.' }
$env:PYTHONPATH = Join-Path $trainingRoot 'src'
$env:GROVER_MANAGER_HOME = $runtimeRoot
Start-Process -FilePath $venvPython -ArgumentList @(
    '-m', 'grover_manager_training.review_cases',
    '--config', ('"' + (Join-Path $trainingRoot 'config\default.json') + '"')
)
