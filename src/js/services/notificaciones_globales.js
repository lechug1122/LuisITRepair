import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../../initializer/firebase.js";
import { toMillis } from "./plan_features.js";

const functions = getFunctions(undefined, "southamerica-east1");

// ---------------------------------------------------------------------------
// Avisos que CajaLibre envia a los negocios.
//
// Un aviso se guarda UNA sola vez, sin importar a cuantos negocios llegue. A
// quien le toca se resuelve con el campo `audiencia`, una lista de etiquetas:
//
//   "todos"              -> a todos los negocios
//   "plan:free"          -> a los negocios del plan gratuito
//   "plan:premium"       -> a los negocios con Premium vigente
//   "negocio:<id>"       -> a ese negocio en concreto
//
// La lista la resuelve la Cloud Function `listarNotificacionesNegocio` con
// Admin SDK: una consulta a la coleccion raiz combinando etiquetas no siempre
// es demostrable para el motor de reglas cuando el tenant se resuelve desde el
// perfil. El cliente no consulta esta coleccion por su cuenta.
//
// El estado de lectura vive aparte, en un documento por usuario dentro del
// negocio, para no duplicar el aviso miles de veces.
// ---------------------------------------------------------------------------

export const NOTIFICACIONES_COLLECTION = "notificaciones_globales";
const ESTADO_COLLECTION = "notificaciones_estado";

export const TIPOS_NOTIFICACION = [
  { value: "informacion", label: "Información" },
  { value: "importante", label: "Importante" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "nueva_funcion", label: "Nueva función" },
  { value: "promocion", label: "Promoción" },
  { value: "advertencia", label: "Advertencia" },
];

export const PRIORIDADES_NOTIFICACION = [
  { value: "normal", label: "Normal" },
  { value: "importante", label: "Importante" },
];

export const DESTINATARIOS_NOTIFICACION = [
  { value: "todos", label: "Todos los negocios" },
  { value: "plan", label: "Por plan" },
  { value: "negocios", label: "Negocios específicos" },
];

function limpiar(value) {
  return String(value || "").trim();
}

function etiquetaPlan(premiumState) {
  return premiumState === "premium" ? "plan:premium" : "plan:free";
}

/**
 * Etiquetas con las que este negocio puede pedir avisos. Es la misma lista que
 * revisan las reglas, por eso vive en un solo lugar.
 */
export function audienciaDelNegocio({ negocioId = "", premiumState = "free" } = {}) {
  const etiquetas = ["todos", etiquetaPlan(premiumState)];
  const safeNegocioId = limpiar(negocioId);
  if (safeNegocioId) etiquetas.push(`negocio:${safeNegocioId}`);
  return etiquetas;
}

/**
 * Construye la audiencia al crear el aviso. Un aviso por plan se guarda con la
 * etiqueta del plan; uno por negocio, con una etiqueta por cada negocio.
 */
export function construirAudiencia({ destinatarios = "todos", planes = [], negocioIds = [] } = {}) {
  if (destinatarios === "plan") {
    const seleccion = Array.isArray(planes) ? planes.filter(Boolean) : [];
    if (seleccion.length === 0 || seleccion.length >= 2) return ["todos"];
    return seleccion.map((plan) => `plan:${plan}`);
  }

  if (destinatarios === "negocios") {
    const ids = Array.isArray(negocioIds)
      ? [...new Set(negocioIds.map(limpiar).filter(Boolean))]
      : [];
    // Sin negocios elegidos el aviso no debe llegarle a nadie por error.
    return ids.map((id) => `negocio:${id}`);
  }

  return ["todos"];
}

