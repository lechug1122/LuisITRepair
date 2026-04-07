import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { manualSections } from "./manual_sistema_sections.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "docs", "Manual_Sistema_LuisITRepair.pdf");
const LOGO_PATH = path.join(ROOT_DIR, "src", "assets", "logo.png");

const COLORS = {
  ink: "#172033",
  muted: "#5b6980",
  line: "#d6e0ef",
  surface: "#f5f8fc",
  white: "#ffffff",
  teal: "#0f766e",
  tealSoft: "#dcf5f1",
  blue: "#2563eb",
  blueSoft: "#dbeafe",
  violet: "#7c3aed",
  violetSoft: "#ede9fe",
  amber: "#d97706",
  amberSoft: "#fef3c7",
  rose: "#e11d48",
  roseSoft: "#ffe4ec",
  emerald: "#16a34a",
  emeraldSoft: "#dcfce7",
  sky: "#0891b2",
  skySoft: "#d9f3fb",
  slate: "#334155",
  slateSoft: "#e2e8f0",
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 34,
};

const MANUAL_TITLE = "Manual Operativo del Sistema";
const MANUAL_SUBTITLE = "Servicios, POS, clientes, reportes, seguimiento y configuracion";
const GENERATED_LABEL = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
}).format(new Date());

function hexToRgb(hex) {
  const normalized = String(hex || "")
    .replace("#", "")
    .trim();
  const safe = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padEnd(6, "0").slice(0, 6);

  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}

