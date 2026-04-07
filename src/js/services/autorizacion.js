import { doc, getDoc } from "firebase/firestore";
import { db } from "../../initializer/firebase.js";
import { resolverAccesoSuscripcion } from "./suscripciones";

export function normalizeAutorizadoData(raw = {}, uid = "") {
  const safeUid = String(uid || "").trim();
  const cuentaPrincipalUid = String(raw?.cuentaPrincipalUid || safeUid).trim();

  return {
    ...raw,
    activo: raw?.activo !== false,
    superAdmin: raw?.superAdmin === true,
    suscripcionControlada: raw?.suscripcionControlada === true,
    esCuentaPrincipal: raw?.esCuentaPrincipal === true || cuentaPrincipalUid === safeUid,
    cuentaPrincipalUid,
  };
}

export async function obtenerEstadoAutorizacion(uid) {
  if (!uid) {
    return {
      permitido: false,
      motivo: "sin_uid",
      mensaje: "No se encontro el usuario.",
      autorizado: null,
      suscripcion: null,
    };
  }

  const ref = doc(db, "autorizados", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return {
      permitido: false,
      motivo: "sin_autorizacion",
      mensaje: "Usuario no autorizado.",
      autorizado: null,
      suscripcion: null,
    };
  }

  const autorizado = normalizeAutorizadoData(snap.data() || {}, uid);
  const cuentaPrincipalUid = autorizado.cuentaPrincipalUid;
  let suscripcion = null;

  if (autorizado.suscripcionControlada && !autorizado.superAdmin) {
    const suscripcionSnap = await getDoc(doc(db, "suscripciones", cuentaPrincipalUid));
    if (suscripcionSnap.exists()) {
      suscripcion = suscripcionSnap.data() || null;
    }
  }

  const acceso = resolverAccesoSuscripcion({
    uid,
    autorizado,
    suscripcion,
  });

  return {
    ...acceso,
    autorizado,
  };
}

export async function esUsuarioAutorizado(uid) {
  const estado = await obtenerEstadoAutorizacion(uid);
  return estado.permitido;
}
