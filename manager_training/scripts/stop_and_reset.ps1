$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$trainingRoot = Join-Path $repoRoot 'manager_training'
$runtimeRoot = (Resolve-Path (Join-Path $env:LOCALAPPDATA 'GROVER\manager-training')).Path
$launchPath = Join-Path $runtimeRoot 'training_process.json'
$venvPython = Join-Path $runtimeRoot '.venv\Scripts\python.exe'
$runName = 'manager-v1'
$rootPid = $null
if (Test-Path -LiteralPath $launchPath) {
    $launch = Get-Content -LiteralPath $launchPath -Raw | ConvertFrom-Json
    if ($launch.run_name -and $launch.run_name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') {
        throw 'The recorded run name is invalid; refusing reset.'
    }
    if ($launch.run_name) { $runName = [string]$launch.run_name }
    if ($launch.pid) { $rootPid = [int]$launch.pid }
}

$allProcesses = @(Get-CimInstance Win32_Process)
$targetIds = [System.Collections.Generic.HashSet[int]]::new()
$escapedRunName = [regex]::Escape($runName)
$runNamePattern = '--run-name\s+["]?' + $escapedRunName + '(?:["]?\s|$)'
foreach ($process in $allProcesses) {
    if ($process.CommandLine -match 'grover_manager_training\.(pipeline|train|evaluate)' -and
        $process.CommandLine -match $runNamePattern) {
        [void]$targetIds.Add([int]$process.ProcessId)
    }
}
$recordedRoot = $allProcesses | Where-Object { $_.ProcessId -eq $rootPid } | Select-Object -First 1
if ($recordedRoot -and $recordedRoot.CommandLine -match 'grover_manager_training\.pipeline') {
    [void]$targetIds.Add([int]$recordedRoot.ProcessId)
}
$changed = $true
while ($changed) {
    $changed = $false
    foreach ($process in $allProcesses) {
        if ($targetIds.Contains([int]$process.ParentProcessId) -and $targetIds.Add([int]$process.ProcessId)) {
            $changed = $true
        }
    }
}
foreach ($processId in @($targetIds) | Sort-Object -Descending) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
foreach ($processId in $targetIds) {
    if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
        throw "Training process $processId is still active; reset was not attempted."
    }
}
$remainingManager = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match 'grover_manager_training\.(pipeline|train|evaluate)' -and $_.CommandLine -match $runNamePattern
}
if ($remainingManager) {
    throw "A $runName manager worker is still active; reset was not attempted."
}

$env:PYTHONPATH = Join-Path $trainingRoot 'src'
$env:GROVER_MANAGER_HOME = $runtimeRoot
& $venvPython -m grover_manager_training.cleanup --config (Join-Path $trainingRoot 'config\default.json') --discard-runs $runName
if ($LASTEXITCODE -ne 0) { throw 'The partial run directory could not be removed.' }
if (Test-Path -LiteralPath $launchPath) {
    $resolvedLaunch = (Resolve-Path -LiteralPath $launchPath).Path
    if (-not $resolvedLaunch.StartsWith($runtimeRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The launch record is outside the manager runtime; refusing removal.'
    }
    Remove-Item -LiteralPath $resolvedLaunch -Force
}
& $venvPython -m grover_manager_training.preflight --config (Join-Path $trainingRoot 'config\default.json') --mode train | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Reset finished, but training preflight is not green.' }
Write-Host "Stopped and reset $runName. The next start begins from step zero." -ForegroundColor Green
