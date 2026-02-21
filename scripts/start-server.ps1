param(
    [ValidateSet("dev", "staging", "prod")]
    [string]$Profile = "dev",
    [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"

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
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
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
    npm start
} finally {
    Pop-Location
}
