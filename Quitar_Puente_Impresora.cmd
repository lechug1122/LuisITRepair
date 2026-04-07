@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\remove_printer_bridge_startup.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo No se pudo quitar el autoarranque del puente de impresora.
  pause
  exit /b %EXIT_CODE%
)

echo El puente de impresora ya no iniciara automaticamente en esta PC.
pause
