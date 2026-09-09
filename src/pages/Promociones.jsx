import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiCheckCircle, FiEdit2, FiGift, FiPercent, FiPlus, FiSearch, FiShield, FiTag, FiTrash2, FiX } from "react-icons/fi";
import Layout from "../components/Layout";
import PromocionDescuentoModal from "../components/PromocionDescuentoModal";
import PromocionReglaModal from "../components/PromocionReglaModal";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { cambiarEstadoPromocionDescuento, eliminarPromocionDescuento, escucharPromocionesDescuentos, guardarPromocionDescuento } from "../js/services/promociones_descuentos_firestore";
import "../css/promociones.css";
import "../css/descuentos.css";

const FORM_INICIAL = { nombre: "", descripcion: "", tipo: "porcentaje", valor: "", aplicaA: "todos", fechaInicio: "", fechaFin: "", autorizacion: "sin_autorizacion", objetivoIds: [], objetivoNombres: [], promocionTipo: "compra_obten", productoRequeridoId: "", productoRequeridoNombre: "", cantidadRequerida: 2, requerimientos: [{ productoId: "", productoNombre: "", cantidad: 2 }], beneficioTipo: "gratis", productoBeneficiadoId: "", productoBeneficiadoNombre: "", cantidadBeneficiada: 1, beneficioValor: "", acumulable: false, activo: true };
const tipoLabel = { porcentaje: "Porcentaje", monto_fijo: "Monto fijo", precio_especial: "Precio especial" };
const aplicaLabel = { todos: "Toda la venta", productos: "Productos seleccionados", categoria: "Una categoría", clientes: "Clientes seleccionados" };
const autorizacionLabel = { sin_autorizacion: "Sin autorización", supervisor: "Supervisor", administrador: "Administrador" };

