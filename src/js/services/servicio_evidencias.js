// ---------------------------------------------------------------------------
// Evidencias fotograficas de un servicio (funcion Premium).
//
// FORMA DE GUARDADO: mapa dentro del documento del servicio, por las mismas
// dos razones que el historial de estados -- `serverTimestamp()` no cabe en un
// arreglo, y dos fotos subiendo a la vez con un arreglo se pisan (la segunda
// escritura reemplaza el arreglo completo). Con mapa, cada foto es su propia
// ruta de campo.
//
// POR QUE NO UNA SUBCOLECCION: las reglas de Firestore de CajaLibre cubren
// `negocios/{negocioId}/{subcoleccion}/{documento}`, es decir UN nivel. Una
// subcoleccion bajo el servicio quedaria sin regla que la gobierne. Mantener
// las evidencias en el documento las deja protegidas por la regla que ya
// existe y, de paso, permite congelarlas cuando el negocio pierde Premium.
//
// POR QUE LA SUBIDA PASA POR UNA CLOUD FUNCTION: el aislamiento por negocio
// depende de `autorizados/{uid}`, porque un empleado tiene un uid distinto del
// id de su negocio. Las reglas de Storage de este proyecto NO pueden leer
// Firestore -- se comprobo con reglas de diagnostico: la misma regla pasa sin
// Firestore y falla con `firestore.exists()`. Antes que abrir el bucket, la
// subida pasa por el servidor, que si puede comprobar negocio, permiso y plan.
// Las reglas de Storage quedan cerradas para los clientes.
//
// LO QUE PASA AL PERDER PREMIUM: nada se borra. Ni el documento, ni los
// archivos de Storage. La regla de Firestore exige que un negocio gratuito
// mande el mapa de evidencias IDENTICO al que ya estaba: no puede agregar,
// pero tampoco puede eliminar por accidente.
// ---------------------------------------------------------------------------

import { getFunctions, httpsCallable } from "firebase/functions";
import { serverTimestamp, updateDoc } from "firebase/firestore";

import { db } from "../../initializer/firebase.js";
import { getDocRef } from "./tenant.js";
import { canUseServiceEvidence } from "./plan_features.js";
import { getTicketPlan } from "./ticket_plan.js";
import { prepararFotoEvidencia } from "./imagen_compresion.js";
import { fechaAMillis } from "./servicio_historial.js";

const REGION = "southamerica-east1";

export const TIPOS_EVIDENCIA = [
  {
    key: "ingreso",
    label: "Evidencia de ingreso",
    corto: "Ingreso",
    descripcion: "Cómo llegó el equipo. Es la que más protege al negocio.",
  },
  {
    key: "diagnostico",
    label: "Evidencia de diagnóstico",
    corto: "Diagnóstico",
    descripcion: "Lo que se encontró al revisar: la falla, el daño, la pieza.",
  },
  {
    key: "reparacion",
    label: "Evidencia de reparación",
    corto: "Reparación",
    descripcion: "El trabajo realizado y las piezas cambiadas.",
  },
  {
    key: "entrega",
    label: "Evidencia de entrega",
    corto: "Entrega",
    descripcion: "Cómo se entregó el equipo al cliente.",
  },
];

const TIPOS_VALIDOS = new Set(TIPOS_EVIDENCIA.map((tipo) => tipo.key));

// Tope por servicio. No es una limitacion comercial: un documento de Firestore
// no puede pasar de 1 MB, y mas de esto vuelve la galeria inmanejable.
export const LIMITE_EVIDENCIAS_POR_SERVICIO = 60;
export const LIMITE_DESCRIPCION = 160;

export function normalizarTipoEvidencia(raw) {
  const limpio = String(raw || "").toLowerCase().trim();
  return TIPOS_VALIDOS.has(limpio) ? limpio : "ingreso";
}

export function etiquetaTipoEvidencia(raw) {
  const tipo = normalizarTipoEvidencia(raw);
  return TIPOS_EVIDENCIA.find((item) => item.key === tipo)?.label || "Evidencia";
}

function normalizarEvidencia(raw, claveFallback = "") {
  if (!raw || typeof raw !== "object") return null;
  const url = String(raw.url || "").trim();
  if (!url) return null;

  return {
    id: String(raw.id || claveFallback || ""),
    url,
    miniaturaUrl: String(raw.miniaturaUrl || raw.url || ""),
    storagePath: String(raw.storagePath || ""),
    miniaturaPath: String(raw.miniaturaPath || ""),
    tipo: normalizarTipoEvidencia(raw.tipo),
    descripcion: String(raw.descripcion || ""),
    fecha: raw.fecha || null,
    fechaMs: fechaAMillis(raw.fecha),
    usuarioId: String(raw.usuarioId || ""),
    usuarioNombre: String(raw.usuarioNombre || ""),
    ancho: Number(raw.ancho) || 0,
    alto: Number(raw.alto) || 0,
    peso: Number(raw.peso) || 0,
  };
}

/**
 * Evidencias del servicio, de la mas antigua a la mas reciente.
 *
 * Acepta el mapa actual y un arreglo, y ademas recoge `observacionesFotos`,
 * el campo que quedo declarado en el detalle desde antes. Hoy siempre esta
 * vacio, pero si algun documento trae algo ahi, se muestra en vez de perderse.
 */
