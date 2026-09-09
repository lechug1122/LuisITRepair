/**
 * Aviso de version que se muestra en el panel de notificaciones de los
 * administradores (ver MainLayout).
 *
 * Es un anuncio local, no un documento de Firestore: no genera lecturas ni
 * escrituras. Para retirarlo basta con poner `activo: false`.
 */
export const CURRENT_SYSTEM_UPDATE = {
  key: "cajalibre-2-2",
  // Fecha de publicacion de la version. Fija a proposito: el aviso debe
  // mostrar cuando salio la actualizacion, no cuando se abrio el sistema.
  fecha: Date.UTC(2026, 8, 8, 12, 0, 0),
  titulo: "CajaLibre 2.2 disponible",
  detalle:
    "Llega CajaLibre Premium: sin publicidad, soporte preferente, logo de tu negocio, "
    + "funciones adicionales y usuarios ilimitados por $300 MXN al mes. "
    + "El plan gratuito sigue igual. Consulta las novedades desde el pie de pagina.",
  accion: "/configuracion/mi-suscripcion",
  accionTexto: "Ver Premium",
  activo: true,
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
