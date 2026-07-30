$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$bridgeScript = Join-Path $repoRoot "public\printer-bridge\printer_bridge.ps1"

if (-not (Test-Path $bridgeScript)) {
  throw "No se encontro public\printer-bridge\printer_bridge.ps1."
}

$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "LuisITRepair Printer Bridge.lnk"
$legacyLauncherPath = Join-Path $startupDir "LuisITRepair Printer Bridge.vbs"
$powershellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($launcherPath)
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$bridgeScript`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 7
$shortcut.IconLocation = "$powershellPath,0"
$shortcut.Save()

if (Test-Path $legacyLauncherPath) {
  Remove-Item -Path $legacyLauncherPath -Force
}

Start-Process -FilePath $powershellPath `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $bridgeScript) `
  -WindowStyle Hidden

Write-Host "Autoarranque instalado en: $launcherPath"
