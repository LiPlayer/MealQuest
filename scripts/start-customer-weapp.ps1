param(
    [ValidateSet("local", "online")]
    [string]$Mode = "local",
    [string]$ServerBaseUrl = "http://127.0.0.1:3030",
    [string]$StoreId = "m_my_first_store"
)

$ErrorActionPreference = "Stop"

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

if ($Mode -eq "online") {
    Set-ProcessEnv -Name "TARO_APP_USE_REMOTE_API" -Value "true"
    Set-ProcessEnv -Name "TARO_APP_SERVER_BASE_URL" -Value $ServerBaseUrl
    Set-ProcessEnv -Name "TARO_APP_DEFAULT_STORE_ID" -Value $StoreId
} else {
    Set-ProcessEnv -Name "TARO_APP_USE_REMOTE_API" -Value "false"
    Clear-ProcessEnv -Name "TARO_APP_SERVER_BASE_URL"
    Set-ProcessEnv -Name "TARO_APP_DEFAULT_STORE_ID" -Value $StoreId
}

Write-Host "[customer-weapp] mode=$Mode"
Write-Host "[customer-weapp] TARO_APP_USE_REMOTE_API=$env:TARO_APP_USE_REMOTE_API"
Write-Host "[customer-weapp] TARO_APP_SERVER_BASE_URL=$env:TARO_APP_SERVER_BASE_URL"
Write-Host "[customer-weapp] TARO_APP_DEFAULT_STORE_ID=$env:TARO_APP_DEFAULT_STORE_ID"

Push-Location $customerDir
try {
    Print-Command -WorkingDir $customerDir -Command "npm run dev:weapp"
    npm run dev:weapp
} finally {
    Pop-Location
}
