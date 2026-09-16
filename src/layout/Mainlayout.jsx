import { getCollectionRef } from "../js/services/tenant";
import Navbar from "../components/Navbar";
import AppFooter from "../components/AppFooter";
import UpdateModal from "../components/UpdateModal";
import RestaurantePromoModal from "../components/RestaurantePromoModal";
import ModalRecomendacion from "../components/ModalRecomendacion";
import PremiumPromoModal from "../components/PremiumPromoModal";
import DeviceLimitModal from "../components/DeviceLimitModal";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { suscribirNotificacionesGlobales } from "../js/services/realtime_notifications";
import { autoCerrarCortesPendientes } from "../js/services/corte_caja_firestore";
import {
  isNotificationEnabled,
  readNotificacionesConfigCache,
} from "../js/services/configure_notificaciones";
import { buildSystemUpdateNotification } from "../js/services/system_updates";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import usePresenciaEmpleado from "../hooks/usePresenciaEmpleado";
import useSesionDispositivo from "../hooks/useSesionDispositivo";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import useAnalyticsTracking from "../hooks/useAnalyticsTracking";
import useNotificacionesGlobales from "../hooks/useNotificacionesGlobales";
import { etiquetaTipoNotificacion } from "../js/services/notificaciones_globales";
import { escucharRespuestasSinLeer } from "../js/services/soporte_tickets";
import { esTitularDelNegocio } from "../js/services/premium_promo_schedule";
import { PREMIUM_SITE_URL } from "../js/services/premium_config";
import "../css/notificaciones_globales.css";
import "../css/sesion_dispositivo.css";

// El aviso de planes solo aparece en el inicio: nunca debe interrumpir una
// venta en el POS ni una hoja de servicio a medias.
const RUTAS_PROMO_PLANES = ["/", "/home"];

