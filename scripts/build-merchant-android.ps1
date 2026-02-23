param(
    [ValidateSet("debug", "release")]
    [string]$BuildType = "release",
    [ValidateSet("apk", "aab")]
    [string]$Artifact = "apk",
    [string]$AndroidSdkPath = "",
    [switch]$Clean
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
    param([string]$WorkingDir, [string]$Command)
    if (-not $script:RunStep) { $script:RunStep = 0 }
    $script:RunStep += 1
    Write-Host ""
    Write-Host (">>> [STEP-{0}] {1}" -f $script:RunStep, $Command) -ForegroundColor Red
    Write-Host ("    @ {0}" -f $WorkingDir) -ForegroundColor DarkGray
}

function Print-EnvChange {
    param([string]$Action, [string]$Name, [string]$Value = "")
    if (-not $script:EnvStep) { $script:EnvStep = 0 }
    $script:EnvStep += 1
    if ($Action -eq "SET") {
        Write-Host "[ENV-$($script:EnvStep)] SET $Name=$Value" -ForegroundColor Yellow
    } else {
        Write-Host "[ENV-$($script:EnvStep)] UNSET $Name" -ForegroundColor Yellow
    }
}

function Set-ProcessEnv {
    param([string]$Name, [string]$Value)
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    Print-EnvChange -Action "SET" -Name $Name -Value $Value
}

function Resolve-AndroidSdkPath {
    param([string]$PreferredPath = "")
    if ($PreferredPath -and (Test-Path $PreferredPath)) {
        return (Resolve-Path $PreferredPath).Path
    }
    if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
        return $env:ANDROID_SDK_ROOT
    }
    if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
        return $env:ANDROID_HOME
    }
    $defaults = @(
        "D:\AndroidDev\sdk",
        (Join-Path $env:LOCALAPPDATA "Android\Sdk")
    )
    foreach ($p in $defaults) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

function Assert-LastExitCode {
    param([string]$CommandLabel)
    if ($LASTEXITCODE -ne 0) {
        throw "$CommandLabel failed with exit code $LASTEXITCODE."
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$merchantDir = Join-Path $repoRoot "MealQuestMerchant"
$androidDir = Join-Path $merchantDir "android"

if (-not (Test-Path $merchantDir)) { throw "Merchant app directory not found: $merchantDir" }
if (-not (Test-Path $androidDir)) { throw "Merchant android directory not found: $androidDir" }

$sdkPath = Resolve-AndroidSdkPath -PreferredPath $AndroidSdkPath
if (-not $sdkPath) {
    throw "Android SDK not found. Pass -AndroidSdkPath or set ANDROID_SDK_ROOT."
}

Set-ProcessEnv -Name "ANDROID_SDK_ROOT" -Value $sdkPath
Set-ProcessEnv -Name "ANDROID_HOME" -Value $sdkPath

$task = if ($Artifact -eq "aab") {
    if ($BuildType -eq "release") { "bundleRelease" } else { "bundleDebug" }
} else {
    if ($BuildType -eq "release") { "assembleRelease" } else { "assembleDebug" }
}

try {
    Push-Location $androidDir
    if ($Clean) {
        Print-Command -WorkingDir $androidDir -Command ".\gradlew.bat clean"
        $cleanProcess = Start-Process cmd -ArgumentList "/c gradlew.bat clean" -NoNewWindow -PassThru -Wait
        $trackedProcesses += $cleanProcess

        Assert-LastExitCode -CommandLabel "gradlew clean"
    }

    Print-Command -WorkingDir $androidDir -Command ".\gradlew.bat $task"
    $buildProcess = Start-Process cmd -ArgumentList "/c gradlew.bat $task" -NoNewWindow -PassThru -Wait
    $trackedProcesses += $buildProcess

    Assert-LastExitCode -CommandLabel "gradlew $task"

} finally {
    if ($trackedProcesses.Count -gt 0) {
        foreach ($p in $trackedProcesses) {
            if (-not $p.HasExited) {
                Stop-ProcessTree -TargetProcessId $p.Id
            }
        }
    }
    Pop-Location
}


$artifactPath = if ($Artifact -eq "aab") {
    Join-Path $androidDir "app\build\outputs\bundle\$BuildType\app-$BuildType.aab"
} else {
    Join-Path $androidDir "app\build\outputs\apk\$BuildType\app-$BuildType.apk"
}

if (Test-Path $artifactPath) {
    Write-Host "[build-merchant-android] output=$artifactPath" -ForegroundColor Green
} else {
    Write-Host "[build-merchant-android] built task '$task' but output not found at expected path." -ForegroundColor Yellow
}
