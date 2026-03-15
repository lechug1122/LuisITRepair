// Archivo: src/js/services/pdf_hoja_servicio.js

import { jsPDF } from "jspdf";
import logoUrl from "../../assets/logo.png";
import { getPdfFontFamily } from "./apariencia_config";
import { obtenerEmpresa, readEmpresaConfigCache } from "./configure_empresa";
import {
  DEFAULT_TERMINOS_SERVICIO,
  describeRetardoConfig,
} from "./configure_servicios";

const PAGE_X = 5;
const PAGE_Y = 5;
const PAGE_W = 200;
const PAGE_H = 287;
const BOX_X = 9;
const BOX_W = 192;
const PAGE_BOTTOM_LIMIT = 289;
const SECTION_HEADER_H = 6.5;
const SECTION_GAP = 3.5;

async function detectarTipoImagen(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf.slice(0, 16));

  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;

  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (isPng) return "PNG";
  if (isJpg) return "JPEG";
  if (isWebp) return "WEBP";
  return "UNKNOWN";
}

async function fetchAsDataURL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  const blob = await res.blob();

  await detectarTipoImagen(blob);

  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  return dataUrl;
}

async function convertirADataURLPNG(dataUrl) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = dataUrl;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("No se pudo cargar imagen en canvas"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  return canvas.toDataURL("image/png");
}

function drawPageBorder(doc) {
  doc.setLineWidth(0.45);
  doc.setDrawColor(15, 23, 42);
  doc.rect(PAGE_X, PAGE_Y, PAGE_W, PAGE_H);
}

