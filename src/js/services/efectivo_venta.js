const numeroFinito = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

// El efectivo capturado en el POS es el monto entregado por el cliente, no
// necesariamente el que permanece en caja. La parte neta de efectivo de una
// venta es el total menos los pagos no realizados en efectivo.
export function obtenerEfectivoNetoVenta(venta = {}) {
  const detalle = venta?.pagoDetalle || {};
  const tipo = String(venta?.tipoPago || "").trim().toLowerCase();
  const total = Math.max(0, numeroFinito(venta?.total));
  const efectivoRecibido = Math.max(0, numeroFinito(detalle?.efectivo));
  const tarjeta = Math.max(0, numeroFinito(detalle?.tarjeta));
  const transferencia = Math.max(0, numeroFinito(detalle?.transferencia));

  if (efectivoRecibido > 0) {
    if (detalle?.cambio !== undefined && detalle?.cambio !== null) {
      return Number(Math.max(0, efectivoRecibido - Math.max(0, numeroFinito(detalle.cambio))).toFixed(2));
    }
    return Number(Math.max(0, Math.min(efectivoRecibido, total - tarjeta - transferencia)).toFixed(2));
  }

  return tipo === "efectivo" ? Number(total.toFixed(2)) : 0;
}
