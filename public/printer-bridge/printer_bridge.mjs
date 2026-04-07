import http from "node:http"
import { URL } from "node:url"
import { listLocalPrinters } from "./local_printers.mjs"
import { printImageBase64, printRawText } from "./windows_raw_print.mjs"

const port = Number(process.env.PRINTER_BRIDGE_PORT || 3210)

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  })
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  const chunks = []

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

const server = http.createServer(async (req, res) => {
  if ((req.method || "GET").toUpperCase() === "OPTIONS") {
    sendJson(res, 200, { ok: true })
    return
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`)
  const pathname = requestUrl.pathname
  const method = (req.method || "GET").toUpperCase()

  if (method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "printer-bridge" })
    return
  }

  if (method === "GET" && pathname === "/api/printers") {
    try {
      const printers = await listLocalPrinters()
      sendJson(res, 200, {
        ok: true,
        printers,
        total: printers.length,
      })
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: "No se pudo leer la lista de impresoras de Windows.",
        detail: error?.message || String(error),
      })
    }
    return
  }

  if (method === "POST" && pathname === "/api/print-text") {
    try {
      const body = await readJsonBody(req)
      const result = await printRawText({
        printerName: body?.printerName || "",
        text: body?.content || body?.text || "",
        jobName: body?.jobName || "LuisITRepair Ticket",
      })
      sendJson(res, 200, result)
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: "No se pudo imprimir en la impresora seleccionada.",
        detail: error?.message || String(error),
      })
    }
    return
  }

  if (method === "POST" && pathname === "/api/print-image") {
    try {
      const body = await readJsonBody(req)
      const result = await printImageBase64({
        printerName: body?.printerName || "",
        imageBase64: body?.imageBase64 || body?.imageDataUrl || "",
        jobName: body?.jobName || "LuisITRepair Ticket",
        paperSize: body?.paperSize || "a4",
      })
      sendJson(res, 200, result)
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: "No se pudo imprimir la imagen del ticket.",
        detail: error?.message || String(error),
      })
    }
    return
  }

  sendJson(res, 404, { ok: false, error: "Ruta no encontrada." })
})

server.listen(port, () => {
  console.log(`[printer-bridge] escuchando en http://127.0.0.1:${port}`)
})
