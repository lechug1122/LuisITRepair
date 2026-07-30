export const CURRENT_SYSTEM_UPDATE = {
  key: "",
  fecha: 0,
  titulo: "",
  detalle: "",
  accion: "",
  accionTexto: "",
  activo: false,
};

export function buildSystemUpdateNotification() {
  if (!CURRENT_SYSTEM_UPDATE.activo) return null;

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
