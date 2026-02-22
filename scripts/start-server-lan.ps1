param(
    [int]$Port = 3030
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
    Write-Host "[lan-server] Customer/Merchant MQ_SERVER_URL example: http://$($ips[0]):$Port"
} else {
    Write-Host "[lan-server] No LAN IPv4 detected automatically. Please run ipconfig and use your Wi-Fi IPv4."
}

Write-Host "[lan-server] Starting MealQuestServer..."
try {
    Push-Location $serverDir
    Print-Command -WorkingDir $serverDir -Command "npm start"
    $serverProcess = Start-Process cmd -ArgumentList "/c npm start" -NoNewWindow -PassThru
    $trackedProcesses += $serverProcess



    if ($trackedProcesses.Count -gt 0) {
        Write-Host ""
        Write-Host "[lan-server] Server is running (PID $($serverProcess.Id))." -ForegroundColor Cyan
        Write-Host "[lan-server] SCRIPT IS ACTIVE. Press Ctrl+C to kill server and exit." -ForegroundColor Yellow
        
        while ($true) {
            $running = $trackedProcesses | Where-Object { -not $_.HasExited }
            if (-not $running) {
                Write-Host "[lan-server] Server process has exited."
                break
            }
            Start-Sleep -Seconds 2
        }
    }
} finally {
    if ($trackedProcesses.Count -gt 0) {
        Write-Host "[lan-server] cleaning up processes..." -ForegroundColor Yellow
        foreach ($p in $trackedProcesses) {
            if (-not $p.HasExited) {
                Write-Host "[lan-server] killing process tree for PID $($p.Id)..."
                Stop-ProcessTree -TargetProcessId $p.Id
            }
        }
    }
    Pop-Location
}

