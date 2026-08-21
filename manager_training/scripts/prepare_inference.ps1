param([switch]$KeepIntermediate)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$trainingRoot = Join-Path $repoRoot 'manager_training'
$trainingRuntime = Join-Path $env:LOCALAPPDATA 'GROVER\manager-training'
$inferenceRoot = Join-Path $env:LOCALAPPDATA 'GROVER\manager-inference'
$downloads = Join-Path $inferenceRoot 'downloads'
$binaryRoot = Join-Path $inferenceRoot 'llama-b10549'
$sourceRoot = Join-Path $inferenceRoot 'llama.cpp-b10549'
$modelRoot = Join-Path $inferenceRoot 'models'
$mergedRoot = Join-Path $inferenceRoot 'merged\manager-v1-checkpoint-750-nf4-merged'
$checkpoint = Join-Path $trainingRuntime 'outputs\manager-v1\checkpoint-750'
$python = Join-Path $trainingRuntime '.venv\Scripts\python.exe'
$f16Model = Join-Path $modelRoot 'manager-v1-checkpoint-750-nf4-merged-f16.gguf'
$finalModel = Join-Path $modelRoot 'manager-v1-checkpoint-750-nf4-merged-q8.gguf'
$manifestPath = Join-Path $inferenceRoot 'inference_manifest.json'

if (-not (Test-Path -LiteralPath $python)) { throw 'Run PREPARE_MANAGER_TRAINING.cmd first.' }
if (-not (Test-Path -LiteralPath (Join-Path $checkpoint 'adapter_model.safetensors'))) {
    throw 'The complete checkpoint 750 adapter was not found.'
}
if (-not (Test-Path -LiteralPath (Join-Path $checkpoint 'trainer_state.json'))) {
    throw 'Checkpoint 750 is missing its resumable trainer state.'
}

New-Item -ItemType Directory -Force -Path $downloads, $binaryRoot, $modelRoot | Out-Null

function Get-VerifiedDownload {
    param([string]$Uri, [string]$Target, [string]$Sha256)
    if (-not (Test-Path -LiteralPath $Target)) {
        Invoke-WebRequest -Uri $Uri -OutFile $Target -UseBasicParsing
    }
    $actual = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash
    if ($actual -ne $Sha256) { throw "Checksum mismatch for $Target" }
}

$runtimeZip = Join-Path $downloads 'llama-b10549-bin-win-cuda-12.4-x64.zip'
$cudaZip = Join-Path $downloads 'cudart-llama-bin-win-cuda-12.4-x64.zip'
if (-not (Test-Path -LiteralPath (Join-Path $binaryRoot 'llama-server.exe'))) {
    Get-VerifiedDownload 'https://github.com/ggml-org/llama.cpp/releases/download/b10549/llama-b10549-bin-win-cuda-12.4-x64.zip' $runtimeZip '2E980AE28B40C92C9C30BDBCF3F28064B40104472E213C52EDBEB89B920D65FE'
    Get-VerifiedDownload 'https://github.com/ggml-org/llama.cpp/releases/download/b10549/cudart-llama-bin-win-cuda-12.4-x64.zip' $cudaZip '8C79A9B226DE4B3CACFD1F83D24F962D0773BE79F1E7B75C6AF4DED7E32AE1D6'
    Expand-Archive -LiteralPath $runtimeZip -DestinationPath $binaryRoot -Force
    Expand-Archive -LiteralPath $cudaZip -DestinationPath $binaryRoot -Force
}

if (-not (Test-Path -LiteralPath $finalModel)) {
    $sourceZip = Join-Path $downloads 'llama.cpp-b10549-source.zip'
    Get-VerifiedDownload 'https://github.com/ggml-org/llama.cpp/archive/refs/tags/b10549.zip' $sourceZip 'FD884C527123F1390F95128FED3862570CCA17ED7CB64C90F1BF26A2BC18AAA4'
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'convert_hf_to_gguf.py'))) {
        Expand-Archive -LiteralPath $sourceZip -DestinationPath $inferenceRoot -Force
    }
    & $python -m pip install --disable-pip-version-check --no-cache-dir -r (Join-Path $trainingRoot 'requirements-inference.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Inference conversion dependency setup failed.' }
    $env:GROVER_MANAGER_HOME = $trainingRuntime
    $env:PYTHONPATH = Join-Path $trainingRoot 'src'
    if (-not (Test-Path -LiteralPath (Join-Path $mergedRoot 'config.json'))) {
        & $python -m grover_manager_training.export_merged --adapter $checkpoint --output-dir $mergedRoot
        if ($LASTEXITCODE -ne 0) { throw 'The exact NF4 adapter merge failed.' }
    }
    if (-not (Test-Path -LiteralPath $f16Model)) {
        & $python (Join-Path $sourceRoot 'convert_hf_to_gguf.py') $mergedRoot --outfile $f16Model --outtype f16
        if ($LASTEXITCODE -ne 0) { throw 'Merged GGUF conversion failed.' }
    }
    & (Join-Path $binaryRoot 'llama-quantize.exe') $f16Model $finalModel Q8_0 8
    if ($LASTEXITCODE -ne 0) { throw 'Q8 model quantization failed.' }
}

