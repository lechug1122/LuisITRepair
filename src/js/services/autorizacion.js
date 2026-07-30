import { doc, getDoc } from "firebase/firestore";
import { db } from "../../initializer/firebase.js";
import { normalizeNegocio, obtenerNegocio } from "./negocios";
import { resolverAccesoSuscripcion } from "./suscripciones";

export function normalizeAutorizadoData(raw = {}, uid = "") {
  const safeUid = String(uid || "").trim();
  const cuentaPrincipalUid = String(raw?.cuentaPrincipalUid || safeUid).trim();
  const negocioId = String(raw?.negocioId || cuentaPrincipalUid || safeUid).trim();

  return {
    ...raw,
    activo: raw?.activo !== false,
    superAdmin: raw?.superAdmin === true,
    accesoAnalitica: raw?.accesoAnalitica === true,
    suscripcionControlada: raw?.suscripcionControlada === true,
    esCuentaPrincipal: raw?.esCuentaPrincipal === true || cuentaPrincipalUid === safeUid,
    cuentaPrincipalUid,
    negocioId,
    setupCompleto: raw?.setupCompleto === true,
    terminosAceptados: raw?.terminosAceptados === true,
    terminosVersion: String(raw?.terminosVersion || "").trim(),
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
  const negocioId = autorizado.negocioId || cuentaPrincipalUid;
  let suscripcion = null;
  let negocio = null;

  if (!autorizado.superAdmin) {
    try {
      negocio = await obtenerNegocio(negocioId);
    } catch (error) {
      console.warn("[autorizacion] No se pudo leer el negocio:", error?.code || error);
      negocio = null;
    }
  }

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
    negocio: negocio ? normalizeNegocio(negocio, negocioId) : null,
  });

  return {
    ...acceso,
    autorizado,
    negocio,
  };
}

export async function esUsuarioAutorizado(uid) {
  const estado = await obtenerEstadoAutorizacion(uid);
  return estado.permitido;
}
