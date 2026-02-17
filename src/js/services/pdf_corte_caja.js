import { jsPDF } from "jspdf";
import logoUrl from "../../assets/logo.png";

const BUSINESS_NAME = import.meta.env.VITE_NEGOCIO_NOMBRE || "LuisITRepair";
const BUSINESS_SUBTITLE =
  import.meta.env.VITE_NEGOCIO_SUBTITULO || "Servicios tecnicos y punto de venta";

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

const clip = (value, max = 26) => {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}.` : text;
};

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

function drawTitleBar(doc, x, y, w, h, text) {
  doc.setFillColor(8, 56, 134);
  doc.rect(x, y, w, h, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(text, x + w / 2, y + h / 2 + 1.5, { align: "center" });
  doc.setTextColor(20, 20, 20);
}

function drawKeyValueRow(doc, x, y, w1, w2, h, key, value) {
  doc.setDrawColor(50, 50, 50);
  doc.rect(x, y, w1, h);
  doc.rect(x + w1, y, w2, h);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const keyText = fitTextByWidth(doc, key, Math.max(1, w1 - 4));
  doc.text(keyText, x + 2, y + h / 2 + 1.5);
  doc.setFont("helvetica", "normal");
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

function drawTable(doc, { x, y, widths, headers, rows, rowHeight = 6, fontSize = 8, aligns = [] }) {
  let cursorY = y;
  const totalW = widths.reduce((a, b) => a + b, 0);

  doc.setFillColor(230, 236, 245);
  doc.rect(x, cursorY, totalW, rowHeight, "F");
  doc.setDrawColor(45, 45, 45);
  doc.rect(x, cursorY, totalW, rowHeight);

  let cx = x;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  headers.forEach((h, i) => {
    doc.rect(cx, cursorY, widths[i], rowHeight);
    doc.text(String(h), cx + widths[i] / 2, cursorY + rowHeight / 2 + 1.4, { align: "center" });
    cx += widths[i];
  });

  cursorY += rowHeight;
  doc.setFont("helvetica", "normal");
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

function sumDenominaciones(denominaciones = [], selector) {
  return denominaciones.reduce((acc, d) => {
    const valor = Number(d?.valor || 0);
    const cantidad = Number(d?.cantidad || 0);
    if (!selector(valor)) return acc;
    return acc + valor * cantidad;
  }, 0);
}

export async function generarPdfCorteCajaDia(ventas = [], options = {}) {
  const now = new Date();
  const corte = options?.corte || null;
  const negocioNombre = options?.negocioNombre || BUSINESS_NAME;
  const negocioSubtitulo = options?.negocioSubtitulo || BUSINESS_SUBTITLE;
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
      String(v?.id || "-"),
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
      String(r?.tipo || "Gasto").toUpperCase(),
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

  let y = 12;
  if (logoPng) {
    doc.addImage(logoPng, "PNG", 12, y, 18, 18);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(negocioNombre, 35, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(negocioSubtitulo, 35, y + 11);
  doc.text(`Corte generado: ${dateShort(now)}`, 170, y + 6, { align: "right" });
  doc.text(`Hora: ${timeShort(now)}`, 170, y + 11, { align: "right" });

  y = 34;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Corte de caja", 105, y, { align: "center" });

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const usuario = corte?.cajero?.email || corte?.cajero?.nombre || "Todos";
  doc.text(`Periodo de corte: ${hoyStr} - ${hoyStr} | Usuario: ${usuario}`, 12, y);
  y += 4;
  doc.text("Moneda: Pesos (MXN)", 12, y);

  y += 3;
  y = drawTable(doc, {
    x: 12,
    y,
    widths: [18, 28, 10, 24, 17, 25, 20, 20, 24],
    headers: ["Concepto", "Documento", "Num.", "Fecha apl.", "Referencia", "Cliente", "Cargos", "Abonos", "Moneda"],
    rows: filasMovimientos.slice(0, 20),
    rowHeight: 5.7,
    fontSize: 7.5,
    aligns: ["left", "left", "center", "center", "left", "left", "right", "right", "center"],
  });

  y += 2;
  doc.setDrawColor(30, 30, 30);
  doc.line(128, y, 198, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(`Total cargos: ${money(totalCargos)}`, 198, y, { align: "right" });
  y += 5;
  doc.text(`Total abonos: ${money(totalAbonos)}`, 198, y, { align: "right" });

  y += 6;
  drawTitleBar(doc, 12, y, 186, 6, "RESUMEN DE VENTAS DEL DIA");
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
  drawKeyValueRow(doc, 12, y, 38, 24, 6, "Retiros/Gastos", money(totalCargos));
  drawKeyValueRow(doc, 74, y, 38, 24, 6, "Neto", money(resumen.total - totalCargos));
  drawKeyValueRow(doc, 136, y, 38, 24, 6, "Total final", money(resumen.total));

  doc.addPage();
  drawPageFrame(doc);

  let y2 = 12;
  drawTitleBar(doc, 12, y2, 186, 8, "FORMATO DE ARQUEO DE CAJA DIARIO");
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Responsable de caja general:", 12, y2);
  doc.setFont("helvetica", "normal");
  doc.text(corte?.cajero?.email || corte?.cajero?.nombre || "-", 58, y2);
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

  drawTitleBar(doc, 12, y2, 186, 6, "1.- SALDO INICIAL");
  y2 += 7;
  drawKeyValueRow(doc, 12, y2, 35, 25, 6, "Saldo inicial", money(fondoInicial));
  drawKeyValueRow(doc, 72, y2, 35, 25, 6, "Efectivo esperado", money(efectivoEsperado));
  drawKeyValueRow(doc, 132, y2, 35, 25, 6, "Efectivo contado", money(efectivoContado));
  y2 += 9;

  drawTitleBar(doc, 12, y2, 186, 6, "2.- EFECTIVO (DESGLOSE POR DENOMINACIONES)");
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

  drawTitleBar(doc, 12, y2, 88, 5, "MONEDAS");
  drawTitleBar(doc, 110, y2, 88, 5, "BILLETES");
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

  drawTitleBar(doc, 12, y2, 186, 6, "3.- EQUIVALENTE DE EFECTIVO");
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

  drawTitleBar(doc, 12, y2, 88, 5, "CHEQUES");
  drawTitleBar(doc, 110, y2, 88, 5, "OTROS");
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

  drawTitleBar(doc, 12, y2, 186, 6, "4.- DOCUMENTOS");
  y2 += 7;
  const rowsIngresos = [
    ["Facturas", money(0)],
    ["Boletas de venta", money(resumen.total)],
    ["Nota de credito", money(0)],
    ["Nota de debito", money(0)],
    ["Otros", money(0)],
    ["Total ventas", money(resumen.total)],
  ];
  const rowsEgresos = [
    ["Facturas", money(0)],
    ["Boletas de venta", money(0)],
    ["Nota de credito", money(0)],
    ["Nota de debito", money(0)],
    ["Otros", money(totalRetiros)],
    ["Total compras", money(totalRetiros)],
  ];

  drawTitleBar(doc, 12, y2, 88, 5, "VENTAS - INGRESOS");
  drawTitleBar(doc, 110, y2, 88, 5, "COMPRAS - EGRESOS");
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

  drawTitleBar(doc, 12, y2, 88, 5, "RESUMEN");
  drawTitleBar(doc, 110, y2, 88, 5, "OBSERVACIONES");
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
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const notas = String(corte?.notasCorte || "Sin observaciones.");
  const notasLines = doc.splitTextToSize(notas, 84);
  doc.text(notasLines, 112, y2 + 5);

  doc.save(`corte-caja-${fechaKeyObjetivo}.pdf`);
}
