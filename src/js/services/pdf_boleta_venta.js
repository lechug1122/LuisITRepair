import { jsPDF } from "jspdf";
import logoUrl from "../../assets/logo.png";
import { getPdfFontFamily } from "./apariencia_config";
import { obtenerEmpresa, readEmpresaConfigCache } from "./configure_empresa";

const BLUE = [70, 116, 190];
const DARK = [15, 23, 42];

const clean = (value, fallback = "") => String(value ?? "").trim() || fallback;
const numeric = (value) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value) => new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", minimumFractionDigits: 2,
}).format(numeric(value));

function dateLabel(value) {
  const raw = clean(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw || new Date().toLocaleDateString("es-MX");
}

async function loadImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo cargar el logotipo");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function cell(doc, x, y, width, height, value, options = {}) {
  const { align = "left", bold = false, fill = null, fontSize = 9 } = options;
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.35);
  if (fill) {
    doc.setFillColor(...fill);
    doc.rect(x, y, width, height, "FD");
  } else doc.rect(x, y, width, height);

  doc.setTextColor(...DARK);
  doc.setFont(getPdfFontFamily(), bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(clean(value), width - 4);
  const tx = align === "center" ? x + width / 2 : align === "right" ? x + width - 2 : x + 2;
  const lineHeight = fontSize * 0.38;
  const ty = y + Math.max(4, (height - lines.length * lineHeight) / 2 + lineHeight);
  doc.text(lines, tx, ty, { align });
}

function header(doc, data, empresa, logo) {
  const pageWidth = doc.internal.pageSize.getWidth();
  if (logo) doc.addImage(logo, "PNG", 12, 8, 25, 25);

  doc.setTextColor(...DARK);
  doc.setFont(getPdfFontFamily(), "bold");
  doc.setFontSize(15);
  doc.text(clean(empresa?.nombre, "CajaLibre"), 41, 15);
  doc.setFontSize(8.5);
  doc.text(clean(empresa?.subtitulo, "Punto de venta y servicios"), 41, 21);
  doc.setFont(getPdfFontFamily(), "normal");
  const telefonoNegocio = clean(
    data.telefonoNegocio,
    clean(empresa?.telefono, import.meta.env.VITE_NEGOCIO_TELEFONO),
  );
  const correoNegocio = clean(
    data.correoNegocio,
    clean(empresa?.correoNotas, import.meta.env.VITE_NEGOCIO_CORREO_NOTAS),
  );
  if (telefonoNegocio) doc.text(`Teléfono: ${telefonoNegocio}`, 41, 27);
  if (correoNegocio) doc.text(`Correo: ${correoNegocio}`, 41, 32);

  const x = pageWidth - 125;
  doc.setLineWidth(0.55);
  doc.rect(x, 9, 113, 27);
  doc.setFillColor(...BLUE);
  doc.rect(x, 18, 113, 10, "FD");
  doc.setFont(getPdfFontFamily(), "bold");
  doc.setFontSize(16);
  doc.text("BOLETA DE VENTA", x + 56.5, 25, { align: "center" });
  doc.setFontSize(8.5);
  doc.text(`Folio: ${clean(data.folio, "S/F")}`, x + 110, 15, { align: "right" });
}

function client(doc, data) {
  const fields = [
    ["Señor(a):", clean(data.nombre, "Cliente general"), 48],
    ["Dirección:", clean(data.direccion, "S/N"), 56],
    ["Teléfono:", clean(data.telefono, "S/N"), 64],
  ];
  fields.forEach(([label, value, y]) => {
    doc.setFont(getPdfFontFamily(), "bold");
    doc.setFontSize(9);
    doc.text(label, 15, y);
    doc.setFont(getPdfFontFamily(), "normal");
    doc.text(value, 38, y);
    doc.line(37, y + 1.5, 174, y + 1.5);
  });
  doc.setFont(getPdfFontFamily(), "bold");
  doc.text("F. emisión:", 187, 56);
  doc.setFont(getPdfFontFamily(), "normal");
  doc.text(dateLabel(data.fecha), 214, 56);
  doc.line(212, 57.5, 267, 57.5);
}

const COLUMNS = [
  ["ITEM", 12, 29], ["DESCRIPCIÓN", 41, 93], ["P. UNITARIO", 134, 41],
  ["CANTIDAD", 175, 42], ["IMPORTE", 217, 48],
];

function tableHeader(doc, y) {
  COLUMNS.forEach(([label, x, width]) =>
    cell(doc, x, y, width, 12, label, { align: "center", bold: true, fill: BLUE, fontSize: 9.5 }));
}

export async function generarPdfBoletaVenta(data = {}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  let empresa = readEmpresaConfigCache();
  try { empresa = await obtenerEmpresa(); } catch { /* usa caché */ }
  let logo = null;
  try { logo = await loadImage(logoUrl); } catch (error) { console.warn("Logo PDF no disponible", error); }

  const items = (Array.isArray(data.items) ? data.items : []).map((item, index) => {
    const cantidad = Math.max(0, numeric(item?.cantidad));
    const precio = numeric(item?.pUnitario ?? item?.precio);
    return {
      code: clean(item?.item, `P-${String(index + 1).padStart(3, "0")}`),
      description: clean(item?.descripcion, "Artículo"),
      cantidad, precio, importe: cantidad * precio,
    };
  });

  header(doc, data, empresa, logo);
  client(doc, data);
  let y = 72;
  tableHeader(doc, y);
  y += 12;

  items.forEach((item) => {
    doc.setFont(getPdfFontFamily(), "normal");
    doc.setFontSize(9);
    const rows = doc.splitTextToSize(item.description, 89).length;
    const height = Math.max(11, rows * 4 + 4);
    if (y + height > 176) {
      doc.addPage();
      header(doc, data, empresa, logo);
      y = 44;
      tableHeader(doc, y);
      y += 12;
    }
    cell(doc, 12, y, 29, height, item.code, { align: "center" });
    cell(doc, 41, y, 93, height, item.description);
    cell(doc, 134, y, 41, height, money(item.precio), { align: "right" });
    cell(doc, 175, y, 42, height, String(item.cantidad), { align: "center" });
    cell(doc, 217, y, 48, height, money(item.importe), { align: "right" });
    y += height;
  });

  const calculated = items.reduce((sum, item) => sum + item.importe, 0);
  const total = numeric(data.total) || calculated;
  cell(doc, 175, y, 42, 11, "TOTAL", { align: "center", bold: true, fill: BLUE, fontSize: 10 });
  cell(doc, 217, y, 48, 11, money(total), { align: "right", bold: true, fontSize: 10 });
  y += 18;

  if (y > 184) {
    doc.addPage();
    header(doc, data, empresa, logo);
    y = 46;
  }
  doc.setFont(getPdfFontFamily(), "bold");
  doc.setFontSize(8.5);
  doc.text(`Forma de pago: ${clean(data.formaPago, "No especificada")}`, 12, y);
  if (clean(data.notas)) {
    doc.text("Notas:", 12, y + 7);
    doc.setFont(getPdfFontFamily(), "normal");
    doc.text(doc.splitTextToSize(clean(data.notas), 235), 28, y + 7);
  }

  const folio = clean(data.folio, Date.now()).replace(/[^\w-]+/g, "-");
  doc.setProperties({
    title: `Boleta de venta ${folio}`,
    author: clean(empresa?.nombre, "CajaLibre"),
    creator: "CajaLibre",
  });
  doc.save(`boleta-${folio}.pdf`);
}
