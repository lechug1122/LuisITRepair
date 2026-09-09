// Archivo: src/js/services/pdf_hoja_servicio.js

import { jsPDF } from "jspdf";
import logoUrl from "../../assets/logo.png";
import { auth } from "../../initializer/firebase";
import checkAutomotrizUrl from "../../img/check.png";
import { getPdfFontFamily } from "./apariencia_config";
import { obtenerEmpresa, readEmpresaConfigCache } from "./configure_empresa";
import { readImpresorasConfigCache } from "./impresoras_config";
import { printPdfBlobSilently } from "./silent_print";
import {
  DEFAULT_TERMINOS_SERVICIO,
  describeRetardoConfig,
} from "./configure_servicios";
import {
  buildCamposPersonalizados,
  formatCampoServicio,
  getCamposVisiblesTipoNegocio,
  getEtiquetaOpcionTipo,
  inferTipoNegocioServicio,
} from "./tipos_negocio";

const PAGE_X = 5;
const PAGE_Y = 5;
const BOX_X = 9;
const BOX_W = 192;
const SECTION_HEADER_H = 6.5;
const SECTION_GAP = 3.5;

function normalizePaperSize(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "carta" || normalized === "letter" ? "carta" : "a4";
}

function getPdfPageMetrics(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  return {
    pageWidth,
    pageHeight,
    borderWidth: pageWidth - (PAGE_X * 2),
    borderHeight: pageHeight - (PAGE_Y * 2),
    bottomLimit: pageHeight - 8,
  };
}

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
  const metrics = getPdfPageMetrics(doc);
  doc.setLineWidth(0.45);
  doc.setDrawColor(15, 23, 42);
  doc.rect(PAGE_X, PAGE_Y, metrics.borderWidth, metrics.borderHeight);
}

