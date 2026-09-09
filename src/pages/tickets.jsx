import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import PageLoader from "../components/PageLoader";

import { buscarServicioPorFolio } from "../js/services/servicios_firestore";
import PanelAdminServicio from "../components/paneladminservicio";
import { getEstadoInfo } from "../js/services/estado_config";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import useMonedaConfig from "../hooks/useMonedaConfig";
import {
  buildTicketConfig,
  readTicketConfigStorage,
  splitTicketLines,
} from "../js/services/ticket_config";
import { getEtiquetaOpcionTipo, inferTipoNegocioServicio } from "../js/services/tipos_negocio";
import useImpresorasConfig from "../hooks/useImpresorasConfig";
import { captureElementToPngDataUrl, printImageSilently } from "../js/services/silent_print";
import { detectMobileDevice, getTicketPrintWidth } from "../js/services/mobile_detection";
import {
  openTicketImageDataUrl,
  shareTicketImageDataUrl,
} from "../js/services/mobile_ticket_share";
import "../css/ticket.css";
import logoUrl from "../assets/logo.png";

function normalizarStatus(raw) {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

function permitePrecioCero(status) {
  const s = normalizarStatus(status);
  return s === "cancelado" || s === "no_reparable";
}

function getTipoTicketLabel(servicio) {
  const raw = String(servicio?.tipoDispositivo || "").trim();
  const normalized = raw.toLowerCase();
  const tipoNegocio = inferTipoNegocioServicio(servicio);

  if (normalized === "auto") return "Auto";
  if (normalized === "moto" || normalized === "motocicleta") return "Moto";
  if (normalized === "camioneta") return "Camioneta";

  return (
    getEtiquetaOpcionTipo(tipoNegocio, raw) ||
    raw ||
    (tipoNegocio?.id === "automotriz" ? "Vehiculo" : "Equipo")
  );
}

const DYNAMIC_TICKET_PRINT_STYLE_ID = "ticket-mobile-print-style";

function clearDynamicTicketPrintStyle() {
  if (typeof document === "undefined") return;
  document.getElementById(DYNAMIC_TICKET_PRINT_STYLE_ID)?.remove();
}

function syncDynamicTicketPrintStyle(ticketWidth, isMobile) {
  clearDynamicTicketPrintStyle();
  if (typeof document === "undefined") return;

  const style = document.createElement("style");
  style.id = DYNAMIC_TICKET_PRINT_STYLE_ID;
  style.media = "print";
  style.textContent = `
    @page { size: ${ticketWidth} auto; margin: 0; }
    html,
    body {
      width: ${ticketWidth} !important;
    }
    .ticket-paper {
      width: ${ticketWidth} !important;
      max-width: ${ticketWidth} !important;
      padding: 4mm 10mm 4mm 4mm !important;
      box-sizing: border-box !important;
    }
    .ticket-paper.ticket-paper-mobile .ticket-title {
      font-size: 18px !important;
    }
    .ticket-paper.ticket-paper-mobile .ticket-sub,
    .ticket-paper.ticket-paper-mobile .ticket-section,
    .ticket-paper.ticket-paper-mobile .ticket-wrap,
    .ticket-paper.ticket-paper-mobile .ticket-qr-text,
    .ticket-paper.ticket-paper-mobile .ticket-footer,
    .ticket-paper.ticket-paper-mobile .ticket-status-pill {
      font-size: 12px !important;
    }
    .ticket-paper.ticket-paper-mobile .ticket-section-title {
      font-size: 13px !important;
    }
    .ticket-paper.ticket-paper-mobile .ticket-logo img {
      max-height: 64px !important;
    }
  `;
  document.head.appendChild(style);
}

export default function Ticket() {
  const { folio: folioParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { nombreEmpresa, logoEmpresa } = useEmpresaConfig();
  const {
    imprimirAlIniciarServicio,
    modoImpresion,
    nombreImpresoraTicket,
    salidaTicketMovil,
    tamanoTicket,
  } = useImpresorasConfig();
  const { formatCurrency } = useMonedaConfig();
  const [ticketCfg] = useState(() => buildTicketConfig(readTicketConfigStorage()));
  const [esVistaMovil, setEsVistaMovil] = useState(() => detectMobileDevice());
  const autoPrintDoneRef = useRef(false);
  const folio = useMemo(() => {
    const raw = String(folioParam || "").trim();
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [folioParam]);

  const [loading, setLoading] = useState(true);
  const [servicio, setServicio] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncViewport = () => {
      setEsVistaMovil(detectMobileDevice());
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);

    return () => {
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);

  useEffect(() => {
    syncDynamicTicketPrintStyle(tamanoTicket, esVistaMovil);
    return () => clearDynamicTicketPrintStyle();
  }, [esVistaMovil, tamanoTicket]);

  useEffect(() => {
    autoPrintDoneRef.current = false;
  }, [folio]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const data = await buscarServicioPorFolio(folio);
        if (alive) setServicio(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [folio]);

  const formatFecha = (ts) => {
    if (!ts?.seconds) return "-";
    return new Date(ts.seconds * 1000).toLocaleString("es-MX");
  };

  // ✅ Formato de precio

  const urlStatus = `${window.location.origin}/status/${encodeURIComponent(
    String(folio || ""),
  )}`;
  const compartirTicketMovil = useCallback(async () => {
    const ticketElement = document.getElementById("ticket");
    const imageDataUrl = await captureElementToPngDataUrl(ticketElement);
    const folioLabel = String(servicio?.folio || folio || "ticket").trim() || "ticket";
    const filename = `ticket-servicio-${folioLabel}.png`;
    const title = `Ticket ${folioLabel}`;

    try {
      const shared = await shareTicketImageDataUrl({
        imageDataUrl,
        filename,
        title,
        text: "Abrir con PrinterApp para imprimir el ticket.",
      });
      if (shared) return true;
    } catch (error) {
      // Si el usuario cancela compartir, dejamos que siga el flujo normal.
      if (error?.name === "AbortError") return true;
      console.warn("[ticket-mobile-share] No se pudo compartir el ticket:", error);
    }

    return openTicketImageDataUrl(imageDataUrl, title);
  }, [folio, servicio?.folio]);

  const imprimirTicketActual = useCallback(async ({ userInitiated = false } = {}) => {
    if (modoImpresion === "silenciosa") {
      try {
        const ticketElement = document.getElementById("ticket");
        const imageDataUrl = await captureElementToPngDataUrl(ticketElement);

        await printImageSilently({
          printerName: nombreImpresoraTicket || "",
          imageDataUrl,
          paperSize: tamanoTicket || getTicketPrintWidth(esVistaMovil),
          jobName:
            `Servicio ${servicio?.folio || folio || ""}`.trim() || "Hoja de servicio",
        });
        return;
      } catch (error) {
        console.warn(
          "[impresion-silenciosa] Hoja de servicio. Se usara el dialogo del navegador como respaldo:",
          error,
        );
      }
    }

    if (esVistaMovil && userInitiated && salidaTicketMovil === "imagen") {
      const handled = await compartirTicketMovil();
      if (handled) return;
    }

    window.print();
  }, [
    compartirTicketMovil,
    esVistaMovil,
    folio,
    modoImpresion,
    tamanoTicket,
    nombreImpresoraTicket,
    salidaTicketMovil,
    servicio,
  ]);

  useEffect(() => {
    const shouldAutoPrint =
      Boolean(location.state?.autoPrint) &&
      location.state?.autoPrintSource === "service-start" &&
      imprimirAlIniciarServicio;

    if (!servicio || !shouldAutoPrint || autoPrintDoneRef.current) return undefined;

    autoPrintDoneRef.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        await imprimirTicketActual();
        navigate(location.pathname, { replace: true, state: {} });
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    imprimirAlIniciarServicio,
    imprimirTicketActual,
    location.pathname,
    location.state,
    navigate,
    servicio,
  ]);

  const businessName = String(nombreEmpresa || ticketCfg.businessName || "").trim();
  const businessLines = useMemo(() => {
    if (!ticketCfg.showBusinessData) return [];

    const lines = [];
    if (businessName) lines.push(businessName);
    if (ticketCfg.businessAddress.trim()) lines.push(ticketCfg.businessAddress.trim());
    if (ticketCfg.businessPhone.trim()) lines.push(ticketCfg.businessPhone.trim());
    return lines;
  }, [
    businessName,
    ticketCfg.businessAddress,
    ticketCfg.businessPhone,
    ticketCfg.showBusinessData,
  ]);
  const topLines = useMemo(
    () => splitTicketLines(ticketCfg.extraTopLines),
    [ticketCfg.extraTopLines],
  );
  const bottomLines = useMemo(
    () => splitTicketLines(ticketCfg.extraBottomLines),
    [ticketCfg.extraBottomLines],
  );
  const footerText = String(ticketCfg.footerText || "").trim();
  const legendText = String(ticketCfg.legendText || "").trim();
  const tituloPrincipal = businessLines[0] || "Hoja de Servicio";
  const tipoNegocioServicio = useMemo(() => inferTipoNegocioServicio(servicio), [servicio]);
  const tipoTicketLabel = useMemo(() => getTipoTicketLabel(servicio), [servicio]);
  const tituloSeccionEquipo = useMemo(() => {
    return tipoNegocioServicio?.id === "automotriz" ? tipoTicketLabel : "Equipo";
  }, [tipoNegocioServicio?.id, tipoTicketLabel]);
  const sujetoTicket = useMemo(() => {
    return tipoNegocioServicio?.id === "automotriz"
      ? tipoTicketLabel.toLowerCase()
      : "equipo";
  }, [tipoNegocioServicio?.id, tipoTicketLabel]);

  // ✅ Info de estado (color + label + step)
  const estadoInfo = useMemo(() => {
    return getEstadoInfo(servicio?.status);
  }, [servicio?.status]);
  const ticketPaperClassName = useMemo(() => {
    const classes = ["ticket-paper"];
    if (ticketCfg.boldAllText) classes.push("ticket-paper-all-bold");
    if (esVistaMovil) classes.push("ticket-paper-mobile");
    return classes.join(" ");
  }, [esVistaMovil, ticketCfg.boldAllText]);

  // Determina si se muestra un precio fijo o la leyenda de precio pendiente.
  const precioTexto = useMemo(() => {
    // Si el formulario dijo “precio después”, no mostramos costo
    if (servicio?.precioDespues) return "El precio aparecerá en estatus.";

    const raw = servicio?.costo;
    const sanitized = String(raw ?? "").replace(/[^\d.]/g, "");
    if (!sanitized) return "El precio aparecerá en estatus.";

    // Convierte "800", "$800", "800.00" -> 800
    const n = Number(sanitized);

    // ✅ Si no es número o es 0 (salvo cancelado/no reparable), tratamos como “sin precio”
    if (!Number.isFinite(n) || n < 0 || (n === 0 && !permitePrecioCero(servicio?.status))) {
      return "El precio aparecerá en estatus.";
    }

    // ✅ Formato moneda
    return formatCurrency(n, {
      maximumFractionDigits: 0,
    });
  }, [formatCurrency, servicio?.costo, servicio?.precioDespues, servicio?.status]);

  if (loading) return <PageLoader text="Cargando ticket..." />;
  if (!servicio) return <div className="ticket-page">No encontrado: {folio}</div>;

  return (
    <div className={esVistaMovil ? "ticket-admin-layout ticket-admin-layout-mobile" : "ticket-admin-layout"}>
      {/* ✅ IZQUIERDA: TICKET */}
      <div className="ticket-left">
        <div
          className={ticketPaperClassName}
          id="ticket"
        >
          {/* ✅ Logo */}
          {ticketCfg.showLogo && (
            <div className="ticket-logo">
              <img src={logoEmpresa || logoUrl} alt="Logo" />
            </div>
          )}

          <div className="ticket-header">
            <div className="ticket-title">{tituloPrincipal}</div>
            {businessLines.length > 1 &&
              businessLines.slice(1).map((line) => (
                <div key={line} className="ticket-sub">{line}</div>
              ))}
            {tituloPrincipal !== "Hoja de Servicio" && (
              <div className="ticket-sub">Hoja de Servicio</div>
            )}
            <div className="ticket-sub">
              Folio: <b>{servicio.folio}</b>
            </div>
            <div className="ticket-sub">Fecha: {formatFecha(servicio.createdAt)}</div>
            {topLines.map((line) => (
              <div key={line} className="ticket-sub">{line}</div>
            ))}
          </div>

          {ticketCfg.showClientSection && (
            <div className="ticket-section">
              <div className="ticket-section-title">Cliente</div>
              {ticketCfg.showClientName && <div><b>Nombre:</b> {servicio.nombre || "-"}</div>}
              {ticketCfg.showClientPhone && <div><b>Tel:</b> {servicio.telefono || "-"}</div>}
              <div><b>Dirección:</b> {servicio.direccion || "-"}</div>
            </div>
          )}

          <div className="ticket-section">
            <div className="ticket-section-title">{tituloSeccionEquipo}</div>
            <div><b>Tipo:</b> {tipoTicketLabel}</div>
            <div><b>Marca:</b> {servicio.marca || "-"}</div>
            <div><b>Modelo:</b> {servicio.modelo || "-"}</div>
            <div>
              <b>No. Serie:</b>{" "}
              {servicio.omitirNumeroSerie
                ? "No proporcionado"
                : servicio.numeroSerie || "-"}
            </div>
          </div>

          <div className="ticket-section">
            <div className="ticket-section-title">Descripción del problema</div>
            <div className="ticket-wrap">{servicio.trabajo || "-"}</div>
          </div>

          {/* ✅ PRECIO */}
          <div className="ticket-section">
            <div className="ticket-section-title">Precio</div>
            <div className="ticket-wrap">{precioTexto}</div>
          </div>

          {/* ✅ ESTADO */}
          {ticketCfg.showStatusSection && (
            <div className="ticket-section">
              <div className="ticket-section-title">Estado actual</div>

              <div className="ticket-status-row">
                <span
                  className="ticket-dot"
                  style={{ background: estadoInfo.color }}
                  aria-label="estado-color"
                />
                <span
                  className="ticket-status-pill"
                  style={{ borderColor: estadoInfo.color, color: estadoInfo.color }}
                >
                  {estadoInfo.label}
                </span>
              </div>
            </div>
          )}

          <div className="ticket-divider" />

          <div className="ticket-qr">
            <QRCode value={urlStatus} size={esVistaMovil ? 180 : 150} />
            <div className="ticket-qr-text">
              <b>Visualiza el estado de tu {sujetoTicket}</b>
              <div>Escanea el QR o ingresa a:</div>
              <div className="ticket-link">/status</div>
            </div>
          </div>

          {bottomLines.map((line) => (
            <div key={line} className="ticket-footer">{line}</div>
          ))}
          {ticketCfg.showLegend && legendText && (
            <div className="ticket-footer">{legendText}</div>
          )}
          {footerText && <div className="ticket-footer">{footerText}</div>}
        </div>
      </div>

      {/* ✅ DERECHA: PANEL ADMIN */}
      <div className="ticket-right no-print">
        <PanelAdminServicio
          servicio={servicio}
          onActualizado={(nuevoServicio) => {
            setServicio(nuevoServicio);
          }}
          onImprimir={() => {
            void imprimirTicketActual({ userInitiated: true });
          }}
          onRegresar={() => navigate("/home")}
        />
      </div>
    </div>
  );
}
