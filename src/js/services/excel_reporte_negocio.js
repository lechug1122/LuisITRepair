import logoSistemaUrl from "../../assets/logo.png";
import { readEmpresaConfigCache } from "./configure_empresa";

const COLORS = {
  navy: "172554",
  blue: "2563EB",
  cyan: "06B6D4",
  green: "10B981",
  amber: "F59E0B",
  purple: "8B5CF6",
  red: "EF4444",
  slate: "475569",
  pale: "EFF6FF",
  white: "FFFFFF",
  border: "CBD5E1",
};

const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const cleanFilePart = (value) => String(value || "reporte").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const xmlEscape = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function styleHeader(row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: COLORS.blue } } };
  });
}

function finishTable(sheet, widths, moneyColumns = []) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: widths.length } };
  sheet.columns.forEach((column, index) => { column.width = widths[index] || 16; });
  styleHeader(sheet.getRow(1));
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.height = 22;
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowIndex % 2 ? "F8FAFC" : COLORS.white } };
      cell.border = { bottom: { style: "hair", color: { argb: "E2E8F0" } } };
      cell.alignment = { vertical: "middle" };
    });
  }
  moneyColumns.forEach((columnNumber) => { sheet.getColumn(columnNumber).numFmt = '$#,##0.00;[Red]-$#,##0.00'; });
}

async function addSystemLogo(workbook, sheet, position = { col: 0.25, row: 0.35 }) {
  try {
    // El logo del negocio (si lo subio) reemplaza al del sistema.
    const logoNegocio = String(readEmpresaConfigCache()?.logo || "").trim();
    const logoBuffer = await fetch(logoNegocio || logoSistemaUrl).then((response) => response.arrayBuffer());
    const logoId = workbook.addImage({ buffer: logoBuffer, extension: "png" });
    sheet.addImage(logoId, { tl: position, ext: { width: 90, height: 70 } });
  } catch (error) {
    console.warn("No se pudo agregar el logo al Excel:", error);
  }
}

const chartCache = (items, key, numeric = false) => items.map((item, index) =>
  `<c:pt idx="${index}"><c:v>${numeric ? safeNumber(item[key]) : xmlEscape(item[key])}</c:v></c:pt>`,
).join("");

function chartReference(type, formula, items, key) {
  const numeric = type === "num";
  return `<c:${type}Ref><c:f>${xmlEscape(formula)}</c:f><c:${type}Cache>${numeric ? '<c:formatCode>$#,##0.00</c:formatCode>' : ''}<c:ptCount val="${items.length}"/>${chartCache(items, key, numeric)}</c:${type}Cache></c:${type}Ref>`;
}

function createNativeChartXml({ type, title, items, categoryColumn, valueColumn }) {
  const lastRow = items.length + 1;
  const categoryFormula = `'Datos graficas'!$${categoryColumn}$2:$${categoryColumn}$${lastRow}`;
  const valueFormula = `'Datos graficas'!$${valueColumn}$2:$${valueColumn}$${lastRow}`;
  const categories = chartReference("str", categoryFormula, items, "label");
  const values = chartReference("num", valueFormula, items, "value");
  const series = `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${xmlEscape(title)}</c:v></c:tx><c:cat>${categories}</c:cat><c:val>${values}</c:val></c:ser>`;
  const plot = type === "bar"
    ? `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="1"/>${series}<c:dLbls><c:showVal val="1"/></c:dLbls><c:gapWidth val="70"/><c:axId val="48650112"/><c:axId val="48672768"/></c:barChart>
       <c:catAx><c:axId val="48650112"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="48672768"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>
       <c:valAx><c:axId val="48672768"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="$#,##0" sourceLinked="0"/><c:majorGridlines/><c:tickLblPos val="nextTo"/><c:crossAx val="48650112"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`
    : `<c:doughnutChart><c:varyColors val="1"/>${series}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showPercent val="1"/><c:showLeaderLines val="1"/></c:dLbls><c:firstSliceAng val="270"/><c:holeSize val="58"/></c:doughnutChart>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:date1904 val="0"/><c:lang val="es-MX"/><c:roundedCorners val="1"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-MX" sz="1600" b="1"/><a:t>${xmlEscape(title)}</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea><c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart><c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>`;
}

