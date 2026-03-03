param(
    [ValidateSet("android", "ios")]
    [string]$Platform = "android",
    [switch]$NoInstall,
    [switch]$NoStartServer,
    [switch]$NoDevClient
)

$ErrorActionPreference = "Stop"

function Resolve-EnvFilePath {
    param([string]$ProjectDir)
    $candidates = @(
        (Join-Path $ProjectDir ".env.local"),
        (Join-Path $ProjectDir ".env"),
        (Join-Path $ProjectDir ".env.example")
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
            [Environment]::SetEnvironmentVariable([string]$entry.Name, [string]$entry.Value, "Process")
        }
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$merchantDir = Join-Path $repoRoot "MealQuestMerchant"
if (-not (Test-Path $merchantDir)) {
    throw "Merchant app directory not found: $merchantDir"
}

$resolvedEnvFile = Resolve-EnvFilePath -ProjectDir $merchantDir
Import-EnvFile -Path $resolvedEnvFile
Write-Host "[merchant-app] envFile=$resolvedEnvFile" -ForegroundColor Green

if (-not $NoStartServer) {
    $serverScript = Join-Path $PSScriptRoot "start-server.ps1"
    if (Test-Path $serverScript) {
        Write-Host "[merchant-app] starting local server..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$serverScript`"", "-Profile", "dev" | Out-Null
        Start-Sleep -Seconds 2
    }
}

Push-Location $merchantDir
try {
    if (-not $NoInstall) {
        Write-Host "[merchant-app] npm install" -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
    }

    if ($NoDevClient) {
        Write-Host "[merchant-app] expo start" -ForegroundColor Cyan
        npx expo start
        exit $LASTEXITCODE
    }

    if ($Platform -eq "android") {
        Write-Host "[merchant-app] expo start --dev-client --android" -ForegroundColor Cyan
        npx expo start --dev-client --android
        exit $LASTEXITCODE
    }

    Write-Host "[merchant-app] expo start --dev-client --ios" -ForegroundColor Cyan
    npx expo start --dev-client --ios
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
