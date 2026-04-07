import { getDocs } from "firebase/firestore";
import {
  isNotificationEnabled,
  obtenerNotificacionesConfig,
} from "./configure_notificaciones";
import { buildSystemUpdateNotification } from "./system_updates";
import { filterItemsByTenant, getTenantCollectionQuery } from "./tenant";

/* =========================
   Helpers
========================= */
function normalizarStatus(raw) {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_ ]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

function isFinalStatus(status) {
  const s = normalizarStatus(status);
  return s === "entregado";
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameMonth(date, month, year) {
  return !!date && date.getMonth() === month && date.getFullYear() === year;
}

function calcularUtilidadProducto(producto) {
  if (!producto || producto.esServicio || producto.esCanje) return 0;

  const cantidad = Number(producto?.cantidad || 0);
  const precioVenta = Number(producto?.precioVenta ?? producto?.precio ?? 0);
  const precioCompra = Number(producto?.precioCompra ?? producto?.costoCompra ?? 0);

  if (!Number.isFinite(cantidad) || cantidad <= 0) return 0;
  if (!Number.isFinite(precioVenta) || !Number.isFinite(precioCompra)) return 0;

  return Math.max(precioVenta - precioCompra, 0) * cantidad;
}

function calcularUtilidadVenta(venta) {
  return (venta?.productos || []).reduce(
    (acc, producto) => acc + calcularUtilidadProducto(producto),
    0,
  );
}

/* =========================
   KPIs Dashboard
========================= */
export async function obtenerKPIsDashboard() {
  const [clientesSnap, serviciosSnap, ventasSnap] = await Promise.all([
    getDocs(getTenantCollectionQuery("clientes")),
    getDocs(getTenantCollectionQuery("servicios")),
    getDocs(getTenantCollectionQuery("ventas")),
  ]);

  const ahora = new Date();
  const diaActual = ahora.getDate();
  const mesActual = ahora.getMonth();
  const anioActual = ahora.getFullYear();

  const servicios = serviciosSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  const ventas = filterItemsByTenant(ventasSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })));
  const clientes = filterItemsByTenant(clientesSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })));
  const serviciosFiltrados = filterItemsByTenant(servicios);

  const activos = serviciosFiltrados.filter((s) => !isFinalStatus(s.status)).length;

  const entregadosHoy = serviciosFiltrados.filter((s) => {
    if (normalizarStatus(s.status) !== "entregado") return false;

    const fecha = toDate(s.fechaEntregado);
    if (!fecha) return false;

    return (
      fecha.getDate() === diaActual &&
      fecha.getMonth() === mesActual &&
      fecha.getFullYear() === anioActual
    );
  }).length;

  const ingresosServiciosMes = serviciosFiltrados.reduce((acc, s) => {
    if (normalizarStatus(s.status) !== "entregado") return acc;

    const fecha = toDate(s.fechaEntregado);
    if (!isSameMonth(fecha, mesActual, anioActual)) return acc;

    return acc + Number(s.costo || 0);
  }, 0);

  const utilidadProductosMes = ventas.reduce((acc, venta) => {
    const fecha = toDate(venta.fecha);
    if (!isSameMonth(fecha, mesActual, anioActual)) return acc;

    return acc + calcularUtilidadVenta(venta);
  }, 0);

  return {
    ingresosMes: ingresosServiciosMes + utilidadProductosMes,
    ingresosServiciosMes,
    utilidadProductosMes,
    activos,
    entregados: entregadosHoy,
    totalClientes: clientes.length,
  };
}

/* =========================
   Servicios Pendientes
========================= */
export async function obtenerServiciosPendientes() {
  const serviciosSnap = await getDocs(getTenantCollectionQuery("servicios"));
  const servicios = filterItemsByTenant(serviciosSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })));

  return servicios.filter((s) => !isFinalStatus(s.status));
}

/* =========================
   TODOS LOS SERVICIOS
   (Para calendario fechaAprox)
========================= */
export async function obtenerTodosServicios() {
  const serviciosSnap = await getDocs(getTenantCollectionQuery("servicios"));
  return filterItemsByTenant(serviciosSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })));
}