// Pantallas donde ya se explica Premium. El aviso de cuenta en uso se retira
// mientras se consultan, para que se puedan leer completas; vuelve a aparecer
// en cuanto se navega a cualquier otra parte del sistema.
const RUTAS_PREMIUM = ["/configuracion/mi-suscripcion", "/configuracion/pago-premium"];

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const authInfo = useAutorizacionActual();
  // Solo señales administrativas: ya no se registra la navegación por ruta.
  useAnalyticsTracking(authInfo);
  const { rol } = authInfo;
  const { tipoNegocioActivo } = useEmpresaConfig();
  const {
    verificando: verificandoEquipo,
    conflicto: conflictoEquipo,
    continuarEnEsteEquipo,
    cancelar: cancelarEquipo,
  } = useSesionDispositivo(authInfo);
  usePresenciaEmpleado();
  // Avisos que CajaLibre envia al negocio. Se mezclan con las alertas
  // operativas en la misma campana, en lugar de abrir una segunda.
  const {
    avisos,
    sinLeer: avisosSinLeer,
    avisoImportante,
    refrescar: refrescarAvisos,
    marcarLeida: marcarAvisoLeido,
    marcarTodasLeidas: marcarAvisosLeidos,
    descartarAvisoImportante,
  } = useNotificacionesGlobales({
    negocioId: authInfo.negocioId || authInfo.cuentaPrincipalUid,
    uid: authInfo.uid,
    premiumState: authInfo.premiumState,
  });
  const [respuestasSoporte, setRespuestasSoporte] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [showRecommendationModal, setShowRecommendationModal] = useState(false);
  const audioCtxRef = useRef(null);
  const esAdmin =
    String(rol || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim() === "administrador";

  const reproducirSonido = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        audioCtxRef.current = new AudioCtx();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    autoCerrarCortesPendientes().catch((e) =>
      console.error("autoCerrarCortesPendientes error:", e)
    );

    const t = setInterval(() => {
      autoCerrarCortesPendientes().catch((e) =>
        console.error("autoCerrarCortesPendientes interval error:", e)
      );
    }, 60 * 60 * 1000);

    return () => {
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!esAdmin) {
      return undefined;
    }

    const unsubscribe = suscribirNotificacionesGlobales((nueva) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const noti = { ...nueva, id, leida: false };

      setNotificaciones((prev) => [noti, ...prev].slice(0, 50));
      setToasts((prev) => [noti, ...prev].slice(0, 4));
      reproducirSonido();

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((n) => n.id !== id));
      }, 9000);
    });

    return () => {
      unsubscribe();
    };
  }, [esAdmin, reproducirSonido]);

  useEffect(() => {
    if (!esAdmin) return;

    const config = readNotificacionesConfigCache();
    if (!isNotificationEnabled(config, "actualizaciones_sistema")) return;

    const updateNoti = buildSystemUpdateNotification();
    if (!updateNoti) return;

    const frameId = window.requestAnimationFrame(() => {
      setNotificaciones((prev) => {
        if (prev.some((item) => item.id === updateNoti.id)) return prev;
        return [updateNoti, ...prev].slice(0, 50);
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [esAdmin]);

  const negocioActual = authInfo.negocioId || authInfo.cuentaPrincipalUid;

  useEffect(() => {
    if (!negocioActual || !authInfo.uid) return undefined;
    const detener = escucharRespuestasSinLeer(
      negocioActual,
      setRespuestasSoporte,
      (error) => console.warn("[soporte] No se pudieron leer las respuestas:", error?.code || error),
    );
    return () => detener?.();
  }, [negocioActual, authInfo.uid]);

  const cerrarNotificacion = useCallback((id) => {
    const safeId = String(id || "");
    // Un aviso de CajaLibre no se borra: se marca como leido y sigue en la
    // lista, porque lo envio alguien mas y puede querer consultarse despues.
    marcarAvisoLeido(safeId);
    setNotificaciones((prev) => prev.filter((item) => String(item.id || "") !== safeId));
    setToasts((prev) => prev.filter((item) => String(item.id || "") !== safeId));
  }, [marcarAvisoLeido]);

  function togglePanelNotificaciones() {
    setPanelAbierto((prev) => {
      const nuevo = !prev;
      if (!prev) {
        setNotificaciones((list) => list.map((n) => ({ ...n, leida: true })));
        // Abrir el panel es la senal de que alguien quiere ver lo ultimo: es el
        // unico momento en que vale la pena saltarse la copia reciente.
        refrescarAvisos();
      }
      return nuevo;
    });
  }

  const noLeidas = notificaciones.filter((n) => !n.leida).length;
  const panelNotificacionesVisible = panelAbierto;

  const avisosComoNotificacion = useMemo(() => avisos.map((aviso) => ({
    id: aviso.id,
    titulo: aviso.titulo,
    detalle: aviso.mensaje,
    etiqueta: etiquetaTipoNotificacion(aviso.tipo),
    nivel: aviso.prioridad === "importante" ? "alta" : "baja",
    fecha: aviso.publicarAt || aviso.createdAt,
    leida: aviso.leida,
    accionTexto: aviso.enlaceUrl ? (aviso.enlaceTexto || "Mas informacion") : "",
    onAccion: aviso.enlaceUrl
      ? () => {
        marcarAvisoLeido(aviso.id);
        if (aviso.enlaceUrl.startsWith("/")) navigate(aviso.enlaceUrl);
        else window.open(aviso.enlaceUrl, "_blank", "noopener,noreferrer");
      }
      : null,
  })), [avisos, marcarAvisoLeido, navigate]);

  // Una respuesta de soporte no se guarda como aviso aparte: el propio ticket
  // ya dice que hay algo nuevo, y de ahi sale esta tarjeta.
  const respuestasComoNotificacion = useMemo(() => respuestasSoporte.map((ticket) => ({
    id: `soporte-${ticket.id}`,
    titulo: "Tenemos una nueva respuesta en tu solicitud de soporte.",
    detalle: ticket.asunto,
    etiqueta: "Soporte",
    nivel: "media",
    fecha: ticket.ultimoMensajeAt,
    leida: false,
    accionTexto: "Ver respuesta",
    onAccion: () => navigate(`/soporte?ticket=${ticket.id}`),
  })), [navigate, respuestasSoporte]);

  // La campana ya no es solo del administrador: cualquier persona del negocio
  // debe poder recibir un aviso de CajaLibre.
  const notificacionesVisibles = [
    ...respuestasComoNotificacion,
    ...avisosComoNotificacion,
    ...(esAdmin ? notificaciones : []),
  ];
  const noLeidasVisibles = respuestasComoNotificacion.length
    + avisosSinLeer
    + (esAdmin ? noLeidas : 0);
  const path = String(location.pathname || "").toLowerCase();
  const mostrarAvisoEquipo = Boolean(conflictoEquipo) && !RUTAS_PREMIUM.includes(path);
  // Platillos puede tener tantas filas como elementos existan. No debe usar el
  // shell de altura fija porque recorta las tarjetas antes de llegar al footer.
  const usarShellWorkspace = path === "/reportes";
  const shellClassName = [
    "container-fluid",
    "px-0",
    "app-shell",
    usarShellWorkspace ? "app-shell-workspace" : "",
    ["/", "/home", "/hoja_servicio", "/servicios"].includes(path) ? "app-shell-service-gradient" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const usarFondoServicios = ["/", "/home", "/hoja_servicio", "/servicios"].includes(path);
    document.body.classList.toggle("body-service-gradient", usarFondoServicios);
    return () => document.body.classList.remove("body-service-gradient");
  }, [path]);

  useEffect(() => {
    const isRestaurant = tipoNegocioActivo?.id === "restaurante";
    document.body.classList.toggle("restaurant-theme", isRestaurant);
    return () => document.body.classList.remove("restaurant-theme");
  }, [tipoNegocioActivo?.id]);

  useEffect(() => {
    const openUpdates = () => setShowUpdatesModal(true);
    window.addEventListener("cajalibre:open-updates", openUpdates);
    return () => window.removeEventListener("cajalibre:open-updates", openUpdates);
  }, []);

  useEffect(() => {
    if (!esAdmin || !authInfo.uid) return undefined;
    const key = `cajalibre:recomendacion:${authInfo.uid}`;
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    if (data.respondida || Number(data.posponerHasta || 0) > Date.now()) return undefined;

    const sessionKey = `${key}:sesion`;
    const visitas = sessionStorage.getItem(sessionKey)
      ? Number(data.visitas || 0)
      : Number(data.visitas || 0) + 1;
    sessionStorage.setItem(sessionKey, "1");
    const primeraVisita = Number(data.primeraVisita || Date.now());
    localStorage.setItem(key, JSON.stringify({ ...data, visitas, primeraVisita }));

    const diasUso = (Date.now() - primeraVisita) / 86400000;
    if (visitas < 3 && diasUso < 3) return undefined;
    const timer = window.setTimeout(() => setShowRecommendationModal(true), 45000);
    return () => window.clearTimeout(timer);
  }, [authInfo.uid, esAdmin]);

  const cerrarRecomendacion = useCallback(() => {
    const key = `cajalibre:recomendacion:${authInfo.uid}`;
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    if (!data.respondida) {
      localStorage.setItem(key, JSON.stringify({
        ...data,
        posponerHasta: Date.now() + (14 * 86400000),
      }));
    }
    setShowRecommendationModal(false);
  }, [authInfo.uid]);

  // "Conocer Premium" reutiliza lo que ya existe: el titular entra a su pagina
  // de suscripcion, y quien no puede contratar abre el sitio publico donde se
  // explican los planes. No se crea ningun otro flujo de compra.
  const conocerPremium = useCallback(() => {
    if (esTitularDelNegocio(authInfo)) {
      navigate("/configuracion/mi-suscripcion");
      return;
    }
    window.open(PREMIUM_SITE_URL, "_blank", "noopener,noreferrer");
  }, [authInfo, navigate]);

  const enviarRecomendacion = useCallback(async (respuesta) => {
    await addDoc(getCollectionRef("recomendaciones"), {
      ...respuesta,
      uid: authInfo.uid,
      negocioId: authInfo.cuentaPrincipalUid || authInfo.uid,
      cuentaPrincipalUid: authInfo.cuentaPrincipalUid || authInfo.uid,
      rol: authInfo.rol || "",
      createdAt: serverTimestamp(),
    });
    const key = `cajalibre:recomendacion:${authInfo.uid}`;
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...data, respondida: true, respondidaAt: Date.now() }));
  }, [authInfo]);


  return (
    <>
      <Navbar
        panelAbierto={panelNotificacionesVisible}
        togglePanelNotificaciones={togglePanelNotificaciones}
        notificaciones={notificacionesVisibles}
        noLeidas={noLeidasVisibles}
        mostrarNotificaciones
        onDismissNotification={cerrarNotificacion}
        onMarcarTodasLeidas={marcarAvisosLeidos}
      />
      <main className={shellClassName}>
        <Outlet />
      </main>

      <AppFooter />
      <RestaurantePromoModal enabled={esAdmin && tipoNegocioActivo?.id !== "restaurante"} />

      {showUpdatesModal ? <UpdateModal onClose={() => setShowUpdatesModal(false)} /> : null}
      <ModalRecomendacion abierto={showRecommendationModal} onCerrar={cerrarRecomendacion} onEnviar={enviarRecomendacion} />
      <PremiumPromoModal
        authInfo={authInfo}
        bloqueado={
          showUpdatesModal
          || showRecommendationModal
          || Boolean(conflictoEquipo)
          || !RUTAS_PROMO_PLANES.includes(path)
        }
      />

      {mostrarAvisoEquipo ? (
        <DeviceLimitModal
          equipo={conflictoEquipo.otroDispositivo}
          procesando={verificandoEquipo}
          onContinuar={() => continuarEnEsteEquipo().catch(() => {})}
          onPremium={conocerPremium}
          onCancelar={() => cancelarEquipo().catch(() => {})}
        />
      ) : null}

      {avisoImportante && !mostrarAvisoEquipo ? (
        <div className={`aviso-global-banner nivel-${avisoImportante.tipo}`} role="status">
          <div className="aviso-global-copy">
            <strong>{avisoImportante.titulo}</strong>
            <p>{avisoImportante.mensaje}</p>
          </div>
          <div className="aviso-global-acciones">
            {avisoImportante.enlaceUrl ? (
              <button
                type="button"
                className="aviso-global-btn"
                onClick={() => {
                  marcarAvisoLeido(avisoImportante.id);
                  descartarAvisoImportante();
                  if (avisoImportante.enlaceUrl.startsWith("/")) navigate(avisoImportante.enlaceUrl);
                  else window.open(avisoImportante.enlaceUrl, "_blank", "noopener,noreferrer");
                }}
              >
                {avisoImportante.enlaceTexto || "Mas informacion"}
              </button>
            ) : null}
            <button
              type="button"
              className="aviso-global-cerrar"
              aria-label="Cerrar aviso"
              onClick={() => {
                marcarAvisoLeido(avisoImportante.id);
                descartarAvisoImportante();
              }}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      {conflictoEquipo && !mostrarAvisoEquipo ? (
        <div className="device-session-banner no-print" role="status">
          <p>Tu cuenta sigue abierta en otro dispositivo. Puedes revisar Premium con calma.</p>
          <button
            type="button"
            className="emp-btn emp-btn-primary"
            onClick={() => continuarEnEsteEquipo().catch(() => {})}
            disabled={verificandoEquipo}
          >
            {verificandoEquipo ? "Un momento..." : "Continuar en este dispositivo"}
          </button>
        </div>
      ) : null}

      {esAdmin && (
        <div className="global-toast-stack no-print">
          {toasts.map((n) => (
            <div key={n.id} className={`global-toast ${n.nivel || "baja"}`}>
              <div className="global-toast-icon">{"\u{1F514}"}</div>
              <div className="global-toast-content">
                <p className="global-toast-title">{n.titulo}</p>
                <p className="global-toast-detail">{n.detalle}</p>
              </div>
              <button
                type="button"
                className="global-toast-close"
                aria-label={`Cerrar alerta ${n.titulo}`}
                onClick={() => cerrarNotificacion(n.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
