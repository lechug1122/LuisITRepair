import "../css/home.css";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

import {
  obtenerKPIsDashboard,
  obtenerServiciosPendientes,
} from "../js/services/home";

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

  /* =========================
     CARGAR DASHBOARD
  ========================= */
  useEffect(() => {
    async function cargarDashboard() {
      try {
        const kpiData = await obtenerKPIsDashboard();
        const pend = await obtenerServiciosPendientes();
        const barras = await obtenerIngresosPorDia();
        const pastel = await obtenerIngresosPorTipo();

        setKpis(kpiData);
        setPendientes(pend);
        setServiciosFiltrados(pend);
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

  /* =========================
     FILTRAR POR FECHA
  ========================= */
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

  /* =========================
     TOGGLE MOSTRAR TODOS
  ========================= */
  function toggleMostrarTodos(valor) {
    setMostrarTodos(valor);

    if (valor) {
      setServiciosFiltrados(pendientes);
    } else {
      filtrarPorFecha(selectedDate);
    }
  }

  if (loading) {
    return <div className="home-page">Cargando dashboard...</div>;
  }

  return (
    <div className="home-page">

      {/* HEADER */}
      <div className="home-header">
        <h2>Dashboard</h2>
        <button
          className="btn-primary"
          onClick={() => navigate("/hoja_servicio")}
        >
          + Nuevo servicio
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card green">
          <span>💰</span>
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
          <span>🔧</span>
          <div>
            <p>Servicios activos</p>
            <h3>{kpis.activos}</h3>
          </div>
        </div>

        <div className="kpi-card success">
          <span>✅</span>
          <div>
            <p>Entregados</p>
            <h3>{kpis.entregados}</h3>
          </div>
        </div>

        <div className="kpi-card orange">
          <span>👤</span>
          <div>
            <p>Clientes</p>
            <h3>{kpis.totalClientes}</h3>
          </div>
        </div>
      </div>

      {/* GRÁFICAS */}
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
              <Pie
                data={dataPastel}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label
              >
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

      {/* CALENDARIO + SERVICIOS */}
      <div className="calendar-services-container">

        <div className="calendar-box">
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
              esAtrasado
                ? "badge-danger"
                : esHoy
                ? "badge-warning"
                : "badge-primary"
            }`}
          >
            {serviciosDelDia.length}
          </div>
        ) : (
          <div
            className={`calendar-dot ${
              esAtrasado
                ? "dot-danger"
                : esHoy
                ? "dot-warning"
                : "dot-primary"
            }`}
          ></div>
        )}
      </div>
    );
  }}
/>
        </div>

        <div className="panel-card">

          {/* HEADER DEL PANEL */}
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
              Mostrar todos
            </label>
          </div>

          {serviciosFiltrados.length === 0 && (
            <p>No hay servicios para esta fecha 📅</p>
          )}

          {serviciosFiltrados.map((s) => (
            <div key={s.id} className="pending-item">
              <span>
                {s.tipoDispositivo} {s.marca} – {s.nombre}
              </span>
              <span>{s.folio}</span>
              <button
                className="btn-light"
                onClick={() => navigate(`/servicios/${s.folio}`)}
              >
                Ver
              </button>
            </div>
          ))}

        </div>

      </div>

    </div>
  );
}
