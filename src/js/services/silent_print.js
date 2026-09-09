import html2canvas from "html2canvas";
// The local app can run on Chromium/WebView builds that still lack
// Map/WeakMap.prototype.getOrInsertComputed used by the modern pdf.js bundle.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { readEmpresaConfigCache } from "./configure_empresa";
import { readImpresorasConfigCache } from "./impresoras_config";
import { formatCurrency, readMonedaConfigCache } from "./moneda_config";
import {
  buildTicketConfig,
  readTicketConfigStorage,
  splitTicketLines,
} from "./ticket_config";
import { getEtiquetaOpcionTipo, inferTipoNegocioServicio } from "./tipos_negocio";

const TEXT_PRINT_ENDPOINTS = [
  "/api/system/print-text",
  "http://127.0.0.1:3210/api/print-text",
];

const IMAGE_PRINT_ENDPOINTS = [
  "/api/system/print-image",
  "http://127.0.0.1:3210/api/print-image",
];

const RECEIPT_WIDTH = 32;

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

function sanitizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function centerText(text, width = RECEIPT_WIDTH) {
  const clean = sanitizeText(text).trim();
  if (!clean) return "";
  if (clean.length >= width) return clean;
  const left = Math.floor((width - clean.length) / 2);
  return `${" ".repeat(Math.max(0, left))}${clean}`;
}

function wrapText(text, width = RECEIPT_WIDTH) {
  const rawLines = sanitizeText(text).split(/\r?\n/);
  const lines = [];

  rawLines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      lines.push("");
      return;
    }

    const words = line.split(/\s+/);
    let current = "";

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= width) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word.length > width ? word.slice(0, width) : word;
      }
    });

    if (current) lines.push(current);
  });

  return lines;
}

function pushWrapped(lines, text, options = {}) {
  const wrapped = wrapText(text, options.width || RECEIPT_WIDTH);
  if (!wrapped.length) return;
  wrapped.forEach((line) => lines.push(line));
}

function pushDivider(lines) {
  lines.push("-".repeat(RECEIPT_WIDTH));
}

function pushKeyValue(lines, label, value) {
  const left = sanitizeText(label);
  const right = sanitizeText(value);
  if (!left && !right) return;

  if (left.length + right.length + 1 <= RECEIPT_WIDTH) {
    lines.push(`${left}${" ".repeat(RECEIPT_WIDTH - left.length - right.length)}${right}`);
    return;
  }

  if (left) lines.push(...wrapText(left));
  if (right) lines.push(...wrapText(right));
}

function getBusinessLines(cfg) {
  const empresaCfg = readEmpresaConfigCache();
  if (!cfg.showBusinessData) return [];

  const lines = [];
  const businessName = String(empresaCfg?.nombre || cfg.businessName || "").trim();
  if (businessName) lines.push(businessName);
  if (cfg.businessAddress.trim()) lines.push(cfg.businessAddress.trim());
  if (cfg.businessPhone.trim()) lines.push(cfg.businessPhone.trim());
  return lines;
}

function formatMoney(value) {
  return formatCurrency(value, readMonedaConfigCache());
}

function formatDate(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("es-MX");
}

function formatFirestoreDate(value) {
  if (!value?.seconds) return "-";
  return new Date(value.seconds * 1000).toLocaleString("es-MX");
}

function normalizePaperSize(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "a4";
  if (normalized === "ticket") return "58mm";
  if (/^(?:ticket[-_]?)?\d+(?:\.\d+)?mm$/.test(normalized)) {
    return normalized.replace(/^ticket[-_]?/, "");
  }
  const thermalNumericMatch = normalized.match(/^ticket[-_]?(\d+(?:\.\d+)?)$/);
  if (thermalNumericMatch) {
    return `${thermalNumericMatch[1]}mm`;
  }
  return normalized === "carta" || normalized === "letter" ? "carta" : "a4";
}