$modelHash = (Get-FileHash -LiteralPath $finalModel -Algorithm SHA256).Hash
$manifest = [ordered]@{
    schema_version = '1.0'
    prepared_at = (Get-Date).ToUniversalTime().ToString('o')
    runtime = 'llama.cpp'
    runtime_version = 'b10549'
    cuda_version = '12.4'
    source_checkpoint = 750
    export_method = 'bnb_nf4_dequantize_then_peft_safe_merge'
    quantization = 'Q8_0'
    model = $finalModel
    model_sha256 = $modelHash
    context_length = 2048
    prompt_mode = 'raw_qwen3'
    promoted = $false
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8

if (-not $KeepIntermediate) {
    if (Test-Path -LiteralPath $f16Model) { Remove-Item -LiteralPath $f16Model -Force }
    if (Test-Path -LiteralPath $mergedRoot) { Remove-Item -LiteralPath $mergedRoot -Recurse -Force }
    if (Test-Path -LiteralPath $sourceRoot) { Remove-Item -LiteralPath $sourceRoot -Recurse -Force }
    if (Test-Path -LiteralPath $downloads) { Remove-Item -LiteralPath $downloads -Recurse -Force }
    $q4Experiment = Join-Path $inferenceRoot 'q4-experiment'
    if (Test-Path -LiteralPath $q4Experiment) {
        $resolvedInferenceRoot = (Resolve-Path -LiteralPath $inferenceRoot).Path
        $resolvedQ4Experiment = (Resolve-Path -LiteralPath $q4Experiment).Path
        if (-not $resolvedQ4Experiment.StartsWith($resolvedInferenceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing Q4 experiment cleanup outside the inference runtime.'
        }
        Remove-Item -LiteralPath $resolvedQ4Experiment -Recurse -Force
    }
    $rejectedBenchmarks = @(
        'q8-checkpoint-600-raw-sample90',
        'q8-checkpoint-750-raw-sample90',
        'q8-checkpoint-750-sample90',
        'nf4-merged-q4-checkpoint-750-sample90',
        'nf4-merged-q8-checkpoint-750-full2700-shard0',
        'nf4-merged-q8-checkpoint-750-full2700-shard1',
        'nf4-merged-q8-checkpoint-750-full2700-shard2',
        'nf4-merged-q8-checkpoint-750-full2700-shard3'
    )
    $benchmarkRoot = Join-Path $inferenceRoot 'benchmarks'
    if (Test-Path -LiteralPath $benchmarkRoot) {
        $resolvedBenchmarkRoot = (Resolve-Path -LiteralPath $benchmarkRoot).Path
        foreach ($name in $rejectedBenchmarks) {
            $candidate = Join-Path $resolvedBenchmarkRoot $name
            if (Test-Path -LiteralPath $candidate) {
                $resolvedCandidate = (Resolve-Path -LiteralPath $candidate).Path
                if (-not $resolvedCandidate.StartsWith($resolvedBenchmarkRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                    throw 'Refusing cleanup outside the inference benchmark root.'
                }
                Remove-Item -LiteralPath $resolvedCandidate -Recurse -Force
            }
        }
    }
    $obsoleteModels = @(
        'manager-v1-checkpoint-600-lora-f16.gguf',
        'manager-v1-checkpoint-750-lora-f16.gguf',
        'manager-v1-checkpoint-750-nf4-merged-f16-v2.gguf',
        'Qwen3-1.7B-Q8_0.gguf'
    )
    $resolvedModelRoot = (Resolve-Path -LiteralPath $modelRoot).Path
    foreach ($name in $obsoleteModels) {
        $candidate = Join-Path $resolvedModelRoot $name
        if (Test-Path -LiteralPath $candidate) {
            $resolvedCandidate = (Resolve-Path -LiteralPath $candidate).Path
            if (-not $resolvedCandidate.StartsWith($resolvedModelRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw 'Refusing cleanup outside the inference model root.'
            }
            Remove-Item -LiteralPath $resolvedCandidate -Force
        }
    }
}

Write-Host 'GROVER Manager fast-inference preparation is complete.' -ForegroundColor Green
Write-Host "Model: $finalModel"
Write-Host "SHA-256: $modelHash"
Write-Host 'The model remains shadow-only until the complete evaluation passes.'
