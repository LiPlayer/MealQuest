param(
    [ValidateSet("local", "online")]
    [string]$Mode = "local",
    [string]$ServerBaseUrl = "http://127.0.0.1:3030",
    [string]$StoreId = "m_my_first_store"
)

$ErrorActionPreference = "Stop"

function Set-ProcessEnv {
    param(
        [string]$Name,
        [string]$Value
    )
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Clear-ProcessEnv {
    param([string]$Name)
    [Environment]::SetEnvironmentVariable($Name, $null, "Process")
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
    npm run dev:weapp
} finally {
    Pop-Location
}
