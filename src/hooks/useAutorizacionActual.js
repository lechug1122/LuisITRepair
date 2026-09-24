import { createContext, createElement, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { syncTicketPlan } from "../js/services/ticket_plan.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../initializer/firebase";
import { migrateLegacyTenantDataOnce } from "../js/services/legacy_tenant_migration";
import { escucharNegocio } from "../js/services/negocios";
import { normalizeAutorizadoData } from "../js/services/autorizacion";
import { normalizarPermisos, tienePermiso } from "../js/services/permisos";
import { mensajeDeErrorAcceso, resolverAccesoSuscripcion } from "../js/services/suscripciones";
import { trazaSesionActiva } from "../js/services/ruta_sesion";
import {
  canUseCashClosing,
  canUseCashReconciliation,
  canUseInventoryCount,
  canUseRestaurantActivityPayments,
  canUseAutomaticPaymentPdf,
  canUseRestaurantCookLimit,
  canUseRestaurantReservations,
  canUseServiceTracker,
  canUseTicketEditor,
  esNegocioLegacy,
  showTicketEditorMigrationNotice,
} from "../js/services/plan_features";
import { clearTenantContext, saveTenantContext } from "../js/services/tenant";
import { ANALYTICS_ALLOWED_EMAIL } from "../js/services/analytics_access";

const AutorizacionContext = createContext(null);

// Tiempo maximo que se espera la confirmacion del servidor sobre el negocio.
// Mientras tanto la sesion sigue en "cargando": un negocio que todavia no
// responde jamas debe interpretarse como un usuario sin negocio.
const ESPERA_NEGOCIO_MS = 12000;

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
  if (!statusConfirmado) return PREMIUM_LOADING;
  return toMillis(negocio?.premiumUntil) > Date.now() ? PREMIUM_ACTIVE : PREMIUM_FREE;
}

