import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import "../css/productos.css";
import imgProductsUrl from "../img/img_products.png";
import { auth } from "../initializer/firebase";
import {
  obtenerProductos,
  crearProducto,
  actualizarProducto,
  eliminarProductoDB,
  obtenerCategoriasInventario,
  crearCategoriaInventario,
  eliminarCategoriaInventario,
} from "../js/services/POS_firebase";
import { buscarProductoCatalogoPorCodigo } from "../js/services/catalogo_barras";
import {
  readInventarioConfigStorage,
  saveInventarioConfigStorage,
} from "../js/services/inventario_config";

const TIPO_OPTIONS = ["producto", "refaccion", "servicio", "accesorio", "consumible"];
const UNIDAD_OPTIONS = ["Pza", "Caja", "Paquete", "Juego", "Kit", "Litro", "Metro"];
const ESTADO_OPTIONS = ["Activo", "Inactivo", "Descontinuado"];
const OBJETO_IMPUESTO_OPTIONS = [
  { value: "01", label: "01 - No objeto de impuesto" },
  { value: "02", label: "02 - Si objeto de impuesto" },
  { value: "03", label: "03 - Si objeto y no obligado al desglose" },
];
const IVA_OPTIONS = ["0", "8", "16"];
const CONTEO_INVENTARIO_STORAGE_KEY = "inventario_conteo_meta_v1";
const INVENTARIO_EXCEL_COLUMNS = [
  { key: "codigo", label: "Codigo" },
  { key: "nombre", label: "Producto" },
  { key: "sku", label: "SKU" },
  { key: "categoria", label: "Categoria" },
  { key: "marca", label: "Marca" },
  { key: "tipo", label: "Tipo" },
  { key: "proveedorPrincipal", label: "Proveedor" },
  { key: "ubicacion", label: "Ubicacion" },
  { key: "unidadMedida", label: "Unidad" },
  { key: "descripcion", label: "Descripcion" },
  { key: "precioCompra", label: "Precio compra" },
  { key: "ultimoCosto", label: "Ultimo costo" },
  { key: "precioVenta", label: "Precio venta" },
  { key: "stock", label: "Stock" },
  { key: "stockMinimo", label: "Stock minimo" },
  { key: "stockMaximo", label: "Stock maximo" },
  { key: "puntoReorden", label: "Punto reorden" },
  { key: "compatibilidad", label: "Compatibilidad" },
  { key: "claveSat", label: "Clave SAT" },
  { key: "claveUnidadSat", label: "Clave unidad SAT" },
  { key: "descripcionFactura", label: "Descripcion factura" },
  { key: "objetoImpuesto", label: "Objeto impuesto" },
  { key: "iva", label: "IVA" },
  { key: "notasInternas", label: "Notas internas" },
  { key: "estadoInventario", label: "Estado" },
];
const CAMPOS_AUTOCOMPLETE_CATALOGO = [
  "nombre",
  "descripcion",
  "descripcionFactura",
  "categoria",
  "precioCompra",
  "ultimoCosto",
  "precioVenta",
  "claveSat",
  "claveUnidadSat",
];

const productoVacio = {
  nombre: "",
  sku: "",
  codigo: "",
  categoria: "",
  marca: "",
  tipo: "producto",
  proveedorPrincipal: "",
  ubicacion: "",
  unidadMedida: "Pza",
  descripcion: "",
  precioCompra: "",
  ultimoCosto: "",
  precioVenta: "",
  stock: "",
  stockMinimo: "",
  stockMaximo: "",
  puntoReorden: "",
  compatibilidad: "",
  claveSat: "",
  claveUnidadSat: "",
  descripcionFactura: "",
  objetoImpuesto: "02",
  iva: "16",
  notasInternas: "",
  estadoInventario: "Activo",
  generaPuntos: true,
  activo: true,
};

const INVENTARIO_PAGES_COMPLETAS = [
  {
    title: "Identificacion",
    text: "Datos base para localizar el producto y reconocerlo en mostrador o taller.",
    fields: [
      { key: "codigo", label: "Codigo de barras", required: true },
      { key: "nombre", label: "Nombre", required: true },
      { key: "sku", label: "SKU / clave interna" },
      { key: "categoria", label: "Categoria", list: "inventario-categorias" },
      { key: "marca", label: "Marca", list: "inventario-marcas" },
      { key: "tipo", label: "Tipo", type: "select", options: TIPO_OPTIONS },
      { key: "proveedorPrincipal", label: "Proveedor principal", list: "inventario-proveedores" },
      { key: "ubicacion", label: "Ubicacion", list: "inventario-ubicaciones" },
      { key: "unidadMedida", label: "Unidad de medida", type: "select", options: UNIDAD_OPTIONS },
      { key: "estadoInventario", label: "Estado", type: "select", options: ESTADO_OPTIONS },
    ],
  },
  {
    title: "Stock y venta",
    text: "Control de existencias, reorden y precios de compra y venta.",
    fields: [
      { key: "stock", label: "Stock actual", type: "number", min: "0", step: "1", inputMode: "numeric" },
      { key: "stockMinimo", label: "Stock minimo", type: "number", min: "0", step: "1", inputMode: "numeric" },
      { key: "stockMaximo", label: "Stock maximo", type: "number", min: "0", step: "1", inputMode: "numeric" },
      { key: "puntoReorden", label: "Punto de reorden", type: "number", min: "0", step: "1", inputMode: "numeric" },
      { key: "precioCompra", label: "Precio compra", type: "number", min: "0", step: "0.01", inputMode: "decimal" },
      { key: "ultimoCosto", label: "Ultimo costo", type: "number", min: "0", step: "0.01", inputMode: "decimal" },
      { key: "precioVenta", label: "Precio venta", required: true, type: "number", min: "0", step: "0.01", inputMode: "decimal" },
      { key: "descripcion", label: "Descripcion", type: "textarea", full: true, rows: 2 },
      { key: "compatibilidad", label: "Compatibilidad", type: "textarea", full: true, rows: 2 },
    ],
  },
  {
    title: "Facturacion y notas",
    text: "Campos fiscales para CFDI y notas internas del producto.",
    fields: [
      { key: "claveSat", label: "Clave SAT producto/servicio" },
      { key: "claveUnidadSat", label: "Clave SAT unidad" },
      { key: "descripcionFactura", label: "Descripcion para factura" },
      { key: "objetoImpuesto", label: "Objeto de impuesto", type: "select", options: OBJETO_IMPUESTO_OPTIONS },
      { key: "iva", label: "IVA", type: "select", options: IVA_OPTIONS },
      { key: "notasInternas", label: "Notas internas", type: "textarea", full: true, rows: 2 },
    ],
  },
];

const INVENTARIO_PAGES_SENCILLAS = [
  {
    title: "Datos basicos",
    text: "Captura rapida para dar de alta el producto sin campos fiscales.",
    fields: [
      { key: "codigo", label: "Codigo de barras", required: true },
      { key: "nombre", label: "Nombre", required: true },
      { key: "categoria", label: "Categoria", list: "inventario-categorias" },
      { key: "marca", label: "Marca", list: "inventario-marcas" },
      { key: "tipo", label: "Tipo", type: "select", options: TIPO_OPTIONS },
      { key: "descripcion", label: "Descripcion", type: "textarea", full: true, rows: 2 },
    ],
  },
  {
    title: "Venta y stock",
    text: "Solo los datos esenciales para vender y controlar existencias.",
    fields: [
      { key: "precioVenta", label: "Precio venta", required: true, type: "number", min: "0", step: "0.01", inputMode: "decimal" },
      { key: "stock", label: "Stock actual", type: "number", min: "0", step: "1", inputMode: "numeric" },
      { key: "stockMinimo", label: "Stock minimo", type: "number", min: "0", step: "1", inputMode: "numeric" },
      { key: "estadoInventario", label: "Estado", type: "select", options: ESTADO_OPTIONS },
    ],
  },
];

