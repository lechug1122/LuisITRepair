const INVENTARIO_TEMPLATE_SHEET_PATH = "xl/worksheets/sheet1.xml";
const INVENTARIO_TEMPLATE_LAST_ROW = 300;
const INVENTARIO_EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const INVENTARIO_EXCEL_COLUMNS = [
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
  { key: "tipoImpuesto", label: "Tipo de impuesto" },
  { key: "ieps", label: "IEPS" },
  { key: "iepsTipo", label: "Tipo IEPS" },
  { key: "iepsUnidad", label: "Unidad cuota IEPS" },
  { key: "notasInternas", label: "Notas internas" },
  { key: "estadoInventario", label: "Estado" },
];

export const INVENTARIO_EXCEL_NUMERIC_KEYS = new Set([
  "precioCompra",
  "ultimoCosto",
  "precioVenta",
  "stock",
  "stockMinimo",
  "stockMaximo",
  "puntoReorden",
  "iva",
  "ieps",
]);

function escapeExcelXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getExcelColumnName(columnIndex) {
  let index = columnIndex + 1;
  let name = "";
  while (index > 0) {
    index -= 1;
    name = String.fromCharCode(65 + (index % 26)) + name;
    index = Math.floor(index / 26);
  }
  return name;
}

function escribirCeldaPlantilla(rowXml, cellReference, value, numeric = false) {
  const cellPattern = new RegExp(
    `<x:c\\b([^>]*?\\br="${cellReference}"[^>]*?)(?:\\s*\\/>|>[\\s\\S]*?<\\/x:c>)`,
  );
  const match = rowXml.match(cellPattern);
  if (!match) return rowXml;

  const attributes = match[1].replace(/\s+t="[^"]*"/g, "");
  const empty = value === "" || value === null || value === undefined;
  if (empty) {
    return rowXml.replace(cellPattern, `<x:c${attributes} />`);
  }

  const numericValue = Number(value);
  const useNumericValue = numeric && Number.isFinite(numericValue);
  const serializedValue = useNumericValue ? String(numericValue) : escapeExcelXml(value);
  const typeAttribute = useNumericValue ? "" : ' t="str"';
  return rowXml.replace(
    cellPattern,
    () => `<x:c${attributes}${typeAttribute}><x:v>${serializedValue}</x:v></x:c>`,
  );
}

function escribirProductoEnFila(rowXml, rowNumber, producto, columns, numericKeys) {
  let nextRow = rowXml;
  columns.forEach((column, columnIndex) => {
    nextRow = escribirCeldaPlantilla(
      nextRow,
      `${getExcelColumnName(columnIndex)}${rowNumber}`,
      producto?.[column.key] ?? "",
      numericKeys.has(column.key),
    );
  });
  return nextRow;
}

function cambiarNumeroFilaPlantilla(rowXml, sourceRow, targetRow) {
  return rowXml
    .replace(
      new RegExp(`r="([A-Z]+)${sourceRow}"`, "g"),
      (_match, columnName) => `r="${columnName}${targetRow}"`,
    )
    .replace(
      new RegExp(`(<x:row\\b[^>]*\\br=")${sourceRow}("[^>]*>)`),
      `$1${targetRow}$2`,
    );
}

export function llenarXmlPlantillaInventario(
  sheetXml,
  productos = [],
  columns = [],
  numericKeys = new Set(),
) {
  const sheetDataPattern = /(<x:sheetData\b[^>]*>)([\s\S]*?)(<\/x:sheetData>)/;
  const sheetDataMatch = sheetXml.match(sheetDataPattern);
  if (!sheetDataMatch) throw new Error("La hoja Plantilla no contiene el bloque de datos esperado.");

  const originalRowsXml = sheetDataMatch[2];
  const templateRowMatch = originalRowsXml.match(
    new RegExp(`<x:row\\b[^>]*\\br="${INVENTARIO_TEMPLATE_LAST_ROW - 1}"[^>]*>[\\s\\S]*?<\\/x:row>`),
  );
  if (!templateRowMatch) throw new Error("La plantilla no contiene las filas reservadas esperadas.");

  const rowPattern = /<x:row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/x:row>/g;
  let populatedRowsXml = originalRowsXml.replace(rowPattern, (rowXml, rawRowNumber) => {
    const rowNumber = Number(rawRowNumber);
    if (rowNumber < 2 || rowNumber > INVENTARIO_TEMPLATE_LAST_ROW) return rowXml;
    return escribirProductoEnFila(
      rowXml,
      rowNumber,
      productos[rowNumber - 2] || null,
      columns,
      numericKeys,
    );
  });

  if (productos.length > INVENTARIO_TEMPLATE_LAST_ROW - 1) {
    const extraRows = [];
    for (let index = INVENTARIO_TEMPLATE_LAST_ROW - 1; index < productos.length; index += 1) {
      const rowNumber = index + 2;
      const clonedRow = cambiarNumeroFilaPlantilla(
        templateRowMatch[0],
        INVENTARIO_TEMPLATE_LAST_ROW - 1,
        rowNumber,
      );
      extraRows.push(escribirProductoEnFila(clonedRow, rowNumber, productos[index], columns, numericKeys));
    }
    populatedRowsXml += extraRows.join("");
  }

  let updatedXml = sheetXml.replace(
    sheetDataPattern,
    (_match, openTag, _originalRows, closeTag) => `${openTag}${populatedRowsXml}${closeTag}`,
  );
  const lastDataRow = productos.length + 1;
  if (lastDataRow > INVENTARIO_TEMPLATE_LAST_ROW) {
    updatedXml = updatedXml.replace(
      /sqref="([A-Z]+2):([A-Z]+)300"/g,
      (_match, startCell, endColumn) => `sqref="${startCell}:${endColumn}${lastDataRow}"`,
    );
  }
  return updatedXml;
}

export async function crearInventarioDesdePlantilla({
  templateBuffer,
  productos = [],
  columns = [],
  numericKeys = new Set(),
}) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(templateBuffer);
  const sheetFile = zip.file(INVENTARIO_TEMPLATE_SHEET_PATH);
  if (!sheetFile) throw new Error("No se encontró la hoja Plantilla en el archivo base.");

  const sheetXml = await sheetFile.async("string");
  zip.file(
    INVENTARIO_TEMPLATE_SHEET_PATH,
    llenarXmlPlantillaInventario(sheetXml, productos, columns, numericKeys),
  );
  return zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    mimeType: INVENTARIO_EXCEL_MIME,
  });
}
