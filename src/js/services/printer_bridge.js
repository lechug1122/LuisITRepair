const PRINTER_CACHE_KEY = "local_printers_cache_v1"

const PRINTER_ENDPOINTS = [
  "/api/system/printers",
  "http://127.0.0.1:3210/api/printers",
]

function normalizePrinter(item = {}) {
  const name = String(item?.name || item?.Name || "").trim()
  if (!name) return null

  return {
    name,
    isDefault: item?.isDefault === true || item?.Default === true,
    driverName: String(item?.driverName || item?.DriverName || "").trim(),
    portName: String(item?.portName || item?.PortName || "").trim(),
    isNetwork: item?.isNetwork === true || item?.Network === true,
    isOffline: item?.isOffline === true || item?.WorkOffline === true,
    statusCode: Number(item?.statusCode ?? item?.PrinterStatus ?? 0) || 0,
  }
}

function saveLocalPrintersCache(printers) {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(PRINTER_CACHE_KEY, JSON.stringify(printers))
  } catch {
    // noop
  }
}

export function readLocalPrintersCache() {
  if (typeof window === "undefined") return []

  try {
    const raw = localStorage.getItem(PRINTER_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map(normalizePrinter).filter(Boolean)
      : []
  } catch {
    return []
  }
}

export async function fetchLocalPrinters() {
  let lastError = null

  for (const endpoint of PRINTER_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()
      const printers = Array.isArray(data?.printers)
        ? data.printers.map(normalizePrinter).filter(Boolean)
        : []

      saveLocalPrintersCache(printers)
      return {
        printers,
        endpoint,
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error("No se pudo conectar al lector local de impresoras.")
}
