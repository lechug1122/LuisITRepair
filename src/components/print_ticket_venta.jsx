import {
  buildTicketConfig,
  readTicketConfigStorage,
  splitTicketLines,
} from "../js/services/ticket_config";
import { getTicketFontFamily } from "../js/services/apariencia_config";
import { readEmpresaConfigCache } from "../js/services/configure_empresa";
import { readImpresorasConfigCache } from "../js/services/impresoras_config";
import { formatCurrency, readMonedaConfigCache } from "../js/services/moneda_config";
import { detectMobileDevice, getTicketPrintWidth } from "../js/services/mobile_detection";
import {
  openTicketImageDataUrl,
  shareTicketImageDataUrl,
} from "../js/services/mobile_ticket_share";
import { captureElementToPngDataUrl, printImageSilently } from "../js/services/silent_print";

const escapeHtml = (value) => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const formatMoney = (value) => formatCurrency(value, readMonedaConfigCache());

const formatDate = (value) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("es-MX");
};

const LOGO_URL = new URL("../assets/logo.png", import.meta.url).href;

function shortenText(value, max = 42) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function renderLines(lines = [], className = "") {
  return lines
    .map((line) => `<div class="${className}">${escapeHtml(line)}</div>`)
    .join("");
}

async function waitForImagesLoaded(root) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }

          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }),
    ),
  );
}

async function captureTicketToImageDataUrl({ ticketBodyHtml, captureStyles, captureClass }) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.background = "#fff";
  host.style.pointerEvents = "none";
  host.innerHTML = `<style>${captureStyles}</style><div class="${captureClass}">${ticketBodyHtml}</div>`;
  document.body.appendChild(host);

  try {
    await waitForImagesLoaded(host);
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    });

    const ticketElement = host.querySelector(".ticket-paper");
    return await captureElementToPngDataUrl(ticketElement);
  } finally {
    host.remove();
  }
}

