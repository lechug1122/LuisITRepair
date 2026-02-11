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