function normalizeDeviceTypeLabel(value, tipoNegocio = null) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();

  if (normalized === "auto") return "Auto";
  if (normalized === "moto" || normalized === "motocicleta") return "Moto";
  if (normalized === "camioneta") return "Camioneta";

  return getEtiquetaOpcionTipo(tipoNegocio, raw) || raw || "-";
}

function getServiceSubjectInfo(servicio = {}) {
  const tipoNegocio = inferTipoNegocioServicio(servicio, readEmpresaConfigCache());
  const typeLabel = normalizeDeviceTypeLabel(servicio?.tipoDispositivo, tipoNegocio);
  const isAutomotive = tipoNegocio?.id === "automotriz";
  const safeTypeLabel = typeLabel === "-" ? "Vehiculo" : typeLabel;

  return {
    typeLabel: safeTypeLabel,
    sectionTitle: isAutomotive ? safeTypeLabel.toUpperCase() : "EQUIPO",
    subjectLower: isAutomotive ? safeTypeLabel.toLowerCase() : "equipo",
  };
}

function normalizeStatus(value) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .trim();
}

function getServicePriceLabel(servicio) {
  if (servicio?.precioDespues) return "Se define despues";

  const raw = String(servicio?.costo ?? "").replace(/[^\d.]/g, "");
  if (!raw) return "El precio aparecera en estatus.";

  const amount = Number(raw);
  const status = normalizeStatus(servicio?.status);
  const allowZero = status === "cancelado" || status === "no_reparable";

  if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && !allowZero)) {
    return "El precio aparecera en estatus.";
  }

  return formatMoney(amount);
}

async function postSilentPrint(endpoints, payload) {
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      }

      return await res.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("No se pudo conectar al sistema de impresion silenciosa.");
}

export function buildSaleTicketText(payload = {}) {
  const cfg = buildTicketConfig(payload.ticketConfig || readTicketConfigStorage());
  const lines = [];
  const businessLines = getBusinessLines(cfg);

  businessLines.forEach((line) => lines.push(centerText(line)));
  lines.push(centerText("TICKET DE VENTA"));
  splitTicketLines(cfg.extraTopLines).forEach((line) => lines.push(centerText(line)));
  pushDivider(lines);
  pushWrapped(lines, `Folio: ${payload.ventaId || "-"}`);
  pushWrapped(lines, `Fecha: ${formatDate(payload.fecha)}`);
  pushWrapped(lines, `Atendio: ${payload.atendio || "-"}`);

  if (cfg.showClientSection) {
    pushDivider(lines);
    lines.push("CLIENTE");
    if (cfg.showClientName) pushWrapped(lines, payload.cliente?.nombre || "Publico general");
    if (cfg.showClientPhone) pushWrapped(lines, `Tel: ${payload.cliente?.telefono || "-"}`);
  }

  pushDivider(lines);
  lines.push("CONCEPTOS");
  (payload.productos || []).forEach((item) => {
    const cantidad = Number(item?.cantidad || 0);
    const precio = Number(item?.precioVenta || 0);
    const totalLinea = cantidad * precio;
    const nombre = cfg.fullDescription
      ? String(item?.nombre || "-")
      : String(item?.nombre || "-").slice(0, 42);

    pushWrapped(lines, nombre);

    if (cfg.showProductMeta) {
      const meta = item?.esCanje
        ? "Canje por puntos"
        : item?.esServicio
          ? `Servicio ${item?.servicioFolio || ""}`.trim()
          : "Producto";
      pushWrapped(lines, meta);
    }

    const left = cfg.showUnitPrice
      ? `${cantidad} x ${formatMoney(precio)}`
      : `${cantidad} pza`;
    pushKeyValue(lines, left, formatMoney(totalLinea));
  });

  if (cfg.showPaymentSection) {
    pushDivider(lines);
    lines.push("PAGO");
    const metodo =
      payload.tipoPago === "fiado"
        ? "Fiado"
        : payload.tipoPago === "tarjeta"
        ? "Tarjeta"
        : payload.tipoPago === "transferencia"
          ? "Transferencia"
          : "Efectivo";
    pushWrapped(lines, `Metodo: ${metodo}`);
    if (payload.tipoPago === "tarjeta" && payload.referenciaTarjeta) {
      pushWrapped(lines, `Referencia: ${payload.referenciaTarjeta}`);
    }
  }

  if (cfg.showStatusSection) {
    pushDivider(lines);
    pushWrapped(lines, `Estado: ${payload.estado || "Pagado"}`);
  }

  pushDivider(lines);
  pushKeyValue(
    lines,
    payload.aplicaIVA ? "Subtotal sin IVA" : "Subtotal",
    formatMoney(payload.subtotal || 0),
  );
  if (payload.aplicaIVA) {
    const pct = `${Math.round(Number(payload.ivaPorcentaje || 0) * 100)}%`;
    pushKeyValue(lines, `IVA (${pct})`, formatMoney(payload.iva || 0));
  }
  if (Number(payload.recargoTarjeta || 0) > 0) {
    const proveedor = String(payload.proveedorRecargoTarjeta || "").trim();
    pushKeyValue(
      lines,
      proveedor ? `Recargo tarjeta (${proveedor})` : "Recargo tarjeta",
      formatMoney(payload.recargoTarjeta || 0),
    );
  }
  pushKeyValue(lines, "TOTAL", formatMoney(payload.totalCobro ?? payload.total ?? 0));

  splitTicketLines(cfg.extraBottomLines).forEach((line) => lines.push(centerText(line)));
  if (cfg.showLegend && cfg.legendText?.trim()) pushWrapped(lines, cfg.legendText.trim());
  if (cfg.footerText?.trim()) lines.push(centerText(cfg.footerText.trim()));

  return `${lines.join("\n")}\n\n\n\n`;
}

