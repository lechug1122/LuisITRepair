import { collection, getDocs } from "firebase/firestore";
import { db } from "../../initializer/firebase";

/* =========================
   Helper
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

/* =========================
   📊 Barras - Ingresos por día
========================= */
export async function obtenerIngresosPorDia() {
  const serviciosSnap = await getDocs(collection(db, "servicios"));

  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const añoActual = ahora.getFullYear();
  const diasDelMes = new Date(añoActual, mesActual + 1, 0).getDate();

  const servicios = serviciosSnap.docs.map(d => d.data());

  const ingresosPorDia = {};

  servicios.forEach(s => {
    if (normalizarStatus(s.status) !== "entregado") return;
    if (!s.fechaEntregado) return;

    const fecha = s.fechaEntregado.toDate();

    if (
      fecha.getMonth() === mesActual &&
      fecha.getFullYear() === añoActual
    ) {
      const dia = fecha.getDate();
      const monto = Number(s.costo || 0);

      ingresosPorDia[dia] =
        (ingresosPorDia[dia] || 0) + monto;
    }
  });

  const resultado = [];

  for (let i = 1; i <= diasDelMes; i++) {
    resultado.push({
      dia: `Día ${i}`,
      total: ingresosPorDia[i] || 0
    });
  }

  return resultado;
}

/* =========================
   🥧 Pastel - Ingresos por tipo
========================= */
export async function obtenerIngresosPorTipo() {
  const serviciosSnap = await getDocs(collection(db, "servicios"));

  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const añoActual = ahora.getFullYear();

  const servicios = serviciosSnap.docs.map(d => d.data());

  const ingresosPorTipo = {};

  servicios.forEach(s => {
    if (normalizarStatus(s.status) !== "entregado") return;
    if (!s.fechaEntregado) return;

    const fecha = s.fechaEntregado.toDate();

    if (
      fecha.getMonth() === mesActual &&
      fecha.getFullYear() === añoActual
    ) {
      const tipo = (s.tipoDispositivo || "Otro").toUpperCase();
      const monto = Number(s.costo || 0);

      ingresosPorTipo[tipo] =
        (ingresosPorTipo[tipo] || 0) + monto;
    }
  });

  return Object.keys(ingresosPorTipo).map(tipo => ({
    name: tipo,
    value: ingresosPorTipo[tipo]
  }));
}


