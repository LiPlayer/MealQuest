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
    Write-Host (">>> [STEP-{0}] {1}" -f $script:RunStep, $Command) -ForegroundColor Red
    Write-Host ("    @ {0}" -f $WorkingDir) -ForegroundColor DarkGray
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$serverDir = Join-Path $repoRoot "MealQuestServer"

Write-Host "[lan-server] CONFIG MANAGED BY: MealQuestServer/.env" -ForegroundColor Green
Write-Host "[lan-server] PORT=$Port" -ForegroundColor Green

$ips = Get-LanIpv4Candidates
if ($ips.Count -gt 0) {
    Write-Host "[lan-server] LAN IP candidates:"
    $ips | ForEach-Object { Write-Host "  - $_" }
    Write-Host "[lan-server] Customer/Merchant MQ_SERVER_URL example: http://$($ips[0]):<PORT>"
} else {
    Write-Host "[lan-server] No LAN IPv4 detected automatically. Please run ipconfig and use your Wi-Fi IPv4."
}

Write-Host "[lan-server] Starting MealQuestServer..."
try {
    Push-Location $serverDir
    [Environment]::SetEnvironmentVariable("PORT", [string]$Port, "Process")
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