export function buildServiceTicketText({
  servicio,
  folio,
  urlStatus,
  ticketConfig,
} = {}) {
  const cfg = buildTicketConfig(ticketConfig || readTicketConfigStorage());
  const lines = [];
  const businessLines = getBusinessLines(cfg);
  const subjectInfo = getServiceSubjectInfo(servicio);

  businessLines.forEach((line) => lines.push(centerText(line)));
  lines.push(centerText("HOJA DE SERVICIO"));
  splitTicketLines(cfg.extraTopLines).forEach((line) => lines.push(centerText(line)));
  pushDivider(lines);
  pushWrapped(lines, `Folio: ${servicio?.folio || folio || "-"}`);
  pushWrapped(lines, `Fecha: ${formatFirestoreDate(servicio?.createdAt)}`);

  if (cfg.showClientSection) {
    pushDivider(lines);
    lines.push("CLIENTE");
    if (cfg.showClientName) pushWrapped(lines, `Nombre: ${servicio?.nombre || "-"}`);
    if (cfg.showClientPhone) pushWrapped(lines, `Tel: ${servicio?.telefono || "-"}`);
    pushWrapped(lines, `Direccion: ${servicio?.direccion || "-"}`);
  }

  pushDivider(lines);
  lines.push(subjectInfo.sectionTitle);
  pushWrapped(lines, `Tipo: ${subjectInfo.typeLabel}`);
  pushWrapped(lines, `Marca: ${servicio?.marca || "-"}`);
  pushWrapped(lines, `Modelo: ${servicio?.modelo || "-"}`);
  pushWrapped(
    lines,
    `Serie: ${servicio?.omitirNumeroSerie ? "No proporcionado" : servicio?.numeroSerie || "-"}`,
  );

  pushDivider(lines);
  lines.push("PROBLEMA");
  pushWrapped(lines, servicio?.trabajo || "-");

  pushDivider(lines);
  pushWrapped(
    lines,
    `Precio: ${getServicePriceLabel(servicio)}`,
  );

  if (cfg.showStatusSection) {
    pushDivider(lines);
    pushWrapped(lines, `Estado: ${servicio?.status || "Pendiente"}`);
  }

  pushDivider(lines);
  pushWrapped(lines, `Consulta el estatus de tu ${subjectInfo.subjectLower}:`);
  pushWrapped(lines, urlStatus || "");

  splitTicketLines(cfg.extraBottomLines).forEach((line) => lines.push(centerText(line)));
  if (cfg.showLegend && cfg.legendText?.trim()) pushWrapped(lines, cfg.legendText.trim());
  if (cfg.footerText?.trim()) lines.push(centerText(cfg.footerText.trim()));

  return `${lines.join("\n")}\n\n\n\n`;
}

