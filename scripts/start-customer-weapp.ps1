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
    Write-Host "[RUN-$($script:RunStep)] $Command @ $WorkingDir" -ForegroundColor Cyan
}

function Print-EnvChange {
    param(
        [string]$Action,
        [string]$Name,
        [string]$Value = ""
    )
    if (-not $script:EnvStep) {
        $script:EnvStep = 0
    }
    $script:EnvStep += 1
    $upper = $Name.ToUpperInvariant()
    $masked = $upper.Contains("SECRET") -or $upper.Contains("TOKEN") -or $upper.Contains("PASSWORD")
    $displayValue = if ($masked) { "***" } else { $Value }
    if ($Action -eq "SET") {
        Write-Host "[ENV-$($script:EnvStep)] SET $Name=$displayValue" -ForegroundColor Yellow
    } else {
        Write-Host "[ENV-$($script:EnvStep)] UNSET $Name" -ForegroundColor Yellow
    }
}

function Set-ProcessEnv {
    param(
        [string]$Name,
        [string]$Value
    )
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    Print-EnvChange -Action "SET" -Name $Name -Value $Value
}

function Clear-ProcessEnv {
    param([string]$Name)
    [Environment]::SetEnvironmentVariable($Name, $null, "Process")
    Print-EnvChange -Action "UNSET" -Name $Name
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$customerDir = Join-Path $repoRoot "meal-quest-customer"

if (-not (Test-Path $customerDir)) {
    throw "Customer app directory not found: $customerDir"
}

Set-ProcessEnv -Name "MQ_SERVER_URL" -Value $ServerUrl
Set-ProcessEnv -Name "TARO_APP_SERVER_BASE_URL" -Value $ServerUrl

if ([string]::IsNullOrWhiteSpace($MerchantId)) {
    Clear-ProcessEnv -Name "MQ_MERCHANT_ID"
    Clear-ProcessEnv -Name "TARO_APP_DEFAULT_STORE_ID"
} else {
    Set-ProcessEnv -Name "MQ_MERCHANT_ID" -Value $MerchantId
    Set-ProcessEnv -Name "TARO_APP_DEFAULT_STORE_ID" -Value $MerchantId
}

Write-Host "[customer-weapp] ONLINE MODE ACTIVE" -ForegroundColor Green
Write-Host "[customer-weapp] MQ_SERVER_URL=$env:MQ_SERVER_URL"
Write-Host "[customer-weapp] MQ_MERCHANT_ID=$env:MQ_MERCHANT_ID"
if ([string]::IsNullOrWhiteSpace($MerchantId)) {
    Write-Host "[customer-weapp] store injection=off (real entry path: scan/link/history)" -ForegroundColor Yellow
} else {
    Write-Host "[customer-weapp] store injection=on ($MerchantId)" -ForegroundColor Yellow
}

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

