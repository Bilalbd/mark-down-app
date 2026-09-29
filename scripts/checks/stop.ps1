# Stops the processes launch.ps1 started (by exact PID, with their child processes) and puts the
# app's settings back. -KeepState skips the restore, for a restart in the middle of a check run.
# Never stops anything else, so an installed copy of the app keeps running.
param([switch]$KeepState)

$state = Join-Path $env:TEMP "mdv-checks"
$pidFile = Join-Path $state "pids.json"
if (Test-Path $pidFile) {
  $pids = Get-Content $pidFile -Raw | ConvertFrom-Json
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
