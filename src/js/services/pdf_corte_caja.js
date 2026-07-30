import { jsPDF } from "jspdf";
import logoUrl from "../../assets/logo.png";
import { getPdfFontFamily } from "./apariencia_config";
import { obtenerEmpresa, readEmpresaConfigCache } from "./configure_empresa";

const money = (value) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const normalizeDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dateShort = (date) =>
  new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const parseDateKey = (dateKey) => {
  if (!dateKey) return null;
  const [y, m, d] = String(dateKey).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const timeShort = (date) =>
  new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

async function imageToPngDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Logo no disponible (${res.status})`);
  const blob = await res.blob();
  const localUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se pudo leer el logo"));
      i.src = localUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(localUrl);
  }
}

function drawPageFrame(doc) {
  doc.setDrawColor(25, 25, 25);
  doc.setLineWidth(0.25);
  doc.rect(8, 8, 194, 281);
}

function setPdfFont(doc, style = "normal") {
  doc.setFont(getPdfFontFamily(), style);
}

function drawTitleBar(doc, x, y, w, h, text, fillColor = [8, 56, 134]) {
  doc.setFillColor(...fillColor);
  doc.rect(x, y, w, h, "F");
  doc.setTextColor(255, 255, 255);
  setPdfFont(doc, "bold");
  doc.setFontSize(10);
  doc.text(text, x + w / 2, y + h / 2 + 1.5, { align: "center" });
  doc.setTextColor(20, 20, 20);
}

function drawKeyValueRow(doc, x, y, w1, w2, h, key, value) {
  doc.setDrawColor(50, 50, 50);
  doc.rect(x, y, w1, h);
  doc.rect(x + w1, y, w2, h);
  setPdfFont(doc, "bold");
  doc.setFontSize(8.5);
  const keyText = fitTextByWidth(doc, key, Math.max(1, w1 - 4));
  doc.text(keyText, x + 2, y + h / 2 + 1.5);
  setPdfFont(doc, "normal");
  const valueText = fitTextByWidth(doc, String(value || "-"), Math.max(1, w2 - 4));
  doc.text(valueText, x + w1 + 2, y + h / 2 + 1.5);
}

function fitTextByWidth(doc, text, maxWidth) {
  const raw = String(text ?? "");
  if (!raw) return "";
  if (doc.getTextWidth(raw) <= maxWidth) return raw;
  let out = raw;
  while (out.length > 1 && doc.getTextWidth(`${out}...`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

function drawTable(doc, { x, y, widths, headers, rows, rowHeight = 6, fontSize = 8, aligns = [], headerFill = [230, 236, 245] }) {
  let cursorY = y;
  const totalW = widths.reduce((a, b) => a + b, 0);

  doc.setFillColor(...headerFill);
  doc.rect(x, cursorY, totalW, rowHeight, "F");
  doc.setDrawColor(45, 45, 45);
  doc.rect(x, cursorY, totalW, rowHeight);

  let cx = x;
  setPdfFont(doc, "bold");
  doc.setFontSize(fontSize);
  headers.forEach((h, i) => {
    doc.rect(cx, cursorY, widths[i], rowHeight);
    doc.text(String(h), cx + widths[i] / 2, cursorY + rowHeight / 2 + 1.4, { align: "center" });
    cx += widths[i];
  });

  cursorY += rowHeight;
  setPdfFont(doc, "normal");
  rows.forEach((row) => {
    cx = x;
    headers.forEach((_, i) => {
      doc.rect(cx, cursorY, widths[i], rowHeight);
      const value = String(row[i] ?? "");
      const align = aligns[i] || (i >= headers.length - 2 ? "right" : "left");
      const maxW = Math.max(1, widths[i] - 3.2);
      const safeText = fitTextByWidth(doc, value, maxW);
      if (align === "center") {
        doc.text(safeText, cx + widths[i] / 2, cursorY + rowHeight / 2 + 1.4, { align: "center" });
      } else if (align === "right") {
        doc.text(safeText, cx + widths[i] - 1.4, cursorY + rowHeight / 2 + 1.4, { align: "right" });
      } else {
        doc.text(safeText, cx + 1.4, cursorY + rowHeight / 2 + 1.4, { align: "left" });
      }
      cx += widths[i];
    });
    cursorY += rowHeight;
  });

  return cursorY;
}

function drawRestaurantTitleBar(doc, x, y, w, h, text) {
  doc.setFillColor(234, 88, 12);
  doc.rect(x, y, w, h, "F");
  doc.setTextColor(255, 255, 255);
  setPdfFont(doc, "bold");
  doc.setFontSize(10);
  doc.text(text, x + w / 2, y + h / 2 + 1.5, { align: "center" });
  doc.setTextColor(20, 20, 20);
}

function drawRestaurantMetric(doc, x, y, w, label, value, detail) {
  doc.setFillColor(255, 247, 237);
  doc.setDrawColor(251, 146, 60);
  doc.roundedRect(x, y, w, 22, 2, 2, "FD");
  doc.setTextColor(154, 52, 18);
  setPdfFont(doc, "bold");
  doc.setFontSize(14);
  doc.text(fitTextByWidth(doc, String(value), w - 6), x + 3, y + 7);
  doc.setFontSize(7.5);
  doc.text(label, x + 3, y + 12);
  doc.setTextColor(80, 80, 80);
  setPdfFont(doc, "normal");
  doc.setFontSize(6.8);
  doc.text(fitTextByWidth(doc, detail, w - 6), x + 3, y + 18);
  doc.setTextColor(20, 20, 20);
}

function sumDenominaciones(denominaciones = [], selector) {
  return denominaciones.reduce((acc, d) => {
    const valor = Number(d?.valor || 0);
    const cantidad = Number(d?.cantidad || 0);
    if (!selector(valor)) return acc;
    return acc + valor * cantidad;
  }, 0);
}

function getProductosVentaLabel(productos = []) {
  if (!Array.isArray(productos) || productos.length === 0) return "Sin detalle";

  const nombres = productos
    .map((producto) => {
      const nombre = String(
        producto?.nombre || producto?.nombreProducto || producto?.codigo || "",
      ).trim();
      if (!nombre) return "";

      const cantidad = Number(producto?.cantidad || 0);
      return cantidad > 1 ? `${cantidad}x ${nombre}` : nombre;
    })
    .filter(Boolean);

  return nombres.length ? nombres.join(", ") : "Sin detalle";
}

export async function generarPdfCorteCajaDia(ventas = [], options = {}) {
  const empresaCfg = await obtenerEmpresa();
  const empresaCache = readEmpresaConfigCache();
  const now = new Date();
  const corte = options?.corte || null;
  const esRestaurante = Boolean(options?.restaurante);
  const titleFill = esRestaurante ? [234, 88, 12] : [8, 56, 134];
  const negocioNombre =
    options?.negocioNombre || empresaCfg?.nombre || empresaCache.nombre;
  const negocioSubtitulo = esRestaurante
    ? "Operacion y punto de venta para restaurante"
    : options?.negocioSubtitulo || empresaCfg?.subtitulo || empresaCache.subtitulo;
  const negocioTelefono =
    options?.negocioTelefono || empresaCfg?.telefono || empresaCache.telefono || "";
  const negocioCorreo =
    options?.negocioCorreo ||
    empresaCfg?.correoNotas ||
    empresaCfg?.correoTickets ||
    empresaCache.correoNotas ||
    empresaCache.correoTickets ||
    "";
  const fechaKeyObjetivo = String(options?.fechaKey || corte?.fechaKey || toDateKey(now));
  const fechaObjetivo = parseDateKey(fechaKeyObjetivo) || now;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  drawPageFrame(doc);

  const hoyStr = dateShort(fechaObjetivo);
  const ventasDia = ventas
    .filter((v) => {
      const d = normalizeDate(v?.fecha);
      return d && dateShort(d) === hoyStr;
    })
    .sort((a, b) => (normalizeDate(a?.fecha)?.getTime() || 0) - (normalizeDate(b?.fecha)?.getTime() || 0));

  let logoPng = null;
  try {
    logoPng = await imageToPngDataUrl(logoUrl);
  } catch (err) {
    console.warn("PDF corte: logo no cargado", err);
  }

  const resumen = {
    subtotal: 0,
    iva: 0,
    total: 0,
    tickets: ventasDia.length,
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    otros: 0,
  };

  const filasMovimientos = [];
  ventasDia.forEach((v, idx) => {
    const subtotalVenta = Number(v?.subtotal || 0);
    const ivaVenta = Number(v?.iva || 0);
    const total = Number(v?.total || 0);
    const fecha = normalizeDate(v?.fecha) || now;
    const detalle = v?.pagoDetalle || {};
    const tipoPago = String(v?.tipoPago || "").toLowerCase();
    const refPago = String(detalle?.referenciaTarjeta || "").trim() || "-";
    const servicioItem = Array.isArray(v?.productos) ? v.productos.find((p) => p?.esServicio) : null;
    const tieneServicio = Boolean(servicioItem);
    const concepto = tieneServicio ? "Servicio" : "Venta";
    const clienteDesdeServicio = String(servicioItem?.nombre || "")
      .split(" - ")
      .slice(1)
      .join(" - ")
      .trim();
    const clienteCell =
      String(v?.clienteTelefono || "").trim() || clienteDesdeServicio || "Publico";
    const referenciaCell =
      String(servicioItem?.servicioFolio || "").trim() || refPago || "-";

    resumen.subtotal += subtotalVenta;
    resumen.iva += ivaVenta;
    resumen.total += total;
    resumen.efectivo += Number(detalle?.efectivo || (tipoPago === "efectivo" ? total : 0) || 0);
    resumen.tarjeta += Number(detalle?.tarjeta || (tipoPago === "tarjeta" ? total : 0) || 0);
    resumen.transferencia += Number(
      detalle?.transferencia || (tipoPago === "transferencia" ? total : 0) || 0
    );
    if (!["efectivo", "tarjeta", "transferencia"].includes(tipoPago)) resumen.otros += total;

    filasMovimientos.push([
      concepto,
      getProductosVentaLabel(v?.productos),
      String(idx + 1),
      `${dateShort(fecha)} ${timeShort(fecha)}`,
      referenciaCell,
      clienteCell,
      money(0),
      money(total),
      "MXN",
    ]);
  });

  const retiros = Array.isArray(corte?.retiros) ? corte.retiros : [];
  retiros.forEach((r, idx) => {
    filasMovimientos.push([
      String(r?.tipo || "Egreso").toUpperCase(),
      "CAJA",
      `R${idx + 1}`,
      `${dateShort(now)} ${timeShort(now)}`,
      String(r?.motivo || "-"),
      String(r?.usuario || "-"),
      money(r?.monto || 0),
      money(0),
      "MXN",
    ]);
  });

  const totalCargos = retiros.reduce((acc, r) => acc + Number(r?.monto || 0), 0);
  const totalAbonos = resumen.total;

  if (options?.restaurante?.formatoExclusivo) {
    const ordenesRestaurante = Array.isArray(options.restaurante.orders)
      ? options.restaurante.orders.filter((order) => {
        const fecha = normalizeDate(order?.cobradaAt || order?.createdAt);
        return order?.status === "cobrada" && fecha && toDateKey(fecha) === fechaKeyObjetivo;
      })
      : [];
    const meseros = {};
    const cocineros = {};
    const platillos = {};
    const mesas = new Set();
    let unidades = 0;

    ordenesRestaurante.forEach((order) => {
      const mesero = String(order?.creadaPorNombre || "Sin asignar");
      const cocinero = String(order?.atendidaPorNombre || "Sin asignar");
      const mesa = order?.mesaEtiqueta || (order?.mesaNumero ? `Mesa ${order.mesaNumero}` : "Para llevar");
      if (!meseros[mesero]) meseros[mesero] = { cuentas: 0, mesas: new Set(), platillos: 0, venta: 0 };
      meseros[mesero].cuentas += 1;
      meseros[mesero].mesas.add(mesa);
      meseros[mesero].venta += Number(order?.total || order?.totalCobradoCuenta || 0);
      if (mesa !== "Para llevar") mesas.add(mesa);
      (order?.items || []).forEach((item) => {
        const cantidad = Number(item?.cantidad || 1);
        const nombre = String(item?.nombre || "Platillo");
        unidades += cantidad;
        meseros[mesero].platillos += cantidad;
        cocineros[cocinero] = (cocineros[cocinero] || 0) + cantidad;
        platillos[nombre] = (platillos[nombre] || 0) + cantidad;
      });
    });

    const drawRestaurantHeader = (title, subtitle) => {
      drawPageFrame(doc);
      if (logoPng) doc.addImage(logoPng, "PNG", 12, 12, 18, 18);
      setPdfFont(doc, "bold");
      doc.setFontSize(14);
      doc.text(negocioNombre, 35, 18);
      setPdfFont(doc, "normal");
      doc.setFontSize(8);
      doc.text(`Corte del restaurante: ${hoyStr}`, 35, 24);
      doc.text(`Generado: ${dateShort(now)} ${timeShort(now)}`, 198, 18, { align: "right" });
      drawRestaurantTitleBar(doc, 12, 35, 186, 10, title);
      doc.setTextColor(90, 90, 90);
      doc.setFontSize(8);
      doc.text(subtitle, 12, 51);
      doc.setTextColor(20, 20, 20);
    };

    drawRestaurantHeader(
      "CORTE DE CAJA DEL RESTAURANTE",
      "Resumen financiero y operativo de las cuentas cobradas durante el dia.",
    );
    let restY = 58;
    drawRestaurantMetric(doc, 12, restY, 43.5, "VENTA TOTAL", money(resumen.total), "Cobros registrados en caja");
    drawRestaurantMetric(doc, 59.5, restY, 43.5, "CUENTAS", ordenesRestaurante.length, "Cuentas finalizadas y pagadas");
    drawRestaurantMetric(doc, 107, restY, 43.5, "MESAS", mesas.size, "Mesas distintas atendidas");
    drawRestaurantMetric(doc, 154.5, restY, 43.5, "PLATILLOS", unidades, "Unidades servidas");
    restY += 28;

    drawRestaurantTitleBar(doc, 12, restY, 186, 8, "RESUMEN DE COBROS");
    restY += 11;
    restY = drawTable(doc, {
      x: 12,
      y: restY,
      widths: [62, 62, 62],
      headers: ["Concepto", "Importe", "Que representa"],
      rows: [
        ["Efectivo", money(resumen.efectivo), "Cobros recibidos en efectivo"],
        ["Tarjeta", money(resumen.tarjeta), "Cobros procesados con tarjeta"],
        ["Transferencia", money(resumen.transferencia), "Pagos por transferencia"],
        ["Otros metodos", money(resumen.otros), "Otros medios de pago"],
        ["Salidas de caja", money(totalCargos), "Retiros y egresos registrados"],
        ["Neto del periodo", money(resumen.total - totalCargos), "Ventas menos salidas de caja"],
      ],
      rowHeight: 7,
      fontSize: 8,
      headerFill: [255, 237, 213],
      aligns: ["left", "right", "left"],
    });
    restY += 8;
    drawRestaurantTitleBar(doc, 12, restY, 186, 8, "ACTIVIDAD POR MESERO");
    restY += 11;
    setPdfFont(doc, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(85, 85, 85);
    doc.text("Cada fila resume las cuentas registradas, las mesas atendidas, los platillos y la venta asociada.", 12, restY);
    doc.setTextColor(20, 20, 20);
    restY += 4;
    drawTable(doc, {
      x: 12,
      y: restY,
      widths: [42, 64, 20, 26, 34],
      headers: ["Mesero", "Mesas atendidas", "Cuentas", "Platillos", "Venta asociada"],
      rows: Object.entries(meseros).length
        ? Object.entries(meseros)
          .sort((a, b) => b[1].cuentas - a[1].cuentas)
          .map(([nombre, data]) => [
            nombre,
            Array.from(data.mesas).join(", "),
            String(data.cuentas),
            String(data.platillos),
            money(data.venta),
          ])
        : [["Sin actividad", "No hubo cuentas cobradas", "0", "0", money(0)]],
      rowHeight: 7,
      fontSize: 7.5,
      headerFill: [255, 237, 213],
      aligns: ["left", "left", "center", "center", "right"],
    });

    doc.addPage();
    drawRestaurantHeader(
      "PERSONAL Y PRODUCCION",
      "Desglose de la produccion atribuida a cada cocinero y de los platillos vendidos.",
    );
    restY = 58;
    drawRestaurantTitleBar(doc, 12, restY, 186, 8, "PRODUCCION POR COCINERO");
    restY += 11;
    setPdfFont(doc, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(85, 85, 85);
    doc.text("Muestra cuantos platillos preparo cada cocinero, ordenados de mayor a menor produccion.", 12, restY);
    doc.setTextColor(20, 20, 20);
    restY += 4;
    restY = drawTable(doc, {
      x: 12,
      y: restY,
      widths: [126, 60],
      headers: ["Cocinero", "Platillos preparados"],
      rows: Object.entries(cocineros).length
        ? Object.entries(cocineros).sort((a, b) => b[1] - a[1]).map(([nombre, cantidad]) => [nombre, String(cantidad)])
        : [["Sin actividad", "0"]],
      rowHeight: 7,
      fontSize: 8,
      headerFill: [255, 237, 213],
      aligns: ["left", "center"],
    });
    restY += 8;
    drawRestaurantTitleBar(doc, 12, restY, 186, 8, "PLATILLOS VENDIDOS");
    restY += 11;
    setPdfFont(doc, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(85, 85, 85);
    doc.text("Ranking de unidades vendidas para identificar los productos con mayor demanda.", 12, restY);
    doc.setTextColor(20, 20, 20);
    restY += 4;
    drawTable(doc, {
      x: 12,
      y: restY,
      widths: [126, 60],
      headers: ["Platillo", "Unidades vendidas"],
      rows: Object.entries(platillos).length
        ? Object.entries(platillos).sort((a, b) => b[1] - a[1]).map(([nombre, cantidad]) => [nombre, String(cantidad)]).slice(0, 24)
        : [["Sin ventas de platillos", "0"]],
      rowHeight: 7,
      fontSize: 8,
      headerFill: [255, 237, 213],
      aligns: ["left", "center"],
    });

    doc.save(`corte-restaurante-${fechaKeyObjetivo}.pdf`);
    return;
  }

  let y = 12;
  if (logoPng) {
    doc.addImage(logoPng, "PNG", 12, y, 18, 18);
  }
  setPdfFont(doc, "bold");
  doc.setFontSize(14);
  doc.text(negocioNombre, 35, y + 6);
  setPdfFont(doc, "normal");
  doc.setFontSize(9);
  doc.text(negocioSubtitulo, 35, y + 11);
  doc.setFontSize(7.8);
  if (negocioTelefono) doc.text(`Tel: ${negocioTelefono}`, 35, y + 15);
  if (negocioCorreo) doc.text(`Correo: ${negocioCorreo}`, 35, y + 19);
  doc.text(`Corte generado: ${dateShort(now)}`, 170, y + 6, { align: "right" });
  doc.text(`Hora: ${timeShort(now)}`, 170, y + 11, { align: "right" });

  y = 38;
  setPdfFont(doc, "bold");
  doc.setFontSize(16);
  doc.text(esRestaurante ? "Corte de caja del restaurante" : "Corte de caja", 105, y, { align: "center" });

  y += 5;
  setPdfFont(doc, "normal");
  doc.setFontSize(8.5);
  const usuario = corte?.cajero?.nombre || "Cajero sin nombre";
  doc.text(`Periodo de corte: ${hoyStr} - ${hoyStr} | Usuario: ${usuario}`, 12, y);
  y += 4;
  doc.text("Moneda: Pesos (MXN)", 12, y);

  y += 3;
  y = drawTable(doc, {
    x: 12,
    y,
    widths: [18, 28, 10, 24, 17, 25, 20, 20, 24],
    headers: ["Concepto", "Producto", "Num.", "Fecha apl.", "Referencia", "Cliente", "Cargos", "Abonos", "Moneda"],
    rows: filasMovimientos.slice(0, 20),
    rowHeight: 5.7,
    fontSize: 7.5,
    aligns: ["left", "left", "center", "center", "left", "left", "right", "right", "center"],
  });

  y += 2;
  doc.setDrawColor(30, 30, 30);
  doc.line(128, y, 198, y);
  y += 4;
  setPdfFont(doc, "bold");
  doc.setFontSize(10.5);
  doc.text(`Total cargos: ${money(totalCargos)}`, 198, y, { align: "right" });
  y += 5;
  doc.text(`Total abonos: ${money(totalAbonos)}`, 198, y, { align: "right" });

  y += 6;
  drawTitleBar(
    doc,
    12,
    y,
    186,
    6,
    esRestaurante ? "RESUMEN DE VENTAS DEL RESTAURANTE" : "RESUMEN DE VENTAS DEL DIA",
    titleFill,
  );
  y += 7;
  const ticketProm = resumen.tickets > 0 ? resumen.total / resumen.tickets : 0;
  drawKeyValueRow(doc, 12, y, 38, 24, 6, "Tickets", String(resumen.tickets));
  drawKeyValueRow(doc, 74, y, 38, 24, 6, "Ticket prom.", money(ticketProm));
  drawKeyValueRow(doc, 136, y, 38, 24, 6, "Total", money(resumen.total));
  y += 7;
  drawKeyValueRow(doc, 12, y, 38, 24, 6, "Efectivo", money(resumen.efectivo));
  drawKeyValueRow(doc, 74, y, 38, 24, 6, "Tarjeta", money(resumen.tarjeta));
  drawKeyValueRow(doc, 136, y, 38, 24, 6, "Transferencia", money(resumen.transferencia));
  y += 7;
  drawKeyValueRow(doc, 12, y, 38, 24, 6, "Subtotal", money(resumen.subtotal));
  drawKeyValueRow(doc, 74, y, 38, 24, 6, "IVA", money(resumen.iva));
  drawKeyValueRow(doc, 136, y, 38, 24, 6, "Otros", money(resumen.otros));
  y += 7;
  drawKeyValueRow(doc, 12, y, 38, 24, 6, "Salidas de caja", money(totalCargos));
  drawKeyValueRow(doc, 74, y, 38, 24, 6, "Neto", money(resumen.total - totalCargos));
  drawKeyValueRow(doc, 136, y, 38, 24, 6, "Total final", money(resumen.total));

  doc.addPage();
  drawPageFrame(doc);

  let y2 = 12;
  drawTitleBar(doc, 12, y2, 186, 8, "FORMATO DE ARQUEO DE CAJA DIARIO", titleFill);
  y2 += 10;

  const primeraVentaFecha = normalizeDate(ventasDia[0]?.fecha);
  const inicio = primeraVentaFecha || now;
  const arqueoNo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;

  drawKeyValueRow(doc, 12, y2, 24, 36, 6, "FECHA", hoyStr);
  drawKeyValueRow(doc, 72, y2, 24, 36, 6, "ARQUEO No", arqueoNo);
  y2 += 7;
  drawKeyValueRow(doc, 12, y2, 30, 30, 6, "HORA INICIO", timeShort(inicio));
  drawKeyValueRow(doc, 72, y2, 30, 30, 6, "HORA TERMINO", timeShort(now));
  y2 += 9;

  setPdfFont(doc, "bold");
  doc.setFontSize(8.5);
  doc.text("Responsable de caja general:", 12, y2);
  setPdfFont(doc, "normal");
  doc.text(corte?.cajero?.nombre || "Cajero sin nombre", 58, y2);
  doc.line(57, y2 + 1, 145, y2 + 1);
  y2 += 8;

  const fondoInicial = Number(corte?.fondoInicialCaja || 0);
  const efectivoEsperado = Number(corte?.conteoEfectivo?.esperado || 0);
  const efectivoContado =
    corte?.conteoEfectivo?.contado === null || corte?.conteoEfectivo?.contado === undefined
      ? 0
      : Number(corte?.conteoEfectivo?.contado || 0);
  const diferencia = Number(corte?.conteoEfectivo?.diferencia || 0);
  const totalRetiros = Number(corte?.totalRetiros || 0);
  const cajaFinalEsperada = Number(corte?.cajaFinalEsperada || fondoInicial + efectivoEsperado - totalRetiros);

  drawTitleBar(doc, 12, y2, 186, 6, "1.- SALDO INICIAL", titleFill);
  y2 += 7;
  drawKeyValueRow(doc, 12, y2, 35, 25, 6, "Saldo inicial", money(fondoInicial));
  drawKeyValueRow(doc, 72, y2, 35, 25, 6, "Efectivo esperado", money(efectivoEsperado));
  drawKeyValueRow(doc, 132, y2, 35, 25, 6, "Efectivo contado", money(efectivoContado));
  y2 += 9;

  drawTitleBar(doc, 12, y2, 186, 6, "2.- EFECTIVO (DESGLOSE POR DENOMINACIONES)", titleFill);
  y2 += 7;

  const den = Array.isArray(corte?.denominaciones) ? corte.denominaciones : [];
  const monedasValores = [10, 5, 2, 1, 0.5];
  const billetesValores = [1000, 500, 200, 100, 50, 20];
  const denMap = new Map(den.map((d) => [Number(d?.valor || 0), Number(d?.cantidad || 0)]));

  const rowsMonedas = monedasValores.map((valor) => {
    const cantidad = Number(denMap.get(valor) || 0);
    return [money(valor), String(cantidad), money(valor * cantidad)];
  });
  const rowsBilletes = billetesValores.map((valor) => {
    const cantidad = Number(denMap.get(valor) || 0);
    return [money(valor), String(cantidad), money(valor * cantidad)];
  });

  drawTitleBar(doc, 12, y2, 88, 5, "MONEDAS", titleFill);
  drawTitleBar(doc, 110, y2, 88, 5, "BILLETES", titleFill);
  y2 += 6;

  const endMon = drawTable(doc, {
    x: 12,
    y: y2,
    widths: [30, 22, 36],
    headers: ["Valor", "Cantidad", "Total"],
    rows: rowsMonedas,
    rowHeight: 5.5,
    fontSize: 8,
  });
  const endBil = drawTable(doc, {
    x: 110,
    y: y2,
    widths: [30, 22, 36],
    headers: ["Valor", "Cantidad", "Total"],
    rows: rowsBilletes,
    rowHeight: 5.5,
    fontSize: 8,
  });
  y2 = Math.max(endMon, endBil) + 3;

  const totalMonedas = sumDenominaciones(den, (v) => v < 20);
  const totalBilletes = sumDenominaciones(den, (v) => v >= 20);
  drawKeyValueRow(doc, 12, y2, 35, 25, 6, "Total monedas", money(totalMonedas));
  drawKeyValueRow(doc, 72, y2, 35, 25, 6, "Total billetes", money(totalBilletes));
  drawKeyValueRow(doc, 132, y2, 35, 25, 6, "Total efectivo", money(totalMonedas + totalBilletes));
  y2 += 9;

  drawTitleBar(doc, 12, y2, 186, 6, "3.- EQUIVALENTE DE EFECTIVO", titleFill);
  y2 += 7;
  const totalVales = retiros
    .filter((r) => String(r?.tipo || "").toLowerCase() === "vale")
    .reduce((acc, r) => acc + Number(r?.monto || 0), 0);
  const totalOtros = retiros
    .filter((r) => !["vale"].includes(String(r?.tipo || "").toLowerCase()))
    .reduce((acc, r) => acc + Number(r?.monto || 0), 0);

  const rowsCheques = [["Cheques", money(0)], ["Total cheques", money(0)]];
  const rowsOtros = [
    ["Tarjeta", money(resumen.tarjeta)],
    ["Transferencia", money(resumen.transferencia)],
    ["Vales", money(totalVales)],
    ["Otros", money(totalOtros)],
    ["Total otros", money(resumen.tarjeta + resumen.transferencia + totalVales + totalOtros)],
  ];

  drawTitleBar(doc, 12, y2, 88, 5, "CHEQUES", titleFill);
  drawTitleBar(doc, 110, y2, 88, 5, "OTROS", titleFill);
  y2 += 6;
  const endCheq = drawTable(doc, {
    x: 12,
    y: y2,
    widths: [58, 30],
    headers: ["Concepto", "Total"],
    rows: rowsCheques,
    rowHeight: 5.5,
    fontSize: 8,
  });
  const endOtros = drawTable(doc, {
    x: 110,
    y: y2,
    widths: [58, 30],
    headers: ["Concepto", "Total"],
    rows: rowsOtros,
    rowHeight: 5.5,
    fontSize: 8,
  });
  y2 = Math.max(endCheq, endOtros) + 3;

  drawTitleBar(doc, 12, y2, 186, 6, "4.- DOCUMENTOS", titleFill);
  y2 += 7;
  const egresosDocumento = Array.isArray(corte?.egresos) ? corte.egresos : [];
  const totalEgresoPorTipo = (tipo) =>
    egresosDocumento
      .filter((e) => String(e?.tipo || "").toLowerCase() === tipo)
      .reduce((acc, e) => acc + Number(e?.monto || 0), 0);
  const egresosFacturas = totalEgresoPorTipo("factura");
  const egresosBoletas = totalEgresoPorTipo("boleta_venta");
  const egresosNotaCredito = totalEgresoPorTipo("nota_credito");
  const egresosNotaDebito = totalEgresoPorTipo("nota_debito");
  const egresosOtros = Math.max(
    0,
    Number(
      (
        totalRetiros -
        (egresosFacturas + egresosBoletas + egresosNotaCredito + egresosNotaDebito)
      ).toFixed(2)
    )
  );

  const rowsIngresos = [
    ["Facturas", money(0)],
    ["Boletas de venta", money(resumen.total)],
    ["Nota de credito", money(0)],
    ["Nota de debito", money(0)],
    ["Otros", money(0)],
    ["Total ventas", money(resumen.total)],
  ];
  const rowsEgresos = [
    ["Facturas", money(egresosFacturas)],
    ["Boletas de venta", money(egresosBoletas)],
    ["Nota de credito", money(egresosNotaCredito)],
    ["Nota de debito", money(egresosNotaDebito)],
    ["Otros", money(egresosOtros)],
    ["Total compras", money(totalRetiros)],
  ];

  drawTitleBar(doc, 12, y2, 88, 5, "VENTAS - INGRESOS", titleFill);
  drawTitleBar(doc, 110, y2, 88, 5, "COMPRAS - EGRESOS", titleFill);
  y2 += 6;
  const endIng = drawTable(doc, {
    x: 12,
    y: y2,
    widths: [58, 30],
    headers: ["Documento", "Total"],
    rows: rowsIngresos,
    rowHeight: 5.2,
    fontSize: 8,
  });
  const endEgr = drawTable(doc, {
    x: 110,
    y: y2,
    widths: [58, 30],
    headers: ["Documento", "Total"],
    rows: rowsEgresos,
    rowHeight: 5.2,
    fontSize: 8,
  });
  y2 = Math.max(endIng, endEgr) + 3;

  drawTitleBar(doc, 12, y2, 88, 5, "RESUMEN", titleFill);
  drawTitleBar(doc, 110, y2, 88, 5, "OBSERVACIONES", titleFill);
  y2 += 6;

  const rowsResumen = [
    ["Saldo inicial", money(fondoInicial)],
    ["Documentos", money(resumen.total - totalRetiros)],
    ["Resultado esperado", money(cajaFinalEsperada)],
    ["Efectivo", money(efectivoContado)],
    ["Equivalente efectivo", money(resumen.tarjeta + resumen.transferencia)],
    ["Total", money(efectivoContado + resumen.tarjeta + resumen.transferencia)],
    ["Diferencia", money(diferencia)],
    ["Faltante/Sobrante", diferencia < 0 ? "FALTANTE" : diferencia > 0 ? "SOBRANTE" : "OK"],
  ];

  drawTable(doc, {
    x: 12,
    y: y2,
    widths: [58, 30],
    headers: ["Concepto", "Valor"],
    rows: rowsResumen,
    rowHeight: 5.4,
    fontSize: 8,
  });

  const obsH = 48;
  doc.setDrawColor(45, 45, 45);
  doc.rect(110, y2, 88, obsH);
  setPdfFont(doc, "normal");
  doc.setFontSize(8);
  const notas = String(corte?.notasCorte || "Sin observaciones.");
  const notasLines = doc.splitTextToSize(notas, 84);
  doc.text(notasLines, 112, y2 + 5);

  const ordenesRestaurante = Array.isArray(options?.restaurante?.orders)
    ? options.restaurante.orders.filter((order) => {
      const fecha = normalizeDate(order?.cobradaAt || order?.createdAt);
      return order?.status === "cobrada" && fecha && toDateKey(fecha) === fechaKeyObjetivo;
    })
    : [];

  if (options?.restaurante) {
    const pagoConfig = options?.restaurante?.config || {};
    const pagosActivos = pagoConfig.pagosPersonalActivos === true;
    const porcentajeMesero = Number(pagoConfig.porcentajeMesero || 0);
    const porcentajeCocinero = Number(pagoConfig.porcentajeCocinero || 0);
    const meseros = {};
    const cocineros = {};
    const platillos = {};
    const mesasAtendidas = new Set();
    let totalPlatillosRestaurante = 0;
    ordenesRestaurante.forEach((order) => {
      const mesero = String(order?.creadaPorNombre || "Sin asignar");
      if (!meseros[mesero]) meseros[mesero] = { mesas: new Set(), ordenes: 0, platillos: 0, venta: 0 };
      meseros[mesero].ordenes += 1;
      meseros[mesero].venta += Number(order?.total || 0);
      if (order?.mesaEtiqueta || order?.mesaNumero) {
        const mesa = order.mesaEtiqueta || `Mesa ${order.mesaNumero}`;
        meseros[mesero].mesas.add(mesa);
        mesasAtendidas.add(mesa);
      }
      const cocinero = String(order?.atendidaPorNombre || "Sin asignar");
      (order?.items || []).forEach((item) => {
        const cantidad = Number(item?.cantidad || 1);
        const nombrePlatillo = String(item?.nombre || "Platillo");
        totalPlatillosRestaurante += cantidad;
        meseros[mesero].platillos += cantidad;
        if (!item?.esInventario) {
          if (!cocineros[cocinero]) cocineros[cocinero] = { platillos: 0, produccion: 0 };
          cocineros[cocinero].platillos += cantidad;
          cocineros[cocinero].produccion += Number(item?.precio || item?.precioVenta || 0) * cantidad;
        }
        platillos[nombrePlatillo] = (platillos[nombrePlatillo] || 0) + cantidad;
      });
    });

    doc.addPage();
    drawPageFrame(doc);
    let y3 = 12;
    drawRestaurantTitleBar(doc, 12, y3, 186, 9, "OPERACION DEL RESTAURANTE");
    y3 += 13;
    setPdfFont(doc, "normal");
    doc.setFontSize(8);
    doc.setTextColor(85, 85, 85);
    doc.text("Resumen de las cuentas cobradas durante el periodo. Aqui puedes revisar la carga de servicio,", 12, y3);
    doc.text("la produccion de cocina y los platillos con mayor salida.", 12, y3 + 4);
    doc.setTextColor(20, 20, 20);
    y3 += 8;
    drawRestaurantMetric(doc, 12, y3, 43.5, "CUENTAS COBRADAS", ordenesRestaurante.length, "Ordenes finalizadas y pagadas");
    drawRestaurantMetric(doc, 59.5, y3, 43.5, "MESAS ATENDIDAS", mesasAtendidas.size, "Mesas distintas con consumo");
    drawRestaurantMetric(doc, 107, y3, 43.5, "PLATILLOS SERVIDOS", totalPlatillosRestaurante, "Unidades incluidas en comandas");
    drawRestaurantMetric(
      doc,
      154.5,
      y3,
      43.5,
      "PERSONAL ACTIVO",
      Object.keys(meseros).length + Object.keys(cocineros).filter((nombre) => nombre !== "Sin asignar").length,
      "Meseros y cocineros registrados",
    );
    y3 += 27;
    drawRestaurantTitleBar(doc, 12, y3, 186, 7, "SERVICIO EN PISO: MESEROS Y MESAS");
    y3 += 10;
    setPdfFont(doc, "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(85, 85, 85);
    doc.text(
      pagosActivos
        ? `Actividad y pago estimado: ${porcentajeMesero}% de la venta asociada a cada mesero.`
        : "Indica quien registro cada cuenta, las mesas atendidas y su volumen de ordenes y platillos.",
      12,
      y3,
    );
    doc.setTextColor(20, 20, 20);
    y3 += 3;
    y3 = drawTable(doc, {
      x: 12,
      y: y3,
      widths: pagosActivos ? [39, 61, 21, 21, 24, 20] : [48, 78, 28, 32],
      headers: pagosActivos
        ? ["Mesero", "Mesas", "Ordenes", "Platillos", "Venta", "Pago"]
        : ["Mesero", "Mesas", "Ordenes", "Platillos"],
      rows: Object.entries(meseros).length
        ? Object.entries(meseros).sort((a, b) => b[1].ordenes - a[1].ordenes).map(([nombre, data]) => [
          nombre,
          Array.from(data.mesas).join(", ") || "Para llevar",
          String(data.ordenes),
          String(data.platillos),
          ...(pagosActivos ? [money(data.venta), money(data.venta * porcentajeMesero / 100)] : []),
        ])
        : [pagosActivos
          ? ["Sin actividad", "No hubo cuentas cobradas", "0", "0", money(0), money(0)]
          : ["Sin actividad", "No hubo cuentas cobradas", "0", "0"]],
      rowHeight: 6,
      fontSize: 8,
      headerFill: [255, 237, 213],
    });
    y3 += 5;
    drawRestaurantTitleBar(doc, 12, y3, 186, 7, "PRODUCCION DE COCINA");
    y3 += 10;
    setPdfFont(doc, "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(85, 85, 85);
    doc.text(
      pagosActivos
        ? `Produccion y pago estimado: ${porcentajeCocinero}% del valor de los platillos preparados.`
        : "Total de platillos asociados a cada cocinero, ordenado de mayor a menor produccion.",
      12,
      y3,
    );
    doc.setTextColor(20, 20, 20);
    y3 += 3;
    y3 = drawTable(doc, {
      x: 12,
      y: y3,
      widths: pagosActivos ? [86, 34, 36, 30] : [120, 66],
      headers: pagosActivos
        ? ["Cocinero", "Platillos", "Valor preparado", "Pago"]
        : ["Cocinero", "Platillos preparados"],
      rows: Object.entries(cocineros).length
        ? Object.entries(cocineros).sort((a, b) => b[1].platillos - a[1].platillos).map(([nombre, data]) => [
          nombre,
          String(data.platillos),
          ...(pagosActivos ? [money(data.produccion), money(data.produccion * porcentajeCocinero / 100)] : []),
        ])
        : [pagosActivos ? ["Sin actividad", "0", money(0), money(0)] : ["Sin actividad", "0"]],
      rowHeight: 6,
      fontSize: 8,
      headerFill: [255, 237, 213],
    });
    y3 += 5;
    drawRestaurantTitleBar(doc, 12, y3, 186, 7, "PLATILLOS VENDIDOS");
    y3 += 10;
    setPdfFont(doc, "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(85, 85, 85);
    doc.text("Ranking de unidades vendidas para identificar los platillos con mayor demanda.", 12, y3);
    doc.setTextColor(20, 20, 20);
    y3 += 3;
    drawTable(doc, {
      x: 12,
      y: y3,
      widths: [140, 46],
      headers: ["Platillo", "Cantidad"],
      rows: Object.entries(platillos).length
        ? Object.entries(platillos).sort((a, b) => b[1] - a[1]).map(([nombre, cantidad]) => [
          nombre,
          String(cantidad),
        ]).slice(0, 28)
        : [["Sin ventas de platillos", "0"]],
      rowHeight: 6,
      fontSize: 8,
      headerFill: [255, 237, 213],
    });
  }

  doc.save(`corte-caja-${fechaKeyObjetivo}.pdf`);
}


