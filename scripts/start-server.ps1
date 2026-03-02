param(
    [ValidateSet("dev", "staging", "prod")]
    [string]$Profile = "dev",
    [string]$EnvFile = ""
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
    Write-Host ""
    Write-Host (">>> [STEP-{0}] {1}" -f $script:RunStep, $Command) -ForegroundColor Red
    Write-Host ("    @ {0}" -f $WorkingDir) -ForegroundColor DarkGray
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

function Import-EnvFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Env file not found: $Path"
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) {
            return
        }
        $parts = $line.Split("=", 2)
        if ($parts.Length -ne 2) {
            return
        }
        $name = $parts[0].Trim()
        $value = $parts[1]
        Set-ProcessEnv -Name $name -Value $value
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$serverDir = Join-Path $repoRoot "MealQuestServer"

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $localFile = Join-Path $serverDir ".env.$Profile.local"
    $exampleFile = Join-Path $serverDir ".env.$Profile.example"
    if (Test-Path $localFile) {
        $EnvFile = $localFile
    } else {
        $EnvFile = $exampleFile
    }
}

Write-Host "[start-server] profile=$Profile"
Write-Host "[start-server] envFile=$EnvFile"

Import-EnvFile -Path $EnvFile

try {
    Push-Location $serverDir
    Print-Command -WorkingDir $serverDir -Command "npm start"
    $serverProcess = Start-Process cmd -ArgumentList "/c npm start" -NoNewWindow -PassThru
    $trackedProcesses += $serverProcess



    if ($trackedProcesses.Count -gt 0) {
        Write-Host ""
        Write-Host "[start-server] Server is running (PID $($serverProcess.Id))." -ForegroundColor Cyan
        Write-Host "[start-server] SCRIPT IS ACTIVE. Press Ctrl+C to kill server and exit." -ForegroundColor Yellow
        
        while ($true) {
            $running = $trackedProcesses | Where-Object { -not $_.HasExited }
            if (-not $running) {
                Write-Host "[start-server] Server process has exited."
                break
            }
            Start-Sleep -Seconds 2
        }
    }
} finally {
    if ($trackedProcesses.Count -gt 0) {
        Write-Host "[start-server] cleaning up processes..." -ForegroundColor Yellow
        foreach ($p in $trackedProcesses) {
            if (-not $p.HasExited) {
                Write-Host "[start-server] killing process tree for PID $($p.Id)..."
                Stop-ProcessTree -TargetProcessId $p.Id
            }
        }
    }
    Pop-Location
}