export function normalizeNotificacion(raw = {}, id = "") {
  return {
    id: limpiar(id || raw?.id),
    titulo: limpiar(raw?.titulo),
    mensaje: String(raw?.mensaje || "").trim(),
    tipo: limpiar(raw?.tipo) || "informacion",
    prioridad: raw?.prioridad === "importante" ? "importante" : "normal",
    audiencia: Array.isArray(raw?.audiencia) ? raw.audiencia.map(limpiar).filter(Boolean) : [],
    destinatarios: limpiar(raw?.destinatarios) || "todos",
    planes: Array.isArray(raw?.planes) ? raw.planes : [],
    negocioIds: Array.isArray(raw?.negocioIds) ? raw.negocioIds : [],
    enlaceUrl: limpiar(raw?.enlaceUrl),
    enlaceTexto: limpiar(raw?.enlaceTexto),
    activo: raw?.activo !== false,
    publicarAt: toMillis(raw?.publicarAt),
    expiresAt: toMillis(raw?.expiresAt),
    createdAt: toMillis(raw?.createdAt),
    createdByUid: limpiar(raw?.createdByUid),
  };
}

/**
 * Un aviso se muestra solo dentro de su ventana de vigencia. La comprobacion
 * se hace al leer, asi que empieza y deja de verse sin que nadie lo toque.
 */
export function notificacionVigente(notificacion, ahoraMs = Date.now()) {
  if (!notificacion?.activo) return false;
  if (notificacion.publicarAt && notificacion.publicarAt > ahoraMs) return false;
  if (notificacion.expiresAt && notificacion.expiresAt <= ahoraMs) return false;
  return true;
}

export function etiquetaTipoNotificacion(tipo) {
  return TIPOS_NOTIFICACION.find((item) => item.value === tipo)?.label || "Información";
}

// --- Administracion global --------------------------------------------------

export async function crearNotificacionGlobal(datos = {}, autorUid = "") {
  const audiencia = construirAudiencia(datos);
  if (audiencia.length === 0) {
    throw new Error("Elige al menos un negocio antes de enviar el aviso.");
  }
  if (!limpiar(datos.titulo) || !limpiar(datos.mensaje)) {
    throw new Error("El aviso necesita un titulo y un mensaje.");
  }

  const publicar = datos.publicarAt ? new Date(datos.publicarAt) : null;
  const expira = datos.expiresAt ? new Date(datos.expiresAt) : null;

  const ref = await addDoc(collection(db, NOTIFICACIONES_COLLECTION), {
    titulo: limpiar(datos.titulo),
    mensaje: String(datos.mensaje || "").trim(),
    tipo: limpiar(datos.tipo) || "informacion",
    prioridad: datos.prioridad === "importante" ? "importante" : "normal",
    destinatarios: limpiar(datos.destinatarios) || "todos",
    planes: Array.isArray(datos.planes) ? datos.planes : [],
    negocioIds: Array.isArray(datos.negocioIds) ? datos.negocioIds : [],
    audiencia,
    enlaceUrl: limpiar(datos.enlaceUrl),
    enlaceTexto: limpiar(datos.enlaceTexto),
    activo: true,
    publicarAt: publicar && !Number.isNaN(publicar.getTime()) ? publicar : serverTimestamp(),
    expiresAt: expira && !Number.isNaN(expira.getTime()) ? expira : null,
    createdAt: serverTimestamp(),
    createdByUid: limpiar(autorUid),
  });

  // Quien acaba de publicar (y cualquier pantalla con la copia en memoria)
  // debe ver el aviso ya, sin esperar a que caduque el cache.
  invalidarCacheAvisos();
  return ref.id;
}

export async function cambiarEstadoNotificacion(notificacionId, activo) {
  await updateDoc(doc(db, NOTIFICACIONES_COLLECTION, limpiar(notificacionId)), {
    activo: activo === true,
    updatedAt: serverTimestamp(),
  });
  // Activar o retirar un aviso cambia lo que le toca ver al negocio.
  invalidarCacheAvisos();
}

