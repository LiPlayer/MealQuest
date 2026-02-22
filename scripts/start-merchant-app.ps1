param(
    [ValidateSet("local", "online")]
    [string]$Mode = "local",
    [ValidateSet("android", "ios")]
    [string]$Platform = "android",
    [string]$ServerBaseUrl = "http://127.0.0.1:3030",
    [string]$AndroidSdkPath = "",
    [string]$MerchantId = "m_my_first_store",
    [bool]$EnableEntryFlow = $true,
    [switch]$AutoStartServer,
    [switch]$NoMetro,
    [switch]$NoLaunch,
    [int]$WaitMetroSeconds = 6
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
        if ([string]::IsNullOrEmpty($Value)) {
            Write-Host "[ENV-$($script:EnvStep)] SET $Name" -ForegroundColor Yellow
        } else {
            Write-Host "[ENV-$($script:EnvStep)] SET $Name=$displayValue" -ForegroundColor Yellow
        }
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

function Clear-ProcessEnv {
    param([string]$Name)
    [Environment]::SetEnvironmentVariable($Name, $null, "Process")
    Print-EnvChange -Action "UNSET" -Name $Name
}

function Resolve-AndroidSdkPath {
    param([string]$PreferredPath = "")
    if ($PreferredPath -and (Test-Path $PreferredPath)) {
        return (Resolve-Path $PreferredPath).Path
    }

    $fromEnv = @(@($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME) | Where-Object { $_ -and (Test-Path $_) })
    if ($fromEnv.Count -gt 0) {
        return $fromEnv[0]
    }

    $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
    if ($adbCommand -and $adbCommand.Source) {
        $adbResolved = (Resolve-Path $adbCommand.Source).Path
        $platformToolsDir = Split-Path $adbResolved -Parent
        if (Split-Path $platformToolsDir -Leaf -eq "platform-tools") {
            $sdkFromAdb = Split-Path $platformToolsDir -Parent
            if ($sdkFromAdb -and (Test-Path $sdkFromAdb)) {
                return $sdkFromAdb
            }
        }
    }

    $studioOptionRoots = @(
        (Join-Path $env:APPDATA "Google"),
        (Join-Path $env:APPDATA "JetBrains")
    ) | Select-Object -Unique

    foreach ($root in $studioOptionRoots) {
        if (-not $root -or -not (Test-Path $root)) {
            continue
        }
        $studioDirs = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "AndroidStudio*" }
        foreach ($dir in $studioDirs) {
            $otherXml = Join-Path $dir.FullName "options\other.xml"
            if (-not (Test-Path $otherXml)) {
                continue
            }
            try {
                $content = Get-Content -Raw $otherXml -ErrorAction Stop
                $match = [regex]::Match($content, 'name=\"android\.sdk\.path\"\s+value=\"([^\"]+)\"')
                if ($match.Success) {
                    $path = $match.Groups[1].Value.Replace('\\', '\')
                    if ($path -and (Test-Path $path)) {
                        return $path
                    }
                }
            } catch {
                # ignore parse/read errors and continue searching
            }
        }
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
        (Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk"),
        "D:\Android\Sdk",
        "E:\Android\Sdk"
    ) | Select-Object -Unique

    foreach ($path in $candidates) {
        if ($path -and (Test-Path $path)) {
            return $path
        }
    }
    return $null
}

function Ensure-PathContains {
    param([string]$DirPath)
    if (-not $DirPath -or -not (Test-Path $DirPath)) {
        return
    }
    $current = [Environment]::GetEnvironmentVariable("Path", "Process")
    $parts = $current -split ";" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    if ($parts -notcontains $DirPath) {
        [Environment]::SetEnvironmentVariable("Path", "$current;$DirPath", "Process")
        Print-EnvChange -Action "SET" -Name "PATH+=$DirPath" -Value ""
    }
}

function Ensure-AndroidSetup {
    param(
        [string]$MerchantDirPath,
        [string]$PreferredSdkPath = ""
    )
    $sdkPath = Resolve-AndroidSdkPath -PreferredPath $PreferredSdkPath
    if (-not $sdkPath) {
        throw "Android SDK not found. Install Android Studio SDK or pass -AndroidSdkPath."
    }

    $sdkPathStr = [string]$sdkPath
    Set-ProcessEnv -Name "ANDROID_SDK_ROOT" -Value $sdkPathStr
    Set-ProcessEnv -Name "ANDROID_HOME" -Value $sdkPathStr
    Ensure-PathContains (Join-Path $sdkPathStr "platform-tools")
    Ensure-PathContains (Join-Path $sdkPathStr "emulator")
    Ensure-PathContains (Join-Path $sdkPathStr "cmdline-tools\latest\bin")

    $localPropertiesPath = Join-Path $MerchantDirPath "android\local.properties"
    $normalizedSdkPath = $sdkPathStr.Replace("\", "/")
    Set-Content -Path $localPropertiesPath -Encoding UTF8 -Value "sdk.dir=$normalizedSdkPath`n"

    Write-Host "[merchant-app] ANDROID_SDK_ROOT=$env:ANDROID_SDK_ROOT"
    Write-Host "[merchant-app] android/local.properties generated."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$merchantDir = Join-Path $repoRoot "MealQuestMerchant"

if (-not (Test-Path $merchantDir)) {
    throw "Merchant app directory not found: $merchantDir"
}

if ($Platform -eq "android") {
    Ensure-AndroidSetup -MerchantDirPath $merchantDir -PreferredSdkPath $AndroidSdkPath
}

$entryFlowValue = if ($EnableEntryFlow) { "true" } else { "false" }
Set-ProcessEnv -Name "MQ_ENABLE_ENTRY_FLOW" -Value $entryFlowValue
Set-ProcessEnv -Name "MQ_MERCHANT_ID" -Value $MerchantId

if ($Mode -eq "online") {
    Set-ProcessEnv -Name "MQ_USE_REMOTE_API" -Value "true"
    Set-ProcessEnv -Name "MQ_SERVER_BASE_URL" -Value $ServerBaseUrl
} else {
    Set-ProcessEnv -Name "MQ_USE_REMOTE_API" -Value "false"
    Clear-ProcessEnv -Name "MQ_SERVER_BASE_URL"
}

Write-Host "[merchant-app] mode=$Mode platform=$Platform"
Write-Host "[merchant-app] MQ_ENABLE_ENTRY_FLOW=$env:MQ_ENABLE_ENTRY_FLOW"
Write-Host "[merchant-app] MQ_USE_REMOTE_API=$env:MQ_USE_REMOTE_API"
Write-Host "[merchant-app] MQ_SERVER_BASE_URL=$env:MQ_SERVER_BASE_URL"
Write-Host "[merchant-app] MQ_MERCHANT_ID=$env:MQ_MERCHANT_ID"

if ($AutoStartServer -and $Mode -eq "online") {
    $serverScript = Join-Path $PSScriptRoot "start-server.ps1"
    if (-not (Test-Path $serverScript)) {
        throw "Server startup script not found: $serverScript"
    }
    Write-Host "[merchant-app] starting local server in a new terminal..."
    Print-Command -WorkingDir $PSScriptRoot -Command "powershell -NoExit -ExecutionPolicy Bypass -File `"$serverScript`" -Profile dev"
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $serverScript,
        "-Profile",
        "dev"
    ) | Out-Null
    Start-Sleep -Seconds 2
}

if (-not $NoMetro) {
    $metroCommand = @"
`$env:MQ_ENABLE_ENTRY_FLOW='$env:MQ_ENABLE_ENTRY_FLOW';
`$env:MQ_USE_REMOTE_API='$env:MQ_USE_REMOTE_API';
`$env:MQ_SERVER_BASE_URL='$env:MQ_SERVER_BASE_URL';
`$env:MQ_MERCHANT_ID='$env:MQ_MERCHANT_ID';
Set-Location '$merchantDir';
npm start
"@
    Write-Host "[merchant-app] starting Metro in a new terminal..."
    Print-Command -WorkingDir $merchantDir -Command "powershell -NoExit -ExecutionPolicy Bypass -Command <set env; cd '$merchantDir'; npm start>"
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $metroCommand
    ) | Out-Null
    if ($WaitMetroSeconds -gt 0) {
        Start-Sleep -Seconds $WaitMetroSeconds
    }
}

if ($NoLaunch) {
    Write-Host "[merchant-app] NoLaunch=true, skipped app install/launch."
    exit 0
}

Push-Location $merchantDir
try {
    Write-Host "[merchant-app] building + launching $Platform debug app..."
    if ($Platform -eq "android") {
        Print-Command -WorkingDir $merchantDir -Command "npm run android"
        npm run android
    } else {
        Print-Command -WorkingDir $merchantDir -Command "npm run ios"
        npm run ios
    }
} finally {
    Pop-Location
}
