import { useEffect, useMemo, useRef, useState } from "react";
import { FiCalendar, FiCheck, FiChevronDown, FiCreditCard, FiDollarSign, FiEdit2, FiFilter, FiPhone, FiPlus, FiSearch, FiTrendingUp, FiX } from "react-icons/fi";
import Layout from "../components/Layout";
import useMonedaConfig from "../hooks/useMonedaConfig";
import { listarClientes } from "../js/services/clientes_firestore";
import { actualizarNotasFiado, crearFiado, escucharFiados, registrarPagoFiado } from "../js/services/fiados_firestore";
import "../css/fiado.css";

const hoyLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fechaVista = (raw) => raw ? new Date(`${String(raw).slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX") : "-";
const iniciales = (nombre) => String(nombre || "?").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const estadoCuenta = (cuenta) => {
  if (Number(cuenta.saldo || 0) <= 0) return { label: "Liquidado", tone: "paid" };
  const dias = Math.ceil((new Date(`${cuenta.fechaVencimiento}T23:59:59`) - new Date()) / 86400000);
  if (String(cuenta.fechaVencimiento || "") < hoyLocal()) return { label: "Vencido", tone: "overdue" };
  if (dias <= 7) return { label: "Por vencer", tone: "upcoming" };
  return { label: "Al día", tone: "current" };
};

export default function Fiado() {
  const { formatCurrency } = useMonedaConfig();
  const pagoRef = useRef(null);
  const [cuentas, setCuentas] = useState([]), [clientes, setClientes] = useState([]);
  const [seleccionId, setSeleccionId] = useState(""), [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState("activas"), [filtro, setFiltro] = useState("todos");
  const [modal, setModal] = useState(false), [cargando, setCargando] = useState(true), [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(""), [pago, setPago] = useState({ monto: "", metodo: "Efectivo" });
  const [editandoNotas, setEditandoNotas] = useState(false), [notas, setNotas] = useState("");
  const [form, setForm] = useState({ clienteId: "", monto: "", limiteCredito: "", diasCredito: 30, descripcion: "", notas: "" });

  useEffect(() => escucharFiados((items) => { setCuentas(items); setSeleccionId((id) => id && items.some((c) => c.id === id) ? id : items[0]?.id || ""); setCargando(false); }, () => setCargando(false)), []);
  useEffect(() => { listarClientes({ max: 500 }).then(setClientes).catch(() => setClientes([])); }, []);
  const seleccion = cuentas.find((c) => c.id === seleccionId) || null;
  useEffect(() => { setNotas(seleccion?.notas || ""); setEditandoNotas(false); }, [seleccion?.id, seleccion?.notas]);

  const visibles = useMemo(() => cuentas.filter((cuenta) => {
    const estado = estadoCuenta(cuenta), texto = `${cuenta.clienteNombre} ${cuenta.clienteTelefono}`.toLowerCase();
    if (busqueda && !texto.includes(busqueda.toLowerCase())) return false;
    if (tab === "activas" && estado.tone === "paid") return false;
    if (tab === "vencidas" && estado.tone !== "overdue") return false;
    if (tab === "liquidadas" && estado.tone !== "paid") return false;
    if (tab === "pagos" && !(cuenta.movimientos || []).some((m) => Number(m.abono) > 0)) return false;
    return filtro === "todos" || estado.tone === filtro;
  }), [busqueda, cuentas, filtro, tab]);
  const metricas = useMemo(() => {
    const activas = cuentas.filter((c) => Number(c.saldo) > 0), vencidas = activas.filter((c) => estadoCuenta(c).tone === "overdue"), proximas = activas.filter((c) => estadoCuenta(c).tone === "upcoming");
    return { total: activas.reduce((s, c) => s + Number(c.saldo || 0), 0), activas: activas.length, vencido: vencidas.reduce((s, c) => s + Number(c.saldo || 0), 0), vencidas: vencidas.length, proximo: proximas.reduce((s, c) => s + Number(c.saldo || 0), 0), proximas: proximas.length };
  }, [cuentas]);

  const handleNuevo = async (e) => { e.preventDefault(); const cliente = clientes.find((c) => c.id === form.clienteId); try { setGuardando(true); setMensaje(""); const id = await crearFiado({ ...form, clienteNombre: cliente?.nombre, clienteTelefono: cliente?.telefono }); setSeleccionId(id); setModal(false); setForm({ clienteId: "", monto: "", limiteCredito: "", diasCredito: 30, descripcion: "", notas: "" }); setMensaje("Cuenta de fiado creada correctamente."); } catch (error) { setMensaje(error.message || "No se pudo crear la cuenta."); } finally { setGuardando(false); } };
  const handlePago = async () => { if (!seleccion) return; try { setGuardando(true); setMensaje(""); await registrarPagoFiado(seleccion.id, pago); setPago({ monto: "", metodo: "Efectivo" }); setMensaje("Pago registrado correctamente."); } catch (error) { setMensaje(error.message || "No se pudo registrar el pago."); } finally { setGuardando(false); } };
  const guardarNotas = async () => { if (!seleccion) return; try { setGuardando(true); await actualizarNotasFiado(seleccion.id, notas); setEditandoNotas(false); setMensaje("Notas actualizadas."); } catch { setMensaje("No se pudieron guardar las notas."); } finally { setGuardando(false); } };
  const cambiarFiltro = () => setFiltro((v) => ({ todos: "overdue", overdue: "upcoming", upcoming: "current", current: "todos" }[v]));
  const filtroLabel = { todos: "Filtrar", overdue: "Vencido", upcoming: "Por vencer", current: "Al día" }[filtro];

  return <Layout><main className="fiado-page">
    <header className="fiado-head"><div><span className="fiado-title-icon"><FiCreditCard /></span><div><h1>Fiado</h1><p>Administra las cuentas de tus clientes</p></div></div>
    </header>
    {mensaje && <div className="fiado-message">{mensaje}<button onClick={() => setMensaje("")}><FiX /></button></div>}
    <section className="fiado-metrics"><article><i className="metric-blue"><FiCreditCard /></i><div><small>Total por cobrar</small><strong>{formatCurrency(metricas.total)}</strong><span>De {metricas.activas} clientes</span></div></article><article><i className="metric-green"><FiTrendingUp /></i><div><small>Cuentas activas</small><strong>{metricas.activas}</strong><span>Con saldo pendiente</span></div></article><article><i className="metric-orange"><FiCalendar /></i><div><small>Vencidos</small><strong className="danger">{formatCurrency(metricas.vencido)}</strong><span>En {metricas.vencidas} cuentas</span></div></article><article><i className="metric-purple"><FiCalendar /></i><div><small>Por vencer (7 días)</small><strong>{formatCurrency(metricas.proximo)}</strong><span>En {metricas.proximas} cuentas</span></div></article></section>
    <nav className="fiado-tabs">{[["activas", "Cuentas activas"], ["pagos", "Historial de pagos"], ["vencidas", "Cuentas vencidas"], ["liquidadas", "Cuentas liquidadas"]].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <section className="fiado-workspace"><aside className="fiado-client-panel"><div className="fiado-search"><label><FiSearch /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente..." /></label><button className={filtro !== "todos" ? "active" : ""} onClick={cambiarFiltro}><FiFilter /> {filtroLabel}</button></div><div className="fiado-client-list">{cargando ? <div className="fiado-empty">Cargando cuentas...</div> : visibles.length === 0 ? <div className="fiado-empty"><strong>No hay cuentas en esta vista</strong><span>Crea un nuevo fiado o cambia los filtros.</span></div> : visibles.map((cuenta) => { const estado = estadoCuenta(cuenta); return <article role="button" tabIndex="0" onClick={() => setSeleccionId(cuenta.id)} onKeyDown={(e) => e.key === "Enter" && setSeleccionId(cuenta.id)} className={cuenta.id === seleccionId ? "selected" : ""} key={cuenta.id}><span className="fiado-avatar">{iniciales(cuenta.clienteNombre)}</span><div><strong>{cuenta.clienteNombre}</strong><small>Último movimiento: {fechaVista(cuenta.actualizadoISO)}</small></div><div className={`fiado-client-balance tone-${estado.tone}`}><b>{formatCurrency(cuenta.saldo)}</b><span>{estado.label}</span></div></article>; })}</div><button className="fiado-more">{visibles.length} cuenta(s) mostradas <FiChevronDown /></button></aside>
      <section className="fiado-detail">{!seleccion ? <div className="fiado-detail-empty"><FiCreditCard /><h2>Selecciona una cuenta</h2><p>El detalle y sus movimientos aparecerán aquí.</p></div> : <><header><span className="fiado-avatar large">{iniciales(seleccion.clienteNombre)}</span><div><h2>{seleccion.clienteNombre}</h2><p><FiPhone /> {seleccion.clienteTelefono || "Sin teléfono"}</p></div><aside><small>Saldo actual</small><strong>{formatCurrency(seleccion.saldo)}</strong><span className={`tone-${estadoCuenta(seleccion).tone}`}>{estadoCuenta(seleccion).label}</span></aside></header><article className="fiado-info-card"><h3><FiCreditCard /> Información de la cuenta</h3><div><p><span>Límite de crédito</span><strong>{formatCurrency(seleccion.limiteCredito)}</strong></p><p><span>Saldo disponible</span><strong className="success">{formatCurrency(Math.max(0, Number(seleccion.limiteCredito) - Number(seleccion.saldo)))}</strong></p><p><span>Días de crédito</span><strong>{seleccion.diasCredito} días</strong></p><p><span>Fecha de vencimiento</span><strong>{fechaVista(seleccion.fechaVencimiento)}</strong></p></div></article><article className="fiado-movements"><h3><FiCalendar /> Movimientos de la cuenta</h3><div className="fiado-table-wrap"><table><thead><tr><th>Fecha</th><th>Descripción</th><th>Cargo</th><th>Abono</th><th>Saldo</th></tr></thead><tbody>{(seleccion.movimientos || []).map((m) => <tr key={m.id}><td>{fechaVista(m.fecha)}</td><td>{m.descripcion}</td><td>{m.cargo ? formatCurrency(m.cargo) : "-"}</td><td>{m.abono ? formatCurrency(m.abono) : "-"}</td><td className={Number(m.saldo) > 0 ? "balance-due" : "balance-paid"}>{formatCurrency(m.saldo)}</td></tr>)}</tbody></table></div></article></>}</section>
    </section>
  </main></Layout>;
}
