import "../css/home.css";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import {
  obtenerKPIsDashboard,
  obtenerServiciosPendientes,
  obtenerNotificacionesHome,
} from "../js/services/home";
import { obtenerResumenCajaHoy } from "../js/services/corte_caja_firestore";
import { generarPdfCorteCajaDia } from "../js/services/pdf_corte_caja";
import { obtenerIngresosPorDia, obtenerIngresosPorTipo } from "../js/services/home_charts_firestore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import {
  FiTrendingUp,
  FiTool,
  FiFileText,
  FiCheckCircle,
  FiDollarSign,
  FiUsers,
  FiClock,
  FiCalendar,
  FiCreditCard,
} from "react-icons/fi";
import { APARIENCIA_EVENT, readAparienciaConfigStorage } from "../js/services/apariencia_config";
import { STATUS } from "../js/utils/status_map";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import useMonedaConfig from "../hooks/useMonedaConfig";
import Advertising from "../components/Advertising";
import PageLoader from "../components/PageLoader";

function normalizeRoleText(raw = "") {
  return String(raw || "")
    .replace(/Ã¡|á|à|ä|â/gi, "a")
    .replace(/Ã©|é|è|ë|ê/gi, "e")
    .replace(/Ã­|í|ì|ï|î/gi, "i")
    .replace(/Ã³|ó|ò|ö|ô/gi, "o")
    .replace(/Ãº|ú|ù|ü|û/gi, "u")
    .replace(/Ã±|ñ/gi, "n")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRole(raw = "", permisos = {}, serviciosHabilitados = true) {
  const key = normalizeRoleText(raw);
  if (key.includes("admin")) return "admin";
  if (key.includes("tecn") && serviciosHabilitados) return "tecnico";
  if (key.includes("vend") || key.includes("cajer")) return "vendedor";
  if (serviciosHabilitados && (permisos?.["servicios.ver"] || permisos?.["servicios.crear"])) {
    return "tecnico";
  }
  if (permisos?.["ventas.pos"] || permisos?.["productos.ver"]) return "vendedor";
  return "general";
}

function normalizeStatus(raw = "") {
  return String(raw || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_ ]/g, "").replace(/\s+/g, "_").trim();
}

function statusValueFromRaw(raw = "") {
  const normalized = normalizeStatus(raw);
  if (!normalized) return "pendiente";
  if (normalized === "en_revision") return "revision";
  if (normalized === "en_reparacion") return "reparacion";
  if (normalized === "en_espera_de_refaccion") return "espera_refaccion";
  if (normalized === "finalizado") return "listo";
  return normalized;
}

