// ---------------------------------------------------------------------------
// Punto de entrada del centro de exportaciones.
//
// La pantalla llama UNICAMENTE a `generarReporte`. Esa funcion es la que:
//
//   1. Comprueba el plan (antes de leer un solo dato).
//   2. Comprueba que el reporte exista y se pueda generar con datos reales.
//   3. Resuelve el periodo y el periodo anterior para las comparativas.
//   4. Lee de Firestore solo las colecciones que el reporte necesita.
//   5. Construye el archivo y lo descarga.
//
// El orden importa: si la comprobacion de plan estuviera despues de la lectura,
// un negocio gratuito ya habria descargado a su navegador la informacion de un
// reporte Premium aunque el archivo nunca se generara.
// ---------------------------------------------------------------------------

import { canUseReport } from "../plan_features.js";
import { readFacturacionConfigStorage } from "../facturacion_config.js";
import {
  obtenerReporte,
  periodoAnterior,
  reporteDisponible,
  resolverPeriodo,
} from "./catalogo_reportes.js";
import { construirFuenteDatos } from "./datos_reportes.js";
import { esErrorSinDatos, etiquetaPeriodo } from "./excel_kit.js";
import * as ventasReportes from "./generadores_ventas.js";
import * as catalogoReportes from "./generadores_catalogo.js";
import { paqueteAdministrativo } from "./paquete_administrativo.js";

// Cada reporte del catalogo apunta aqui a su generador. Un reporte declarado
// en el catalogo pero sin generador se rechaza con un error claro en lugar de
// fallar de forma silenciosa al pulsar el boton.
const GENERADORES = {
  resumen_ventas: ventasReportes.resumenVentas,
  ejecutivo_basico: ventasReportes.ejecutivoBasico,
  ejecutivo_completo: ventasReportes.ejecutivoCompleto,
  historial_ventas: ventasReportes.historialVentas,
  historial_ventas_completo: ventasReportes.historialVentasCompleto,
  metodos_pago_basico: ventasReportes.metodosPagoBasico,
  metodos_pago_avanzado: ventasReportes.metodosPagoAvanzado,
  descuentos: ventasReportes.auditoriaDescuentos,
  factura_global: ventasReportes.reporteFacturaGlobal,
  rentabilidad: ventasReportes.rentabilidad,

  catalogo_productos: catalogoReportes.catalogoProductos,
  analisis_productos: catalogoReportes.analisisProductos,
  inventario_actual: catalogoReportes.inventarioActual,
  stock_bajo: catalogoReportes.stockBajo,
  inventario_completo: catalogoReportes.inventarioCompleto,

  corte_caja_basico: catalogoReportes.corteCajaBasico,
  corte_caja_completo: catalogoReportes.corteCajaCompleto,
  historial_cortes: catalogoReportes.historialCortes,

  egresos_basico: catalogoReportes.egresosBasico,
  egresos_avanzado: catalogoReportes.egresosAvanzado,

  directorio_clientes: catalogoReportes.directorioClientes,
  analisis_clientes: catalogoReportes.analisisClientes,

  saldos_pendientes: catalogoReportes.saldosPendientes,
  cuentas_por_cobrar: catalogoReportes.cuentasPorCobrar,
  estado_cuenta_cliente: catalogoReportes.estadoCuentaCliente,

  empleados_basico: catalogoReportes.empleadosBasico,
  rendimiento_empleados: catalogoReportes.rendimientoEmpleados,

  restaurante_resumen: catalogoReportes.restauranteResumen,
  restaurante_meseros: catalogoReportes.restauranteMeseros,
  restaurante_platillos: catalogoReportes.restaurantePlatillos,
  restaurante_mesas: catalogoReportes.restauranteMesas,
  restaurante_comandas: catalogoReportes.restauranteComandas,

  paquete_administrativo: paqueteAdministrativo,
};

function errorConCodigo(mensaje, code) {
  const error = new Error(mensaje);
  error.code = code;
  return error;
}

/**
 * Datos fiscales del negocio.
 *
 * Hoy CajaLibre guarda la configuracion de facturacion en el propio equipo, no
 * en Firestore, asi que el RFC solo esta disponible en el dispositivo donde se
 * configuro. Lo que falte se reporta como no registrado en lugar de inventarse.
 */
