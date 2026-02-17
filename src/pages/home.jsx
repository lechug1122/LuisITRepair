import "../css/home.css";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

import {
  obtenerKPIsDashboard,
  obtenerServiciosPendientes,
  obtenerNotificacionesHome,
} from "../js/services/home";
import { obtenerResumenCajaHoy } from "../js/services/corte_caja_firestore";
import { generarPdfCorteCajaDia } from "../js/services/pdf_corte_caja";

import {
  obtenerIngresosPorDia,
  obtenerIngresosPorTipo,
} from "../js/services/home_charts_firestore";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export default function Home() {
  const navigate = useNavigate();

  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [loading, setLoading] = useState(true);

  const [kpis, setKpis] = useState({
    ingresosMes: 0,
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
  const [fijarCalendarioPanel, setFijarCalendarioPanel] = useState(() => {
    try {
      return localStorage.getItem("home_calendar_pinned") === "1";
    } catch {
      return false;
    }
  });
  const panelAccionesRef = useRef(null);

  useEffect(() => {
    async function cargarDashboard() {
      try {
        const kpiData = await obtenerKPIsDashboard();
        const pend = await obtenerServiciosPendientes();
        const avisos = await obtenerNotificacionesHome();
        const corteHoy = await obtenerResumenCajaHoy();
        const barras = await obtenerIngresosPorDia();
        const pastel = await obtenerIngresosPorTipo();

        setKpis(kpiData);
        setPendientes(pend);
        setServiciosFiltrados(pend);
        setNotificaciones(avisos);
        setResumenCajaHoy(corteHoy);
        setDataBarras(barras);
        setDataPastel(pastel);
      } catch (e) {
        console.error("Dashboard error:", e);
      } finally {
        setLoading(false);
      }
    }

    cargarDashboard();
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!panelAccionesRef.current) return;
      if (!panelAccionesRef.current.contains(e.target)) {
        setMostrarPanelNoti(false);
        setMostrarPanelCorte(false);
      }
    }
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

  function filtrarPorFecha(fecha) {
    setSelectedDate(fecha);

    if (mostrarTodos) return;

    const lista = pendientes.filter((s) => {
      if (!s.fechaAprox) return false;

      const fechaServicio = new Date(s.fechaAprox + "T00:00:00");

      return (
        fechaServicio.getDate() === fecha.getDate() &&
        fechaServicio.getMonth() === fecha.getMonth() &&
        fechaServicio.getFullYear() === fecha.getFullYear()
      );
    });

    setServiciosFiltrados(lista);
  }

  function toggleMostrarTodos(valor) {
    setMostrarTodos(valor);

    if (valor) {
      setServiciosFiltrados(pendientes);
    } else {
      filtrarPorFecha(selectedDate);
    }
  }

  function toggleFijarCalendario() {
    setFijarCalendarioPanel((prev) => {
      const next = !prev;
      setMostrarCalendarioPanel(next);
      return next;
    });
  }

  if (loading) {
    return <div className="home-page">Cargando dashboard...</div>;
  }

  return (
    <div className={`home-page ${fijarCalendarioPanel ? "calendar-layout-pinned" : ""}`}>
      <div className="home-header">
        <h2>Dashboard</h2>

        <div className="home-header-actions" ref={panelAccionesRef}>
          <button
            className="btn-light btn-home-notif"
            onClick={() => {
              setMostrarPanelNoti((v) => !v);
              setMostrarPanelCorte(false);
            }}
          >
            {"\u{1F514}"} Notificaciones ({notificaciones.length})
          </button>

          <button
            className="btn-light btn-home-corte"
            onClick={() => {
              setMostrarPanelCorte((v) => !v);
              setMostrarPanelNoti(false);
            }}
          >
            {"\u{1F4E6}"} Corte de caja
          </button>

          <button className="btn-primary" onClick={() => navigate("/hoja_servicio")}>+ Nuevo servicio</button>

          {mostrarPanelNoti && (
            <div className="home-info-popover">
              <div className="home-info-block">
                <div className="notifications-header">
                  <h4>Notificaciones</h4>
                  <span>{notificaciones.length}</span>
                </div>

                {notificaciones.length === 0 && (
                  <p className="notifications-empty">Sin alertas por ahora.</p>
                )}

                {notificaciones.map((n) => (
                  <div key={n.id} className={`notification-item ${n.nivel || "baja"}`}>
                    <div className="notification-main">
                      <p className="notification-title">{n.titulo}</p>
                      <p className="notification-detail">{n.detalle}</p>
                    </div>
                    {n.accion && (
                      <button className="btn-light" onClick={() => navigate(n.accion)}>
                        {n.accionTexto || "Ver"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mostrarPanelCorte && (
            <div className="home-corte-popover">
              {resumenCajaHoy ? (
                <div className="home-info-block corte-compacto">
                  <div className="corte-header">
                    <h4>Corte de caja de hoy</h4>
                    <span className={resumenCajaHoy.cerrado ? "corte-status closed" : "corte-status open"}>
                      {resumenCajaHoy.cerrado ? "Cerrada" : "Abierta"}
                    </span>
                  </div>

                  <div className="corte-grid">
                    <div>
                      <p>Tickets</p>
                      <b>{resumenCajaHoy.resumenHoy.tickets}</b>
                    </div>
                    <div>
                      <p>Total</p>
                      <b>
                        {Number(resumenCajaHoy.resumenHoy.total || 0).toLocaleString("es-MX", {
                          style: "currency",
                          currency: "MXN",
                        })}
                      </b>
                    </div>
                  </div>

                  <div className="corte-actions">
                    <button
                      className="btn-light"
                      onClick={async () => {
                        await generarPdfCorteCajaDia(resumenCajaHoy.ventasHoy || [], {
                          corte: resumenCajaHoy.corte || null,
                          fechaKey: resumenCajaHoy?.fechaKey,
                        });
                      }}
                    >
                      Descargar PDF
                    </button>
                    <button className="btn-primary" onClick={() => navigate("/reportes")}>
                      Reportes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="home-info-block">
                  <p className="notifications-empty">No hay informacion de corte disponible.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card green">
          <span>{"\u{1F4B0}"}</span>
          <div>
            <p>Ingresos del mes</p>
            <h3>
              {Number(kpis.ingresosMes || 0).toLocaleString("es-MX", {
                style: "currency",
                currency: "MXN",
              })}
            </h3>
          </div>
        </div>

        <div className="kpi-card blue">
          <span>{"\u{1F527}"}</span>
          <div>
            <p>Servicios activos</p>
            <h3>{kpis.activos}</h3>
          </div>
        </div>

        <div className="kpi-card success">
          <span>{"\u{2705}"}</span>
          <div>
            <p>Entregados</p>
            <h3>{kpis.entregados}</h3>
          </div>
        </div>

        <div className="kpi-card orange">
          <span>{"\u{1F464}"}</span>
          <div>
            <p>Clientes</p>
            <h3>{kpis.totalClientes}</h3>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h4>Ingresos del mes</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dataBarras}>
              <XAxis dataKey="dia" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h4>Ingresos por tipo</h4>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={dataPastel} dataKey="value" nameKey="name" outerRadius={90} label>
                {dataPastel.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      entry.name === "PC"
                        ? "#2563eb"
                        : entry.name === "LAPTOP"
                        ? "#22c55e"
                        : entry.name === "IMPRESORA"
                        ? "#f59e0b"
                        : entry.name === "MONITOR"
                        ? "#ef4444"
                        : "#8b5cf6"
                    }
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <button
        className={`calendar-side-tab ${mostrarCalendarioPanel || fijarCalendarioPanel ? "open" : ""}`}
        onClick={() => setMostrarCalendarioPanel((v) => !v)}
      >
        {"\u{1F4C5}"} Calendario
      </button>

      {(mostrarCalendarioPanel || fijarCalendarioPanel) && (
        <aside className={`calendar-side-drawer ${fijarCalendarioPanel ? "pinned" : ""}`}>
          <div className="calendar-side-actions">
            <button className="btn-light" onClick={() => setMostrarCalendarioPanel(false)}>
              {"\u{1F441}"} Ocultar
            </button>
            <button className="btn-light" onClick={toggleFijarCalendario}>
              {fijarCalendarioPanel ? "\u{1F4CD} Desfijar" : "\u{1F4CC} Fijar"}
            </button>
          </div>

          <div className="calendar-box side">
            <h4>Calendario de entregas</h4>
            <Calendar
              onChange={filtrarPorFecha}
              value={selectedDate}
              tileContent={({ date, view }) => {
                if (view !== "month") return null;

                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);

                const serviciosDelDia = pendientes.filter((s) => {
                  if (!s.fechaAprox) return false;

                  const fechaServicio = new Date(s.fechaAprox + "T00:00:00");

                  return (
                    fechaServicio.getDate() === date.getDate() &&
                    fechaServicio.getMonth() === date.getMonth() &&
                    fechaServicio.getFullYear() === date.getFullYear()
                  );
                });

                if (serviciosDelDia.length === 0) return null;

                const fechaActual = new Date(date);
                fechaActual.setHours(0, 0, 0, 0);

                const esAtrasado = fechaActual < hoy;
                const esHoy = fechaActual.getTime() === hoy.getTime();

                return (
                  <div className="calendar-marker-container">
                    {serviciosDelDia.length > 1 ? (
                      <div
                        className={`calendar-badge ${
                          esAtrasado ? "badge-danger" : esHoy ? "badge-warning" : "badge-primary"
                        }`}
                      >
                        {serviciosDelDia.length}
                      </div>
                    ) : (
                      <div
                        className={`calendar-dot ${
                          esAtrasado ? "dot-danger" : esHoy ? "dot-warning" : "dot-primary"
                        }`}
                      ></div>
                    )}
                  </div>
                );
              }}
            />
          </div>

          <div className="panel-card side">
            <div className="panel-header">
              <h4>
                Servicios para{" "}
                {selectedDate.toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </h4>

              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={mostrarTodos}
                  onChange={(e) => toggleMostrarTodos(e.target.checked)}
                />
                Todos
              </label>
            </div>

            {serviciosFiltrados.length === 0 && <p>No hay servicios para esta fecha.</p>}

            {serviciosFiltrados.map((s) => (
              <div key={s.id} className="pending-item">
                <span>
                  {s.tipoDispositivo} {s.marca} - {s.nombre}
                </span>
                <span>{s.folio}</span>
                <button className="btn-light" onClick={() => navigate(`/servicios/${s.folio}`)}>
                  Ver
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