export async function printTextSilently({
  printerName = "",
  content = "",
  jobName = "LuisITRepair Ticket",
} = {}) {
  return postSilentPrint(TEXT_PRINT_ENDPOINTS, {
    printerName,
    content,
    jobName,
  });
}

export async function printImageSilently({
  printerName = "",
  imageDataUrl = "",
  jobName = "LuisITRepair Ticket",
  paperSize = "a4",
} = {}) {
  return postSilentPrint(IMAGE_PRINT_ENDPOINTS, {
    printerName,
    imageBase64: imageDataUrl,
    jobName,
    paperSize: normalizePaperSize(paperSize),
  });
}

export async function captureElementToPngDataUrl(element, options = {}) {
  if (!element) {
    throw new Error("No se encontro el elemento del ticket para capturarlo.");
  }

  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
    ...options,
  });

  return canvas.toDataURL("image/png");
}

export async function renderPdfBlobToImageDataUrls(pdfBlob, options = {}) {
  if (!pdfBlob) {
    throw new Error("No se recibio el PDF para convertirlo a imagen.");
  }

  const scale = Number(options.scale || 2);
  const loadingTask = pdfjsLib.getDocument({
    data: await pdfBlob.arrayBuffer(),
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });

      if (!context) {
        throw new Error("No se pudo preparar el canvas para imprimir la hoja.");
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      context.save();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      pages.push(canvas.toDataURL("image/png"));
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await loadingTask.destroy().catch(() => {});
  }

  return pages;
}

export async function printPdfBlobSilently({
  pdfBlob,
  printerName = "",
  jobName = "LuisITRepair Hoja de servicio",
  scale = 2,
  paperSize = "a4",
} = {}) {
  const pages = await renderPdfBlobToImageDataUrls(pdfBlob, { scale });

  if (!pages.length) {
    throw new Error("No se pudo convertir la hoja de servicio para impresion silenciosa.");
  }

  const results = [];
  for (let index = 0; index < pages.length; index += 1) {
    const result = await printImageSilently({
      printerName,
      imageDataUrl: pages[index],
      jobName: pages.length > 1 ? `${jobName} - pagina ${index + 1}` : jobName,
      paperSize,
    });
    results.push(result);
  }

  return {
    ok: true,
    pages: pages.length,
    printerName: results[0]?.printerName || printerName,
  };
}

export async function printSaleTicketSilently(payload = {}) {
  const printerCfg = readImpresorasConfigCache();
  return printTextSilently({
    printerName: printerCfg.nombreImpresoraTicket || printerCfg.nombreImpresora || "",
    content: buildSaleTicketText(payload),
    jobName: `Venta ${payload?.ventaId || ""}`.trim() || "Ticket de venta",
  });
}

export async function printServiceTicketSilently(payload = {}) {
  const printerCfg = readImpresorasConfigCache();
  return printTextSilently({
    printerName: printerCfg.nombreImpresoraTicket || printerCfg.nombreImpresora || "",
    content: buildServiceTicketText(payload),
    jobName:
      `Servicio ${payload?.servicio?.folio || payload?.folio || ""}`.trim() || "Hoja de servicio",
  });
}