export function leerEvidencias(servicio = {}) {
  const crudo = servicio?.evidencias;
  let lista = [];

  if (Array.isArray(crudo)) {
    lista = crudo.map((item, indice) => normalizarEvidencia(item, `e_legacy_${indice}`));
  } else if (crudo && typeof crudo === "object") {
    lista = Object.entries(crudo).map(([clave, item]) => normalizarEvidencia(item, clave));
  }

  const heredadas = Array.isArray(servicio?.observacionesFotos)
    ? servicio.observacionesFotos.map((item, indice) => normalizarEvidencia(
      { ...item, tipo: item?.tipo || "ingreso", storagePath: item?.storagePath || item?.path },
      `e_obs_${indice}`,
    ))
    : [];

  return [...lista, ...heredadas]
    .filter(Boolean)
    .sort((a, b) => (a.fechaMs - b.fechaMs) || String(a.id).localeCompare(String(b.id)));
}

/** Evidencias agrupadas por categoria, en el orden en que ocurre el servicio. */
export function agruparEvidencias(evidencias = []) {
  return TIPOS_EVIDENCIA.map((tipo) => ({
    ...tipo,
    fotos: evidencias.filter((foto) => foto.tipo === tipo.key),
  }));
}

function exigirPremium() {
  if (!canUseServiceEvidence({ premiumState: getTicketPlan() })) {
    const error = new Error("Las evidencias fotográficas están incluidas en CajaLibre Premium.");
    error.code = "PREMIUM_REQUERIDO";
    throw error;
  }
}

function callable(nombre) {
  return httpsCallable(getFunctions(db.app, REGION), nombre);
}

/** Blob -> base64 sin cabecera, que es lo que espera la Cloud Function. */
function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result || "").replace(/^data:[^,]+,/, ""));
    lector.onerror = () => reject(new Error("No se pudo leer la imagen."));
    lector.readAsDataURL(blob);
  });
}

/**
 * Sube una fotografia y la registra en el servicio.
 *
 * La imagen se optimiza en el navegador (1600 px + miniatura) y se manda al
 * servidor, que comprueba negocio, permiso y plan antes de escribir nada. El
 * cliente nunca toca Storage directamente: ver la nota de arriba.
 */
export async function subirEvidencia({
  servicioId,
  archivo,
  tipo = "ingreso",
  descripcion = "",
  usuarioNombre = "",
}) {
  exigirPremium();
  if (!servicioId) throw new Error("No se pudo identificar el servicio.");

  const preparada = archivo?.blob ? archivo : await prepararFotoEvidencia(archivo);
  const [imagen, miniatura] = await Promise.all([
    blobABase64(preparada.blob),
    blobABase64(preparada.miniatura),
  ]);

  const resultado = await callable("subirEvidenciaServicio")({
    servicioId,
    tipo: normalizarTipoEvidencia(tipo),
    descripcion: String(descripcion || "").trim().slice(0, LIMITE_DESCRIPCION),
    usuarioNombre: String(usuarioNombre || ""),
    ancho: preparada.ancho,
    alto: preparada.alto,
    imagen,
    miniatura,
  });

  return resultado.data || null;
}

/** Elimina una evidencia: el servidor borra el registro y luego los archivos. */
export async function eliminarEvidencia({ servicioId, evidencia }) {
  exigirPremium();
  if (!servicioId || !evidencia?.id) throw new Error("No se pudo identificar la evidencia.");

  await callable("eliminarEvidenciaServicio")({ servicioId, evidenciaId: evidencia.id });
  return true;
}

/**
 * Mensaje util para la persona a partir de un fallo del servidor.
 *
 * Los codigos de Firebase no se le enseñan a nadie: se traducen a algo que
 * diga que hacer. El detalle tecnico se queda en la consola.
 */
export function mensajeErrorEvidencia(error, accion = "subir esta fotografía") {
  const codigo = String(error?.code || "");

  if (codigo.includes("unauthenticated")) return "Tu sesión expiró. Vuelve a entrar e intenta otra vez.";
  if (codigo.includes("permission-denied")) return "No tienes permiso para gestionar este servicio.";
  if (codigo.includes("failed-precondition")) {
    return String(error?.message || "").trim() || `No pudimos ${accion}.`;
  }
  if (codigo.includes("invalid-argument")) return "No pudimos leer esta fotografía. Prueba con otra.";
  if (codigo.includes("deadline-exceeded") || codigo.includes("unavailable")) {
    return "La conexión se interrumpió. Revisa tu internet e intenta otra vez.";
  }
  return `No pudimos ${accion}. Intenta nuevamente.`;
}

/** Cambia solo el texto de una evidencia ya subida. */
export async function actualizarDescripcionEvidencia({ servicioId, evidenciaId, descripcion }) {
  exigirPremium();
  if (!servicioId || !evidenciaId) throw new Error("No se pudo identificar la evidencia.");

  const ref = getDocRef("servicios", servicioId);
  await updateDoc(ref, {
    [`evidencias.${evidenciaId}.descripcion`]: String(descripcion || "").trim().slice(0, LIMITE_DESCRIPCION),
    updatedAt: serverTimestamp(),
  });
  return true;
}