export async function listarNotificacionesGlobales(tope = 60) {
  const snapshot = await getDocs(
    query(collection(db, NOTIFICACIONES_COLLECTION), orderBy("createdAt", "desc"), limit(tope)),
  );
  return snapshot.docs.map((item) => normalizeNotificacion(item.data(), item.id));
}

// --- Lado del negocio -------------------------------------------------------

// Un aviso de CajaLibre se publica unas cuantas veces al mes, asi que no tiene
// sentido preguntar por el cada minuto. Antes habia un setInterval de 60s por
// pestana abierta: 60 llamadas por hora aunque nadie estuviera mirando, y una
// llamada extra cada vez que el plan pasaba por "loading" y la escucha se
// recreaba.
//
// Ahora hay UN canal por negocio+plan. Todas las escuchas comparten la misma
// respuesta, una consulta reciente se reparte desde memoria y la llamada solo
// sale cuando los datos ya estan viejos.
const CACHE_AVISOS_MS = 10 * 60 * 1000;

// Respaldo por si se publica un aviso con la pantalla abierta. Solo corre con
// la pestana a la vista: en segundo plano no se consulta nada.
const RESPALDO_AVISOS_MS = 12 * 60 * 1000;

// La copia se guarda tambien en el navegador para que recargar la pagina (o
// abrir una segunda pestana, algo normal en una caja) no vuelva a preguntar.
const CACHE_STORAGE_PREFIX = "cajalibre.avisos.";

const canales = new Map();

function claveCanal(negocioId, premiumState) {
  return limpiar(negocioId) + "|" + (premiumState === "premium" ? "premium" : "free");
}

function pestanaVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function leerCacheGuardada(clave) {
  try {
    const crudo = window.localStorage.getItem(CACHE_STORAGE_PREFIX + clave);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos?.crudos) || typeof datos?.traidoEn !== "number") return null;
    return datos;
  } catch {
    // Sin almacenamiento (modo privado, cuota llena) se consulta y ya.
    return null;
  }
}

function guardarCache(clave, crudos, traidoEn) {
  try {
    window.localStorage.setItem(
      CACHE_STORAGE_PREFIX + clave,
      JSON.stringify({ crudos, traidoEn }),
    );
  } catch {
    // Guardar la copia es una mejora, nunca un requisito.
  }
}

/**
 * Los avisos se filtran por su ventana de vigencia al momento de mostrarlos, no
 * al de traerlos: por eso el canal guarda la respuesta cruda y vuelve a
 * resolverla en cada reparto.
 */
function resolverLista(crudos) {
  const ahora = Date.now();
  return crudos
    .map((item) => normalizeNotificacion(item, item?.id))
    .filter((item) => notificacionVigente(item, ahora))
    .sort((a, b) => (b.publicarAt || b.createdAt) - (a.publicarAt || a.createdAt));
}

/**
 * Momento exacto en que la lista visible cambiaria sola: cuando un aviso
 * programado entra en vigor o cuando uno vigente expira. Se calcula en local y
 * sin pedir nada al servidor, para que un aviso programado siga apareciendo a
 * su hora aunque la consulta tenga diez minutos de antiguedad.
 */
function proximoCambioDeVigencia(crudos, ahora = Date.now()) {
  let proximo = 0;
  crudos.forEach((item) => {
    const aviso = normalizeNotificacion(item, item?.id);
    [aviso.publicarAt, aviso.expiresAt].forEach((marca) => {
      if (!marca || marca <= ahora) return;
      if (!proximo || marca < proximo) proximo = marca;
    });
  });
  return proximo;
}

function programarVigencia(canal) {
  window.clearTimeout(canal.timerVigencia);
  canal.timerVigencia = 0;
  // Sin nadie escuchando no hay a quien avisarle: una respuesta que llega
  // despues de cerrar la pantalla no debe dejar un temporizador vivo.
  if (canal.suscriptores.size === 0) return;
  const proximo = proximoCambioDeVigencia(canal.crudos);
  if (!proximo) return;
  const espera = Math.min(proximo - Date.now() + 250, 2147483647);
  if (espera <= 0) return;
  canal.timerVigencia = window.setTimeout(() => repartir(canal), espera);
}

