import { useCallback, useEffect, useMemo, useState } from "react";
import { listarServiciosPendientes, listarServiciosHistorial } from "../js/services/servicios_firestore";
import { useNavigate } from "react-router-dom";
import "../css/servicios.css";

const normalizarEstado = (raw) => String(raw || "pendiente").toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "_");

function formatFecha(valor) {
  const fecha = typeof valor?.toDate === "function" ? valor.toDate()
    : valor?.seconds ? new Date(valor.seconds * 1000) : valor ? new Date(valor) : null;
  return fecha && !Number.isNaN(fecha.getTime())
    ? fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : "Sin fecha";
}

export default function Servicios() {
  const [tab, setTab] = useState("pendientes");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("todos");
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  const abrirServicio = (folio) => navigate(`/servicios/${encodeURIComponent(String(folio || "").trim())}`);
  const cargar = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const data = tab === "pendientes" ? await listarServiciosPendientes() : await listarServiciosHistorial();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("No se pudieron cargar los servicios", err);
      setItems([]); setError("No pudimos cargar los servicios. Intenta nuevamente.");
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { cargar(); }, [cargar, reloadKey]);
  useEffect(() => { setBusqueda(""); setEstado("todos"); }, [tab]);

  const estados = useMemo(() => {
    const mapa = new Map();
    items.forEach((s) => mapa.set(normalizarEstado(s.status), String(s.status || "Pendiente")));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [items]);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es");
    return items.filter((s) => {
      const texto = [s.folio, s.nombre, s.telefono, s.tipoDispositivo, s.marca, s.modelo, s.trabajo].filter(Boolean).join(" ").toLocaleLowerCase("es");
      return (estado === "todos" || normalizarEstado(s.status) === estado) && (!termino || texto.includes(termino));
    });
  }, [items, busqueda, estado]);

  const resumen = useMemo(() => {
    const contar = (lista) => items.filter((s) => lista.includes(normalizarEstado(s.status))).length;
    return {
      total: items.length,
      pendientes: contar(["pendiente", "revision", "en_revision"]),
      proceso: contar(["en_proceso", "proceso", "en_reparacion", "reparacion", "espera_refaccion", "en_espera_de_refaccion"]),
      listos: contar(["listo", "finalizado", "completado"]),
    };
  }, [items]);
  const hayFiltros = Boolean(busqueda.trim()) || estado !== "todos";
  const limpiar = () => { setBusqueda(""); setEstado("todos"); };

  return <div className="servicios-page"><section className="servicios-shell">
    <header className="servicios-hero">
      <div><span className="servicios-eyebrow">Centro de trabajo</span><h1>Servicios técnicos</h1><p>Consulta, organiza y da seguimiento a cada equipo desde un solo lugar.</p></div>
      <button className="servicios-primary" type="button" onClick={() => navigate("/hoja_servicio")}><span>＋</span> Nuevo servicio</button>
    </header>

    <div className="servicios-summary" aria-label="Resumen de servicios">
      <article className="servicios-kpi kpi-total"><span className="kpi-icon">▦</span><div><small>Total</small><strong>{resumen.total}</strong></div></article>
      <article className="servicios-kpi kpi-pending"><span className="kpi-icon">◷</span><div><small>Por revisar</small><strong>{resumen.pendientes}</strong></div></article>
      <article className="servicios-kpi kpi-process"><span className="kpi-icon">⚙</span><div><small>En proceso</small><strong>{resumen.proceso}</strong></div></article>
      <article className="servicios-kpi kpi-ready"><span className="kpi-icon">✓</span><div><small>Listos</small><strong>{resumen.listos}</strong></div></article>
    </div>

    <div className="servicios-workspace">
      <div className="servicios-toolbar-top">
        <div className="servicios-tabs" role="tablist">
          <button className={`tab-bn ${tab === "pendientes" ? "active" : ""}`} onClick={() => setTab("pendientes")} type="button" role="tab" aria-selected={tab === "pendientes"}>Activos</button>
          <button className={`tab-bn ${tab === "historial" ? "active" : ""}`} onClick={() => setTab("historial")} type="button" role="tab" aria-selected={tab === "historial"}>Historial</button>
        </div>
        <button className="servicios-refresh" type="button" onClick={() => setReloadKey((n) => n + 1)} disabled={loading}><span>↻</span> {loading ? "Actualizando" : "Actualizar"}</button>
      </div>

      <div className="servicios-filters">
        <label className="servicios-search"><span>⌕</span><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por folio, cliente, teléfono o equipo" />{busqueda && <button type="button" onClick={() => setBusqueda("")} aria-label="Borrar búsqueda">×</button>}</label>
        <label className="servicios-select-wrap"><span>Estado</span><select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="todos">Todos los estados</option>{estados.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="servicios-results-row"><p><strong>{filtrados.length}</strong> {filtrados.length === 1 ? "servicio encontrado" : "servicios encontrados"}</p>{hayFiltros && <button type="button" onClick={limpiar}>Limpiar filtros</button>}</div>

      {loading && <div className="servicios-state"><span className="servicios-spinner"/><h2>Cargando servicios</h2><p>Estamos preparando la información.</p></div>}
      {!loading && error && <div className="servicios-state servicios-error"><span>!</span><h2>No se pudo cargar</h2><p>{error}</p><button type="button" onClick={() => setReloadKey((n) => n + 1)}>Reintentar</button></div>}
      {!loading && !error && filtrados.length === 0 && <div className="servicios-state"><span>⌕</span><h2>{hayFiltros ? "Sin coincidencias" : "Todo está al día"}</h2><p>{hayFiltros ? "Prueba con otro término o limpia los filtros." : "No hay servicios para mostrar en esta sección."}</p>{hayFiltros && <button type="button" onClick={limpiar}>Limpiar filtros</button>}</div>}

      {!loading && !error && filtrados.length > 0 && <>
        <div className="tabla-wrapper only-desktop"><div className="tabla-box"><table className="tabla-servicios">
          <thead><tr><th>Servicio</th><th>Cliente</th><th>Equipo</th><th>Ingreso</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>{filtrados.map((s) => <tr key={s.id || s.folio} onDoubleClick={() => abrirServicio(s.folio)}>
            <td><b className="table-folio">#{s.folio || "Sin folio"}</b><span className="table-description">{s.trabajo || "Sin descripción"}</span></td>
            <td><b>{s.nombre || "Sin cliente"}</b><span className="table-secondary">{s.telefono || "Sin teléfono"}</span></td>
            <td><b className="tipo-col">{s.tipoDispositivo || "Sin especificar"}</b><span className="table-secondary">{[s.marca, s.modelo].filter(Boolean).join(" · ") || "Sin marca o modelo"}</span></td>
            <td>{formatFecha(s.createdAt)}</td><td><span className={`estado-badge estado-${normalizarEstado(s.status)}`}><i/>{s.status || "Pendiente"}</span></td>
            <td><button className="btn-ver" onClick={() => abrirServicio(s.folio)} type="button">Ver detalle <span>›</span></button></td>
          </tr>)}</tbody>
        </table></div></div>
        <div className="cards-wrapper only-mobile">{filtrados.map((s) => <article key={s.id || s.folio} className="serv-card" onClick={() => abrirServicio(s.folio)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") abrirServicio(s.folio); }}>
          <div className="serv-card-top"><div><span className="muted">Folio</span><b className="folio">#{s.folio || "Sin folio"}</b></div><span className={`estado-badge estado-${normalizarEstado(s.status)}`}><i/>{s.status || "Pendiente"}</span></div>
          <h2>{s.nombre || "Cliente sin nombre"}</h2><p className="serv-card-equipment">{s.tipoDispositivo || "Equipo sin especificar"}{[s.marca,s.modelo].filter(Boolean).length ? ` · ${[s.marca,s.modelo].filter(Boolean).join(" ")}` : ""}</p>
          <p className="serv-card-description">{s.trabajo || "Sin descripción del trabajo"}</p><div className="serv-card-footer"><span>Ingreso: {formatFecha(s.createdAt)}</span><button type="button" onClick={(e) => { e.stopPropagation(); abrirServicio(s.folio); }}>Abrir ›</button></div>
        </article>)}</div>
      </>}
    </div>
  </section></div>;
}
