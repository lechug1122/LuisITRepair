// ---------------------------------------------------------------------------
// Lectura y agregacion de datos para los reportes.
//
// Dos reglas gobiernan este modulo:
//
// 1. Rendimiento. Cada coleccion se lee UNA vez por generacion y se reutiliza
//    entre hojas y entre reportes del mismo paquete. Nunca se consulta un
//    documento por fila: un negocio con miles de ventas convertiria eso en
//    miles de lecturas facturadas y en una pantalla congelada.
//
// 2. Aislamiento entre negocios. Toda consulta pasa por la ruta del negocio
//    activo y ADEMAS se revisa el negocio de cada documento. Ninguna de las
//    dos comprobaciones sobra: la ruta la resuelve el cliente y por si sola no
//    seria una garantia.
//
// Aqui tambien viven las agregaciones compartidas (por dia, por hora, por
// producto, por empleado...). Estan una sola vez para que el mismo numero no
// se calcule de dos maneras distintas en dos reportes.
// ---------------------------------------------------------------------------

import { getDocs } from "firebase/firestore";
import {
  filterItemsByTenant,
  getTenantCollectionQuery,
  resolveTenantId,
} from "../tenant.js";
import { obtenerEfectivoNetoVenta } from "../efectivo_venta.js";
import { aFecha, numero, textoSeguro } from "./excel_kit.js";

// Nombre de coleccion real de cada conjunto de datos. No se renombra ninguna:
// son las colecciones que el sistema ya usa.
const COLECCIONES = {
  ventas: "ventas",
  productos: "productos",
  clientes: "clientes",
  fiados: "fiados",
  egresos: "egresos_diarios",
  cortes: "cortes_caja",
  ordenes: "restaurante_ordenes",
  empleados: "empleados",
};

/**
 * Comprueba que se esta trabajando sobre el negocio esperado.
 *
 * `negocioIdEsperado` viene de la sesion ya resuelta. Si no coincide con el
 * negocio que resuelven las consultas, se aborta: es preferible no entregar un
 * reporte que entregar el de otro negocio.
 */
function exigirNegocio(negocioIdEsperado = "") {
  const negocioActivo = resolveTenantId();
  if (!negocioActivo) {
    const error = new Error("No se pudo identificar el negocio activo.");
    error.code = "reportes/sin-negocio";
    throw error;
  }
  const esperado = String(negocioIdEsperado || "").trim();
  if (esperado && esperado !== negocioActivo) {
    const error = new Error("La sesión no corresponde al negocio activo.");
    error.code = "reportes/negocio-distinto";
    throw error;
  }
  return negocioActivo;
}

async function leerColeccion(nombre) {
  const snapshot = await getDocs(getTenantCollectionQuery(nombre));
  // El filtro por negocio se aplica sobre el contenido de cada documento,
  // no solo sobre la ruta desde la que se leyo.
  return filterItemsByTenant(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

/**
 * Lectura de una coleccion auxiliar.
 *
 * Las reglas de Firestore piden permisos distintos por coleccion: `empleados`
 * exige `empleados.gestionar` y las de restaurante exigen un rol de
 * restaurante. Un cajero con permiso de reportes puede no tenerlos, y en esos
 * casos la coleccion solo servia para enriquecer (poner el nombre de quien
 * cobro, por ejemplo). Negar el reporte completo por eso seria desproporcionado:
 * se continua sin ese dato.
 *
 * Solo se aplica a las colecciones declaradas como opcionales. La coleccion
 * principal de un reporte nunca pasa por aqui: si esa falla, el reporte falla.
 */
async function leerColeccionOpcional(nombre) {
  try {
    return await leerColeccion(nombre);
  } catch (error) {
    if (error?.code === "permission-denied") {
      console.info(
        `[reportes] Sin permiso para leer "${nombre}"; el reporte continúa sin ese detalle.`,
      );
      return [];
    }
    throw error;
  }
}

/**
 * Los egresos viven en un documento por dia con un arreglo dentro. El reporte
 * necesita una lista plana, asi que se desdobla conservando el dia del
 * documento (unica fecha fiable cuando el egreso no trae hora).
 */
function aplanarEgresos(documentos = []) {
  const lista = [];
  documentos.forEach((documento) => {
    const fechaKey = String(documento?.fechaKey || documento?.id || "").slice(-10);
    const base = fechaKey && /^\d{4}-\d{2}-\d{2}$/.test(fechaKey)
      ? new Date(`${fechaKey}T00:00:00`)
      : null;
    (Array.isArray(documento?.egresos) ? documento.egresos : []).forEach((egreso) => {
      const capturadoEn = aFecha(egreso?.criadoEn);
      lista.push({
        id: String(egreso?.id || ""),
        // `criadoEn` da fecha y hora exactas; el dia del documento es el
        // respaldo para los egresos antiguos que no la guardaron.
        fecha: capturadoEn || base,
        tieneHora: Boolean(capturadoEn),
        tipo: String(egreso?.tipo || "otro"),
        descripcion: String(egreso?.descripcion || ""),
        monto: numero(egreso?.monto),
        usuario: String(egreso?.usuario || ""),
      });
    });
  });
  return lista.sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));
}

