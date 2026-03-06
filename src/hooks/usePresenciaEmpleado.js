import { useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../initializer/firebase";

const HEARTBEAT_MS = 30000;

export default function usePresenciaEmpleado() {
  const uidRef = useRef("");

  useEffect(() => {
    let heartbeatId = null;

    const marcarPresencia = async (uid, online) => {
      if (!uid) return;
      try {
        await updateDoc(doc(db, "autorizados", uid), {
          online,
          lastActive: serverTimestamp(),
        });
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
      updateDoc(doc(db, "autorizados", uid), {
        online: false,
        lastActive: serverTimestamp(),
      }).catch(() => {});
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