/* =========================
   Notificaciones Home
========================= */
export async function obtenerNotificacionesHome() {
  const config = await obtenerNotificacionesConfig();
  const [serviciosSnap, productosSnap, ventasSnap] = await Promise.all([
    getDocs(getTenantCollectionQuery("servicios")),
    getDocs(getTenantCollectionQuery("productos")),
    getDocs(getTenantCollectionQuery("ventas")),
  ]);

  const servicios = filterItemsByTenant(serviciosSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  const productos = filterItemsByTenant(productosSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  const ventas = filterItemsByTenant(ventasSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const activos = servicios.filter((s) => !isFinalStatus(s.status));

  const atrasados = activos.filter((s) => {
    if (!s.fechaAprox) return false;
    const f = new Date(`${s.fechaAprox}T00:00:00`);
    if (Number.isNaN(f.getTime())) return false;
    return f < hoy;
  });

  const listos = activos.filter((s) => {
    const st = normalizarStatus(s.status);
    return st === "listo" || st === "finalizado";
  });

  const sinFechaAprox = activos.filter((s) => !s.fechaAprox);

  const stockBajo = productos.filter((p) => {
    const activo = p.activo !== false;
    const stock = Number(p.stock || 0);
    const minimo = Number(p.stockMinimo || 0);
    return activo && minimo > 0 && stock <= minimo;
  });
  const stockAgotado = productos.filter(
    (p) => p.activo !== false && Number(p.stock || 0) <= 0,
  );
  const serviciosPorCobrar = activos.filter((s) => {
    const st = normalizarStatus(s.status);
    return (
      ["listo", "finalizado", "cancelado", "no_reparable"].includes(st)
      && Number(s.costo || 0) > 0
      && s.cobradoEnPOS !== true
    );
  });

  const tarjetasSinRef = ventas.filter((v) => {
    const tipo = normalizarStatus(v.tipoPago);
    const esTarjeta = tipo === "tarjeta";
    const ref = String(v?.pagoDetalle?.referenciaTarjeta || "").trim();
    if (!esTarjeta || ref) return false;
    const f = toDate(v.fecha);
    if (!f) return false;
    const hace7dias = new Date();
    hace7dias.setDate(hace7dias.getDate() - 7);
    return f >= hace7dias;
  });

  const notificaciones = [];

  if (
    atrasados.length > 0
    && isNotificationEnabled(config, "servicios_atrasados")
  ) {
    notificaciones.push({
      id: "servicios-atrasados",
      nivel: "alta",
      titulo: "Servicios atrasados",
      detalle: `${atrasados.length} servicios pasaron su fecha aproximada de entrega.`,
      accion: "/servicios",
      accionTexto: "Revisar atrasados",
    });
  }

  if (
    listos.length > 0
    && isNotificationEnabled(config, "servicios_listos_entrega")
  ) {
    notificaciones.push({
      id: "servicios-listos",
      nivel: "media",
      titulo: "Servicios listos para entregar",
      detalle: `${listos.length} servicios estan listos/finalizados y pendientes de entrega.`,
      accion: "/servicios",
      accionTexto: "Ir a servicios",
    });
  }

  if (
    sinFechaAprox.length > 0
    && isNotificationEnabled(config, "servicios_sin_fecha")
  ) {
    notificaciones.push({
      id: "sin-fecha-aprox",
      nivel: "media",
      titulo: "Servicios sin fecha aproximada",
      detalle: `${sinFechaAprox.length} servicios activos no tienen fecha de entrega estimada.`,
      accion: "/servicios",
      accionTexto: "Completar fechas",
    });
  }

  if (stockBajo.length > 0 && isNotificationEnabled(config, "stock_bajo")) {
    notificaciones.push({
      id: "stock-bajo",
      nivel: "alta",
      titulo: "Productos con stock bajo",
      detalle: `${stockBajo.length} productos estan en minimo o por debajo del minimo.`,
      accion: "/productos",
      accionTexto: "Revisar inventario",
    });
  }

  if (
    stockAgotado.length > 0
    && isNotificationEnabled(config, "stock_agotado")
  ) {
    notificaciones.push({
      id: "stock-agotado",
      nivel: "alta",
      titulo: "Productos agotados",
      detalle: `${stockAgotado.length} productos se quedaron sin existencia.`,
      accion: "/productos",
      accionTexto: "Ver agotados",
    });
  }

  if (
    serviciosPorCobrar.length > 0
    && isNotificationEnabled(config, "servicios_por_cobrar")
  ) {
    notificaciones.push({
      id: "servicios-por-cobrar",
      nivel: "media",
      titulo: "Servicios pendientes de cobro",
      detalle: `${serviciosPorCobrar.length} servicios ya se pueden cobrar en POS.`,
      accion: "/POS",
      accionTexto: "Ir a POS",
    });
  }

  if (
    tarjetasSinRef.length > 0
    && isNotificationEnabled(config, "tarjeta_sin_referencia")
  ) {
    notificaciones.push({
      id: "tarjeta-sin-referencia",
      nivel: "baja",
      titulo: "Ventas con tarjeta sin referencia",
      detalle: `${tarjetasSinRef.length} ventas de los ultimos 7 dias no tienen referencia de pago.`,
      accion: "/reportes",
      accionTexto: "Auditar ventas",
    });
  }

  if (isNotificationEnabled(config, "actualizaciones_sistema")) {
    notificaciones.push(buildSystemUpdateNotification());
  }

  return notificaciones;
}