/**
 * Fuente de datos de una generacion.
 *
 * `requiere` limita la lectura a lo necesario. `ventasPrecargadas` permite
 * reutilizar las ventas que la pantalla de reportes ya tiene en memoria, de
 * modo que exportar no vuelva a cobrar las mismas lecturas.
 */
export async function construirFuenteDatos({
  requiere = [],
  // Colecciones que solo enriquecen el reporte: si faltan permisos, se sigue
  // sin ellas en lugar de negar la exportacion completa.
  opcionales = [],
  ventasPrecargadas = null,
  negocioId = "",
} = {}) {
  const negocioActivo = exigirNegocio(negocioId);
  const necesarias = new Set(requiere);
  const blandas = new Set(opcionales);
  const cache = new Map();

  if (Array.isArray(ventasPrecargadas)) {
    // Las ventas de la pantalla ya pasaron por el filtro de negocio; se vuelve
    // a aplicar porque es una entrada externa a este modulo.
    cache.set("ventas", filterItemsByTenant(ventasPrecargadas));
    necesarias.delete("ventas");
  }

  const claves = [...necesarias].filter((clave) => COLECCIONES[clave]);
  const resultados = await Promise.all(claves.map((clave) => (blandas.has(clave)
    ? leerColeccionOpcional(COLECCIONES[clave])
    : leerColeccion(COLECCIONES[clave]))));
  claves.forEach((clave, indice) => {
    cache.set(clave, clave === "egresos" ? aplanarEgresos(resultados[indice]) : resultados[indice]);
  });

  const obtener = (clave) => cache.get(clave) || [];

  return {
    negocioId: negocioActivo,
    ventas: obtener("ventas"),
    productos: obtener("productos"),
    clientes: obtener("clientes"),
    fiados: obtener("fiados"),
    egresos: obtener("egresos"),
    cortes: obtener("cortes"),
    ordenes: obtener("ordenes"),
    empleados: obtener("empleados"),
  };
}

// ---------------------------------------------------------------------------
// Normalizacion
// ---------------------------------------------------------------------------

export const ETIQUETAS_PAGO = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  fiado: "Crédito (fiado)",
  mixto: "Pago mixto",
};

export function etiquetaMetodoPago(valor) {
  const clave = String(valor || "").trim().toLowerCase();
  if (!clave) return "Otro";
  return ETIQUETAS_PAGO[clave] || (clave.charAt(0).toUpperCase() + clave.slice(1));
}

/**
 * Estado de la venta tal como el sistema lo maneja hoy.
 *
 * CajaLibre guarda `estadoPago` con dos valores: "pagado" y "pendiente" (las
 * ventas a credito). No existe cancelacion ni devolucion de una venta ya
 * cobrada, asi que no se inventan esos estados ni se descuenta nada del total
 * por ese motivo.
 */
