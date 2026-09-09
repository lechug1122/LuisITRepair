import { useCallback, useEffect, useState } from "react";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../initializer/firebase";
import {
  esPromoPremiumElegible,
  esTitularDelNegocio,
  siguienteEstadoPromo,
} from "../js/services/premium_promo_schedule";

// Margen tras terminar sesion, negocio y permisos. Evita el parpadeo
// "loading -> modal -> desaparece" al entrar al sistema.
const RETRASO_MS = 2000;

// Una sola aparicion por sesion del navegador, aunque se cambie de ruta y el
// layout vuelva a montar el componente.
const mostradoEnSesion = new Set();

/**
 * Concentra permisos, estado Premium, frecuencia y almacenamiento del aviso de
 * planes. El componente visual solo recibe `abierto`, `cerrar` y el destino de
 * la llamada a la accion.
 *
 * El contador vive en `autorizados/{uid}.promoPremium`, el documento que ya
 * describe a cada usuario, para que el limite semanal se respete aunque el
 * administrador entre desde otro dispositivo.
 */
export default function usePremiumPromo(authInfo, { bloqueado = false } = {}) {
  const [visible, setVisible] = useState(false);
  const elegible = esPromoPremiumElegible(authInfo);
  const uid = String(authInfo?.uid || "").trim();
  // Solo el titular puede contratar Premium; un administrador empleado llega a
  // configuracion, que es hasta donde le permiten las rutas actuales.
  const destinoPremium = esTitularDelNegocio(authInfo)
    ? "/configuracion/mi-suscripcion"
    : "/configuracion";

  useEffect(() => {
    if (!elegible || bloqueado || !uid || mostradoEnSesion.has(uid)) return undefined;

    let cancelado = false;
    const libreParaMostrar = () => document.visibilityState === "visible"
      && !document.querySelector('[role="dialog"], [aria-modal="true"], .modal.show');

    const timer = window.setTimeout(async () => {
      if (cancelado || !libreParaMostrar()) return;
      try {
        // La reserva es una transaccion para que dos pestañas o dos equipos no
        // consuman el mismo cupo semanal a la vez.
        const reservado = await runTransaction(db, async (transaction) => {
          const ref = doc(db, "autorizados", uid);
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists()) return false;
          const siguiente = siguienteEstadoPromo(snapshot.data()?.promoPremium);
          if (!siguiente) return false;
          transaction.update(ref, {
            promoPremium: { ...siguiente, lastShownAt: serverTimestamp() },
          });
          return true;
        });
        if (!reservado) return;
        // El cupo ya se consumio: no volver a intentarlo en esta sesion.
        mostradoEnSesion.add(uid);
        if (!cancelado && libreParaMostrar()) setVisible(true);
      } catch {
        // Sin confirmar el limite compartido entre dispositivos, no interrumpir.
      }
    }, RETRASO_MS);

    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [elegible, bloqueado, uid]);

  const cerrar = useCallback(() => {
    if (uid) mostradoEnSesion.add(uid);
    setVisible(false);
  }, [uid]);

  // `elegible` se reevalua con cada snapshot del negocio: si la cuenta pasa a
  // Premium con el aviso abierto, este se cierra solo.
  return { abierto: visible && elegible && !bloqueado, cerrar, destinoPremium };
}
