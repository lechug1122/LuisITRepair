// Archivo: src/js/services/pdf_hoja_servicio.js

import { jsPDF } from "jspdf";
import logoUrl from "../../assets/logo.png";
import { getPdfFontFamily } from "./apariencia_config";

const BOX_X = 15;
const BOX_W = 180;
const PAGE_BOTTOM_LIMIT = 290;

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

  const tipo = await detectarTipoImagen(blob);

  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  return { dataUrl, tipo };
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
  doc.setLineWidth(0.7);
  doc.rect(10, 10, 190, 285);
}

function sanitize(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function labeledLines(doc, label, value, width) {
  return doc.splitTextToSize(`${label}: ${sanitize(value)}`, width);
}

function getLinesHeight(doc, lines) {
  return doc.getTextDimensions(lines).h;
}

function ensureSpace(doc, y, neededHeight) {
  if (y + neededHeight <= PAGE_BOTTOM_LIMIT) return y;
  doc.addPage();
  drawPageBorder(doc);
  return 15;
}

function drawSectionHeader(doc, title, y) {
  doc.setFillColor(28, 69, 135);
  doc.rect(BOX_X, y, BOX_W, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(title, BOX_X + 5, y + 6);
}

function drawClientSection(doc, y, form) {
  const lines = [
    labeledLines(doc, "Nombre", form.nombre, 172),
    labeledLines(doc, "Direccion", form.direccion, 172),
    labeledLines(doc, "Telefono", form.telefono, 172),
  ];

  const contentHeight = lines.reduce((acc, arr) => acc + getLinesHeight(doc, arr), 0) + 6;
  const sectionHeight = Math.max(30, 8 + 4 + contentHeight);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(BOX_X, y, BOX_W, sectionHeight);
  drawSectionHeader(doc, "DATOS DEL CLIENTE", y);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  let ty = y + 12;
  lines.forEach((arr) => {
    doc.text(arr, BOX_X + 5, ty);
    ty += getLinesHeight(doc, arr) + 2;
  });

  return y + sectionHeight + 5;
}

function drawEquipmentSection(doc, y, form, folio, serieTexto) {
  const colWidth = 53;
  const typeLines = labeledLines(doc, "Tipo", form.tipoDispositivo, colWidth);
  const brandLines = labeledLines(doc, "Marca", form.marca, colWidth);
  const modelLines = labeledLines(doc, "Modelo", form.modelo, colWidth);
  const row1Height = Math.max(
    getLinesHeight(doc, typeLines),
    getLinesHeight(doc, brandLines),
    getLinesHeight(doc, modelLines),
  );

  const serieLines = labeledLines(doc, "No. Serie", serieTexto, 172);
  const folioLines = labeledLines(doc, "Folio", folio, 172);
  const row2Height = getLinesHeight(doc, serieLines);
  const row3Height = getLinesHeight(doc, folioLines);

  const contentHeight = row1Height + row2Height + row3Height + 4;
  const sectionHeight = Math.max(26, 8 + 4 + contentHeight);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(BOX_X, y, BOX_W, sectionHeight);
  drawSectionHeader(doc, "DATOS DEL EQUIPO", y);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);

  let ty = y + 12;
  doc.text(typeLines, 20, ty);
  doc.text(brandLines, 80, ty);
  doc.text(modelLines, 140, ty);
  ty += row1Height + 1.5;

  doc.text(serieLines, 20, ty);
  ty += row2Height + 1.5;

  doc.text(folioLines, 20, ty);

  return y + sectionHeight + 5;
}

function drawLaptopPcSection(doc, y, form) {
  const colWidth = 53;
  const rows = [
    [
      labeledLines(doc, "Procesador", form.procesador, colWidth),
      labeledLines(doc, "RAM", form.ram, colWidth),
      labeledLines(doc, "Disco", form.disco, colWidth),
    ],
    [
      labeledLines(doc, "Estado de pantalla", form.estadoPantalla, colWidth),
      labeledLines(doc, "Estado de teclado", form.estadoTeclado, colWidth),
      labeledLines(doc, "Estado de mouse", form.estadoMouse, colWidth),
    ],
    [
      labeledLines(doc, "Enciende", form.enciendeEquipo, colWidth),
      labeledLines(doc, "Funciona", form.funciona, colWidth),
      labeledLines(doc, "Contrasena del equipo", form.contrasenaEquipo, colWidth),
    ],
  ];

  const rowHeights = rows.map((row) =>
    Math.max(getLinesHeight(doc, row[0]), getLinesHeight(doc, row[1]), getLinesHeight(doc, row[2])),
  );

  const contentHeight = rowHeights.reduce((acc, h) => acc + h, 0) + 4;
  const sectionHeight = Math.max(32, 8 + 4 + contentHeight);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(BOX_X, y, BOX_W, sectionHeight);
  drawSectionHeader(doc, "CARACTERISTICAS", y);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  let ty = y + 12;

  rows.forEach((row, i) => {
    doc.text(row[0], 20, ty);
    doc.text(row[1], 80, ty);
    doc.text(row[2], 140, ty);
    ty += rowHeights[i] + 1.5;
  });

  return y + sectionHeight + 5;
}

function drawSimpleDeviceSection(doc, y, title, formLines) {
  const allLines = formLines.flatMap((item) => labeledLines(doc, item.label, item.value, 172));
  const textHeight = allLines.reduce((acc, ln) => acc + getLinesHeight(doc, ln), 0) + 4;
  const sectionHeight = Math.max(20, 8 + 4 + textHeight);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(BOX_X, y, BOX_W, sectionHeight);
  drawSectionHeader(doc, title, y);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  let ty = y + 12;
  formLines.forEach((item) => {
    const arr = labeledLines(doc, item.label, item.value, 172);
    doc.text(arr, 20, ty);
    ty += getLinesHeight(doc, arr) + 1.5;
  });

  return y + sectionHeight + 5;
}

function drawTrabajoCostoSection(doc, y, form) {
  const trabajoLines = labeledLines(doc, "Trabajo", form.trabajo, 95);
  const costoTexto = form.precioDespues
    ? "El precio se define despues del mantenimiento"
    : `$${sanitize(form.costo)}`;
  const costoLines = labeledLines(doc, "Costo estimado", costoTexto, 72);

  const trabajoHeight = getLinesHeight(doc, trabajoLines);
  const costoHeight = getLinesHeight(doc, costoLines);
  const sectionHeight = Math.max(16, 8 + 4 + Math.max(trabajoHeight, costoHeight) + 2);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(BOX_X, y, BOX_W, sectionHeight);
  drawSectionHeader(doc, "TRABAJO Y COSTO", y);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(trabajoLines, 20, y + 12);
  doc.text(costoLines, 120, y + 12);

  return y + sectionHeight + 5;
}

function drawTerminosSection(doc, y) {
  const texto = [
    "Copia de seguridad de datos: El proveedor recomienda al cliente realizar copias de seguridad antes de la intervencion. El proveedor no se hace responsable de perdida de datos, programas o configuraciones.",
    "Garantia de reparacion: El proveedor se compromete a realizar su mejor esfuerzo para resolver el problema. La garantia se limita a los trabajos efectuados.",
    "Limitacion de responsabilidad: El proveedor no sera responsable por fallas derivadas de virus, uso indebido, modificaciones del cliente o causas ajenas a su control.",
    "Presupuesto y autorizacion: Ningun trabajo sera realizado sin la autorizacion del cliente.",
    "Tiempo de entrega: El tiempo estimado puede variar segun la complejidad de la reparacion.",
    "Revision posterior: El cliente se compromete a revisar el equipo al momento de la entrega.",
    "Garantia de los trabajos: No cubre danos por manipulacion indebida, virus, golpes, caidas, liquidos u otros eventos externos.",
    "Despues de 30 dias de abandono, el proveedor no se hace responsable del uso del equipo.",
  ];

  doc.setFontSize(8.5);
  const blocks = texto.map((t) => doc.splitTextToSize(t, 172));
  const lineGap = 2.5;
  const headerHeight = 12;
  const topPadding = 4;
  const bottomPadding = 4;
  const sectionGap = 8;
  const minUsableHeight = headerHeight + topPadding + bottomPadding + 8;

  let index = 0;
  let firstChunk = true;

  while (index < blocks.length) {
    let available = PAGE_BOTTOM_LIMIT - y;

    if (available < minUsableHeight) {
      doc.addPage();
      drawPageBorder(doc);
      y = 15;
      available = PAGE_BOTTOM_LIMIT - y;
    }

    let used = headerHeight + topPadding;
    let end = index;

    while (end < blocks.length) {
      const nextHeight = getLinesHeight(doc, blocks[end]) + lineGap;
      if (used + nextHeight + bottomPadding > available) break;
      used += nextHeight;
      end += 1;
    }

    if (end === index) {
      end = index + 1;
      used += getLinesHeight(doc, blocks[index]) + lineGap;
    }

    const sectionHeight = Math.min(available, used + bottomPadding);

    doc.setDrawColor(63, 135, 166);
    doc.setLineWidth(0.5);
    doc.rect(BOX_X, y, BOX_W, sectionHeight);

    doc.setFillColor(63, 135, 166);
    doc.rect(BOX_X, y, BOX_W, headerHeight, "F");

    doc.setTextColor(255, 255, 255);
    doc.text(
      firstChunk ? "Terminos y Condiciones" : "Terminos y Condiciones (continuacion)",
      BOX_X + 5,
      y + 9,
    );

    doc.setTextColor(0, 0, 0);
    let ty = y + 16;
    for (let i = index; i < end; i += 1) {
      doc.text(blocks[i], BOX_X + 3, ty);
      ty += getLinesHeight(doc, blocks[i]) + lineGap;
    }

    y += sectionHeight + sectionGap;
    index = end;
    firstChunk = false;

    if (index < blocks.length) {
      doc.addPage();
      drawPageBorder(doc);
      y = 15;
    }
  }

  return y;
}

function drawFirmas(doc, y) {
  y = ensureSpace(doc, y, 17);
  doc.setFontSize(10);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);

  doc.rect(15, y, 85, 15);
  doc.rect(110, y, 85, 15);

  doc.text("NOMBRE Y FIRMA DEL TECNICO:", 20, y + 6);
  doc.text("NOMBRE Y FIRMA DEL CLIENTE:", 115, y + 6);
}

