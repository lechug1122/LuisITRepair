import { useEffect, useMemo, useState } from "react";
import { FiBox, FiGift, FiPercent, FiPlus, FiSave, FiShoppingCart, FiTag, FiTrash2, FiX } from "react-icons/fi";
import { obtenerProductos } from "../js/services/POS_firebase";
import "../css/promocion_regla_modal.css";

const TIPOS = [
  ["compra_obten", "Compra X, obtén Y", <FiShoppingCart />],
  ["descuento_en", "Descuento en Y", <FiTag />],
  ["precio_especial", "Precio especial", <FiPercent />],
  ["productos_diferentes", "Productos diferentes", <FiBox />],
];

export default function PromocionReglaModal({ abierto, editando, form, cambiar, error, guardando, onClose, onSubmit }) {
  const [productos, setProductos] = useState([]);
  useEffect(() => {
    if (abierto) obtenerProductos().then(setProductos).catch(() => setProductos([]));
  }, [abierto]);
  const requerimientos = useMemo(() => (
    Array.isArray(form.requerimientos) && form.requerimientos.length
      ? form.requerimientos
      : [{ productoId: form.productoRequeridoId || "", productoNombre: form.productoRequeridoNombre || "", cantidad: form.cantidadRequerida || 1 }]
  ), [form.cantidadRequerida, form.productoRequeridoId, form.productoRequeridoNombre, form.requerimientos]);
  const productoRequerido = useMemo(() => productos.find((p) => String(p.id) === String(requerimientos[0]?.productoId || "")), [requerimientos, productos]);
  const productoBeneficiado = useMemo(() => productos.find((p) => String(p.id) === form.productoBeneficiadoId), [form.productoBeneficiadoId, productos]);
  const actualizarProducto = (campo, id) => {
    const producto = productos.find((p) => String(p.id) === id);
    cambiar(`${campo}Id`, id);
    cambiar(`${campo}Nombre`, producto?.nombre || "");
    if (campo === "productoRequerido" && mismoProducto) {
      cambiar("productoBeneficiadoId", id);
      cambiar("productoBeneficiadoNombre", producto?.nombre || "");
    }
  };
  const mismoProducto = form.promocionTipo !== "productos_diferentes";
  const actualizarRequerimiento = (indice, campo, valor) => {
    const siguientes = requerimientos.map((requisito, posicion) => {
      if (posicion !== indice) return requisito;
      if (campo === "productoId") {
        const producto = productos.find((item) => String(item.id) === String(valor));
        return { ...requisito, productoId: valor, productoNombre: producto?.nombre || "" };
      }
      return { ...requisito, cantidad: valor };
    });
    cambiar("requerimientos", siguientes);
    if (indice === 0) {
      cambiar("productoRequeridoId", siguientes[0].productoId);
      cambiar("productoRequeridoNombre", siguientes[0].productoNombre);
      cambiar("cantidadRequerida", siguientes[0].cantidad);
      if (mismoProducto) {
        cambiar("productoBeneficiadoId", siguientes[0].productoId);
        cambiar("productoBeneficiadoNombre", siguientes[0].productoNombre);
      }
    }
  };
  const agregarRequerimiento = () => cambiar("requerimientos", [...requerimientos, { productoId: "", productoNombre: "", cantidad: 1 }]);
  const eliminarRequerimiento = (indice) => {
    if (requerimientos.length === 1) return;
    const siguientes = requerimientos.filter((_, posicion) => posicion !== indice);
    cambiar("requerimientos", siguientes);
    if (indice === 0) {
      cambiar("productoRequeridoId", siguientes[0].productoId);
      cambiar("productoRequeridoNombre", siguientes[0].productoNombre);
      cambiar("cantidadRequerida", siguientes[0].cantidad);
    }
  };
  if (!abierto) return null;
  const beneficioTexto = form.beneficioTipo === "gratis" ? `${form.cantidadBeneficiada} gratis` : form.beneficioTipo === "porcentaje" ? `${form.beneficioValor || 0}% de descuento` : form.beneficioTipo === "precio_especial" ? `a $${form.beneficioValor || 0}` : `$${form.beneficioValor || 0} de descuento`;
  return <div className="pr-window-backdrop" onMouseDown={onClose}><form className="pr-window" onSubmit={onSubmit} onMouseDown={(e) => e.stopPropagation()}>
    <header><span><FiGift /></span><div><small>{editando ? "EDITAR PROMOCIÓN" : "REGISTRAR PROMOCIÓN"}</small><h2>{editando ? "Editar" : "Crear"} promoción</h2><p>Configura la oferta o beneficio que se aplicará en tus productos.</p></div><button type="button" onClick={onClose}><FiX /></button></header>
    <nav className="pr-types"><b>Tipo de promoción:</b>{TIPOS.map(([id, label, icon]) => <button type="button" key={id} className={form.promocionTipo === id ? "active" : ""} onClick={() => { cambiar("promocionTipo", id); if (id === "compra_obten") cambiar("beneficioTipo", "gratis"); if (id === "descuento_en") cambiar("beneficioTipo", "monto"); if (id === "precio_especial") cambiar("beneficioTipo", "precio_especial"); }}>{icon}{label}</button>)}</nav>
    <div className="pr-body"><section className="pr-form"><label><b>Nombre de la promoción</b><span className="pr-name"><FiTag /><input required value={form.nombre} onChange={(e) => cambiar("nombre", e.target.value)} placeholder="Ej. Compra 2 y la 3.ª gratis" /></span></label><div className="pr-two"><label><b>Vigencia</b><input required type="date" value={form.fechaInicio} onChange={(e) => cambiar("fechaInicio", e.target.value)} /></label><label><b>Fecha de término</b><input required type="date" min={form.fechaInicio} value={form.fechaFin} onChange={(e) => cambiar("fechaFin", e.target.value)} /></label></div><label className="pr-switch"><input type="checkbox" checked={form.activo} onChange={(e) => cambiar("activo", e.target.checked)} /><span /> Promoción activa</label>
      <article className="pr-requirements"><h3><FiShoppingCart /> Compra (requerimientos) <small>{requerimientos.length} producto{requerimientos.length === 1 ? "" : "s"}</small></h3><div>{requerimientos.map((requisito, indice) => <div className="pr-requirement-row" key={`requisito-${indice}`}><label><b>Producto requerido {indice + 1}</b><select required value={requisito.productoId} onChange={(e) => actualizarRequerimiento(indice, "productoId", e.target.value)}><option value="">Selecciona...</option>{productos.map((p) => <option key={p.id} value={p.id} disabled={requerimientos.some((item, posicion) => posicion !== indice && String(item.productoId) === String(p.id))}>{p.nombre}</option>)}</select></label><label><b>Cantidad</b><input required type="number" min="1" value={requisito.cantidad} onChange={(e) => actualizarRequerimiento(indice, "cantidad", e.target.value)} /></label>{requerimientos.length > 1 && <button className="pr-remove-requirement" type="button" onClick={() => eliminarRequerimiento(indice)} aria-label={`Eliminar producto requerido ${indice + 1}`} title="Eliminar requisito"><FiTrash2 /></button>}</div>)}<button className="pr-add-requirement" type="button" onClick={agregarRequerimiento}><FiPlus /> Agregar otro producto requerido</button></div></article>
      <article className="benefit"><h3><FiGift /> Beneficio</h3><div className="pr-two"><label><b>Tipo de beneficio</b><select value={form.beneficioTipo} onChange={(e) => cambiar("beneficioTipo", e.target.value)}><option value="gratis">Producto gratis</option><option value="monto">Monto de descuento</option><option value="porcentaje">Porcentaje de descuento</option><option value="precio_especial">Precio especial</option></select></label><label><b>Producto beneficiado</b><select required disabled={mismoProducto} value={mismoProducto ? form.productoRequeridoId : form.productoBeneficiadoId} onChange={(e) => actualizarProducto("productoBeneficiado", e.target.value)}><option value="">Selecciona...</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label></div><div className="pr-two compact"><label><b>Cantidad beneficiada</b><input type="number" min="1" value={form.cantidadBeneficiada} onChange={(e) => cambiar("cantidadBeneficiada", e.target.value)} /></label>{form.beneficioTipo !== "gratis" && <label><b>{form.beneficioTipo === "porcentaje" ? "Porcentaje" : form.beneficioTipo === "precio_especial" ? "Precio especial" : "Descuento"}</b><input type="number" min="0.01" step="0.01" value={form.beneficioValor} onChange={(e) => cambiar("beneficioValor", e.target.value)} /></label>}</div></article>
    </section><aside className="pr-preview"><h3><FiGift /> Vista previa de la promoción</h3><div className="pr-preview-card"><FiGift /><div><strong>Compra {requerimientos.map((requisito) => `${requisito.cantidad || 0} ${requisito.productoNombre || "producto"}`).join(" + ")}</strong><span>y obtén {beneficioTexto} {productoBeneficiado?.nombre || productoRequerido?.nombre || ""}</span></div></div><article><h3>Condiciones</h3><p>✓ Deben cumplirse todos los productos requeridos</p><p>✓ {form.acumulable ? "Acumulable" : "No acumulable"} con otras promociones</p><p>✓ Vigente únicamente entre las fechas indicadas</p></article><label><b>Descripción</b><textarea rows="5" value={form.descripcion} onChange={(e) => cambiar("descripcion", e.target.value)} placeholder="Describe la promoción..." /></label></aside></div>
    {error && <div className="pr-error">{error}</div>}<footer><button type="button" onClick={onClose}><FiX /> Cancelar</button><button className="primary" disabled={guardando}><FiSave /> {guardando ? "Guardando..." : "Guardar promoción"}</button></footer>
  </form></div>;
}
