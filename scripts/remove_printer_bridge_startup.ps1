$ErrorActionPreference = "Stop"

$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "LuisITRepair Printer Bridge.lnk"
$legacyLauncherPath = Join-Path $startupDir "LuisITRepair Printer Bridge.vbs"
$removed = @()

if (Test-Path $launcherPath) {
  Remove-Item -Path $launcherPath -Force
  $removed += $launcherPath
}

if (Test-Path $legacyLauncherPath) {
  Remove-Item -Path $legacyLauncherPath -Force
  $removed += $legacyLauncherPath
}

if ($removed.Count -gt 0) {
  Write-Host "Autoarranque eliminado:"
  $removed | ForEach-Object { Write-Host " - $_" }
} else {
  Write-Host "No habia autoarranque instalado."
}
