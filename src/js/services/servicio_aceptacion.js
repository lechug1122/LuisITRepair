// ---------------------------------------------------------------------------
// Aceptacion de la orden de servicio por parte del cliente.
//
// DOS COSAS DISTINTAS, A PROPOSITO
//
//   `status`     -> donde va el trabajo (en revision, en reparacion...).
//   `aceptacion` -> si el cliente autorizo la orden.
//
// No se mezclan. Un servicio puede estar "en revision" y tener una aceptacion
// registrada, o estar "en reparacion" con una aceptacion vieja de otra
// version del presupuesto. Lo unico que los conecta es una regla explicita:
// si el servicio estaba ESPERANDO la respuesta, la respuesta lo mueve. Si el
// negocio ya avanzo por otro camino, la firma se registra y el estado no se
// toca (ver `estadoTrasRespuestaCliente`).
//
// VERSIONADO
//
// `aceptacion` guarda la version VIGENTE. Cuando el negocio pide una nueva
// aceptacion (porque cambio el presupuesto), la anterior no se pisa: se
// archiva completa en `autorizaciones[]` y la nueva nace con version + 1.
//
// Se eligio un ARREGLO y no una subcoleccion por dos razones concretas: las
// reglas de Firestore de CajaLibre gobiernan un solo nivel de subcoleccion
// (una bajo el servicio quedaria sin regla), y el numero de versiones de una
// orden es pequeño por naturaleza -- son renegociaciones de presupuesto, no
// un registro de alta frecuencia. Cada entrada archivada ya trae Timestamps
// reales escritos antes por el servidor, asi que meterlas en un arreglo no
// pierde la hora del servidor.
//
// SEGURIDAD DEL ENLACE
//
// El token viaja en el enlace y NUNCA se guarda en claro: en Firestore solo
// queda su SHA-256. Quien vea la base de datos no puede reconstruir el enlace,
// y quien tenga el enlace no puede escribir en Firestore -- responder pasa por
// una Cloud Function que valida el token, la vigencia y que no se haya usado.
// ---------------------------------------------------------------------------

import { getFunctions, httpsCallable } from "firebase/functions";
import { getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

import { db } from "../../initializer/firebase.js";
import { dataBelongsToTenant, getDocRef, resolveTenantId } from "./tenant.js";
import {
  ORIGEN_NEGOCIO,
  estadoAlSolicitarAceptacion,
  normalizarEstadoServicio,
} from "./servicio_estados.js";
import { camposDePasoHistorial } from "./servicios_firestore.js";
import {
  ACEPTACION_PENDIENTE,
  DIAS_VIGENCIA_ENLACE,
  construirEnlaceAceptacion,
  construirReferencia,
  respuestaRegistrada,
  siguienteVersionAceptacion,
} from "./servicio_aceptacion_modelo.js";

// El modelo puro es la fuente; aqui solo se reexporta para que las pantallas
// sigan importando de un unico sitio.
export * from "./servicio_aceptacion_modelo.js";

const REGION = "southamerica-east1";

/** Token de 256 bits. Impredecible incluso conociendo otros enlaces. */
function generarToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binario = "";
  bytes.forEach((byte) => { binario += String.fromCharCode(byte); });
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(texto) {
  const datos = new TextEncoder().encode(texto);
  const resumen = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(resumen))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Prepara una nueva solicitud de aceptacion y devuelve el enlace.
 *
 * El token se genera aqui porque el negocio necesita el valor en claro para
 * armar el enlace; en Firestore solo se guarda su hash. Que el negocio conozca
 * el token de su propia orden no concede nada: ya puede editar ese servicio.
 *
 * Si habia una aceptacion previa, se archiva ANTES de crear la nueva. Jamas se
 * sobrescribe una firma ya registrada.
 */
export async function solicitarAceptacion({ servicioId, usuarioId = "", usuarioNombre = "", origen = "" }) {
  if (!servicioId) throw new Error("No se pudo identificar el servicio.");

  const ref = getDocRef("servicios", servicioId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Servicio no encontrado.");

  const actual = snap.data() || {};
  if (!dataBelongsToTenant(actual)) throw new Error("El servicio pertenece a otra cuenta.");

  const negocioId = resolveTenantId();
  const previa = actual?.aceptacion;
  const versionPrevia = Number(previa?.version) || 0;
  const respondida = respuestaRegistrada(previa);
  const version = siguienteVersionAceptacion(previa);

  const token = generarToken();
  const referencia = construirReferencia(negocioId, servicioId, token);
  const expiraEn = new Date(Date.now() + DIAS_VIGENCIA_ENLACE * 86400000);

  const estadoSiguiente = estadoAlSolicitarAceptacion(actual?.status);
  const cambiaEstado = normalizarEstadoServicio(actual?.status) !== estadoSiguiente;

  const patch = {
    aceptacion: {
      estado: ACEPTACION_PENDIENTE,
      version,
      fechaSolicitud: serverTimestamp(),
      fechaRespuesta: null,
      nombreCliente: "",
      firmaUrl: "",
      firmaStoragePath: "",
      firmaDataUrl: "",
      aceptoCondiciones: false,
      motivoRechazo: "",
      comentarioRechazo: "",
      metodo: "firma_digital",
      solicitadaPorId: String(usuarioId || ""),
      solicitadaPorNombre: String(usuarioNombre || ""),
    },
    aceptacionToken: {
      hash: await sha256Hex(token),
      version,
      creadoEn: serverTimestamp(),
      expiraEn,
      usado: false,
    },
    updatedAt: serverTimestamp(),
  };

  // Archivar la version anterior solo si el cliente llego a responderla. Una
  // solicitud que nadie contesto no es historia, es un enlace que se reemplaza.
  if (respondida && versionPrevia > 0) {
    patch.autorizaciones = [...(Array.isArray(actual.autorizaciones) ? actual.autorizaciones : []), previa];
  }

  if (cambiaEstado) {
    patch.status = estadoSiguiente;
    Object.assign(patch, camposDePasoHistorial({
      estado: estadoSiguiente,
      estadoAnterior: actual?.status,
      origen: ORIGEN_NEGOCIO,
      usuarioId,
      usuarioNombre,
      nota: `Se solicitó la aceptación del cliente (versión ${version})`,
    }));
  }

  await updateDoc(ref, patch);

  return {
    version,
    referencia,
    // La firma vive en la misma vista de seguimiento, junto a las fotos y el
    // comprobante. La ruta /aceptar solo queda como compatibilidad histórica.
    enlace: construirEnlaceAceptacion(referencia, origen, actual.folio),
    esReenvio: !respondida && versionPrevia > 0,
  };
}

/* =========================
   Lado del cliente (enlace publico)
========================= */

function callable(nombre) {
  return httpsCallable(getFunctions(db.app, REGION), nombre);
}

/** Lee la orden que el cliente debe aceptar. No requiere sesion. */
export async function consultarOrdenAceptacion(referencia) {
  const resultado = await callable("consultarOrdenAceptacion")({ referencia: String(referencia || "") });
  return resultado.data || null;
}

/** Registra la respuesta del cliente. No requiere sesion. */
export async function responderOrdenAceptacion(payload) {
  const resultado = await callable("responderOrdenAceptacion")(payload);
  return resultado.data || null;
}