function sanitize(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function getLinesHeight(doc, lines) {
  return doc.getTextDimensions(lines).h;
}

function ensureSpace(doc, y, neededHeight) {
  if (y + neededHeight <= getPdfPageMetrics(doc).bottomLimit) return y;
  doc.addPage();
  drawPageBorder(doc);
  return 12;
}

function drawPdfHeader(doc, { nombreEmpresa, folio, logoDataUrlPng, setPdfFont, tituloHoja }) {
  const rightX = getPdfPageMetrics(doc).pageWidth - 14;

  if (logoDataUrlPng) {
    doc.addImage(logoDataUrlPng, "PNG", 10, 10, 22, 22);
  }

  const ahora = new Date();

  setPdfFont("bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text(nombreEmpresa || "Empresa", 38, 16);
  doc.setFontSize(17);
  doc.text(tituloHoja || "Hoja de Servicio", 38, 24);

  setPdfFont("normal");
  doc.setFontSize(8.6);
  doc.text(
    `Fecha: ${ahora.toLocaleDateString("es-MX")} ${ahora.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    rightX,
    16,
    { align: "right" },
  );
  doc.text(`Folio: ${sanitize(folio)}`, rightX, 22, { align: "right" });

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
  const tipoNegocio = inferTipoNegocioServicio(form);
  const serieTexto = form.omitirNumeroSerie ? "No proporcionado" : sanitize(form.numeroSerie);
  const estadoRegistro = form.caracteristicasPendientes
    ? "Caracteristicas pendientes por revisar"
    : "Caracteristicas registradas";

  return drawGridSection(
    doc,
    y,
    "DATOS DEL EQUIPO",
    [
      {
        label: tipoNegocio?.etiquetaTipoDispositivo || "Tipo de dispositivo",
        value: getEtiquetaOpcionTipo(tipoNegocio, form.tipoDispositivo),
      },
      { label: tipoNegocio?.etiquetaMarca || "Marca", value: form.marca },
      { label: tipoNegocio?.etiquetaModelo || "Modelo", value: form.modelo },
      { label: tipoNegocio?.etiquetaSerie || "Numero de serie", value: serieTexto },
      { label: "Folio", value: folio },
      { label: "Estado de captura", value: estadoRegistro },
    ],
    { columns: 3, fontSize: 8.4, setPdfFont },
  );
}

function drawDeviceSection(doc, y, form, setPdfFont) {
  const tipoNegocio = inferTipoNegocioServicio(form);
  const campos = getCamposVisiblesTipoNegocio(tipoNegocio, form.tipoDispositivo);
  const valores = buildCamposPersonalizados(tipoNegocio, form?.camposPersonalizados, form);
  const items = campos.map((campo) => ({
    label: campo.etiqueta,
    value: formatCampoServicio(campo, valores[campo.id]),
    wide: !!campo.anchoCompleto,
  }));

  items.push({
    label: "Estado de revision",
    value: form.caracteristicasPendientes
      ? "Pendiente por revisar en recepcion"
      : "Datos de revision capturados",
    wide: true,
  });

  return drawGridSection(doc, y, "DATOS ADICIONALES", items, {
    columns: 2,
    fontSize: 8.2,
    setPdfFont,
  });
}

function drawProblemSection(doc, y, form, setPdfFont) {
  const tipoNegocio = inferTipoNegocioServicio(form);
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
        label: tipoNegocio?.etiquetaTrabajo || "Trabajo solicitado",
        value: form.trabajo,
        wide: true,
      },
      { label: tipoNegocio?.etiquetaCosto || "Costo estimado", value: costoTexto },
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

function isAutomotiveTemplate(tipoNegocio, form) {
  const title = String(tipoNegocio?.tituloHoja || tipoNegocio?.nombre || "");
  const fields = form?.camposPersonalizados || {};

  return (
    tipoNegocio?.plantillaPdf === "automotriz" ||
    tipoNegocio?.id === "automotriz" ||
    form?.tipoNegocioId === "automotriz" ||
    ["auto", "moto", "camioneta"].includes(String(form?.tipoDispositivo || "").trim().toLowerCase()) ||
    /automotr/i.test(title) ||
    ["placas", "kilometraje", "anio", "motor", "nivelCombustible", "numeroEconomico"].some((key) =>
      Object.prototype.hasOwnProperty.call(fields, key),
    )
  );
}

function formatCurrencyText(value, currency = "MXN") {
  const amount = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount)) return "$0.00";

  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDateTimeText(value) {
  const date =
    value && typeof value?.toDate === "function"
      ? value.toDate()
      : value
        ? new Date(value)
        : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeCampoToken(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildAutomotiveFieldTracker(tipoNegocio, form) {
  return {
    campos: getCamposVisiblesTipoNegocio(tipoNegocio, form?.tipoDispositivo),
    valores: buildCamposPersonalizados(tipoNegocio, form?.camposPersonalizados, form),
    consumidos: new Set(),
  };
}

function findAutomotiveField(tracker, options = {}) {
  const ids = Array.isArray(options.ids) ? options.ids : [];
  const labels = Array.isArray(options.labels) ? options.labels : [];

  for (const id of ids.map((item) => String(item || "").trim()).filter(Boolean)) {
    const found = tracker.campos.find((campo) => String(campo?.id || "").trim() === id);
    if (found) return found;
  }

  const normalizedCandidates = [...ids, ...labels]
    .map(normalizeCampoToken)
    .filter(Boolean);

  for (const candidate of normalizedCandidates) {
    const found = tracker.campos.find((campo) => {
      const fieldId = normalizeCampoToken(campo?.id);
      const fieldLabel = normalizeCampoToken(campo?.etiqueta);

      return (
        fieldId === candidate ||
        fieldLabel === candidate ||
        fieldId.includes(candidate) ||
        fieldLabel.includes(candidate) ||
        candidate.includes(fieldId) ||
        candidate.includes(fieldLabel)
      );
    });

    if (found) return found;
  }

  return null;
}

function resolveAutomotiveField(tracker, options = {}) {
  const campo = findAutomotiveField(tracker, options);
  if (!campo) {
    return {
      campo: null,
      value: "",
      formatted: options.fallback || "-",
    };
  }

  if (options.consume !== false) {
    tracker.consumidos.add(campo.id);
  }

  const value = tracker.valores[campo.id];
  return {
    campo,
    value,
    formatted: formatCampoServicio(campo, value),
  };
}

function buildAutomotiveExtraItems(tracker) {
  return tracker.campos
    .filter((campo) => !tracker.consumidos.has(campo.id))
    .map((campo) => ({
      label: campo.etiqueta,
      value: formatCampoServicio(campo, tracker.valores[campo.id]),
      wide: !!campo.anchoCompleto || campo.tipo === "textarea",
    }));
}

function fitTextLines(doc, text, width, maxLines = 2) {
  const lines = doc.splitTextToSize(sanitize(text), width);
  if (lines.length <= maxLines) return lines;

  const clipped = lines.slice(0, maxLines);
  const last = String(clipped[maxLines - 1] || "");
  clipped[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 3))}...`;
  return clipped;
}

function drawAutomotiveBox(doc, x, y, w, h) {
  doc.setDrawColor(166, 166, 166);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h);
}

function drawAutomotiveBand(doc, x, y, w, title, setPdfFont, align = "center") {
  doc.setFillColor(191, 191, 191);
  doc.rect(x, y, w, 6, "F");
  setPdfFont("bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8);
  doc.text(String(title || "").toUpperCase(), align === "center" ? x + (w / 2) : x + 2, y + 4.1, {
    align,
  });
}

function drawAutomotiveTableCell(doc, x, y, w, h, label, value, setPdfFont, options = {}) {
  drawAutomotiveBox(doc, x, y, w, h);
  setPdfFont("bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(options.labelSize || 6.6);
  doc.text(String(label || ""), x + 1.5, y + 3.8);

  setPdfFont("normal");
  doc.setFontSize(options.valueSize || 7.6);
  const lines = fitTextLines(doc, value, w - 3, options.maxLines || 2);
  doc.text(lines, x + 1.5, y + 7.6);
}

function drawAutomotiveCheckItem(doc, x, y, label, checked, setPdfFont) {
  doc.setDrawColor(80, 80, 80);
  doc.rect(x, y - 2.6, 3.2, 3.2);

  if (checked) {
    doc.setLineWidth(0.3);
    doc.line(x + 0.6, y - 1.2, x + 1.5, y + 0.1);
    doc.line(x + 1.5, y + 0.1, x + 2.8, y - 2);
  }

  setPdfFont("normal");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(6.9);
  doc.text(String(label || ""), x + 4.3, y);
}

function drawFuelGauge(doc, x, y, w, selected, setPdfFont) {
  const labels = [
    { value: "Vacio", short: "E" },
    { value: "1/4", short: "1/4" },
    { value: "1/2", short: "1/2" },
    { value: "3/4", short: "3/4" },
    { value: "Lleno", short: "F" },
  ];

  const normalized = sanitize(selected);
  const gap = w / Math.max(1, labels.length - 1);

  setPdfFont("bold");
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text("COMBUSTIBLE", x + (w / 2), y, { align: "center" });

  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.25);
  doc.line(x + 4, y + 4, x + w - 4, y + 4);

  labels.forEach((item, index) => {
    const cx = x + (index * gap);
    const active = normalized === item.value;
    doc.setFillColor(active ? 245 : 255, active ? 158 : 255, active ? 11 : 255);
    doc.circle(cx, y + 4, 1.6, active ? "FD" : "S");
    setPdfFont("normal");
    doc.setFontSize(6.1);
    doc.text(item.short, cx, y + 9, { align: "center" });
  });
}

function drawAutomotiveHeader(doc, data) {
  const {
    nombreEmpresa,
    subtituloEmpresa,
    folio,
    logoDataUrlPng,
    setPdfFont,
    tituloHoja,
    form,
  } = data;
  const registradoPor =
    sanitize(form?.registradoPor) !== "-"
      ? sanitize(form?.registradoPor)
      : sanitize(auth.currentUser?.displayName || auth.currentUser?.email || "Sistema");

  drawAutomotiveBox(doc, 10, 10, 92, 31);
  if (logoDataUrlPng) {
    doc.addImage(logoDataUrlPng, "PNG", 12.5, 13.5, 18, 18);
  }

  setPdfFont("bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(7.8);
  doc.text(nombreEmpresa || "Empresa", logoDataUrlPng ? 34 : 12, 17);

  setPdfFont("normal");
  doc.setFontSize(6.4);
  const subtitleLines = fitTextLines(
    doc,
    subtituloEmpresa || "Orden de recepcion automotriz",
    logoDataUrlPng ? 62 : 86,
    2,
  );
  doc.text(subtitleLines, logoDataUrlPng ? 34 : 12, 23);
  doc.text("Su satisfaccion es nuestro compromiso", 16, 35);

  drawAutomotiveBox(doc, 102, 10, 99, 31);
  drawAutomotiveBand(doc, 102, 10, 99, tituloHoja || "Orden de servicio", setPdfFont);

  setPdfFont("bold");
  doc.setFontSize(7.5);
  doc.text(`Folio: ${sanitize(folio)}`, 104, 21);
  doc.text(`Fecha: ${formatDateTimeText(form?.createdAt)}`, 104, 26);
  doc.text(`Registro: ${registradoPor}`, 104, 31);
}

function drawAutomotiveContacts(doc, data) {
  const { nombreEmpresa, subtituloEmpresa, form, setPdfFont } = data;

  drawAutomotiveBox(doc, 10, 43, 92, 28);
  drawAutomotiveBand(doc, 10, 43, 92, "Emisor", setPdfFont);
  setPdfFont("bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(nombreEmpresa || "Empresa", 12, 53);
  setPdfFont("normal");
  doc.setFontSize(6.8);
  const emisorLines = [
    ...fitTextLines(doc, subtituloEmpresa || "Servicio automotriz", 86, 2),
    "Mexico",
  ];
  doc.text(emisorLines, 12, 58);

  drawAutomotiveBox(doc, 102, 43, 99, 28);
  drawAutomotiveBand(doc, 102, 43, 99, "Receptor", setPdfFont);
  setPdfFont("bold");
  doc.setFontSize(7.4);
  doc.text(sanitize(form?.nombre), 104, 53);
  setPdfFont("normal");
  doc.setFontSize(6.8);
  const receptorLines = [
    ...fitTextLines(doc, form?.direccion, 93, 2),
    `Tel: ${sanitize(form?.telefono)}`,
  ];
  doc.text(receptorLines, 104, 58);
}

function drawAutomotiveReception(doc, data) {
  const { fieldTracker, setPdfFont, y = 104 } = data;
  const checkItems = [
    ["Tapetes", resolveAutomotiveField(fieldTracker, { ids: ["tapetes"], labels: ["Tapetes"] }).value],
    ["Espejos", resolveAutomotiveField(fieldTracker, { ids: ["espejos"], labels: ["Espejos"] }).value],
    ["Radio / caratula", resolveAutomotiveField(fieldTracker, {
      ids: ["radioCaratula"],
      labels: ["Radio / caratula", "Radio", "Caratula"],
    }).value],
    ["Encendedor", resolveAutomotiveField(fieldTracker, { ids: ["encendedor"], labels: ["Encendedor"] }).value],
    ["Bateria / radiador", resolveAutomotiveField(fieldTracker, {
      ids: ["bateriaRadiador"],
      labels: ["Bateria / radiador"],
    }).value],
    ["Retrovisor", resolveAutomotiveField(fieldTracker, { ids: ["retrovisor"], labels: ["Retrovisor"] }).value],
    ["Check engine", resolveAutomotiveField(fieldTracker, { ids: ["checkEngine"], labels: ["Check engine"] }).value],
    ["Objetos de valor", resolveAutomotiveField(fieldTracker, {
      ids: ["objetosValor"],
      labels: ["Objetos de valor"],
    }).value],
    ["Gato", resolveAutomotiveField(fieldTracker, { ids: ["gato"], labels: ["Gato"] }).value],
    ["Herramientas", resolveAutomotiveField(fieldTracker, {
      ids: ["herramientas"],
      labels: ["Herramientas"],
    }).value],
    ["Llantas", resolveAutomotiveField(fieldTracker, { ids: ["llantas"], labels: ["Llantas"] }).value],
    ["Antenas", resolveAutomotiveField(fieldTracker, { ids: ["antenas"], labels: ["Antenas"] }).value],
    ["Tapones", resolveAutomotiveField(fieldTracker, { ids: ["tapones"], labels: ["Tapones"] }).value],
  ];
  const x = 10;
  const w = 191;
  const h = 44;

  drawAutomotiveBox(doc, x, y, w, h);
  drawAutomotiveBand(doc, x, y, w, "Revision y recepcion", setPdfFont);

  const leftX = x + 3;
  const rightX = 132;
  const startY = y + 11;
  const colWidth = 39;

  checkItems.forEach(([label, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    drawAutomotiveCheckItem(
      doc,
      leftX + (col * colWidth),
      startY + (row * 5.4),
      label,
      !!value,
      setPdfFont,
    );
  });

  const combustible = resolveAutomotiveField(fieldTracker, {
    ids: ["nivelCombustible"],
    labels: ["Nivel de combustible", "Combustible"],
  }).formatted;
  const enciendeVehiculo = resolveAutomotiveField(fieldTracker, {
    ids: ["enciendeVehiculo"],
    labels: ["Enciende"],
  }).formatted;
  const transmision = resolveAutomotiveField(fieldTracker, {
    ids: ["transmision"],
    labels: ["Transmision"],
  }).formatted;
  const accesoriosVehiculo = resolveAutomotiveField(fieldTracker, {
    ids: ["accesoriosVehiculo"],
    labels: ["Objetos o accesorios dentro del vehiculo", "Accesorios / interior"],
  }).formatted;

  drawFuelGauge(doc, rightX + 7, y + 13.5, 50, combustible, setPdfFont);

  drawAutomotiveTableCell(
    doc,
    rightX,
    y + 18,
    32,
    10,
    "Enciende",
    enciendeVehiculo,
    setPdfFont,
    { maxLines: 1 },
  );
  drawAutomotiveTableCell(
    doc,
    rightX + 33,
    y + 18,
    35,
    10,
    "Transmision",
    transmision,
    setPdfFont,
    { maxLines: 1 },
  );

  drawAutomotiveTableCell(
    doc,
    rightX,
    y + 29,
    68,
    13,
    "Accesorios / interior",
    accesoriosVehiculo,
    setPdfFont,
    { valueSize: 6.8, maxLines: 3 },
  );

  return y + h + 4;
}

function drawAutomotiveChecklistImage(doc, data) {
  const { fieldTracker, setPdfFont, checklistDataUrlPng, y = 104 } = data;
  const x = 10;
  const w = 191;
  const h = 38;

  if (checklistDataUrlPng) {
    doc.addImage(checklistDataUrlPng, "PNG", x, y, w, h);
  } else {
    return drawAutomotiveReception(doc, { fieldTracker, setPdfFont, y });
  }

  return y + h + 4;
}

function drawAutomotiveVehicleData(doc, data) {
  const { fieldTracker, form, tipoNegocio, setPdfFont, y = 74 } = data;
  const numeroEconomico = resolveAutomotiveField(fieldTracker, {
    ids: ["numeroEconomico"],
    labels: ["# Economico", "Numero economico"],
  }).formatted;
  const anio = resolveAutomotiveField(fieldTracker, {
    ids: ["anio"],
    labels: ["Año", "Anio", "Ano"],
  }).formatted;
  const color = resolveAutomotiveField(fieldTracker, {
    ids: ["colorVehiculo", "colorEquipo", "color"],
    labels: ["Color", "Color del vehiculo", "Color del equipo"],
  }).formatted;
  const kilometraje = resolveAutomotiveField(fieldTracker, {
    ids: ["kilometraje"],
    labels: ["KMS / Millas", "Kilometraje"],
  }).formatted;
  const motor = resolveAutomotiveField(fieldTracker, {
    ids: ["motor"],
    labels: ["Motor"],
  }).formatted;
  const placas = resolveAutomotiveField(fieldTracker, {
    ids: ["placas"],
    labels: ["Placas"],
  }).formatted;
  const startX = 10;
  const rowH = 12;
  const firstRow = [
    { label: "#Econ.", value: numeroEconomico, width: 30 },
    { label: "Marca", value: form?.marca, width: 30 },
    { label: "Modelo", value: form?.modelo, width: 36 },
    { label: "Año", value: anio, width: 24 },
    { label: "Color", value: color, width: 24 },
    { label: "Tipo", value: getEtiquetaOpcionTipo(tipoNegocio, form?.tipoDispositivo), width: 47 },
  ];
  const secondRow = [
    { label: "Serie", value: form?.omitirNumeroSerie ? "No proporcionado" : form?.numeroSerie, width: 46 },
    { label: "KMS / Millas", value: kilometraje, width: 30 },
    { label: "Motor", value: motor, width: 36 },
    { label: "Placas", value: placas, width: 38 },
    { label: "Estado captura", value: form?.caracteristicasPendientes ? "Pendiente" : "Completa", width: 41 },
  ];

  let cursorX = startX;
  firstRow.forEach((cell) => {
    drawAutomotiveTableCell(doc, cursorX, y, cell.width, rowH, cell.label, cell.value, setPdfFont);
    cursorX += cell.width;
  });

  cursorX = startX;
  secondRow.forEach((cell) => {
    drawAutomotiveTableCell(doc, cursorX, y + rowH, cell.width, rowH, cell.label, cell.value, setPdfFont);
    cursorX += cell.width;
  });
}

function drawAutomotiveServiceTable(doc, data) {
  const { form, setPdfFont, moneda, y = 145 } = data;
  const x = 10;
  const widths = [18, 18, 84, 22, 24, 25];
  const labels = ["Cantidad", "U.M", "Descripcion", "Impuestos", "Precio unit.", "Importe"];
  const rawCost = Number(String(form?.costo ?? "").replace(/[^\d.-]/g, ""));
  const hasCost = Number.isFinite(rawCost) && rawCost > 0 && !form?.precioDespues;
  const amountText = hasCost ? formatCurrencyText(rawCost, moneda) : "Por definir";
  const rowValues = [
    "1.00",
    "Servicio",
    sanitize(form?.trabajo),
    formatCurrencyText(0, moneda),
    amountText,
    amountText,
  ];

  let cursorX = x;
  labels.forEach((label, index) => {
    drawAutomotiveBand(doc, cursorX, y, widths[index], label, setPdfFont, "left");
    doc.setDrawColor(166, 166, 166);
    doc.rect(cursorX, y + 6, widths[index], 12);
    setPdfFont("normal");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(index === 2 ? 6.8 : 7);
    const maxLines = index === 2 ? 3 : 1;
    const lines = fitTextLines(doc, rowValues[index], widths[index] - 3, maxLines);
    doc.text(lines, cursorX + 1.5, y + 10.5);
    cursorX += widths[index];
  });

  return hasCost ? rawCost : 0;
}

function drawAutomotiveCommentsAndTotals(doc, data) {
  const { fieldTracker, setPdfFont, moneda, total, y = 164 } = data;
  const comentariosRecepcion = resolveAutomotiveField(fieldTracker, {
    ids: ["comentariosRecepcion"],
    labels: ["Comentarios de recepcion", "Comentarios"],
  }).formatted;
  const detalleFisicoVehiculo = resolveAutomotiveField(fieldTracker, {
    ids: ["detalleFisicoVehiculo"],
    labels: ["Condiciones fisicas / danos visibles", "Detalle fisico"],
  }).formatted;
  const comments = [
    sanitize(comentariosRecepcion) !== "-" ? `Recepcion: ${comentariosRecepcion}` : "",
    sanitize(detalleFisicoVehiculo) !== "-" ? `Detalle fisico: ${detalleFisicoVehiculo}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const x = 10;

  drawAutomotiveTableCell(doc, x, y, 108, 27, "Comentarios", comments, setPdfFont, {
    valueSize: 6.8,
    maxLines: 5,
  });

  const totalsX = 118;
  const totalsW = 83;
  const totals = [
    ["Subtotal", formatCurrencyText(total, moneda)],
    ["Descuento", formatCurrencyText(0, moneda)],
    ["Impuestos", formatCurrencyText(0, moneda)],
    ["Total", formatCurrencyText(total, moneda)],
  ];

  totals.forEach((item, index) => {
    const rowY = y + (index * 6.75);
    drawAutomotiveBox(doc, totalsX, rowY, totalsW, 6.75);
    setPdfFont("bold");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(7.1);
    doc.text(item[0], totalsX + 34, rowY + 4.3);
    setPdfFont("normal");
    doc.text(item[1], totalsX + totalsW - 2, rowY + 4.3, { align: "right" });
  });

  return y + 31;
}

function drawAutomotiveSignatures(doc, setPdfFont, y = 196) {
  y = ensureSpace(doc, y, 23);
  drawAutomotiveBox(doc, 10, y, 95.5, 23);
  drawAutomotiveBox(doc, 105.5, y, 95.5, 23);

  setPdfFont("bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("EL PRESTADOR DEL SERVICIO", 57.5, y + 7.5, { align: "center" });
  doc.text("FIRMA DEL CLIENTE", 153, y + 7.5, { align: "center" });

  doc.setLineWidth(0.25);
  doc.line(20, y + 16, 95, y + 16);
  doc.line(116, y + 16, 191, y + 16);

  setPdfFont("normal");
  doc.setFontSize(6.8);
  doc.text("Acepto y autorizo el trabajo descrito en esta orden de servicio", 153, y + 20, {
    align: "center",
  });
}

function drawAutomotivePdf(doc, data) {
  const {
    form,
    folio,
    nombreEmpresa,
    empresaCfg,
    logoDataUrlPng,
    checklistDataUrlPng,
    setPdfFont,
    tipoNegocio,
  } = data;
  const moneda = form?.moneda || "MXN";
  const fieldTracker = buildAutomotiveFieldTracker(tipoNegocio, form);

  drawAutomotiveHeader(doc, {
    nombreEmpresa,
    subtituloEmpresa: empresaCfg?.subtitulo || "",
    folio,
    logoDataUrlPng,
    setPdfFont,
    tituloHoja: tipoNegocio?.tituloHoja || "Orden de servicio automotriz",
    form,
  });
  drawAutomotiveContacts(doc, {
    nombreEmpresa,
    subtituloEmpresa: empresaCfg?.subtitulo || "",
    form,
    setPdfFont,
  });
  drawAutomotiveVehicleData(doc, {
    fieldTracker,
    form,
    tipoNegocio,
    setPdfFont,
    y: 74,
  });
  const checklistEndY = drawAutomotiveChecklistImage(doc, {
    fieldTracker,
    setPdfFont,
    checklistDataUrlPng,
    y: 102,
  });
  const total = drawAutomotiveServiceTable(doc, {
    form,
    setPdfFont,
    moneda,
    y: checklistEndY,
  });
  let yAfterContent = drawAutomotiveCommentsAndTotals(doc, {
    fieldTracker,
    setPdfFont,
    moneda,
    total,
    y: checklistEndY + 19,
  });

  const extraItems = buildAutomotiveExtraItems(fieldTracker);
  if (extraItems.length) {
    yAfterContent = drawGridSection(doc, yAfterContent, "DATOS ADICIONALES DEL VEHICULO", extraItems, {
      columns: 2,
      fontSize: 8,
      setPdfFont,
      fillColor: [63, 135, 166],
    });
  }

  const yAfterTerms = drawTermsSection(doc, yAfterContent, form, setPdfFont);
  drawAutomotiveSignatures(doc, setPdfFont, yAfterTerms);
}

function downloadPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openPdfPrintDialog(blob, targetWindow = null) {
  return new Promise((resolve, reject) => {
    const popup = targetWindow && !targetWindow.closed
      ? targetWindow
      : window.open("", "_blank", "width=960,height=720");

    if (!popup) {
      reject(new Error("El navegador bloqueo la ventana de impresion."));
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    try {
      popup.location.replace(blobUrl);
      popup.focus();
      window.setTimeout(() => {
        resolve();
      }, 900);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      reject(error);
    }
  });
}

export async function generarPdfHojaServicio(form, folio, options = {}) {
  try {
    const {
      download = true,
      openPrint = false,
      printWindow = null,
      silentPrint = false,
      printerName = "",
      paperSize = "",
    } = options;
    const empresaCfg = await obtenerEmpresa();
    const empresaCache = readEmpresaConfigCache();
    const printerCfg = readImpresorasConfigCache();
    const nombreEmpresa = empresaCfg?.nombre || empresaCache.nombre;
    const tipoNegocio = inferTipoNegocioServicio(form, empresaCfg || empresaCache);
    const normalizedPaperSize = normalizePaperSize(
      paperSize || printerCfg?.tamanoHojaServicio || "a4",
    );
    const doc = new jsPDF({
      unit: "mm",
      format: normalizedPaperSize === "carta" ? "letter" : "a4",
    });
    const pdfFont = getPdfFontFamily();
    const setPdfFont = (style = "normal") => doc.setFont(pdfFont, style);

    drawPageBorder(doc);

    let logoDataUrlPng = null;
    let checklistDataUrlPng = null;
    try {
      // El logo del negocio (si lo subio) reemplaza al del sistema.
      const logoNegocio = String(empresaCfg?.logo || empresaCache?.logo || "").trim();
      const dataUrl = await fetchAsDataURL(logoNegocio || logoUrl);
      logoDataUrlPng = await convertirADataURLPNG(dataUrl);
    } catch (e) {
      console.warn("Logo no cargado:", e.message);
    }

    const useAutomotivePdf = isAutomotiveTemplate(tipoNegocio, form);

    if (useAutomotivePdf) {
      try {
        const dataUrl = await fetchAsDataURL(checkAutomotrizUrl);
        checklistDataUrlPng = await convertirADataURLPNG(dataUrl);
      } catch (e) {
        console.warn("Imagen automotriz no cargada:", e.message);
      }
    }

    let y = drawPdfHeader(doc, {
      nombreEmpresa,
      folio,
      logoDataUrlPng,
      setPdfFont,
      tituloHoja: tipoNegocio?.tituloHoja || "Hoja de Servicio",
    });

    if (useAutomotivePdf) {
      const metrics = getPdfPageMetrics(doc);
      doc.setFillColor(255, 255, 255);
      doc.rect(8.5, 8.5, metrics.pageWidth - 17, metrics.pageHeight - 17, "F");
      drawPageBorder(doc);
      drawAutomotivePdf(doc, {
        form,
        folio,
        nombreEmpresa,
        empresaCfg,
        logoDataUrlPng,
        checklistDataUrlPng,
        setPdfFont,
        tipoNegocio,
      });
    } else {
      y = drawClientSection(doc, y, form, setPdfFont);
      y = drawEquipmentSection(doc, y, form, folio, setPdfFont);
      y = drawDeviceSection(doc, y, form, setPdfFont);
      y = drawProblemSection(doc, y, form, setPdfFont);
      y = drawTermsSection(doc, y, form, setPdfFont);
      drawFirmas(doc, y, setPdfFont);
    }

    if (openPrint && typeof doc.autoPrint === "function") {
      doc.autoPrint();
    }

    const filename = `comprobante_${folio}.pdf`;
    const pdfBlob = doc.output("blob");

    if (download) {
      downloadPdfBlob(pdfBlob, filename);
    }

    if (silentPrint) {
      await printPdfBlobSilently({
        pdfBlob,
        printerName,
        jobName: `Hoja de servicio ${folio}`.trim(),
        paperSize: normalizedPaperSize,
      });
    }

    if (openPrint) {
      try {
        await openPdfPrintDialog(pdfBlob, printWindow);
      } catch (printError) {
        console.warn("No se pudo abrir la impresion automatica del PDF:", printError);
        if (!download) throw printError;
      }
    }

    return {
      ok: true,
      filename,
    };
  } catch (err) {
    console.error("Error generando PDF:", err);
    alert("Error generando PDF. Revisa consola (F12).");
  }
}