export function estadoVenta(venta) {
  const estado = String(venta?.estadoPago || "").trim().toLowerCase();
  if (estado === "pendiente") return "Pendiente de pago";
  if (estado === "pagado") return "Pagada";
  // Ventas anteriores al campo: si fueron a credito quedaron con tipoPago
  // fiado, y en cualquier otro caso el cobro se realizo en el momento.
  return String(venta?.tipoPago || "").toLowerCase() === "fiado" ? "Pendiente de pago" : "Pagada";
}

/** Quien cobro la venta, con el respaldo que exista en el documento. */
export function empleadoDeVenta(venta, indiceEmpleados = null) {
  const directo = String(venta?.atendio || venta?.atendioNombre || venta?.atendidoPor || "").trim();
  if (directo) return directo;

  const uid = String(venta?.atendioUid || "").trim();
  if (uid && indiceEmpleados?.porUid?.[uid]) return indiceEmpleados.porUid[uid];

  const correo = String(venta?.atendioEmail || venta?.actorEmail || "").trim().toLowerCase();
  if (correo && indiceEmpleados?.porCorreo?.[correo]) return indiceEmpleados.porCorreo[correo];
  if (correo) return correo;

  return "Sin asignar";
}

export function indexarEmpleados(empleados = []) {
  const porUid = {};
  const porCorreo = {};
  empleados.forEach((empleado) => {
    const nombre = String(empleado?.nombre || "").trim();
    if (!nombre) return;
    const uid = String(empleado?.uid || empleado?.id || "").trim();
    const correo = String(empleado?.correo || "").trim().toLowerCase();
    if (uid) porUid[uid] = nombre;
    if (correo) porCorreo[correo] = nombre;
  });
  return { porUid, porCorreo };
}

/** Clave con la que se identifica un producto entre ventas y catalogo. */
function claveProducto(item) {
  return String(item?.productoId || item?.id || "").trim()
    || String(item?.codigo || "").trim().toLowerCase()
    || String(item?.nombre || "").trim().toLowerCase();
}

export function indexarProductos(productos = []) {
  const porClave = new Map();
  productos.forEach((producto) => {
    const claves = [
      String(producto?.id || "").trim(),
      String(producto?.codigo || "").trim().toLowerCase(),
      String(producto?.nombre || "").trim().toLowerCase(),
    ].filter(Boolean);
    claves.forEach((clave) => {
      if (!porClave.has(clave)) porClave.set(clave, producto);
    });
  });
  return porClave;
}

/**
 * Costo unitario de una linea de venta.
 *
 * La venta guarda una copia del producto, asi que normalmente el costo esta
 * en la propia linea. Cuando no (ventas antiguas, productos capturados a
 * mano) se recurre al catalogo actual; si tampoco hay, se devuelve null en
 * lugar de 0, porque un costo desconocido no es un costo de cero y tratarlo
 * asi inflaria la utilidad.
 */
export function costoUnitario(item, indiceProductos = null) {
  const directo = Number(item?.precioCompra ?? item?.ultimoCosto);
  if (Number.isFinite(directo) && directo > 0) return directo;

  const producto = indiceProductos?.get(claveProducto(item));
  const delCatalogo = Number(producto?.precioCompra ?? producto?.ultimoCosto);
  if (Number.isFinite(delCatalogo) && delCatalogo > 0) return delCatalogo;

  return null;
}

/** Importe de la linea de venta, ya con su cantidad. */
export function importeLinea(item) {
  const cantidad = numero(item?.cantidad) || 1;
  const precio = numero(item?.precioVenta ?? item?.precio);
  return precio * cantidad;
}

export function descuentoTotalVenta(venta) {
  return numero(venta?.descuentoManual)
    + numero(venta?.descuentoRegla)
    + numero(venta?.descuentoPuntos);
}

// ---------------------------------------------------------------------------
// Filtros por periodo
// ---------------------------------------------------------------------------

export function enPeriodo(fecha, desde, hasta) {
  const valor = aFecha(fecha);
  if (!valor) return false;
  if (desde && valor < desde) return false;
  if (hasta && valor > hasta) return false;
  return true;
}