function sanitize(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function getLinesHeight(doc, lines) {
  return doc.getTextDimensions(lines).h;
}

function ensureSpace(doc, y, neededHeight) {
  if (y + neededHeight <= PAGE_BOTTOM_LIMIT) return y;
  doc.addPage();
  drawPageBorder(doc);
  return 12;
}

function drawPdfHeader(doc, { nombreEmpresa, folio, logoDataUrlPng, setPdfFont }) {
  if (logoDataUrlPng) {
    doc.addImage(logoDataUrlPng, "PNG", 10, 10, 22, 22);
  }

  const ahora = new Date();

  setPdfFont("bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text(nombreEmpresa || "Empresa", 38, 16);
  doc.setFontSize(17);
  doc.text("Hoja de Servicio", 38, 24);

  setPdfFont("normal");
  doc.setFontSize(8.6);
  doc.text(
    `Fecha: ${ahora.toLocaleDateString("es-MX")} ${ahora.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    196,
    16,
    { align: "right" },
  );
  doc.text(`Folio: ${sanitize(folio)}`, 196, 22, { align: "right" });

  return 35;
}

function drawSectionShell(doc, title, y, height, setPdfFont, fillColor = [28, 69, 135]) {
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.35);
  doc.rect(BOX_X, y, BOX_W, height);

  doc.setFillColor(...fillColor);
  doc.rect(BOX_X, y, BOX_W, SECTION_HEADER_H, "F");

  setPdfFont("bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.6);
  doc.text(title, BOX_X + 4, y + 4.5);
}

function groupGridRows(items, columns) {
  const rows = [];
  let current = [];

  items.forEach((item) => {
    if (item.wide) {
      if (current.length) {
        rows.push(current);
        current = [];
      }
      rows.push([item]);
      return;
    }

    current.push(item);
    if (current.length === columns) {
      rows.push(current);
      current = [];
    }
  });

  if (current.length) rows.push(current);
  return rows;
}

function measureGridCell(doc, item, width, fontSize, setPdfFont) {
  setPdfFont("bold");
  doc.setFontSize(fontSize - 0.8);
  const labelLines = doc.splitTextToSize(String(item.label || "").toUpperCase(), width);
  const labelHeight = getLinesHeight(doc, labelLines);

  setPdfFont("normal");
  doc.setFontSize(fontSize);
  const valueLines = doc.splitTextToSize(sanitize(item.value), width);
  const valueHeight = getLinesHeight(doc, valueLines);

  return {
    labelLines,
    valueLines,
    height: Math.max(8.5, labelHeight + valueHeight + 3.8),
  };
}

function drawGridSection(doc, y, title, items, options = {}) {
  const usableItems = (items || []).filter(Boolean);
  if (!usableItems.length) return y;

  const columns = options.columns || 2;
  const fontSize = options.fontSize || 8.4;
  const fillColor = options.fillColor || [28, 69, 135];
  const setPdfFont = options.setPdfFont || (() => {});
  const innerX = BOX_X + 4;
  const innerW = BOX_W - 8;
  const innerTop = SECTION_HEADER_H + 4;
  const colGap = 4.5;
  const rowGap = 2;
  const colWidth = (innerW - (colGap * (columns - 1))) / columns;
  const rows = groupGridRows(usableItems, columns);

  const measuredRows = rows.map((row) =>
    row.map((item) => {
      const width = row.length === 1 ? innerW : colWidth;
      return measureGridCell(doc, item, width, fontSize, setPdfFont);
    }),
  );

  const contentHeight = measuredRows.reduce(
    (total, row) => total + Math.max(...row.map((cell) => cell.height), 0) + rowGap,
    0,
  );
  const sectionHeight = SECTION_HEADER_H + 4 + Math.max(10, contentHeight) + 2.5;

  y = ensureSpace(doc, y, sectionHeight);
  drawSectionShell(doc, title, y, sectionHeight, setPdfFont, fillColor);

  let cursorY = y + innerTop;

  rows.forEach((row, rowIndex) => {
    const cells = measuredRows[rowIndex];
    const rowHeight = Math.max(...cells.map((cell) => cell.height), 0);

    row.forEach((item, index) => {
      const width = row.length === 1 ? innerW : colWidth;
      const cellX = innerX + (index * (colWidth + colGap));
      const measure = cells[index];

      doc.setFillColor(248, 250, 252);
      doc.rect(cellX - 1.4, cursorY - 1.8, width + 2.8, rowHeight, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(cellX - 1.4, cursorY - 1.8, width + 2.8, rowHeight);

      setPdfFont("bold");
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(fontSize - 0.8);
      doc.text(measure.labelLines, cellX, cursorY + 1.4);

      setPdfFont("normal");
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(fontSize);
      doc.text(measure.valueLines, cellX, cursorY + 4.9);
    });

    cursorY += rowHeight + rowGap;
  });

  return y + sectionHeight + SECTION_GAP;
}

function drawClientSection(doc, y, form, setPdfFont) {
  return drawGridSection(
    doc,
    y,
    "DATOS DEL CLIENTE",
    [
      { label: "Nombre del cliente", value: form.nombre, wide: true },
      { label: "Telefono", value: form.telefono },
      { label: "Direccion", value: form.direccion },
    ],
    { columns: 2, fontSize: 8.4, setPdfFont },
  );
}

function drawEquipmentSection(doc, y, form, folio, setPdfFont) {
  const serieTexto = form.omitirNumeroSerie ? "No proporcionado" : sanitize(form.numeroSerie);
  const estadoRegistro = form.caracteristicasPendientes
    ? "Caracteristicas pendientes por revisar"
    : "Caracteristicas registradas";

  return drawGridSection(
    doc,
    y,
    "DATOS DEL EQUIPO",
    [
      { label: "Tipo", value: form.tipoDispositivo },
      { label: "Marca", value: form.marca },
      { label: "Modelo", value: form.modelo },
      { label: "No. de serie", value: serieTexto },
      { label: "Folio", value: folio },
      { label: "Estado de captura", value: estadoRegistro },
    ],
    { columns: 3, fontSize: 8.4, setPdfFont },
  );
}

function getDeviceSectionConfig(form) {
  const statusItem = {
    label: "Estado de revision",
    value: form.caracteristicasPendientes
      ? "Pendiente por revisar en recepcion"
      : "Datos de revision capturados",
    wide: true,
  };

  if (form.tipoDispositivo === "laptop" || form.tipoDispositivo === "pc") {
    return {
      title: "CARACTERISTICAS DEL EQUIPO",
      columns: 3,
      items: [
        { label: "Procesador", value: form.procesador },
        { label: "RAM", value: form.ram },
        { label: "Disco", value: form.disco },
        { label: "Estado de pantalla", value: form.estadoPantalla },
        { label: "Estado de teclado", value: form.estadoTeclado },
        { label: "Estado de mouse", value: form.estadoMouse },
        { label: "Enciende", value: form.enciendeEquipo },
        { label: "Funciona", value: form.funciona },
        { label: "Contrasena del equipo", value: form.contrasenaEquipo },
        statusItem,
      ],
    };
  }

  if (form.tipoDispositivo === "impresora") {
    return {
      title: "DATOS DE LA IMPRESORA",
      columns: 2,
      items: [
        { label: "Tipo de impresora", value: form.tipoImpresora },
        { label: "Imprime", value: form.imprime },
        { label: "Condiciones", value: form.condicionesImpresora, wide: true },
        statusItem,
      ],
    };
  }

  if (form.tipoDispositivo === "monitor") {
    return {
      title: "DATOS DEL MONITOR",
      columns: 2,
      items: [
        { label: "Tamano", value: form.tamanoMonitor },
        { label: "Colores correctos", value: form.colores },
        { label: "Condiciones", value: form.condicionesMonitor, wide: true },
        statusItem,
      ],
    };
  }

  return {
    title: "REVISION INICIAL",
    columns: 2,
    items: [
      { label: "Tipo de dispositivo", value: form.tipoDispositivo },
      statusItem,
    ],
  };
}

function drawDeviceSection(doc, y, form, setPdfFont) {
  const config = getDeviceSectionConfig(form);
  return drawGridSection(doc, y, config.title, config.items, {
    columns: config.columns,
    fontSize: 8.2,
    setPdfFont,
  });
}

function drawProblemSection(doc, y, form, setPdfFont) {
  const costoTexto = form.precioDespues
    ? "Se define despues del mantenimiento"
    : `$${sanitize(form.costo)}`;
  const definicionCosto = form.precioDespues
    ? "Costo sujeto a revision final"
    : "Costo capturado desde recepcion";

  return drawGridSection(
    doc,
    y,
    "SERVICIO Y COSTO",
    [
      {
        label: "Trabajo solicitado",
        value: form.trabajo,
        wide: true,
      },
      { label: "Costo estimado", value: costoTexto },
      { label: "Definicion de costo", value: definicionCosto },
    ],
    { columns: 2, fontSize: 8.4, setPdfFont },
  );
}

function getTermsForPdf(form) {
  const baseTerms =
    Array.isArray(form?.hojaServicio?.terminos) && form.hojaServicio.terminos.length
      ? form.hojaServicio.terminos.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [...DEFAULT_TERMINOS_SERVICIO];

  if (form?.hojaServicio?.retardo?.habilitado) {
    baseTerms.push(`Retardo y abandono: ${describeRetardoConfig(form.hojaServicio.retardo)}`);
  }

  return baseTerms;
}

function drawTermsSection(doc, y, form, setPdfFont) {
  const terms = getTermsForPdf(form);

  const fontSize = 6.8;
  const fillColor = [63, 135, 166];
  const innerX = BOX_X + 4;
  const innerW = BOX_W - 8;
  const colGap = 8;
  const colWidth = (innerW - colGap) / 2;
  const splitIndex = Math.ceil(terms.length / 2);
  const columns = [terms.slice(0, splitIndex), terms.slice(splitIndex)];

  setPdfFont("normal");
  doc.setFontSize(fontSize);
  const measuredColumns = columns.map((items) =>
    items.map((term) => {
      const lines = doc.splitTextToSize(`- ${term}`, colWidth);
      return {
        lines,
        height: getLinesHeight(doc, lines) + 1.4,
      };
    }),
  );

  const columnHeights = measuredColumns.map((items) =>
    items.reduce((total, item) => total + item.height, 0),
  );
  const sectionHeight = SECTION_HEADER_H + 4 + Math.max(...columnHeights, 10) + 2.5;

  y = ensureSpace(doc, y, sectionHeight);
  drawSectionShell(doc, "TERMINOS Y CONDICIONES", y, sectionHeight, setPdfFont, fillColor);

  setPdfFont("normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(15, 23, 42);

  measuredColumns.forEach((items, columnIndex) => {
    const x = innerX + (columnIndex * (colWidth + colGap));
    let cursorY = y + SECTION_HEADER_H + 4;

    items.forEach((item) => {
      doc.text(item.lines, x, cursorY);
      cursorY += item.height;
    });
  });

  return y + sectionHeight + SECTION_GAP;
}

function drawFirmas(doc, y, setPdfFont) {
  const blockHeight = 13;
  y = ensureSpace(doc, y, blockHeight);

  const leftX = 22;
  const rightX = 118;
  const lineY = y + 7;
  const lineWidth = 68;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.45);
  doc.line(leftX, lineY, leftX + lineWidth, lineY);
  doc.line(rightX, lineY, rightX + lineWidth, lineY);

  setPdfFont("bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8);
  doc.text("NOMBRE Y FIRMA DEL TECNICO", leftX + (lineWidth / 2), y + 11, { align: "center" });
  doc.text("NOMBRE Y FIRMA DEL CLIENTE", rightX + (lineWidth / 2), y + 11, { align: "center" });
}

export async function generarPdfHojaServicio(form, folio) {
  try {
    const empresaCfg = await obtenerEmpresa();
    const empresaCache = readEmpresaConfigCache();
    const nombreEmpresa = empresaCfg?.nombre || empresaCache.nombre;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pdfFont = getPdfFontFamily();
    const setPdfFont = (style = "normal") => doc.setFont(pdfFont, style);

    drawPageBorder(doc);

    let logoDataUrlPng = null;
    try {
      const dataUrl = await fetchAsDataURL(logoUrl);
      logoDataUrlPng = await convertirADataURLPNG(dataUrl);
    } catch (e) {
      console.warn("Logo no cargado:", e.message);
    }

    let y = drawPdfHeader(doc, {
      nombreEmpresa,
      folio,
      logoDataUrlPng,
      setPdfFont,
    });

    y = drawClientSection(doc, y, form, setPdfFont);
    y = drawEquipmentSection(doc, y, form, folio, setPdfFont);
    y = drawDeviceSection(doc, y, form, setPdfFont);
    y = drawProblemSection(doc, y, form, setPdfFont);
    y = drawTermsSection(doc, y, form, setPdfFont);
    drawFirmas(doc, y, setPdfFont);

    doc.save(`comprobante_${folio}.pdf`);
  } catch (err) {
    console.error("Error generando PDF:", err);
    alert("Error generando PDF. Revisa consola (F12).");
  }
}
