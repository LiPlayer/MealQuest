param()

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

function Set-ProcessEnv {
    param(
        [string]$Name,
        [string]$Value
    )
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Resolve-EnvFilePath {
    param([string]$ProjectDir)
    $candidates = @(
        (Join-Path $ProjectDir ".env.development.local"),
        (Join-Path $ProjectDir ".env.development")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    throw "Env file not found. Expected one of: $($candidates -join ', ')"
}

function Parse-DotEnvLine {
    param([string]$Line)

    $trimmed = $Line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
        return $null
    }

    $match = [regex]::Match($trimmed, '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$')
    if (-not $match.Success) {
        return $null
    }

    $name = $match.Groups[1].Value
    $rawValue = $match.Groups[2].Value.Trim()

    if ($rawValue.StartsWith('"') -and $rawValue.EndsWith('"') -and $rawValue.Length -ge 2) {
        $rawValue = $rawValue.Substring(1, $rawValue.Length - 2)
        $rawValue = $rawValue.Replace('\"', '"').Replace('\n', "`n").Replace('\r', "`r").Replace('\t', "`t")
    } elseif ($rawValue.StartsWith("'") -and $rawValue.EndsWith("'") -and $rawValue.Length -ge 2) {
        $rawValue = $rawValue.Substring(1, $rawValue.Length - 2)
    } else {
        $hashIndex = $rawValue.IndexOf('#')
        if ($hashIndex -ge 0) {
            $rawValue = $rawValue.Substring(0, $hashIndex).TrimEnd()
        }
    }

    return @{
        Name = $name
        Value = $rawValue
    }
}

function Import-EnvFile {
    param([string]$Path)

    Get-Content -Path $Path | ForEach-Object {
        $entry = Parse-DotEnvLine -Line $_
        if ($null -ne $entry) {
            Set-ProcessEnv -Name $entry.Name -Value $entry.Value
        }
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$customerDir = Join-Path $repoRoot "meal-quest-customer"

if (-not (Test-Path $customerDir)) {
    throw "Customer app directory not found: $customerDir"
}

$resolvedEnvFile = Resolve-EnvFilePath -ProjectDir $customerDir
Import-EnvFile -Path $resolvedEnvFile
Write-Host "[customer-weapp] envFile=$resolvedEnvFile" -ForegroundColor Green
Write-Host "[customer-weapp] ONLINE MODE ACTIVE" -ForegroundColor Green

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

