param(
    [int]$Port = 3030
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
    Write-Host ""
    Write-Host "==================== [RUN-$($script:RunStep)] ====================" -ForegroundColor Cyan
    Write-Host ">>> CMD: $Command" -ForegroundColor Cyan
    Write-Host ">>> CWD: $WorkingDir" -ForegroundColor DarkCyan
    Write-Host "==================================================================" -ForegroundColor Cyan
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
    Write-Host ""
    Write-Host "==================== [ENV-$($script:EnvStep)] ====================" -ForegroundColor Yellow
    Write-Host ">>> ACT: $Action" -ForegroundColor Yellow
    Write-Host ">>> KEY: $Name" -ForegroundColor Yellow
    if ($Action -eq "SET") {
        Write-Host ">>> VAL: $displayValue" -ForegroundColor DarkYellow
    }
    Write-Host "==================================================================" -ForegroundColor Yellow
}

function Set-ProcessEnv {
    param(
        [string]$Name,
        [string]$Value
    )
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    Print-EnvChange -Action "SET" -Name $Name -Value $Value
}

function Get-LanIpv4Candidates {
    $candidates = @()
    try {
        $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -ne "127.0.0.1" -and
                $_.PrefixOrigin -ne "WellKnown" -and
                $_.IPAddress -notlike "169.254.*"
            } |
            Select-Object -ExpandProperty IPAddress -Unique
    } catch {
        $candidates = @()
    }
    return $candidates
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$serverDir = Join-Path $repoRoot "MealQuestServer"

Set-ProcessEnv -Name "HOST" -Value "0.0.0.0"
Set-ProcessEnv -Name "PORT" -Value "$Port"

$ips = Get-LanIpv4Candidates
Write-Host "[lan-server] HOST=$env:HOST PORT=$env:PORT"
if ($ips.Count -gt 0) {
    Write-Host "[lan-server] LAN IP candidates:"
    $ips | ForEach-Object { Write-Host "  - $_" }
    Write-Host "[lan-server] Customer/Merchant base URL example: http://$($ips[0]):$Port"
} else {
    Write-Host "[lan-server] No LAN IPv4 detected automatically. Please run ipconfig and use your Wi-Fi IPv4."
}

Write-Host "[lan-server] Starting MealQuestServer..."
Push-Location $serverDir
try {
    Print-Command -WorkingDir $serverDir -Command "npm start"
    npm start
} finally {
    Pop-Location
}
