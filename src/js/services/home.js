import { collection, getDocs } from "firebase/firestore";
import { db } from "../../initializer/firebase";

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
  return s === "entregado" || s === "cancelado" || s === "no_reparable";
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* =========================
   KPIs Dashboard
========================= */
export async function obtenerKPIsDashboard() {
  const clientesSnap = await getDocs(collection(db, "clientes"));
  const serviciosSnap = await getDocs(collection(db, "servicios"));

  const ahora = new Date();
  const diaActual = ahora.getDate();
  const mesActual = ahora.getMonth();
  const añoActual = ahora.getFullYear();

  const servicios = serviciosSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  /* ===== Servicios activos ===== */
  const activos = servicios.filter(
    (s) => !isFinalStatus(s.status)
  ).length;

  /* ===== Entregados HOY ===== */
  const entregadosHoy = servicios.filter((s) => {
    if (normalizarStatus(s.status) !== "entregado") return false;

    const fechaRaw = s.fechaEntregado;
    if (!fechaRaw || typeof fechaRaw.toDate !== "function") return false;

    const fecha = fechaRaw.toDate();

    return (
      fecha.getDate() === diaActual &&
      fecha.getMonth() === mesActual &&
      fecha.getFullYear() === añoActual
    );
  }).length;

  /* ===== Ingresos del MES ===== */
  const ingresosMes = servicios.reduce((acc, s) => {
    if (normalizarStatus(s.status) !== "entregado") return acc;

    const fechaRaw = s.fechaEntregado;
    if (!fechaRaw || typeof fechaRaw.toDate !== "function") return acc;

    const fecha = fechaRaw.toDate();

    if (
      fecha.getMonth() === mesActual &&
      fecha.getFullYear() === añoActual
    ) {
      return acc + Number(s.costo || 0);
    }

    return acc;
  }, 0);

  return {
    ingresosMes,
    activos,
    entregados: entregadosHoy,
    totalClientes: clientesSnap.size,
  };
}


/* =========================
   Servicios Pendientes
========================= */
export async function obtenerServiciosPendientes() {
  const serviciosSnap = await getDocs(collection(db, "servicios"));

  const servicios = serviciosSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return servicios.filter((s) => !isFinalStatus(s.status));
}

/* =========================
   TODOS LOS SERVICIOS
   (Para calendario fechaAprox)
========================= */
export async function obtenerTodosServicios() {
  const serviciosSnap = await getDocs(collection(db, "servicios"));

  return serviciosSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/* =========================
   Notificaciones Home
========================= */
export async function obtenerNotificacionesHome() {
  const [serviciosSnap, productosSnap, ventasSnap] = await Promise.all([
    getDocs(collection(db, "servicios")),
    getDocs(collection(db, "productos")),
    getDocs(collection(db, "ventas")),
  ]);

  const servicios = serviciosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const productos = productosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const ventas = ventasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

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

  if (atrasados.length > 0) {
    notificaciones.push({
      id: "servicios-atrasados",
      nivel: "alta",
      titulo: "Servicios atrasados",
      detalle: `${atrasados.length} servicios pasaron su fecha aproximada de entrega.`,
      accion: "/servicios",
      accionTexto: "Revisar atrasados",
    });
  }

  if (listos.length > 0) {
    notificaciones.push({
      id: "servicios-listos",
      nivel: "media",
      titulo: "Servicios listos para entregar",
      detalle: `${listos.length} servicios estan listos/finalizados y pendientes de entrega.`,
      accion: "/servicios",
      accionTexto: "Ir a servicios",
    });
  }

  if (sinFechaAprox.length > 0) {
    notificaciones.push({
      id: "sin-fecha-aprox",
      nivel: "media",
      titulo: "Servicios sin fecha aproximada",
      detalle: `${sinFechaAprox.length} servicios activos no tienen fecha de entrega estimada.`,
      accion: "/servicios",
      accionTexto: "Completar fechas",
    });
  }

  if (stockBajo.length > 0) {
    notificaciones.push({
      id: "stock-bajo",
      nivel: "alta",
      titulo: "Productos con stock bajo",
      detalle: `${stockBajo.length} productos estan en minimo o por debajo del minimo.`,
      accion: "/productos",
      accionTexto: "Revisar inventario",
    });
  }

  if (tarjetasSinRef.length > 0) {
    notificaciones.push({
      id: "tarjeta-sin-referencia",
      nivel: "baja",
      titulo: "Ventas con tarjeta sin referencia",
      detalle: `${tarjetasSinRef.length} ventas de los ultimos 7 dias no tienen referencia de pago.`,
      accion: "/reportes",
      accionTexto: "Auditar ventas",
    });
  }

  return notificaciones;
}