export async function generarPdfHojaServicio(form, folio) {
  try {
    const doc = new jsPDF();
    const pdfFont = getPdfFontFamily();
    const setPdfFont = (style = "normal") => doc.setFont(pdfFont, style);
    const serieTexto = form.omitirNumeroSerie ? "No proporcionado" : sanitize(form.numeroSerie);

    drawPageBorder(doc);

    let logoDataUrlPng = null;
    try {
      const { dataUrl } = await fetchAsDataURL(logoUrl);
      logoDataUrlPng = await convertirADataURLPNG(dataUrl);
    } catch (e) {
      console.warn("Logo no cargado:", e.message);
    }

    if (logoDataUrlPng) {
      doc.addImage(logoDataUrlPng, "PNG", 15, 12, 32, 32);
    }

    setPdfFont("bold");
    doc.setFontSize(30);
    doc.setTextColor(0, 0, 0);
    doc.text("Hoja De Servicio", 60, 30);

    const ahora = new Date();
    setPdfFont("normal");
    doc.setFontSize(10);
    doc.text(
      `Fecha: ${ahora.toLocaleDateString()} ${ahora.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      150,
      24,
    );

    let y = 45;

    y = drawClientSection(doc, y, form);
    y = drawEquipmentSection(doc, y, form, folio, serieTexto);

    if (form.tipoDispositivo === "laptop" || form.tipoDispositivo === "pc") {
      y = drawLaptopPcSection(doc, y, form);
    } else if (form.tipoDispositivo === "impresora") {
      y = drawSimpleDeviceSection(doc, y, "IMPRESORA", [
        { label: "Tipo", value: form.tipoImpresora },
        { label: "Imprime", value: form.imprime },
        { label: "Condiciones", value: form.condicionesImpresora },
      ]);
    } else if (form.tipoDispositivo === "monitor") {
      y = drawSimpleDeviceSection(doc, y, "MONITOR", [
        { label: "Tamano", value: form.tamanoMonitor },
        { label: "Colores correctos", value: form.colores },
        { label: "Condiciones", value: form.condicionesMonitor },
      ]);
    }

    y = drawTrabajoCostoSection(doc, y, form);
    y = drawTerminosSection(doc, y);
    drawFirmas(doc, y);

    doc.save(`comprobante_${folio}.pdf`);
  } catch (err) {
    console.error("Error generando PDF:", err);
    alert("Error generando PDF. Revisa consola (F12).");
  }
}
