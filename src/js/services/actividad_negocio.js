// Clasificacion de uso de CajaLibre por negocio.
//
// Mide UNICAMENTE si el negocio sigue entrando al sistema. No lee ni deduce
// nada de su operacion comercial (ventas, clientes, productos): el superadmin
// necesita saber si la cuenta se usa, no cuanto dinero genera.

// Umbrales en dias. Centralizados para poder ajustarlos sin tocar la UI.
export const ACTIVIDAD_UMBRALES = {
  frecuente: 3,
  activo: 14,
  poco: 30,
};

export const ACTIVIDAD_NIVELES = [
  { id: "frecuente", label: "Activo frecuente", tono: "verde" },
  { id: "activo", label: "Activo", tono: "azul" },
  { id: "poco", label: "Poco activo", tono: "ambar" },
  { id: "inactivo", label: "Inactivo", tono: "gris" },
  { id: "desconocido", label: "Sin datos", tono: "gris" },
];

const POR_ID = Object.fromEntries(ACTIVIDAD_NIVELES.map((item) => [item.id, item]));

export function diasDesde(valorMs, ahora = Date.now()) {
  if (!valorMs) return null;
  return Math.floor((ahora - valorMs) / 86400000);
}

export function clasificarActividad(ultimaActividadMs, ahora = Date.now()) {
  const dias = diasDesde(ultimaActividadMs, ahora);
  if (dias === null) return { ...POR_ID.desconocido, dias: null };
  if (dias <= ACTIVIDAD_UMBRALES.frecuente) return { ...POR_ID.frecuente, dias };
  if (dias <= ACTIVIDAD_UMBRALES.activo) return { ...POR_ID.activo, dias };
  if (dias <= ACTIVIDAD_UMBRALES.poco) return { ...POR_ID.poco, dias };
  return { ...POR_ID.inactivo, dias };
}

export function etiquetaUltimoAcceso(valorMs, ahora = Date.now()) {
  if (!valorMs) return "Sin registro";
  const dias = diasDesde(valorMs, ahora);
  const fecha = new Date(valorMs);
  const hora = fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  if (dias === 0) return `Hoy ${hora}`;
  if (dias === 1) return `Ayer ${hora}`;
  if (dias < 30) return `Hace ${dias} días`;
  return fecha.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}
