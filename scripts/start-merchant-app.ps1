param(
    [ValidateSet("local", "online")]
    [string]$Mode = "local",
    [ValidateSet("android", "ios")]
    [string]$Platform = "android",
    [string]$ServerBaseUrl = "http://127.0.0.1:3030",
    [string]$MerchantId = "m_my_first_store",
    [bool]$EnableEntryFlow = $true,
    [switch]$AutoStartServer,
    [switch]$NoMetro,
    [switch]$NoLaunch,
    [int]$WaitMetroSeconds = 6
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
$merchantDir = Join-Path $repoRoot "MealQuestMerchant"

if (-not (Test-Path $merchantDir)) {
    throw "Merchant app directory not found: $merchantDir"
}

$entryFlowValue = if ($EnableEntryFlow) { "true" } else { "false" }
Set-ProcessEnv -Name "MQ_ENABLE_ENTRY_FLOW" -Value $entryFlowValue
Set-ProcessEnv -Name "MQ_MERCHANT_ID" -Value $MerchantId

if ($Mode -eq "online") {
    Set-ProcessEnv -Name "MQ_USE_REMOTE_API" -Value "true"
    Set-ProcessEnv -Name "MQ_SERVER_BASE_URL" -Value $ServerBaseUrl
} else {
    Set-ProcessEnv -Name "MQ_USE_REMOTE_API" -Value "false"
    Clear-ProcessEnv -Name "MQ_SERVER_BASE_URL"
}

Write-Host "[merchant-app] mode=$Mode platform=$Platform"
Write-Host "[merchant-app] MQ_ENABLE_ENTRY_FLOW=$env:MQ_ENABLE_ENTRY_FLOW"
Write-Host "[merchant-app] MQ_USE_REMOTE_API=$env:MQ_USE_REMOTE_API"
Write-Host "[merchant-app] MQ_SERVER_BASE_URL=$env:MQ_SERVER_BASE_URL"
Write-Host "[merchant-app] MQ_MERCHANT_ID=$env:MQ_MERCHANT_ID"

if ($AutoStartServer -and $Mode -eq "online") {
    $serverScript = Join-Path $PSScriptRoot "start-server.ps1"
    if (-not (Test-Path $serverScript)) {
        throw "Server startup script not found: $serverScript"
    }
    Write-Host "[merchant-app] starting local server in a new terminal..."
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $serverScript,
        "-Profile",
        "dev"
    ) | Out-Null
    Start-Sleep -Seconds 2
}

if (-not $NoMetro) {
    $metroCommand = @"
`$env:MQ_ENABLE_ENTRY_FLOW='$env:MQ_ENABLE_ENTRY_FLOW';
`$env:MQ_USE_REMOTE_API='$env:MQ_USE_REMOTE_API';
`$env:MQ_SERVER_BASE_URL='$env:MQ_SERVER_BASE_URL';
`$env:MQ_MERCHANT_ID='$env:MQ_MERCHANT_ID';
Set-Location '$merchantDir';
npm start
"@
    Write-Host "[merchant-app] starting Metro in a new terminal..."
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $metroCommand
    ) | Out-Null
    if ($WaitMetroSeconds -gt 0) {
        Start-Sleep -Seconds $WaitMetroSeconds
    }
}

if ($NoLaunch) {
    Write-Host "[merchant-app] NoLaunch=true, skipped app install/launch."
    exit 0
}

Push-Location $merchantDir
try {
    Write-Host "[merchant-app] building + launching $Platform debug app..."
    if ($Platform -eq "android") {
        npm run android
    } else {
        npm run ios
    }
} finally {
    Pop-Location
}