function setFill(doc, hex) {
  const { r, g, b } = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setDraw(doc, hex) {
  const { r, g, b } = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function setText(doc, hex) {
  const { r, g, b } = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function drawRoundedPanel(doc, x, y, width, height, options = {}) {
  const {
    fill = COLORS.white,
    border = COLORS.line,
    radius = 14,
    lineWidth = 0.8,
  } = options;

  setFill(doc, fill);
  setDraw(doc, border);
  doc.setLineWidth(lineWidth);
  doc.roundedRect(x, y, width, height, radius, radius, "FD");
}

function writeWrappedText(doc, text, x, y, width, options = {}) {
  const {
    fontSize = 10,
    color = COLORS.ink,
    font = "helvetica",
    style = "normal",
    lineHeight = fontSize * 1.35,
  } = options;

  doc.setFont(font, style);
  doc.setFontSize(fontSize);
  setText(doc, color);
  const lines = doc.splitTextToSize(String(text || ""), width);
  doc.text(lines, x, y);
  return y + (Math.max(lines.length, 1) - 1) * lineHeight + lineHeight;
}

function drawTag(doc, x, y, text, options = {}) {
  const {
    fill = COLORS.slateSoft,
    border = fill,
    color = COLORS.ink,
    paddingX = 10,
    height = 18,
    fontSize = 8.5,
  } = options;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  const content = String(text || "").trim();
  const width = doc.getTextWidth(content) + paddingX * 2;

  setFill(doc, fill);
  setDraw(doc, border);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, width, height, 9, 9, "FD");
  setText(doc, color);
  doc.text(content, x + paddingX, y + 12.5);
  return width;
}

function drawBulletList(doc, x, y, width, items, options = {}) {
  const {
    fontSize = 9.3,
    color = COLORS.ink,
    bulletColor = COLORS.ink,
    numbered = false,
  } = options;

  let cursorY = y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);

  items.forEach((item, index) => {
    const prefix = numbered ? `${index + 1}.` : "";
    const bulletX = x + (numbered ? 0 : 1);
    const textX = x + (numbered ? 16 : 14);
    const lines = doc.splitTextToSize(String(item || ""), width - (numbered ? 16 : 14));

    if (!numbered) {
      setFill(doc, bulletColor);
      doc.circle(bulletX + 4, cursorY + 3.6, 1.6, "F");
    } else {
      setText(doc, bulletColor);
      doc.setFont("helvetica", "bold");
      doc.text(prefix, bulletX, cursorY + 5);
      doc.setFont("helvetica", "normal");
    }

    setText(doc, color);
    doc.text(lines, textX, cursorY + 5);
    cursorY += lines.length * 12 + 6;
  });

  return cursorY;
}

function drawInfoBox(doc, x, y, width, height, title, items, accent, options = {}) {
  const {
    numbered = false,
    paragraph = "",
  } = options;

  drawRoundedPanel(doc, x, y, width, height, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 16,
  });

  setFill(doc, accent);
  doc.circle(x + 16, y + 18, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  setText(doc, COLORS.ink);
  doc.text(title, x + 28, y + 22);

  setDraw(doc, COLORS.line);
  doc.setLineWidth(0.5);
  doc.line(x + 14, y + 30, x + width - 14, y + 30);

  let cursorY = y + 46;
  if (paragraph) {
    cursorY = writeWrappedText(doc, paragraph, x + 14, cursorY, width - 28, {
      fontSize: 9.1,
      color: COLORS.muted,
      lineHeight: 12.5,
    });
    cursorY += 2;
  }

  drawBulletList(doc, x + 14, cursorY, width - 28, items, {
    fontSize: 9.1,
    color: COLORS.ink,
    bulletColor: accent,
    numbered,
  });
}

function drawMiniCard(doc, x, y, width, height, label, value, accent, soft) {
  drawRoundedPanel(doc, x, y, width, height, {
    fill: soft,
    border: soft,
    radius: 12,
    lineWidth: 0.4,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setText(doc, COLORS.muted);
  doc.text(label, x + 10, y + 16);
  doc.setFontSize(13);
  setText(doc, accent);
  doc.text(value, x + 10, y + 34);
}

function drawWindow(doc, x, y, width, height, title, accent) {
  drawRoundedPanel(doc, x, y, width, height, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 16,
    lineWidth: 0.8,
  });

  setFill(doc, accent);
  doc.roundedRect(x, y, width, 28, 16, 16, "F");
  doc.rect(x, y + 14, width, 14, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  setText(doc, COLORS.white);
  doc.text(title, x + 14, y + 18);

  const dots = [width - 38, width - 27, width - 16];
  dots.forEach((offset) => {
    setFill(doc, COLORS.white);
    doc.circle(x + offset, y + 14, 1.9, "F");
  });

  return {
    x: x + 12,
    y: y + 40,
    width: width - 24,
    height: height - 52,
  };
}

function fillRows(doc, x, y, rows, rowHeight, color, border = COLORS.line) {
  rows.forEach((width, index) => {
    drawRoundedPanel(doc, x, y + index * (rowHeight + 6), width, rowHeight, {
      fill: color,
      border,
      radius: 8,
      lineWidth: 0.3,
    });
  });
}

function measureWrappedTextHeight(doc, text, width, options = {}) {
  const {
    fontSize = 10,
    font = "helvetica",
    style = "normal",
    lineHeight = fontSize * 1.35,
  } = options;

  doc.setFont(font, style);
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(String(text || ""), width);
  return Math.max(lines.length, 1) * lineHeight;
}

function measureBulletListHeight(doc, width, items, options = {}) {
  const {
    fontSize = 9.3,
    numbered = false,
  } = options;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);

  return items.reduce((total, item) => {
    const lines = doc.splitTextToSize(String(item || ""), width - (numbered ? 16 : 14));
    return total + (Math.max(lines.length, 1) * 12) + 6;
  }, 0);
}

function getInfoBoxHeight(doc, width, items, options = {}) {
  const {
    paragraph = "",
    fontSize = 9.1,
    numbered = false,
  } = options;

  let height = 46;
  if (paragraph) {
    height += measureWrappedTextHeight(doc, paragraph, width - 28, {
      fontSize,
      lineHeight: 12.5,
    }) + 2;
  }

  height += measureBulletListHeight(doc, width - 28, items, {
    fontSize,
    numbered,
  });

  return Math.max(height + 12, 120);
}

function getTagWidth(doc, text, options = {}) {
  const {
    paddingX = 10,
    fontSize = 8.5,
  } = options;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  return doc.getTextWidth(String(text || "").trim()) + paddingX * 2;
}

function getTagFlowHeight(doc, x, maxWidth, tags, options = {}) {
  const {
    height = 18,
    gapX = 8,
    gapY = 8,
  } = options;

  if (!Array.isArray(tags) || tags.length === 0) return 0;

  let cursorX = x;
  let rows = 1;

  tags.forEach((tag) => {
    const tagWidth = getTagWidth(doc, tag, options);
    if (cursorX !== x && cursorX + tagWidth > maxWidth) {
      rows += 1;
      cursorX = x;
    }
    cursorX += tagWidth + gapX;
  });

  return rows * height + (rows - 1) * gapY;
}

function drawTagFlow(doc, x, y, maxWidth, tags, options = {}) {
  const {
    height = 18,
    gapX = 8,
    gapY = 8,
  } = options;

  let cursorX = x;
  let cursorY = y;

  tags.forEach((tag) => {
    const tagWidth = getTagWidth(doc, tag, options);
    if (cursorX !== x && cursorX + tagWidth > maxWidth) {
      cursorX = x;
      cursorY += height + gapY;
    }
    drawTag(doc, cursorX, cursorY, tag, options);
    cursorX += tagWidth + gapX;
  });

  return cursorY + height;
}

function drawSystemMapFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Mapa del sistema", accent);
  const centerX = inner.x + inner.width / 2;
  const centerY = inner.y + 60;
  const centerBox = {
    x: centerX - 56,
    y: centerY - 16,
    width: 112,
    height: 32,
  };
  const nodeWidth = 64;
  const nodeHeight = 24;
  const nodes = [
    { label: "Inicio", x: inner.x + 8, y: inner.y + 12, fill: COLORS.blueSoft, color: COLORS.blue },
    { label: "POS", x: inner.x + inner.width - nodeWidth - 8, y: inner.y + 12, fill: COLORS.emeraldSoft, color: COLORS.emerald },
    { label: "Servicios", x: inner.x + 8, y: inner.y + 82, fill: COLORS.violetSoft, color: COLORS.violet },
    { label: "Reportes", x: inner.x + inner.width - nodeWidth - 8, y: inner.y + 82, fill: COLORS.amberSoft, color: COLORS.amber },
    { label: "Clientes", x: inner.x + 8, y: inner.y + 112, fill: COLORS.skySoft, color: COLORS.sky },
    { label: "Config.", x: inner.x + inner.width - nodeWidth - 8, y: inner.y + 112, fill: COLORS.roseSoft, color: COLORS.rose },
  ];

  setDraw(doc, COLORS.line);
  doc.setLineWidth(0.8);
  nodes.forEach((node) => {
    doc.line(centerX, centerY + 2, node.x + nodeWidth / 2, node.y + nodeHeight / 2);
  });

  drawRoundedPanel(doc, centerBox.x, centerBox.y, centerBox.width, centerBox.height, {
    fill: COLORS.tealSoft,
    border: COLORS.tealSoft,
    radius: 12,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  setText(doc, COLORS.teal);
  doc.text("Operacion central", centerX, centerY + 3, { align: "center" });

  nodes.forEach((node) => {
    drawRoundedPanel(doc, node.x, node.y, nodeWidth, nodeHeight, {
      fill: node.fill,
      border: node.fill,
      radius: 10,
      lineWidth: 0.4,
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.8);
    setText(doc, node.color);
    doc.text(node.label, node.x + nodeWidth / 2, node.y + 16, { align: "center" });
  });

  drawRoundedPanel(doc, inner.x + 8, inner.y + inner.height - 28, inner.width - 16, 18, {
    fill: COLORS.surface,
    border: COLORS.line,
    radius: 10,
    lineWidth: 0.4,
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  setText(doc, COLORS.muted);
  doc.text("Modulo publico: /status, /status/scan y detalle por folio", inner.x + inner.width / 2, inner.y + inner.height - 15, {
    align: "center",
  });
}

function drawLoginNavFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Acceso y barra superior", accent);
  drawRoundedPanel(doc, inner.x, inner.y, 86, inner.height, {
    fill: COLORS.surface,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 10, inner.y + 18, [66, 58, 62], 18, COLORS.white);
  drawRoundedPanel(doc, inner.x + 100, inner.y + 10, inner.width - 100, 26, {
    fill: accent,
    border: accent,
    radius: 10,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  setText(doc, COLORS.white);
  doc.text("Navbar con accesos segun permisos", inner.x + 112, inner.y + 27);

  drawRoundedPanel(doc, inner.x + 114, inner.y + 58, inner.width - 124, 124, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 14,
  });
  fillRows(doc, inner.x + 126, inner.y + 78, [118, 118, 118], 18, COLORS.surface);
  fillRows(doc, inner.x + 258, inner.y + 78, [70, 70], 18, COLORS.blueSoft, COLORS.blueSoft);
  fillRows(doc, inner.x + 126, inner.y + 136, [156, 90], 16, COLORS.slateSoft, COLORS.slateSoft);

  drawRoundedPanel(doc, inner.x + 114, inner.y + 198, inner.width - 124, 30, {
    fill: COLORS.emeraldSoft,
    border: COLORS.emeraldSoft,
    radius: 12,
  });
  setText(doc, COLORS.emerald);
  doc.text("Menu de usuario, notificaciones y cierre de sesion", inner.x + 126, inner.y + 217);
}

function drawDashboardFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Dashboard de inicio", accent);
  drawMiniCard(doc, inner.x, inner.y, 66, 40, "Ventas", "$18.4k", COLORS.blue, COLORS.blueSoft);
  drawMiniCard(doc, inner.x + 74, inner.y, 66, 40, "Servicios", "42", COLORS.violet, COLORS.violetSoft);
  drawMiniCard(doc, inner.x + 148, inner.y, 66, 40, "Clientes", "180", COLORS.emerald, COLORS.emeraldSoft);

  drawRoundedPanel(doc, inner.x, inner.y + 54, 108, 92, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 10, inner.y + 70, [88, 88, 72], 14, COLORS.surface);

  drawRoundedPanel(doc, inner.x + 116, inner.y + 54, 98, 92, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 126, inner.y + 70, [78, 68, 76], 14, COLORS.emeraldSoft, COLORS.emeraldSoft);

  drawRoundedPanel(doc, inner.x, inner.y + 156, inner.width, 62, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  const chartBaseY = inner.y + 204;
  [28, 40, 18, 52, 30, 44].forEach((bar, index) => {
    setFill(doc, index % 2 === 0 ? COLORS.blueSoft : COLORS.violetSoft);
    doc.roundedRect(inner.x + 16 + index * 32, chartBaseY - bar, 18, bar, 8, 8, "F");
  });

  setDraw(doc, COLORS.blue);
  doc.setLineWidth(1.4);
  doc.lines(
    [
      [22, -12],
      [22, 8],
      [22, -18],
      [22, 14],
      [22, -6],
    ],
    inner.x + 20,
    inner.y + 182,
  );
}

function drawServiceFormFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Hoja de servicio", accent);
  fillRows(doc, inner.x, inner.y, [inner.width * 0.62, inner.width * 0.34], 22, COLORS.white, COLORS.line);
  fillRows(doc, inner.x, inner.y + 34, [inner.width * 0.46, inner.width * 0.46], 22, COLORS.white, COLORS.line);
  fillRows(doc, inner.x, inner.y + 68, [inner.width * 0.32, inner.width * 0.3, inner.width * 0.3], 22, COLORS.white, COLORS.line);

  drawRoundedPanel(doc, inner.x + 6, inner.y + 20, 122, 64, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 14, inner.y + 30, [92, 86], 14, COLORS.surface);

  drawRoundedPanel(doc, inner.x, inner.y + 112, inner.width, 76, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 12, inner.y + 126, [inner.width - 24, inner.width - 42, inner.width - 56], 14, COLORS.surface);

  drawRoundedPanel(doc, inner.x + inner.width - 94, inner.y + inner.height - 30, 94, 24, {
    fill: COLORS.violetSoft,
    border: COLORS.violetSoft,
    radius: 10,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  setText(doc, COLORS.violet);
  doc.text("Guardar y emitir", inner.x + inner.width - 82, inner.y + inner.height - 14);
}

function drawServicesListFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Listado de servicios", accent);
  drawTag(doc, inner.x, inner.y, "Pendientes", {
    fill: COLORS.amberSoft,
    border: COLORS.amberSoft,
    color: COLORS.amber,
  });
  drawTag(doc, inner.x + 84, inner.y, "Historial", {
    fill: COLORS.surface,
    border: COLORS.line,
    color: COLORS.muted,
  });

  drawRoundedPanel(doc, inner.x, inner.y + 30, inner.width, inner.height - 30, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });

  const cols = [44, 88, 52, 52, 46];
  let lineX = inner.x + 12;
  cols.forEach((colWidth) => {
    drawRoundedPanel(doc, lineX, inner.y + 42, colWidth, 10, {
      fill: COLORS.slateSoft,
      border: COLORS.slateSoft,
      radius: 5,
    });
    lineX += colWidth + 8;
  });

  for (let row = 0; row < 5; row += 1) {
    const rowY = inner.y + 62 + row * 26;
    drawRoundedPanel(doc, inner.x + 12, rowY, inner.width - 24, 18, {
      fill: row % 2 === 0 ? COLORS.surface : COLORS.white,
      border: row % 2 === 0 ? COLORS.surface : COLORS.line,
      radius: 7,
      lineWidth: row % 2 === 0 ? 0.2 : 0.3,
    });
    setFill(doc, row === 1 ? COLORS.emerald : row === 3 ? COLORS.rose : COLORS.amber);
    doc.circle(inner.x + inner.width - 22, rowY + 9, 4, "F");
  }
}

function drawServiceDetailFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Detalle del servicio", accent);
  drawRoundedPanel(doc, inner.x, inner.y, 86, inner.height, {
    fill: COLORS.surface,
    border: COLORS.line,
    radius: 12,
  });
  ["Pendiente", "Revision", "Refaccion", "Listo"].forEach((label, index) => {
    drawRoundedPanel(doc, inner.x + 10, inner.y + 16 + index * 38, 66, 26, {
      fill: index === 2 ? COLORS.amberSoft : index === 3 ? COLORS.emeraldSoft : COLORS.white,
      border: COLORS.line,
      radius: 10,
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(doc, index === 2 ? COLORS.amber : index === 3 ? COLORS.emerald : COLORS.muted);
    doc.text(label, inner.x + 18, inner.y + 33 + index * 38);
  });

  drawRoundedPanel(doc, inner.x + 96, inner.y, inner.width - 96, 78, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 108, inner.y + 14, [90, 70, 112], 12, COLORS.surface);

  drawRoundedPanel(doc, inner.x + 96, inner.y + 88, inner.width - 96, 78, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 108, inner.y + 104, [inner.width - 122, inner.width - 144, inner.width - 162], 12, COLORS.surface);

  drawRoundedPanel(doc, inner.x + inner.width - 78, inner.y + inner.height - 80, 62, 62, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 8,
  });
  setDraw(doc, accent);
  doc.setLineWidth(1);
  const qrX = inner.x + inner.width - 72;
  const qrY = inner.y + inner.height - 74;
  [0, 2, 4].forEach((row) => {
    [0, 2, 4].forEach((col) => {
      doc.rect(qrX + col * 10, qrY + row * 10, 6, 6, "S");
    });
  });
}

function drawClientsFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Clientes", accent);
  drawRoundedPanel(doc, inner.x, inner.y, inner.width, 20, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 9,
  });
  drawRoundedPanel(doc, inner.x + 10, inner.y + 34, 96, 42, {
    fill: COLORS.skySoft,
    border: COLORS.skySoft,
    radius: 12,
  });
  drawRoundedPanel(doc, inner.x + 112, inner.y + 34, 96, 42, {
    fill: COLORS.emeraldSoft,
    border: COLORS.emeraldSoft,
    radius: 12,
  });

  for (let index = 0; index < 3; index += 1) {
    const rowY = inner.y + 88 + index * 40;
    drawRoundedPanel(doc, inner.x, rowY, inner.width, 30, {
      fill: COLORS.white,
      border: COLORS.line,
      radius: 12,
    });
    setFill(doc, index === 0 ? COLORS.blue : index === 1 ? COLORS.violet : COLORS.amber);
    doc.circle(inner.x + 16, rowY + 15, 7, "F");
    fillRows(doc, inner.x + 30, rowY + 7, [90, 54], 7, COLORS.surface);
    drawRoundedPanel(doc, inner.x + inner.width - 70, rowY + 5, 58, 20, {
      fill: COLORS.skySoft,
      border: COLORS.skySoft,
      radius: 10,
    });
  }
}

function drawPosFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Punto de venta", accent);
  drawRoundedPanel(doc, inner.x, inner.y, 92, inner.height, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 10, inner.y + 16, [72, 62, 72, 58], 14, COLORS.surface);
  drawRoundedPanel(doc, inner.x + 100, inner.y, inner.width - 100, 126, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 112, inner.y + 18, [inner.width - 124, inner.width - 136, inner.width - 152], 14, COLORS.surface);
  drawRoundedPanel(doc, inner.x + 100, inner.y + 136, inner.width - 100, 68, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  drawRoundedPanel(doc, inner.x + 112, inner.y + 154, 70, 24, {
    fill: COLORS.emeraldSoft,
    border: COLORS.emeraldSoft,
    radius: 10,
  });
  drawRoundedPanel(doc, inner.x + 188, inner.y + 154, 70, 24, {
    fill: COLORS.blueSoft,
    border: COLORS.blueSoft,
    radius: 10,
  });
}

function drawInventoryFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Inventario", accent);
  ["Identificacion", "Stock", "Fiscal"].forEach((label, index) => {
    drawRoundedPanel(doc, inner.x + index * 68, inner.y, 62, 18, {
      fill: index === 0 ? COLORS.emeraldSoft : COLORS.surface,
      border: index === 0 ? COLORS.emeraldSoft : COLORS.line,
      radius: 9,
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setText(doc, index === 0 ? COLORS.emerald : COLORS.muted);
    doc.text(label, inner.x + 8 + index * 68, inner.y + 12);
  });

  drawRoundedPanel(doc, inner.x, inner.y + 30, inner.width, inner.height - 30, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 12, inner.y + 46, [84, 84], 18, COLORS.white, COLORS.line);
  fillRows(doc, inner.x + 12, inner.y + 76, [84, 84], 18, COLORS.white, COLORS.line);
  fillRows(doc, inner.x + 12, inner.y + 106, [inner.width - 24], 18, COLORS.white, COLORS.line);
  fillRows(doc, inner.x + 12, inner.y + 136, [inner.width - 24], 38, COLORS.white, COLORS.line);
}

function drawReportsFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Reportes", accent);
  drawRoundedPanel(doc, inner.x, inner.y, inner.width * 0.54, 84, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  drawRoundedPanel(doc, inner.x + inner.width * 0.58, inner.y, inner.width * 0.42, 84, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  const baseX = inner.x + 12;
  const baseY = inner.y + 70;
  setDraw(doc, COLORS.blue);
  doc.setLineWidth(1.1);
  doc.lines(
    [
      [22, -10],
      [22, 20],
      [22, -18],
      [22, 8],
      [22, 10],
    ],
    baseX,
    baseY,
  );
  setFill(doc, COLORS.emeraldSoft);
  doc.circle(inner.x + inner.width * 0.79, inner.y + 42, 26, "F");
  setFill(doc, COLORS.white);
  doc.circle(inner.x + inner.width * 0.79, inner.y + 42, 14, "F");

  drawRoundedPanel(doc, inner.x, inner.y + 94, inner.width, 92, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  for (let row = 0; row < 3; row += 1) {
    const rowY = inner.y + 108 + row * 24;
    setFill(doc, row === 0 ? COLORS.teal : COLORS.blue);
    doc.circle(inner.x + 14, rowY + 6, 4, "F");
    fillRows(doc, inner.x + 24, rowY, [110, 36], 10, COLORS.surface);
    drawRoundedPanel(doc, inner.x + inner.width - 72, rowY - 2, 62, 14, {
      fill: row === 0 ? COLORS.blueSoft : COLORS.surface,
      border: row === 0 ? COLORS.blueSoft : COLORS.line,
      radius: 7,
    });
  }
}

function drawConfigPanelFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Configuracion", accent);
  drawRoundedPanel(doc, inner.x, inner.y, 88, inner.height, {
    fill: COLORS.surface,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 10, inner.y + 18, [68, 62, 58, 72], 14, COLORS.white);

  const cardX = inner.x + 100;
  const cardWidth = (inner.width - 112) / 2;
  const cardHeight = 54;
  [
    { title: "Empresa", soft: COLORS.blueSoft },
    { title: "Servicios", soft: COLORS.violetSoft },
    { title: "POS", soft: COLORS.emeraldSoft },
    { title: "Impresoras", soft: COLORS.amberSoft },
  ].forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const bx = cardX + col * (cardWidth + 12);
    const by = inner.y + row * (cardHeight + 12);
    drawRoundedPanel(doc, bx, by, cardWidth, cardHeight, {
      fill: item.soft,
      border: item.soft,
      radius: 12,
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    setText(doc, COLORS.ink);
    doc.text(item.title, bx + 12, by + 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(doc, COLORS.muted);
    doc.text("Abrir configuracion", bx + 12, by + 35);
  });
}

function drawConfigOpsFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Config operativa", accent);
  const cellWidth = (inner.width - 10) / 2;
  const cellHeight = (inner.height - 12) / 2;
  const cells = [
    { title: "Empresa", soft: COLORS.blueSoft },
    { title: "Servicios", soft: COLORS.tealSoft },
    { title: "POS", soft: COLORS.violetSoft },
    { title: "Impresoras", soft: COLORS.amberSoft },
  ];

  cells.forEach((cell, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const bx = inner.x + col * (cellWidth + 10);
    const by = inner.y + row * (cellHeight + 12);
    drawRoundedPanel(doc, bx, by, cellWidth, cellHeight, {
      fill: COLORS.white,
      border: COLORS.line,
      radius: 12,
    });
    drawRoundedPanel(doc, bx + 10, by + 10, cellWidth - 20, 24, {
      fill: cell.soft,
      border: cell.soft,
      radius: 10,
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(doc, COLORS.ink);
    doc.text(cell.title, bx + 18, by + 26);
    fillRows(doc, bx + 12, by + 46, [cellWidth - 26, cellWidth - 38, cellWidth - 44], 10, COLORS.surface);
  });
}

function drawTeamOpsFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Equipo y control interno", accent);
  drawRoundedPanel(doc, inner.x, inner.y, inner.width * 0.48, inner.height, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + 12, inner.y + 18, [100, 78, 88], 14, COLORS.surface);
  ["Admin", "Tecnico", "Vendedor"].forEach((tag, index) => {
    drawRoundedPanel(doc, inner.x + 12, inner.y + 64 + index * 28, 72, 18, {
      fill: index === 0 ? COLORS.roseSoft : COLORS.surface,
      border: index === 0 ? COLORS.roseSoft : COLORS.line,
      radius: 9,
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    setText(doc, index === 0 ? COLORS.rose : COLORS.muted);
    doc.text(tag, inner.x + 24, inner.y + 76 + index * 28);
  });

  drawRoundedPanel(doc, inner.x + inner.width * 0.52, inner.y, inner.width * 0.48, inner.height, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 12,
  });
  fillRows(doc, inner.x + inner.width * 0.52 + 12, inner.y + 18, [84, 96, 92], 14, COLORS.surface);
  drawRoundedPanel(doc, inner.x + inner.width * 0.52 + 12, inner.y + 68, inner.width * 0.48 - 24, 36, {
    fill: COLORS.amberSoft,
    border: COLORS.amberSoft,
    radius: 12,
  });
}

function drawPublicStatusFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Consulta publica", accent);
  const phoneW = 118;
  const phoneH = inner.height;
  const phoneX = inner.x + (inner.width - phoneW) / 2;
  drawRoundedPanel(doc, phoneX, inner.y, phoneW, phoneH, {
    fill: COLORS.white,
    border: COLORS.slate,
    radius: 22,
    lineWidth: 1,
  });
  drawRoundedPanel(doc, phoneX + 34, inner.y + 6, 48, 6, {
    fill: COLORS.slate,
    border: COLORS.slate,
    radius: 3,
    lineWidth: 0.2,
  });
  drawRoundedPanel(doc, phoneX + 12, inner.y + 24, phoneW - 24, 18, {
    fill: COLORS.white,
    border: COLORS.line,
    radius: 8,
  });
  drawRoundedPanel(doc, phoneX + 12, inner.y + 50, phoneW - 24, 18, {
    fill: COLORS.blueSoft,
    border: COLORS.blueSoft,
    radius: 8,
  });
  for (let index = 0; index < 4; index += 1) {
    const stepY = inner.y + 90 + index * 28;
    setFill(doc, index < 2 ? COLORS.emerald : COLORS.line);
    doc.circle(phoneX + 24, stepY, 5, "F");
    if (index < 3) {
      setDraw(doc, COLORS.line);
      doc.setLineWidth(0.8);
      doc.line(phoneX + 24, stepY + 6, phoneX + 24, stepY + 22);
    }
    fillRows(doc, phoneX + 36, stepY - 6, [54], 10, COLORS.surface);
  }
}

function drawWorkflowFigure(doc, x, y, width, height, accent) {
  const inner = drawWindow(doc, x, y, width, height, "Rutina sugerida", accent);
  const points = [
    { color: COLORS.blue },
    { color: COLORS.violet },
    { color: COLORS.amber },
    { color: COLORS.emerald },
    { color: COLORS.rose },
  ];

  setDraw(doc, COLORS.line);
  doc.setLineWidth(2);
  doc.line(inner.x + 24, inner.y + 90, inner.x + inner.width - 24, inner.y + 90);
  points.forEach((point, index) => {
    const px = inner.x + 24 + index * ((inner.width - 48) / 4);
    setFill(doc, point.color);
    doc.circle(px, inner.y + 90, 7, "F");
    fillRows(doc, px - 28, inner.y + 108, [56], 12, COLORS.surface);
  });
}

const FIGURE_RENDERERS = {
  systemMap: drawSystemMapFigure,
  loginNav: drawLoginNavFigure,
  dashboard: drawDashboardFigure,
  serviceForm: drawServiceFormFigure,
  servicesList: drawServicesListFigure,
  serviceDetail: drawServiceDetailFigure,
  clients: drawClientsFigure,
  pos: drawPosFigure,
  inventory: drawInventoryFigure,
  reportes: drawReportsFigure,
  configPanel: drawConfigPanelFigure,
  configOps: drawConfigOpsFigure,
  teamOps: drawTeamOpsFigure,
  publicStatus: drawPublicStatusFigure,
  workflow: drawWorkflowFigure,
};

function drawCover(doc, logoDataUrl) {
  setFill(doc, COLORS.surface);
  doc.rect(0, 0, PAGE.width, PAGE.height, "F");

  setFill(doc, COLORS.tealSoft);
  doc.circle(PAGE.width - 80, 76, 80, "F");
  setFill(doc, COLORS.violetSoft);
  doc.circle(58, PAGE.height - 70, 96, "F");
  setFill(doc, COLORS.blueSoft);
  doc.circle(PAGE.width - 24, PAGE.height - 88, 54, "F");

  drawRoundedPanel(doc, PAGE.marginX, 46, PAGE.width - PAGE.marginX * 2, PAGE.height - 94, {
    fill: COLORS.white,
    border: COLORS.white,
    radius: 26,
    lineWidth: 0.2,
  });

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", PAGE.marginX + 24, 78, 74, 74);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  setText(doc, COLORS.ink);
  doc.text(MANUAL_TITLE, PAGE.marginX + 116, 106);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  setText(doc, COLORS.muted);
  doc.text(MANUAL_SUBTITLE, PAGE.marginX + 116, 130);

  drawTag(doc, PAGE.marginX + 116, 146, "Version operativa del sistema", {
    fill: COLORS.slateSoft,
    border: COLORS.slateSoft,
    color: COLORS.slate,
    height: 20,
    fontSize: 9,
  });
  drawTag(doc, PAGE.marginX + 304, 146, `Generado: ${GENERATED_LABEL}`, {
    fill: COLORS.blueSoft,
    border: COLORS.blueSoft,
    color: COLORS.blue,
    height: 20,
    fontSize: 9,
  });

  drawRoundedPanel(doc, PAGE.marginX + 24, 204, PAGE.width - PAGE.marginX * 2 - 48, 142, {
    fill: COLORS.surface,
    border: COLORS.line,
    radius: 20,
  });
  writeWrappedText(
    doc,
    "Este manual resume de forma practica el funcionamiento completo del sistema: acceso, recepcion de servicios, seguimiento, clientes, POS, inventario, reportes, cierre de caja, configuraciones e impresion.",
    PAGE.marginX + 44,
    238,
    PAGE.width - PAGE.marginX * 2 - 88,
    {
      fontSize: 13,
      color: COLORS.ink,
      lineHeight: 18,
    },
  );

  const quickBlocks = [
    {
      title: "Ideal para",
      text: "Capacitar personal nuevo, documentar procesos y estandarizar la operacion diaria.",
      accent: COLORS.emerald,
      soft: COLORS.emeraldSoft,
    },
    {
      title: "Incluye",
      text: "Explicacion por modulo, rutas, pasos sugeridos, ilustraciones y recomendaciones operativas.",
      accent: COLORS.violet,
      soft: COLORS.violetSoft,
    },
    {
      title: "Actualizable",
      text: "Se genera desde un script local para poder rehacerlo cuando el sistema cambie.",
      accent: COLORS.amber,
      soft: COLORS.amberSoft,
    },
  ];

  quickBlocks.forEach((block, index) => {
    const boxWidth = 154;
    const boxX = PAGE.marginX + 24 + index * (boxWidth + 12);
    drawRoundedPanel(doc, boxX, 376, boxWidth, 128, {
      fill: block.soft,
      border: block.soft,
      radius: 18,
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setText(doc, block.accent);
    doc.text(block.title, boxX + 14, 398);
    writeWrappedText(doc, block.text, boxX + 14, 420, boxWidth - 28, {
      fontSize: 9.6,
      color: COLORS.ink,
      lineHeight: 13,
    });
  });

  drawRoundedPanel(doc, PAGE.marginX + 24, 540, PAGE.width - PAGE.marginX * 2 - 48, 188, {
    fill: COLORS.ink,
    border: COLORS.ink,
    radius: 24,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  setText(doc, COLORS.white);
  doc.text("Que encontraras en este PDF", PAGE.marginX + 44, 572);

  drawBulletList(
    doc,
    PAGE.marginX + 44,
    596,
    PAGE.width - PAGE.marginX * 2 - 88,
    [
      "Mapa general del sistema y navegacion principal.",
      "Flujo completo desde la recepcion del servicio hasta el cierre de caja.",
      "Explicacion del POS, inventario, clientes, reportes y configuraciones.",
      "Recomendaciones para impresion silenciosa, QR publico y permisos del equipo.",
    ],
    {
      fontSize: 10.2,
      color: COLORS.white,
      bulletColor: COLORS.tealSoft,
    },
  );
}

function drawTocPageShell(doc, logoDataUrl) {
  doc.addPage("a4", "portrait");
  setFill(doc, COLORS.surface);
  doc.rect(0, 0, PAGE.width, PAGE.height, "F");

  drawRoundedPanel(doc, PAGE.marginX, 28, PAGE.width - PAGE.marginX * 2, PAGE.height - 56, {
    fill: COLORS.white,
    border: COLORS.white,
    radius: 24,
  });

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", PAGE.marginX + 18, 42, 36, 36);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  setText(doc, COLORS.ink);
  doc.text("Indice y forma de uso", PAGE.marginX + 64, 66);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  setText(doc, COLORS.muted);
  doc.text("Usa esta pagina como mapa rapido del manual.", PAGE.marginX + 64, 84);

  const howToItems = [
    "Cada pagina corresponde a un modulo o grupo de pantallas del sistema.",
    "La franja superior indica la ruta o ubicacion mas comun del apartado.",
    "Las cajas laterales resumen acciones, flujo recomendado y puntos clave.",
    "La ilustracion es una vista de referencia para ubicar mejor la interfaz.",
  ];
  const trainingItems = [
    "Primero recorre Acceso, Inicio, Hoja de servicio y Servicios.",
    "Despues practica Clientes, POS e Inventario con ejemplos reales.",
    "Al final revisa Reportes, Configuracion e impresion silenciosa.",
    "Deja la consulta publica y QR como cierre para atencion al cliente.",
  ];
  const topBoxesHeight = Math.max(
    getInfoBoxHeight(doc, 240, howToItems),
    getInfoBoxHeight(doc, 270, trainingItems),
  );

  drawInfoBox(
    doc,
    PAGE.marginX + 18,
    110,
    240,
    topBoxesHeight,
    "Como leer este manual",
    howToItems,
    COLORS.blue,
  );

  drawInfoBox(
    doc,
    PAGE.marginX + 274,
    110,
    270,
    topBoxesHeight,
    "Recomendacion de capacitacion",
    trainingItems,
    COLORS.emerald,
  );
}

function fillTocPage(doc, tocEntries) {
  doc.setPage(2);

  const howToItems = [
    "Cada pagina corresponde a un modulo o grupo de pantallas del sistema.",
    "La franja superior indica la ruta o ubicacion mas comun del apartado.",
    "Las cajas laterales resumen acciones, flujo recomendado y puntos clave.",
    "La ilustracion es una vista de referencia para ubicar mejor la interfaz.",
  ];
  const trainingItems = [
    "Primero recorre Acceso, Inicio, Hoja de servicio y Servicios.",
    "Despues practica Clientes, POS e Inventario con ejemplos reales.",
    "Al final revisa Reportes, Configuracion e impresion silenciosa.",
    "Deja la consulta publica y QR como cierre para atencion al cliente.",
  ];
  const startY = 110
    + Math.max(
      getInfoBoxHeight(doc, 240, howToItems),
      getInfoBoxHeight(doc, 270, trainingItems),
    )
    + 20;
  const boxHeight = PAGE.height - startY - 70;

  drawRoundedPanel(doc, PAGE.marginX + 18, startY, PAGE.width - PAGE.marginX * 2 - 36, boxHeight, {
    fill: COLORS.surface,
    border: COLORS.line,
    radius: 20,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setText(doc, COLORS.ink);
  doc.text("Contenido", PAGE.marginX + 36, startY + 28);

  let cursorY = startY + 56;
  tocEntries.forEach((entry, index) => {
    const itemLabel = `${index + 1}. ${entry.title}`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    setText(doc, COLORS.ink);
    doc.text(itemLabel, PAGE.marginX + 36, cursorY);

    setDraw(doc, COLORS.line);
    doc.setLineWidth(0.4);
    doc.line(PAGE.marginX + 210, cursorY - 3, PAGE.width - PAGE.marginX - 46, cursorY - 3);

    doc.setFont("helvetica", "bold");
    setText(doc, COLORS.blue);
    doc.text(String(entry.page), PAGE.width - PAGE.marginX - 28, cursorY, { align: "right" });
    cursorY += 28;
  });
}

function createSectionCanvas(doc) {
  doc.addPage("a4", "portrait");
  setFill(doc, COLORS.surface);
  doc.rect(0, 0, PAGE.width, PAGE.height, "F");

  drawRoundedPanel(doc, PAGE.marginX, 22, PAGE.width - PAGE.marginX * 2, PAGE.height - 44, {
    fill: COLORS.white,
    border: COLORS.white,
    radius: 24,
  });
}

function drawSectionHeader(doc, section) {
  const bandX = PAGE.marginX + 18;
  const bandY = 40;
  const bandW = PAGE.width - PAGE.marginX * 2 - 36;
  const summaryWidth = bandW - 36;
  const summaryHeight = measureWrappedTextHeight(doc, section.summary, summaryWidth, {
    fontSize: 10.3,
    lineHeight: 13.8,
  });
  const tagsHeight = getTagFlowHeight(doc, bandX + 18, bandX + bandW - 18, section.tags, {
    fill: COLORS.white,
    border: COLORS.white,
    color: section.accent,
    height: 18,
    fontSize: 8.4,
  });
  const bandH = Math.max(104, 58 + summaryHeight + 10 + tagsHeight + 16);

  drawRoundedPanel(doc, bandX, bandY, bandW, bandH, {
    fill: section.accent,
    border: section.accent,
    radius: 20,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  setText(doc, COLORS.white);
  doc.text(section.title, bandX + 18, bandY + 28);

  const summaryY = bandY + 50;
  writeWrappedText(doc, section.summary, bandX + 18, summaryY, summaryWidth, {
    fontSize: 10.3,
    color: COLORS.white,
    lineHeight: 13.8,
  });

  drawTagFlow(doc, bandX + 18, summaryY + summaryHeight + 8, bandX + bandW - 18, section.tags, {
    fill: COLORS.white,
    border: COLORS.white,
    color: section.accent,
    height: 18,
    fontSize: 8.4,
  });

  return bandY + bandH;
}

function drawRouteBox(doc, section, startY) {
  const boxX = PAGE.marginX + 18;
  const boxW = PAGE.width - PAGE.marginX * 2 - 36;
  const routeTextHeight = measureWrappedTextHeight(doc, section.routeLabel, boxW - 32, {
    fontSize: 9.2,
    lineHeight: 12.5,
  });
  const boxH = 18 + routeTextHeight + 14;

  drawRoundedPanel(doc, boxX, startY, boxW, boxH, {
    fill: COLORS.surface,
    border: COLORS.line,
    radius: 12,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, COLORS.muted);
  doc.text("Ruta o ubicacion recomendada", boxX + 16, startY + 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.2);
  setText(doc, COLORS.ink);
  writeWrappedText(doc, section.routeLabel, boxX + 16, startY + 29, boxW - 32, {
    fontSize: 9.2,
    color: COLORS.ink,
    lineHeight: 12.5,
  });

  return boxH;
}

function drawSectionContinuationHeader(doc, section) {
  const bandX = PAGE.marginX + 18;
  const bandY = 40;
  const bandW = PAGE.width - PAGE.marginX * 2 - 36;
  const bandH = 54;

  drawRoundedPanel(doc, bandX, bandY, bandW, bandH, {
    fill: section.accent,
    border: section.accent,
    radius: 18,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  setText(doc, COLORS.white);
  doc.text(section.title, bandX + 18, bandY + 23);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.text("Continuacion del manual", bandX + 18, bandY + 40);

  return bandY + bandH;
}

function drawSectionPage(doc, section) {
  const contentX = PAGE.marginX + 18;
  const contentW = PAGE.width - PAGE.marginX * 2 - 36;
  const bottomY = PAGE.height - 44;
  const boxGap = 14;
  const figureHeight = 242;

  createSectionCanvas(doc);
  let cursorY = drawSectionHeader(doc, section);
  cursorY += 16;
  cursorY += drawRouteBox(doc, section, cursorY);
  cursorY += 16;

  const startNewPage = () => {
    createSectionCanvas(doc);
    cursorY = drawSectionContinuationHeader(doc, section) + 16;
  };

  const ensureSpace = (heightNeeded) => {
    if (cursorY + heightNeeded > bottomY) {
      startNewPage();
    }
  };

  ensureSpace(figureHeight);
  const figureRenderer = FIGURE_RENDERERS[section.figure];
  if (figureRenderer) {
    figureRenderer(doc, contentX, cursorY, contentW, figureHeight, section.accent);
  }
  cursorY += figureHeight + boxGap;

  const blocks = [
    {
      title: "Acciones principales",
      items: section.actions,
      paragraph: "Tareas mas comunes que el usuario realiza dentro de este apartado.",
      numbered: false,
    },
    {
      title: "Flujo recomendado",
      items: section.workflow,
      paragraph: "Secuencia sugerida para operar este modulo sin saltarse pasos importantes.",
      numbered: true,
    },
    {
      title: "Puntos clave",
      items: section.notes,
      paragraph: "Buenas practicas y detalles que conviene recordar al momento de usar esta pantalla.",
      numbered: false,
    },
  ];

  blocks.forEach((block) => {
    const boxHeight = getInfoBoxHeight(doc, contentW, block.items, {
      paragraph: block.paragraph,
      numbered: block.numbered,
    });
    ensureSpace(boxHeight);
    drawInfoBox(doc, contentX, cursorY, contentW, boxHeight, block.title, block.items, section.accent, {
      paragraph: block.paragraph,
      numbered: block.numbered,
    });
    cursorY += boxHeight + boxGap;
  });
}

function addFooters(doc) {
  const totalPages = doc.getNumberOfPages();
  for (let page = 2; page <= totalPages; page += 1) {
    doc.setPage(page);
    setDraw(doc, COLORS.line);
    doc.setLineWidth(0.5);
    doc.line(PAGE.marginX + 10, PAGE.height - 22, PAGE.width - PAGE.marginX - 10, PAGE.height - 22);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(doc, COLORS.muted);
    doc.text("Manual del sistema LuisITRepair", PAGE.marginX + 10, PAGE.height - 9);
    doc.text(`Pagina ${page} de ${totalPages}`, PAGE.width - PAGE.marginX - 10, PAGE.height - 9, {
      align: "right",
    });
  }
}

async function readImageDataUrl(filePath) {
  try {
    const file = await fs.readFile(filePath);
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

async function main() {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const logoDataUrl = await readImageDataUrl(LOGO_PATH);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  doc.setProperties({
    title: MANUAL_TITLE,
    subject: "Manual completo del sistema LuisITRepair",
    author: "Codex",
    creator: "Codex + jsPDF",
    keywords: "manual,pdf,sistema,servicios,pos,reportes,configuracion",
  });

  drawCover(doc, logoDataUrl);
  drawTocPageShell(doc, logoDataUrl);

  const tocEntries = [];
  manualSections.forEach((section) => {
    tocEntries.push({
      title: section.title,
      page: doc.getNumberOfPages() + 1,
    });
    drawSectionPage(doc, section);
  });

  fillTocPage(doc, tocEntries);
  addFooters(doc);

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  await fs.writeFile(OUTPUT_PATH, pdfBuffer);

  console.log(`Manual PDF generado en: ${OUTPUT_PATH}`);
  console.log(`Paginas: ${doc.getNumberOfPages()}`);
}

main().catch((error) => {
  console.error("No se pudo generar el manual del sistema:", error);
  process.exitCode = 1;
});
