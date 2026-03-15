import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import "../css/ticket.css";
import logoUrl from "../assets/logo.png";

export default function Ticket() {
  const { folio: folioParam } = useParams();
  const navigate = useNavigate();
  const { nombreEmpresa } = useEmpresaConfig();
  const { formatCurrency } = useMonedaConfig();
  const [ticketCfg] = useState(() => buildTicketConfig(readTicketConfigStorage()));
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

  // ✅ Info de estado (color + label + step)
  const estadoInfo = useMemo(() => {
    return getEstadoInfo(servicio?.status);
  }, [servicio?.status]);

  // Determina si se muestra un precio fijo o la leyenda de precio pendiente.
  const precioTexto = useMemo(() => {
  // Si el formulario dijo “precio después”, no mostramos costo
  if (servicio?.precioDespues) return "El precio aparecerá en estatus.";

  const raw = servicio?.costo;

  // Convierte "800", "$800", "800.00" -> 800
  const n = Number(String(raw ?? "").replace(/[^\d.]/g, ""));

  // ✅ Si no es número o es 0 (o menor), tratamos como “sin precio”
  if (!Number.isFinite(n) || n <= 0) return "El precio aparecerá en estatus.";

  // ✅ Formato moneda
  return formatCurrency(n, {
    maximumFractionDigits: 0,
  });
}, [formatCurrency, servicio?.costo, servicio?.precioDespues]);

  if (loading) return <PageLoader text="Cargando ticket..." />;
  if (!servicio) return <div className="ticket-page">No encontrado: {folio}</div>;

  return (
    <div className="ticket-admin-layout">
      {/* ✅ IZQUIERDA: TICKET */}
      <div className="ticket-left">
        <div className="ticket-paper" id="ticket">
          {/* ✅ Logo */}
          {ticketCfg.showLogo && (
            <div className="ticket-logo">
              <img src={logoUrl} alt="Logo" />
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
            <div className="ticket-section-title">Equipo</div>
            <div><b>Tipo:</b> {servicio.tipoDispositivo || "-"}</div>
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
            <QRCode value={urlStatus} size={120} />
            <div className="ticket-qr-text">
              <b>Visualiza el estado de tu equipo</b>
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
          onImprimir={() => window.print()}
          onRegresar={() => navigate("/home")}
        />
      </div>
    </div>
  );
}