function leerDatosFiscales() {
  try {
    const config = readFacturacionConfigStorage();
    return {
      razonSocial: String(config?.razonSocial || "").trim(),
      rfc: String(config?.rfcEmisor || "").trim(),
      regimenFiscal: String(config?.regimenFiscal || "").trim(),
      codigoPostal: String(config?.codigoPostalEmisor || "").trim(),
      rfcPublicoGeneral: String(config?.rfcReceptorPublicoGeneral || "").trim(),
      formaPago: String(config?.formaPago || "").trim(),
      serie: String(config?.serie || "").trim(),
    };
  } catch {
    return {};
  }
}

/**
 * Genera y descarga un reporte.
 *
 * `opciones` trae lo que la pantalla ya sabe de la sesion (plan, negocio,
 * usuario) y lo que la persona eligio (reporte, periodo, cliente). Devuelve el
 * nombre del archivo descargado.
 */
export async function generarReporte({
  reporteId,
  // Estado del plan tal como lo resuelve useAutorizacionActual.
  premiumState,
  // Periodo elegido en la pantalla.
  periodoId = "este_mes",
  desde = null,
  hasta = null,
  // Identidad del negocio y de quien genera.
  negocioId = "",
  negocioNombre = "",
  usuario = "",
  logo = "",
  esRestaurante = false,
  // Ventas que la pantalla ya tiene cargadas, para no volver a leerlas.
  ventasPrecargadas = null,
  // Solo para el estado de cuenta.
  clienteId = "",
  // Limite de cortes del plan gratuito, tal como lo define plan_features.
  limiteCortesFree = 0,
} = {}) {
  const reporte = obtenerReporte(reporteId);
  if (!reporte) {
    throw errorConCodigo("Ese reporte no existe.", "reportes/desconocido");
  }

  // --- 1. Plan. Antes de cualquier lectura. ---
  if (!canUseReport(reporteId, { premiumState })) {
    throw errorConCodigo(
      "Este reporte está disponible con CajaLibre Premium.",
      "reportes/requiere-premium",
    );
  }

  // --- 2. Disponibilidad real. ---
  if (!reporteDisponible(reporte)) {
    throw errorConCodigo(
      reporte.motivoNoDisponible || "Este reporte todavía no puede generarse.",
      "reportes/no-disponible",
    );
  }

  const generador = GENERADORES[reporteId];
  if (typeof generador !== "function") {
    throw errorConCodigo("Ese reporte todavía no tiene generador.", "reportes/sin-generador");
  }

  if (reporte.seleccionCliente && !String(clienteId || "").trim()) {
    throw errorConCodigo(
      "Selecciona un cliente para generar su estado de cuenta.",
      "reportes/falta-cliente",
    );
  }

  // --- 3. Periodo. ---
  // Un reporte sin periodo (un catalogo, un inventario) retrata el momento
  // actual: filtrarlo por fechas daria un archivo incompleto sin decirlo.
  const periodo = reporte.periodo
    ? resolverPeriodo(periodoId, { desde, hasta })
    : { desde: null, hasta: null, nombre: "Situación actual" };

  const comparativo = reporte.periodo ? periodoAnterior(periodo) : null;

  // --- 4. Datos: solo las colecciones que este reporte declara. ---
  const datos = await construirFuenteDatos({
    requiere: reporte.requiere || [],
    opcionales: reporte.opcionales || [],
    ventasPrecargadas,
    negocioId,
  });

  // --- 5. Construccion. ---
  const fiscal = leerDatosFiscales();
  const contexto = {
    reporte,
    datos,
    desde: periodo.desde,
    hasta: periodo.hasta,
    periodoLabel: reporte.periodo
      ? etiquetaPeriodo(periodo.desde, periodo.hasta)
      : periodo.nombre,
    comparativo,
    negocioNombre,
    usuario,
    logo,
    esPremium: premiumState === "premium",
    esRestaurante,
    clienteId: String(clienteId || "").trim(),
    limiteCortesFree,
    fiscal,
    rfc: fiscal.rfc,
  };

  return generador(contexto);
}

/** true cuando el fallo fue "no hay informacion", no un error del sistema. */
export { esErrorSinDatos };

/** Reportes que el registro sabe generar. Util para comprobaciones. */
export function reportesConGenerador() {
  return Object.keys(GENERADORES);
}
