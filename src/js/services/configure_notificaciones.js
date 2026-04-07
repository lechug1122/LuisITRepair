import { getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  allowLegacyTenantFallback,
  buildTenantStorageKey,
  getLegacyConfigDocRef,
  getTenantConfigDocRef,
  withTenantData,
} from "./tenant";

const NOTIFICACIONES_STORAGE_KEY = "notificaciones_config_cache_v1";

export const NOTIFICACIONES_CATALOGO = [
  {
    key: "servicios_nuevos",
    title: "Nuevos servicios",
    description: "Avisar cuando se registre una hoja de servicio nueva.",
  },
  {
    key: "cambios_estado_servicio",
    title: "Cambios de estado",
    description: "Notificar cambios de pendiente, revision, listo, cancelado y similares.",
  },
  {
    key: "servicios_cobrados",
    title: "Servicios cobrados",
    description: "Mostrar cuando un servicio quede cobrado desde POS.",
  },
  {
    key: "servicios_atrasados",
    title: "Servicios atrasados",
    description: "Alertar equipos que ya pasaron su fecha aproximada.",
  },
  {
    key: "servicios_sin_fecha",
    title: "Servicios sin fecha",
    description: "Alertar servicios activos que siguen sin promesa de entrega.",
  },
  {
    key: "servicios_por_cobrar",
    title: "Servicios por cobrar",
    description: "Avisar servicios listos, cancelados o no reparables con costo pendiente.",
  },
  {
    key: "servicios_listos_entrega",
    title: "Listos para entrega",
    description: "Mostrar cuando haya equipos listos/finalizados por entregar.",
  },
  {
    key: "actualizaciones_sistema",
    title: "Actualizaciones del sistema",
    description: "Mostrar novedades recientes y cambios importantes de la aplicacion.",
  },
  {
    key: "abandono_equipos",
    title: "Aviso de abandono",
    description: "Mostrar advertencia para notificar al cliente cuando un equipo caiga en abandono.",
  },
  {
    key: "stock_bajo",
    title: "Stock bajo",
    description: "Avisar productos que llegan al minimo configurado.",
  },
  {
    key: "stock_agotado",
    title: "Stock agotado",
    description: "Alertar productos que se quedaron en cero.",
  },
  {
    key: "ventas_nuevas",
    title: "Nuevas ventas",
    description: "Mostrar una notificacion cada vez que se registre una venta.",
  },
  {
    key: "ventas_altas",
    title: "Ventas altas",
    description: "Alertar ventas de monto alto para seguimiento.",
  },
  {
    key: "clientes_nuevos",
    title: "Nuevos clientes",
    description: "Notificar cuando se registre un cliente nuevo.",
  },
  {
    key: "tarjeta_sin_referencia",
    title: "Tarjeta sin referencia",
    description: "Alertar ventas con tarjeta sin referencia registrada.",
  },
  {
    key: "empleados_nuevos",
    title: "Nuevos empleados",
    description: "Notificar cuando se cree un trabajador nuevo.",
  },
  {
    key: "empleados_actualizados",
    title: "Cambios en empleados",
    description: "Avisar cambios de rol, estado, permisos o super administrador.",
  },
  {
    key: "empleados_eliminados",
    title: "Empleados eliminados",
    description: "Mostrar cuando se elimine un trabajador.",
  },
  {
    key: "password_reset",
    title: "Restablecer contraseña",
    description: "Notificar solicitudes de restablecimiento de contraseña.",
  },
];

export const DEFAULT_NOTIFICACIONES_CONFIG = NOTIFICACIONES_CATALOGO.reduce((acc, item) => {
  acc[item.key] = true;
  return acc;
}, {});

