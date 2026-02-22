import {
  doc,
  getDoc,
  setDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../../initializer/firebase";

function getDateKeyLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function guardarEgreso(egreso = {}) {
  const fechaKey = getDateKeyLocal();

  const egresoData = {
    id: `egreso-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tipo: String(egreso?.tipo || "otro").trim(),
    descripcion: String(egreso?.descripcion || "").trim(),
    monto: Number(egreso?.monto || 0),
    usuario: String(egreso?.usuario || "").trim(),
    criadoEn: new Date(), // ✅ CORREGIDO (ya no usa serverTimestamp)
  };

  const docRef = doc(db, "egresos_diarios", fechaKey);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    // Actualizar documento existente con arrayUnion
    await setDoc(
      docRef,
      {
        egresos: arrayUnion(egresoData),
      },
      { merge: true }
    );
  } else {
    // Crear documento nuevo
    await setDoc(docRef, {
      fechaKey,
      egresos: [egresoData],
      creadoEn: new Date(), // también aquí lo dejamos consistente
    });
  }

  return egresoData;
}

export async function obtenerEgresosDia(fechaKey = getDateKeyLocal()) {
  const docRef = doc(db, "egresos_diarios", fechaKey);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return {
      fechaKey,
      egresos: [],
    };
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  };
}

export async function eliminarEgreso(
  egresoId = "",
  fechaKey = getDateKeyLocal()
) {
  const docRef = doc(db, "egresos_diarios", fechaKey);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const egresos = (docSnap.data()?.egresos || []).filter(
    (e) => e.id !== egresoId
  );

  await setDoc(docRef, { egresos }, { merge: true });

  return obtenerEgresosDia(fechaKey);
}

export async function actualizarEgreso(
  egresoId = "",
  actualizacion = {},
  fechaKey = getDateKeyLocal()
) {
  const docRef = doc(db, "egresos_diarios", fechaKey);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const egresos = (docSnap.data()?.egresos || []).map((e) =>
    e.id === egresoId
      ? {
          ...e,
          ...actualizacion,
          actualizadoEn: new Date(), // opcional: marca actualización
        }
      : e
  );

  await setDoc(docRef, { egresos }, { merge: true });

  return obtenerEgresosDia(fechaKey);
}

export async function copiarEgresosAlCorte(
  fechaKey = getDateKeyLocal()
) {
  const egresosDia = await obtenerEgresosDia(fechaKey);
  return egresosDia?.egresos || [];
}

export const TIPOS_EGRESOS = [
  { id: "factura", label: "Factura", emoji: "🧾" },
  { id: "boleta_venta", label: "Boleta de venta", emoji: "🛒" },
  { id: "nota_credito", label: "Nota de crédito", emoji: "➕" },
  { id: "nota_debito", label: "Nota de débito", emoji: "➖" },
  { id: "otro", label: "Otro", emoji: "📝" },
];
