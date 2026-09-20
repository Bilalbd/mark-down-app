# Launches the Tauri dev app with WebView2 remote debugging enabled (port 9222),
# optionally opening a file. Usage: .\scripts\dev.ps1 [path\to\file.md]
param([string]$File = "")

$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Set-Location (Split-Path $PSScriptRoot -Parent)

if ($File) {
  pnpm tauri dev -- -- $File
} else {
  pnpm tauri dev
}
