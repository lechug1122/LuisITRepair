// ---------------------------------------------------------------------------
// Piezas compartidas por los generadores de reportes.
//
// Todo lo que se repetiria en cada reporte vive aqui: el encabezado, las
// tarjetas comparadas contra el periodo anterior, los avisos legales y las
// columnas que aparecen en mas de una tabla. Un reporte nuevo deberia poder
// escribirse casi solo eligiendo datos y llamando a estas piezas.
// ---------------------------------------------------------------------------

import logoSistema from "../../../assets/logo.png";
import { crearReporte, etiquetaPeriodo, generarNombreArchivo, variacion } from "./excel_kit.js";

export const AVISO_ESTIMACION = "Los cálculos mostrados son estimaciones administrativas basadas "
  + "en la información registrada en CajaLibre y no sustituyen asesoría contable.";

export const AVISO_FACTURA_GLOBAL = "Este archivo es un reporte administrativo para preparación y "
  + "conciliación de información. No sustituye un CFDI timbrado.";

export const AVISO_COSTO_PARCIAL = "Algunos productos vendidos no tienen costo de compra "
  + "registrado. La utilidad y el margen se calculan solo sobre los productos que sí lo tienen, "
  + "así que el resultado real puede ser menor.";

/**
 * Arranca un reporte con el encabezado de identidad ya resuelto.
 *
 * El logo del negocio es una funcion Premium; un negocio gratuito lleva el
 * logo de CajaLibre. Asi el archivo sigue viendose terminado en los dos
 * planes, y la diferencia es de marca, no de calidad.
 */
export async function iniciarReporte(contexto, titulo) {
  const logoNegocio = String(contexto?.logo || "").trim();
  return crearReporte({
    titulo,
    negocio: contexto?.negocioNombre || "CajaLibre",
    periodo: contexto?.periodoLabel || "",
    usuario: contexto?.usuario || "",
    rfc: contexto?.rfc || "",
    sucursal: contexto?.sucursal || "",
    logo: contexto?.esPremium && logoNegocio ? logoNegocio : logoSistema,
    plan: contexto?.esPremium ? "Premium" : "Free",
  });
}

/**
 * Nombre de archivo con el patron comun a todos los reportes:
 * CajaLibre_<Reporte>_<Periodo>.xlsx
 *
 * `extra` se reserva para los reportes de un sujeto concreto (por ejemplo el
 * estado de cuenta de un cliente), que si necesitan decir de quien son.
 */
export function nombreArchivo(contexto, slug, extra = "") {
  return generarNombreArchivo({
    slug,
    extra,
    desde: contexto?.desde || null,
    hasta: contexto?.hasta || null,
  });
}

export { etiquetaPeriodo };

/**
 * Tarjeta de indicador con su variacion contra el periodo anterior.
 *
 * La variacion solo se muestra cuando hay periodo anterior Y una base distinta
 * de cero: un crecimiento calculado sobre cero no significa nada, y mostrar
 * "▲ 100%" porque antes no habia ventas seria enganoso.
 */
export function tarjeta(etiqueta, valor, formato = "moneda", anterior = null, detalle = "") {
  const cambio = anterior === null || anterior === undefined ? null : variacion(valor, anterior);
  return {
    etiqueta,
    valor,
    formato,
    variacion: Number.isFinite(cambio) ? cambio : undefined,
    detalle,
  };
}

/** Columnas del detalle de venta que comparten los reportes de ventas. */
export const COLUMNAS_VENTA_BASICA = [
  { header: "Folio", key: "folio", ancho: 16 },
  { header: "Fecha", key: "fecha", formato: "fecha" },
  { header: "Hora", key: "hora", formato: "hora" },
  { header: "Total", key: "total", formato: "moneda", total: true },
  { header: "Método de pago", key: "metodo", ancho: 18 },
  { header: "Estado", key: "estado", ancho: 18 },
];

/** Fila de venta en su forma basica, usada por Free y por Premium. */
export function filaVentaBasica(venta, { fecha, metodo, estado }) {
  return {
    folio: String(venta?.folioTicket || venta?.id || "").trim() || "Sin folio",
    fecha,
    hora: fecha,
    total: venta?.total,
    metodo,
    estado,
  };
}

/**
 * Recorta una lista para una grafica.
 *
 * Una grafica con 300 barras no se lee. Se conservan los primeros elementos
 * (ya vienen ordenados por importancia) y el resto se agrupa, para que el
 * total siga cuadrando con la tabla.
 */
export function recortarParaGrafica(lista = [], limite = 10, etiquetaResto = "Otros") {
  if (lista.length <= limite) return lista;
  const principales = lista.slice(0, limite);
  const resto = lista.slice(limite).reduce((suma, item) => suma + Number(item.value || 0), 0);
  if (resto > 0) principales.push({ label: etiquetaResto, value: Number(resto.toFixed(2)) });
  return principales;
}

/**
 * Ultimos puntos de una serie temporal.
 *
 * Un año de ventas diarias son 365 categorias ilegibles; se muestran los
 * ultimos y se aclara en el titulo cuando se recorto.
 */
export function serieTemporal(puntos = [], maximo = 31) {
  if (puntos.length <= maximo) return { datos: puntos, recortada: false };
  return { datos: puntos.slice(-maximo), recortada: true };
}

/** Horas y minutos de una fecha, en texto, para tablas de comandas. */
export function horaTexto(fecha) {
  if (!fecha) return "N/A";
  return fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
