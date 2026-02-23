param(
    [string]$ApkPath = "",
    [string]$PackageName = "com.mealquestmerchant",
    [string]$ActivityName = ".MainActivity",
    [string]$DeviceId = "",
    [int]$SmokeSeconds = 8,
    [switch]$SkipInstall
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
    param([string]$Command)
    if (-not $script:RunStep) { $script:RunStep = 0 }
    $script:RunStep += 1
    Write-Host ""
    Write-Host (">>> [STEP-{0}] {1}" -f $script:RunStep, $Command) -ForegroundColor Red
}

function Resolve-AdbPath {
    if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
        $candidate = Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe"
        if (Test-Path $candidate) { return $candidate }
    }
    if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
        $candidate = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
        if (Test-Path $candidate) { return $candidate }
    }
    $default = "D:\AndroidDev\sdk\platform-tools\adb.exe"
    if (Test-Path $default) { return $default }
    $fromPath = Get-Command adb -ErrorAction SilentlyContinue
    if ($fromPath -and $fromPath.Source) { return $fromPath.Source }
    return $null
}

function Invoke-Adb {
    param(
        [string]$AdbPath,
        [string[]]$ArgList,
        [switch]$AllowFailure
    )
    $display = "$AdbPath " + ($ArgList -join " ")
    Print-Command -Command $display
    $output = & $AdbPath @ArgList 2>&1
    if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
        $text = ($output | Out-String)
        throw "adb command failed: $display`n$text"
    }
    return $output
}

try {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($ApkPath)) {
    $ApkPath = Join-Path $repoRoot "MealQuestMerchant\android\app\build\outputs\apk\release\app-release.apk"
}

$adb = Resolve-AdbPath
if (-not $adb) {
    throw "adb not found. Please install Android platform-tools or set ANDROID_SDK_ROOT."
}

$deviceArgs = @()
if (-not [string]::IsNullOrWhiteSpace($DeviceId)) {
    $deviceArgs = @("-s", $DeviceId)
}

$deviceList = Invoke-Adb -AdbPath $adb -ArgList ($deviceArgs + @("devices"))
$onlineDevices = @(
    $deviceList |
        Where-Object { $_ -match "^\S+\s+device$" } |
        ForEach-Object { ($_ -split "\s+")[0] }
)
if ($onlineDevices.Count -eq 0) {
    throw "No online Android device found."
}

if (-not $SkipInstall) {
    if (-not (Test-Path $ApkPath)) {
        throw "APK not found: $ApkPath"
    }
    $installOutput = Invoke-Adb -AdbPath $adb -ArgList ($deviceArgs + @("install", "-r", $ApkPath)) -AllowFailure
    $installText = ($installOutput | Out-String)
    if ($LASTEXITCODE -ne 0 -or $installText -notmatch "Success") {
        throw "APK install failed.`n$installText"
    }
    Write-Host "[verify-merchant-release] install=Success" -ForegroundColor Green
} else {
    Write-Host "[verify-merchant-release] skip install by request." -ForegroundColor Yellow
}

Invoke-Adb -AdbPath $adb -ArgList ($deviceArgs + @("logcat", "-c")) | Out-Null
Invoke-Adb -AdbPath $adb -ArgList ($deviceArgs + @("shell", "am", "force-stop", $PackageName)) | Out-Null
Invoke-Adb -AdbPath $adb -ArgList ($deviceArgs + @("shell", "am", "start", "-n", "$PackageName/$ActivityName")) | Out-Null
Start-Sleep -Seconds $SmokeSeconds

$pidOutput = Invoke-Adb -AdbPath $adb -ArgList ($deviceArgs + @("shell", "pidof", $PackageName)) -AllowFailure
$appPid = (($pidOutput | Out-String).Trim())
if ([string]::IsNullOrWhiteSpace($appPid)) {
    throw "App process not found after launch: $PackageName"
}
Write-Host "[verify-merchant-release] pid=$appPid" -ForegroundColor Green

$fatalPatterns = @("FATAL EXCEPTION", "AndroidRuntime", "Process: $PackageName", "has stopped", "Fatal signal")
$logOutput = Invoke-Adb -AdbPath $adb -ArgList ($deviceArgs + @("logcat", "--pid", $appPid, "-d")) -AllowFailure
$logText = ($logOutput | Out-String)
$fatal = $false
foreach ($p in $fatalPatterns) {
    if ($logText -match [regex]::Escape($p)) {
        $fatal = $true
        break
    }
}

$pkgInfo = Invoke-Adb -AdbPath $adb -ArgList ($deviceArgs + @("shell", "dumpsys", "package", $PackageName)) -AllowFailure
$pkgLines = @(
    $pkgInfo |
        Where-Object {
            $_ -match "versionCode=" -or
            $_ -match "versionName=" -or
            $_ -match "signing" -or
            $_ -match "cert" -or
            $_ -match "Package \[$PackageName\]"
        }
)

Write-Host "[verify-merchant-release] package summary:"
$pkgLines | ForEach-Object { Write-Host "  $_" }

if ($fatal) {
    throw "Release smoke failed: fatal runtime signal detected. Review logcat output."
}

    Write-Host "[verify-merchant-release] launch smoke=PASS" -ForegroundColor Green
} finally {
    if ($trackedProcesses.Count -gt 0) {
        foreach ($p in $trackedProcesses) {
            if (-not $p.HasExited) {
                Stop-ProcessTree -TargetProcessId $p.Id
            }
        }
    }
}
