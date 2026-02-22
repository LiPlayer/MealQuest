param(
    [ValidateSet("dev", "staging", "prod")]
    [string]$Profile = "dev",
    [string]$EnvFile = ""
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

Push-Location $serverDir
try {
    Print-Command -WorkingDir $serverDir -Command "npm start"
    npm start
} finally {
    Pop-Location
}
