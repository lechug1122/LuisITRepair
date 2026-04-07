import cors from "cors"
import express from "express"
import { listLocalPrinters } from "./local_printers.mjs"
import { printImageBase64, printRawText } from "./windows_raw_print.mjs"

const app = express()
const port = Number(process.env.PRINTER_BRIDGE_PORT || 3210)

app.use(cors())
app.use(express.json({ limit: "15mb" }))

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "printer-bridge" })
})

app.get("/api/printers", async (_req, res) => {
  try {
    const printers = await listLocalPrinters()
    res.json({
      ok: true,
      printers,
      total: printers.length,
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "No se pudo leer la lista de impresoras de Windows.",
      detail: error?.message || String(error),
    })
  }
})

app.post("/api/print-text", async (req, res) => {
  try {
    const result = await printRawText({
      printerName: req.body?.printerName || "",
      text: req.body?.content || req.body?.text || "",
      jobName: req.body?.jobName || "LuisITRepair Ticket",
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "No se pudo imprimir en la impresora seleccionada.",
      detail: error?.message || String(error),
    })
  }
})

app.post("/api/print-image", async (req, res) => {
  try {
    const result = await printImageBase64({
      printerName: req.body?.printerName || "",
      imageBase64: req.body?.imageBase64 || req.body?.imageDataUrl || "",
      jobName: req.body?.jobName || "LuisITRepair Ticket",
      paperSize: req.body?.paperSize || "a4",
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "No se pudo imprimir la imagen del ticket.",
      detail: error?.message || String(error),
    })
  }
})

app.listen(port, () => {
  console.log(`[printer-bridge] escuchando en http://127.0.0.1:${port}`)
})