function formatoFecha(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
function estadoItem(item) {
  if (!item.activo) return "Inactivo";
  const hoy = new Date().toISOString().slice(0, 10);
  if (item.fechaInicio > hoy) return "Programado";
  if (item.fechaFin < hoy) return "Finalizado";
  return "Activo";
}

export default function Promociones() {
  const { puede } = useAutorizacionActual();
  const puedePromociones = puede("promociones.gestionar");
  const puedeDescuentos = puede("descuentos.gestionar");
  const [seccion, setSeccion] = useState(puedePromociones ? "promocion" : "descuento");
  const [items, setItems] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [modal, setModal] = useState(false);
  const [editandoId, setEditandoId] = useState("");
  const [form, setForm] = useState(FORM_INICIAL);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => escucharPromocionesDescuentos(
    (data) => { setItems(data); setCargando(false); },
    (err) => { setError(err?.message || "No se pudieron cargar los datos."); setCargando(false); },
  ), []);
  useEffect(() => {
    if (seccion === "promocion" && !puedePromociones && puedeDescuentos) setSeccion("descuento");
    if (seccion === "descuento" && !puedeDescuentos && puedePromociones) setSeccion("promocion");
  }, [puedeDescuentos, puedePromociones, seccion]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return items.filter((item) => item.clase === seccion && (!texto || `${item.nombre} ${item.descripcion}`.toLowerCase().includes(texto)));
  }, [busqueda, items, seccion]);

  const abrirNuevo = () => { setEditandoId(""); setForm(FORM_INICIAL); setError(""); setModal(true); };
  const abrirEditar = (item) => {
    setEditandoId(item.id);
    setForm({
      nombre: String(item.nombre || ""),
      descripcion: String(item.descripcion || ""),
      tipo: item.tipo || "porcentaje",
      valor: item.valor == null ? "" : String(item.valor),
      aplicaA: item.aplicaA || "todos",
      fechaInicio: String(item.fechaInicio || ""),
      fechaFin: String(item.fechaFin || ""),
      autorizacion: item.autorizacion || "sin_autorizacion",
      objetivoIds: Array.isArray(item.objetivoIds) ? item.objetivoIds : [],
      objetivoNombres: Array.isArray(item.objetivoNombres) ? item.objetivoNombres : [],
      promocionTipo: item.promocionTipo || "compra_obten",
      productoRequeridoId: item.productoRequeridoId || "",
      productoRequeridoNombre: item.productoRequeridoNombre || "",
      cantidadRequerida: Number(item.cantidadRequerida || 2),
      requerimientos: Array.isArray(item.requerimientos) && item.requerimientos.length
        ? item.requerimientos.map((requisito) => ({
          productoId: String(requisito.productoId || ""),
          productoNombre: String(requisito.productoNombre || ""),
          cantidad: Number(requisito.cantidad || 1),
        }))
        : [{
          productoId: item.productoRequeridoId || "",
          productoNombre: item.productoRequeridoNombre || "",
          cantidad: Number(item.cantidadRequerida || 2),
        }],
      beneficioTipo: item.beneficioTipo || "gratis",
      productoBeneficiadoId: item.productoBeneficiadoId || "",
      productoBeneficiadoNombre: item.productoBeneficiadoNombre || "",
      cantidadBeneficiada: Number(item.cantidadBeneficiada || 1),
      beneficioValor: item.beneficioValor == null ? "" : String(item.beneficioValor),
      acumulable: item.acumulable === true,
      activo: item.activo !== false,
    });
    setError("");
    setModal(true);
  };
  const cambiar = (campo, valor) => setForm((actual) => ({ ...actual, [campo]: valor }));
  const guardar = async (event) => {
    event.preventDefault(); setGuardando(true); setError("");
    try {
      await guardarPromocionDescuento({ ...form, clase: seccion }, editandoId);
      setModal(false); setAviso(`${seccion === "promocion" ? "Promoción" : "Descuento"} ${editandoId ? "actualizado" : "creado"} correctamente.`);
    } catch (err) { setError(err?.message || "No se pudo guardar."); }
    finally { setGuardando(false); }
  };
  const alternar = async (item) => {
    try { await cambiarEstadoPromocionDescuento(item.id, !item.activo); }
    catch (err) { setError(err?.message || "No se pudo cambiar el estado."); }
  };
  const eliminar = async (item) => {
    if (!window.confirm(`¿Eliminar “${item.nombre}”? Esta acción no se puede deshacer.`)) return;
    try { await eliminarPromocionDescuento(item.id); setAviso("Registro eliminado correctamente."); }
    catch (err) { setError(err?.message || "No se pudo eliminar."); }
  };
  const esPromo = seccion === "promocion";

  return <Layout><main className="promos-page">
    <header className="promos-header"><div><span className="promos-eyebrow"><FiTag /> Ventas</span><h1>{esPromo ? "Promociones" : "Descuentos"}</h1><p>{esPromo ? "Administra campañas y ofertas programadas." : "Administra reglas directas y autorizaciones para caja."}</p></div><button className="promos-primary" type="button" onClick={abrirNuevo}><FiPlus /> {esPromo ? "Nueva promoción" : "Nuevo descuento"}</button></header>
    <nav className="promo-section-switch">
      {puedePromociones && <button type="button" className={esPromo ? "active" : ""} onClick={() => setSeccion("promocion")}><span><FiGift /></span><div><strong>Promociones</strong><small>Campañas, ofertas y vigencias</small></div></button>}
      {puedeDescuentos && <button type="button" className={!esPromo ? "active" : ""} onClick={() => setSeccion("descuento")}><span><FiPercent /></span><div><strong>Descuentos</strong><small>Reglas directas y autorizaciones</small></div></button>}
    </nav>
    {aviso && <div className="promos-notice"><FiCheckCircle /><span>{aviso}</span><button onClick={() => setAviso("")}><FiX /></button></div>}
    {error && !modal && <div className="promos-notice promo-error"><FiX /><span>{error}</span><button onClick={() => setError("")}><FiX /></button></div>}
    <section className="promos-summary">
      <article><span className="summary-icon green"><FiCheckCircle /></span><div><small>Activos</small><strong>{items.filter((x) => x.clase === seccion && estadoItem(x) === "Activo").length}</strong><em>vigentes actualmente</em></div></article>
      <article><span className="summary-icon blue"><FiCalendar /></span><div><small>Programados</small><strong>{items.filter((x) => x.clase === seccion && estadoItem(x) === "Programado").length}</strong><em>inician próximamente</em></div></article>
      <article><span className="summary-icon violet"><FiTag /></span><div><small>Total registrado</small><strong>{items.filter((x) => x.clase === seccion).length}</strong><em>en este negocio</em></div></article>
      <article><span className="summary-icon amber"><FiShield /></span><div><small>Fuera de vigencia</small><strong>{items.filter((x) => x.clase === seccion && ["Inactivo", "Finalizado"].includes(estadoItem(x))).length}</strong><em>inactivos o finalizados</em></div></article>
    </section>
    <section className="promos-panel discount-panel"><div className="discount-heading"><div><h2>{esPromo ? "Campañas registradas" : "Reglas de descuento"}</h2><p>Las fechas determinan cuándo estará disponible cada registro.</p></div><label className="promos-search"><FiSearch /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={`Buscar ${esPromo ? "promoción" : "descuento"}...`} /></label></div>
      <div className="discount-table-wrap"><table className="discount-table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Valor</th><th>Aplicación</th><th>Fecha de inicio</th><th>Fecha de finalización</th>{!esPromo && <th>Autorización</th>}<th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibles.map((item) => <tr key={item.id}><td><span className="discount-name-icon"><FiTag /></span><strong>{item.nombre}</strong></td><td>{tipoLabel[item.tipo]}</td><td><b>{item.tipo === "porcentaje" ? `${item.valor}%` : `$${Number(item.valor).toFixed(2)}`}</b></td><td>{aplicaLabel[item.aplicaA] || item.aplicaA}</td><td><span className="discount-date"><FiCalendar /> {formatoFecha(item.fechaInicio)}</span></td><td><span className="discount-date end"><FiCalendar /> {formatoFecha(item.fechaFin)}</span></td>{!esPromo && <td><span className="authorization-chip"><FiShield /> {autorizacionLabel[item.autorizacion]}</span></td>}<td><button type="button" className={`discount-state ${estadoItem(item).toLowerCase()}`} onClick={() => alternar(item)}>{estadoItem(item)}</button></td><td><div className="discount-actions"><button onClick={() => abrirEditar(item)} title="Editar"><FiEdit2 /></button><button className="danger" onClick={() => eliminar(item)} title="Eliminar"><FiTrash2 /></button></div></td></tr>)}</tbody></table>{cargando && <div className="promos-empty"><p>Cargando información...</p></div>}{!cargando && !visibles.length && <div className="promos-empty"><FiTag /><h2>No hay registros</h2><p>Crea el primero con el botón superior.</p></div>}</div>
    </section>
  </main>
  {esPromo ? <PromocionReglaModal
    abierto={modal}
    editando={!!editandoId}
    form={form}
    cambiar={cambiar}
    error={error}
    guardando={guardando}
    onClose={() => setModal(false)}
    onSubmit={guardar}
  /> : <PromocionDescuentoModal
    abierto={modal}
    esPromo={esPromo}
    editando={!!editandoId}
    form={form}
    cambiar={cambiar}
    error={error}
    guardando={guardando}
    onClose={() => setModal(false)}
    onSubmit={guardar}
  />}
  </Layout>;
}
