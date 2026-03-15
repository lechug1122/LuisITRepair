import { collection, getDocs } from "firebase/firestore";
import { db } from "../../initializer/firebase";

/* =========================
   Helpers
========================= */
function normalizarStatus(raw) {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_ ]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameMonth(date, month, year) {
  return !!date && date.getMonth() === month && date.getFullYear() === year;
}

function calcularUtilidadProducto(producto) {
  if (!producto || producto.esServicio || producto.esCanje) return 0;

  const cantidad = Number(producto?.cantidad || 0);
  const precioVenta = Number(producto?.precioVenta ?? producto?.precio ?? 0);
  const precioCompra = Number(producto?.precioCompra ?? producto?.costoCompra ?? 0);

  if (!Number.isFinite(cantidad) || cantidad <= 0) return 0;
  if (!Number.isFinite(precioVenta) || !Number.isFinite(precioCompra)) return 0;

  return Math.max(precioVenta - precioCompra, 0) * cantidad;
}

function calcularUtilidadVenta(venta) {
  return (venta?.productos || []).reduce(
    (acc, producto) => acc + calcularUtilidadProducto(producto),
    0,
  );
}

/* =========================
   Barras - Ingresos por dia
========================= */
export async function obtenerIngresosPorDia() {
  const [serviciosSnap, ventasSnap] = await Promise.all([
    getDocs(collection(db, "servicios")),
    getDocs(collection(db, "ventas")),
  ]);

  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const anioActual = ahora.getFullYear();
  const diasDelMes = new Date(anioActual, mesActual + 1, 0).getDate();

  const servicios = serviciosSnap.docs.map((d) => d.data());
  const ventas = ventasSnap.docs.map((d) => d.data());
  const ingresosPorDia = {};

  servicios.forEach((servicio) => {
    if (normalizarStatus(servicio.status) !== "entregado") return;

    const fecha = toDate(servicio.fechaEntregado);
    if (!isSameMonth(fecha, mesActual, anioActual)) return;

    const dia = fecha.getDate();
    ingresosPorDia[dia] = {
      servicios: (ingresosPorDia[dia]?.servicios || 0) + Number(servicio.costo || 0),
      utilidadPos: ingresosPorDia[dia]?.utilidadPos || 0,
    };
  });

  ventas.forEach((venta) => {
    const fecha = toDate(venta.fecha);
    if (!isSameMonth(fecha, mesActual, anioActual)) return;

    const dia = fecha.getDate();
    ingresosPorDia[dia] = {
      servicios: ingresosPorDia[dia]?.servicios || 0,
      utilidadPos:
        (ingresosPorDia[dia]?.utilidadPos || 0) + calcularUtilidadVenta(venta),
    };
  });

  const resultado = [];

  for (let i = 1; i <= diasDelMes; i += 1) {
    const serviciosDia = Number(ingresosPorDia[i]?.servicios || 0);
    const utilidadPosDia = Number(ingresosPorDia[i]?.utilidadPos || 0);

    resultado.push({
      dia: `Dia ${i}`,
      servicios: serviciosDia,
      utilidadPos: utilidadPosDia,
      total: serviciosDia + utilidadPosDia,
    });
  }

  return resultado;
}

/* =========================
   Pastel - Ingresos por tipo
========================= */
export async function obtenerIngresosPorTipo() {
  const serviciosSnap = await getDocs(collection(db, "servicios"));

  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const anioActual = ahora.getFullYear();

  const servicios = serviciosSnap.docs.map((d) => d.data());
  const ingresosPorTipo = {};

  servicios.forEach((servicio) => {
    if (normalizarStatus(servicio.status) !== "entregado") return;

    const fecha = toDate(servicio.fechaEntregado);
    if (!isSameMonth(fecha, mesActual, anioActual)) return;

    const tipo = (servicio.tipoDispositivo || "Otro").toUpperCase();
    ingresosPorTipo[tipo] = (ingresosPorTipo[tipo] || 0) + Number(servicio.costo || 0);
  });

  return Object.keys(ingresosPorTipo).map((tipo) => ({
    name: tipo,
    value: ingresosPorTipo[tipo],
  }));
}
