// server.js
import express from "express";
import cors from "cors";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.post("/api/boleta/excel", async (req, res) => {
  try {
    const { servicio, boletaFecha, items } = req.body;

    const plantillaPath = path.join(__dirname, "plantillas", "plantilla.xlsx");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(plantillaPath);

    const ws = wb.worksheets[0];

    // 🔥 Ajusta celdas a tu plantilla REAL:
    ws.getCell("C7").value = servicio?.nombre || "";
    ws.getCell("C8").value = servicio?.direccion || "S/N";
    ws.getCell("G8").value = boletaFecha || "";

    const startRow = 11;
    const maxRows = 9;

    for (let i = 0; i < maxRows; i++) {
      const r = startRow + i;
      const it = items?.[i];

      // limpia (sin tocar estilos)
      ws.getCell(`B${r}`).value = null;
      ws.getCell(`C${r}`).value = null;
      ws.getCell(`D${r}`).value = null;
      ws.getCell(`E${r}`).value = null;
      ws.getCell(`G${r}`).value = null;

      if (!it || !(it.descripcion || "").trim()) continue;

      const p = Number(it.pUnitario || 0);
      const ctd = Number(it.cantidad || 0);
      const imp = p * ctd;

      ws.getCell(`B${r}`).value = it.item || "";
      ws.getCell(`C${r}`).value = it.descripcion || "";
      ws.getCell(`D${r}`).value = p;
      ws.getCell(`E${r}`).value = ctd;
      ws.getCell(`G${r}`).value = imp;
    }

    const total = (items || []).reduce(
      (acc, it) => acc + Number(it?.pUnitario || 0) * Number(it?.cantidad || 0),
      0,
    );

    ws.getCell("G20").value = total;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Boleta_${servicio?.folio || "SIN_FOLIO"}.xlsx"`,
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Error generando Excel" });
  }
});

app.listen(3001, () => console.log("✅ API corriendo en http://localhost:3001"));