export function filtrarPorFecha(lista = [], campo = "fecha", { desde = null, hasta = null } = {}) {
  if (!desde && !hasta) return lista.slice();
  return lista.filter((item) => enPeriodo(item?.[campo], desde, hasta));
}

// ---------------------------------------------------------------------------
// Agregaciones
// ---------------------------------------------------------------------------

const claveDia = (fecha) => {
  const f = aFecha(fecha);
  if (!f) return "";
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
};

const etiquetaDia = (clave) => {
  const [, mes, dia] = clave.split("-");
  return `${dia}/${mes}`;
};

/** Ventas por dia, en orden cronologico y listo para una grafica de linea. */
export function ventasPorDia(ventas = []) {
  const mapa = new Map();
  ventas.forEach((venta) => {
    const clave = claveDia(venta?.fecha);
    if (!clave) return;
    const actual = mapa.get(clave) || { total: 0, operaciones: 0 };
    actual.total += numero(venta?.total);
    actual.operaciones += 1;
    mapa.set(clave, actual);
  });
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, valor]) => ({
      clave,
      label: etiquetaDia(clave),
      value: Number(valor.total.toFixed(2)),
      operaciones: valor.operaciones,
    }));
}

/** Ventas por hora del dia. Sirve para saber a que hora conviene tener gente. */
export function ventasPorHora(ventas = []) {
  const horas = Array.from({ length: 24 }, () => ({ total: 0, operaciones: 0 }));
  ventas.forEach((venta) => {
    const fecha = aFecha(venta?.fecha);
    if (!fecha) return;
    const hora = horas[fecha.getHours()];
    hora.total += numero(venta?.total);
    hora.operaciones += 1;
  });
  return horas
    .map((valor, hora) => ({
      label: `${String(hora).padStart(2, "0")}:00`,
      value: Number(valor.total.toFixed(2)),
      operaciones: valor.operaciones,
      hora,
    }))
    // Una grafica de 24 barras donde la mitad son cero no dice nada.
    .filter((item) => item.operaciones > 0);
}

/** Ventas agrupadas por mes, para las comparativas de periodos largos. */
export function ventasPorMes(ventas = []) {
  const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const mapa = new Map();
  ventas.forEach((venta) => {
    const fecha = aFecha(venta?.fecha);
    if (!fecha) return;
    const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const actual = mapa.get(clave) || { total: 0, operaciones: 0, etiqueta: `${MESES_CORTOS[fecha.getMonth()]} ${fecha.getFullYear()}` };
    actual.total += numero(venta?.total);
    actual.operaciones += 1;
    mapa.set(clave, actual);
  });
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, valor]) => ({
      clave,
      label: valor.etiqueta,
      value: Number(valor.total.toFixed(2)),
      operaciones: valor.operaciones,
    }));
}

/**
 * Cobros por metodo de pago.
 *
 * Se reparte por el desglose real de `pagoDetalle` cuando existe, porque una
 * venta puede cobrarse con dos medios a la vez y asignarla completa a uno solo
 * distorsionaria el reporte. El efectivo usa la misma funcion que el corte de
 * caja para que los dos documentos digan lo mismo.
 */
