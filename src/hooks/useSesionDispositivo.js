import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../initializer/firebase";
import { PREMIUM_ACTIVE, PREMIUM_FREE } from "./useAutorizacionActual";
import {
  cerrarSesionPorReemplazo,
  escucharSesionActual,
  iniciarLatidoDeSesion,
  reclamarSesionUnica,
  registrarSesionDeDispositivo,
} from "../js/services/device_sessions";
import { RUTA_LOGIN } from "../js/services/ruta_sesion";

function normalizeId(value) {
  return String(value || "").trim();
}

/**
 * Control de sesiones por dispositivo, montado una sola vez dentro del layout
 * privado.
 *
 * Se apoya por completo en el estado que ya resolvio `useAutorizacionActual`:
 * no vuelve a consultar el perfil, el negocio ni el plan. Mientras el plan sea
 * "loading" no hace absolutamente nada, porque tratar un plan desconocido como
 * Gratuito bloquearia por error a un negocio Premium.
 *
 * Ante cualquier fallo de Firestore el acceso se concede: este control limita
 * equipos simultaneos, jamas debe dejar fuera a quien si tiene derecho a
 * entrar.
 */
export default function useSesionDispositivo(authInfo = {}) {
  const {
    loading,
    uid,
    negocioId,
    cuentaPrincipalUid,
    superAdmin,
    premiumState,
  } = authInfo;

  const usuarioId = normalizeId(uid);
  const negocio = normalizeId(negocioId || cuentaPrincipalUid);

  const [verificando, setVerificando] = useState(true);
  const [conflicto, setConflicto] = useState(null);
  const [intento, setIntento] = useState(0);
  // Ultimo plan confirmado: null mientras no se sepa ninguno.
  const [planEsFree, setPlanEsFree] = useState(null);
  const expulsadoRef = useRef(false);
  const planUidRef = useRef("");

  // El plan queda retenido una vez confirmado. Sin esto, cualquier momento
  // pasajero de "todavia no se sabe" -por ejemplo mientras se guarda algo en
  // el negocio- desmontaria la vigilancia y volveria a reclamar la sesion sin
  // que el plan haya cambiado en realidad. Otra cuenta en el mismo navegador
  // parte de cero.
  useEffect(() => {
    const planConocido = premiumState === PREMIUM_FREE || premiumState === PREMIUM_ACTIVE;

    if (planUidRef.current !== usuarioId) {
      planUidRef.current = usuarioId;
      setPlanEsFree(planConocido ? premiumState === PREMIUM_FREE : null);
      return;
    }

    if (!planConocido) return;
    setPlanEsFree(premiumState === PREMIUM_FREE);
  }, [premiumState, usuarioId]);

  const esFree = planEsFree === true;
  const controlActivo = !loading
    && Boolean(usuarioId)
    && Boolean(negocio)
    && superAdmin !== true
    && planEsFree !== null;

  const salirAlLogin = useCallback(() => {
    // Recarga completa: deja limpio cualquier estado local de la aplicacion.
    window.location.replace(RUTA_LOGIN);
  }, []);

  const expulsar = useCallback(async () => {
    if (expulsadoRef.current) return;
    expulsadoRef.current = true;
    await cerrarSesionPorReemplazo();
    salirAlLogin();
  }, [salirAlLogin]);

  useEffect(() => {
    if (!controlActivo) {
      setConflicto(null);
      setVerificando(false);
      return undefined;
    }

    let cancelado = false;
    let detenerListener = null;
    let detenerLatido = null;

    const limpiar = () => {
      if (typeof detenerListener === "function") {
        try {
          detenerListener();
        } catch (error) {
          console.warn("[sesion-dispositivo] No se pudo cerrar el listener:", error?.code || error);
        }
      }
      if (typeof detenerLatido === "function") {
        try {
          detenerLatido();
        } catch (error) {
          console.warn("[sesion-dispositivo] No se pudo detener el latido:", error?.code || error);
        }
      }
      detenerListener = null;
      detenerLatido = null;
    };

    setVerificando(true);

    const iniciar = async () => {
      const resultado = esFree
        ? await reclamarSesionUnica({ uid: usuarioId, negocioId: negocio })
        : await registrarSesionDeDispositivo({ uid: usuarioId, negocioId: negocio });

      if (cancelado) return;

      if (!resultado.permitido) {
        setConflicto(resultado);
        setVerificando(false);
        return;
      }

      setConflicto(null);
      setVerificando(false);

      detenerListener = escucharSesionActual({
        uid: usuarioId,
        negocioId: negocio,
        sessionId: resultado.sessionId,
        esFree,
        onInvalida: () => {
          if (cancelado) return;
          expulsar().catch(() => {});
        },
        onError: (error) => {
          console.warn("[sesion-dispositivo] No se pudo vigilar la sesion:", error?.code || error);
        },
      });

      detenerLatido = iniciarLatidoDeSesion({
        uid: usuarioId,
        negocioId: negocio,
        sessionId: resultado.sessionId,
        esFree,
      });
    };

    iniciar().catch((error) => {
      console.warn("[sesion-dispositivo] No se pudo validar el equipo:", error?.code || error);
      if (cancelado) return;
      setConflicto(null);
      setVerificando(false);
    });

    return () => {
      cancelado = true;
      limpiar();
    };
  }, [controlActivo, esFree, expulsar, negocio, usuarioId, intento]);

  const continuarEnEsteEquipo = useCallback(async () => {
    if (!usuarioId || !negocio) return;
    setVerificando(true);
    try {
      const resultado = await reclamarSesionUnica({
        uid: usuarioId,
        negocioId: negocio,
        forzar: true,
      });
      if (resultado.permitido) {
        setConflicto(null);
        // Vuelve a montar listener y latido sobre la sesion recien tomada.
        setIntento((valor) => valor + 1);
      }
    } catch (error) {
      console.warn("[sesion-dispositivo] No se pudo tomar la sesion:", error?.code || error);
    } finally {
      setVerificando(false);
    }
  }, [negocio, usuarioId]);

  const cancelar = useCallback(async () => {
    // La sesion pertenece al otro equipo: aqui solo se sale sin tocarla.
    await signOut(auth).catch(() => {});
    salirAlLogin();
  }, [salirAlLogin]);

  return useMemo(
    () => ({
      verificando,
      conflicto,
      hayConflicto: Boolean(conflicto),
      continuarEnEsteEquipo,
      cancelar,
    }),
    [cancelar, conflicto, continuarEnEsteEquipo, verificando],
  );
}