export async function imprimirTicketVenta({
  ventaId,
  fecha,
  atendio,
  cliente,
  tipoPago,
  referenciaTarjeta,
  productos,
  estado,
  subtotal,
  aplicaIVA = true,
  ivaPorcentaje = 0.16,
  iva,
  recargoTarjeta = 0,
  proveedorRecargoTarjeta = "",
  propina = 0,
  total,
  totalCobro,
  ticketConfig,
  previewOnly = false,
  precuenta = false,
}) {
  const printerCfg = readImpresorasConfigCache();
  const cfg = buildTicketConfig(ticketConfig || readTicketConfigStorage());
  const empresaCfg = readEmpresaConfigCache();
  const atendioTexto = String(atendio || "").trim() || "-";
  const ticketFontFamily = getTicketFontFamily();
  const esVistaMovil = detectMobileDevice();
  const ticketWidth = getTicketPrintWidth(esVistaMovil);
  const baseFontSize = esVistaMovil ? "14px" : "12px";
  const titleFontSize = esVistaMovil ? "20px" : "16px";
  const extraLineFontSize = esVistaMovil ? "13px" : "11px";
  const totalFontSize = esVistaMovil ? "15px" : "13px";
  const logoHeight = esVistaMovil ? "60px" : "45px";
  // Thermal printers commonly lose a few millimeters on the right edge and
  // need extra feed after the last line so the cutter does not trim content.
  const paperPadding = esVistaMovil ? "4mm 10mm 22mm 4mm" : "3mm 10mm 22mm 3mm";
  const popupWidth = esVistaMovil ? 520 : 420;
  const popupHeight = esVistaMovil ? 860 : 760;

  const filas = (productos || [])
    .map((p) => {
      const cantidad = Number(p.cantidad || 0);
      const precio = Number(p.precioVenta || 0);
      const totalLinea = cantidad * precio;
      const nombre = cfg.fullDescription
        ? escapeHtml(p.nombre || "-")
        : escapeHtml(shortenText(p.nombre || "-"));

      // El nombre y el renglón cantidad/precio ya identifican el concepto.
      // Omitimos la etiqueta repetitiva para ahorrar papel térmico.
      const metaHtml = "";

      const cantidadPrecio = cfg.showUnitPrice
        ? `${cantidad} x ${formatMoney(precio)}`
        : `${cantidad} pza`;

      return `
        <div class="ticket-item">
          <div class="ticket-item-name ${cfg.fullDescription ? "" : "single-line"}">${nombre}</div>
          ${metaHtml}
          <div class="ticket-item-row">
            <span>${cantidadPrecio}</span>
            <b>${formatMoney(totalLinea)}</b>
          </div>
        </div>
      `;
    })
    .join("");

  const pagoLabel =
    tipoPago === "tarjeta"
      ? "Tarjeta"
      : tipoPago === "transferencia"
        ? "Transferencia"
        : "Efectivo";

  const refTarjeta =
    tipoPago === "tarjeta" && referenciaTarjeta
      ? `<div><b>Referencia:</b> ${escapeHtml(referenciaTarjeta)}</div>`
      : "";

  const ivaPctLabel = `${Math.round(Number(ivaPorcentaje || 0) * 100)}%`;
  const ivaRow = aplicaIVA
    ? `<div class="ticket-total-row"><span>IVA (${ivaPctLabel})</span><span>${formatMoney(iva)}</span></div>`
    : "";
  const recargoTarjetaMonto = Number(recargoTarjeta || 0);
  const totalFinal = Number(totalCobro ?? total) || 0;
  const recargoTarjetaRow =
    recargoTarjetaMonto > 0
      ? `<div class="ticket-total-row"><span>Recargo tarjeta${proveedorRecargoTarjeta ? ` (${escapeHtml(proveedorRecargoTarjeta)})` : ""}</span><span>${formatMoney(recargoTarjetaMonto)}</span></div>`
      : "";
  const propinaMonto = Number(propina || 0);
  const propinaRow =
    propinaMonto > 0
      ? `<div class="ticket-total-row"><span>Propina</span><span>${formatMoney(propinaMonto)}</span></div>`
      : "";

  const topLines = splitTicketLines(cfg.extraTopLines);
  const bottomLines = splitTicketLines(cfg.extraBottomLines);

  const businessLines = [];
  if (cfg.showBusinessData) {
    const businessName = String(empresaCfg?.nombre || cfg.businessName || "").trim();
    if (businessName) businessLines.push(businessName);
    if (cfg.businessAddress.trim()) businessLines.push(cfg.businessAddress.trim());
    const businessPhone = String(empresaCfg?.telefono || cfg.businessPhone || "").trim();
    if (businessPhone) businessLines.push(`Tel: ${businessPhone}`);
    if (String(empresaCfg?.correoTickets || "").trim()) {
      businessLines.push(`Correo: ${String(empresaCfg.correoTickets).trim()}`);
    }
  }

  const businessHtml = renderLines(businessLines, "ticket-sub");
  const topLinesHtml = renderLines(topLines, "ticket-extra-line");
  const bottomLinesHtml = renderLines(bottomLines, "ticket-extra-line");

  const clientRows = [];
  if (cfg.showClientSection && cfg.showClientName) {
    clientRows.push(`<div>${escapeHtml(cliente?.nombre || "Publico general")}</div>`);
  }
  if (cfg.showClientSection && cfg.showClientPhone) {
    clientRows.push(`<div>Tel: ${escapeHtml(cliente?.telefono || "-")}</div>`);
  }
  const clientSectionHtml =
    cfg.showClientSection && clientRows.length > 0
      ? `
        <div class="ticket-section">
          <div class="ticket-section-title">Cliente</div>
          ${clientRows.join("")}
        </div>
      `
      : "";

  const paymentSectionHtml = cfg.showPaymentSection && !precuenta
    ? `
      <div class="ticket-section">
        <div class="ticket-section-title">Pago</div>
        <div><b>Metodo:</b> ${escapeHtml(pagoLabel)}</div>
        ${refTarjeta}
      </div>
    `
    : "";

  const statusSectionHtml = cfg.showStatusSection && !precuenta
    ? `
      <div class="ticket-section">
        <div class="ticket-section-title">Estado actual</div>
        <div class="ticket-status-row">
          <span class="ticket-dot"></span>
          <span class="ticket-status-pill">${escapeHtml(estado || "Pagado")}</span>
        </div>
      </div>
    `
    : "";

  const legendHtml = cfg.showLegend && cfg.legendText.trim()
    ? `<div class="ticket-legend">${escapeHtml(cfg.legendText)}</div>`
    : "";

  const footerHtml = cfg.footerText.trim()
    ? `<div class="ticket-footer">${escapeHtml(cfg.footerText)}</div>`
    : "";
  const popupStyles = `
    @page { size: ${ticketWidth} auto; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      width: ${ticketWidth};
      background: #fff;
      font-family: ${ticketFontFamily};
      font-size: ${baseFontSize};
    }
    .ticket-paper {
      width: ${ticketWidth};
      background: #fff;
      border-radius: 0;
      border: none;
      padding: ${paperPadding};
      box-sizing: border-box;
    }
    .ticket-header {
      text-align: center;
      margin-bottom: 10px;
    }
    .ticket-logo {
      display: flex;
      justify-content: center;
      margin-bottom: 6px;
    }
    .ticket-logo img {
      width: auto;
      height: ${logoHeight};
      object-fit: contain;
    }
    .ticket-title {
      font-size: ${titleFontSize};
      font-weight: 800;
    }
    .ticket-sub {
      font-size: ${baseFontSize};
      opacity: 0.85;
      margin-top: 2px;
      word-break: break-word;
    }
    .ticket-extra-line {
      font-size: ${extraLineFontSize};
      text-align: center;
      margin-top: 2px;
      word-break: break-word;
    }
    .ticket-section {
      margin-top: 10px;
      font-size: ${baseFontSize};
    }
    .ticket-section-title {
      font-weight: 800;
      margin-bottom: 4px;
    }
    .ticket-item {
      padding: 6px 0;
      border-bottom: 1px dashed rgba(0, 0, 0, 0.2);
    }
    .ticket-item:last-child {
      border-bottom: none;
    }
    .ticket-item-name {
      font-weight: 700;
      word-break: break-word;
    }
    .ticket-item-name.single-line {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ticket-item-meta {
      color: #334155;
      margin-top: 2px;
    }
    .ticket-item-row {
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .ticket-item-row > :last-child,
    .ticket-total-row > :last-child {
      flex: 0 0 auto;
      white-space: nowrap;
      text-align: right;
    }
    .ticket-divider {
      margin: 12px 0;
      border-top: 1px dashed rgba(0, 0, 0, 0.25);
    }
    .ticket-status-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ticket-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #16a34a;
    }
    .ticket-status-pill {
      display: inline-block;
      border: 1px solid #16a34a;
      padding: 4px 8px;
      border-radius: 999px;
      font-weight: 700;
      font-size: ${baseFontSize};
      color: #16a34a;
    }
    .ticket-total-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 3px;
    }
    .ticket-total-row > :first-child {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .ticket-total-final {
      font-weight: 800;
      font-size: ${totalFontSize};
    }
    .ticket-paper.ticket-paper-all-bold,
    .ticket-paper.ticket-paper-all-bold *:not(.ticket-dot) {
      color: #000;
      opacity: 1;
      font-weight: 700;
    }
    .ticket-paper.ticket-paper-all-bold .ticket-title,
    .ticket-paper.ticket-paper-all-bold .ticket-section-title,
    .ticket-paper.ticket-paper-all-bold .ticket-total-final,
    .ticket-paper.ticket-paper-all-bold b,
    .ticket-paper.ticket-paper-all-bold strong {
      font-weight: 800;
    }
    .ticket-legend {
      margin-top: 8px;
      text-align: center;
      line-height: 1.35;
    }
    .ticket-footer {
      text-align: center;
      margin-top: 12px;
      font-size: ${baseFontSize};
      opacity: 0.85;
    }
  `;
  const captureClass = "ticket-silent-capture";
  const captureStyles = `
    .${captureClass} {
      width: ${ticketWidth};
      background: #fff;
      color: #000;
      font-family: ${ticketFontFamily};
      font-size: ${baseFontSize};
    }
    .${captureClass} .ticket-paper {
      width: ${ticketWidth};
      background: #fff;
      border-radius: 0;
      border: none;
      padding: ${paperPadding};
      box-sizing: border-box;
    }
    .${captureClass} .ticket-header {
      text-align: center;
      margin-bottom: 10px;
    }
    .${captureClass} .ticket-logo {
      display: flex;
      justify-content: center;
      margin-bottom: 6px;
    }
    .${captureClass} .ticket-logo img {
      width: auto;
      height: ${logoHeight};
      object-fit: contain;
    }
    .${captureClass} .ticket-title {
      font-size: ${titleFontSize};
      font-weight: 800;
    }
    .${captureClass} .ticket-sub {
      font-size: ${baseFontSize};
      opacity: 0.85;
      margin-top: 2px;
      word-break: break-word;
    }
    .${captureClass} .ticket-extra-line {
      font-size: ${extraLineFontSize};
      text-align: center;
      margin-top: 2px;
      word-break: break-word;
    }
    .${captureClass} .ticket-section {
      margin-top: 10px;
      font-size: ${baseFontSize};
    }
    .${captureClass} .ticket-section-title {
      font-weight: 800;
      margin-bottom: 4px;
    }
    .${captureClass} .ticket-item {
      padding: 6px 0;
      border-bottom: 1px dashed rgba(0, 0, 0, 0.2);
    }
    .${captureClass} .ticket-item:last-child {
      border-bottom: none;
    }
    .${captureClass} .ticket-item-name {
      font-weight: 700;
      word-break: break-word;
    }
    .${captureClass} .ticket-item-name.single-line {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .${captureClass} .ticket-item-meta {
      color: #334155;
      margin-top: 2px;
    }
    .${captureClass} .ticket-item-row {
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .${captureClass} .ticket-item-row > :last-child,
    .${captureClass} .ticket-total-row > :last-child {
      flex: 0 0 auto;
      white-space: nowrap;
      text-align: right;
    }
    .${captureClass} .ticket-divider {
      margin: 12px 0;
      border-top: 1px dashed rgba(0, 0, 0, 0.25);
    }
    .${captureClass} .ticket-status-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .${captureClass} .ticket-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #16a34a;
    }
    .${captureClass} .ticket-status-pill {
      display: inline-block;
      border: 1px solid #16a34a;
      padding: 4px 8px;
      border-radius: 999px;
      font-weight: 700;
      font-size: ${baseFontSize};
      color: #16a34a;
    }
    .${captureClass} .ticket-total-row {
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 3px;
    }
    .${captureClass} .ticket-total-row > :first-child {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .${captureClass} .ticket-total-final {
      font-weight: 800;
      font-size: ${totalFontSize};
    }
    .${captureClass} .ticket-legend {
      margin-top: 8px;
      text-align: center;
      line-height: 1.35;
    }
    .${captureClass} .ticket-footer {
      text-align: center;
      margin-top: 12px;
      font-size: ${baseFontSize};
      opacity: 0.85;
    }
  `;

  const ticketBodyHtml = `
    <div class="ticket-paper ${cfg.boldAllText ? "ticket-paper-all-bold" : ""}">
      <div class="ticket-header">
        ${cfg.showLogo ? `<div class="ticket-logo"><img src="${LOGO_URL}" alt="Logo negocio" /></div>` : ""}
        <div class="ticket-title">${precuenta ? "Precuenta" : "Ticket de venta"}</div>
        ${businessHtml}
        <div class="ticket-sub">Folio: <b>${escapeHtml(ventaId || "-")}</b></div>
        <div class="ticket-sub">Fecha: ${escapeHtml(formatDate(fecha))}</div>
        <div class="ticket-sub">Atendio: ${escapeHtml(atendioTexto)}</div>
        ${topLinesHtml}
      </div>

      ${clientSectionHtml}

      <div class="ticket-section">
        <div class="ticket-section-title">Conceptos y precio</div>
        ${filas || "<div>-</div>"}
      </div>

      ${paymentSectionHtml}
      ${statusSectionHtml}

      <div class="ticket-divider"></div>

      <div class="ticket-section">
        <div class="ticket-total-row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
        ${ivaRow}
        ${recargoTarjetaRow}
        ${propinaRow}
        <div class="ticket-total-row ticket-total-final"><span>Total</span><span>${formatMoney(totalFinal)}</span></div>
      </div>

      ${bottomLinesHtml}
      ${legendHtml}
      ${footerHtml}
    </div>
  `;

  if (!previewOnly && printerCfg.modoImpresion === "silenciosa") {
    try {
      const imageDataUrl = await captureTicketToImageDataUrl({
        ticketBodyHtml,
        captureStyles,
        captureClass,
      });

      await printImageSilently({
        printerName: printerCfg.nombreImpresoraTicket || printerCfg.nombreImpresora || "",
        imageDataUrl,
        paperSize: ticketWidth,
        jobName: precuenta
          ? `Precuenta ${ventaId || ""}`.trim()
          : `Venta ${ventaId || ""}`.trim() || "Ticket de venta",
      });
      return;
    } catch (error) {
      console.warn(
        "[impresion-silenciosa] Ticket de venta. Se usara el dialogo del navegador como respaldo:",
        error,
      );
    }
  }

  if (!previewOnly && esVistaMovil && printerCfg.salidaTicketMovil === "imagen") {
    const imageDataUrl = await captureTicketToImageDataUrl({
      ticketBodyHtml,
      captureStyles,
      captureClass,
    });
    const ventaLabel = String(ventaId || "ticket").trim() || "ticket";
    const filename = `ticket-venta-${ventaLabel}.png`;
    const title = `Ticket ${ventaLabel}`;

    try {
      const shared = await shareTicketImageDataUrl({
        imageDataUrl,
        filename,
        title,
        text: "Abrir con PrinterApp para imprimir el ticket.",
      });
      if (shared) return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.warn("[ticket-mobile-share] No se pudo compartir el ticket de venta:", error);
    }

    if (openTicketImageDataUrl(imageDataUrl, title)) return;
  }

  const popup = window.open("", "_blank", `width=${popupWidth},height=${popupHeight}`);

  if (!popup) {
    alert("Bloqueado por el navegador. Permite popups para imprimir.");
    return;
  }

  popup.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${precuenta ? "Precuenta" : previewOnly ? "Vista previa del ticket" : "Ticket de Venta"}</title>
        <style>${popupStyles}</style>
      </head>
      <body>
        ${ticketBodyHtml}
        ${previewOnly ? "" : `
        <script>
          window.onload = () => {
            window.print();
            window.onafterprint = () => window.close();
          };
        </script>
        `}
      </body>
    </html>
  `);

  popup.document.close();
}

export async function visualizarTicketVenta(payload) {
  return imprimirTicketVenta({
    ...payload,
    previewOnly: true,
  });
}