function repartir(canal) {
  const lista = resolverLista(canal.crudos);
  canal.suscriptores.forEach((suscriptor) => suscriptor.onData?.(lista));
  programarVigencia(canal);
}

function avisarError(canal, error) {
  canal.suscriptores.forEach((suscriptor) => suscriptor.onError?.(error));
}

/**
 * Pide los avisos al servidor. Varias escuchas que coinciden en el tiempo
 * comparten la MISMA promesa, asi que reabrir la escucha (cambio de plan,
 * remontaje del layout) ya no se traduce en otra llamada.
 */
function pedirAvisos(canal, { forzar = false } = {}) {
  if (canal.enVuelo) return canal.enVuelo;
  if (!forzar && canal.traidoEn && Date.now() - canal.traidoEn < CACHE_AVISOS_MS) {
    return Promise.resolve();
  }

  const callable = httpsCallable(functions, "listarNotificacionesNegocio");
  canal.enVuelo = callable({ negocioId: canal.negocioId, premiumState: canal.premiumState })
    .then((respuesta) => {
      canal.crudos = Array.isArray(respuesta.data) ? respuesta.data : [];
      canal.traidoEn = Date.now();
      guardarCache(canal.clave, canal.crudos, canal.traidoEn);
      repartir(canal);
    })
    .catch((error) => {
      avisarError(canal, error);
    })
    .finally(() => {
      canal.enVuelo = null;
    });

  return canal.enVuelo;
}

function obtenerCanal(negocioId, premiumState) {
  const clave = claveCanal(negocioId, premiumState);
  const existente = canales.get(clave);
  if (existente) return existente;

  const guardada = leerCacheGuardada(clave);
  const canal = {
    clave,
    negocioId: limpiar(negocioId),
    premiumState: premiumState === "premium" ? "premium" : "free",
    crudos: guardada?.crudos || [],
    traidoEn: guardada?.traidoEn || 0,
    enVuelo: null,
    suscriptores: new Set(),
    timerRespaldo: 0,
    timerVigencia: 0,
    alCambiarVisibilidad: null,
  };
  canales.set(clave, canal);
  return canal;
}

function detenerCanal(canal) {
  window.clearInterval(canal.timerRespaldo);
  window.clearTimeout(canal.timerVigencia);
  canal.timerRespaldo = 0;
  canal.timerVigencia = 0;
  if (canal.alCambiarVisibilidad) {
    document.removeEventListener("visibilitychange", canal.alCambiarVisibilidad);
    canal.alCambiarVisibilidad = null;
  }
  // El canal se queda en el mapa con su copia: si la escucha se reabre en
  // seguida (un remontaje del layout) los avisos ya estan ahi y no se consulta.
}

/**
 * Fuerza una consulta saltandose la copia reciente. Se usa al abrir el panel de
 * notificaciones y despues de publicar un aviso.
 */
export function refrescarNotificacionesDelNegocio(
  { negocioId = "", premiumState = "free" } = {},
  forzar = true,
) {
  if (!limpiar(negocioId)) return Promise.resolve();
  const canal = obtenerCanal(negocioId, premiumState);
  // Sin nadie escuchando no hay a quien entregarle la respuesta.
  if (canal.suscriptores.size === 0) return Promise.resolve();
  return pedirAvisos(canal, { forzar });
}

/** Olvida las copias para que la proxima lectura vaya al servidor. */
export function invalidarCacheAvisos() {
  canales.forEach((canal) => {
    canal.traidoEn = 0;
  });
  try {
    Object.keys(window.localStorage)
      .filter((llave) => llave.startsWith(CACHE_STORAGE_PREFIX))
      .forEach((llave) => window.localStorage.removeItem(llave));
  } catch {
    // Sin almacenamiento no hay copia que limpiar.
  }
}

