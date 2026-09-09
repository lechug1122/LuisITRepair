// Exportacion administrativa del panel de superadmin.
//
// Los archivos se generan en el navegador y se descargan al momento: NUNCA se
// guardan en Firestore ni se registra la descarga en ninguna coleccion.
//
// PROHIBIDO exportar informacion comercial (ventas, ingresos, clientes,
// fiados, tickets). Solo datos de cuenta, plan, configuracion y uso.
//
// EXCEPCION solicitada: el expediente individual incluye el catalogo de
// productos dado de alta (inventario), porque el superadmin lo necesita para
// soporte y respaldos. Sigue sin incluirse el historial de ventas, que
// productos se vendieron ni a quien.

import { saveAs } from "file-saver";
import { formatDateShort } from "./suscripciones";
import { etiquetaUltimoAcceso } from "./actividad_negocio";
import { construirExpedienteNegocio } from "./superadmin_expediente.js";

const nombreArchivo = (base) => String(base || "CajaLibre")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

const hoy = () => new Date().toISOString().slice(0, 10);

const COLUMNAS = [
  { key: "nombre", label: "Negocio" },
  { key: "negocioId", label: "Negocio ID" },
  { key: "propietario", label: "Propietario" },
  { key: "correo", label: "Correo" },
  { key: "plan", label: "Plan" },
  { key: "estado", label: "Estado" },
  { key: "usuarios", label: "Usuarios" },
  { key: "registro", label: "Registro" },
  { key: "actividad", label: "Actividad" },
  { key: "ultimoAcceso", label: "Ultimo acceso" },
  { key: "configuracion", label: "Configuracion" },
  { key: "terminos", label: "Terminos" },
  { key: "tipoNegocio", label: "Tipo de negocio" },
];

/** Aplana un negocio a las columnas administrativas permitidas. */
export function filaNegocio(negocio) {
  return {
    nombre: negocio.nombre || "Sin nombre",
    negocioId: negocio.negocioId || "",
    propietario: negocio.titularNombre || negocio.administradorNombre || "",
    correo: negocio.correo || "",
    plan: negocio.plan?.etiqueta || "Gratis",
    estado: negocio.estado || "",
    usuarios: negocio.conteos?.usuariosTotal || 0,
    registro: formatDateShort(negocio.createdAt),
    actividad: negocio.actividad?.label || "Sin datos",
    ultimoAcceso: etiquetaUltimoAcceso(negocio.ultimoAccesoMs || negocio.ultimaActividadMs),
    configuracion: negocio.setupCompleto ? "Completa" : "Incompleta",
    terminos: negocio.terminosAceptados
      ? `Aceptados (${negocio.terminosVersion || "sin version"})`
      : "Pendientes",
    tipoNegocio: negocio.tipoNegocioId || "Sin definir",
  };
}

export function exportarNegociosCSV(negocios = []) {
  const filas = negocios.map(filaNegocio);
  const escapar = (valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
  const contenido = [
    COLUMNAS.map((col) => escapar(col.label)).join(","),
    ...filas.map((fila) => COLUMNAS.map((col) => escapar(fila[col.key])).join(",")),
  ].join("\r\n");

  // BOM para que Excel abra el CSV respetando los acentos.
  saveAs(
    new Blob([`\uFEFF${contenido}`], { type: "text/csv;charset=utf-8;" }),
    `CajaLibre_Negocios_${hoy()}.csv`,
  );
}

function estiloEncabezado(hoja, columnas) {
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172554" } };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  if (columnas) hoja.autoFilter = { from: "A1", to: { row: 1, column: columnas } };
}

export async function exportarNegociosExcel(negocios = []) {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  libro.creator = "CajaLibre";
  const hoja = libro.addWorksheet("Negocios");

  hoja.columns = COLUMNAS.map((col) => ({
    header: col.label,
    key: col.key,
    width: col.key === "nombre" ? 30 : col.key === "correo" ? 28 : 16,
  }));
  negocios.map(filaNegocio).forEach((fila) => hoja.addRow(fila));
  estiloEncabezado(hoja, COLUMNAS.length);

  const buffer = await libro.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `CajaLibre_Negocios_${hoy()}.xlsx`);
}

export async function exportarNegociosPDF(negocios = []) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const filas = negocios.map(filaNegocio);

  doc.setFillColor(23, 37, 84);
  doc.rect(0, 0, 297, 20, "F");
  doc.setTextColor(255);
  doc.setFontSize(13);
  doc.text("CajaLibre - Negocios registrados", 12, 12);
  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleString("es-MX")}`, 232, 12);

  const columnas = COLUMNAS.filter((col) => !["negocioId", "tipoNegocio"].includes(col.key));
  const anchos = [48, 44, 18, 20, 18, 26, 28, 26];
  let y = 28;

  doc.setTextColor(30);
  doc.setFontSize(7.5);

  const escribirFila = (valores, negrita) => {
    doc.setFont(undefined, negrita ? "bold" : "normal");
    let x = 12;
    valores.forEach((valor, index) => {
      doc.text(String(valor ?? "").slice(0, 30), x, y);
      x += anchos[index] || 20;
    });
    y += 6;
  };

  escribirFila(columnas.map((col) => col.label), true);
  doc.setDrawColor(200);
  doc.line(12, y - 4, 285, y - 4);

  filas.forEach((fila) => {
    if (y > 195) {
      doc.addPage();
      y = 20;
    }
    escribirFila(columnas.map((col) => fila[col.key]));
  });

  doc.save(`CajaLibre_Negocios_${hoy()}.pdf`);
}

/**
 * Expediente administrativo de un solo negocio, una pestaña por bloque.
 *
 * El libro se arma en superadmin_expediente.js; aqui solo se carga ExcelJS
 * bajo demanda y se entrega el archivo al navegador.
 */
export async function exportarExpedienteNegocio(datos) {
  const ExcelJS = (await import("exceljs")).default;
  const libro = construirExpedienteNegocio(ExcelJS, datos);
  const buffer = await libro.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer]),
    `CajaLibre_${nombreArchivo(datos?.negocio?.nombre)}_${new Date().getFullYear()}.xlsx`,
  );
}
