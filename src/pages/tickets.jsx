import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import QRCode from "react-qr-code";

import { buscarServicioPorFolio } from "../js/services/servicios_firestore";
import PanelAdminServicio from "../components/paneladminservicio";

import { getEstadoInfo } from "../js/services/estado_config";
import "../css/ticket.css";

export default function Ticket() {
  const { folio } = useParams();
  const navigate = useNavigate();

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
  const formatMoneda = (value) => {
    const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return null;
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(n);
  };

  const urlStatus = `${window.location.origin}/status/${folio}`;

  // ✅ Info de estado (color + label + step)
  const estadoInfo = useMemo(() => {
    return getEstadoInfo(servicio?.status);
  }, [servicio?.status]);

  // ✅ Determinar si ya hay precio
  const precioTexto = useMemo(() => {
  // Si el formulario dijo “precio después”, no mostramos costo
  if (servicio?.precioDespues) return "El precio aparecerá en estatus.";

  const raw = servicio?.costo;

  // Convierte "800", "$800", "800.00" -> 800
  const n = Number(String(raw ?? "").replace(/[^\d.]/g, ""));

  // ✅ Si no es número o es 0 (o menor), tratamos como “sin precio”
  if (!Number.isFinite(n) || n <= 0) return "El precio aparecerá en estatus.";

  // ✅ Formato moneda
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}, [servicio?.costo, servicio?.precioDespues]);

  if (loading) return <div className="ticket-page">Cargando...</div>;
  if (!servicio) return <div className="ticket-page">No encontrado: {folio}</div>;

  return (
    <div className="ticket-admin-layout">
      {/* ✅ IZQUIERDA: TICKET */}
      <div className="ticket-left">
        <div className="ticket-paper" id="ticket">
          {/* ✅ Logo */}
          <div className="ticket-logo">
            <img src="../src/assets/logo.png" alt="Logo" />
          </div>

          <div className="ticket-header">
            <div className="ticket-title">Hoja de Servicio</div>
            <div className="ticket-sub">
              Folio: <b>{servicio.folio}</b>
            </div>
            <div className="ticket-sub">Fecha: {formatFecha(servicio.createdAt)}</div>
          </div>

          <div className="ticket-section">
            <div className="ticket-section-title">Cliente</div>
            <div><b>Nombre:</b> {servicio.nombre || "-"}</div>
            <div><b>Tel:</b> {servicio.telefono || "-"}</div>
            <div><b>Dirección:</b> {servicio.direccion || "-"}</div>
          </div>

          <div className="ticket-section">
            <div className="ticket-section-title">Equipo</div>
            <div><b>Tipo:</b> {servicio.tipoDispositivo || "-"}</div>
            <div><b>Marca:</b> {servicio.marca || "-"}</div>
            <div><b>Modelo:</b> {servicio.modelo || "-"}</div>
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

          <div className="ticket-divider" />

          <div className="ticket-qr">
            <QRCode value={urlStatus} size={120} />
            <div className="ticket-qr-text">
              <b>Visualiza el estado de tu equipo</b>
              <div>Escanea el QR o ingresa a:</div>
              <div className="ticket-link">/status</div>
            </div>
          </div>

          <div className="ticket-footer">Gracias por tu preferencia.</div>
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