/**
 * Carga los avisos a traves de Functions. La funcion filtra la audiencia con
 * Admin SDK y evita una consulta raiz que Firestore Rules no puede demostrar.
 *
 * Conserva el nombre y la firma de siempre (escucha + funcion para detenerla);
 * lo que cambio es que por debajo ya no hay un temporizador por escucha, sino
 * un canal compartido con copia reciente.
 */
export function escucharNotificacionesDelNegocio(
  { negocioId = "", premiumState = "free" } = {},
  onData,
  onError,
) {
  if (!limpiar(negocioId)) {
    onData?.([]);
    return () => {};
  }

  const canal = obtenerCanal(negocioId, premiumState);
  const suscriptor = { onData, onError };
  canal.suscriptores.add(suscriptor);

  // Lo que ya se sabe se entrega de inmediato: la campana nunca se queda vacia
  // mientras el servidor responde.
  if (canal.traidoEn) onData?.(resolverLista(canal.crudos));

  if (canal.suscriptores.size === 1) {
    canal.alCambiarVisibilidad = () => {
      // Al volver a la pestana se actualiza solo si la copia ya esta vieja.
      if (pestanaVisible()) pedirAvisos(canal);
    };
    document.addEventListener("visibilitychange", canal.alCambiarVisibilidad);
    canal.timerRespaldo = window.setInterval(() => {
      if (!pestanaVisible()) return;
      pedirAvisos(canal);
    }, RESPALDO_AVISOS_MS);
  }

  pedirAvisos(canal);

  return () => {
    canal.suscriptores.delete(suscriptor);
    if (canal.suscriptores.size === 0) detenerCanal(canal);
  };
}

function estadoRef(negocioId, uid) {
  return doc(db, "negocios", limpiar(negocioId), ESTADO_COLLECTION, limpiar(uid));
}

/** Estado de lectura de UNA persona: un solo documento con la lista de ids. */
export function escucharEstadoNotificaciones({ negocioId = "", uid = "" } = {}, onData, onError) {
  const safeNegocioId = limpiar(negocioId);
  const safeUid = limpiar(uid);
  if (!safeNegocioId || !safeUid) {
    onData?.({ leidas: [], avisadas: [] });
    return () => {};
  }

  return onSnapshot(
    estadoRef(safeNegocioId, safeUid),
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() || {} : {};
      onData?.({
        leidas: Array.isArray(data.leidas) ? data.leidas.map(limpiar) : [],
        avisadas: Array.isArray(data.avisadas) ? data.avisadas.map(limpiar) : [],
      });
    },
    (error) => onError?.(error),
  );
}

async function guardarEstado(negocioId, uid, cambios) {
  await setDoc(
    estadoRef(negocioId, uid),
    {
      uid: limpiar(uid),
      negocioId: limpiar(negocioId),
      cuentaPrincipalUid: limpiar(negocioId),
      ...cambios,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function marcarNotificacionesLeidas({ negocioId = "", uid = "", leidas = [] } = {}) {
  const ids = [...new Set((Array.isArray(leidas) ? leidas : []).map(limpiar).filter(Boolean))];
  if (!limpiar(negocioId) || !limpiar(uid)) return;
  await guardarEstado(negocioId, uid, { leidas: ids });
}

/**
 * Marca un aviso importante como ya presentado, para que su banner no vuelva a
 * aparecer en cada cambio de pantalla.
 */
export async function marcarAvisoPresentado({ negocioId = "", uid = "", avisadas = [] } = {}) {
  const ids = [...new Set((Array.isArray(avisadas) ? avisadas : []).map(limpiar).filter(Boolean))];
  if (!limpiar(negocioId) || !limpiar(uid)) return;
  await guardarEstado(negocioId, uid, { avisadas: ids });
}
