import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCoffee, FiEdit2, FiList, FiPackage, FiPlus, FiSearch, FiTrash2, FiX } from "react-icons/fi";
import Layout from "../components/Layout";
import {
  actualizarProducto,
  crearProducto,
  eliminarProductoDB,
  obtenerProductos,
  crearCategoriaInventario,
  eliminarCategoriaInventario,
  obtenerCategoriasInventario,
} from "../js/services/POS_firebase";
import "../css/platillos.css";

const DEFAULT_CATEGORIES = ["Entradas", "Platos fuertes", "Bebidas", "Postres", "Otros"];
const EMPTY = { nombre: "", categoria: "Platos fuertes", precioVenta: "", descripcion: "", activo: true, ingredientesHabilitados: false, ingredientes: [] };
const todayKey = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const EMPTY_DAILY_MENU = { nombre: "Menú del día", fechaMenu: todayKey(), precioVenta: "", descripcion: "", platillos: [] };

function mergeCategories(stored = []) {
  const merged = new Map();
  DEFAULT_CATEGORIES.forEach((nombre) => {
    merged.set(nombre.toLowerCase(), {
      id: `default-${nombre.toLowerCase().replace(/\s+/g, "-")}`,
      nombre,
      predeterminada: true,
    });
  });
  stored.forEach((category) => {
    const nombre = String(category?.nombre || "").trim();
    if (nombre) {
      const key = nombre.toLowerCase();
      const defaultCategory = merged.get(key);
      merged.set(key, { ...category, nombre, predeterminada: defaultCategory?.predeterminada === true });
    }
  });
  return [...merged.values()];
}