export function cobrosPorMetodo(ventas = []) {
  const acumulado = new Map();
  const sumar = (metodo, importe, operacion) => {
    if (!(importe > 0)) return;
    const actual = acumulado.get(metodo) || { total: 0, operaciones: 0 };
    actual.total += importe;
    if (operacion) actual.operaciones += 1;
    acumulado.set(metodo, actual);
  };

  ventas.forEach((venta) => {
    const tipo = String(venta?.tipoPago || "").trim().toLowerCase();
    const total = numero(venta?.total);
    const detalle = venta?.pagoDetalle || {};

    if (tipo === "fiado") {
      sumar(ETIQUETAS_PAGO.fiado, total, true);
      return;
    }

    const efectivo = obtenerEfectivoNetoVenta(venta);
    const tarjeta = numero(detalle?.tarjeta) || (tipo === "tarjeta" && !numero(detalle?.tarjeta) ? total : 0);
    const transferencia = numero(detalle?.transferencia)
      || (tipo === "transferencia" && !numero(detalle?.transferencia) ? total : 0);

    const desglosado = efectivo + tarjeta + transferencia;
    if (desglosado > 0) {
      // La operacion se cuenta en el medio con el importe mas alto, para que
      // la suma de operaciones siga siendo igual al numero de ventas.
      const mayor = Math.max(efectivo, tarjeta, transferencia);
      sumar(ETIQUETAS_PAGO.efectivo, efectivo, efectivo === mayor);
      sumar(ETIQUETAS_PAGO.tarjeta, tarjeta, tarjeta === mayor && efectivo !== mayor);
      sumar(ETIQUETAS_PAGO.transferencia, transferencia, transferencia === mayor && efectivo !== mayor && tarjeta !== mayor);
      // Lo que el desglose no cubre (redondeos, medios no capturados) se
      // reconoce como "Otro" en lugar de perderse.
      const resto = Number((total - desglosado).toFixed(2));
      if (resto > 0.01) sumar("Otro", resto, false);
      return;
    }

    sumar(etiquetaMetodoPago(tipo || "otro"), total, true);
  });

  const total = [...acumulado.values()].reduce((suma, item) => suma + item.total, 0);
  return [...acumulado.entries()]
    .map(([metodo, valor]) => ({
      label: metodo,
      value: Number(valor.total.toFixed(2)),
      operaciones: valor.operaciones,
      participacion: total > 0 ? valor.total / total : 0,
      ticketPromedio: valor.operaciones > 0 ? valor.total / valor.operaciones : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Consolidado por producto: unidades, ingreso, costo y utilidad.
 *
 * `costoConocido` indica si TODAS las lineas tenian costo. Un reporte de
 * utilidad debe poder advertir que el margen es parcial en lugar de presentar
 * como exacto un numero que no lo es.
 */
export function consolidadoProductos(ventas = [], indiceProductos = null) {
  const mapa = new Map();

  ventas.forEach((venta) => {
    const fecha = aFecha(venta?.fecha);
    (Array.isArray(venta?.productos) ? venta.productos : []).forEach((item) => {
      const nombre = textoSeguro(item?.nombre, "Sin nombre");
      const clave = claveProducto(item) || nombre.toLowerCase();
      const registro = mapa.get(clave) || {
        clave,
        nombre,
        codigo: textoSeguro(item?.codigo, ""),
        categoria: textoSeguro(item?.categoria, "Sin categoría"),
        unidades: 0,
        ingreso: 0,
        costo: 0,
        operaciones: 0,
        costoConocido: true,
        ultimaVenta: null,
      };

      const cantidad = numero(item?.cantidad) || 1;
      const costo = costoUnitario(item, indiceProductos);

      registro.unidades += cantidad;
      registro.ingreso += importeLinea(item);
      registro.operaciones += 1;
      if (costo === null) registro.costoConocido = false;
      else registro.costo += costo * cantidad;
      if (fecha && (!registro.ultimaVenta || fecha > registro.ultimaVenta)) registro.ultimaVenta = fecha;

      mapa.set(clave, registro);
    });
  });

  return [...mapa.values()]
    .map((registro) => ({
      ...registro,
      ingreso: Number(registro.ingreso.toFixed(2)),
      costo: Number(registro.costo.toFixed(2)),
      utilidad: Number((registro.ingreso - registro.costo).toFixed(2)),
      margen: registro.ingreso > 0 ? (registro.ingreso - registro.costo) / registro.ingreso : 0,
    }))
    .sort((a, b) => b.ingreso - a.ingreso);
}

/** Ventas por categoria de producto. */
export function ventasPorCategoria(consolidado = []) {
  const mapa = new Map();
  consolidado.forEach((producto) => {
    const categoria = producto.categoria || "Sin categoría";
    const actual = mapa.get(categoria) || { total: 0, unidades: 0, utilidad: 0 };
    actual.total += producto.ingreso;
    actual.unidades += producto.unidades;
    actual.utilidad += producto.utilidad;
    mapa.set(categoria, actual);
  });
  return [...mapa.entries()]
    .map(([categoria, valor]) => ({
      label: categoria,
      value: Number(valor.total.toFixed(2)),
      unidades: valor.unidades,
      utilidad: Number(valor.utilidad.toFixed(2)),
    }))
    .sort((a, b) => b.value - a.value);
}

/** Desempeño por persona que cobro. */
export function ventasPorEmpleado(ventas = [], indiceEmpleados = null) {
  const mapa = new Map();
  ventas.forEach((venta) => {
    const nombre = empleadoDeVenta(venta, indiceEmpleados);
    const registro = mapa.get(nombre) || {
      nombre,
      total: 0,
      operaciones: 0,
      descuentos: 0,
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      fiado: 0,
    };
    const detalle = venta?.pagoDetalle || {};
    const tipo = String(venta?.tipoPago || "").toLowerCase();
    registro.total += numero(venta?.total);
    registro.operaciones += 1;
    registro.descuentos += descuentoTotalVenta(venta);
    if (tipo === "fiado") registro.fiado += numero(venta?.total);
    else {
      registro.efectivo += obtenerEfectivoNetoVenta(venta);
      registro.tarjeta += numero(detalle?.tarjeta) || (tipo === "tarjeta" ? numero(venta?.total) : 0);
      registro.transferencia += numero(detalle?.transferencia) || (tipo === "transferencia" ? numero(venta?.total) : 0);
    }
    mapa.set(nombre, registro);
  });

  return [...mapa.values()]
    .map((registro) => ({
      ...registro,
      total: Number(registro.total.toFixed(2)),
      descuentos: Number(registro.descuentos.toFixed(2)),
      efectivo: Number(registro.efectivo.toFixed(2)),
      tarjeta: Number(registro.tarjeta.toFixed(2)),
      transferencia: Number(registro.transferencia.toFixed(2)),
      fiado: Number(registro.fiado.toFixed(2)),
      ticketPromedio: registro.operaciones > 0 ? registro.total / registro.operaciones : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Metricas del periodo. Es el nucleo de todos los dashboards.
 *
 * Devuelve tambien `costoParcial` para que un reporte pueda avisar que la
 * utilidad es estimada sobre los productos con costo registrado, en vez de
 * presentarla como un dato contable cerrado.
 */
export function calcularMetricas(ventas = [], { indiceProductos = null, egresos = [] } = {}) {
  let total = 0;
  let subtotal = 0;
  let iva = 0;
  let ieps = 0;
  let unidades = 0;
  let descuentos = 0;
  let fiado = 0;
  let propinas = 0;
  let costo = 0;
  let lineasSinCosto = 0;
  let lineas = 0;

  ventas.forEach((venta) => {
    total += numero(venta?.total);
    subtotal += numero(venta?.subtotal);
    iva += numero(venta?.iva);
    ieps += numero(venta?.ieps);
    descuentos += descuentoTotalVenta(venta);
    propinas += numero(venta?.propina);
    if (String(venta?.tipoPago || "").toLowerCase() === "fiado") fiado += numero(venta?.total);

    (Array.isArray(venta?.productos) ? venta.productos : []).forEach((item) => {
      const cantidad = numero(item?.cantidad) || 1;
      unidades += cantidad;
      lineas += 1;
      const unitario = costoUnitario(item, indiceProductos);
      if (unitario === null) lineasSinCosto += 1;
      else costo += unitario * cantidad;
    });
  });

  const totalEgresos = egresos.reduce((suma, egreso) => suma + numero(egreso?.monto), 0);
  const utilidadBruta = total - costo;

  return {
    operaciones: ventas.length,
    total: Number(total.toFixed(2)),
    subtotal: Number(subtotal.toFixed(2)),
    iva: Number(iva.toFixed(2)),
    ieps: Number(ieps.toFixed(2)),
    impuestos: Number((iva + ieps).toFixed(2)),
    unidades,
    descuentos: Number(descuentos.toFixed(2)),
    fiado: Number(fiado.toFixed(2)),
    propinas: Number(propinas.toFixed(2)),
    costo: Number(costo.toFixed(2)),
    utilidadBruta: Number(utilidadBruta.toFixed(2)),
    margen: total > 0 ? utilidadBruta / total : 0,
    egresos: Number(totalEgresos.toFixed(2)),
    resultado: Number((utilidadBruta - totalEgresos).toFixed(2)),
    ticketPromedio: ventas.length > 0 ? Number((total / ventas.length).toFixed(2)) : 0,
    // Verdadero cuando alguna linea vendida no tenia costo registrado.
    costoParcial: lineasSinCosto > 0,
    lineasSinCosto,
    lineas,
  };
}

/** Saldo y recuperacion de las cuentas a credito. */
export function resumenFiados(fiados = [], { desde = null, hasta = null } = {}) {
  let pendiente = 0;
  let recuperado = 0;
  let generado = 0;
  let conDeuda = 0;
  const movimientos = [];

  fiados.forEach((cuenta) => {
    const saldo = numero(cuenta?.saldo);
    pendiente += saldo;
    if (saldo > 0.01) conDeuda += 1;

    (Array.isArray(cuenta?.movimientos) ? cuenta.movimientos : []).forEach((movimiento) => {
      const fecha = aFecha(movimiento?.fecha);
      const dentro = !desde && !hasta ? true : enPeriodo(fecha, desde, hasta);
      if (!dentro) return;
      const cargo = numero(movimiento?.cargo);
      const abono = numero(movimiento?.abono);
      generado += cargo;
      recuperado += abono;
      movimientos.push({
        clienteId: String(cuenta?.clienteId || ""),
        cliente: textoSeguro(cuenta?.clienteNombre, "Cliente sin nombre"),
        telefono: textoSeguro(cuenta?.clienteTelefono, ""),
        fecha,
        descripcion: textoSeguro(movimiento?.descripcion, ""),
        cargo,
        abono,
        saldo: numero(movimiento?.saldo),
        metodo: textoSeguro(movimiento?.metodo, ""),
        vencimiento: cuenta?.fechaVencimiento || null,
      });
    });
  });

  movimientos.sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));

  return {
    pendiente: Number(pendiente.toFixed(2)),
    recuperado: Number(recuperado.toFixed(2)),
    generado: Number(generado.toFixed(2)),
    conDeuda,
    cuentas: fiados.length,
    deudaPromedio: conDeuda > 0 ? Number((pendiente / conDeuda).toFixed(2)) : 0,
    movimientos,
  };
}

/** Existencias, valor y alertas del catalogo. */
export function resumenInventario(productos = []) {
  let unidades = 0;
  let valorCosto = 0;
  let valorVenta = 0;
  let agotados = 0;
  let stockBajo = 0;
  let sobrestock = 0;
  let activos = 0;

  productos.forEach((producto) => {
    const stock = numero(producto?.stock);
    const costo = numero(producto?.precioCompra ?? producto?.ultimoCosto);
    const precio = numero(producto?.precioVenta);
    const minimo = numero(producto?.stockMinimo);
    const maximo = numero(producto?.stockMaximo);

    if (producto?.activo !== false) activos += 1;
    unidades += stock;
    valorCosto += costo * stock;
    valorVenta += precio * stock;
    if (stock <= 0) agotados += 1;
    else if (minimo > 0 && stock <= minimo) stockBajo += 1;
    if (maximo > 0 && stock > maximo) sobrestock += 1;
  });

  return {
    productos: productos.length,
    activos,
    unidades: Number(unidades.toFixed(2)),
    valorCosto: Number(valorCosto.toFixed(2)),
    valorVenta: Number(valorVenta.toFixed(2)),
    agotados,
    stockBajo,
    sobrestock,
    utilidadPotencial: Number((valorVenta - valorCosto).toFixed(2)),
  };
}

/** Estado legible de un producto dentro del inventario. */
export function estadoInventarioProducto(producto) {
  const stock = numero(producto?.stock);
  const minimo = numero(producto?.stockMinimo);
  const maximo = numero(producto?.stockMaximo);
  if (producto?.activo === false) return "Inactivo";
  if (stock <= 0) return "Agotado";
  if (minimo > 0 && stock <= minimo) return "Stock bajo";
  if (maximo > 0 && stock > maximo) return "Sobrestock";
  return "Disponible";
}

// ---------------------------------------------------------------------------
// Restaurante
// ---------------------------------------------------------------------------

export const ESTADOS_ORDEN = {
  nueva: "Nueva",
  preparando: "En preparación",
  lista: "Lista",
  cobrada: "Cobrada",
  cancelada: "Cancelada",
};

export function etiquetaEstadoOrden(status) {
  return ESTADOS_ORDEN[String(status || "").toLowerCase()] || textoSeguro(status, "Sin estado");
}

/**
 * Normaliza las comandas del restaurante.
 *
 * El tiempo de preparacion sale de la diferencia entre `createdAt` y `listaAt`,
 * las dos marcas que el sistema ya guarda. Cuando la comanda no llego a
 * marcarse lista queda en null: no se estima un tiempo que nadie midio.
 */
export function normalizarOrdenes(ordenes = []) {
  return ordenes.map((orden) => {
    const creada = aFecha(orden?.createdAt);
    const lista = aFecha(orden?.listaAt);
    const iniciada = aFecha(orden?.preparacionIniciadaAt);
    const cobrada = aFecha(orden?.cobradaAt);
    const minutos = creada && lista ? Math.max(0, Math.round((lista - creada) / 60000)) : null;

    return {
      id: String(orden?.id || ""),
      folio: String(orden?.id || "").slice(-6).toUpperCase(),
      fecha: creada,
      mesa: textoSeguro(orden?.mesaEtiqueta || (orden?.mesaNumero ? `Mesa ${orden.mesaNumero}` : ""), "Sin mesa"),
      tipoServicio: textoSeguro(orden?.tipoServicio, "mesa"),
      mesero: textoSeguro(orden?.creadaPorNombre, "Sin asignar"),
      cobradaPor: textoSeguro(orden?.cobradaPorNombre, ""),
      cliente: textoSeguro(orden?.clienteNombre, ""),
      estado: etiquetaEstadoOrden(orden?.status),
      statusCrudo: String(orden?.status || "").toLowerCase(),
      total: numero(orden?.totalCobradoCuenta) || numero(orden?.total),
      propina: numero(orden?.propina),
      items: Array.isArray(orden?.items) ? orden.items : [],
      ventaId: String(orden?.ventaId || ""),
      creada,
      iniciada,
      lista,
      cobrada,
      minutosPreparacion: minutos,
    };
  }).sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));
}

/** Platillos vendidos a partir de las comandas cobradas. */
export function platillosVendidos(ordenes = []) {
  const mapa = new Map();
  ordenes.forEach((orden) => {
    orden.items.forEach((item) => {
      const nombre = textoSeguro(item?.nombre, "Sin nombre");
      const clave = nombre.toLowerCase();
      const registro = mapa.get(clave) || {
        nombre,
        categoria: textoSeguro(item?.categoria, "Sin categoría"),
        cantidad: 0,
        importe: 0,
      };
      const cantidad = numero(item?.cantidad) || 1;
      registro.cantidad += cantidad;
      registro.importe += numero(item?.precio ?? item?.precioVenta) * cantidad;
      mapa.set(clave, registro);
    });
  });

  const lista = [...mapa.values()].map((item) => ({
    ...item,
    importe: Number(item.importe.toFixed(2)),
  }));
  const total = lista.reduce((suma, item) => suma + item.importe, 0);
  return lista
    .map((item) => ({ ...item, participacion: total > 0 ? item.importe / total : 0 }))
    .sort((a, b) => b.importe - a.importe);
}
