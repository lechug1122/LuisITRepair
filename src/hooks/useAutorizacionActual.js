import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../initializer/firebase";
import { migrateLegacyTenantDataOnce } from "../js/services/legacy_tenant_migration";
import { escucharNegocio } from "../js/services/negocios";
import { normalizeAutorizadoData } from "../js/services/autorizacion";
import { normalizarPermisos, tienePermiso } from "../js/services/permisos";
import { resolverAccesoSuscripcion } from "../js/services/suscripciones";
import { clearTenantContext, saveTenantContext } from "../js/services/tenant";
import { ANALYTICS_ALLOWED_EMAIL } from "../js/services/analytics_access";

const AutorizacionContext = createContext(null);

// Estado tri-state de Premium: mientras no se sepa con certeza, "loading".
// Ningun consumidor (publicidad, layout, badges) debe tratar "loading" como
// equivalente a "free" - por eso nunca se expone como booleano puro.
export const PREMIUM_LOADING = "loading";
export const PREMIUM_ACTIVE = "premium";
export const PREMIUM_FREE = "free";

// Acepta Firestore Timestamp, Date o string/ms y devuelve milisegundos (0 si
// no hay valor o es invalido). Centraliza la conversion para que Premium
// nunca dependa de una fecha calculada distinto en cada lugar del codigo.
function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

/**
 * Fuente central UNICA para decidir el acceso Premium. Ante cualquier duda
 * (todavia sin confirmar el documento del negocio) devuelve "loading", nunca
 * "free" - asi ningun consumidor puede activar publicidad por error mientras
 * el plan real todavia no se conoce.
 *
 * El derecho de acceso depende de `premiumUntil` (vigente > ahora), NO del
 * estado crudo de la suscripcion: "cancelled" solo significa que no habra
 * proximo cobro, no que el periodo ya pagado deba perderse antes de tiempo.
 */
function resolvePremiumAccess(negocio, statusConfirmado) {
  if (!statusConfirmado || negocio === null) return PREMIUM_LOADING;
  return toMillis(negocio?.premiumUntil) > Date.now() ? PREMIUM_ACTIVE : PREMIUM_FREE;
}

export function AutorizacionProvider({ children }) {
  const value = useAutorizacionListener();
  return createElement(AutorizacionContext.Provider, { value }, children);
}

export default function useAutorizacionActual() {
  const value = useContext(AutorizacionContext);
  if (!value) throw new Error("Falta AutorizacionProvider");
  return value;
}

