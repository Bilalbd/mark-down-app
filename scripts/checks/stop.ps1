# Stops the processes launch.ps1 started (by exact PID, with their child processes) and puts the
# app's settings back. -KeepState skips the restore, for a restart in the middle of a check run.
# Never stops anything else, so an installed copy of the app keeps running.
param([switch]$KeepState)

$state = Join-Path $env:TEMP "mdv-checks"
$pidFile = Join-Path $state "pids.json"
if (Test-Path $pidFile) {
  $pids = Get-Content $pidFile -Raw | ConvertFrom-Json
  # A slow first start (e.g. a cold Vite) lets the startup watchdog relaunch the app with
  # --relaunched and end the original, so the copy it started isn't the recorded PID. Windows
  # keeps the dead parent's PID, which identifies it; the exe path guards against PID reuse.
  $exe = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "src-tauri\target\debug\markdown-viewer.exe"
  if ($pids.app) {
    Get-CimInstance Win32_Process -Filter "Name='markdown-viewer.exe' AND ParentProcessId=$($pids.app)" |
      Where-Object { $_.ExecutablePath -eq $exe -and $_.CommandLine -like "*--relaunched*" } |
      ForEach-Object {
        taskkill /PID $_.ProcessId /T /F | Out-Null
        "Stopped the relaunched app (PID $($_.ProcessId))"
      }
  }
  foreach ($name in "app", "vite") {
    $id = $pids.$name
    if ($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) {
      taskkill /PID $id /T /F | Out-Null
      "Stopped $name (PID $id)"
    }
  }
  Remove-Item $pidFile
} else {
  "No check app recorded as running."
}

if (-not $KeepState) { node (Join-Path $PSScriptRoot "appdata.mjs") restore }
