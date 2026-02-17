const escapeHtml = (value) => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const formatMoney = (value) => {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(Number(value || 0));
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("es-MX");
};

const LOGO_URL = new URL("../assets/logo.png", import.meta.url).href;

export function imprimirTicketVenta({
  ventaId,
  fecha,
  cliente,
  tipoPago,
  referenciaTarjeta,
  productos,
  estado,
  subtotal,
  iva,
  total
}) {
  const popup = window.open("", "_blank", "width=420,height=760");

  if (!popup) {
    alert("Bloqueado por el navegador. Permite popups para imprimir.");
    return;
  }

  const filas = (productos || [])
    .map((p) => {
      const cantidad = Number(p.cantidad || 0);
      const precio = Number(p.precioVenta || 0);
      const totalLinea = cantidad * precio;
      const etiqueta = p.esServicio ? `Servicio ${escapeHtml(p.servicioFolio || "")}` : "Producto";

      return `
        <div class="ticket-item">
          <div class="ticket-item-name">${escapeHtml(p.nombre || "-")}</div>
          <div class="ticket-item-meta">${etiqueta}</div>
          <div class="ticket-item-row">
            <span>${cantidad} x ${formatMoney(precio)}</span>
            <b>${formatMoney(totalLinea)}</b>
          </div>
        </div>
      `;
    })
    .join("");

  const pagoLabel = tipoPago === "tarjeta" ? "Tarjeta" : "Efectivo";
  const refTarjeta = tipoPago === "tarjeta" && referenciaTarjeta
    ? `<div><b>Referencia:</b> ${escapeHtml(referenciaTarjeta)}</div>`
    : "";

  popup.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Ticket de Venta</title>
        <style>
          @page { size: 58mm auto; margin: 0; }
          html, body {
            margin: 0;
            padding: 0;
            width: 58mm;
            background: #fff;
            font-family: "Courier New", monospace;
            font-size: 12px;
          }
          .ticket-paper {
            width: 58mm;
            background: #fff;
            border-radius: 0;
            border: none;
            padding: 3mm;
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
            height: 45px;
            object-fit: contain;
          }
          .ticket-title {
            font-size: 16px;
            font-weight: 800;
          }
          .ticket-sub {
            font-size: 12px;
            opacity: 0.85;
            margin-top: 2px;
          }
          .ticket-section {
            margin-top: 10px;
            font-size: 12px;
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
            font-size: 11px;
            color: #16a34a;
          }
          .ticket-total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
          }
          .ticket-total-final {
            font-weight: 800;
            font-size: 13px;
          }
          .ticket-legend {
            margin-top: 8px;
            text-align: center;
            line-height: 1.35;
          }
          .ticket-footer {
            text-align: center;
            margin-top: 12px;
            font-size: 12px;
            opacity: 0.85;
          }
        </style>
      </head>
      <body>
        <div class="ticket-paper">
          <div class="ticket-header">
            <div class="ticket-logo">
              <img src="${LOGO_URL}" alt="Logo negocio" />
            </div>
            <div class="ticket-title">LuisITRepair</div>
            <div class="ticket-sub">Ticket de venta</div>
            <div class="ticket-sub">Folio: <b>${escapeHtml(ventaId || "-")}</b></div>
            <div class="ticket-sub">Fecha: ${escapeHtml(formatDate(fecha))}</div>
          </div>

          <div class="ticket-section">
            <div class="ticket-section-title">Cliente</div>
            <div>${escapeHtml(cliente?.nombre || "Publico general")}</div>
            <div>Tel: ${escapeHtml(cliente?.telefono || "-")}</div>
          </div>

          <div class="ticket-section">
            <div class="ticket-section-title">Conceptos y precio</div>
            ${filas || "<div>-</div>"}
          </div>

          <div class="ticket-section">
            <div class="ticket-section-title">Pago</div>
            <div><b>Metodo:</b> ${escapeHtml(pagoLabel)}</div>
            ${refTarjeta}
          </div>

          <div class="ticket-section">
            <div class="ticket-section-title">Estado actual</div>
            <div class="ticket-status-row">
              <span class="ticket-dot"></span>
              <span class="ticket-status-pill">${escapeHtml(estado || "Pagado")}</span>
            </div>
          </div>

          <div class="ticket-divider"></div>

          <div class="ticket-section">
            <div class="ticket-total-row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
            <div class="ticket-total-row"><span>IVA</span><span>${formatMoney(iva)}</span></div>
            <div class="ticket-total-row ticket-total-final"><span>Total</span><span>${formatMoney(total)}</span></div>
          </div>

          <div class="ticket-legend">
            Se aceptan cambios con ticket en producto en buen estado.
          </div>

          <div class="ticket-footer">Gracias por tu preferencia.</div>
        </div>
        <script>
          window.onload = () => {
            window.print();
            window.onafterprint = () => window.close();
          };
        </script>
      </body>
    </html>
  `);

  popup.document.close();
}