export function AutorizacionProvider({ children }) {
  const value = useAutorizacionListener();
  useLayoutEffect(() => {
    syncTicketPlan(value.premiumState, toMillis(value.premiumUntil), value.negocioLegacy);
    return () => syncTicketPlan("loading");
  }, [value.premiumState, value.premiumUntil, value.negocioLegacy, value.uid, value.negocioId]);
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
  const [negocioId, setNegocioId] = useState("");
  const [suscripcionControlada, setSuscripcionControlada] = useState(false);
  const [accesoPermitido, setAccesoPermitido] = useState(false);
  const [motivoAcceso, setMotivoAcceso] = useState("");
  const [mensajeAcceso, setMensajeAcceso] = useState("");
  const [errorAcceso, setErrorAcceso] = useState(null);
  const [perfilExiste, setPerfilExiste] = useState(false);
  const [perteneceANegocio, setPerteneceANegocio] = useState(false);
  const [requiereCrearNegocio, setRequiereCrearNegocio] = useState(false);
  const [esTitular, setEsTitular] = useState(false);
  const [suscripcion, setSuscripcion] = useState(null);
  const [negocio, setNegocio] = useState(null);
  const [publicidadConfirmada, setPublicidadConfirmada] = useState(false);
  const [, refreshPremiumClock] = useState(0);
  const premiumExpiresAt = toMillis(negocio?.premiumUntil);

  // La vigencia también vence mientras la pantalla permanece abierta, sin
  // depender de que Firestore emita otro cambio en el documento del negocio.
  useEffect(() => {
    if (premiumExpiresAt <= Date.now()) return undefined;
    let timer;
    const schedule = () => {
      const remaining = premiumExpiresAt - Date.now();
      if (remaining <= 0) {
        refreshPremiumClock((tick) => tick + 1);
        return;
      }
      timer = window.setTimeout(schedule, Math.min(remaining + 10, 2147483647));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [premiumExpiresAt]);

  useEffect(() => {
    let unsubDoc = null;
    let unsubSuscripcion = null;
    let unsubNegocio = null;
    let cancelled = false;
    // Cada cambio de sesion abre una "corrida": los temporizadores de espera de
    // una corrida anterior nunca deben aplicar su resultado sobre la actual.
    let runId = 0;

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
      setNegocioId("");
      setSuscripcionControlada(false);
      setAccesoPermitido(false);
      setMotivoAcceso("");
      setMensajeAcceso("");
      setErrorAcceso(null);
      setPerfilExiste(false);
      setPerteneceANegocio(false);
      setRequiereCrearNegocio(false);
      setEsTitular(false);
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
        runId += 1;
        resetState();
        return;
      }

      runId += 1;
      const corrida = runId;
      setLoading(true);
      setNegocio(null);
      setPublicidadConfirmada(false);
      setUid(user.uid);
      setNombre(user.displayName || String(user.email || "").split("@")[0] || "Usuario");

      let listenerKey = null;
      let currentNegocio = null;
      let currentNegocioError = null;
      let currentSuscripcion = null;
      let negocioReady = false;
      let subscriptionReady = false;
      let perfilResuelto = false;
      let esperaPerfil = null;
      let esperaNegocio = null;
      let applyLatest = () => {};

      const reportarErrorDeCarga = (error, respaldo) => {
        setAccesoPermitido(false);
        setMotivoAcceso("error_carga");
        setMensajeAcceso(mensajeDeErrorAcceso(error, respaldo));
        setErrorAcceso(error);
        setPerteneceANegocio(false);
        setRequiereCrearNegocio(false);
        setPublicidadConfirmada(false);
        setLoading(false);
      };

      const detenerEsperaPerfil = () => {
        if (esperaPerfil) {
          window.clearTimeout(esperaPerfil);
          esperaPerfil = null;
        }
      };

      const iniciarEsperaPerfil = () => {
        if (esperaPerfil) return;
        esperaPerfil = window.setTimeout(() => {
          esperaPerfil = null;
          if (cancelled || corrida !== runId || perfilResuelto) return;
          // El servidor nunca confirmo si el perfil existe: es un problema de
          // conexion, no un usuario nuevo.
          reportarErrorDeCarga(
            Object.assign(new Error("No se pudo confirmar tu perfil de usuario."), {
              code: "unavailable",
            }),
            "No se pudo confirmar tu perfil de usuario.",
          );
        }, ESPERA_NEGOCIO_MS);
      };

      const detenerEsperaNegocio = () => {
        if (esperaNegocio) {
          window.clearTimeout(esperaNegocio);
          esperaNegocio = null;
        }
      };

      const iniciarEsperaNegocio = (claveEspera) => {
        if (esperaNegocio) return;
        esperaNegocio = window.setTimeout(() => {
          esperaNegocio = null;
          if (cancelled || corrida !== runId || listenerKey !== claveEspera || negocioReady) return;
          // Se agoto la espera sin respuesta del servidor: es un problema de
          // conexion, no un negocio inexistente.
          currentNegocio = null;
          currentNegocioError = Object.assign(
            new Error("No se pudo confirmar la informacion de tu negocio."),
            { code: "unavailable" },
          );
          negocioReady = true;
          applyLatest();
        }, ESPERA_NEGOCIO_MS);
      };

      unsubDoc = onSnapshot(
        doc(db, "autorizados", user.uid),
        { includeMetadataChanges: true },
        (snap) => {
          if (cancelled || corrida !== runId) return;

          // Un "no existe" servido por la cache local no prueba nada: puede ser
          // la primera respuesta estando sin conexion. Se espera al servidor
          // antes de declarar que el usuario no tiene perfil.
          if (!snap.exists() && snap.metadata?.fromCache) {
            iniciarEsperaPerfil();
            return;
          }

          detenerEsperaPerfil();
          perfilResuelto = true;

          // Diferenciar "no existe" de "todavia no carga" es la clave del flujo:
          // solo un documento inexistente convierte al usuario en uno nuevo.
          const perfilExiste = snap.exists();
          const data = normalizeAutorizadoData(perfilExiste ? snap.data() : {}, user.uid);
          const nextRol = perfilExiste ? String(data?.rol || "") : "";
          const nextNombre = perfilExiste ? String(data?.nombre || "").trim() : "";
          const nextActivo = perfilExiste ? data.activo : false;
          const isSystemAdmin = String(user.email || "").trim().toLowerCase() === ANALYTICS_ALLOWED_EMAIL;
          const nextSuperAdmin = isSystemAdmin;
          const nextAccesoAnalitica = isSystemAdmin;
          const nextCuentaPrincipalUid = perfilExiste ? data.cuentaPrincipalUid : "";
          const nextNegocioId = perfilExiste ? (data.negocioId || nextCuentaPrincipalUid) : "";
          const nextSuscripcionControlada = perfilExiste ? data.suscripcionControlada : false;
          const nextAutorizado = {
            ...data,
            superAdmin: isSystemAdmin,
            accesoAnalitica: isSystemAdmin,
          };

          // Sin perfil no hay negocio que resolver: no se toca el contexto de
          // tenant para no apuntar consultas al negocio equivocado.
          if (perfilExiste) {
            saveTenantContext({
              uid: user.uid,
              cuentaPrincipalUid: nextCuentaPrincipalUid,
              negocioId: nextNegocioId,
              superAdmin: nextSuperAdmin,
              suscripcionControlada: nextSuscripcionControlada,
            });
          }

          if (perfilExiste && nextCuentaPrincipalUid && (nextSuperAdmin || nextSuscripcionControlada !== true)) {
            migrateLegacyTenantDataOnce(nextCuentaPrincipalUid).catch(() => {});
          }

          if (nextNombre) setNombre(nextNombre);
          setRol(nextRol);
          setActivo(nextActivo);
          setPermisos(perfilExiste ? normalizarPermisos(nextRol, data?.permisos || {}) : {});
          setSuperAdmin(nextSuperAdmin);
          setAccesoAnalitica(nextAccesoAnalitica);
          setCuentaPrincipalUid(nextCuentaPrincipalUid);
          setNegocioId(nextNegocioId);
          setSuscripcionControlada(nextSuscripcionControlada);
          setErrorAcceso(null);
          setPerfilExiste(perfilExiste);

          const resolverYAplicarAcceso = (suscripcionData = null, negocioData = null, errorNegocio = null) => {
            if (cancelled || corrida !== runId) return;
            const acceso = resolverAccesoSuscripcion({
              uid: user.uid,
              autorizado: nextAutorizado,
              suscripcion: suscripcionData,
              negocio: negocioData,
              perfilExiste,
              negocioError: errorNegocio,
            });
            setSuscripcion(acceso.suscripcion || null);
            setNegocio(negocioData || null);
            setAccesoPermitido(acceso.permitido);
            setMotivoAcceso(acceso.motivo || "");
            setMensajeAcceso(acceso.mensaje || "");
            setErrorAcceso(acceso.esError ? (acceso.error || new Error(acceso.mensaje)) : null);
            setPerteneceANegocio(acceso.perteneceANegocio === true);
            setRequiereCrearNegocio(acceso.requiereCrearNegocio === true);
            setEsTitular(acceso.esTitular === true);
            setLoading(false);

            // Traza de sesion: en desarrollo siempre, y en produccion cuando se
            // abre la app con ?debugSesion=1. Muestra como quedo resuelta la
            // sesion ANTES de que las guardias decidan la ruta.
            if (trazaSesionActiva()) {
              console.info("[AUTH/NEGOCIO]", {
                uid: user.uid,
                email: user.email,
                perfilExiste,
                negocioId: nextNegocioId,
                negocioCargado: Boolean(negocioData),
                rol: nextRol,
                motivo: acceso.motivo,
                permitido: acceso.permitido,
                esTitular: acceso.esTitular,
                perteneceANegocio: acceso.perteneceANegocio,
                requiereCrearNegocio: acceso.requiereCrearNegocio,
                pathname: typeof window !== "undefined" ? window.location.pathname : "",
              });
            }
          };

          const needsNegocio = perfilExiste && Boolean(nextNegocioId);
          const needsSubscription = perfilExiste
            && nextSuscripcionControlada
            && !nextSuperAdmin
            && Boolean(nextCuentaPrincipalUid);
          const nextListenerKey = JSON.stringify([
            perfilExiste,
            nextNegocioId,
            nextCuentaPrincipalUid,
            nextSuperAdmin,
            Boolean(needsSubscription),
          ]);
          applyLatest = () => {
            if (negocioReady && subscriptionReady) {
              resolverYAplicarAcceso(currentSuscripcion, currentNegocio, currentNegocioError);
            }
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
          detenerEsperaNegocio();
          currentNegocio = null;
          currentNegocioError = null;
          currentSuscripcion = null;
          negocioReady = !needsNegocio;
          subscriptionReady = !needsSubscription;
          setLoading(true);
          setNegocio(null);
          setPublicidadConfirmada(false);
          if (needsNegocio) {
            const claveEspera = nextListenerKey;
            unsubNegocio = escucharNegocio(nextNegocioId, (data, metadata) => {
              if (cancelled || corrida !== runId || listenerKey !== claveEspera) return;
              // Un "no existe" servido por la cache no prueba nada: puede ser
              // la primera respuesta estando sin conexion. Se sigue esperando.
              if (!data && metadata?.fromCache) {
                iniciarEsperaNegocio(claveEspera);
                return;
              }
              detenerEsperaNegocio();
              currentNegocio = data;
              currentNegocioError = null;
              negocioReady = true;
              setPublicidadConfirmada(!metadata?.fromCache && !metadata?.hasPendingWrites);
              applyLatest();
            }, (error) => {
              if (cancelled || corrida !== runId || listenerKey !== claveEspera) return;
              // Error real de Firestore: se propaga como error, nunca como
              // "este usuario todavia no tiene negocio".
              console.error("[autorizacion] No se pudo escuchar el negocio:", error?.code || error);
              detenerEsperaNegocio();
              currentNegocio = null;
              currentNegocioError = error;
              negocioReady = true;
              setPublicidadConfirmada(false);
              applyLatest();
            });
          }
          if (needsSubscription) {
            unsubSuscripcion = onSnapshot(doc(db, "suscripciones", nextCuentaPrincipalUid), (snap) => {
              if (cancelled || corrida !== runId || listenerKey !== nextListenerKey) return;
              currentSuscripcion = snap.exists() ? snap.data() : null;
              subscriptionReady = true;
              applyLatest();
            }, (error) => {
              if (cancelled || corrida !== runId || listenerKey !== nextListenerKey) return;
              console.warn("[autorizacion] No se pudo leer la suscripcion:", error?.code || error);
              currentSuscripcion = null;
              subscriptionReady = true;
              applyLatest();
            });
          }

          applyLatest();
        },
        (error) => {
          if (cancelled || corrida !== runId) return;
          // El perfil no se pudo leer. Se reporta como error real: nunca se
          // degrada a "usuario sin negocio".
          console.error("[autorizacion] No se pudo leer el perfil del usuario:", error?.code || error);
          listenerKey = null;
          detenerEsperaPerfil();
          detenerEsperaNegocio();
          setNombre(user.displayName || String(user.email || "").split("@")[0] || "");
          setPerfilExiste(false);
          setSuscripcion(null);
          setNegocio(null);
          stopNegocio();
          stopSuscripcion();
          reportarErrorDeCarga(error, "No se pudo leer tu perfil de usuario.");
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
  // También se consulta el negocio del superadministrador: su acceso al
  // sistema no sustituye la verificación del plan para personalizar tickets.
  const statusConfirmado = !loading && (publicidadConfirmada || (superAdmin && !negocioId));
  const premiumState = resolvePremiumAccess(negocio, statusConfirmado);
  const isPremium = premiumState === PREMIUM_ACTIVE;
  const premiumStatusLoaded = premiumState !== PREMIUM_LOADING;
  const renovacionAutomatica = negocio?.renovacionAutomatica !== false;
  // Antiguedad del NEGOCIO, nunca la de una cuenta: agregar un empleado nuevo
  // a un negocio antiguo no puede convertirlo en un negocio nuevo.
  const negocioLegacy = statusConfirmado ? esNegocioLegacy(negocio) : false;
  // Las funciones de plan se resuelven aqui y se consumen ya resueltas, para
  // que ninguna pantalla vuelva a interpretar el plan por su cuenta.
  const puedeEditarTicket = canUseTicketEditor({ premiumState, negocioLegacy });
  const puedeUsarConteoInventario = canUseInventoryCount({ premiumState });
  const puedeUsarCorteCaja = canUseCashClosing({ premiumState });
  const puedeUsarArqueoCaja = canUseCashReconciliation({ premiumState });
  const puedeUsarLimiteCocina = canUseRestaurantCookLimit({ premiumState });
  const puedeUsarPagosActividad = canUseRestaurantActivityPayments({ premiumState });
  const puedeGenerarPdfPagosActividad = canUseAutomaticPaymentPdf({ premiumState });
  const puedeUsarReservaciones = canUseRestaurantReservations({ premiumState });
  const puedeUsarRastreoServicios = canUseServiceTracker({ premiumState });
  const mostrarAvisoMigracionTicket = showTicketEditorMigrationNotice({
    premiumState,
    negocioLegacy,
  });

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
      negocioId,
      suscripcionControlada,
      accesoPermitido,
      motivoAcceso,
      mensajeAcceso,
      errorAcceso,
      // Estados de la sesion resueltos en un solo lugar: si existe el perfil,
      // si pertenece a un negocio y si de verdad falta crear uno.
      perfilExiste,
      perteneceANegocio,
      requiereCrearNegocio,
      esTitular,
      suscripcion,
      negocio,
      premiumState,
      isPremium,
      premiumUntil: negocio?.premiumUntil || null,
      renovacionAutomatica,
      premiumStatusLoaded,
      negocioLegacy,
      puedeEditarTicket,
      puedeUsarConteoInventario,
      puedeUsarCorteCaja,
      puedeUsarArqueoCaja,
      puedeUsarLimiteCocina,
      puedeUsarPagosActividad,
      puedeGenerarPdfPagosActividad,
      puedeUsarReservaciones,
      puedeUsarRastreoServicios,
      mostrarAvisoMigracionTicket,
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
    negocioId,
    suscripcionControlada,
    accesoPermitido,
    motivoAcceso,
    mensajeAcceso,
    errorAcceso,
    perfilExiste,
    perteneceANegocio,
    requiereCrearNegocio,
    esTitular,
    suscripcion,
    negocio,
    premiumState,
    isPremium,
    renovacionAutomatica,
    premiumStatusLoaded,
    negocioLegacy,
    puedeEditarTicket,
    puedeUsarConteoInventario,
    puedeUsarCorteCaja,
    puedeUsarArqueoCaja,
    puedeUsarLimiteCocina,
    puedeUsarPagosActividad,
    puedeGenerarPdfPagosActividad,
    puedeUsarReservaciones,
    puedeUsarRastreoServicios,
    mostrarAvisoMigracionTicket,
  ]);

  return api;
}
