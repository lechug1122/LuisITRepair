// ---------------------------------------------------------------------------
// Definicion central de los reportes exportables a Excel.
//
// Un reporte nuevo se agrega aqui (y su plan en plan_features.js) y aparece
// solo en el centro de exportaciones, sin tocar la pantalla. El objetivo es
// que crecer el catalogo no obligue a editar la interfaz cada vez.
//
// Este modulo describe QUE reportes existen; `plan_features.js` decide quien
// puede usarlos y `generadores/` sabe como construirlos.
// ---------------------------------------------------------------------------

import { REPORTES_PLAN } from "../plan_features.js";

export const CATEGORIAS = [
  { id: "resumen", nombre: "Resumen", descripcion: "La foto completa del negocio." },
  { id: "ventas", nombre: "Ventas", descripcion: "Operaciones, historial y formas de cobro." },
  { id: "productos", nombre: "Productos", descripcion: "Catálogo, rotación y rentabilidad." },
  { id: "inventario", nombre: "Inventario", descripcion: "Existencias y valor de tu mercancía." },
  { id: "caja", nombre: "Caja", descripcion: "Cortes, arqueos y diferencias." },
  { id: "clientes", nombre: "Clientes", descripcion: "Directorio y comportamiento de compra." },
  { id: "credito", nombre: "Crédito y fiado", descripcion: "Saldos, cobranza y estados de cuenta." },
  { id: "egresos", nombre: "Egresos", descripcion: "Salidas de dinero y gastos." },
  { id: "empleados", nombre: "Empleados", descripcion: "Personal y su desempeño." },
  { id: "restaurante", nombre: "Restaurante", descripcion: "Meseros, mesas, platillos y comandas." },
  { id: "administracion", nombre: "Administración", descripcion: "Fiscal, rentabilidad y paquetes." },
];

// ---------------------------------------------------------------------------
// Periodos.
//
// Se resuelven con la hora local del equipo, que es la misma con la que el
// sistema guarda las ventas; usar UTC movería el corte del día y un reporte
// de "hoy" dejaría fuera las ventas de la noche.
// ---------------------------------------------------------------------------

