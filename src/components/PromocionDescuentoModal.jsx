import { useEffect, useMemo, useState } from "react";
import { FiBox, FiCalendar, FiPercent, FiSave, FiSearch, FiTag, FiTrash2, FiX } from "react-icons/fi";
import { obtenerProductos } from "../js/services/POS_firebase";
import "../css/promocion_descuento_modal.css";

export default function PromocionDescuentoModal({ abierto, esPromo, editando, form, cambiar, error, guardando, onClose, onSubmit }) {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const vista = form.aplicaA === "categoria" ? "categoria" : form.aplicaA === "productos" ? "productos" : "todos";

  useEffect(() => {
    if (!abierto) return;
    obtenerProductos().then(setProductos).catch(() => setProductos([]));
  }, [abierto]);

  const categorias = useMemo(() => [...new Set(productos.map((p) => String(p.categoria || "Sin categoría")).filter(Boolean))].sort(), [productos]);
  const lista = useMemo(() => productos.filter((p) => `${p.nombre || ""} ${p.codigoBarras || p.sku || ""}`.toLowerCase().includes(busqueda.toLowerCase())), [busqueda, productos]);
  const ids = Array.isArray(form.objetivoIds) ? form.objetivoIds : [];
  const nombres = Array.isArray(form.objetivoNombres) ? form.objetivoNombres : [];

  const cambiarVista = (next) => {
    cambiar("aplicaA", next === "categoria" ? "categoria" : next === "productos" ? "productos" : "todos");
    if (next === "todos") { cambiar("objetivoIds", []); cambiar("objetivoNombres", []); }
  };
  const toggle = (id, nombre) => {
    const existe = ids.includes(id);
    cambiar("objetivoIds", existe ? ids.filter((x) => x !== id) : [...ids, id]);
    cambiar("objetivoNombres", existe ? nombres.filter((_, i) => ids[i] !== id) : [...nombres, nombre]);
  };

  if (!abierto) return null;
  return <div className="pd-window-backdrop" onMouseDown={onClose}>
    <form className="pd-window" onSubmit={onSubmit} onMouseDown={(e) => e.stopPropagation()}>
      <header className="pd-window-header"><span className="pd-window-icon"><FiTag /></span><div><small>{editando ? "EDITAR REGISTRO" : "NUEVO REGISTRO"}</small><h2>{editando ? "Editar" : "Crear"} {esPromo ? "promoción" : "descuento"}</h2><p>Completa la información para guardar {esPromo ? "la promoción" : "el descuento"}.</p></div><button type="button" onClick={onClose}><FiX /></button></header>
      <div className="pd-window-body">
        <section className="pd-details"><h3>1. Detalles {esPromo ? "de la promoción" : "del descuento"}</h3>
          <label className="pd-full"><b>Nombre</b><input required value={form.nombre} onChange={(e) => cambiar("nombre", e.target.value)} placeholder={esPromo ? "Ej. Promoción de verano" : "Ej. Descuento de verano"} /></label>
          <div className="pd-two"><label><b>Tipo</b><select value={form.tipo} onChange={(e) => cambiar("tipo", e.target.value)}><option value="porcentaje">Porcentaje (%)</option><option value="monto_fijo">Monto fijo ($)</option><option value="precio_especial">Precio especial</option></select></label><label><b>Valor</b><span className="pd-input-affix"><input required type="number" min="0.01" step="0.01" value={form.valor} onChange={(e) => cambiar("valor", e.target.value)} /> <i>{form.tipo === "porcentaje" ? "%" : "$"}</i></span></label></div>
          <div className="pd-two"><label><b>Fecha de inicio</b><span className="pd-input-icon"><FiCalendar /><input required type="date" value={form.fechaInicio} onChange={(e) => cambiar("fechaInicio", e.target.value)} /></span></label><label><b>Fecha de finalización</b><span className="pd-input-icon"><FiCalendar /><input required type="date" min={form.fechaInicio} value={form.fechaFin} onChange={(e) => cambiar("fechaFin", e.target.value)} /></span></label></div>
          <div className="pd-two"><label><b>Aplica a</b><select value={form.aplicaA} onChange={(e) => cambiarVista(e.target.value === "categoria" ? "categoria" : e.target.value === "productos" ? "productos" : "todos")}><option value="todos">Toda la venta</option><option value="categoria">Categorías seleccionadas</option><option value="productos">Productos seleccionados</option></select></label>{!esPromo && <label><b>Autorización requerida</b><select value={form.autorizacion} onChange={(e) => cambiar("autorizacion", e.target.value)}><option value="sin_autorizacion">Sin autorización</option><option value="supervisor">Supervisor</option><option value="administrador">Administrador</option></select></label>}</div>
          <label className="pd-full"><b>Descripción (opcional)</b><textarea rows="4" value={form.descripcion} onChange={(e) => cambiar("descripcion", e.target.value)} placeholder="Agrega una descripción..." /></label>
          <label className="pd-switch"><input type="checkbox" checked={form.activo} onChange={(e) => cambiar("activo", e.target.checked)} /><span /><div><b>Activo</b><small>Estará disponible durante las fechas indicadas.</small></div></label>
        </section>
        <section className="pd-target"><h3>2. Aplicar a</h3><p>Selecciona las categorías o productos a los que se aplicará.</p>
          <nav><button type="button" className={vista === "todos" ? "active" : ""} onClick={() => cambiarVista("todos")}>Todos</button><button type="button" className={vista === "categoria" ? "active" : ""} onClick={() => cambiarVista("categoria")}>Categorías</button><button type="button" className={vista === "productos" ? "active" : ""} onClick={() => cambiarVista("productos")}><FiBox /> Productos</button></nav>
          {vista === "todos" ? <div className="pd-all"><FiBox /><h4>Aplicar a toda la venta</h4><p>No necesitas seleccionar elementos individuales.</p></div> : <>
            <label className="pd-search"><FiSearch /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={`Buscar ${vista === "productos" ? "productos" : "categorías"}...`} /></label>
            {!!ids.length && <div className="pd-selected"><header><b>Seleccionados ({ids.length})</b><button type="button" onClick={() => { cambiar("objetivoIds", []); cambiar("objetivoNombres", []); }}><FiTrash2 /> Limpiar selección</button></header><div>{nombres.map((nombre, i) => <button type="button" key={ids[i]} onClick={() => toggle(ids[i], nombre)}>{nombre} <FiX /></button>)}</div></div>}
            <div className="pd-picker"><header><span>Seleccionar</span><small>{vista === "productos" ? lista.length : categorias.length} disponibles</small></header>{(vista === "productos" ? lista.map((p) => ({ id: p.id, nombre: p.nombre || "Sin nombre", detalle: p.codigoBarras || p.sku || "Sin código" })) : categorias.filter((c) => c.toLowerCase().includes(busqueda.toLowerCase())).map((c) => ({ id: c, nombre: c, detalle: "Categoría" }))).map((item) => <label key={item.id}><input type="checkbox" checked={ids.includes(item.id)} onChange={() => toggle(item.id, item.nombre)} /><b>{item.nombre}</b><small>{item.detalle}</small></label>)}</div>
          </>}
        </section>
      </div>
      {error && <div className="pd-error"><FiX /> {error}</div>}
      <footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={guardando}><FiSave /> {guardando ? "Guardando..." : `Guardar ${esPromo ? "promoción" : "descuento"}`}</button></footer>
    </form>
  </div>;
}
