# Starts the dev app for running-app checks: backs up the app's settings, starts Vite if it isn't
# running, and launches the debug exe in its own window with its own WebView2 profile and remote
# debugging on port 9222. Stop it with stop.ps1, which also puts the settings back.
# Usage: .\scripts\checks\launch.ps1 [-File path.md] [-Build] [-Profile name]
param([string]$File = "", [switch]$Build, [string]$Profile = "default")

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$state = Join-Path $env:TEMP "mdv-checks"
$exe = Join-Path $root "src-tauri\target\debug\markdown-viewer.exe"
New-Item -ItemType Directory -Force $state | Out-Null

function Test-Url($url) {
  try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

if (Test-Path (Join-Path $state "pids.json")) {
  throw "A check app is already running (see $state\pids.json). Run stop.ps1 first."
}
if (Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue) {
  throw "Port 9222 is already in use. Close whatever is using it first."
}

if ($Build -or -not (Test-Path $exe)) {
  $env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
  Push-Location (Join-Path $root "src-tauri")
  try { cargo build 2>&1 | Select-Object -Last 3 } finally { Pop-Location }
  if ($LASTEXITCODE) { throw "cargo build failed" }
}

# A backup from an earlier launch in the same run (stop.ps1 -KeepState) is the one to keep.
node (Join-Path $PSScriptRoot "appdata.mjs") backup
if ($LASTEXITCODE) { throw "Settings backup failed" }

$pids = @{}
if (-not (Test-Url "http://localhost:1420")) {
  $vite = Start-Process cmd.exe -ArgumentList "/c", "pnpm", "dev" -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $state "vite.log") -RedirectStandardError (Join-Path $state "vite.err.log") -PassThru
  $pids.vite = $vite.Id
  for ($i = 0; $i -lt 60 -and -not (Test-Url "http://localhost:1420"); $i++) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-Url "http://localhost:1420")) { throw "Vite didn't start; see $state\vite.err.log" }
}

$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $state "webview2-$Profile"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
$appArgs = @("--new-window")
if ($File) { $appArgs += '"' + (Resolve-Path $File) + '"' }
$app = Start-Process -FilePath $exe -ArgumentList $appArgs -WorkingDirectory $root -PassThru
$pids.app = $app.Id
$pids | ConvertTo-Json | Set-Content (Join-Path $state "pids.json")

$ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
  try {
    $targets = Invoke-RestMethod http://127.0.0.1:9222/json -TimeoutSec 2
    $ready = [bool]($targets | Where-Object { $_.url -like "http://localhost:1420*" })
  } catch {}
  if (-not $ready) { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) {
  "App page not ready after 30 s (PID $($app.Id)). If Windows was in Modern Standby (Kernel-Power 506/507),"
  "run stop.ps1 and launch again once it's awake."
  exit 1
}
# Let the first render and the stores settle before a check connects.
Start-Sleep -Seconds 2
"App PID $($app.Id) ready on port 9222" + $(if ($pids.vite) { "; Vite PID $($pids.vite)" } else { "; using the Vite server already running" })
