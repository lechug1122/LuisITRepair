import { useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../initializer/firebase";
import { readTenantContext } from "../js/services/tenant";

const HEARTBEAT_MS = 30000;

// La presencia se escribia cada 30 s por usuario: con cientos de usuarios eso
// son cientos de miles de escrituras diarias solo para saber quien esta en
// linea. Ahora `lastActive` se sella como maximo una vez cada 6 horas, que es
// la resolucion real que necesita el panel de superadmin (dias sin actividad).
const ACTIVIDAD_THROTTLE_MS = 6 * 60 * 60 * 1000;
const ACTIVIDAD_KEY = "cajalibre_actividad_sellada";

function debeSellarActividad(uid) {
  const clave = `${ACTIVIDAD_KEY}_${uid}`;
  try {
    const ultimo = Number(window.localStorage.getItem(clave) || 0);
    if (Date.now() - ultimo < ACTIVIDAD_THROTTLE_MS) return false;
    window.localStorage.setItem(clave, String(Date.now()));
    return true;
  } catch {
    // Sin almacenamiento no se puede limitar la frecuencia: mejor no escribir
    // que escribir en cada carga.
    return false;
  }
}

/**
 * Materializa la ultima actividad del negocio en su propio documento.
 *
 * Es el unico dato de uso que consume el panel de superadmin, y evita tener
 * que leer `autorizados` completo para saber si un negocio sigue vivo. No se
 * crea coleccion nueva: son dos campos en un documento que ya existe.
 */
async function sellarActividad(uid) {
  if (!debeSellarActividad(uid)) return;
  const marca = serverTimestamp();
  await updateDoc(doc(db, "autorizados", uid), { lastActive: marca }).catch(() => {});

  const negocioId = String(readTenantContext()?.negocioId || "").trim();
  if (!negocioId) return;
  await setDoc(
    doc(db, "negocios", negocioId),
    { ultimaActividad: marca, ultimoAcceso: marca },
    { merge: true },
  ).catch(() => {});
}

export default function usePresenciaEmpleado() {
  const uidRef = useRef("");

  useEffect(() => {
    let heartbeatId = null;

    const marcarPresencia = async (uid, online) => {
      if (!uid) return;
      // `lastActive` va aparte y con throttle: aqui solo se refresca la
      // bandera de presencia en vivo.
      if (online) sellarActividad(uid);
      try {
        await updateDoc(doc(db, "autorizados", uid), { online });
      } catch (error) {
        console.warn(
          `[presencia] No se pudo marcar ${online ? "online" : "offline"}:`,
          error?.code || error,
        );
      }
    };

    const stopHeartbeat = () => {
      if (heartbeatId) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }
    };

    const marcarOfflineBestEffort = () => {
      const uid = uidRef.current;
      if (!uid) return;
      updateDoc(doc(db, "autorizados", uid), { online: false }).catch(() => {});
    };

    const onVisibilityChange = () => {
      const uid = uidRef.current;
      if (!uid) return;

      if (document.visibilityState === "hidden") {
        marcarOfflineBestEffort();
        return;
      }

      marcarPresencia(uid, true);
    };

    const onPageHide = () => {
      marcarOfflineBestEffort();
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      stopHeartbeat();
      uidRef.current = user?.uid || "";

      if (!user) return;

      const uid = user.uid;
      marcarPresencia(uid, true);

      heartbeatId = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        marcarPresencia(uid, true);
      }, HEARTBEAT_MS);
    });

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onPageHide);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      stopHeartbeat();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onPageHide);
      window.removeEventListener("pagehide", onPageHide);
      marcarOfflineBestEffort();
      unsubAuth();
    };
  }, []);
}

