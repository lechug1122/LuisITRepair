// ---------------------------------------------------------------------------
// Boleta del servicio, en la forma que necesitan la pantalla publica y el PDF.
//
// El mismo servicio puede traer la boleta por dos caminos: la consulta publica
// de seguimiento (`consultarServicioPublico`) y la consulta del enlace de
// aceptacion (`consultarOrdenAceptacion`). Las dos devuelven ya la lista
// explicita que arma el servidor, pero un servicio viejo puede no traer nada.
// Normalizar aqui evita que la tabla y el PDF hagan cada uno sus cuentas.
// ---------------------------------------------------------------------------

const numero = (valor) => {
  const limpio = Number(String(valor ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(limpio) ? limpio : 0;
};

export function formatearDinero(valor) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 2,
  }).format(numero(valor));
}

/**
 * Boleta lista para mostrar, o `null` cuando el servicio no tiene una.
 *
 * `null` no es un error: significa que el negocio todavia no desglosó nada y
 * la pantalla debe caer al presupuesto simple (`costo` / `precioDespues`).
 */
export function leerBoletaPublica(servicio = {}) {
  const boleta = servicio?.boleta;
  if (!boleta || typeof boleta !== "object") return null;

  const crudos = Array.isArray(boleta.items) ? boleta.items : [];
  const items = crudos.flatMap((raw, indice) => {
    if (!raw || typeof raw !== "object") return [];
    const descripcion = String(raw.descripcion || "").trim();
    const cantidad = numero(raw.cantidad);
    const pUnitario = numero(raw.pUnitario ?? raw.precio);
    if (!descripcion && !pUnitario) return [];
    return [{
      id: `${raw.item || "item"}-${indice}`,
      item: String(raw.item || `P-${String(indice + 1).padStart(3, "0")}`),
      descripcion: descripcion || "Artículo",
      cantidad,
      pUnitario,
      importe: numero(raw.importe) || cantidad * pUnitario,
    }];
  });

  const suma = items.reduce((total, item) => total + item.importe, 0);
  const total = numero(boleta.total) || suma;
  if (!items.length && !total) return null;

  return {
    esCotizacion: String(boleta.tipoDocumento || "") === "cotizacion",
    tipoDocumento: String(boleta.tipoDocumento || "venta"),
    folio: String(boleta.folio || ""),
    fecha: String(boleta.fecha || ""),
    formaPago: String(boleta.formaPago || ""),
    notas: String(boleta.notas || ""),
    items,
    suma,
    total,
    truncada: boleta.truncada === true,
  };
}

/**
 * Datos con los que `generarPdfBoletaVenta` arma el documento.
 *
 * Se construye desde la proyeccion publica: el cliente no tiene sesion, asi
 * que aqui no puede leerse nada de Firestore. Lo que no viene en la consulta
 * publica simplemente no aparece en el PDF.
 */
export function datosPdfBoleta(servicio = {}, boleta, folioServicio = "") {
  if (!boleta) return null;
  return {
    tipoDocumento: boleta.tipoDocumento,
    folio: boleta.folio || folioServicio || servicio?.folio || "",
    fecha: boleta.fecha,
    formaPago: boleta.formaPago,
    notas: boleta.notas,
    items: boleta.items.map((item) => ({
      item: item.item,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      pUnitario: item.pUnitario,
    })),
    total: boleta.total,
    nombre: servicio?.aceptacion?.nombreCliente || servicio?.cliente || "Cliente",
    direccion: "",
    telefono: "",
    servicioFolio: folioServicio || servicio?.folio || "",
    servicioDescripcion: servicio?.trabajo || "",
  };
}