function PlatillosContent() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState("");
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [ingredientDraft, setIngredientDraft] = useState("");
  const [dailyMenuOpen, setDailyMenuOpen] = useState(false);
  const [dailyMenu, setDailyMenu] = useState(EMPTY_DAILY_MENU);

  const load = async () => setItems(await obtenerProductos());
  const loadCategories = async () => {
    const stored = await obtenerCategoriasInventario();
    setCategories(mergeCategories(stored));
  };
  useEffect(() => {
    let active = true;
    obtenerProductos()
      .then((products) => { if (active) setItems(products); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    obtenerCategoriasInventario()
      .then((stored) => { if (active) setCategories(mergeCategories(stored)); })
      .catch(() => { if (active) setCategories(mergeCategories()); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) =>
      item.tipo === "platillo" &&
      (!term || `${item.nombre} ${item.categoria}`.toLowerCase().includes(term))
    );
  }, [items, search]);

  const save = async (event) => {
    event.preventDefault();
    if (!form.nombre.trim() || Number(form.precioVenta) < 0) return;
    const payload = {
      ...form,
      nombre: form.nombre.trim(),
      precioVenta: Number(form.precioVenta),
      tipo: "platillo",
      stock: 9999,
      ingredientes: form.ingredientesHabilitados ? form.ingredientes : [],
    };
    if (editingId) await actualizarProducto(editingId, payload);
    else await crearProducto(payload);
    setForm(EMPTY); setEditingId(""); setOpen(false); await load();
  };

  const edit = (item) => {
    setEditingId(item.id);
    setForm({ nombre: item.nombre || "", categoria: item.categoria || "Platos fuertes", precioVenta: item.precioVenta ?? "", descripcion: item.descripcion || "", activo: item.activo !== false, ingredientesHabilitados: item.ingredientesHabilitados === true, ingredientes: Array.isArray(item.ingredientes) ? item.ingredientes : [] });
    setOpen(true);
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar este platillo?")) return;
    await eliminarProductoDB(id); await load();
  };

  const addIngredient = () => {
    const value = ingredientDraft.trim();
    if (!value || form.ingredientes.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setForm((old) => ({ ...old, ingredientes: [...old.ingredientes, value] }));
    setIngredientDraft("");
  };

  const addCategory = async (event) => {
    event.preventDefault();
    await crearCategoriaInventario(newCategory);
    setNewCategory("");
    await loadCategories();
  };

  const removeCategory = async (category) => {
    await eliminarCategoriaInventario(category);
    await loadCategories();
  };

  const toggleDailyDish = (item) => setDailyMenu((old) => ({
    ...old,
    platillos: old.platillos.some((dish) => dish.id === item.id)
      ? old.platillos.filter((dish) => dish.id !== item.id)
      : [...old.platillos, { id: item.id, nombre: item.nombre }],
  }));

  const saveDailyMenu = async (event) => {
    event.preventDefault();
    if (!dailyMenu.nombre.trim() || !dailyMenu.fechaMenu || !dailyMenu.platillos.length) return;
    await crearProducto({
      nombre: dailyMenu.nombre.trim(), categoria: "Menú del día",
      precioVenta: Number(dailyMenu.precioVenta || 0),
      descripcion: dailyMenu.descripcion.trim() || dailyMenu.platillos.map((item) => item.nombre).join(" + "),
      tipo: "platillo", stock: 9999, activo: true, menuDelDia: true,
      fechaMenu: dailyMenu.fechaMenu, platillosMenu: dailyMenu.platillos,
      ingredientesHabilitados: false, ingredientes: [],
    });
    setDailyMenu(EMPTY_DAILY_MENU);
    setDailyMenuOpen(false);
    await load();
  };

  return (
    <section className="dish-page">
      <header className="dish-head"><div><span>MENÚ DEL RESTAURANTE</span><h1>Platillos</h1><p>Administra la carta, categorías, ingredientes y precios.</p></div><div className="dish-head-actions"><button type="button" className="dish-daily-btn" onClick={() => { setDailyMenu({ ...EMPTY_DAILY_MENU, fechaMenu: todayKey() }); setDailyMenuOpen(true); }}><FiPlus /> Nuevo menú del día</button><button type="button" className="dish-category-btn" onClick={() => navigate("/productos?catalogo=inventario")}><FiPackage /> Inventario</button><button type="button" className="dish-category-btn" onClick={() => setCategoryOpen(true)}><FiList /> Categorías</button><button type="button" onClick={() => { setForm(EMPTY); setEditingId(""); setIngredientDraft(""); setOpen(true); }}><FiPlus /> Nuevo platillo</button></div></header>
      <label className="dish-search"><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar platillo o categoría..." /></label>
      <div className="dish-grid">{visible.map((item) => <article className="dish-card" key={item.id}><div className="dish-icon"><FiCoffee /></div><small>{item.categoria || "Sin categoría"}</small><h2>{item.nombre}</h2><p>{item.descripcion || "Sin descripción."}</p>{item.ingredientesHabilitados && item.ingredientes?.length ? <div className="dish-ingredients-preview">{item.ingredientes.join(" · ")}</div> : null}<strong>${Number(item.precioVenta || 0).toFixed(2)}</strong><footer><button type="button" onClick={() => edit(item)}><FiEdit2 /> Editar</button><button type="button" className="danger" onClick={() => remove(item.id)}><FiTrash2 /></button></footer></article>)}</div>
      {!visible.length && <div className="dish-empty"><FiCoffee /><strong>No hay platillos</strong><span>Agrega el primer elemento de tu carta.</span></div>}
      {open && <div className="dish-modal-backdrop"><form className="dish-modal" onSubmit={save}><h2>{editingId ? "Editar platillo" : "Nuevo platillo"}</h2><label>Nombre<input required value={form.nombre} onChange={(e) => setForm((old) => ({ ...old, nombre: e.target.value }))} /></label><label>Categoría<select value={form.categoria} onChange={(e) => setForm((old) => ({ ...old, categoria: e.target.value }))}>{categories.map((category) => <option key={category.id} value={category.nombre}>{category.nombre}</option>)}</select></label><label>Precio<input required min="0" step="0.01" type="number" value={form.precioVenta} onChange={(e) => setForm((old) => ({ ...old, precioVenta: e.target.value }))} /></label><label>Descripción<textarea value={form.descripcion} onChange={(e) => setForm((old) => ({ ...old, descripcion: e.target.value }))} /></label><label className="dish-ingredient-toggle"><input type="checkbox" checked={form.ingredientesHabilitados} onChange={(e) => setForm((old) => ({ ...old, ingredientesHabilitados: e.target.checked }))} /> Habilitar ingredientes <small>Opcional</small></label>{form.ingredientesHabilitados && <div className="dish-ingredient-editor"><div><input value={ingredientDraft} onChange={(e) => setIngredientDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addIngredient(); } }} placeholder="Ej. Tomate, lechuga..." /><button type="button" onClick={addIngredient}><FiPlus /></button></div><div className="dish-ingredient-chips">{form.ingredientes.map((ingredient) => <span key={ingredient}>{ingredient}<button type="button" onClick={() => setForm((old) => ({ ...old, ingredientes: old.ingredientes.filter((item) => item !== ingredient) }))}><FiX /></button></span>)}</div></div>}<div><button type="button" className="soft" onClick={() => setOpen(false)}>Cancelar</button><button type="submit">Guardar platillo</button></div></form></div>}
      {dailyMenuOpen && <div className="dish-modal-backdrop"><form className="dish-modal dish-daily-modal" onSubmit={saveDailyMenu}><h2>Nuevo menú del día</h2><p>Combina platillos de tu carta para una fecha y un precio especial.</p><label>Nombre<input required value={dailyMenu.nombre} onChange={(e) => setDailyMenu((old) => ({ ...old, nombre: e.target.value }))} /></label><label>Fecha<input required type="date" value={dailyMenu.fechaMenu} onChange={(e) => setDailyMenu((old) => ({ ...old, fechaMenu: e.target.value }))} /></label><label>Precio del menú<input required min="0" step="0.01" type="number" value={dailyMenu.precioVenta} onChange={(e) => setDailyMenu((old) => ({ ...old, precioVenta: e.target.value }))} /></label><label>Descripción<textarea value={dailyMenu.descripcion} onChange={(e) => setDailyMenu((old) => ({ ...old, descripcion: e.target.value }))} placeholder="Ej. Incluye entrada, plato fuerte y bebida." /></label><fieldset className="dish-daily-list"><legend>Platillos incluidos</legend>{items.filter((item) => item.tipo === "platillo" && !item.menuDelDia && item.activo !== false).map((item) => <label key={item.id}><input type="checkbox" checked={dailyMenu.platillos.some((dish) => dish.id === item.id)} onChange={() => toggleDailyDish(item)} /><span><strong>{item.nombre}</strong><small>{item.categoria}</small></span></label>)}</fieldset>{!dailyMenu.platillos.length && <small className="dish-daily-help">Selecciona al menos un platillo.</small>}<div><button type="button" className="soft" onClick={() => setDailyMenuOpen(false)}>Cancelar</button><button type="submit" disabled={!dailyMenu.platillos.length}>Crear menú</button></div></form></div>}
      {categoryOpen && <div className="dish-modal-backdrop"><section className="dish-modal dish-category-modal"><h2>Categorías</h2><form onSubmit={addCategory}><input required value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nueva categoría" /><button type="submit"><FiPlus /> Agregar</button></form><div>{categories.map((category) => <p key={category.id}><span>{category.nombre}{category.predeterminada ? <small>Predeterminada</small> : null}</span>{!category.predeterminada && <button type="button" onClick={() => removeCategory(category)}><FiTrash2 /></button>}</p>)}</div><footer><button type="button" className="soft" onClick={() => setCategoryOpen(false)}>Cerrar</button></footer></section></div>}
    </section>
  );
}

export default function Platillos({ embedded = false }) {
  return embedded ? <PlatillosContent /> : <Layout restaurantMode><PlatillosContent /></Layout>;
}