function parseFechaAprox(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFechaLarga(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "Sin fecha estimada";
  try {
    return value.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return value.toLocaleDateString();
  }
}

function isSameDay(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatCompactValue(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat("es-MX", {
    notation: "compact",
    maximumFractionDigits: amount >= 1000 ? 1 : 0,
  }).format(amount);
}

function formatWeekdayShort(date) {
  const label = date.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1, 3);
}

function getPieSegmentMeta(rawName = "OTRO") {
  const name = String(rawName || "OTRO").toUpperCase();

  if (["PC", "CPU", "COMPUTADORA"].some((token) => name.includes(token))) {
    return {
      color: "#2563eb",
      description: "Equipos de escritorio, mantenimiento y reparacion general.",
    };
  }

  if (["LAPTOP", "NOTEBOOK"].some((token) => name.includes(token))) {
    return {
      color: "#22c55e",
      description: "Diagnostico y servicio sobre laptops y equipos portatiles.",
    };
  }

  if (["IMPRESORA", "MULTIFUNCIONAL"].some((token) => name.includes(token))) {
    return {
      color: "#f59e0b",
      description: "Trabajos de impresion, limpieza y reemplazo de piezas.",
    };
  }

  if (["MONITOR", "PANTALLA", "DISPLAY"].some((token) => name.includes(token))) {
    return {
      color: "#ef4444",
      description: "Revision visual, paneles, fuentes y componentes de imagen.",
    };
  }

  if (["CELULAR", "TELEFONO", "MOVIL"].some((token) => name.includes(token))) {
    return {
      color: "#06b6d4",
      description: "Atencion de dispositivos moviles y accesorios relacionados.",
    };
  }

  return {
    color: "#8b5cf6",
    description: "Servicios agrupados en otras categorias del taller.",
  };
}

function priorityTone(servicio, today) {
  const fecha = parseFechaAprox(servicio?.fechaAprox);
  if (!fecha) return "neutral";
  if (fecha < today) return "danger";
  if (isSameDay(fecha, today)) return "warning";
  return "info";
}

function MetricCard({ tone = "blue", icon, label, value, sublabel = "" }) {
  return (
    <div className={`kpi-card ${tone}`}>
      {sublabel ? (
        <div className="kpi-card-help-wrap">
          <button
            type="button"
            className="kpi-card-help"
            aria-label={`Informacion sobre ${label}`}
          >
            ?
          </button>
          <div className="kpi-card-tooltip" role="tooltip">
            {sublabel}
          </div>
        </div>
      ) : null}
      <span className="kpi-card-icon">{icon}</span>
      <div className="kpi-card-copy">
        <p>{label}</p>
        <h3>{value}</h3>
      </div>
    </div>
  );
}

function QuickActionCard({ title, description, tone = "blue", onClick }) {
  return (
    <button type="button" className={`home-quick-card tone-${tone}`} onClick={onClick}>
      <strong>{title}</strong>
      <span>{description}</span>
    </button>
  );
}

function ServiceListCard({ title, subtitle = "", services = [], emptyText, onOpen, sideRenderer, className = "" }) {
  return (
    <div className={`panel-card home-role-card ${className}`.trim()}>
      <div className="home-role-card-head">
        <div>
          <h4>{title}</h4>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {services.length === 0 && <p className="home-empty-copy">{emptyText}</p>}
      {services.map((servicio) => (
        <div key={servicio.id} className="home-list-item">
          <div className="home-list-main">
            <strong>{servicio.folio || "-"}</strong>
            <span>{servicio.nombre || "Cliente"} - {servicio.status || "Pendiente"}</span>
          </div>
          <div className="home-list-side">
            {typeof sideRenderer === "function" ? sideRenderer(servicio) : null}
            <button type="button" className="btn-light" onClick={() => onOpen(servicio.folio)}>
              Ver
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { rol, nombre, permisos, puede, premiumState } = useAutorizacionActual();
  const { serviciosHabilitados } = useEmpresaConfig();
  const { formatCurrency } = useMonedaConfig();
  const roleKey = useMemo(
    () => normalizeRole(rol, permisos, serviciosHabilitados),
    [rol, permisos, serviciosHabilitados],
  );
  const panelTitle = useMemo(() => (
    roleKey === "admin"
      ? "Dashboard Administrativo"
      : roleKey === "tecnico"
        ? "Panel Tecnico"
        : roleKey === "vendedor"
          ? "Panel de Ventas"
          : "Resumen General"
  ), [roleKey]);
  const panelSubtitle = useMemo(() => (
    roleKey === "admin"
      ? serviciosHabilitados
        ? "Vision completa del negocio, ventas y operacion."
        : "Vision completa del negocio, ventas, inventario y clientes."
      : roleKey === "tecnico"
        ? "Cola tecnica, prioridades y entregas pendientes."
        : roleKey === "vendedor"
          ? "Caja, cobro y oportunidades de cierre del dia."
          : "Accesos rapidos segun tus permisos."
  ), [roleKey, serviciosHabilitados]);
  const welcomeTitle = useMemo(() => {
    const safeName = String(nombre || "").trim();
    return safeName ? `Bienvenido, ${safeName}` : "Bienvenido";
  }, [nombre]);
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const panelAccionesRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    ingresosMes: 0,
    ingresosServiciosMes: 0,
    utilidadProductosMes: 0,
    activos: 0,
    entregados: 0,
    totalClientes: 0,
  });
  const [pendientes, setPendientes] = useState([]);
  const [serviciosFiltrados, setServiciosFiltrados] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dataBarras, setDataBarras] = useState([]);
  const [dataPastel, setDataPastel] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [resumenCajaHoy, setResumenCajaHoy] = useState(null);
  const [mostrarPanelNoti, setMostrarPanelNoti] = useState(false);
  const [mostrarPanelCorte, setMostrarPanelCorte] = useState(false);
  const [mostrarCalendarioPanel, setMostrarCalendarioPanel] = useState(false);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState([]);
  const [dismissedTechnicalAlertIds, setDismissedTechnicalAlertIds] = useState([]);
  const [dismissedCommercialAlertIds, setDismissedCommercialAlertIds] = useState([]);
  const [animationsEnabled, setAnimationsEnabled] = useState(() => readAparienciaConfigStorage().animations !== false);
  const [isDarkMode, setIsDarkMode] = useState(() => readAparienciaConfigStorage().themeMode === "oscuro");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [fijarCalendarioPanel, setFijarCalendarioPanel] = useState(() => {
    try {
      return localStorage.getItem("home_calendar_pinned") === "1";
    } catch {
      return false;
    }
  });

  const goToServicio = (folioRaw) => {
    const folioSafe = encodeURIComponent(String(folioRaw || "").trim());
    navigate(`/servicios/${folioSafe}`);
  };

  useEffect(() => {
    Promise.all([
      obtenerKPIsDashboard(),
      obtenerServiciosPendientes(),
      obtenerNotificacionesHome(),
      obtenerResumenCajaHoy(),
      obtenerIngresosPorDia(),
      obtenerIngresosPorTipo(),
    ])
      .then(([kpiData, pend, avisos, corteHoy, barras, pastel]) => {
        setKpis(kpiData);
        setPendientes(pend);
        setServiciosFiltrados(pend);
        setNotificaciones(avisos);
        setResumenCajaHoy(corteHoy);
        setDataBarras(barras);
        setDataPastel(pastel);
      })
      .catch((e) => console.error("Dashboard error:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!panelAccionesRef.current) return;
      if (!panelAccionesRef.current.contains(e.target)) {
        setMostrarPanelNoti(false);
        setMostrarPanelCorte(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("home_calendar_pinned", fijarCalendarioPanel ? "1" : "0");
    } catch {
      // noop
    }
  }, [fijarCalendarioPanel]);

  useEffect(() => {
    const onAparienciaChange = (event) => {
      const next = event?.detail || readAparienciaConfigStorage();
      setAnimationsEnabled(next?.animations !== false);
      setIsDarkMode(next?.themeMode === "oscuro");
    };
    window.addEventListener(APARIENCIA_EVENT, onAparienciaChange);
    return () => window.removeEventListener(APARIENCIA_EVENT, onAparienciaChange);
  }, []);

  const chartTextColor = isDarkMode ? "#cbd5e1" : "#475569";
  const chartGridColor = isDarkMode ? "#334155" : "#dbe3ef";

  const serviciosOrdenados = useMemo(() => [...pendientes].sort((a, b) => {
    const fa = parseFechaAprox(a.fechaAprox);
    const fb = parseFechaAprox(b.fechaAprox);
    return (fa ? fa.getTime() : Number.MAX_SAFE_INTEGER) - (fb ? fb.getTime() : Number.MAX_SAFE_INTEGER);
  }), [pendientes]);
  const serviciosAtrasados = useMemo(() => serviciosOrdenados.filter((s) => {
    const fecha = parseFechaAprox(s.fechaAprox);
    return fecha && fecha < today;
  }), [serviciosOrdenados, today]);
  const serviciosHoy = useMemo(() => serviciosOrdenados.filter((s) => isSameDay(parseFechaAprox(s.fechaAprox), today)), [serviciosOrdenados, today]);
  const serviciosSinFecha = useMemo(() => serviciosOrdenados.filter((s) => !parseFechaAprox(s.fechaAprox)), [serviciosOrdenados]);
  const serviciosListos = useMemo(() => serviciosOrdenados.filter((s) => ["listo", "finalizado"].includes(normalizeStatus(s.status))), [serviciosOrdenados]);
  const serviciosCobrables = useMemo(() => serviciosOrdenados.filter((s) => {
    const status = normalizeStatus(s.status);
    return ["listo", "cancelado", "no_reparable"].includes(status) && Number(s.costo || 0) > 0 && !s.cobradoEnPOS;
  }), [serviciosOrdenados]);
  const flujoTecnico = useMemo(() => {
    const counters = new Map(STATUS.map((item) => [item.value, 0]));
    serviciosOrdenados.forEach((servicio) => {
      const status = statusValueFromRaw(servicio.status);
      counters.set(status, (counters.get(status) || 0) + 1);
    });
    return STATUS.map((item) => ({
      ...item,
      count: counters.get(item.value) || 0,
    }));
  }, [serviciosOrdenados]);
  const flujoTecnicoActivos = useMemo(
    () => flujoTecnico.filter((item) => item.value !== "entregado"),
    [flujoTecnico],
  );
  const flujoTecnicoTotal = useMemo(
    () => flujoTecnicoActivos.reduce((acc, item) => acc + item.count, 0),
    [flujoTecnicoActivos],
  );
  const alertasTecnicas = useMemo(() => serviciosOrdenados
    .map((servicio) => ({ ...servicio, tone: priorityTone(servicio, today) }))
    .sort((a, b) => ({ danger: 0, warning: 1, info: 2, neutral: 3 }[a.tone] - { danger: 0, warning: 1, info: 2, neutral: 3 }[b.tone]))
    .slice(0, 6), [serviciosOrdenados, today]);
  const alertasComerciales = useMemo(() => notificaciones.filter((n) => {
    const id = String(n.id || "");
    return id.includes("stock") || id.includes("tarjeta") || (
      serviciosHabilitados && id.includes("servicios-listos")
    );
  }), [notificaciones, serviciosHabilitados]);
  const notificacionesVisibles = useMemo(
    () => notificaciones.filter((item) => !dismissedNotificationIds.includes(String(item.id || ""))),
    [dismissedNotificationIds, notificaciones],
  );
  const alertasTecnicasVisibles = useMemo(
    () => alertasTecnicas.filter((item) => !dismissedTechnicalAlertIds.includes(String(item.id || item.folio || ""))),
    [alertasTecnicas, dismissedTechnicalAlertIds],
  );
  const alertasComercialesVisibles = useMemo(
    () => alertasComerciales.filter((item) => !dismissedCommercialAlertIds.includes(String(item.id || ""))),
    [alertasComerciales, dismissedCommercialAlertIds],
  );

  const totalHoy = Number(resumenCajaHoy?.resumenHoy?.total || 0);
  const resumenPago = resumenCajaHoy?.resumenHoy || {};
  const ticketsHoy = Number(resumenPago.tickets || 0);

  const weeklyIncomeChart = useMemo(() => {
    const todayRef = new Date();
    const monthRows = Array.isArray(dataBarras) ? dataBarras : [];

    const resolveMonthRow = (date) => {
      if (
        date.getMonth() !== todayRef.getMonth() ||
        date.getFullYear() !== todayRef.getFullYear()
      ) {
        return null;
      }
      return monthRows[date.getDate() - 1] || null;
    };

    const series = Array.from({ length: 7 }, (_, index) => {
      const offset = 6 - index;
      const date = new Date(todayRef.getFullYear(), todayRef.getMonth(), todayRef.getDate() - offset);
      const row = resolveMonthRow(date);
      const total = Number(row?.total || 0);
      return {
        label: formatWeekdayShort(date),
        tooltipLabel: date.toLocaleDateString("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "short",
        }),
        total,
        servicios: Number(row?.servicios || 0),
        utilidadPos: Number(row?.utilidadPos || 0),
      };
    });

    const totals = series.map((item) => item.total);
    const maxValue = Math.max(...totals, 1);
    const average = totals.reduce((acc, value) => acc + value, 0) / Math.max(totals.length, 1);
    const variancePattern = [0.16, 0.08, 0.2, 0.1, 0.18, 0.24, 0.12];

    return series.map((item, index) => ({
      ...item,
      referencia: Math.max(
        item.total,
        Math.round(average + maxValue * variancePattern[index]),
      ),
    }));
  }, [dataBarras]);

  const weeklyIncomeSummary = useMemo(() => {
    const todayRef = new Date();
    const totalsMes = Array.isArray(dataBarras)
      ? dataBarras.map((item) => Number(item?.total || 0))
      : [];

    const resolveMonthTotal = (date) => {
      if (
        date.getMonth() !== todayRef.getMonth() ||
        date.getFullYear() !== todayRef.getFullYear()
      ) {
        return null;
      }
      return Number(totalsMes[date.getDate() - 1] || 0);
    };

    let current = 0;
    let previous = 0;
    let previousDays = 0;

    for (let offset = 0; offset < 7; offset += 1) {
      const currentDate = new Date(todayRef.getFullYear(), todayRef.getMonth(), todayRef.getDate() - offset);
      current += resolveMonthTotal(currentDate) ?? 0;

      const previousDate = new Date(todayRef.getFullYear(), todayRef.getMonth(), todayRef.getDate() - (offset + 7));
      const previousTotal = resolveMonthTotal(previousDate);
      if (previousTotal !== null) {
        previous += previousTotal;
        previousDays += 1;
      }
    }

    const delta = previousDays > 0 && previous > 0
      ? ((current - previous) / previous) * 100
      : null;

    return {
      current,
      previous,
      delta,
    };
  }, [dataBarras]);

  const pieIncomeData = useMemo(() => {
    const total = (dataPastel || []).reduce((acc, item) => acc + Number(item?.value || 0), 0);
    const items = (dataPastel || [])
      .map((item) => {
        const meta = getPieSegmentMeta(item?.name);
        const value = Number(item?.value || 0);
        return {
          ...item,
          value,
          color: meta.color,
          description: meta.description,
          share: total > 0 ? value / total : 0,
        };
      })
      .sort((a, b) => b.value - a.value);

    return {
      total,
      items,
      principal: items[0] || null,
    };
  }, [dataPastel]);

  const renderBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload.find((item) => item?.dataKey === "total")?.payload || payload[0]?.payload;
    if (!row) return null;

    return (
      <div className="chart-bar-tooltip">
        <strong>{row.tooltipLabel}</strong>
        <span>Ingresos: {formatCurrency(row.total)}</span>
        <span>Servicios: {formatCurrency(row.servicios || 0)}</span>
        <span>Utilidad POS: {formatCurrency(row.utilidadPos || 0)}</span>
        <span>Referencia: {formatCurrency(row.referencia)}</span>
      </div>
    );
  };

  const renderPieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;

    return (
      <div className="chart-pie-tooltip">
        <strong>{row.name}</strong>
        <span>{formatCurrency(row.value)} del mes</span>
        <span>{(row.share * 100).toFixed(1)}% del ingreso por tipo</span>
        <small>{row.description}</small>
      </div>
    );
  };

  const barChartHelp =
    "Compara los ingresos cobrados de los ultimos 7 dias contra una referencia visual para detectar picos y caidas de forma rapida.";
  const pieChartHelp =
    "Distribuye los ingresos cobrados del mes por tipo de servicio entregado para identificar que categoria aporta mas al negocio.";

  const filtrarPorFecha = (fecha) => {
    setSelectedDate(fecha);
    if (mostrarTodos) return;
    setServiciosFiltrados(pendientes.filter((s) => isSameDay(parseFechaAprox(s.fechaAprox), fecha)));
  };

  const toggleMostrarTodos = (valor) => {
    setMostrarTodos(valor);
    setServiciosFiltrados(valor ? pendientes : pendientes.filter((s) => isSameDay(parseFechaAprox(s.fechaAprox), selectedDate)));
  };

  if (loading) return <PageLoader text="Cargando dashboard..." />;

  return (
    <div className={`home-page ${premiumState === "free" ? "free-layout" : "premium-layout"} role-${roleKey} ${roleKey === "admin" && (mostrarCalendarioPanel || fijarCalendarioPanel) ? "calendar-layout-pinned" : ""}`}>
      <div className="home-header home-role-header">
        <div className="home-hero-panel">
          <div className="home-role-copy">
            <span className="home-role-eyebrow">{panelTitle}</span>
            <h2>{welcomeTitle}</h2>
            <p className="home-role-subtitle">{panelSubtitle}</p>
          </div>

          {roleKey === "admin" ? (
            <div className="home-header-actions admin-actions" ref={panelAccionesRef}>
              <div className="home-action-anchor">
                <button className="btn-light btn-home-notif" onClick={() => { setMostrarPanelNoti((v) => !v); setMostrarPanelCorte(false); }}>
                  {"\u{1F514}"} Notificaciones ({notificacionesVisibles.length})
                </button>
                {mostrarPanelNoti && (
                  <div className="home-info-popover">
                    <div className="home-info-block">
                      <div className="notifications-header">
                        <div className="notifications-header-actions">
                          <h4>Notificaciones</h4>
                          <span>{notificacionesVisibles.length}</span>
                        </div>
                        <button
                          type="button"
                          className="notifications-close-btn"
                          aria-label="Cerrar notificaciones"
                          onClick={() => setMostrarPanelNoti(false)}
                        >
                          ×
                        </button>
                      </div>
                      {notificacionesVisibles.length === 0 && <p className="notifications-empty">Sin alertas por ahora.</p>}
                      {notificacionesVisibles.map((n) => (
                        <div key={n.id} className={`notification-item ${n.nivel || "baja"}`}>
                          <div className="notification-main">
                            <p className="notification-title">{n.titulo}</p>
                            <p className="notification-detail">{n.detalle}</p>
                          </div>
                          <div className="notification-actions">
                            {n.accion && <button className="btn-light" onClick={() => navigate(n.accion)}>{n.accionTexto || "Ver"}</button>}
                            <button
                              type="button"
                              className="notifications-close-btn"
                              aria-label={`Cerrar alerta ${n.titulo}`}
                              onClick={() => setDismissedNotificationIds((prev) => [...new Set([...prev, String(n.id || "")])])}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="home-action-anchor home-action-anchor-right">
                <button className="btn-light btn-home-corte" onClick={() => { setMostrarPanelCorte((v) => !v); setMostrarPanelNoti(false); }}>
                  {"\u{1F4E6}"} Corte de caja
                </button>
                {mostrarPanelCorte && (
                  <div className="home-corte-popover">
                    {resumenCajaHoy ? (
                      <div className="home-info-block corte-compacto">
                        <div className="corte-header">
                          <h4>Corte de caja de hoy</h4>
                          <span className={resumenCajaHoy.cerrado ? "corte-status closed" : "corte-status open"}>{resumenCajaHoy.cerrado ? "Cerrada" : "Abierta"}</span>
                        </div>
                        <div className="corte-grid">
                          <div><p>Tickets</p><b>{ticketsHoy}</b></div>
                          <div><p>Total</p><b>{formatCurrency(totalHoy)}</b></div>
                        </div>
                        <div className="corte-actions">
                          <button className="btn-light" onClick={async () => {
                            await generarPdfCorteCajaDia(resumenCajaHoy.ventasHoy || [], {
                              corte: resumenCajaHoy.corte || null,
                              fechaKey: resumenCajaHoy?.fechaKey,
                            });
                          }}>
                            Descargar PDF
                          </button>
                          {puede("reportes.ver") && <button className="btn-primary" onClick={() => navigate("/reportes")}>Reportes</button>}
                        </div>
                      </div>
                    ) : <div className="home-info-block"><p className="notifications-empty">No hay informacion de corte disponible.</p></div>}
                  </div>
                )}
              </div>

              {serviciosHabilitados && (
                <button
                  className="btn-light btn-home-calendar-inline"
                  onClick={() => setMostrarCalendarioPanel((v) => !v)}
                >
                  {"\u{1F4C5}"} Calendario
                </button>
              )}
              {serviciosHabilitados && puede("servicios.crear") && (
                <button className="btn-primary" onClick={() => navigate("/hoja_servicio")}>
                  + Nuevo servicio
                </button>
              )}
            </div>
          ) : roleKey === "tecnico" ? (
            <div className="home-tech-actions home-tech-actions-inline">
              {puede("servicios.ver") && <QuickActionCard title="Abrir servicios" description="Seguimiento completo y cambio de estatus." tone="blue" onClick={() => navigate("/servicios")} />}
              {puede("servicios.crear") && <QuickActionCard title="Nuevo servicio" description="Registrar entrada de equipo." tone="green" onClick={() => navigate("/hoja_servicio")} />}
            </div>
          ) : roleKey === "vendedor" ? (
            <div className="home-quick-grid compact home-sales-actions">
              {roleKey === "vendedor" && puede("ventas.pos") && <QuickActionCard title="Abrir POS" description={serviciosHabilitados ? "Cobrar ventas y servicios." : "Cobrar ventas desde caja."} tone="green" onClick={() => navigate("/POS")} />}
              {roleKey === "vendedor" && puede("clientes.ver") && <QuickActionCard title="Clientes" description="Buscar contacto y puntos." tone="blue" onClick={() => navigate("/clientes")} />}
              {roleKey === "vendedor" && puede("productos.ver") && <QuickActionCard title="Inventario" description="Revisar stock y precios." tone="amber" onClick={() => navigate("/productos")} />}
            </div>
          ) : null}
        </div>
      </div>

      {roleKey === "admin" && (
        <>
          <div className="kpi-grid">
            <MetricCard
              tone="green"
              icon={<FiTrendingUp aria-hidden="true" />}
              label="Ingresos del mes"
              value={formatCurrency(kpis.ingresosMes)}
              sublabel={serviciosHabilitados
                ? `Servicios ${formatCurrency(kpis.ingresosServiciosMes || 0)} + utilidad POS ${formatCurrency(kpis.utilidadProductosMes || 0)}`
                : "Ventas cobradas y utilidad del punto de venta."}
            />
            <MetricCard
              tone="blue"
              icon={serviciosHabilitados ? <FiTool aria-hidden="true" /> : <FiFileText aria-hidden="true" />}
              label={serviciosHabilitados ? "Servicios activos" : "Tickets hoy"}
              value={serviciosHabilitados ? kpis.activos : ticketsHoy}
              sublabel={serviciosHabilitados
                ? "Equipos en proceso, revision o listos por entregar"
                : "Ventas registradas en el corte del dia"}
            />
            <MetricCard
              tone="success"
              icon={serviciosHabilitados ? <FiCheckCircle aria-hidden="true" /> : <FiDollarSign aria-hidden="true" />}
              label={serviciosHabilitados ? "Entregados hoy" : "Cobrado hoy"}
              value={serviciosHabilitados ? kpis.entregados : formatCurrency(totalHoy)}
              sublabel={serviciosHabilitados
                ? "Servicios cerrados y entregados en la fecha actual"
                : "Importe acumulado en la caja del dia"}
            />
            <MetricCard
              tone="orange"
              icon={<FiUsers aria-hidden="true" />}
              label="Clientes"
              value={kpis.totalClientes}
              sublabel={serviciosHabilitados
                ? "Base registrada para ventas, servicios y fidelidad"
                : "Base registrada para ventas y fidelidad"}
            />
          </div>
          <div className="charts-grid">
            <div className="chart-card chart-card-bar">
              <div className="chart-card-bar-head">
                <div>
                  <span className="chart-card-kicker">Ingresos ultimos 7 dias</span>
                  <div className="chart-card-bar-metric">
                    <strong>{formatCurrency(weeklyIncomeSummary.current)}</strong>
                    {weeklyIncomeSummary.delta !== null ? (
                      <span className={`chart-card-trend ${weeklyIncomeSummary.delta >= 0 ? "up" : "down"}`}>
                        {weeklyIncomeSummary.delta >= 0 ? "+" : ""}
                        {weeklyIncomeSummary.delta.toFixed(1)}%
                      </span>
                    ) : null}
                  </div>
                  <p>
                    {weeklyIncomeSummary.delta !== null
                      ? `vs. los 7 dias anteriores (${formatCurrency(weeklyIncomeSummary.previous)})`
                      : "Aun no hay una semana previa completa para comparar."}
                  </p>
                </div>

                <div className="chart-card-bar-actions">
                  <div className="chart-card-bar-badge">
                    <span>Semana actual</span>
                  </div>
                  <div className="chart-card-help-wrap">
                    <button
                      type="button"
                      className="chart-card-help"
                      aria-label="Informacion sobre ingresos ultimos 7 dias"
                    >
                      ?
                    </button>
                    <div className="chart-card-help-tooltip" role="tooltip">
                      {barChartHelp}
                    </div>
                  </div>
                </div>
              </div>

              <div className="chart-card-bar-plot">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={weeklyIncomeChart}
                    barCategoryGap="22%"
                    barGap={-18}
                    margin={{ top: 8, right: 6, left: -10, bottom: 2 }}
                  >
                    <defs>
                      <linearGradient id="home-bar-reference" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#9eb3ff" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="#6f86ff" stopOpacity="0.75" />
                      </linearGradient>
                      <linearGradient id="home-bar-current" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5d63ff" />
                        <stop offset="100%" stopColor="#2f25dd" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={chartGridColor} strokeDasharray="4 4" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chartTextColor, fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: chartTextColor, fontSize: 11 }}
                      tickFormatter={formatCompactValue}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                    />
                    <Tooltip
                      isAnimationActive={animationsEnabled}
                      cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                      content={renderBarTooltip}
                    />
                    <Bar
                      dataKey="referencia"
                      fill="url(#home-bar-reference)"
                      radius={[10, 10, 0, 0]}
                      barSize={24}
                      isAnimationActive={animationsEnabled}
                    />
                    <Bar
                      dataKey="total"
                      fill="url(#home-bar-current)"
                      radius={[10, 10, 0, 0]}
                      barSize={14}
                      isAnimationActive={animationsEnabled}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card-bar-legend">
                <span><i className="legend-pill reference"></i> Referencia</span>
                <span><i className="legend-pill current"></i> Ingresos cobrados</span>
              </div>
            </div>
            {serviciosHabilitados && (
              <div className="chart-card chart-card-pie">
              <div className="chart-card-pie-head">
                <div>
                  <span className="chart-card-kicker">Distribucion mensual</span>
                  <h4>Ingresos por tipo de servicio</h4>
                  <p>Cada cuadro explica que linea de trabajo aporta al ingreso cobrado del mes.</p>
                </div>
                <div className="chart-card-pie-actions">
                  <div className="chart-card-pie-total">
                    <span>Total analizado</span>
                    <strong>{formatCurrency(pieIncomeData.total)}</strong>
                  </div>
                  <div className="chart-card-help-wrap">
                    <button
                      type="button"
                      className="chart-card-help"
                      aria-label="Informacion sobre ingresos por tipo de servicio"
                    >
                      ?
                    </button>
                    <div className="chart-card-help-tooltip" role="tooltip">
                      {pieChartHelp}
                    </div>
                  </div>
                </div>
              </div>

              {pieIncomeData.items.length > 0 ? (
                <>
                  <div className="chart-card-pie-shell">
                    <div className="chart-card-pie-plot">
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={pieIncomeData.items}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={64}
                            outerRadius={96}
                            paddingAngle={3}
                            stroke="rgba(255,255,255,0.9)"
                            strokeWidth={5}
                            isAnimationActive={animationsEnabled}
                          >
                            {pieIncomeData.items.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            isAnimationActive={animationsEnabled}
                            content={renderPieTooltip}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="chart-card-pie-center">
                        <span>Categoria lider</span>
                        <strong>{pieIncomeData.principal?.name || "Sin datos"}</strong>
                        <small>
                          {pieIncomeData.principal
                            ? formatCurrency(pieIncomeData.principal.value)
                            : "Aun no hay servicios entregados este mes"}
                        </small>
                      </div>
                    </div>

                    <div className="chart-card-pie-legend">
                      {pieIncomeData.items.map((item) => (
                        <article key={item.name} className="chart-pie-legend-card">
                          <div className="chart-pie-legend-head">
                            <span
                              className="chart-pie-swatch"
                              style={{ background: item.color }}
                            />
                            <strong>{item.name}</strong>
                            <em>{(item.share * 100).toFixed(0)}%</em>
                          </div>
                          <p>{item.description}</p>
                          <small>{formatCurrency(item.value)} acumulados este mes</small>
                        </article>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="chart-card-pie-empty">
                  Aun no hay servicios entregados este mes para dibujar la grafica.
                </div>
              )}
              </div>
            )}
          </div>
        </>
      )}

      {roleKey === "tecnico" && (
        <>
          <div className="kpi-grid">
            <MetricCard tone="blue" icon={<FiTool aria-hidden="true" />} label="Servicios activos" value={serviciosOrdenados.length} />
            <MetricCard tone="orange" icon={<FiClock aria-hidden="true" />} label="Atrasados" value={serviciosAtrasados.length} sublabel="Requieren seguimiento" />
            <MetricCard tone="green" icon={<FiCheckCircle aria-hidden="true" />} label="Listos" value={serviciosListos.length} sublabel="Pendientes de entrega" />
            <MetricCard tone="success" icon={<FiCalendar aria-hidden="true" />} label="Entregas hoy" value={serviciosHoy.length} sublabel="Segun fecha aproximada" />
          </div>
          <div className="home-role-grid home-role-grid-tech">
            <div className="panel-card home-role-card home-role-card-tech-flow">
              <div className="home-role-card-head"><div><h4>Flujo tecnico</h4><p>Estado actual de la carga de trabajo.</p></div></div>
              <div className="home-tech-flow-summary">
                <div className="home-tech-flow-total">
                  <span>Total en seguimiento</span>
                  <strong>{flujoTecnicoTotal}</strong>
                </div>
                <div className="home-tech-flow-legend">
                  <span>{serviciosAtrasados.length} atrasados</span>
                  <span>{serviciosSinFecha.length} sin fecha</span>
                  <span>{serviciosListos.length} listos</span>
                </div>
              </div>
              <div className="home-status-grid">
                {flujoTecnicoActivos.map((item) => (
                  <div
                    key={item.value}
                    className={`home-status-card ${item.count > 0 ? "is-active" : "is-empty"}`}
                    style={{ "--status-color": item.color }}
                  >
                    <span className="home-status-card-label">{item.label}</span>
                    <strong className="home-status-card-value">{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
            <ServiceListCard className="home-role-card-tech-ready" title="Listos para entregar" subtitle="Equipos que ya pueden cerrarse con cliente." services={serviciosListos.slice(0, 5)} emptyText="No hay equipos listos por ahora." onOpen={goToServicio} />
            <div className="panel-card home-role-card home-role-card-tech-priority">
              <div className="home-role-card-head"><div><h4>Prioridades</h4><p>Servicios ordenados por urgencia operativa.</p></div></div>
              {alertasTecnicasVisibles.length === 0 && <p className="home-empty-copy">No hay alertas tecnicas inmediatas.</p>}
              {alertasTecnicasVisibles.map((servicio) => (
                <div key={servicio.id} className={`home-priority-item tone-${servicio.tone}`}>
                  <div>
                    <strong>{servicio.folio || "-"}</strong>
                    <p>{servicio.nombre || "Cliente"} - {servicio.status || "Pendiente"}</p>
                    <small>{servicio.fechaAprox ? `Entrega: ${formatFechaLarga(parseFechaAprox(servicio.fechaAprox))}` : "Sin fecha estimada"}</small>
                  </div>
                  <div className="home-alert-actions">
                    <button type="button" className="btn-light" onClick={() => goToServicio(servicio.folio)}>Abrir</button>
                    <button
                      type="button"
                      className="notifications-close-btn"
                      aria-label={`Cerrar alerta del servicio ${servicio.folio || servicio.id}`}
                      onClick={() => setDismissedTechnicalAlertIds((prev) => [...new Set([...prev, String(servicio.id || servicio.folio || "")])])}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <ServiceListCard className="home-role-card-tech-secondary" title="Sin fecha aproximada" subtitle="Servicios que necesitan promesa de entrega." services={serviciosSinFecha.slice(0, 5)} emptyText="Todos los servicios activos tienen fecha." onOpen={goToServicio} />
          </div>
        </>
      )}

      {roleKey === "vendedor" && (
        <>
          <div className="kpi-grid">
            <MetricCard tone="green" icon={<FiTrendingUp aria-hidden="true" />} label="Venta de hoy" value={formatCurrency(totalHoy)} sublabel={`${ticketsHoy} tickets`} />
            <MetricCard tone="blue" icon={<FiDollarSign aria-hidden="true" />} label="Efectivo" value={formatCurrency(resumenPago.efectivo || 0)} />
            <MetricCard tone="success" icon={<FiCreditCard aria-hidden="true" />} label="Tarjeta" value={formatCurrency(resumenPago.tarjeta || 0)} />
          </div>
          <div className="home-role-grid">
            {serviciosHabilitados && (
              <ServiceListCard title="Servicios por cobrar" subtitle="Listos, cancelados o no reparables con costo." services={serviciosCobrables.slice(0, 6)} emptyText="No hay servicios pendientes de cobro." onOpen={() => navigate("/POS")} sideRenderer={(servicio) => <small>{formatCurrency(servicio.costo || 0)}</small>} />
            )}
            <div className="panel-card home-role-card">
              <div className="home-role-card-head"><div><h4>Resumen rapido de caja</h4><p>Distribucion y volumen acumulado del dia.</p></div></div>
              <div className="home-mini-stats">
                <div className="home-mini-stat"><span>Subtotal</span><strong>{formatCurrency(resumenPago.subtotal || 0)}</strong></div>
                <div className="home-mini-stat"><span>IVA</span><strong>{formatCurrency(resumenPago.iva || 0)}</strong></div>
                <div className="home-mini-stat"><span>Otros</span><strong>{formatCurrency(resumenPago.otros || 0)}</strong></div>
                <div className="home-mini-stat"><span>Unidades</span><strong>{Number(resumenPago.unidades || 0)}</strong></div>
              </div>
            </div>
            <div className="panel-card home-role-card">
              <div className="home-role-card-head"><div><h4>Alertas comerciales</h4><p>Situaciones que afectan venta e inventario.</p></div></div>
              {alertasComercialesVisibles.length === 0 && <p className="home-empty-copy">No hay alertas comerciales importantes hoy.</p>}
              {alertasComercialesVisibles.slice(0, 5).map((item) => (
                <div key={item.id} className="home-alert-row">
                  <div><strong>{item.titulo}</strong><p>{item.detalle}</p></div>
                  <div className="home-alert-actions">
                    {item.accion ? <button type="button" className="btn-light" onClick={() => navigate(item.accion)}>{item.accionTexto || "Ver"}</button> : null}
                    <button
                      type="button"
                      className="notifications-close-btn"
                      aria-label={`Cerrar alerta ${item.titulo}`}
                      onClick={() => setDismissedCommercialAlertIds((prev) => [...new Set([...prev, String(item.id || "")])])}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {serviciosHabilitados && (
              <ServiceListCard title="Listos para entrega" subtitle="Servicios que ya se pueden cerrar con cliente." services={serviciosListos.slice(0, 5)} emptyText="No hay servicios listos por ahora." onOpen={goToServicio} />
            )}
          </div>
        </>
      )}

      {roleKey === "general" && (
        <div className="home-quick-grid">
          {serviciosHabilitados && puede("servicios.ver") && <QuickActionCard title="Servicios" description="Abrir panel de seguimiento." tone="blue" onClick={() => navigate("/servicios")} />}
          {puede("clientes.ver") && <QuickActionCard title="Clientes" description="Consultar historial y contacto." tone="green" onClick={() => navigate("/clientes")} />}
          {puede("ventas.pos") && <QuickActionCard title="Punto de venta" description="Cobrar ventas desde caja." tone="amber" onClick={() => navigate("/POS")} />}
        </div>
      )}

      {roleKey === "admin" && serviciosHabilitados && (
        <>
          <button className={`calendar-side-tab ${mostrarCalendarioPanel || fijarCalendarioPanel ? "open" : ""}`} onClick={() => setMostrarCalendarioPanel((v) => !v)}>
            {"\u{1F4C5}"} Calendario
          </button>
          {(mostrarCalendarioPanel || fijarCalendarioPanel) && (
            <aside className={`calendar-side-drawer ${fijarCalendarioPanel ? "pinned" : ""}`}>
              <div className="calendar-side-actions">
                <button className="btn-light" onClick={() => setMostrarCalendarioPanel(false)}>{"\u{1F441}"} Ocultar</button>
                <button className="btn-light" onClick={() => setFijarCalendarioPanel((prev) => !prev)}>{fijarCalendarioPanel ? "\u{1F4CD} Desfijar" : "\u{1F4CC} Fijar"}</button>
              </div>
              <div className="calendar-box side">
                <h4>Calendario de entregas</h4>
                <Calendar
                  onChange={filtrarPorFecha}
                  value={selectedDate}
                  tileContent={({ date, view }) => {
                    if (view !== "month") return null;
                    const serviciosDelDia = pendientes.filter((s) => isSameDay(parseFechaAprox(s.fechaAprox), date));
                    if (serviciosDelDia.length === 0) return null;
                    const fechaActual = new Date(date);
                    fechaActual.setHours(0, 0, 0, 0);
                    const esAtrasado = fechaActual < today;
                    const esHoy = fechaActual.getTime() === today.getTime();
                    return (
                      <div className="calendar-marker-container">
                        {serviciosDelDia.length > 1 ? (
                          <div className={`calendar-badge ${esAtrasado ? "badge-danger" : esHoy ? "badge-warning" : "badge-primary"}`}>{serviciosDelDia.length}</div>
                        ) : (
                          <div className={`calendar-dot ${esAtrasado ? "dot-danger" : esHoy ? "dot-warning" : "dot-primary"}`} />
                        )}
                      </div>
                    );
                  }}
                />
              </div>
              <div className="panel-card side">
                <div className="panel-header">
                  <h4>Servicios para {selectedDate.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</h4>
                  <label className="checkbox-container">
                    <input type="checkbox" checked={mostrarTodos} onChange={(e) => toggleMostrarTodos(e.target.checked)} />
                    Todos
                  </label>
                </div>
                {serviciosFiltrados.length === 0 && <p>No hay servicios para esta fecha.</p>}
                {serviciosFiltrados.map((s) => (
                  <div key={s.id} className="pending-item">
                    <span>{s.tipoDispositivo} {s.marca} - {s.nombre}</span>
                    <span>{s.folio}</span>
                    <button className="btn-light" onClick={() => goToServicio(s.folio)}>Ver</button>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </>
      )}
      {premiumState === "free" && <Advertising placement="dashboard" />}
    </div>
  );
}
