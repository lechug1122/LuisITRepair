$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$bridgeScript = Join-Path $repoRoot "scripts\printer_bridge.mjs"
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue

if (-not $nodeCommand) {
  throw "No se encontro node.exe en esta PC."
}

if (-not (Test-Path $bridgeScript)) {
  throw "No se encontro scripts\printer_bridge.mjs."
}

$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "LuisITRepair Printer Bridge.lnk"
$legacyLauncherPath = Join-Path $startupDir "LuisITRepair Printer Bridge.vbs"
$nodePath = $nodeCommand.Source
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($launcherPath)
$shortcut.TargetPath = $nodePath
$shortcut.Arguments = "`"$bridgeScript`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 7
$shortcut.IconLocation = "$nodePath,0"
$shortcut.Save()

if (Test-Path $legacyLauncherPath) {
  Remove-Item -Path $legacyLauncherPath -Force
}

Write-Host "Autoarranque instalado en: $launcherPath"
