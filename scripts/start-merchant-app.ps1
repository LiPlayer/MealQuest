param(
    [ValidateSet("android", "ios")]
    [string]$Platform = "android",
    [string]$AndroidSdkPath = "",
    [switch]$AutoStartServer,
    [switch]$NoMetro,
    [switch]$NoLaunch,
    [int]$WaitMetroSeconds = 6,
    [string]$MetroHost = "0.0.0.0",
    [int]$MetroPort = 8081
)

$ErrorActionPreference = "Stop"
$trackedProcesses = @()


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


function Assert-LastExitCode {
    param([string]$CommandLabel)
    if ($LASTEXITCODE -ne 0) {
        throw "$CommandLabel failed with exit code $LASTEXITCODE."
    }
}

function Stop-ProcessTree {
    param([int]$TargetProcessId)
    if ($TargetProcessId -le 0) {
        return
    }
    & taskkill /PID $TargetProcessId /T /F *> $null
    if ($LASTEXITCODE -ne 0) {
        Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Test-PortOccupied {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $connection
}

function Print-InstallRestrictedGuidance {
    Write-Host "[merchant-app] detected INSTALL_FAILED_USER_RESTRICTED." -ForegroundColor Red
    Write-Host "[merchant-app] action required on phone:" -ForegroundColor Red
    Write-Host "[merchant-app] 1) Enable Developer options." -ForegroundColor Red
    Write-Host "[merchant-app] 2) Enable USB debugging." -ForegroundColor Red
    Write-Host "[merchant-app] 3) Enable USB install / Install via USB." -ForegroundColor Red
    Write-Host "[merchant-app] 4) Confirm any install/security dialogs on phone." -ForegroundColor Red
    Write-Host "[merchant-app] 5) Re-run this script after allowing install." -ForegroundColor Red
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
    [Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdkPathStr, "Process")
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkPathStr, "Process")
    Ensure-PathContains (Join-Path $sdkPathStr "platform-tools")
    # Ensuring we only use real devices, so we won't add 'emulator' to PATH
    # Ensure-PathContains (Join-Path $sdkPathStr "emulator")
    Ensure-PathContains (Join-Path $sdkPathStr "cmdline-tools\latest\bin")

    $localPropertiesPath = Join-Path $MerchantDirPath "android\local.properties"
    $normalizedSdkPath = $sdkPathStr.Replace("\", "/")
    Set-Content -Path $localPropertiesPath -Encoding UTF8 -Value "sdk.dir=$normalizedSdkPath`n"

    Write-Host "[merchant-app] ANDROID_SDK_ROOT=$env:ANDROID_SDK_ROOT"
    Write-Host "[merchant-app] android/local.properties generated."
}

function Resolve-EnvFilePath {
    param([string]$ProjectDir)
    $candidates = @(
        (Join-Path $ProjectDir ".env.local"),
        (Join-Path $ProjectDir ".env")
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
            [Environment]::SetEnvironmentVariable([string]$entry.Name, [string]$entry.Value, "Process")
        }
    }
}


try {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    $merchantDir = Join-Path $repoRoot "MealQuestMerchant"

    if (-not (Test-Path $merchantDir)) {
        throw "Merchant app directory not found: $merchantDir"
    }

    $resolvedEnvFile = Resolve-EnvFilePath -ProjectDir $merchantDir
    Import-EnvFile -Path $resolvedEnvFile

    if ($Platform -eq "android") {
        Ensure-AndroidSetup -MerchantDirPath $merchantDir -PreferredSdkPath $AndroidSdkPath
    }

    Write-Host "[merchant-app] envFile=$resolvedEnvFile" -ForegroundColor Green
    Write-Host "[merchant-app] metro=${MetroHost}:$MetroPort"

$metroProcess = $null

if ($AutoStartServer) {
    $serverScript = Join-Path $PSScriptRoot "start-server.ps1"
    if (-not $serverScript -or -not (Test-Path $serverScript)) {
        throw "Server startup script not found: $serverScript"
    }
    Write-Host "[merchant-app] starting local server in a new terminal..." -ForegroundColor Cyan
    Print-Command -WorkingDir $PSScriptRoot -Command "powershell -NoExit -ExecutionPolicy Bypass -File `"$serverScript`" -Profile dev"
    $serverProcess = Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$serverScript`"", "-Profile", "dev" -PassThru
    $trackedProcesses += $serverProcess
    Start-Sleep -Seconds 2
}


if (-not $NoMetro) {
    if (Test-PortOccupied -Port $MetroPort) {
        Write-Host "" -ForegroundColor Yellow
        Write-Host "*******************************************************************************" -ForegroundColor Yellow
        Write-Host "  WARNING: Metro port $MetroPort is already occupied!" -ForegroundColor Yellow
        Write-Host "  The existing Metro process might NOT have the current environment variables." -ForegroundColor Yellow
        Write-Host "  If the app shows 'Connection Failed' or wrong 'BaseUrl', PLEASE RESTART METRO." -ForegroundColor Yellow
        Write-Host "*******************************************************************************" -ForegroundColor Yellow
        Write-Host "" -ForegroundColor Yellow
        $MetroInjectedOrPreExisting = $true
    }
}

if (-not $NoMetro -and -not $MetroInjectedOrPreExisting) {
    $metroCommand = @"
Set-Location '$merchantDir';
npx react-native start --host '$MetroHost' --port $MetroPort
"@

    Write-Host "[merchant-app] starting Metro in a new terminal..." -ForegroundColor Cyan
    Print-Command -WorkingDir $merchantDir -Command "npx react-native start --host '$MetroHost' --port $MetroPort"
    $metroProcess = Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $metroCommand -PassThru
    $trackedProcesses += $metroProcess
    $MetroInjectedOrPreExisting = $true

    if ($WaitMetroSeconds -gt 0) {
        Start-Sleep -Seconds $WaitMetroSeconds
    }
}

if ($NoLaunch) {
    Write-Host "[merchant-app] NoLaunch=true, skipped app install/launch."
    exit 0
}

Push-Location $merchantDir
    Write-Host "[merchant-app] building + launching $Platform debug app..."
    
    if ($Platform -eq "android") {
        $devices = adb devices | Select-String -Pattern "\sdevice$"
        if ($null -eq $devices -or $devices.Count -eq 0) {
            throw "No real Android devices connected (detected via 'adb devices'). Please connect your phone via USB or Wireless ADB."
        }
        Write-Host "[merchant-app] Target devices detected:"
        $devices | ForEach-Object { Write-Host "  $($_.ToString().Trim())" -ForegroundColor Green }
    }

    $skipPackager = $MetroInjectedOrPreExisting -or $NoMetro
    if ($Platform -eq "android") {
        if ($skipPackager) {
            Print-Command -WorkingDir $merchantDir -Command "npm run android -- --no-packager"
            npm run android -- --no-packager
            Assert-LastExitCode -CommandLabel "npm run android -- --no-packager"
        } else {
            Print-Command -WorkingDir $merchantDir -Command "npm run android"
            npm run android
            Assert-LastExitCode -CommandLabel "npm run android"
        }
    } else {
        if ($skipPackager) {
            Print-Command -WorkingDir $merchantDir -Command "npm run ios -- --no-packager"
            npm run ios -- --no-packager
            Assert-LastExitCode -CommandLabel "npm run ios -- --no-packager"
        } else {
            Print-Command -WorkingDir $merchantDir -Command "npm run ios"
            npm run ios
            Assert-LastExitCode -CommandLabel "npm run ios"
        }
    }

    
    if ($trackedProcesses.Count -gt 0) {
        Write-Host ""
        Write-Host "[merchant-app] Startup sequence finished. Child processes are running:" -ForegroundColor Cyan
        foreach ($p in $trackedProcesses) {
            Write-Host "  - PID $($p.Id): $($p.ProcessName)" -ForegroundColor Gray
        }
        Write-Host "[merchant-app] SCRIPT IS ACTIVE. Press Ctrl+C to kill all child processes and exit." -ForegroundColor Yellow
        
        while ($true) {
            $running = $trackedProcesses | Where-Object { -not $_.HasExited }
            if (-not $running) {
                Write-Host "[merchant-app] All child processes have exited."
                break
            }
            Start-Sleep -Seconds 2
        }
    }
} catch {
    $errText = ($_ | Out-String)
    if ($errText -match "INSTALL_FAILED_USER_RESTRICTED") {
        Print-InstallRestrictedGuidance
    }
    throw
} finally {
    if ($trackedProcesses.Count -gt 0) {
        Write-Host "[merchant-app] cleaning up child processes..." -ForegroundColor Yellow
        foreach ($p in $trackedProcesses) {
            if (-not $p.HasExited) {
                Write-Host "[merchant-app] killing process tree for PID $($p.Id)..."
                Stop-ProcessTree -TargetProcessId $p.Id
            }
        }
    }
    if ($PSScriptRoot -ne $PWD.Path -and (Test-Path $merchantDir) -and ($PWD.Path -eq (Resolve-Path $merchantDir).Path)) {
        Pop-Location
    }
}


