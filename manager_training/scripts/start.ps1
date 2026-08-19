param(
    [string]$RunName = 'manager-v1',
    [int]$MaxSteps = 0,
    [int]$MaxTrainSamples = 0,
    [int]$MaxEvalSamples = 0,
    [switch]$SkipEvaluation
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$trainingRoot = Join-Path $repoRoot 'manager_training'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'GROVER\manager-training'
$venvPython = Join-Path $runtimeRoot '.venv\Scripts\python.exe'
$launchPath = Join-Path $runtimeRoot 'training_process.json'
if (-not (Test-Path -LiteralPath $venvPython)) { throw 'Run PREPARE_MANAGER_TRAINING.cmd first.' }
if ($RunName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') { throw 'RunName contains unsupported path characters.' }
if (Test-Path -LiteralPath $launchPath) {
    $prior = Get-Content -LiteralPath $launchPath -Raw | ConvertFrom-Json
    $priorProcess = if ($prior.pid) { Get-Process -Id $prior.pid -ErrorAction SilentlyContinue } else { $null }
    if ($priorProcess -and $priorProcess.ProcessName -like 'python*') {
        throw "Manager training is already running as process $($prior.pid)."
    }
}

$logs = Join-Path $runtimeRoot 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdout = Join-Path $logs "$RunName-$stamp.out.log"
$stderr = Join-Path $logs "$RunName-$stamp.err.log"
$env:PYTHONPATH = Join-Path $trainingRoot 'src'
$env:GROVER_MANAGER_HOME = $runtimeRoot
$processArguments = @(
    '-m', 'grover_manager_training.pipeline', 'start',
    '--config', ('"' + (Join-Path $trainingRoot 'config\default.json') + '"'),
    '--training-root', ('"' + $trainingRoot + '"'),
    '--run-name', $RunName
)
if ($MaxSteps -gt 0) { $processArguments += @('--max-steps', "$MaxSteps") }
if ($MaxTrainSamples -gt 0) { $processArguments += @('--max-train-samples', "$MaxTrainSamples") }
if ($MaxEvalSamples -gt 0) { $processArguments += @('--max-eval-samples', "$MaxEvalSamples") }
if ($SkipEvaluation) { $processArguments += '--skip-evaluation' }

$process = Start-Process -FilePath $venvPython -ArgumentList $processArguments -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
$record = [ordered]@{
    pid = $process.Id
    run_name = $RunName
    started_at = (Get-Date).ToUniversalTime().ToString('o')
    stdout = $stdout
    stderr = $stderr
}
$record | ConvertTo-Json | Set-Content -LiteralPath $launchPath -Encoding utf8
Write-Host "GROVER Manager training started in the background (process $($process.Id))." -ForegroundColor Green
Write-Host 'You can close Codex and this window. Run CHECK_MANAGER_TRAINING.cmd for progress.'
