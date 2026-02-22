param(
    [int]$Port = 3030
)

$ErrorActionPreference = "Stop"

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

[Environment]::SetEnvironmentVariable("HOST", "0.0.0.0", "Process")
[Environment]::SetEnvironmentVariable("PORT", "$Port", "Process")

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
    npm start
} finally {
    Pop-Location
}
