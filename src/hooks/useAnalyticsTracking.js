import { useEffect, useRef } from "react";
import { doc, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../initializer/firebase";

/**
 * Señales administrativas mínimas de uso de CajaLibre.
 *
 * Firestore NO se usa como Google Analytics. Antes se escribía un documento
 * por cada clic, cada cambio de página, cada salida y cada carga: cientos de
 * escrituras por sesión. Ahora solo se registran dos cosas:
 *
 *   1. Que hubo una sesión (una escritura por sesión y día).
 *   2. Errores de JavaScript, deduplicados por sesión, para salud del sistema.
 *
 * Nunca se registra qué pantalla abrió el usuario, qué botón presionó ni
 * cuánto tiempo estuvo en cada vista: eso es comportamiento privado del
 * negocio y no le corresponde al panel de superadmin.
 *
 * Todo se acumula en UN documento por negocio y día
 * (`negocios/{id}/analitica_eventos/{YYYY-MM-DD}`), nunca uno por evento.
 */

const SESSION_KEY = "cajalibre_analytics_session";
const VERSION_SISTEMA = "2.2";

// Tope de errores distintos reportados por sesión. Evita que una página que
// falla en bucle dispare escrituras sin control.
const MAX_ERRORES_POR_SESION = 5;

function getSessionId() {
  try {
    const current = sessionStorage.getItem(SESSION_KEY);
    if (current) return current;
    const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function cleanText(value, maxLength = 100) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function hashText(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Marca algo como ya reportado en esta sesión; devuelve false si se repite. */
function consumirUnaVez(clave) {
  try {
    if (sessionStorage.getItem(clave)) return false;
    sessionStorage.setItem(clave, "1");
    return true;
  } catch {
    return false;
  }
}

function negocioDe(authInfo) {
  return String(authInfo?.cuentaPrincipalUid || authInfo?.uid || "").trim();
}

function escribirResumen(negocioId, payload) {
  const fecha = new Date().toISOString().slice(0, 10);
  setDoc(
    doc(db, "negocios", negocioId, "analitica_eventos", fecha),
    {
      negocioId,
      cuentaPrincipalUid: negocioId,
      formato: "resumen_diario_v1",
      fecha,
      versionSistema: VERSION_SISTEMA,
      actualizadoEn: serverTimestamp(),
      ...payload,
    },
    { merge: true },
  ).catch(() => {
    // La analitica nunca debe interrumpir el trabajo del usuario.
  });
}

/** Una sola escritura por sesión y día: "este negocio usó CajaLibre hoy". */
function registrarSesion(authInfo) {
  const negocioId = negocioDe(authInfo);
  if (!negocioId) return;

  const sessionId = getSessionId();
  const fecha = new Date().toISOString().slice(0, 10);
  if (!consumirUnaVez(`${SESSION_KEY}_sesion_${fecha}_${sessionId}`)) return;

  const dispositivo = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "")
    ? "movil"
    : "escritorio";

  escribirResumen(negocioId, {
    totales: { sesiones: increment(1) },
    dispositivos: { [dispositivo]: increment(1) },
    sesiones: {
      [hashText(sessionId)]: { sessionId, uid: authInfo.uid },
    },
    usuarios: {
      [hashText(authInfo.uid)]: { uid: authInfo.uid, rol: cleanText(authInfo.rol, 40) },
    },
  });
}

function registrarError(authInfo, datos, contador) {
  const negocioId = negocioDe(authInfo);
  if (!negocioId || contador.current >= MAX_ERRORES_POR_SESION) return;

  const mensaje = cleanText(datos.mensaje, 300);
  const dimensionId = hashText(`${mensaje}|${cleanText(datos.archivo, 160)}`);
  if (!consumirUnaVez(`${SESSION_KEY}_error_${dimensionId}`)) return;
  contador.current += 1;

  escribirResumen(negocioId, {
    totales: { errores: increment(1) },
    errores: {
      [dimensionId]: {
        mensaje,
        archivo: cleanText(datos.archivo, 200),
        linea: Number(datos.linea) || 0,
        total: increment(1),
        clientAt: new Date().toISOString(),
      },
    },
  });
}

export default function useAnalyticsTracking(authInfo) {
  const authRef = useRef(authInfo);
  const erroresEnSesion = useRef(0);

  useEffect(() => {
    authRef.current = authInfo;
  }, [authInfo]);

  useEffect(() => {
    if (!authInfo?.uid) return;
    registrarSesion(authInfo);
  }, [authInfo]);

  useEffect(() => {
    const onError = (event) => {
      if (!authRef.current?.uid) return;
      registrarError(authRef.current, {
        mensaje: event.message || "Error de JavaScript",
        archivo: event.filename,
        linea: event.lineno,
      }, erroresEnSesion);
    };

    const onRejection = (event) => {
      if (!authRef.current?.uid) return;
      const reason = event.reason;
      registrarError(authRef.current, {
        mensaje: reason?.message || reason || "Promesa rechazada",
      }, erroresEnSesion);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}
