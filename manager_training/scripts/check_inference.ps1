$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'GROVER\manager-inference'
$manifestPath = Join-Path $root 'inference_manifest.json'
$sampleReport = Join-Path $root 'benchmarks\nf4-merged-q8-checkpoint-750-sample90\evaluation_test.json'
$fullReport = Join-Path $root 'benchmarks\nf4-merged-q8-checkpoint-750-full2700\evaluation_test.json'

if (-not (Test-Path -LiteralPath $manifestPath)) {
    Write-Host 'Fast inference has not been prepared yet.' -ForegroundColor Yellow
    exit 1
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
Write-Host "Runtime: $($manifest.runtime) $($manifest.runtime_version) / CUDA $($manifest.cuda_version)"
Write-Host "Model: checkpoint $($manifest.source_checkpoint), $($manifest.quantization)"
Write-Host "Promoted: $($manifest.promoted)"
if (Test-Path -LiteralPath $sampleReport) {
    $sample = Get-Content -LiteralPath $sampleReport -Raw | ConvertFrom-Json
    Write-Host ("Sample: {0}; accuracy {1:P1}; p95 {2:N3}s; authority violations {3}" -f $sample.status, $sample.metrics.route_accuracy, $sample.metrics.fast_path_latency_p95_seconds, $sample.metrics.authority_boundary_violations)
}
if (Test-Path -LiteralPath $fullReport) {
    $full = Get-Content -LiteralPath $fullReport -Raw | ConvertFrom-Json
    Write-Host ("Full held-out test: {0}; schema {1:P1}; p95 {2:N3}s; authority violations {3}" -f $full.status, $full.metrics.schema_valid_rate, $full.metrics.fast_path_latency_p95_seconds, $full.metrics.authority_boundary_violations)
} else {
    Write-Host 'Full 2,700-case held-out evaluation: not complete.' -ForegroundColor Yellow
}
