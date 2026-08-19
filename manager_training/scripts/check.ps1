$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'GROVER\manager-training'
$statusPath = Join-Path $runtimeRoot 'status.json'
$launchPath = Join-Path $runtimeRoot 'training_process.json'
if (-not (Test-Path -LiteralPath $statusPath)) {
    Write-Host 'No manager preparation or training status exists yet.'
    exit 1
}
$status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
$running = $false
$pidValue = $null
if (Test-Path -LiteralPath $launchPath) {
    $launch = Get-Content -LiteralPath $launchPath -Raw | ConvertFrom-Json
    $pidValue = $launch.pid
    $launchedProcess = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    $running = [bool]($launchedProcess -and $launchedProcess.ProcessName -like 'python*')
}
Write-Host "Stage: $($status.stage)"
Write-Host "State: $($status.state)"
if ($null -ne $status.progress) { Write-Host ("Progress: {0:P1}" -f [double]$status.progress) }
if ($null -ne $status.step) { Write-Host "Step: $($status.step) of $($status.max_steps)" }
Write-Host "Updated: $($status.updated_at)"
if ($pidValue -and ($running -or $status.stage -in @('training', 'evaluation', 'pipeline'))) {
    $processState = if ($running) { 'running' } else { 'not running' }
    Write-Host "Background process: $pidValue ($processState)"
}
if ($status.error) { Write-Host "Error: $($status.error)" -ForegroundColor Red }
if ($status.final_adapter) { Write-Host "Adapter: $($status.final_adapter)" }
if ($status.report) { Write-Host "Report: $($status.report)" }
