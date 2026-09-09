import {
  arrayUnion,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { allowLegacyTenantFallback, getDocRef, resolveTenantId, withTenantData } from "./tenant";

function getDateKeyLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildEgresosDocId(fechaKey = getDateKeyLocal()) {
  const tenantId = resolveTenantId();
  return tenantId ? `${tenantId}__${fechaKey}` : fechaKey;
}

export async function guardarEgreso(egreso = {}) {
  const fechaKey = getDateKeyLocal();

  const egresoData = {
    id: `egreso-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tipo: String(egreso?.tipo || "otro").trim(),
    descripcion: String(egreso?.descripcion || "").trim(),
    monto: Number(egreso?.monto || 0),
    usuario: String(egreso?.usuario || "").trim(),
    criadoEn: new Date(),
  };

  const docRef = getDocRef("egresos_diarios", buildEgresosDocId(fechaKey));
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    await setDoc(
      docRef,
      withTenantData({
        egresos: arrayUnion(egresoData),
      }),
      { merge: true },
    );
  } else {
    await setDoc(
      docRef,
      withTenantData({
        fechaKey,
        egresos: [egresoData],
        creadoEn: new Date(),
      }),
    );
  }

  return egresoData;
}

export async function obtenerEgresosDia(fechaKey = getDateKeyLocal()) {
  const docRef = getDocRef("egresos_diarios", buildEgresosDocId(fechaKey));
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    if (allowLegacyTenantFallback()) {
      const legacySnap = await getDoc(getDocRef("egresos_diarios", fechaKey));
      if (legacySnap.exists()) {
        return {
          id: legacySnap.id,
          ...legacySnap.data(),
        };
      }
    }

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
  fechaKey = getDateKeyLocal(),
) {
  const docRef = getDocRef("egresos_diarios", buildEgresosDocId(fechaKey));
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const egresos = (docSnap.data()?.egresos || []).filter(
    (e) => e.id !== egresoId,
  );

  await setDoc(docRef, { egresos }, { merge: true });

  return obtenerEgresosDia(fechaKey);
}

export async function actualizarEgreso(
  egresoId = "",
  actualizacion = {},
  fechaKey = getDateKeyLocal(),
) {
  const docRef = getDocRef("egresos_diarios", buildEgresosDocId(fechaKey));
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const egresos = (docSnap.data()?.egresos || []).map((e) =>
    e.id === egresoId
      ? {
        ...e,
        ...actualizacion,
        actualizadoEn: new Date(),
      }
      : e,
  );

  await setDoc(docRef, { egresos }, { merge: true });

  return obtenerEgresosDia(fechaKey);
}

export async function copiarEgresosAlCorte(
  fechaKey = getDateKeyLocal(),
) {
  const egresosDia = await obtenerEgresosDia(fechaKey);
  return egresosDia?.egresos || [];
}

export const TIPOS_EGRESOS = [
  { id: "factura", label: "Factura", emoji: "🧾" },
  { id: "boleta_venta", label: "Boleta de venta", emoji: "🛒" },
  { id: "nota_credito", label: "Nota de credito", emoji: "➕" },
  { id: "nota_debito", label: "Nota de debito", emoji: "➖" },
  { id: "otro", label: "Otro", emoji: "📝" },
];
