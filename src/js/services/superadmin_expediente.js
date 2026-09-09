// Construccion del expediente administrativo de un negocio (libro de Excel).
//
// Vive separado de superadmin_export.js para que no dependa del navegador
// (file-saver) y pueda probarse en Node. Por eso los imports relativos llevan
// extension explicita: Vite y Node lo resuelven igual.
//
// Contenido permitido: cuenta, plan, actividad, configuracion, historial
// administrativo y el catalogo de productos dado de alta.
// Contenido prohibido: ventas, ingresos, clientes, fiados, cortes o cualquier
// dato que revele cuanto vende o a quien le vende el negocio.

import { formatDateShort } from "./suscripciones.js";
import { etiquetaUltimoAcceso } from "./actividad_negocio.js";
import {
  INVENTARIO_EXCEL_COLUMNS,
  INVENTARIO_EXCEL_NUMERIC_KEYS,
} from "./inventario_excel.js";

const ANCHAS = new Set(["nombre", "descripcion", "compatibilidad", "notasInternas"]);

function estiloEncabezado(hoja, columnas) {
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172554" } };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  if (columnas) hoja.autoFilter = { from: "A1", to: { row: 1, column: columnas } };
}

/** Convierte un producto a la fila del inventario, respetando tipos numericos. */
export function filaProducto(producto = {}) {
  return Object.fromEntries(INVENTARIO_EXCEL_COLUMNS.map((columna) => {
    const valor = producto[columna.key];
    if (INVENTARIO_EXCEL_NUMERIC_KEYS.has(columna.key)) {
      const numero = Number(valor);
      return [columna.key, Number.isFinite(numero) ? numero : 0];
    }
    return [columna.key, valor == null ? "" : String(valor)];
  }));
}

/**
 * Arma el libro completo. Recibe ExcelJS por parametro para que el navegador
 * pueda cargarlo con import() diferido y la prueba lo inyecte directamente.
 */
export function construirExpedienteNegocio(ExcelJS, {
  negocio,
  usuarios = [],
  historial = [],
  productos = [],
  productosTruncados = false,
} = {}) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "CajaLibre";
  const plan = negocio?.plan || {};

  const agregarHoja = (titulo, encabezados, filas) => {
    const hoja = libro.addWorksheet(titulo);
    hoja.columns = encabezados.map((header) => ({
      header,
      width: header.length < 14 ? 24 : 36,
    }));
    filas.forEach((fila) => hoja.addRow(fila));
    estiloEncabezado(hoja, encabezados.length);
    return hoja;
  };

  agregarHoja("Resumen", ["Campo", "Valor"], [
    ["Negocio", negocio?.nombre || ""],
    ["Negocio ID", negocio?.negocioId || ""],
    ["Correo del propietario", negocio?.correo || "Sin registro"],
    ["Estado", negocio?.estado || ""],
    ["Registro", formatDateShort(negocio?.createdAt)],
    ["Tipo de negocio", negocio?.tipoNegocioId || "Sin definir"],
    ["Productos en catalogo", productos.length],
  ]);

  agregarHoja("Usuarios", ["Nombre", "Correo", "Rol", "Estado", "Ultimo acceso"],
    usuarios.map((item) => [
      item.nombre || "Sin nombre",
      item.correo || "",
      item.rol || "",
      item.estado || "",
      etiquetaUltimoAcceso(item.lastActive?.toMillis?.() || 0),
    ]));

  agregarHoja("Plan", ["Campo", "Valor"], [
    ["Plan", plan.etiqueta || "Gratis"],
    ["Premium vigente hasta", plan.premiumUntil ? formatDateShort(plan.premiumUntil) : "No aplica"],
    ["Ultimo pago", plan.ultimoPago ? formatDateShort(plan.ultimoPago) : "Sin registro"],
    ["Proximo pago", plan.proximoPago ? formatDateShort(plan.proximoPago) : "Sin programar"],
    ["Renovacion automatica", plan.renovacionAutomatica ? "Si" : "No"],
    ["Usuarios permitidos", plan.esPremium ? "Ilimitados" : "3"],
  ]);

  agregarHoja("Actividad", ["Campo", "Valor"], [
    ["Nivel de uso", negocio?.actividad?.label || "Sin datos"],
    ["Dias sin actividad", negocio?.actividad?.dias ?? "Sin datos"],
    ["Ultimo acceso", etiquetaUltimoAcceso(negocio?.ultimoAccesoMs || negocio?.ultimaActividadMs)],
    ["Usuarios totales", negocio?.conteos?.usuariosTotal || 0],
    ["Usuarios activos", negocio?.conteos?.usuariosActivos || 0],
    ["Equipos registrados", negocio?.conteos?.equiposTotal || 0],
  ]);

  agregarHoja("Configuracion", ["Campo", "Valor"], [
    ["Configuracion inicial", negocio?.setupCompleto ? "Completa" : "Incompleta"],
    ["Terminos aceptados", negocio?.terminosAceptados ? "Si" : "No"],
    ["Version de terminos", negocio?.terminosVersion || "Sin aceptar"],
    ["Telefono", negocio?.telefono || "Sin registro"],
  ]);

  // Inventario: mismas columnas que la exportacion que ya usa el negocio, para
  // que el archivo sea reconocible y reimportable.
  const hojaProductos = libro.addWorksheet("Productos");
  hojaProductos.columns = INVENTARIO_EXCEL_COLUMNS.map((columna) => ({
    header: columna.label,
    key: columna.key,
    width: ANCHAS.has(columna.key) ? 34 : 18,
  }));
  productos.forEach((producto) => hojaProductos.addRow(filaProducto(producto)));
  estiloEncabezado(hojaProductos, INVENTARIO_EXCEL_COLUMNS.length);
  if (productosTruncados) {
    hojaProductos.addRow({
      nombre: `Catalogo recortado a los primeros ${productos.length} productos.`,
    });
  }

  agregarHoja("Historial administrativo", ["Fecha", "Accion", "Detalle", "Actor"],
    historial.map((item) => [
      formatDateShort(item.createdAt),
      item.tipo || "",
      item.detalle || item.razon || "",
      item.actorEmail || item.actorUid || "",
    ]));

  return libro;
}