// Interpreta flags guardados como booleano real.
function bool(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

// Asegura que todas las llaves del catalogo existan con un valor utilizable.
export function normalizeNotificacionesConfig(raw = {}) {
  const result = { ...DEFAULT_NOTIFICACIONES_CONFIG };
  NOTIFICACIONES_CATALOGO.forEach((item) => {
    result[item.key] = bool(raw?.[item.key], DEFAULT_NOTIFICACIONES_CONFIG[item.key]);
  });
  return result;
}

// Guarda la configuracion mas reciente para arranque rapido.
function saveNotificacionesConfigCache(config) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      buildTenantStorageKey(NOTIFICACIONES_STORAGE_KEY),
      JSON.stringify(normalizeNotificacionesConfig(config)),
    );
  } catch {
    // noop
  }
}

// Lee la ultima configuracion valida desde cache local.
export function readNotificacionesConfigCache() {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIFICACIONES_CONFIG };

  try {
    const raw = localStorage.getItem(buildTenantStorageKey(NOTIFICACIONES_STORAGE_KEY));
    if (!raw) return { ...DEFAULT_NOTIFICACIONES_CONFIG };
    return normalizeNotificacionesConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFICACIONES_CONFIG };
  }
}

async function hydrateNotificacionesDoc(ref) {
  if (allowLegacyTenantFallback()) {
    const legacySnap = await getDoc(getLegacyConfigDocRef("notificaciones"));
    if (legacySnap.exists()) {
      const normalizedLegacy = normalizeNotificacionesConfig(legacySnap.data());
      await setDoc(
        ref,
        { ...withTenantData(normalizedLegacy), updatedAt: serverTimestamp() },
        { merge: true },
      );
      return normalizedLegacy;
    }
  }

  const defaults = { ...DEFAULT_NOTIFICACIONES_CONFIG };
  await setDoc(
    ref,
    { ...withTenantData(defaults), updatedAt: serverTimestamp() },
    { merge: true },
  );
  return defaults;
}

// Consulta rapida para saber si una notificacion especifica esta activa.
export function isNotificationEnabled(config = {}, key = "") {
  if (!key) return true;
  const normalized = normalizeNotificacionesConfig(config);
  return normalized[key] !== false;
}

// Lee la configuracion remota y la inicializa con defaults si hace falta.
export async function obtenerNotificacionesConfig() {
  try {
    const notificacionesRef = getTenantConfigDocRef("notificaciones");
    const snap = await getDoc(notificacionesRef);
    if (!snap.exists()) {
      const hydrated = await hydrateNotificacionesDoc(notificacionesRef);
      saveNotificacionesConfigCache(hydrated);
      return hydrated;
    }

    const normalized = normalizeNotificacionesConfig(snap.data());
    saveNotificacionesConfigCache(normalized);
    return normalized;
  } catch (error) {
    console.warn("[notificaciones-config] No se pudo leer configuracion remota:", error?.code || error);
    return readNotificacionesConfigCache();
  }
}

// Escucha cambios remotos y cae a cache si el snapshot falla.
export function escucharNotificacionesConfig(callback, onError) {
  const notificacionesRef = getTenantConfigDocRef("notificaciones");
  return onSnapshot(
    notificacionesRef,
    (snap) => {
      if (!snap.exists()) {
        const defaults = readNotificacionesConfigCache();
        callback(defaults);
        hydrateNotificacionesDoc(notificacionesRef)
          .then((normalized) => {
            saveNotificacionesConfigCache(normalized);
            callback(normalized);
          })
          .catch(() => {});
        return;
      }

      const normalized = normalizeNotificacionesConfig(snap.data());
      saveNotificacionesConfigCache(normalized);
      callback(normalized);
    },
    (error) => {
      console.warn("[notificaciones-config] Snapshot remoto no disponible:", error?.code || error);
      callback(readNotificacionesConfigCache());
      if (typeof onError === "function") onError(error);
    },
  );
}

// Persiste la configuracion actualizada en local y remoto.
export async function actualizarNotificacionesConfig(config) {
  const notificacionesRef = getTenantConfigDocRef("notificaciones");
  const normalized = normalizeNotificacionesConfig(config);
  saveNotificacionesConfigCache(normalized);
  await setDoc(
    notificacionesRef,
    { ...withTenantData(normalized), updatedAt: serverTimestamp() },
    { merge: true },
  );
  return normalized;
}