async function injectNativeCharts(buffer, { dailyData, paymentData }) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const relsPath = "xl/worksheets/_rels/sheet1.xml.rels";
  const anchor = (id, relId, fromCol, toCol) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>12</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>27</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="Gráfica ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  const drawingPath = "xl/drawings/drawing1.xml";
  const drawingRelsPath = "xl/drawings/_rels/drawing1.xml.rels";
  if (zip.file(drawingPath)) {
    let drawingXml = await zip.file(drawingPath).async("string");
    drawingXml = drawingXml.replace("</xdr:wsDr>", `${anchor(100, "rIdNativeChart1", 0, 6)}${anchor(101, "rIdNativeChart2", 6, 12)}</xdr:wsDr>`);
    zip.file(drawingPath, drawingXml);
    let drawingRels = await zip.file(drawingRelsPath).async("string");
    drawingRels = drawingRels.replace("</Relationships>", '<Relationship Id="rIdNativeChart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/><Relationship Id="rIdNativeChart2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/></Relationships>');
    zip.file(drawingRelsPath, drawingRels);
  } else {
    let sheetXml = await zip.file(sheetPath).async("string");
    sheetXml = sheetXml.replace("</worksheet>", '<drawing r:id="rIdNativeCharts"/></worksheet>');
    zip.file(sheetPath, sheetXml);
    let sheetRels = zip.file(relsPath)
      ? await zip.file(relsPath).async("string")
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    sheetRels = sheetRels.replace("</Relationships>", '<Relationship Id="rIdNativeCharts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
    zip.file(relsPath, sheetRels);
    zip.file(drawingPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchor(100, "rIdNativeChart1", 0, 6)}${anchor(101, "rIdNativeChart2", 6, 12)}</xdr:wsDr>`);
    zip.file(drawingRelsPath, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdNativeChart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/><Relationship Id="rIdNativeChart2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/></Relationships>');
  }
  zip.file("xl/charts/chart1.xml", createNativeChartXml({ type: "bar", title: "Ventas por día", items: dailyData, categoryColumn: "A", valueColumn: "B" }));
  zip.file("xl/charts/chart2.xml", createNativeChartXml({ type: "doughnut", title: "Métodos de pago", items: paymentData, categoryColumn: "D", valueColumn: "E" }));

  let contentTypes = await zip.file("[Content_Types].xml").async("string");
  const drawingOverride = contentTypes.includes('/xl/drawings/drawing1.xml') ? "" : '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
  contentTypes = contentTypes.replace("</Types>", `${drawingOverride}<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
  zip.file("[Content_Types].xml", contentTypes);
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

async function downloadWorkbook(workbook, fileName, nativeCharts = null) {
  let buffer = await workbook.xlsx.writeBuffer();
  if (nativeCharts) buffer = await injectNativeCharts(buffer, nativeCharts);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

export async function generarExcelReporteNegocio({ empresa = {}, ventas = [], fechaDesde, fechaHasta }) {
  if (!ventas.length) throw new Error("NO_DATA");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = empresa.nombre || "CajaLibre";
  workbook.created = new Date();
  workbook.subject = "Reporte ejecutivo del negocio";
  workbook.properties.date1904 = false;

  const businessName = String(empresa.nombre || "CajaLibre").trim();
  const period = `${fechaDesde || "Inicio"} al ${fechaHasta || "Hoy"}`;
  const total = ventas.reduce((sum, sale) => sum + safeNumber(sale.total), 0);
  const iva = ventas.reduce((sum, sale) => sum + safeNumber(sale.iva), 0);
  const units = ventas.reduce((sum, sale) => sum + (sale.productos || []).reduce((acc, product) => acc + safeNumber(product.cantidad), 0), 0);
  const productMap = new Map();
  const dayMap = new Map();
  const paymentMap = new Map();

  ventas.forEach((sale) => {
    const date = toDate(sale.fecha);
    const day = date ? date.toISOString().slice(0, 10) : "Sin fecha";
    dayMap.set(day, (dayMap.get(day) || 0) + safeNumber(sale.total));
    const payment = String(sale.tipoPago || "Otro").trim() || "Otro";
    paymentMap.set(payment, (paymentMap.get(payment) || 0) + safeNumber(sale.total));
    (sale.productos || []).forEach((product) => {
      const name = String(product.nombre || "Sin nombre").trim();
      const current = productMap.get(name) || { units: 0, sales: 0, cost: 0 };
      const quantity = safeNumber(product.cantidad);
      current.units += quantity;
      current.sales += safeNumber(product.precioVenta) * quantity;
      current.cost += safeNumber(product.precioCompra) * quantity;
      productMap.set(name, current);
    });
  });

  const summary = workbook.addWorksheet("Resumen ejecutivo", { views: [{ showGridLines: false }] });
  summary.properties.defaultRowHeight = 22;
  summary.columns = Array.from({ length: 12 }, () => ({ width: 13 }));
  summary.mergeCells("A1:L4");
  const titleCell = summary.getCell("A1");
  titleCell.value = `${businessName}\nREPORTE EJECUTIVO`;
  titleCell.font = { bold: true, size: 22, color: { argb: COLORS.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  [1, 2, 3, 4].forEach((row) => { summary.getRow(row).height = 24; });

  await addSystemLogo(workbook, summary);

  summary.mergeCells("A6:L6");
  summary.getCell("A6").value = `Periodo: ${period}  •  Generado: ${new Date().toLocaleString("es-MX")}`;
  summary.getCell("A6").font = { color: { argb: COLORS.slate }, italic: true };
  summary.getCell("A6").alignment = { horizontal: "center" };

  const cards = [
    ["A8:C10", "VENTAS", total, COLORS.blue, '$#,##0.00'],
    ["D8:F10", "TICKETS", ventas.length, COLORS.cyan, '#,##0'],
    ["G8:I10", "TICKET PROMEDIO", total / ventas.length, COLORS.green, '$#,##0.00'],
    ["J8:L10", "UNIDADES", units, COLORS.purple, '#,##0'],
  ];
  cards.forEach(([range, label, value, color, format]) => {
    summary.mergeCells(range);
    const cell = summary.getCell(range.split(":")[0]);
    cell.value = `${label}\n${Number(value).toLocaleString("es-MX", format.includes("$") ? { style: "currency", currency: "MXN" } : {})}`;
    cell.font = { bold: true, size: 15, color: { argb: COLORS.white } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  });
  [8, 9, 10].forEach((row) => { summary.getRow(row).height = 25; });

  const dailyData = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-10)
    .map(([label, value], index) => ({ label: label.slice(5), value, color: `#${[COLORS.blue, COLORS.cyan, COLORS.green, COLORS.purple][index % 4]}` }));
  const paymentColors = [`#${COLORS.green}`, `#${COLORS.blue}`, `#${COLORS.purple}`, `#${COLORS.amber}`, `#${COLORS.red}`];
  const paymentData = [...paymentMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], index) => ({ label, value, color: paymentColors[index % paymentColors.length] }));
  const chartDataSheet = workbook.addWorksheet("Datos graficas");
  chartDataSheet.state = "veryHidden";
  chartDataSheet.addRow(["Día", "Ventas", "", "Método de pago", "Total"]);
  const chartRows = Math.max(dailyData.length, paymentData.length);
  for (let index = 0; index < chartRows; index += 1) {
    chartDataSheet.addRow([
      dailyData[index]?.label || "", dailyData[index]?.value ?? "", "",
      paymentData[index]?.label || "", paymentData[index]?.value ?? "",
    ]);
  }
  summary.mergeCells("A29:L29");
  summary.getCell("A29").value = `Datos del negocio: ${empresa.subtitulo || ""}  •  Tel. ${empresa.telefono || "No registrado"}  •  ${empresa.correoTickets || empresa.correoNotas || "Correo no registrado"}`;
  summary.getCell("A29").alignment = { horizontal: "center", wrapText: true };
  summary.getCell("A29").font = { color: { argb: COLORS.slate }, size: 10 };
  summary.getCell("A31").value = "IVA acumulado";
  summary.getCell("B31").value = iva;
  summary.getCell("B31").numFmt = '$#,##0.00';

  const salesSheet = workbook.addWorksheet("Detalle de ventas");
  salesSheet.addRow(["Folio", "Fecha", "Cliente", "Método de pago", "Atendió", "Subtotal", "IVA", "IEPS", "Total", "Productos"]);
  ventas.slice().sort((a, b) => (toDate(a.fecha)?.getTime() || 0) - (toDate(b.fecha)?.getTime() || 0)).forEach((sale, index) => {
    salesSheet.addRow([
      String(sale.folioTicket || sale.id || index + 1), toDate(sale.fecha) || "", sale.clienteNombre || "Público general",
      sale.tipoPago || "-", sale.atendio || sale.atendidoPor || sale.actorEmail || "-", safeNumber(sale.subtotal), safeNumber(sale.iva),
      safeNumber(sale.ieps), safeNumber(sale.total), (sale.productos || []).map((p) => `${p.nombre || "Producto"} (${safeNumber(p.cantidad)})`).join(", "),
    ]);
  });
  salesSheet.getColumn(2).numFmt = "dd/mm/yyyy hh:mm";
  finishTable(salesSheet, [20, 20, 24, 20, 24, 16, 14, 14, 16, 52], [6, 7, 8, 9]);

  const productsSheet = workbook.addWorksheet("Productos y servicios");
  productsSheet.addRow(["Producto o servicio", "Unidades", "Ventas", "Costo estimado", "Utilidad estimada", "Margen"]);
  [...productMap.entries()].sort((a, b) => b[1].sales - a[1].sales).forEach(([name, item]) => {
    const profit = item.sales - item.cost;
    productsSheet.addRow([name, item.units, item.sales, item.cost, profit, item.sales ? profit / item.sales : 0]);
  });
  productsSheet.getColumn(6).numFmt = "0.0%";
  finishTable(productsSheet, [40, 14, 18, 18, 20, 14], [3, 4, 5]);

  await downloadWorkbook(
    workbook,
    `reporte-${cleanFilePart(businessName)}-${fechaDesde || "inicio"}-${fechaHasta || "hoy"}.xlsx`,
    { dailyData, paymentData },
  );
}

export async function generarExcelFacturaGlobal({ empresa = {}, ventas = [], fechaBase = new Date() }) {
  if (!ventas.length) throw new Error("NO_DATA");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const businessName = String(empresa.nombre || "CajaLibre").trim();
  const monthLabel = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(fechaBase);
  const total = ventas.reduce((sum, sale) => sum + safeNumber(sale.total), 0);
  const subtotal = ventas.reduce((sum, sale) => sum + safeNumber(sale.subtotal), 0);
  const iva = ventas.reduce((sum, sale) => sum + safeNumber(sale.iva), 0);
  const ieps = ventas.reduce((sum, sale) => sum + safeNumber(sale.ieps), 0);
  const sortedSales = ventas.slice().sort((a, b) => (toDate(a.fecha)?.getTime() || 0) - (toDate(b.fecha)?.getTime() || 0));
  workbook.creator = businessName;
  workbook.created = new Date();
  workbook.subject = `Control de operaciones para factura global - ${monthLabel}`;

  const summary = workbook.addWorksheet("Resumen factura global", { views: [{ showGridLines: false }] });
  summary.columns = Array.from({ length: 10 }, () => ({ width: 14 }));
  summary.mergeCells("A1:J4");
  const heading = summary.getCell("A1");
  heading.value = `${businessName}\nCONTROL PARA FACTURA GLOBAL`;
  heading.font = { bold: true, size: 21, color: { argb: COLORS.white } };
  heading.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  [1, 2, 3, 4].forEach((row) => { summary.getRow(row).height = 24; });
  await addSystemLogo(workbook, summary);

  summary.mergeCells("A6:J6");
  summary.getCell("A6").value = `Periodo fiscal: ${monthLabel}  •  Generado: ${new Date().toLocaleString("es-MX")}`;
  summary.getCell("A6").alignment = { horizontal: "center" };
  summary.getCell("A6").font = { italic: true, color: { argb: COLORS.slate } };

  const cards = [
    ["A8:B10", "OPERACIONES", ventas.length, COLORS.blue, false],
    ["C8:E10", "SUBTOTAL", subtotal, COLORS.cyan, true],
    ["F8:G10", "IMPUESTOS", iva + ieps, COLORS.purple, true],
    ["H8:J10", "TOTAL DEL MES", total, COLORS.green, true],
  ];
  cards.forEach(([range, label, value, color, currency]) => {
    summary.mergeCells(range);
    const cell = summary.getCell(range.split(":")[0]);
    cell.value = `${label}\n${currency ? safeNumber(value).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : safeNumber(value).toLocaleString("es-MX")}`;
    cell.font = { bold: true, size: 14, color: { argb: COLORS.white } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  });
  [8, 9, 10].forEach((row) => { summary.getRow(row).height = 25; });

  const info = [
    ["Primer folio", String(sortedSales[0]?.folioTicket || sortedSales[0]?.id || "-")],
    ["Último folio", String(sortedSales.at(-1)?.folioTicket || sortedSales.at(-1)?.id || "-")],
    ["IVA acumulado", iva],
    ["IEPS acumulado", ieps],
    ["Teléfono", empresa.telefono || "No registrado"],
    ["Correo", empresa.correoTickets || empresa.correoNotas || "No registrado"],
  ];
  summary.getCell("A13").value = "INFORMACIÓN DE CONTROL";
  summary.getCell("A13").font = { bold: true, color: { argb: COLORS.navy }, size: 13 };
  info.forEach(([label, value], index) => {
    const row = summary.getRow(15 + index);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true, color: { argb: COLORS.slate } };
    row.getCell(3).value = value;
    if (["IVA acumulado", "IEPS acumulado"].includes(label)) row.getCell(3).numFmt = '$#,##0.00';
    row.getCell(1).fill = row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? COLORS.white : "F8FAFC" } };
  });
  summary.mergeCells("A23:J24");
  summary.getCell("A23").value = "Documento auxiliar para conciliación y preparación de la factura global. Verifique la información antes de realizar el timbrado fiscal.";
  summary.getCell("A23").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  summary.getCell("A23").font = { italic: true, color: { argb: COLORS.slate }, size: 10 };

  const operations = workbook.addWorksheet("Operaciones del mes");
  operations.addRow(["Folio del ticket", "Fecha y hora", "Método de pago", "Subtotal", "IVA", "IEPS", "Total operación", "Mes y año"]);
  sortedSales.forEach((sale, index) => operations.addRow([
    String(sale.folioTicket || sale.id || index + 1), toDate(sale.fecha) || "", sale.tipoPago || "-",
    safeNumber(sale.subtotal), safeNumber(sale.iva), safeNumber(sale.ieps), safeNumber(sale.total), monthLabel,
  ]));
  operations.getColumn(2).numFmt = "dd/mm/yyyy hh:mm";
  finishTable(operations, [24, 21, 21, 17, 15, 15, 20, 24], [4, 5, 6, 7]);
  operations.addRow([]);
  const totalsRow = operations.addRow(["TOTALES", "", "", subtotal, iva, ieps, total, ""]);
  totalsRow.font = { bold: true, color: { argb: COLORS.white } };
  totalsRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  [4, 5, 6, 7].forEach((column) => { totalsRow.getCell(column).numFmt = '$#,##0.00'; });

  const year = fechaBase.getFullYear();
  const month = String(fechaBase.getMonth() + 1).padStart(2, "0");
  await downloadWorkbook(workbook, `factura-global-${cleanFilePart(businessName)}-${year}-${month}.xlsx`);
}
