import { signOut } from "firebase/auth";
import { onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../initializer/firebase.js";
import { toDate } from "./suscripciones.js";
import { getDocRef, readTenantContext } from "./tenant.js";

// ---------------------------------------------------------------------------
// Control de sesiones por dispositivo.
//
// El plan Gratuito permite que cada persona use su cuenta en UN equipo a la
// vez; Premium no tiene limite. La regla es por usuario, nunca por negocio: un
// negocio gratuito con tres empleados puede tener tres equipos encendidos.
//
// Toda la coleccion vive dentro del negocio, donde ya vivian las sesiones:
//
//   negocios/{negocioId}/sesiones_dispositivo/{uid}              -> sesion unica (Gratuito)
//   negocios/{negocioId}/sesiones_dispositivo/{uid}__{deviceId}  -> sesion por equipo (Premium)
//
// El documento con el uid a secas es la pieza clave: al ser UNO solo por
// persona, reclamarlo dentro de una transaccion convierte "quien se queda con
// la sesion" en una operacion atomica. Dos equipos que entran en el mismo
// instante no pueden quedar autorizados los dos.
// ---------------------------------------------------------------------------

const DEVICE_SESSION_COLLECTION = "sesiones_dispositivo";
const DEVICE_ID_STORAGE_KEY = "cajalibre_device_id";
// Clave que usaban las versiones anteriores. Se hereda para que un navegador
// que ya trabajaba con CajaLibre conserve su identidad: si se le generara un
// id nuevo, su propia recarga pareceria un segundo dispositivo.
const LEGACY_DEVICE_ID_STORAGE_KEY = "current_device_session_id_v1";
const SESSION_NOTICE_KEY = "device_session_notice_v1";

// Una sesion abandonada (navegador cerrado de golpe, equipo apagado, sin
// internet) deja de contar a los 12 minutos. Mientras tanto el usuario nunca
// queda atrapado: siempre puede reemplazarla desde el modal.
export const SESSION_TTL_MS = 12 * 60 * 1000;
// Un latido cada 4 minutos son 3 avisos dentro de la ventana de vigencia, y
// unas 15 escrituras por hora y equipo. Nada se escribe por movimiento del
// mouse ni con la pestana en segundo plano.
export const SESSION_HEARTBEAT_MS = 4 * 60 * 1000;
const LATIDO_MINIMO_MS = 60 * 1000;

export const MOTIVO_CIERRE_REMOTO = "closed_from_another_device";
export const MOTIVO_CIERRE_MANUAL = "manual_logout";

export const AVISO_SESION_REEMPLAZADA = {
  titulo: "Sesion cerrada",
  mensaje:
    "Tu cuenta fue iniciada en otro dispositivo. El plan gratuito permite utilizar cada cuenta en un solo dispositivo a la vez.",
  mostrarPremium: true,
};

function normalizeId(value) {
  return String(value || "").trim();
}

function randomId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Algunos navegadores bloquean crypto en contextos no seguros.
  }
  const bloque = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${bloque()}-${bloque()}`;
}

function toMillis(value) {
  const parsed = toDate(value);
  return parsed ? parsed.getTime() : 0;
}

function detectBrowserName() {
  if (typeof navigator === "undefined") return "Navegador";
  const ua = String(navigator.userAgent || "");
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/")) return "Safari";
  return "Navegador";
}

function detectOsName() {
  if (typeof navigator === "undefined") return "equipo";
  const ua = String(navigator.userAgent || "");
  const platform = String(navigator.platform || "");

  if (/Android/i.test(ua)) return "Android";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Windows/i.test(platform) || /Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(platform) || /Mac OS/i.test(ua)) return "Mac";
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return "Linux";
  return "equipo";
}

function leerUserAgent() {
  if (typeof navigator === "undefined") return "";
  return String(navigator.userAgent || "").slice(0, 300);
}

let deviceIdEnMemoria = "";

/**
 * Identificador estable del navegador. Se crea una sola vez y sobrevive al
 * cierre de sesion, al cierre del navegador y a cualquier recarga: de eso
 * depende que volver a entrar desde el mismo equipo no se lea como un segundo
 * dispositivo.
 */
export function getCurrentDeviceId() {
  if (deviceIdEnMemoria) return deviceIdEnMemoria;

  if (typeof window === "undefined") {
    deviceIdEnMemoria = `srv-${randomId()}`;
    return deviceIdEnMemoria;
  }

  try {
    const almacen = window.localStorage;
    const actual = normalizeId(almacen.getItem(DEVICE_ID_STORAGE_KEY));
    if (actual) {
      deviceIdEnMemoria = actual;
      return actual;
    }

    const heredado = normalizeId(almacen.getItem(LEGACY_DEVICE_ID_STORAGE_KEY));
    const definitivo = heredado || `dev-${randomId()}`;
    almacen.setItem(DEVICE_ID_STORAGE_KEY, definitivo);
    deviceIdEnMemoria = definitivo;
    return definitivo;
  } catch {
    // Sin almacenamiento el identificador vive en memoria: la pestana se
    // comporta como un equipo estable mientras siga abierta.
    deviceIdEnMemoria = `tmp-${randomId()}`;
    return deviceIdEnMemoria;
  }
}

/** Nombre legible del equipo. Nunca se le muestra un identificador al usuario. */
export function getCurrentDeviceLabel() {
  return `${detectBrowserName()} en ${detectOsName()}`;
}

function claimRef(uid, negocioId) {
  return getDocRef(DEVICE_SESSION_COLLECTION, normalizeId(uid), normalizeId(negocioId));
}

function deviceRef(uid, negocioId, deviceId = getCurrentDeviceId()) {
  return getDocRef(
    DEVICE_SESSION_COLLECTION,
    `${normalizeId(uid)}__${normalizeId(deviceId)}`,
    normalizeId(negocioId),
  );
}

function datosBase(uid, negocioId, deviceId) {
  return {
    uid: normalizeId(uid),
    negocioId: normalizeId(negocioId),
    cuentaPrincipalUid: normalizeId(negocioId),
    deviceId: normalizeId(deviceId),
    deviceLabel: getCurrentDeviceLabel(),
    userAgent: leerUserAgent(),
  };
}

/**
 * Una sesion cuenta como ocupada solo si sigue marcada activa y dio senales de
 * vida dentro de la ventana de vigencia. Sin esta regla, un equipo apagado
 * dejaria bloqueada la cuenta para siempre.
 */
export function sesionVigente(data, ahoraMs = Date.now()) {
  if (!data || data.activa !== true) return false;
  const ultima = toMillis(data.lastActivity || data.updatedAt || data.createdAt);
  if (!ultima) return false;
  return ahoraMs - ultima <= SESSION_TTL_MS;
}

/**
 * Decision del plan Gratuito, sin tocar la red.
 *
 * - Sin sesion previa, o con una vencida  -> se toma.
 * - Sesion del mismo equipo               -> se refresca (recargar no abre otra).
 * - Sesion vigente de otro equipo         -> se rechaza, salvo `forzar`.
 *
 * Un registro sin equipo identificado se trata como vencido: nunca debe dejar
 * la cuenta bloqueada sin que se pueda saber de quien era.
 */
export function decidirSesionUnica({
  previo = null,
  deviceId = "",
  forzar = false,
  ahoraMs = Date.now(),
} = {}) {
  const equipo = normalizeId(deviceId);
  const anterior = previo ? normalizeId(previo.deviceId) : "";
  const mismoDispositivo = Boolean(anterior) && anterior === equipo;
  const ocupadaPorOtro = Boolean(anterior)
    && !mismoDispositivo
    && sesionVigente(previo, ahoraMs);

  if (ocupadaPorOtro && !forzar) {
    return { permitido: false, mismoDispositivo: false, reemplaza: false };
  }

  return { permitido: true, mismoDispositivo, reemplaza: ocupadaPorOtro };
}

/**
 * Reclama la unica sesion permitida por el plan Gratuito.
 *
 * Todo ocurre dentro de una transaccion sobre un unico documento, que es lo
 * que vuelve imposible la carrera "dos equipos entran a la vez y los dos
 * quedan autorizados": el segundo siempre lee lo que escribio el primero.
 */
export async function reclamarSesionUnica({ uid = "", negocioId = "", forzar = false } = {}) {
  const safeUid = normalizeId(uid);
  const safeNegocioId = normalizeId(negocioId);
  const deviceId = getCurrentDeviceId();

  if (!safeUid || !safeNegocioId) {
    return { permitido: true, controlado: false, deviceId, sessionId: "" };
  }

  const referencia = claimRef(safeUid, safeNegocioId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(referencia);
    const previo = snapshot.exists() ? snapshot.data() || {} : null;
    const decision = decidirSesionUnica({ previo, deviceId, forzar });
    const mismoDispositivo = decision.mismoDispositivo;

    if (!decision.permitido) {
      return {
        permitido: false,
        controlado: true,
        deviceId,
        sessionId: "",
        otroDispositivo: {
          etiqueta: String(previo.deviceLabel || "").trim() || "Otro equipo",
          ultimaActividad: toDate(previo.lastActivity) || toDate(previo.updatedAt) || null,
        },
      };
    }

    // El mismo equipo conserva su sessionId: si cambiara en cada recarga, su
    // propio listener leeria el cambio como una expulsion.
    const sessionId = mismoDispositivo && normalizeId(previo.sessionId)
      ? normalizeId(previo.sessionId)
      : randomId();

    transaction.set(referencia, {
      ...datosBase(safeUid, safeNegocioId, deviceId),
      sessionId,
      activa: true,
      createdAt: previo?.createdAt || serverTimestamp(),
      lastActivity: serverTimestamp(),
      updatedAt: serverTimestamp(),
      closedAt: null,
      closedReason: "",
    });

    return { permitido: true, controlado: true, deviceId, sessionId };
  });
}

/**
 * Registro de la sesion de este equipo cuando el negocio es Premium. Aqui no
 * se reclama nada ni se invalida a nadie: cada dispositivo tiene su documento
 * y todos pueden convivir.
 */
export async function registrarSesionDeDispositivo({ uid = "", negocioId = "", sessionId = "" } = {}) {
  const safeUid = normalizeId(uid);
  const safeNegocioId = normalizeId(negocioId);
  const deviceId = getCurrentDeviceId();

  if (!safeUid || !safeNegocioId) {
    return { permitido: true, controlado: false, deviceId, sessionId: "" };
  }

  const sesion = normalizeId(sessionId) || randomId();

  await setDoc(
    deviceRef(safeUid, safeNegocioId, deviceId),
    {
      ...datosBase(safeUid, safeNegocioId, deviceId),
      sessionId: sesion,
      activa: true,
      createdAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
      updatedAt: serverTimestamp(),
      closedAt: null,
      closedReason: "",
    },
    { merge: true },
  );

  return { permitido: true, controlado: false, deviceId, sessionId: sesion };
}

async function latirSesionUnica(uid, negocioId, sessionId) {
  const deviceId = getCurrentDeviceId();
  const referencia = claimRef(uid, negocioId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(referencia);
    if (!snapshot.exists()) return;

    const data = snapshot.data() || {};
    // Un latido jamas debe revivir una sesion que ya fue reemplazada desde
    // otro equipo: solo se refresca si seguimos siendo su titular.
    if (normalizeId(data.deviceId) !== deviceId) return;
    if (sessionId && normalizeId(data.sessionId) !== normalizeId(sessionId)) return;

    transaction.update(referencia, {
      activa: true,
      lastActivity: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

async function latirSesionDispositivo(uid, negocioId) {
  await setDoc(
    deviceRef(uid, negocioId),
    {
      ...datosBase(uid, negocioId, getCurrentDeviceId()),
      activa: true,
      lastActivity: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Latido periodico. Se detiene con la pestana en segundo plano y se reanuda al
 * volver, con un minimo de un minuto entre escrituras.
 */
export function iniciarLatidoDeSesion({ uid = "", negocioId = "", sessionId = "", esFree = true } = {}) {
  const safeUid = normalizeId(uid);
  const safeNegocioId = normalizeId(negocioId);
  if (!safeUid || !safeNegocioId || typeof window === "undefined") return () => {};

  // El registro inicial acaba de escribirse: el primer latido toca al cumplirse
  // el intervalo, no de inmediato.
  let ultimoLatido = Date.now();

  const latir = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const ahora = Date.now();
    if (ahora - ultimoLatido < LATIDO_MINIMO_MS) return;
    ultimoLatido = ahora;

    const tarea = esFree
      ? latirSesionUnica(safeUid, safeNegocioId, sessionId)
      : latirSesionDispositivo(safeUid, safeNegocioId);

    tarea.catch((error) => {
      console.warn("[sesion-dispositivo] No se pudo refrescar la sesion:", error?.code || error);
    });
  };

  const intervalo = window.setInterval(latir, SESSION_HEARTBEAT_MS);
  const alCambiarVisibilidad = () => {
    if (document.visibilityState === "visible") latir();
  };

  document.addEventListener("visibilitychange", alCambiarVisibilidad);

  // No se cierra la sesion en `beforeunload` ni en `pagehide`: esos eventos
  // tambien ocurren al recargar o al cambiar de pestana, y cerrar ahi
  // convertiria una recarga en una salida. De las sesiones abandonadas se
  // encarga la vigencia por tiempo.
  return () => {
    window.clearInterval(intervalo);
    document.removeEventListener("visibilitychange", alCambiarVisibilidad);
  };
}

/**
 * Escucha la sesion de este equipo en tiempo real. Si otro dispositivo toma la
 * cuenta, o si la sesion se cierra desde fuera, avisa para salir del sistema.
 */
export function escucharSesionActual({
  uid = "",
  negocioId = "",
  sessionId = "",
  esFree = true,
  onInvalida,
  onError,
} = {}) {
  const safeUid = normalizeId(uid);
  const safeNegocioId = normalizeId(negocioId);
  if (!safeUid || !safeNegocioId) return () => {};

  const deviceId = getCurrentDeviceId();
  const referencia = esFree
    ? claimRef(safeUid, safeNegocioId)
    : deviceRef(safeUid, safeNegocioId, deviceId);

  return onSnapshot(
    referencia,
    (snapshot) => {
      // Una escritura propia todavia sin confirmar no prueba nada.
      if (snapshot.metadata?.hasPendingWrites) return;
      if (!snapshot.exists()) return;

      const data = snapshot.data() || {};
      const reemplazada = esFree && (
        normalizeId(data.deviceId) !== deviceId ||
        (Boolean(sessionId) && normalizeId(data.sessionId) !== normalizeId(sessionId))
      );
      // Una sesion cerrada por su propio usuario (salir del sistema) no expulsa
      // a nadie; solo el cierre pedido desde otro equipo.
      const cerradaDesdeOtroEquipo = data.activa === false
        && normalizeId(data.closedReason) === MOTIVO_CIERRE_REMOTO;

      if (reemplazada || cerradaDesdeOtroEquipo) onInvalida?.();
    },
    (error) => {
      onError?.(error);
    },
  );
}

/**
 * Cierre de sesion normal: marca como inactiva la sesion de ESTE equipo.
 * Nunca toca las sesiones de los demas dispositivos, que en Premium siguen
 * abiertas con total normalidad.
 */
export async function liberarSesionDelDispositivo(uid = "", negocioId = "") {
  const safeUid = normalizeId(uid);
  const contexto = readTenantContext();
  const safeNegocioId = normalizeId(negocioId)
    || normalizeId(contexto.negocioId)
    || normalizeId(contexto.cuentaPrincipalUid);

  if (!safeUid || !safeNegocioId) return;

  const deviceId = getCurrentDeviceId();
  const cierre = {
    activa: false,
    closedAt: serverTimestamp(),
    closedReason: MOTIVO_CIERRE_MANUAL,
    updatedAt: serverTimestamp(),
  };

  // Se liberan las dos formas de sesion sin consultar el plan: salir del
  // sistema debe funcionar igual aunque el negocio haya cambiado de plan
  // mientras la pantalla estaba abierta.
  await Promise.all([
    runTransaction(db, async (transaction) => {
      const referencia = claimRef(safeUid, safeNegocioId);
      const snapshot = await transaction.get(referencia);
      if (!snapshot.exists()) return;
      // Si la sesion ya es de otro equipo, no es nuestra para cerrarla.
      if (normalizeId((snapshot.data() || {}).deviceId) !== deviceId) return;
      transaction.update(referencia, cierre);
    }).catch(() => {}),
    setDoc(
      deviceRef(safeUid, safeNegocioId, deviceId),
      { ...datosBase(safeUid, safeNegocioId, deviceId), ...cierre },
      { merge: true },
    ).catch(() => {}),
  ]);
}

export function guardarAvisoSesion(aviso) {
  if (typeof window === "undefined" || !aviso) return;
  try {
    window.sessionStorage.setItem(SESSION_NOTICE_KEY, JSON.stringify(aviso));
  } catch {
    // Sin almacenamiento el aviso se pierde, pero la salida sigue funcionando.
  }
}

/**
 * Lee y descarta el aviso pendiente para la pantalla de inicio de sesion.
 * Devuelve un objeto `{ titulo, mensaje, mostrarPremium }` o null.
 */
export function consumeDeviceConflictMessage() {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.sessionStorage.getItem(SESSION_NOTICE_KEY);
    window.sessionStorage.removeItem(SESSION_NOTICE_KEY);
    if (!crudo) return null;

    const aviso = JSON.parse(crudo);
    const mensaje = String(aviso?.mensaje || "").trim();
    if (!mensaje) return null;

    return {
      titulo: String(aviso?.titulo || "Sesion cerrada").trim(),
      mensaje,
      mostrarPremium: aviso?.mostrarPremium === true,
    };
  } catch {
    return null;
  }
}

/** Sale de Firebase Auth dejando listo el aviso que vera la pantalla de login. */
export async function cerrarSesionPorReemplazo(aviso = AVISO_SESION_REEMPLAZADA) {
  guardarAvisoSesion(aviso);
  await signOut(auth).catch(() => {});
}
