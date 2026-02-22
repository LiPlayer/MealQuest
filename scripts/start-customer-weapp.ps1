param(
    [string]$ServerUrl = "http://127.0.0.1:3030",
    [string]$MerchantId = ""
)

$ErrorActionPreference = "Stop"
$trackedProcesses = @()

function Stop-ProcessTree {
    param([int]$TargetProcessId)
    if ($TargetProcessId -le 0) { return }
    & taskkill /PID $TargetProcessId /T /F *> $null
    if ($LASTEXITCODE -ne 0) {
        Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
    }
}



function Print-Command {
    param(
        [string]$WorkingDir,
        [string]$Command
    )
    if (-not $script:RunStep) {
        $script:RunStep = 0
    }
    $script:RunStep += 1
    Write-Host ">>> [STEP-$($script:RunStep)] $Command @ $WorkingDir" -ForegroundColor Red
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$customerDir = Join-Path $repoRoot "meal-quest-customer"

if (-not (Test-Path $customerDir)) {
    throw "Customer app directory not found: $customerDir"
}

    Write-Host "[customer-weapp] CONFIG MANAGED BY: meal-quest-customer/.env.development" -ForegroundColor Green
    Write-Host "[customer-weapp] ONLINE MODE ACTIVE" -ForegroundColor Green

try {
    Push-Location $customerDir
    Print-Command -WorkingDir $customerDir -Command "npm run dev:weapp"
    $customerProcess = Start-Process cmd -ArgumentList "/c npm run dev:weapp" -NoNewWindow -PassThru
    $trackedProcesses += $customerProcess



    if ($trackedProcesses.Count -gt 0) {
        Write-Host ""
        Write-Host "[customer-weapp] Taroserv is running (PID $($customerProcess.Id))." -ForegroundColor Cyan
        Write-Host "[customer-weapp] SCRIPT IS ACTIVE. Press Ctrl+C to kill process and exit." -ForegroundColor Yellow
        
        while ($true) {
            $running = $trackedProcesses | Where-Object { -not $_.HasExited }
            if (-not $running) {
                Write-Host "[customer-weapp] Customer process has exited."
                break
            }
            Start-Sleep -Seconds 2
        }
    }
} finally {
    if ($trackedProcesses.Count -gt 0) {
        Write-Host "[customer-weapp] cleaning up processes..." -ForegroundColor Yellow
        foreach ($p in $trackedProcesses) {
            if (-not $p.HasExited) {
                Write-Host "[customer-weapp] killing process tree for PID $($p.Id)..."
                Stop-ProcessTree -TargetProcessId $p.Id
            }
        }
    }
    Pop-Location
}

