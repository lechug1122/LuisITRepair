export const CURRENT_SYSTEM_UPDATE = {
  key: "system-update-2026-03-13-retardo",
  fecha: new Date("2026-03-13T12:00:00-06:00").getTime(),
  titulo: "Actualizacion reciente del sistema",
  detalle:
    "Se agrego retardo automatico por fecha de entrega, modal rojo de equipo con retraso y un progress bar corregido en detalle del servicio.",
  accion: "/configuracion",
  accionTexto: "Ver novedades",
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
