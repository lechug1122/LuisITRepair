export const CURRENT_SYSTEM_UPDATE = {
  key: "system-update-2026-04-04-promocion-funciones-400",
  fecha: new Date("2026-04-04T12:00:00-06:00").getTime(),
  titulo: "Sistema completo por $400 al mes",
  detalle:
    "Servicios, POS, inventario, clientes, reportes, empleados, puntos e impresion en un solo lugar por $400 al mes.",
  accion: "/configuracion",
  accionTexto: "Ver funciones",
};

export function buildSystemUpdateNotification() {
  return {
    id: CURRENT_SYSTEM_UPDATE.key,
    tipo: "sistema",
    nivel: "media",
    titulo: CURRENT_SYSTEM_UPDATE.titulo,
    detalle: CURRENT_SYSTEM_UPDATE.detalle,
    accion: CURRENT_SYSTEM_UPDATE.accion,
    accionTexto: CURRENT_SYSTEM_UPDATE.accionTexto,
    fecha: CURRENT_SYSTEM_UPDATE.fecha,
    persistente: true,
  };
}
