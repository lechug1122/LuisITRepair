import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyCurrentDeviceSessionHeartbeat,
  closeCurrentDeviceSession,
  closeOtherSessionsAndKeepCurrent,
  ensureCurrentDeviceSessionAccess,
  listenToCurrentDeviceSession,
  signOutCurrentSessionWithMessage,
} from "../js/services/device_sessions";

export default function useSesionDispositivo(authInfo = {}) {
  const {
    loading,
    uid,
    cuentaPrincipalUid,
    superAdmin,
    suscripcionControlada,
    suscripcion,
  } = authInfo;
  const [checking, setChecking] = useState(true);
  const [conflict, setConflict] = useState(null);
  const [validationNonce, setValidationNonce] = useState(0);
  const latestAuthInfoRef = useRef({
    uid,
    cuentaPrincipalUid,
    superAdmin,
    suscripcionControlada,
    suscripcion,
  });
  const aplicaLimite =
    !loading &&
    superAdmin !== true &&
    suscripcionControlada === true &&
    uid &&
    cuentaPrincipalUid &&
    uid === cuentaPrincipalUid;

  useEffect(() => {
    latestAuthInfoRef.current = {
      uid,
      cuentaPrincipalUid,
      superAdmin,
      suscripcionControlada,
      suscripcion,
    };
  }, [cuentaPrincipalUid, superAdmin, suscripcion, suscripcionControlada, uid]);

  useEffect(() => {
    let cancelled = false;
    let stopSessionListener = null;
    let stopHeartbeat = null;

    const cleanUps = () => {
      if (typeof stopSessionListener === "function") {
        try {
          stopSessionListener();
        } catch {
          // noop
        }
      }
      if (typeof stopHeartbeat === "function") {
        try {
          stopHeartbeat();
        } catch {
          // noop
        }
      }
      stopSessionListener = null;
      stopHeartbeat = null;
    };

    const boot = async () => {
      if (loading) {
        setChecking(true);
        return;
      }

      if (!aplicaLimite) {
        cleanUps();
        setConflict(null);
        setChecking(false);
        return;
      }

      setChecking(true);
      const latest = latestAuthInfoRef.current;
      const acceso = await ensureCurrentDeviceSessionAccess({
        uid,
        autorizado: {
          uid: latest.uid,
          cuentaPrincipalUid: latest.cuentaPrincipalUid,
          superAdmin: latest.superAdmin,
          suscripcionControlada: latest.suscripcionControlada,
        },
        suscripcion: latest.suscripcion,
      });

      if (cancelled) return;

      if (!acceso.permitido) {
        cleanUps();
        setConflict(acceso);
        setChecking(false);
        return;
      }

      setConflict(null);
      stopSessionListener = listenToCurrentDeviceSession(
        uid,
        (session) => {
          if (!session || session.activa !== false) return;
          signOutCurrentSessionWithMessage(
            "Tu sesion en este equipo fue cerrada desde otro dispositivo.",
          ).then(() => {
            window.location.assign("/login");
          });
        },
        () => {},
      );
      stopHeartbeat = applyCurrentDeviceSessionHeartbeat(uid);
      setChecking(false);
    };

    boot().catch((error) => {
      console.warn("[sesion-dispositivo] No se pudo validar el limite de equipos:", error?.code || error);
      if (!cancelled) {
        setConflict(null);
        setChecking(false);
      }
    });

    return () => {
      cancelled = true;
      cleanUps();
    };
  }, [aplicaLimite, loading, uid, validationNonce]);

  const api = useMemo(() => {
    return {
      checking,
      aplicaLimite,
      conflicto: conflict,
      resolverConflicto: async () => {
        if (!aplicaLimite || !uid) return;
        setChecking(true);
        try {
          await closeOtherSessionsAndKeepCurrent({
            uid,
            autorizado: {
              uid,
              cuentaPrincipalUid,
              superAdmin,
              suscripcionControlada,
            },
          });
          const acceso = await ensureCurrentDeviceSessionAccess({
            uid,
            autorizado: {
              uid,
              cuentaPrincipalUid,
              superAdmin,
              suscripcionControlada,
            },
            suscripcion,
          });
          setConflict(acceso.permitido ? null : acceso);
          if (acceso.permitido) {
            setValidationNonce((value) => value + 1);
          }
        } finally {
          setChecking(false);
        }
      },
      salir: async () => {
        if (uid) {
          await closeCurrentDeviceSession(uid, "manual_exit").catch(() => {});
        }
        await signOutCurrentSessionWithMessage("");
        window.location.assign("/login");
      },
    };
  }, [aplicaLimite, checking, conflict, cuentaPrincipalUid, superAdmin, suscripcion, suscripcionControlada, uid]);

  return api;
}
