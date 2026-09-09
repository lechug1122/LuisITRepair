import catalogoProductosComercialUrl from "../../csv/CATALOGO PRODUCTOS.xlsx?url";
import catalogoProductosSatUrl from "../../csv/catalogo_productos.xlsx?url";

const CATALOGOS = [
  {
    label: "base comercial",
    url: catalogoProductosComercialUrl,
  },
  {
    label: "base SAT",
    url: catalogoProductosSatUrl,
  },
];

const HEADER_ALIASES = {
  codigo: ["Articulo", "Codigo", "C\u00f3digo", "Codigo de barras", "Barcode", "EAN", "UPC"],
  descripcion: ["Descripcion", "Descripci\u00f3n", "Nombre", "Producto"],
  categoria: ["SubCategoria", "SubCategor\u00eda", "Categoria", "Categor\u00eda"],
  precioCompra: ["Costo", "Costo compra", "Precio compra", "PrecioCompra"],
  precioVenta: ["Precio", "Precio venta", "PrecioVenta"],
  claveSat: ["ClaveProdServ", "Clave SAT", "ClaveProdServSAT"],
  claveUnidadSat: ["ClaveUnidad", "Clave Unidad", "Unidad SAT"],
};

let catalogoPromise = null;

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizarCodigoCatalogo(value) {
  return cleanText(value).replace(/\s+/g, "");
}

function obtenerValorFila(row, aliases = []) {
  for (const key of aliases) {
    const value = cleanText(row?.[key]);
    if (value) return value;
  }
  return "";
}

function cleanMoneyText(value) {
  return cleanText(value).replace(/\$/g, "");
}

function unirFuentes(...sourceLists) {
  return [...new Set(sourceLists.flat().filter(Boolean))];
}

function mergeProductoCatalogo(actual = {}, siguiente = {}) {
  return {
    codigo: actual.codigo || siguiente.codigo || "",
    nombre: actual.nombre || siguiente.nombre || "",
    descripcion: actual.descripcion || siguiente.descripcion || "",
    descripcionFactura: actual.descripcionFactura || siguiente.descripcionFactura || "",
    categoria: actual.categoria || siguiente.categoria || "",
    precioCompra: actual.precioCompra || siguiente.precioCompra || "",
    ultimoCosto: actual.ultimoCosto || siguiente.ultimoCosto || actual.precioCompra || siguiente.precioCompra || "",
    precioVenta: actual.precioVenta || siguiente.precioVenta || "",
    claveSat: actual.claveSat || siguiente.claveSat || "",
    claveUnidadSat: actual.claveUnidadSat || siguiente.claveUnidadSat || "",
    fuentes: unirFuentes(actual.fuentes || [], siguiente.fuentes || []),
  };
}

function mapearFilaProducto(row = {}, fuente = "") {
  const codigo = normalizarCodigoCatalogo(obtenerValorFila(row, HEADER_ALIASES.codigo));
  if (!codigo) return null;

  const descripcion = obtenerValorFila(row, HEADER_ALIASES.descripcion);
  const categoria = obtenerValorFila(row, HEADER_ALIASES.categoria);
  const precioCompra = cleanMoneyText(obtenerValorFila(row, HEADER_ALIASES.precioCompra));
  const precioVenta = cleanMoneyText(obtenerValorFila(row, HEADER_ALIASES.precioVenta));
  const claveSat = obtenerValorFila(row, HEADER_ALIASES.claveSat);
  const claveUnidadSat = obtenerValorFila(row, HEADER_ALIASES.claveUnidadSat);

  return {
    codigo,
    nombre: descripcion,
    descripcion,
    descripcionFactura: descripcion,
    categoria,
    precioCompra,
    ultimoCosto: precioCompra,
    precioVenta,
    claveSat,
    claveUnidadSat,
    fuentes: fuente ? [fuente] : [],
  };
}

async function cargarCatalogoBarras() {
  if (!catalogoPromise) {
    catalogoPromise = (async () => {
      try {
        const XLSX = await import("xlsx-js-style");
        const respuestas = await Promise.all(
          CATALOGOS.map(async (catalogoConfig) => {
            const response = await fetch(catalogoConfig.url);
            if (!response.ok) {
              throw new Error(`No se pudo cargar ${catalogoConfig.url} (${response.status}).`);
            }

            const buffer = await response.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];
            const firstSheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(firstSheet, {
              defval: "",
              raw: false,
            });

            return {
              label: catalogoConfig.label,
              rows,
            };
          }),
        );

        const catalogo = new Map();

        respuestas.forEach(({ label, rows }) => {
          rows.forEach((row) => {
            const producto = mapearFilaProducto(row, label);
            if (!producto) return;

            const actual = catalogo.get(producto.codigo);
            catalogo.set(
              producto.codigo,
              actual ? mergeProductoCatalogo(actual, producto) : producto,
            );
          });
        });

        return catalogo;
      } catch (error) {
        catalogoPromise = null;
        throw error;
      }
    })();
  }

  return catalogoPromise;
}

export async function buscarProductoCatalogoPorCodigo(codigo) {
  const codigoNormalizado = normalizarCodigoCatalogo(codigo);
  if (!codigoNormalizado) return null;
  const catalogo = await cargarCatalogoBarras();
  return catalogo.get(codigoNormalizado) || null;
}

export { normalizarCodigoCatalogo };
