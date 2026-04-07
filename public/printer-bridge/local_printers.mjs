import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const LIST_PRINTERS_PS = [
  "$ErrorActionPreference = 'Stop'",
  "$items = Get-CimInstance Win32_Printer | Sort-Object Name | Select-Object Name, Default, DriverName, PortName, Network, WorkOffline, PrinterStatus",
  "$items | ConvertTo-Json -Depth 3 -Compress",
].join("; ")

function normalizePrinter(item = {}) {
  const name = String(item?.Name || "").trim()
  if (!name) return null

  return {
    name,
    isDefault: item?.Default === true,
    driverName: String(item?.DriverName || "").trim(),
    portName: String(item?.PortName || "").trim(),
    isNetwork: item?.Network === true,
    isOffline: item?.WorkOffline === true,
    statusCode: Number(item?.PrinterStatus || 0) || 0,
  }
}

export async function listLocalPrinters() {
  if (process.platform !== "win32") {
    return []
  }

  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      LIST_PRINTERS_PS,
    ],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    },
  )

  const raw = String(stdout || "").trim()
  if (!raw) return []

  const parsed = JSON.parse(raw)
  const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []

  return items
    .map(normalizePrinter)
    .filter(Boolean)
}
