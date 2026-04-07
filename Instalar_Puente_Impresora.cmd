@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\install_printer_bridge_startup.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo No se pudo activar el puente de impresora automaticamente.
  pause
  exit /b %EXIT_CODE%
)

echo El puente de impresora se activo para iniciar automaticamente en esta PC.
pause
