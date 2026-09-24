// ---------------------------------------------------------------------------
// Modelo puro de la aceptacion de una orden de servicio.
//
// Sin React, sin Firestore y sin Storage, igual que `consulta_precios_model`:
// asi la misma lectura que usa la pantalla se puede probar con `node --test`
// y sirve tambien en el PDF, donde no hay sesion ni componentes.
//
// `servicio_aceptacion.js` reexporta todo esto y le agrega lo que si toca la
// red (generar la solicitud y hablar con las Cloud Functions).
// ---------------------------------------------------------------------------

import { fechaAMillis } from "./servicio_historial.js";

export const ACEPTACION_NO_SOLICITADA = "no_solicitada";
export const ACEPTACION_PENDIENTE = "pendiente";
export const ACEPTACION_ACEPTADA = "aceptado";
export const ACEPTACION_RECHAZADA = "rechazado";

/** Dias que vive un enlace de aceptacion antes de caducar. */
export const DIAS_VIGENCIA_ENLACE = 30;

export const MOTIVOS_RECHAZO = [
  { key: "precio", label: "El precio me parece alto" },
  { key: "no_deseo", label: "No deseo realizar el servicio" },
  { key: "modificar_presupuesto", label: "Deseo modificar el presupuesto" },
  { key: "hablar_con_negocio", label: "Necesito hablar con el negocio" },
  { key: "otro", label: "Otro motivo" },
];

const MOTIVOS_VALIDOS = new Set(MOTIVOS_RECHAZO.map((motivo) => motivo.key));

export function etiquetaMotivoRechazo(raw) {
  const clave = String(raw || "").trim();
  return MOTIVOS_RECHAZO.find((motivo) => motivo.key === clave)?.label || "Otro motivo";
}

export function esMotivoRechazoValido(raw) {
  return MOTIVOS_VALIDOS.has(String(raw || "").trim());
}

/**
 * Estado de aceptacion del servicio, normalizado.
 *
 * Un servicio anterior a esta funcion no tiene el campo y NO es un error: su
 * estado es "no solicitada", que es exactamente la verdad.
 */
export function leerAceptacion(servicio = {}, ahoraMs = Date.now()) {
  const cruda = servicio?.aceptacion;

  if (!cruda || typeof cruda !== "object") {
    return {
      estado: ACEPTACION_NO_SOLICITADA,
      version: 0,
      nombreCliente: "",
      firmaUrl: "",
      firmaStoragePath: "",
      firmaDataUrl: "",
      aceptoCondiciones: false,
      motivoRechazo: "",
      comentarioRechazo: "",
      metodo: "",
      fechaSolicitudMs: 0,
      fechaRespuestaMs: 0,
      enlaceVigente: false,
    };
  }

  const estado = [ACEPTACION_PENDIENTE, ACEPTACION_ACEPTADA, ACEPTACION_RECHAZADA]
    .includes(cruda.estado) ? cruda.estado : ACEPTACION_NO_SOLICITADA;

  const expiraMs = fechaAMillis(servicio?.aceptacionToken?.expiraEn);

  return {
    estado,
    version: Number(cruda.version) || 1,
    nombreCliente: String(cruda.nombreCliente || ""),
    firmaUrl: String(cruda.firmaUrl || ""),
    firmaStoragePath: String(cruda.firmaStoragePath || ""),
    firmaDataUrl: String(cruda.firmaDataUrl || ""),
    aceptoCondiciones: cruda.aceptoCondiciones === true,
    motivoRechazo: String(cruda.motivoRechazo || ""),
    comentarioRechazo: String(cruda.comentarioRechazo || ""),
    metodo: String(cruda.metodo || "firma_digital"),
    fechaSolicitudMs: fechaAMillis(cruda.fechaSolicitud),
    fechaRespuestaMs: fechaAMillis(cruda.fechaRespuesta),
    // El enlace sirve mientras nadie lo haya usado y no haya caducado.
    enlaceVigente: estado === ACEPTACION_PENDIENTE &&
      servicio?.aceptacionToken?.usado !== true &&
      (!expiraMs || expiraMs > ahoraMs),
  };
}

/** Versiones anteriores, de la mas reciente a la mas antigua. */
export function leerHistorialAceptaciones(servicio = {}) {
  const crudo = Array.isArray(servicio?.autorizaciones) ? servicio.autorizaciones : [];
  return crudo
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      version: Number(item.version) || 0,
      estado: item.estado || ACEPTACION_NO_SOLICITADA,
      nombreCliente: String(item.nombreCliente || ""),
      firmaUrl: String(item.firmaUrl || ""),
      motivoRechazo: String(item.motivoRechazo || ""),
      comentarioRechazo: String(item.comentarioRechazo || ""),
      fechaRespuestaMs: fechaAMillis(item.fechaRespuesta),
      fechaSolicitudMs: fechaAMillis(item.fechaSolicitud),
    }))
    .sort((a, b) => b.version - a.version);
}

/**
 * Numero de version que corresponde a una nueva solicitud.
 *
 * Sube SOLO cuando el cliente ya respondio la anterior: eso es una orden nueva
 * que hay que autorizar otra vez. Regenerar el enlace de una solicitud que
 * nadie contesto es reenviar lo mismo, no una version distinta.
 */
export function siguienteVersionAceptacion(aceptacionPrevia) {
  const versionPrevia = Number(aceptacionPrevia?.version) || 0;
  return respuestaRegistrada(aceptacionPrevia) ? versionPrevia + 1 : (versionPrevia || 1);
}

/** El cliente llego a contestar esa version. */
export function respuestaRegistrada(aceptacion) {
  return aceptacion?.estado === ACEPTACION_ACEPTADA || aceptacion?.estado === ACEPTACION_RECHAZADA;
}

/** URL publica que se le comparte al cliente. */
export function construirEnlaceAceptacion(referencia, origen = "", folio = "") {
  const base = String(origen || (typeof window !== "undefined" ? window.location.origin : ""))
    .replace(/\/$/, "");
  if (!folio) return `${base}/aceptar/${referencia}`;
  return `${base}/status/${encodeURIComponent(String(folio).trim())}` +
    `?aceptacion=${encodeURIComponent(referencia)}#aceptacion-cliente`;
}

/** Referencia que viaja en el enlace: negocio, servicio y token. */
export function construirReferencia(negocioId, servicioId, token) {
  return `${negocioId}~${servicioId}~${token}`;
}

/**
 * Parte una referencia. Devuelve `null` si no tiene la forma esperada, para
 * que quien la reciba no tenga que confiar en el texto del enlace.
 */
export function leerReferencia(raw) {
  const partes = String(raw || "").trim().split("~");
  if (partes.length !== 3) return null;

  const [negocioId, servicioId, token] = partes;
  const seguro = (id) => /^[A-Za-z0-9_-]{1,128}$/.test(id);
  if (!seguro(negocioId) || !seguro(servicioId) || !seguro(token) || token.length < 32) {
    return null;
  }
  return { negocioId, servicioId, token };
}
