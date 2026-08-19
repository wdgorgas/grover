param([switch]$SkipModelDownload)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$trainingRoot = Join-Path $repoRoot 'manager_training'
$configPath = Join-Path $trainingRoot 'config\default.json'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'GROVER\manager-training'
$venvRoot = Join-Path $runtimeRoot '.venv'
$venvPython = Join-Path $venvRoot 'Scripts\python.exe'

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
if (-not (Test-Path -LiteralPath $venvPython)) {
    $systemPython = (Get-Command python -ErrorAction Stop).Source
    $pythonVersion = (& $systemPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Trim()
    if ($pythonVersion -ne '3.12') { throw "Python 3.12 is required; found Python $pythonVersion." }
    & $systemPython -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated Python environment.' }
}

$torchRequirements = Join-Path $trainingRoot 'requirements-torch.txt'
$appRequirements = Join-Path $trainingRoot 'requirements.txt'
$lockMaterial = (Get-FileHash -Algorithm SHA256 $torchRequirements).Hash + (Get-FileHash -Algorithm SHA256 $appRequirements).Hash
$lockPath = Join-Path $venvRoot 'grover-requirements.sha256'
$installedLock = if (Test-Path -LiteralPath $lockPath) { (Get-Content -LiteralPath $lockPath -Raw).Trim() } else { '' }
if ($installedLock -ne $lockMaterial) {
    & $venvPython -m pip install --disable-pip-version-check --no-cache-dir -r $torchRequirements
    if ($LASTEXITCODE -ne 0) { throw 'PyTorch installation failed.' }
    & $venvPython -m pip install --disable-pip-version-check --no-cache-dir -r $appRequirements
    if ($LASTEXITCODE -ne 0) { throw 'Manager dependency installation failed.' }
    Set-Content -LiteralPath $lockPath -Value $lockMaterial -Encoding ascii
}

$env:PYTHONPATH = Join-Path $trainingRoot 'src'
$env:GROVER_MANAGER_HOME = $runtimeRoot
$arguments = @(
    '-m', 'grover_manager_training.pipeline', 'prepare',
    '--config', $configPath,
    '--training-root', $trainingRoot
)
if ($SkipModelDownload) { $arguments += '--skip-download' }
& $venvPython @arguments
if ($LASTEXITCODE -ne 0) { throw 'Manager preparation did not complete.' }
Write-Host ''
Write-Host 'GROVER Manager preparation is complete.' -ForegroundColor Green
Write-Host "Runtime: $runtimeRoot"
