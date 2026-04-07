function toDate(ts) {
  if (!ts) return null;
  if (typeof ts?.toDate === "function") return ts.toDate();
  if (typeof ts?.seconds === "number") return new Date(ts.seconds * 1000);
  const fecha = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function fmtFechaCliente(ts) {
  const fecha = toDate(ts);
  if (!fecha) return "-";
  return fecha.toLocaleDateString("es-MX");
}

function normalizarStatusCliente(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_ ]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

export function resumirItemsVentaCliente(venta = {}) {
  return (Array.isArray(venta?.productos) ? venta.productos : [])
    .filter(Boolean)
    .map((item) => {
      const nombre = String(
        item?.nombre || item?.descripcion || item?.codigo || "Concepto sin nombre",
      ).trim();
      const cantidad = Math.max(1, Number(item?.cantidad || 1));
      return `${cantidad}x ${nombre}`;
    });
}

export function construirResumenComprasCliente(ventas = []) {
  const totalCompras = ventas.reduce((acc, venta) => acc + Number(venta?.total || 0), 0);
  const ultimaCompra = ventas[0] || null;
  const productosMap = new Map();

  ventas.forEach((venta) => {
    (venta?.productos || []).forEach((item) => {
      const nombre = String(
        item?.nombre || item?.descripcion || item?.codigo || "Concepto sin nombre",
      ).trim();
      const cantidad = Math.max(1, Number(item?.cantidad || 1));
      productosMap.set(nombre, (productosMap.get(nombre) || 0) + cantidad);
    });
  });

  const productosFrecuentes = [...productosMap.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 3);

  return {
    totalTickets: ventas.length,
    totalCompras,
    ultimaCompra,
    promedioTicket: ventas.length ? totalCompras / ventas.length : 0,
    productosFrecuentes,
  };
}

export function construirResumenServiciosCliente(servicios = []) {
  const historial = servicios.filter(
    (servicio) => normalizarStatusCliente(servicio?.status) === "entregado",
  );
  const pendientes = servicios.filter(
    (servicio) => normalizarStatusCliente(servicio?.status) !== "entregado",
  );

  return {
    totalServicios: servicios.length,
    pendientes: pendientes.length,
    historial: historial.length,
    ultimoServicio: historial[0] || servicios[0] || null,
  };
}