function asText(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNumberText(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = Number(String(value).replace(/,/g, ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(normalized) ? normalized : 0;
}

function uniqueOptions(values = []) {
  return [...new Set(values.map((item) => text(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function buildExcelFilename(prefix) {
  return `${prefix}_${getTodayKey()}.xlsx`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function addMonths(value, months = 1) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function readConteoInventarioMeta() {
  try {
    const raw = localStorage.getItem(CONTEO_INVENTARIO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConteoInventarioMeta(meta) {
  try {
    localStorage.setItem(CONTEO_INVENTARIO_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // La bitacora local es auxiliar; el inventario ya se guardo en Firebase.
  }
}

function normalizeExcelHeader(value) {
  return normalizedText(value).replace(/\s+/g, "");
}

function getExcelValue(row, key, label) {
  const aliases = [key, label, normalizeExcelHeader(key), normalizeExcelHeader(label)];
  const entry = Object.entries(row).find(([rawKey]) => aliases.includes(normalizeExcelHeader(rawKey)));
  return entry ? entry[1] : "";
}

function productoToExcelRow(producto = {}) {
  return INVENTARIO_EXCEL_COLUMNS.reduce((acc, column) => {
    acc[column.label] = producto[column.key] ?? "";
    return acc;
  }, {});
}

function excelRowToForm(row = {}) {
  const next = { ...productoVacio };

  INVENTARIO_EXCEL_COLUMNS.forEach((column) => {
    const value = getExcelValue(row, column.key, column.label);
    if (value !== "" && value !== null && value !== undefined) {
      next[column.key] = value;
    }
  });

  return {
    ...next,
    estadoInventario: text(next.estadoInventario) || "Activo",
    tipo: text(next.tipo) || "producto",
    unidadMedida: text(next.unidadMedida) || "Pza",
    objetoImpuesto: text(next.objetoImpuesto) || "02",
    iva: text(next.iva) || "16",
  };
}

function toFormState(producto = {}) {
  return {
    ...productoVacio,
    ...producto,
    nombre: asText(producto.nombre),
    sku: asText(producto.sku),
    codigo: asText(producto.codigo),
    categoria: asText(producto.categoria),
    marca: asText(producto.marca),
    tipo: asText(producto.tipo) || "producto",
    proveedorPrincipal: asText(producto.proveedorPrincipal),
    ubicacion: asText(producto.ubicacion),
    unidadMedida: asText(producto.unidadMedida) || "Pza",
    descripcion: asText(producto.descripcion),
    precioCompra: asNumberText(producto.precioCompra),
    ultimoCosto: asNumberText(producto.ultimoCosto ?? producto.precioCompra),
    precioVenta: asNumberText(producto.precioVenta),
    stock: asNumberText(producto.stock),
    stockMinimo: asNumberText(producto.stockMinimo),
    stockMaximo: asNumberText(producto.stockMaximo),
    puntoReorden: asNumberText(producto.puntoReorden),
    compatibilidad: asText(producto.compatibilidad || producto.compatible),
    claveSat: asText(producto.claveSat),
    claveUnidadSat: asText(producto.claveUnidadSat),
    descripcionFactura: asText(producto.descripcionFactura || producto.nombre),
    objetoImpuesto: asText(producto.objetoImpuesto) || "02",
    iva: asNumberText(producto.iva ?? 16),
    notasInternas: asText(producto.notasInternas),
    estadoInventario: asText(producto.estadoInventario) || (producto.activo === false ? "Inactivo" : "Activo"),
    generaPuntos: producto.generaPuntos !== false,
    activo: producto.activo !== false,
  };
}

function toPayload(form) {
  const estadoInventario = text(form.estadoInventario) || "Activo";
  const compatibilidad = text(form.compatibilidad);

  return {
    ...form,
    nombre: text(form.nombre),
    sku: text(form.sku),
    codigo: text(form.codigo),
    categoria: text(form.categoria),
    marca: text(form.marca),
    tipo: text(form.tipo) || "producto",
    proveedorPrincipal: text(form.proveedorPrincipal),
    ubicacion: text(form.ubicacion),
    unidadMedida: text(form.unidadMedida) || "Pza",
    descripcion: text(form.descripcion),
    precioCompra: toNumber(form.precioCompra),
    ultimoCosto: toNumber(form.ultimoCosto || form.precioCompra),
    precioVenta: toNumber(form.precioVenta),
    stock: toNumber(form.stock),
    stockMinimo: toNumber(form.stockMinimo),
    stockMaximo: toNumber(form.stockMaximo),
    puntoReorden: toNumber(form.puntoReorden),
    compatibilidad,
    compatible: compatibilidad,
    claveSat: text(form.claveSat),
    claveUnidadSat: text(form.claveUnidadSat),
    descripcionFactura: text(form.descripcionFactura || form.nombre),
    objetoImpuesto: text(form.objetoImpuesto) || "02",
    iva: toNumber(form.iva),
    notasInternas: text(form.notasInternas),
    estadoInventario,
    activo: estadoInventario === "Activo",
    generaPuntos: form.generaPuntos !== false,
  };
}

function calcularMargen(compra, venta) {
  const compraNum = Number(compra || 0);
  const ventaNum = Number(venta || 0);
  if (compraNum <= 0 || ventaNum <= 0) return "0.0";
  return (((ventaNum - compraNum) / compraNum) * 100).toFixed(1);
}

function obtenerEstadoProducto(producto) {
  return text(producto.estadoInventario) || (producto.activo === false ? "Inactivo" : "Activo");
}

function claseEstadoProducto(producto) {
  const estado = obtenerEstadoProducto(producto).toLowerCase();
  if (estado === "descontinuado") return "estado-descontinuado";
  return estado === "activo" ? "activo" : "inactivo";
}

function limpiarCamposAutocompletados(prev, valoresAutocompletados = null) {
  if (!valoresAutocompletados) return { next: prev, changed: false };

  let changed = false;
  const next = { ...prev };

  CAMPOS_AUTOCOMPLETE_CATALOGO.forEach((key) => {
    const valorAutocompletado = text(valoresAutocompletados?.[key]);
    if (!valorAutocompletado) return;
    if (text(prev[key]) !== valorAutocompletado) return;
    next[key] = "";
    changed = true;
  });

  return { next: changed ? next : prev, changed };
}

function aplicarCamposCatalogo(prev, coincidencia) {
  const siguiente = { ...prev };
  const aplicados = {};
  const candidatos = {
    nombre: text(coincidencia?.nombre || coincidencia?.descripcion),
    descripcion: text(coincidencia?.descripcion),
    descripcionFactura: text(
      coincidencia?.descripcionFactura || coincidencia?.descripcion || coincidencia?.nombre,
    ),
    categoria: text(coincidencia?.categoria),
    precioCompra: text(coincidencia?.precioCompra),
    ultimoCosto: text(coincidencia?.ultimoCosto || coincidencia?.precioCompra),
    precioVenta: text(coincidencia?.precioVenta),
    claveSat: text(coincidencia?.claveSat),
    claveUnidadSat: text(coincidencia?.claveUnidadSat),
  };

  CAMPOS_AUTOCOMPLETE_CATALOGO.forEach((key) => {
    const nuevoValor = text(candidatos[key]);
    siguiente[key] = nuevoValor;
    if (nuevoValor) {
      aplicados[key] = nuevoValor;
    }
  });

  return {
    next: siguiente,
    aplicados: Object.keys(aplicados).length ? aplicados : null,
  };
}

export default function Productos({ embedded = false }) {
  const [productos, setProductos] = useState([]);
  const [categoriasCatalogo, setCategoriasCatalogo] = useState([]);
  const [form, setForm] = useState(productoVacio);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [paginaActual, setPaginaActual] = useState(0);
  const [mostrarModalCategorias, setMostrarModalCategorias] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [busquedaCategoria, setBusquedaCategoria] = useState("");
  const [categoriaActivaKey, setCategoriaActivaKey] = useState("");
  const [busquedaProductoCategoria, setBusquedaProductoCategoria] = useState("");
  const [mostrarModalCodigo, setMostrarModalCodigo] = useState(false);
  const [codigoBusqueda, setCodigoBusqueda] = useState("");
  const [errorCodigoBusqueda, setErrorCodigoBusqueda] = useState("");
  const [inventarioCfg, setInventarioCfg] = useState(readInventarioConfigStorage);
  const [catalogoStatus, setCatalogoStatus] = useState(null);
  const catalogoAutocompletadoRef = useRef(null);
  const [mostrarModalCatalogo, setMostrarModalCatalogo] = useState(false);
  const [noMostrarModalCatalogo, setNoMostrarModalCatalogo] = useState(false);
  const [mostrarAvisoConteo, setMostrarAvisoConteo] = useState(false);
  const [mostrarConteoInventario, setMostrarConteoInventario] = useState(false);
  const [mostrarConfirmacionConteo, setMostrarConfirmacionConteo] = useState(false);
  const [busquedaConteo, setBusquedaConteo] = useState("");
  const [filtroConteo, setFiltroConteo] = useState("todos");
  const [conteoInventario, setConteoInventario] = useState({});
  const [conteoMeta, setConteoMeta] = useState(readConteoInventarioMeta);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const inputImportarExcelRef = useRef(null);
  const inventarioPages = useMemo(
    () =>
      inventarioCfg.camposProductoCompletos
        ? INVENTARIO_PAGES_COMPLETAS
        : INVENTARIO_PAGES_SENCILLAS,
    [inventarioCfg.camposProductoCompletos],
  );
  const paginaActualSegura = Math.min(paginaActual, inventarioPages.length - 1);
  const paginaInventarioActual = inventarioPages[paginaActualSegura] || inventarioPages[0];
  const modoFormularioInventario = inventarioCfg.camposProductoCompletos
    ? "completo"
    : "sencillo";

  useEffect(() => {
    if (embedded) return;
    if (!inventarioCfg.autocompletarDescripcionCodigo) return;
    if (!inventarioCfg.mostrarAvisoCatalogo) return;
    setNoMostrarModalCatalogo(false);
    setMostrarModalCatalogo(true);
  }, [
    embedded,
    inventarioCfg.autocompletarDescripcionCodigo,
    inventarioCfg.mostrarAvisoCatalogo,
  ]);

  const sugerencias = useMemo(() => ({
    categorias: uniqueOptions([
      ...productos.map((producto) => producto.categoria),
      ...categoriasCatalogo.map((categoria) => categoria.nombre),
    ]),
    marcas: uniqueOptions(productos.map((producto) => producto.marca)),
    proveedores: uniqueOptions(productos.map((producto) => producto.proveedorPrincipal)),
    ubicaciones: uniqueOptions(productos.map((producto) => producto.ubicacion)),
  }), [categoriasCatalogo, productos]);

  const categoriasInventario = useMemo(() => {
    const productosPorCategoria = new Map();

    productos.forEach((producto) => {
      const nombre = text(producto.categoria);
      if (!nombre) return;
      const key = normalizedText(nombre);
      const current = productosPorCategoria.get(key) || { nombre, productos: [] };
      current.productos.push(producto);
      productosPorCategoria.set(key, current);
    });

    const union = new Map();

    categoriasCatalogo.forEach((categoria) => {
      const nombre = text(categoria.nombre);
      if (!nombre) return;
      const key = normalizedText(nombre);
      const productosCategoria = productosPorCategoria.get(key)?.productos || [];
      union.set(key, {
        ...categoria,
        key,
        nombre,
        origen: "catalogo",
        productCount: productosCategoria.length,
        productos: productosCategoria,
      });
    });

    productosPorCategoria.forEach((entry, key) => {
      if (union.has(key)) {
        union.set(key, {
          ...union.get(key),
          productCount: entry.productos.length,
          productos: entry.productos,
        });
        return;
      }

      union.set(key, {
        id: `derivada_${key}`,
        key,
        nombre: entry.nombre,
        origen: "productos",
        productCount: entry.productos.length,
        productos: entry.productos,
      });
    });

    return [...union.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [categoriasCatalogo, productos]);

  const categoriasVisibles = useMemo(() => {
    const query = normalizedText(busquedaCategoria);
    if (!query) return categoriasInventario;
    return categoriasInventario.filter((categoria) => normalizedText(categoria.nombre).includes(query));
  }, [busquedaCategoria, categoriasInventario]);

  useEffect(() => {
    if (!mostrarModalCategorias) return;
    if (!categoriasInventario.length) {
      setCategoriaActivaKey("");
      return;
    }

    if (!categoriaActivaKey || !categoriasInventario.some((categoria) => categoria.key === categoriaActivaKey)) {
      setCategoriaActivaKey(categoriasInventario[0].key);
    }
  }, [categoriaActivaKey, categoriasInventario, mostrarModalCategorias]);

  useEffect(() => {
    if (!mostrarModal || modoEdicion) return;

    const codigoActual = text(form.codigo);
    if (!inventarioCfg.autocompletarDescripcionCodigo) {
      setCatalogoStatus(
        codigoActual
          ? {
              type: "info",
              text: "Autocompletado por codigo desactivado en Configuracion > POS y Facturacion.",
            }
          : null,
      );
      return;
    }

    if (codigoActual.length < 6) {
      setCatalogoStatus(null);

      if (catalogoAutocompletadoRef.current) {
        setForm((prev) => limpiarCamposAutocompletados(prev, catalogoAutocompletadoRef.current).next);
        catalogoAutocompletadoRef.current = null;
      }
      return;
    }

    let cancelado = false;
    const timeoutId = setTimeout(async () => {
      setCatalogoStatus({
        type: "loading",
        text: "Buscando informacion en las bases cargadas...",
      });

      try {
        const coincidencia = await buscarProductoCatalogoPorCodigo(codigoActual);
        if (cancelado) return;

        if (!coincidencia) {
          if (catalogoAutocompletadoRef.current) {
            setForm((prev) => {
              if (text(prev.codigo) !== codigoActual) return prev;
              return limpiarCamposAutocompletados(prev, catalogoAutocompletadoRef.current).next;
            });
            catalogoAutocompletadoRef.current = null;
          }

          setCatalogoStatus({
            type: "warning",
            text: "Ese codigo no existe en las bases cargadas.",
          });
          return;
        }

        let aplicados = null;
        setForm((prev) => {
          if (text(prev.codigo) !== codigoActual) return prev;
          const resultado = aplicarCamposCatalogo(prev, coincidencia);
          aplicados = resultado.aplicados;
          return resultado.next;
        });

        catalogoAutocompletadoRef.current = aplicados;
        const fuentesTexto = Array.isArray(coincidencia?.fuentes) && coincidencia.fuentes.length
          ? coincidencia.fuentes.join(" + ")
          : "la base cargada";
        setCatalogoStatus({
          type: "success",
          text: aplicados
            ? `Datos actualizados desde ${fuentesTexto}: ${coincidencia.descripcion || coincidencia.nombre}.`
            : "Se encontro el codigo en la base, pero no trajo datos para autocompletar.",
        });
      } catch (error) {
        if (cancelado) return;
        console.error("No se pudo consultar el catalogo de codigos:", error);
        setCatalogoStatus({
          type: "error",
          text: "No se pudieron leer las bases de codigos.",
        });
      }
    }, 260);

    return () => {
      cancelado = true;
      clearTimeout(timeoutId);
    };
  }, [
    form.codigo,
    inventarioCfg.autocompletarDescripcionCodigo,
    modoEdicion,
    mostrarModal,
  ]);

  const categoriaActiva = useMemo(() => {
    if (!categoriaActivaKey) return categoriasVisibles[0] || categoriasInventario[0] || null;
    return categoriasInventario.find((categoria) => categoria.key === categoriaActivaKey) || categoriasVisibles[0] || categoriasInventario[0] || null;
  }, [categoriaActivaKey, categoriasInventario, categoriasVisibles]);

  const productosCategoriaActiva = useMemo(() => {
    if (!categoriaActiva) return [];
    const query = normalizedText(busquedaProductoCategoria);
    if (!query) return categoriaActiva.productos || [];

    return (categoriaActiva.productos || []).filter((producto) =>
      [
        producto.nombre,
        producto.sku,
        producto.codigo,
        producto.marca,
        producto.proveedorPrincipal,
      ].some((value) => normalizedText(value).includes(query)),
    );
  }, [busquedaProductoCategoria, categoriaActiva]);

  const productosConteo = useMemo(
    () =>
      [...productos].sort((a, b) =>
        text(a.categoria).localeCompare(text(b.categoria), "es") ||
        text(a.nombre).localeCompare(text(b.nombre), "es"),
      ),
    [productos],
  );

  const resumenConteo = useMemo(() => {
    const revisados = Object.values(conteoInventario).filter((value) => text(value) !== "").length;
    const productosConDiferencia = productosConteo.filter((producto) => {
      const value = conteoInventario[producto.id];
      if (text(value) === "") return false;
      return toNumber(value) !== toNumber(producto.stock);
    });
    const prioridadAlta = productosConteo.filter((producto) => {
      const stock = toNumber(producto.stock);
      const minimo = toNumber(producto.stockMinimo);
      return minimo > 0 && stock <= minimo;
    }).length;
    const aumentos = productosConDiferencia.filter((producto) => toNumber(conteoInventario[producto.id]) > toNumber(producto.stock)).length;
    const faltantes = productosConDiferencia.filter((producto) => toNumber(conteoInventario[producto.id]) < toNumber(producto.stock)).length;

    return {
      revisados,
      pendientes: Math.max(0, productosConteo.length - revisados),
      diferencias: productosConDiferencia.length,
      aumentos,
      faltantes,
      prioridadAlta,
      total: productosConteo.length,
    };
  }, [conteoInventario, productosConteo]);

  const avanceConteo = resumenConteo.total > 0
    ? Math.round((resumenConteo.revisados / resumenConteo.total) * 100)
    : 0;

  const productosConteoVisibles = useMemo(() => {
    const query = normalizedText(busquedaConteo);

    return productosConteo.filter((producto) => {
      const contadoRaw = conteoInventario[producto.id];
      const tieneConteo = text(contadoRaw) !== "";
      const diferencia = tieneConteo ? toNumber(contadoRaw) - toNumber(producto.stock) : 0;
      const prioridadAlta = toNumber(producto.stockMinimo) > 0 && toNumber(producto.stock) <= toNumber(producto.stockMinimo);

      if (query) {
        const coincide = [
          producto.nombre,
          producto.codigo,
          producto.sku,
          producto.categoria,
          producto.marca,
          producto.proveedorPrincipal,
        ].some((value) => normalizedText(value).includes(query));
        if (!coincide) return false;
      }

      if (filtroConteo === "pendientes") return !tieneConteo;
      if (filtroConteo === "contados") return tieneConteo;
      if (filtroConteo === "diferencias") return diferencia !== 0;
      if (filtroConteo === "prioridad") return prioridadAlta;
      return true;
    });
  }, [busquedaConteo, conteoInventario, filtroConteo, productosConteo]);

  const conteoResumenCard = useMemo(() => {
    const lastAt = conteoMeta?.lastAt || "";
    const lastUser = text(conteoMeta?.userName) || "Sistema";
    const nextDate = addMonths(lastAt || new Date(), 1);

    return {
      frecuencia: "Cada mes",
      ultimo: lastAt ? `${formatDateTime(lastAt)} por ${lastUser}` : "Sin conteos registrados",
      proximo: formatDateOnly(nextDate),
    };
  }, [conteoMeta]);

  const cargarProductos = useCallback(async () => {
    const data = await obtenerProductos();
    setProductos(Array.isArray(data) ? data : []);
  }, []);

  const cargarCategorias = useCallback(async () => {
    const data = await obtenerCategoriasInventario();
    setCategoriasCatalogo(Array.isArray(data) ? data : []);
  }, []);

  const cargarTodoInventario = useCallback(async () => {
    await Promise.all([cargarProductos(), cargarCategorias()]);
  }, [cargarCategorias, cargarProductos]);

  useEffect(() => {
    cargarTodoInventario();
  }, [cargarTodoInventario]);

  const normalizarCodigo = (value) => String(value ?? "").trim().toLowerCase();

  const existeCodigoRegistrado = (codigo, idActual = null) => {
    const codigoNormalizado = normalizarCodigo(codigo);
    if (!codigoNormalizado) return false;

    return productos.some((producto) => {
      const mismoCodigo = normalizarCodigo(producto.codigo) === codigoNormalizado;
      const otroProducto = idActual ? producto.id !== idActual : true;
      return mismoCodigo && otroProducto;
    });
  };

  const validarCodigoUnico = () => {
    if (!form.codigo) return;

    if (existeCodigoRegistrado(form.codigo, modoEdicion ? form.id : null)) {
      alert("Ese codigo ya esta dado de alta.");
    }
  };

  const actualizarCampo = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const abrirNuevoProducto = () => {
    setForm(productoVacio);
    setModoEdicion(false);
    setPaginaActual(0);
    setCatalogoStatus(null);
    catalogoAutocompletadoRef.current = null;
    setMostrarModal(true);
  };

  const cerrarModalCatalogo = () => {
    if (noMostrarModalCatalogo) {
      const nextCfg = {
        ...inventarioCfg,
        mostrarAvisoCatalogo: false,
      };
      setInventarioCfg(nextCfg);
      saveInventarioConfigStorage(nextCfg);
    }

    setMostrarModalCatalogo(false);
    setNoMostrarModalCatalogo(false);
  };

  const editarProducto = (producto) => {
    setForm(toFormState(producto));
    setModoEdicion(true);
    setPaginaActual(0);
    setCatalogoStatus(null);
    catalogoAutocompletadoRef.current = null;
    setMostrarModal(true);
  };

  const cerrarModalProducto = () => {
    setMostrarModal(false);
    setModoEdicion(false);
    setPaginaActual(0);
    setForm(productoVacio);
    setCatalogoStatus(null);
    catalogoAutocompletadoRef.current = null;
  };

  const abrirModalEditarCodigo = () => {
    setCodigoBusqueda("");
    setErrorCodigoBusqueda("");
    setMostrarModalCodigo(true);
  };

  const abrirModalCategorias = () => {
    setMostrarModalCategorias((prev) => {
      const next = !prev;
      if (next) {
        setNuevaCategoria("");
        setBusquedaCategoria("");
        setBusquedaProductoCategoria("");
        setCategoriaActivaKey(categoriasInventario[0]?.key || "");
      } else {
        setNuevaCategoria("");
        setBusquedaCategoria("");
        setBusquedaProductoCategoria("");
        setCategoriaActivaKey("");
      }
      return next;
    });
  };

  const cerrarModalCategorias = () => {
    setMostrarModalCategorias(false);
    setNuevaCategoria("");
    setBusquedaCategoria("");
    setBusquedaProductoCategoria("");
    setCategoriaActivaKey("");
  };

  const abrirAvisoConteo = () => {
    setMostrarAvisoConteo(true);
  };

  const iniciarConteoInventario = () => {
    setMostrarAvisoConteo(false);
    setMostrarConteoInventario(true);
    setBusquedaConteo("");
    setFiltroConteo("todos");
  };

  const descargarWorkbook = async (rows, sheetName, filename) => {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  };

  const exportarExcel = async () => {
    try {
      await descargarWorkbook(
        productos.map(productoToExcelRow),
        "Inventario",
        buildExcelFilename("inventario"),
      );
    } catch (error) {
      console.error("No se pudo exportar inventario:", error);
      alert("No se pudo exportar el inventario.");
    }
  };

  const descargarPlantillaExcel = async () => {
    try {
      await descargarWorkbook(
        [productoToExcelRow(productoVacio)],
        "Plantilla",
        buildExcelFilename("plantilla_inventario"),
      );
    } catch (error) {
      console.error("No se pudo crear plantilla:", error);
      alert("No se pudo descargar la plantilla.");
    }
  };

  const abrirImportarExcel = () => {
    inputImportarExcelRef.current?.click();
  };

  const importarExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportandoExcel(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      const productosValidos = rows
        .map(excelRowToForm)
        .filter((item) => text(item.codigo) && text(item.nombre) && text(item.precioVenta));

      if (!productosValidos.length) {
        alert("El archivo no tiene productos validos. Revisa Codigo, Producto y Precio venta.");
        return;
      }

      if (!confirm(`Se importaran ${productosValidos.length} producto(s). Los codigos existentes se actualizaran. Continuar?`)) {
        return;
      }

      for (const item of productosValidos) {
        const existente = productos.find((producto) => normalizarCodigo(producto.codigo) === normalizarCodigo(item.codigo));
        const payload = toPayload(item);
        if (existente?.id) {
          await actualizarProducto(existente.id, payload);
        } else {
          await crearProducto(payload);
        }
      }

      await cargarTodoInventario();
      alert("Inventario importado correctamente.");
    } catch (error) {
      console.error("No se pudo importar Excel:", error);
      alert("No se pudo importar el archivo Excel.");
    } finally {
      setImportandoExcel(false);
    }
  };

  const actualizarConteo = (productoId, value) => {
    setConteoInventario((prev) => ({ ...prev, [productoId]: value }));
  };

  const finalizarConteoInventario = () => {
    const cambios = productosConteo.filter((producto) => {
      const value = conteoInventario[producto.id];
      return text(value) !== "" && toNumber(value) !== toNumber(producto.stock);
    });

    if (!cambios.length) {
      alert("No hay diferencias para aplicar.");
      return;
    }

    setMostrarConfirmacionConteo(true);
  };

  const aplicarConteoInventario = async () => {
    const cambios = productosConteo.filter((producto) => {
      const value = conteoInventario[producto.id];
      return text(value) !== "" && toNumber(value) !== toNumber(producto.stock);
    });

    try {
      for (const producto of cambios) {
        await actualizarProducto(producto.id, {
          ...producto,
          stock: toNumber(conteoInventario[producto.id]),
        });
      }

      const user = auth.currentUser;
      const meta = {
        lastAt: new Date().toISOString(),
        userName: text(user?.displayName) || text(user?.email) || "Sistema",
      };
      saveConteoInventarioMeta(meta);
      setConteoMeta(meta);
      setConteoInventario({});
      setMostrarConfirmacionConteo(false);
      await cargarProductos();
      setMostrarConteoInventario(false);
      alert("Conteo aplicado al inventario.");
    } catch (error) {
      console.error("No se pudo aplicar conteo:", error);
      alert("No se pudo aplicar el conteo.");
    }
  };

  const buscarProductoPorCodigo = () => {
    const codigoNormalizado = normalizarCodigo(codigoBusqueda);
    if (!codigoNormalizado) {
      setErrorCodigoBusqueda("Ingresa un codigo para buscar.");
      return;
    }

    const producto = productos.find(
      (item) => normalizarCodigo(item.codigo) === codigoNormalizado,
    );

    if (!producto) {
      setErrorCodigoBusqueda("No se encontro un producto con ese codigo.");
      return;
    }

    setMostrarModalCodigo(false);
    setCodigoBusqueda("");
    setErrorCodigoBusqueda("");
    editarProducto(producto);
  };

  const guardarProducto = async () => {
    if (!text(form.nombre) || !text(form.precioVenta) || !text(form.codigo)) {
      alert("Nombre, codigo y precio venta son obligatorios.");
      return;
    }

    if (existeCodigoRegistrado(form.codigo, modoEdicion ? form.id : null)) {
      alert("Ese codigo ya esta dado de alta.");
      return;
    }

    const payload = toPayload(form);

    try {
      if (modoEdicion) {
        await actualizarProducto(form.id, payload);
      } else {
        await crearProducto(payload);
      }

      cerrarModalProducto();
      cargarProductos();
    } catch (error) {
      console.error("Error guardando inventario:", error);
    }
  };

  const eliminarProducto = async (id) => {
    if (!id) return;
    if (!confirm("Estas seguro de eliminar este producto?")) return;

    await eliminarProductoDB(id);
    cargarProductos();
  };

  const guardarCategoria = async () => {
    const nombre = text(nuevaCategoria);
    if (!nombre) return;

    if (categoriasInventario.some((categoria) => normalizedText(categoria.nombre) === normalizedText(nombre))) {
      alert("Esa categoria ya existe.");
      return;
    }

    try {
      const creada = await crearCategoriaInventario(nombre);
      setNuevaCategoria("");
      await cargarCategorias();
      setCategoriaActivaKey(normalizedText(creada.nombre));
    } catch (error) {
      console.error("No se pudo guardar categoria:", error);
      alert("No se pudo guardar la categoria.");
    }
  };

  const borrarCategoria = async (categoria) => {
    if (!categoria) return;
    const total = Number(categoria.productCount || 0);
    const confirmText = total > 0
      ? `La categoria "${categoria.nombre}" tiene ${total} producto(s). Si la eliminas, esos productos quedaran sin categoria. ¿Deseas continuar?`
      : `¿Deseas eliminar la categoria "${categoria.nombre}"?`;

    if (!confirm(confirmText)) return;

    try {
      await eliminarCategoriaInventario(categoria);
      await cargarTodoInventario();
      if (categoriaActivaKey === categoria.key) {
        setCategoriaActivaKey("");
      }
    } catch (error) {
      console.error("No se pudo eliminar categoria:", error);
      alert("No se pudo eliminar la categoria.");
    }
  };

  const renderField = (field) => {
    const value = form[field.key] ?? "";
    const id = `inventario-${field.key}`;
    const commonProps = {
      id,
      value,
      placeholder: field.placeholder || field.label,
      onChange: (event) => actualizarCampo(field.key, event.target.value),
      list: field.list,
      inputMode: field.inputMode,
      maxLength: field.maxLength,
      min: field.min,
      max: field.max,
      step: field.step,
    };

    return (
      <label key={field.key} className={`prod-field ${field.full ? "full" : ""}`}>
        <span>{field.label}{field.required ? " *" : ""}</span>
        {field.type === "textarea" ? (
          <textarea {...commonProps} rows={field.rows || 3} />
        ) : field.type === "select" ? (
          <select id={id} value={value} onChange={(event) => actualizarCampo(field.key, event.target.value)}>
            {(field.options || []).map((option) => {
              const optionValue = typeof option === "string" ? option : option.value;
              const optionLabel = typeof option === "string" ? option : option.label;
              return (
                <option key={optionValue} value={optionValue}>
                  {optionLabel}
                </option>
              );
            })}
          </select>
        ) : (
          <input
            {...commonProps}
            type={field.type || "text"}
            onBlur={field.key === "codigo" ? validarCodigoUnico : undefined}
          />
        )}
        {field.key === "codigo" && !modoEdicion && catalogoStatus?.text && (
          <small className={`prod-field-note ${catalogoStatus.type || "info"}`}>
            {catalogoStatus.text}
          </small>
        )}
      </label>
    );
  };

  const contenido = (
    <div className="productos-container">
      <div className="header-productos">
        <div className="header-productos-copy">
          <h1>Inventario</h1>
          <p>{embedded ? "Este es el mismo inventario que utiliza el POS." : "Administra productos, stock, facturacion y datos de compra del negocio."}</p>
        </div>
        <div className="prod-action-nav">
          <div className="acciones-header-productos">
            <button
              className="btn-accion-header btn-nuevo"
              onClick={abrirNuevoProducto}
              type="button"
            >
              + Nuevo producto
            </button>
            <button
              className="btn-accion-header btn-modificar-codigo"
              onClick={abrirModalEditarCodigo}
              type="button"
            >
              Modificar por codigo
            </button>
            <button
              className="btn-accion-header btn-conteo"
              onClick={abrirAvisoConteo}
              type="button"
            >
              Conteo inventario
            </button>
            <button
              className="btn-accion-header btn-categorias"
              onClick={abrirModalCategorias}
              type="button"
            >
              {mostrarModalCategorias ? "Ocultar categorias" : "Categorias"}
            </button>
            <button
              className="btn-accion-header btn-exportar-excel"
              onClick={exportarExcel}
              type="button"
            >
              Exportar Excel
            </button>
            <button
              className="btn-accion-header btn-importar-excel"
              onClick={abrirImportarExcel}
              type="button"
              disabled={importandoExcel}
            >
              {importandoExcel ? "Importando..." : "Importar Excel"}
            </button>
            <button
              className="btn-accion-header btn-plantilla-excel"
              onClick={descargarPlantillaExcel}
              type="button"
            >
              Plantilla Excel
            </button>
          </div>
          <input
            ref={inputImportarExcelRef}
            type="file"
            accept=".xlsx,.xls"
            className="prod-hidden-file-input"
            onChange={importarExcel}
          />
        </div>
      </div>

      {mostrarModalCatalogo && (
        <div className="prod-modal-overlay">
          <div className="prod-modal-center prod-modal-catalogo-ayuda">
            <div className="prod-modal-catalogo-layout">
              <div className="prod-modal-catalogo-copy">
                <span className="prod-modal-catalogo-chip">Base de datos lista</span>
                <h2 className="prod-modal-title">Hay miles de productos precargados</h2>
                <p className="prod-modal-catalogo-text">
                  Para dar de alta mas rapido, escribe primero el codigo de barras. Si el producto
                  existe en la base, se llenara la descripcion y los datos principales.
                </p>

                <ul className="prod-modal-catalogo-list">
                  <li>Primero captura el codigo de barras.</li>
                  <li>Despues revisa nombre y SKU / clave interna.</li>
                  <li>Si no quieres volver a ver este aviso, marcalo antes de continuar.</li>
                </ul>

                <label className="prod-modal-catalogo-check">
                  <input
                    type="checkbox"
                    checked={noMostrarModalCatalogo}
                    onChange={(event) => setNoMostrarModalCatalogo(event.target.checked)}
                  />
                  No volver a mostrar este aviso
                </label>

                <div className="prod-modal-buttons">
                  <button
                    className="prod-btn-modal prod-btn-guardar"
                    type="button"
                    onClick={cerrarModalCatalogo}
                  >
                    Entendido
                  </button>
                </div>
              </div>

              <div className="prod-modal-catalogo-visual">
                <img src={imgProductsUrl} alt="Productos precargados del inventario" />
              </div>
            </div>
          </div>
        </div>
      )}

      {mostrarModalCategorias && (
        <section className="prod-categorias-wrapper">
          <div className="prod-categorias-head">
            <div>
              <h2 className="prod-modal-title">Categorias de inventario</h2>
              <p className="prod-categorias-subtitle">Crea, busca y revisa que productos pertenecen a cada categoria.</p>
            </div>
            <button
              type="button"
              className="prod-btn-modal prod-btn-cancelar"
              onClick={cerrarModalCategorias}
            >
              Cerrar
            </button>
          </div>

          <div className="prod-categorias-layout">
            <section className="prod-categorias-panel">
              <div className="prod-categorias-create">
                <input
                  type="text"
                  value={nuevaCategoria}
                  onChange={(event) => setNuevaCategoria(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") guardarCategoria();
                  }}
                  placeholder="Nueva categoria"
                />
                <button
                  type="button"
                  className="prod-btn-modal prod-btn-guardar"
                  onClick={guardarCategoria}
                >
                  Crear
                </button>
              </div>

              <input
                type="text"
                className="prod-categorias-search"
                value={busquedaCategoria}
                onChange={(event) => setBusquedaCategoria(event.target.value)}
                placeholder="Buscar categoria..."
              />

              <div className="prod-categorias-list">
                {categoriasVisibles.length === 0 ? (
                  <p className="prod-categorias-empty">No se encontraron categorias.</p>
                ) : (
                  categoriasVisibles.map((categoria) => (
                    <article
                      key={categoria.key}
                      className={`prod-categoria-card ${categoriaActiva?.key === categoria.key ? "active" : ""}`}
                    >
                      <button
                        type="button"
                        className="prod-categoria-main"
                        onClick={() => setCategoriaActivaKey(categoria.key)}
                      >
                        <div className="prod-categoria-title-row">
                          <strong>{categoria.nombre}</strong>
                          <span>{categoria.productCount} producto(s)</span>
                        </div>
                        <small>{categoria.origen === "catalogo" ? "Catalogo guardado" : "Detectada desde productos"}</small>
                      </button>
                      <div className="prod-categoria-actions">
                        <button
                          type="button"
                          className="btn-accion-tabla btn-editar"
                          onClick={() => setCategoriaActivaKey(categoria.key)}
                        >
                          Ver productos
                        </button>
                        <button
                          type="button"
                          className="btn-accion-tabla btn-eliminar"
                          onClick={() => borrarCategoria(categoria)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="prod-categorias-detail">
              {categoriaActiva ? (
                <>
                  <div className="prod-categorias-detail-head">
                    <div>
                      <h3>{categoriaActiva.nombre}</h3>
                      <p>{categoriaActiva.productCount} producto(s) asociados</p>
                    </div>
                    <span className="prod-categorias-badge">
                      {categoriaActiva.origen === "catalogo" ? "Categoria activa" : "Solo en productos"}
                    </span>
                  </div>

                  <input
                    type="text"
                    className="prod-categorias-search"
                    value={busquedaProductoCategoria}
                    onChange={(event) => setBusquedaProductoCategoria(event.target.value)}
                    placeholder="Buscar producto dentro de la categoria..."
                  />

                  <div className="prod-categorias-products">
                    {productosCategoriaActiva.length === 0 ? (
                      <p className="prod-categorias-empty">No hay productos para mostrar en esta categoria.</p>
                    ) : (
                      productosCategoriaActiva.map((producto) => (
                        <article key={producto.id} className="prod-categoria-product-card">
                          <strong>{producto.nombre || "-"}</strong>
                          <span>SKU: {producto.sku || "-"}</span>
                          <span>Codigo: {producto.codigo || "-"}</span>
                          <span>Stock: {Number(producto.stock || 0)}</span>
                          <span>Venta: ${Number(producto.precioVenta || 0).toFixed(2)}</span>
                        </article>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <p className="prod-categorias-empty">Selecciona una categoria para ver sus productos.</p>
              )}
            </section>
          </div>
        </section>
      )}

      {!mostrarModalCategorias && (
        <section className="prod-count-summary">
          <div className="prod-count-copy">
            <strong>{conteoResumenCard.frecuencia}</strong>
            <span>Ultimo conteo: {conteoResumenCard.ultimo}</span>
            <span>Proximo sugerido: {conteoResumenCard.proximo}</span>
          </div>
          <div className="prod-count-metrics">
            <span>{resumenConteo.total} producto(s)</span>
            <span>{resumenConteo.diferencias} con diferencia</span>
            <span>{resumenConteo.prioridadAlta} prioridad alta</span>
          </div>
        </section>
      )}

      {mostrarAvisoConteo && (
        <div className="prod-modal-overlay">
          <div className="prod-modal-center prod-modal-conteo-aviso">
            <h2 className="prod-conteo-aviso-title">Iniciar conteo de inventario</h2>
            <p className="prod-conteo-aviso-copy">
              Se abrira una pagina especial para hacer el conteo completo del inventario.
            </p>

            <div className="prod-conteo-warning">
              <strong>Importante</strong>
              <p>Una vez que entres al conteo, no se puede regresar y no se puede cancelar.</p>
            </div>

            <div className="prod-conteo-aviso-actions">
              <button
                className="prod-btn-modal prod-btn-cancelar"
                type="button"
                onClick={() => setMostrarAvisoConteo(false)}
              >
                Cancelar
              </button>
              <button
                className="prod-btn-modal prod-btn-guardar"
                type="button"
                onClick={iniciarConteoInventario}
              >
                Entendido, entrar al conteo
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarConteoInventario && !mostrarModalCategorias && (
        <div className="prod-modal-overlay prod-conteo-overlay">
          <section className="prod-modal-center prod-conteo-wrapper">
            <div className="prod-conteo-head">
              <div>
                <h2 className="prod-modal-title">Conteo de inventario</h2>
                <p className="prod-categorias-subtitle">Captura el stock fisico contado y aplica solo las diferencias.</p>
              </div>
              <div className="prod-conteo-actions">
                <span>{resumenConteo.revisados} de {resumenConteo.total} revisado(s)</span>
                <span>{resumenConteo.diferencias} diferencia(s)</span>
                <button
                  type="button"
                  className="prod-btn-modal prod-btn-guardar"
                  onClick={finalizarConteoInventario}
                >
                  Finalizar conteo
                </button>
              </div>
            </div>

            <div className="prod-conteo-dashboard">
              <div className="prod-conteo-progress">
                <div>
                  <strong>{avanceConteo}% completado</strong>
                  <span>{resumenConteo.pendientes} pendiente(s) por contar</span>
                </div>
                <div className="prod-conteo-progressbar" aria-hidden="true">
                  <span style={{ width: `${avanceConteo}%` }} />
                </div>
              </div>
              <div className="prod-conteo-stats">
                <span>{resumenConteo.faltantes} faltante(s)</span>
                <span>{resumenConteo.aumentos} sobrante(s)</span>
                <span>{resumenConteo.prioridadAlta} prioridad alta</span>
              </div>
            </div>

            <div className="prod-conteo-toolbar">
              <input
                type="search"
                value={busquedaConteo}
                onChange={(event) => setBusquedaConteo(event.target.value)}
                placeholder="Escanea o busca por producto, codigo, SKU, categoria..."
              />
              <div className="prod-conteo-filtros">
                {[
                  ["todos", "Todos"],
                  ["pendientes", "Pendientes"],
                  ["contados", "Contados"],
                  ["diferencias", "Con diferencia"],
                  ["prioridad", "Prioridad alta"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={filtroConteo === key ? "active" : ""}
                    onClick={() => setFiltroConteo(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="prod-conteo-table-wrap">
              <table className="prod-conteo-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Codigo</th>
                    <th>Categoria</th>
                    <th>Stock sistema</th>
                    <th>Stock contado</th>
                    <th>Diferencia</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {productosConteoVisibles.map((producto) => {
                    const contadoRaw = conteoInventario[producto.id] ?? "";
                    const tieneConteo = text(contadoRaw) !== "";
                    const diferencia = tieneConteo ? toNumber(contadoRaw) - toNumber(producto.stock) : 0;
                    const estadoConteo = !tieneConteo ? "Pendiente" : diferencia === 0 ? "Contado" : "Diferencia";

                    return (
                      <tr key={producto.id}>
                        <td>
                          <div className="prod-conteo-producto">
                            <strong>{producto.nombre || "-"}</strong>
                            <small>{producto.marca || producto.proveedorPrincipal || "Sin marca/proveedor"}</small>
                          </div>
                        </td>
                        <td>{producto.codigo || "-"}</td>
                        <td>{producto.categoria || "-"}</td>
                        <td>{toNumber(producto.stock)}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={contadoRaw}
                            onChange={(event) => actualizarConteo(producto.id, event.target.value)}
                            placeholder="0"
                          />
                        </td>
                        <td className={diferencia < 0 ? "prod-conteo-negativo" : diferencia > 0 ? "prod-conteo-positivo" : ""}>
                          {tieneConteo ? diferencia : "-"}
                        </td>
                        <td>
                          <span className={`prod-conteo-status ${estadoConteo === "Diferencia" ? "diff" : estadoConteo === "Contado" ? "done" : "pending"}`}>
                            {estadoConteo}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {productosConteoVisibles.length === 0 && (
                    <tr>
                      <td colSpan="7" className="prod-conteo-empty">
                        No hay productos con ese filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {mostrarConfirmacionConteo && (
        <div className="prod-modal-overlay">
          <div className="prod-modal-center prod-conteo-confirmacion">
            <h2 className="prod-conteo-aviso-title">Confirmar ajustes de inventario</h2>
            <p className="prod-conteo-aviso-copy">
              Se actualizaran solamente los productos que tienen diferencia entre sistema y conteo fisico.
            </p>

            <div className="prod-conteo-confirm-grid">
              <span><strong>{resumenConteo.diferencias}</strong> producto(s) ajustados</span>
              <span><strong>{resumenConteo.faltantes}</strong> faltante(s)</span>
              <span><strong>{resumenConteo.aumentos}</strong> sobrante(s)</span>
              <span><strong>{resumenConteo.revisados}</strong> producto(s) revisados</span>
            </div>

            <div className="prod-conteo-warning">
              <strong>Revision final</strong>
              <p>Esta accion cambiara el stock actual del inventario. Revisa las diferencias antes de aplicar.</p>
            </div>

            <div className="prod-conteo-aviso-actions">
              <button
                className="prod-btn-modal prod-btn-cancelar"
                type="button"
                onClick={() => setMostrarConfirmacionConteo(false)}
              >
                Seguir revisando
              </button>
              <button
                className="prod-btn-modal prod-btn-guardar"
                type="button"
                onClick={aplicarConteoInventario}
              >
                Aplicar ajustes
              </button>
            </div>
          </div>
        </div>
      )}

      {!mostrarModalCategorias && (
        <div className="tabla-productos-wrap">
          <table className="tabla-productos">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Codigo</th>
                <th>Categoria</th>
                <th>Marca</th>
                <th>Proveedor</th>
                <th>Venta</th>
                <th>Stock</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((producto) => (
                <tr key={producto.id}>
                  <td className="tabla-producto-main">
                    <strong>{producto.nombre || "-"}</strong>
                    <small>{producto.ubicacion ? `Ubicacion: ${producto.ubicacion}` : producto.descripcionFactura || "Sin descripcion fiscal"}</small>
                  </td>
                  <td>{producto.sku || "-"}</td>
                  <td>{producto.codigo || "-"}</td>
                  <td>{producto.categoria || "-"}</td>
                  <td>{producto.marca || "-"}</td>
                  <td>{producto.proveedorPrincipal || "-"}</td>
                  <td>
                    <div className="tabla-producto-precio">
                      <strong>${Number(producto.precioVenta || 0).toFixed(2)}</strong>
                      <small>Margen {calcularMargen(producto.precioCompra, producto.precioVenta)}%</small>
                    </div>
                  </td>
                  <td>
                    <div className={`tabla-producto-stock ${Number(producto.stock || 0) <= Number(producto.stockMinimo || 0) ? "stock-bajo" : ""}`}>
                      <strong>{Number(producto.stock || 0)}</strong>
                      <small>Min {Number(producto.stockMinimo || 0)}</small>
                    </div>
                  </td>
                  <td>
                    <span className={claseEstadoProducto(producto)}>
                      {obtenerEstadoProducto(producto)}
                    </span>
                  </td>
                  <td>
                    <div className="acciones-tabla">
                      <button
                        type="button"
                        className="btn-accion-tabla btn-editar"
                        onClick={() => editarProducto(producto)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn-accion-tabla btn-eliminar"
                        onClick={() => eliminarProducto(producto.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostrarModal && (
        <div className="prod-modal-overlay">
          <div className="prod-modal-center prod-modal-inventario">
            <h2 className="prod-modal-title">{modoEdicion ? "Editar inventario" : "Nuevo producto de inventario"}</h2>
            <p className="prod-modal-mode-copy">
              Modo actual: <strong>{modoFormularioInventario}</strong>.
              {inventarioCfg.camposProductoCompletos
                ? " Se muestran todos los campos del producto."
                : " Captura solo lo esencial y oculta facturacion."}
            </p>

            <div className="prod-page-tabs">
              {inventarioPages.map((page, index) => (
                <button
                  key={page.title}
                  type="button"
                  className={`prod-page-tab ${index === paginaActualSegura ? "active" : ""}`}
                  onClick={() => setPaginaActual(index)}
                >
                  <span>{index + 1}</span>
                  {page.title}
                </button>
              ))}
            </div>

            <div className="prod-form-sections">
              <section className="prod-form-section">
                <div className="prod-form-section-head">
                  <h3>{paginaInventarioActual.title}</h3>
                  <p>{paginaInventarioActual.text}</p>
                </div>
                <div className="prod-form-grid">
                  {paginaInventarioActual.fields.map(renderField)}
                </div>
              </section>
            </div>

            <div className="prod-modal-buttons">
              <button
                className="prod-btn-modal prod-btn-cancelar"
                onClick={cerrarModalProducto}
                type="button"
              >
                Cancelar
              </button>
              {paginaActualSegura > 0 && (
                <button
                  className="prod-btn-modal prod-btn-anterior"
                  onClick={() => setPaginaActual(Math.max(0, paginaActualSegura - 1))}
                  type="button"
                >
                  Anterior
                </button>
              )}
              {paginaActualSegura < inventarioPages.length - 1 ? (
                <button
                  className="prod-btn-modal prod-btn-guardar"
                  onClick={() => setPaginaActual(Math.min(inventarioPages.length - 1, paginaActualSegura + 1))}
                  type="button"
                >
                  Siguiente
                </button>
              ) : (
                <button className="prod-btn-modal prod-btn-guardar" onClick={guardarProducto} type="button">
                  Guardar
                </button>
              )}
            </div>

            <datalist id="inventario-categorias">
              {sugerencias.categorias.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id="inventario-marcas">
              {sugerencias.marcas.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id="inventario-proveedores">
              {sugerencias.proveedores.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id="inventario-ubicaciones">
              {sugerencias.ubicaciones.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
        </div>
      )}

      {mostrarModalCodigo && (
        <div className="prod-modal-overlay">
          <div className="prod-modal-center prod-modal-codigo">
            <h2 className="prod-modal-title">Modificar por codigo</h2>
            <p className="prod-modal-codigo-subtitle">
              Ingresa el codigo de barras del producto que deseas editar.
            </p>

            <input
              className={`prod-modal-codigo-input ${errorCodigoBusqueda ? "error" : ""}`}
              type="text"
              placeholder="Ej. 7501234567890"
              value={codigoBusqueda}
              onChange={(event) => {
                setCodigoBusqueda(event.target.value);
                if (errorCodigoBusqueda) setErrorCodigoBusqueda("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") buscarProductoPorCodigo();
              }}
              autoFocus
            />

            {errorCodigoBusqueda && (
              <div className="prod-modal-codigo-error">{errorCodigoBusqueda}</div>
            )}

            <div className="prod-modal-buttons">
              <button
                className="prod-btn-modal prod-btn-guardar"
                type="button"
                onClick={buscarProductoPorCodigo}
              >
                Buscar producto
              </button>
              <button
                className="prod-btn-modal prod-btn-cancelar"
                type="button"
                onClick={() => {
                  setMostrarModalCodigo(false);
                  setCodigoBusqueda("");
                  setErrorCodigoBusqueda("");
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return embedded ? contenido : <Layout>{contenido}</Layout>;
}