function useAutorizacionListener() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [activo, setActivo] = useState(false);
  const [permisos, setPermisos] = useState({});
  const [superAdmin, setSuperAdmin] = useState(false);
  const [accesoAnalitica, setAccesoAnalitica] = useState(false);
  const [cuentaPrincipalUid, setCuentaPrincipalUid] = useState("");
  const [suscripcionControlada, setSuscripcionControlada] = useState(false);
  const [accesoPermitido, setAccesoPermitido] = useState(false);
  const [motivoAcceso, setMotivoAcceso] = useState("");
  const [mensajeAcceso, setMensajeAcceso] = useState("");
  const [suscripcion, setSuscripcion] = useState(null);
  const [negocio, setNegocio] = useState(null);
  const [publicidadConfirmada, setPublicidadConfirmada] = useState(false);

  useEffect(() => {
    let unsubDoc = null;
    let unsubSuscripcion = null;
    let unsubNegocio = null;
    let cancelled = false;

    const safeUnsubscribe = (unsubscribe) => {
      if (typeof unsubscribe !== "function") return;
      try {
        unsubscribe();
      } catch (error) {
        console.warn("[autorizacion] No se pudo cerrar un listener:", error?.code || error);
      }
    };

    const resetState = () => {
      clearTenantContext();
      setUid("");
      setNombre("");
      setRol("");
      setActivo(false);
      setPermisos({});
      setSuperAdmin(false);
      setAccesoAnalitica(false);
      setCuentaPrincipalUid("");
      setSuscripcionControlada(false);
      setAccesoPermitido(false);
      setMotivoAcceso("");
      setMensajeAcceso("");
      setSuscripcion(null);
      setNegocio(null);
      setPublicidadConfirmada(false);
      setLoading(false);
    };

    const stopSuscripcion = () => {
      if (unsubSuscripcion) {
        safeUnsubscribe(unsubSuscripcion);
        unsubSuscripcion = null;
      }
    };

    const stopNegocio = () => {
      if (unsubNegocio) {
        safeUnsubscribe(unsubNegocio);
        unsubNegocio = null;
      }
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubDoc) {
        safeUnsubscribe(unsubDoc);
        unsubDoc = null;
      }
      stopSuscripcion();
      stopNegocio();

      if (!user) {
        resetState();
        return;
      }

      setLoading(true);
      setNegocio(null);
      setPublicidadConfirmada(false);
      setUid(user.uid);
      setNombre(user.displayName || String(user.email || "").split("@")[0] || "Usuario");

      let listenerKey = null;
      let currentNegocio = null;
      let currentSuscripcion = null;
      let negocioReady = false;
      let subscriptionReady = false;
      let applyLatest = () => {};

      unsubDoc = onSnapshot(
        doc(db, "autorizados", user.uid),
        (snap) => {
          const data = normalizeAutorizadoData(snap.exists() ? snap.data() : {}, user.uid);
          const nextRol = String(data?.rol || "");
          const nextNombre = String(data?.nombre || "").trim();
          const nextActivo = data.activo;
          const isSystemAdmin = String(user.email || "").trim().toLowerCase() === ANALYTICS_ALLOWED_EMAIL;
          const nextSuperAdmin = isSystemAdmin;
          const nextAccesoAnalitica = isSystemAdmin;
          const nextCuentaPrincipalUid = data.cuentaPrincipalUid;
          const nextNegocioId = data.negocioId || nextCuentaPrincipalUid;
          const nextSuscripcionControlada = data.suscripcionControlada;
          const nextAutorizado = {
            ...data,
            superAdmin: isSystemAdmin,
            accesoAnalitica: isSystemAdmin,
          };

          saveTenantContext({
            uid: user.uid,
            cuentaPrincipalUid: nextCuentaPrincipalUid,
            negocioId: nextNegocioId,
            superAdmin: nextSuperAdmin,
            suscripcionControlada: nextSuscripcionControlada,
          });

          if (nextCuentaPrincipalUid && (nextSuperAdmin || nextSuscripcionControlada !== true)) {
            migrateLegacyTenantDataOnce(nextCuentaPrincipalUid).catch(() => {});
          }

          if (nextNombre) setNombre(nextNombre);
          setRol(nextRol);
          setActivo(nextActivo);
          setPermisos(normalizarPermisos(nextRol, data?.permisos || {}));
          setSuperAdmin(nextSuperAdmin);
          setAccesoAnalitica(nextAccesoAnalitica);
          setCuentaPrincipalUid(nextCuentaPrincipalUid);
          setSuscripcionControlada(nextSuscripcionControlada);

          const resolverYAplicarAcceso = (suscripcionData = null, negocioData = null) => {
            if (cancelled) return;
            const acceso = resolverAccesoSuscripcion({
              uid: user.uid,
              autorizado: nextAutorizado,
              suscripcion: suscripcionData,
              negocio: negocioData,
            });
            setSuscripcion(acceso.suscripcion || null);
            setNegocio(negocioData || null);
            setAccesoPermitido(acceso.permitido);
            setMotivoAcceso(acceso.motivo || "");
            setMensajeAcceso(acceso.mensaje || "");
            setLoading(false);
          };

          const needsSubscription = nextSuscripcionControlada && !nextSuperAdmin && nextCuentaPrincipalUid;
          const nextListenerKey = JSON.stringify([nextNegocioId, nextCuentaPrincipalUid, nextSuperAdmin, Boolean(needsSubscription)]);
          applyLatest = () => {
            if (negocioReady && subscriptionReady) resolverYAplicarAcceso(currentSuscripcion, currentNegocio);
          };
          // Actualizaciones del mismo usuario (por ejemplo presencia) no deben
          // desmontar las paginas ni reiniciar la consulta del plan.
          if (listenerKey === nextListenerKey) {
            applyLatest();
            return;
          }
          listenerKey = nextListenerKey;
          stopSuscripcion();
          stopNegocio();
          currentNegocio = null;
          currentSuscripcion = null;
          negocioReady = !nextNegocioId || nextSuperAdmin;
          subscriptionReady = !needsSubscription;
          setLoading(true);
          setNegocio(null);
          setPublicidadConfirmada(false);
          if (!nextSuperAdmin && nextNegocioId) {
            unsubNegocio = escucharNegocio(nextNegocioId, (data, metadata) => {
              if (cancelled || listenerKey !== nextListenerKey) return;
              currentNegocio = data;
              negocioReady = true;
              setPublicidadConfirmada(Boolean(data) && !metadata?.fromCache && !metadata?.hasPendingWrites);
              applyLatest();
            }, () => {
              if (cancelled || listenerKey !== nextListenerKey) return;
              currentNegocio = null;
              negocioReady = true;
              setPublicidadConfirmada(false);
              applyLatest();
            });
          }
          if (needsSubscription) {
            unsubSuscripcion = onSnapshot(doc(db, "suscripciones", nextCuentaPrincipalUid), (snap) => {
              if (cancelled || listenerKey !== nextListenerKey) return;
              currentSuscripcion = snap.exists() ? snap.data() : null;
              subscriptionReady = true;
              applyLatest();
            }, () => {
              if (cancelled || listenerKey !== nextListenerKey) return;
              currentSuscripcion = null;
              subscriptionReady = true;
              applyLatest();
            });
            return;
          }

          if (nextSuperAdmin || !nextNegocioId) {
            resolverYAplicarAcceso(null, null);
          }
        },
        () => {
          listenerKey = null;
          setNombre(user.displayName || String(user.email || "").split("@")[0] || "");
          setRol("");
          setActivo(false);
          setPermisos({});
          setSuperAdmin(false);
          setAccesoAnalitica(false);
          setCuentaPrincipalUid("");
          setSuscripcionControlada(false);
          setAccesoPermitido(false);
          setMotivoAcceso("");
          setMensajeAcceso("");
          setSuscripcion(null);
          setNegocio(null);
          setPublicidadConfirmada(false);
          stopNegocio();
          stopSuscripcion();
          setLoading(false);
        },
      );
    });

    return () => {
      cancelled = true;
      if (unsubDoc) safeUnsubscribe(unsubDoc);
      stopSuscripcion();
      stopNegocio();
      safeUnsubscribe(unsubAuth);
    };
  }, []);

  // premiumState es la UNICA fuente de verdad: "loading" | "premium" | "free".
  // Nunca se colapsa a booleano antes de saberse con certeza, para que ningun
  // consumidor (publicidad, layout, badges) pueda interpretar "todavia no se
  // sabe" como "es gratuito".
  const statusConfirmado = !loading && publicidadConfirmada;
  const premiumState = resolvePremiumAccess(negocio, statusConfirmado);
  const isPremium = premiumState === PREMIUM_ACTIVE;
  const premiumStatusLoaded = premiumState !== PREMIUM_LOADING;
  const renovacionAutomatica = negocio?.renovacionAutomatica !== false;

  const api = useMemo(() => {
    return {
      loading,
      uid,
      nombre,
      rol,
      activo,
      permisos,
      superAdmin,
      accesoAnalitica,
      cuentaPrincipalUid,
      suscripcionControlada,
      accesoPermitido,
      motivoAcceso,
      mensajeAcceso,
      suscripcion,
      negocio,
      premiumState,
      isPremium,
      premiumUntil: negocio?.premiumUntil || null,
      renovacionAutomatica,
      premiumStatusLoaded,
      // Regla absoluta: publicidad solo puede activarse cuando premiumState
      // es "free" con certeza. Nunca "!isPremium" (undefined/loading tambien
      // pasaria esa prueba).
      // La marca Premium tambien suprime anuncios si la vigencia aun no se
      // ha sincronizado; no concede permisos ni modifica el acceso al plan.
      puedeMostrarPublicidad: premiumState === PREMIUM_FREE && negocio?.premium !== true,
      puede: (key) => tienePermiso(rol, permisos, key),
    };
  }, [
    publicidadConfirmada,
    loading,
    uid,
    nombre,
    rol,
    activo,
    permisos,
    superAdmin,
    accesoAnalitica,
    cuentaPrincipalUid,
    suscripcionControlada,
    accesoPermitido,
    motivoAcceso,
    mensajeAcceso,
    suscripcion,
    negocio,
    premiumState,
    isPremium,
    renovacionAutomatica,
    premiumStatusLoaded,
  ]);

  return api;
}