function inicioDeDia(fecha) {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function finDeDia(fecha) {
  const copia = new Date(fecha);
  copia.setHours(23, 59, 59, 999);
  return copia;
}

function sumarDias(fecha, dias) {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

// La semana empieza en lunes, como se entiende en México.
function inicioDeSemana(fecha) {
  const copia = inicioDeDia(fecha);
  const dia = copia.getDay();
  return sumarDias(copia, dia === 0 ? -6 : 1 - dia);
}

export const PERIODOS = [
  {
    id: "hoy",
    nombre: "Hoy",
    resolver: (ahora = new Date()) => ({ desde: inicioDeDia(ahora), hasta: finDeDia(ahora) }),
  },
  {
    id: "ayer",
    nombre: "Ayer",
    resolver: (ahora = new Date()) => {
      const ayer = sumarDias(ahora, -1);
      return { desde: inicioDeDia(ayer), hasta: finDeDia(ayer) };
    },
  },
  {
    id: "esta_semana",
    nombre: "Esta semana",
    resolver: (ahora = new Date()) => ({ desde: inicioDeSemana(ahora), hasta: finDeDia(ahora) }),
  },
  {
    id: "semana_anterior",
    nombre: "Semana anterior",
    resolver: (ahora = new Date()) => {
      const inicio = sumarDias(inicioDeSemana(ahora), -7);
      return { desde: inicio, hasta: finDeDia(sumarDias(inicio, 6)) };
    },
  },
  {
    id: "este_mes",
    nombre: "Este mes",
    resolver: (ahora = new Date()) => ({
      desde: inicioDeDia(new Date(ahora.getFullYear(), ahora.getMonth(), 1)),
      hasta: finDeDia(ahora),
    }),
  },
  {
    id: "mes_anterior",
    nombre: "Mes anterior",
    resolver: (ahora = new Date()) => ({
      desde: inicioDeDia(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)),
      // El día 0 del mes actual es el último del mes anterior, sin tener que
      // saber cuántos días tiene ni si el año es bisiesto.
      hasta: finDeDia(new Date(ahora.getFullYear(), ahora.getMonth(), 0)),
    }),
  },
  {
    id: "este_anio",
    nombre: "Este año",
    resolver: (ahora = new Date()) => ({
      desde: inicioDeDia(new Date(ahora.getFullYear(), 0, 1)),
      hasta: finDeDia(ahora),
    }),
  },
  {
    id: "personalizado",
    nombre: "Rango personalizado",
    personalizado: true,
    resolver: (ahora = new Date(), desde = null, hasta = null) => ({
      desde: desde ? inicioDeDia(desde) : inicioDeDia(new Date(ahora.getFullYear(), ahora.getMonth(), 1)),
      hasta: hasta ? finDeDia(hasta) : finDeDia(ahora),
    }),
  },
];

export function resolverPeriodo(periodoId, { desde = null, hasta = null, ahora = new Date() } = {}) {
  const periodo = PERIODOS.find((item) => item.id === periodoId) || PERIODOS.find((item) => item.id === "este_mes");
  return { ...periodo.resolver(ahora, desde, hasta), id: periodo.id, nombre: periodo.nombre };
}

/**
 * Periodo inmediatamente anterior de la misma duracion.
 *
 * Se usa para las comparativas de Premium. Se calcula sobre dias completos
 * para que comparar "este mes" contra "el mes pasado" no arrastre medio dia
 * de diferencia y produzca una variacion que no existe.
 */
export function periodoAnterior({ desde, hasta }) {
  if (!desde || !hasta) return null;
  const dias = Math.max(1, Math.round((finDeDia(hasta) - inicioDeDia(desde)) / 86400000));
  const finAnterior = finDeDia(sumarDias(inicioDeDia(desde), -1));
  return { desde: inicioDeDia(sumarDias(finAnterior, -(dias - 1))), hasta: finAnterior };
}

// ---------------------------------------------------------------------------
// Catalogo.
//
// `requiere` declara las colecciones que el reporte necesita, para que la capa
// de datos lea cada una una sola vez y solo cuando hace falta.
//
// `opcionales` marca las que solo enriquecen el resultado. Las reglas de
// Firestore piden permisos distintos por coleccion (leer `empleados` exige
// `empleados.gestionar`), asi que un cajero con permiso de reportes podria no
// alcanzarlas. Cuando una opcional falla por permisos, el reporte se genera
// sin ese detalle en vez de no generarse.
//
// `disponible: false` marca un reporte que el sistema TODAVIA no puede generar
// con datos reales. Se muestra con la explicacion de lo que habria que
// empezar a registrar, en lugar de ocultarlo o -- peor -- entregar un archivo
// con informacion inventada.
// ---------------------------------------------------------------------------

export const REPORTES = [
  // ----------------------------- Resumen -----------------------------
  {
    id: "resumen_ventas",
    nombre: "Resumen de Ventas",
    descripcion: "Cuánto vendiste, en cuántas operaciones y con qué formas de pago.",
    incluye: "Total vendido, ticket promedio, métodos de pago y ventas por día.",
    categoria: "resumen",
    icono: "resumen",
    periodo: true,
    requiere: ["ventas"],
  },
  {
    id: "ejecutivo_basico",
    nombre: "Reporte Ejecutivo",
    descripcion: "La foto general del periodo en una sola hoja.",
    incluye: "Ventas, operaciones, ticket promedio, formas de cobro y productos vendidos.",
    categoria: "resumen",
    icono: "ejecutivo",
    periodo: true,
    requiere: ["ventas"],
  },
  {
    id: "ejecutivo_completo",
    nombre: "Reporte Ejecutivo Completo",
    descripcion: "El análisis más completo de CajaLibre, con comparativa contra el periodo anterior.",
    incluye: "Ventas, utilidad, costos, egresos, productos, categorías, clientes, fiado y comparativas.",
    categoria: "resumen",
    icono: "ejecutivo",
    periodo: true,
    requiere: ["ventas", "productos", "clientes", "fiados", "egresos"],
    opcionales: ["clientes", "fiados"],
  },

  // ----------------------------- Ventas ------------------------------
  {
    id: "historial_ventas",
    nombre: "Historial de Ventas",
    descripcion: "Listado de tus operaciones con folio, fecha y total.",
    incluye: "Folio, fecha, hora, total, método de pago y estado.",
    categoria: "ventas",
    icono: "ventas",
    periodo: true,
    requiere: ["ventas"],
  },
  {
    id: "historial_ventas_completo",
    nombre: "Historial de Ventas Completo",
    descripcion: "Cada venta desglosada producto por producto, con costo y ganancia.",
    incluye: "Cliente, producto, categoría, costo, descuento, impuestos y ganancia estimada.",
    categoria: "ventas",
    icono: "ventas",
    periodo: true,
    requiere: ["ventas", "productos"],
  },
  {
    id: "metodos_pago_basico",
    nombre: "Métodos de Pago",
    descripcion: "Cómo te pagan tus clientes.",
    incluye: "Efectivo, tarjeta, transferencia y otros, con su participación.",
    categoria: "ventas",
    icono: "pago",
    periodo: true,
    requiere: ["ventas"],
  },
  {
    id: "metodos_pago_avanzado",
    nombre: "Métodos de Pago Avanzado",
    descripcion: "Evolución y detalle de cada forma de cobro.",
    incluye: "Operaciones, ticket promedio, evolución diaria y comparativa del periodo anterior.",
    categoria: "ventas",
    icono: "pago",
    periodo: true,
    requiere: ["ventas"],
  },
  {
    id: "descuentos",
    nombre: "Auditoría de Descuentos",
    descripcion: "Qué descuentos se aplicaron y cuánto representaron sobre tus ventas.",
    incluye: "Descuento manual, por promoción y por puntos, con la regla aplicada y su peso en la venta.",
    categoria: "ventas",
    icono: "descuento",
    periodo: true,
    requiere: ["ventas"],
    // El sistema guarda el importe y la regla, pero no el motivo escrito ni
    // quien autorizo el descuento. Se dice para no prometer una auditoria mas
    // profunda de la que los datos permiten.
    aviso: "Incluye importes y la promoción aplicada. El motivo escrito y el usuario que autoriza todavía no se registran en el sistema.",
  },
  {
    id: "cancelaciones",
    nombre: "Cancelaciones",
    descripcion: "Ventas canceladas, su importe y su motivo.",
    categoria: "ventas",
    icono: "cancelacion",
    periodo: true,
    requiere: ["ventas"],
    disponible: false,
    motivoNoDisponible: "CajaLibre todavía no permite cancelar una venta ya cobrada, así que no existe ninguna cancelación registrada. Para este reporte habría que agregar primero la cancelación de ventas y guardar folio, importe, motivo y quién la autoriza.",
  },
  {
    id: "devoluciones",
    nombre: "Devoluciones",
    descripcion: "Productos devueltos y su importe reintegrado.",
    categoria: "ventas",
    icono: "devolucion",
    periodo: true,
    requiere: ["ventas"],
    disponible: false,
    motivoNoDisponible: "El sistema todavía no tiene registro de devoluciones. Para este reporte habría que agregar la devolución de productos y guardar la venta original, el producto, la cantidad, el importe, el motivo y la forma de reintegro.",
  },

  // ---------------------------- Productos ----------------------------
  {
    id: "catalogo_productos",
    nombre: "Catálogo de Productos",
    descripcion: "Tu lista de productos, lista para consultar o compartir.",
    incluye: "Código, nombre, categoría, precio, existencia y estado.",
    categoria: "productos",
    icono: "producto",
    periodo: false,
    requiere: ["productos"],
  },
  {
    id: "analisis_productos",
    nombre: "Análisis de Productos",
    descripcion: "Qué productos te dejan dinero y cuáles están detenidos.",
    incluye: "Costo, margen, utilidad, unidades vendidas, rotación, última venta y valor de inventario.",
    categoria: "productos",
    icono: "producto",
    periodo: true,
    requiere: ["productos", "ventas"],
  },

  // --------------------------- Inventario ----------------------------
  {
    id: "inventario_actual",
    nombre: "Inventario Actual",
    descripcion: "Las existencias de tu negocio en este momento.",
    incluye: "Código, producto, categoría, existencia, precio y estado.",
    categoria: "inventario",
    icono: "inventario",
    periodo: false,
    requiere: ["productos"],
  },
  {
    id: "stock_bajo",
    nombre: "Productos con Stock Bajo",
    descripcion: "Lo que está por agotarse y conviene resurtir.",
    incluye: "Existencia actual, stock mínimo, faltante sugerido y proveedor.",
    categoria: "inventario",
    icono: "alerta",
    periodo: false,
    requiere: ["productos"],
  },
  {
    id: "inventario_completo",
    nombre: "Inventario Completo",
    descripcion: "Existencias valuadas a costo y a precio de venta.",
    incluye: "Costo, precio, valor del inventario, stock mínimo y máximo, y estado de cada producto.",
    categoria: "inventario",
    icono: "inventario",
    periodo: false,
    requiere: ["productos"],
  },
  {
    id: "inventario_kardex",
    nombre: "Kardex de Inventario",
    descripcion: "Cada entrada y salida de cada producto, con su existencia resultante.",
    categoria: "inventario",
    icono: "kardex",
    periodo: true,
    requiere: ["productos"],
    disponible: false,
    motivoNoDisponible: "El sistema actualiza la existencia de cada producto, pero no guarda el historial de esos cambios, así que no hay movimientos que listar. Para el Kardex habría que registrar cada movimiento (fecha, producto, entrada, salida, existencia anterior y nueva, motivo, usuario y referencia) en el momento en que ocurre.",
  },
  {
    id: "inventario_conteo",
    nombre: "Conteo de Inventario",
    descripcion: "Comparación entre la existencia del sistema y la contada físicamente.",
    categoria: "inventario",
    icono: "conteo",
    periodo: false,
    requiere: ["productos"],
    disponible: false,
    motivoNoDisponible: "El conteo de inventario ya existe en Productos, pero al aplicarlo solo actualiza la existencia: no queda guardado qué se contó ni qué diferencia hubo. Para este reporte habría que guardar cada conteo con la existencia del sistema, la contada, la diferencia y su valor.",
  },

  // ------------------------------ Caja -------------------------------
  {
    id: "corte_caja_basico",
    nombre: "Corte de Caja",
    descripcion: "El resumen del cierre de caja de un día.",
    incluye: "Fecha, usuario, ventas, efectivo esperado, tarjeta y transferencia.",
    categoria: "caja",
    icono: "caja",
    periodo: false,
    requiere: ["cortes"],
  },
  {
    id: "corte_caja_completo",
    nombre: "Corte de Caja Completo",
    descripcion: "El cierre con arqueo, salidas de caja y diferencias.",
    incluye: "Fondo inicial, cobros por método, egresos, efectivo contado, diferencia y observaciones.",
    categoria: "caja",
    icono: "caja",
    periodo: false,
    requiere: ["cortes"],
  },
  {
    id: "historial_cortes",
    nombre: "Historial de Cortes",
    descripcion: "Todos tus cortes, con sus diferencias y su evolución.",
    incluye: "Ventas, efectivo, otros pagos, diferencias por fecha y por cajero.",
    categoria: "caja",
    icono: "caja",
    periodo: true,
    requiere: ["cortes"],
  },

  // ----------------------------- Clientes ----------------------------
  {
    id: "directorio_clientes",
    nombre: "Directorio de Clientes",
    descripcion: "Los datos de contacto de tus clientes.",
    incluye: "Nombre, teléfono, dirección y fecha de registro.",
    categoria: "clientes",
    icono: "cliente",
    periodo: false,
    requiere: ["clientes"],
  },
  {
    id: "analisis_clientes",
    nombre: "Análisis de Clientes",
    descripcion: "Quién te compra, cada cuánto y cuánto deja.",
    incluye: "Primera y última compra, número de compras, total gastado, producto favorito y clasificación.",
    categoria: "clientes",
    icono: "cliente",
    periodo: true,
    requiere: ["clientes", "ventas", "fiados"],
    opcionales: ["fiados"],
  },

  // ------------------------ Crédito / fiado --------------------------
  {
    id: "saldos_pendientes",
    nombre: "Saldos Pendientes",
    descripcion: "Quién te debe y cuánto.",
    incluye: "Cliente, teléfono y saldo pendiente.",
    categoria: "credito",
    icono: "credito",
    periodo: false,
    requiere: ["fiados"],
  },
  {
    id: "cuentas_por_cobrar",
    nombre: "Cuentas por Cobrar",
    descripcion: "Tu cobranza completa, con antigüedad y recuperación.",
    incluye: "Total pendiente y recuperado, deuda por cliente, vencimientos y movimientos.",
    categoria: "credito",
    icono: "credito",
    periodo: true,
    requiere: ["fiados"],
  },
  {
    id: "estado_cuenta_cliente",
    nombre: "Estado de Cuenta por Cliente",
    descripcion: "El detalle de cargos y abonos de un cliente a crédito.",
    incluye: "Cada cargo, abono y saldo, con su fecha y forma de pago.",
    categoria: "credito",
    icono: "credito",
    periodo: false,
    requiere: ["fiados"],
    // Este reporte pide elegir un cliente antes de generarse.
    seleccionCliente: true,
  },

  // ----------------------------- Egresos -----------------------------
  {
    id: "egresos_basico",
    nombre: "Egresos",
    descripcion: "Las salidas de dinero del periodo.",
    incluye: "Fecha, concepto e importe, con el total egresado.",
    categoria: "egresos",
    icono: "egreso",
    periodo: true,
    requiere: ["egresos"],
  },
  {
    id: "egresos_avanzado",
    nombre: "Egresos Detallados",
    descripcion: "En qué se va el dinero, con su evolución por mes.",
    incluye: "Hora, tipo de comprobante, responsable, promedio por egreso y evolución mensual.",
    categoria: "egresos",
    icono: "egreso",
    periodo: true,
    requiere: ["egresos"],
    aviso: "Incluye el tipo de comprobante, el concepto y el responsable. La categoría de gasto, la forma de pago y la referencia todavía no se capturan al registrar un egreso.",
  },

  // ---------------------------- Empleados ----------------------------
  {
    id: "empleados_basico",
    nombre: "Lista de Empleados",
    descripcion: "Tu personal registrado y su rol.",
    incluye: "Nombre, rol y estado.",
    categoria: "empleados",
    icono: "empleado",
    periodo: false,
    requiere: ["empleados"],
  },
  {
    id: "rendimiento_empleados",
    nombre: "Rendimiento de Empleados",
    descripcion: "Cuánto vende cada persona de tu equipo.",
    incluye: "Ventas, operaciones, ticket promedio, descuentos, cobros por método y cortes realizados.",
    categoria: "empleados",
    icono: "empleado",
    periodo: true,
    requiere: ["ventas", "empleados", "cortes"],
    // El nombre de quien cobra ya viaja en la venta; `empleados` solo agrega
    // el rol, y `cortes` los cierres realizados.
    opcionales: ["empleados", "cortes"],
    aviso: "Las ventas se atribuyen con el usuario que las cobró. Las ventas registradas antes de esta actualización no guardaron ese dato y aparecen como “Sin asignar”.",
  },

  // --------------------------- Restaurante ---------------------------
  {
    id: "restaurante_resumen",
    nombre: "Resumen Restaurante",
    descripcion: "Las cuentas y mesas atendidas del periodo.",
    incluye: "Fecha, cuenta, mesa y total, con ventas y ticket promedio.",
    categoria: "restaurante",
    icono: "restaurante",
    periodo: true,
    requiere: ["ordenes"],
    soloRestaurante: true,
  },
  {
    id: "restaurante_meseros",
    nombre: "Ventas por Mesero",
    descripcion: "El desempeño de cada mesero.",
    incluye: "Mesas atendidas, cuentas, total vendido, ticket promedio y propinas.",
    categoria: "restaurante",
    icono: "restaurante",
    periodo: true,
    requiere: ["ordenes"],
    soloRestaurante: true,
  },
  {
    id: "restaurante_platillos",
    nombre: "Platillos Vendidos",
    descripcion: "Qué se pide más en tu restaurante.",
    incluye: "Platillo, categoría, cantidad, importe y participación.",
    categoria: "restaurante",
    icono: "restaurante",
    periodo: true,
    requiere: ["ordenes"],
    soloRestaurante: true,
  },
  {
    id: "restaurante_mesas",
    nombre: "Rendimiento de Mesas",
    descripcion: "Qué mesas trabajan más.",
    incluye: "Mesa, servicios, total facturado y ticket promedio.",
    categoria: "restaurante",
    icono: "restaurante",
    periodo: true,
    requiere: ["ordenes"],
    soloRestaurante: true,
  },
  {
    id: "restaurante_comandas",
    nombre: "Comandas y Tiempos",
    descripcion: "Cuánto tarda la cocina en preparar cada comanda.",
    incluye: "Folio, mesa, mesero, hora solicitada, hora lista, tiempo de preparación y estado.",
    categoria: "restaurante",
    icono: "restaurante",
    periodo: true,
    requiere: ["ordenes"],
    soloRestaurante: true,
  },

  // -------------------------- Administración -------------------------
  {
    id: "factura_global",
    nombre: "Reporte para Factura Global",
    descripcion: "La información ordenada para preparar y conciliar tu factura global.",
    incluye: "Operaciones del periodo, subtotal, IVA, IEPS, formas de pago y datos del emisor.",
    categoria: "administracion",
    icono: "factura",
    periodo: true,
    requiere: ["ventas"],
    aviso: "Este archivo es un reporte administrativo para preparación y conciliación de información. No sustituye un CFDI timbrado.",
  },
  {
    id: "rentabilidad",
    nombre: "Reporte de Rentabilidad",
    descripcion: "Qué queda después de costos y gastos.",
    incluye: "Ventas, costo de mercancía, utilidad bruta, egresos, resultado estimado y margen.",
    categoria: "administracion",
    icono: "rentabilidad",
    periodo: true,
    requiere: ["ventas", "productos", "egresos"],
    aviso: "Los cálculos mostrados son estimaciones administrativas basadas en la información registrada en CajaLibre y no sustituyen asesoría contable.",
  },
  {
    id: "paquete_administrativo",
    nombre: "Paquete Administrativo",
    descripcion: "Un solo archivo con toda la administración del periodo, hoja por hoja.",
    incluye: "Dashboard, resumen, ventas, productos, métodos de pago, inventario, egresos, cortes, clientes, fiado e impuestos.",
    categoria: "administracion",
    icono: "paquete",
    periodo: true,
    requiere: ["ventas", "productos", "clientes", "fiados", "egresos", "cortes", "ordenes"],
    // Cada hoja del paquete es una seccion: si una no se puede leer, el resto
    // del paquete sigue siendo util y esa hoja simplemente no se genera.
    opcionales: ["clientes", "fiados", "cortes", "ordenes"],
    destacado: true,
  },
  {
    id: "auditoria",
    nombre: "Auditoría de Actividad",
    descripcion: "Quién cambió qué y cuándo dentro del sistema.",
    categoria: "administracion",
    icono: "auditoria",
    periodo: true,
    requiere: [],
    disponible: false,
    motivoNoDisponible: "CajaLibre todavía no guarda una bitácora de las acciones del personal del negocio. La bitácora que existe (admin_bitacora) solo registra acciones de soporte y no es visible para el negocio. Para este reporte habría que empezar a registrar cada cambio relevante con fecha, hora, usuario, acción, módulo, registro afectado y los valores anterior y nuevo.",
  },
];

const POR_ID = new Map(REPORTES.map((reporte) => [reporte.id, reporte]));

export function obtenerReporte(id) {
  return POR_ID.get(String(id || "")) || null;
}

/** true cuando el reporte puede generarse hoy con datos reales. */
export function reporteDisponible(reporte) {
  return reporte?.disponible !== false;
}

/**
 * Reportes visibles para un negocio.
 *
 * Los reportes de restaurante solo aparecen cuando el negocio opera en ese
 * modo: ofrecer "Ventas por mesero" a una tienda de abarrotes sería ruido.
 */
export function reportesVisibles({ esRestaurante = false } = {}) {
  return REPORTES.filter((reporte) => (reporte.soloRestaurante ? esRestaurante : true));
}

/** Categorias que realmente tienen algun reporte visible. */
export function categoriasVisibles({ esRestaurante = false } = {}) {
  const visibles = reportesVisibles({ esRestaurante });
  return CATEGORIAS
    .map((categoria) => ({
      ...categoria,
      reportes: visibles.filter((reporte) => reporte.categoria === categoria.id),
    }))
    .filter((categoria) => categoria.reportes.length > 0);
}

// Comprobacion de consistencia en desarrollo: un reporte sin plan declarado
// nunca podria descargarse (canUseReport lo niega), y es mejor enterarse al
// cargar la pantalla que cuando un cliente reporta que "el boton no hace
// nada".
if (import.meta.env?.DEV) {
  const sinPlan = REPORTES.filter((reporte) => !REPORTES_PLAN[reporte.id]).map((reporte) => reporte.id);
  if (sinPlan.length) {
    console.error("[reportes] Reportes sin plan declarado en plan_features.js:", sinPlan);
  }
}
