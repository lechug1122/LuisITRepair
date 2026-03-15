import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../initializer/firebase";

const serviciosRef = doc(db, "configuracion", "servicios");
const SERVICIOS_STORAGE_KEY = "servicios_config_cache_v1";

export const DEFAULT_TERMINOS_SERVICIO = [
  "Respaldar datos antes de la intervencion.",
  "La garantia cubre solo los trabajos realizados.",
  "No hay responsabilidad por virus, mal uso o cambios de terceros.",
  "Todo trabajo requiere autorizacion del cliente.",
  "El tiempo de entrega depende de la complejidad del caso.",
  "El cliente debe revisar el equipo al momento de la entrega.",
  "No cubre golpes, liquidos, caidas o manipulacion indebida.",
  "Tras 30 dias de abandono no se garantiza resguardo del equipo.",
];

export const DEFAULT_RETARDO_CONFIG = {
  habilitado: false,
  diasTolerancia: 3,
  cargo: 0,
  aplicarCadaDias: 1,
  abandonoDias: 30,
  abandonoSiSuperaCosto: true,
};

export const DEFAULT_HOJA_SERVICIO_CONFIG = {
  habilitada: true,
  terminos: [...DEFAULT_TERMINOS_SERVICIO],
  retardo: { ...DEFAULT_RETARDO_CONFIG },
};

export const DEFAULT_SERVICIOS_CONFIG = {
  precioRevision: 0,
  habilitarCanjes: true,
  catalogoCanjes: [],
  hojaServicio: {
    ...DEFAULT_HOJA_SERVICIO_CONFIG,
    terminos: [...DEFAULT_HOJA_SERVICIO_CONFIG.terminos],
    retardo: { ...DEFAULT_HOJA_SERVICIO_CONFIG.retardo },
  },
};

function toMoney(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function toInt(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function toText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeCanjeItem(item = {}) {
  const productId = toText(item?.productId);
  const puntos = Number(String(item?.puntos ?? "").replace(/[^\d.]/g, ""));

  return {
    id: toText(item?.id) || `canje_${productId || "sin_producto"}`,
    productId,
    nombreProducto: toText(item?.nombreProducto),
    puntos: Number.isFinite(puntos) && puntos >= 0 ? Math.round(puntos) : 0,
    activo: item?.activo !== false,
  };
}

function normalizeTerminos(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_TERMINOS_SERVICIO];

  const terms = raw
    .map((item) => (typeof item === "string" ? item : item?.texto || item?.text || ""))
    .map((item) => toText(item))
    .filter(Boolean);

  return terms.length ? terms : [...DEFAULT_TERMINOS_SERVICIO];
}

export function normalizeRetardoConfig(raw = {}) {
  return {
    habilitado: toBoolean(raw?.habilitado, DEFAULT_RETARDO_CONFIG.habilitado),
    diasTolerancia: toInt(raw?.diasTolerancia, DEFAULT_RETARDO_CONFIG.diasTolerancia),
    cargo: toMoney(raw?.cargo, DEFAULT_RETARDO_CONFIG.cargo),
    aplicarCadaDias: Math.max(
      1,
      toInt(raw?.aplicarCadaDias, DEFAULT_RETARDO_CONFIG.aplicarCadaDias),
    ),
    abandonoDias: Math.max(
      1,
      toInt(raw?.abandonoDias, DEFAULT_RETARDO_CONFIG.abandonoDias),
    ),
    abandonoSiSuperaCosto: toBoolean(
      raw?.abandonoSiSuperaCosto,
      DEFAULT_RETARDO_CONFIG.abandonoSiSuperaCosto,
    ),
  };
}

export function normalizeHojaServicioConfig(raw = {}) {
  return {
    habilitada: toBoolean(raw?.habilitada, DEFAULT_HOJA_SERVICIO_CONFIG.habilitada),
    terminos: normalizeTerminos(raw?.terminos),
    retardo: normalizeRetardoConfig(raw?.retardo),
  };
}

export function describeRetardoConfig(retardoRaw = {}) {
  const retardo = normalizeRetardoConfig(retardoRaw);
  if (!retardo.habilitado) {
    return "Sin cargos automaticos por retardo o abandono.";
  }

  const parts = [
    `${retardo.diasTolerancia} dia(s) de tolerancia despues de la fecha de entrega.`,
    `Cargo de $${Number(retardo.cargo || 0).toFixed(2)} cada ${retardo.aplicarCadaDias} dia(s) de atraso.`,
    `Abandono a los ${retardo.abandonoDias} dia(s) si no se recoge el equipo.`,
  ];

  if (retardo.abandonoSiSuperaCosto) {
    parts.push("Tambien se considera abandono si el cargo acumulado supera el costo del servicio.");
  }

  return parts.join(" ");
}

export function normalizeServiciosConfig(raw = {}) {
  return {
    precioRevision: toMoney(raw?.precioRevision, DEFAULT_SERVICIOS_CONFIG.precioRevision),
    habilitarCanjes: toBoolean(
      raw?.habilitarCanjes,
      DEFAULT_SERVICIOS_CONFIG.habilitarCanjes,
    ),
    catalogoCanjes: Array.isArray(raw?.catalogoCanjes)
      ? raw.catalogoCanjes
          .map(normalizeCanjeItem)
          .filter((item) => item.productId)
      : [...DEFAULT_SERVICIOS_CONFIG.catalogoCanjes],
    hojaServicio: normalizeHojaServicioConfig(raw?.hojaServicio),
  };
}

function saveServiciosConfigCache(config) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      SERVICIOS_STORAGE_KEY,
      JSON.stringify(normalizeServiciosConfig(config)),
    );
  } catch {
    // noop
  }
}

export function readServiciosConfigCache() {
  if (typeof window === "undefined") {
    return normalizeServiciosConfig(DEFAULT_SERVICIOS_CONFIG);
  }

  try {
    const raw = localStorage.getItem(SERVICIOS_STORAGE_KEY);
    if (!raw) return normalizeServiciosConfig(DEFAULT_SERVICIOS_CONFIG);
    return normalizeServiciosConfig(JSON.parse(raw));
  } catch {
    return normalizeServiciosConfig(DEFAULT_SERVICIOS_CONFIG);
  }
}

export async function obtenerServiciosConfig() {
  try {
    const snap = await getDoc(serviciosRef);

    if (!snap.exists()) {
      const defaults = normalizeServiciosConfig(DEFAULT_SERVICIOS_CONFIG);
      saveServiciosConfigCache(defaults);
      await setDoc(
        serviciosRef,
        {
          ...defaults,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return defaults;
    }

    const normalized = normalizeServiciosConfig(snap.data());
    saveServiciosConfigCache(normalized);
    return normalized;
  } catch (error) {
    console.warn("[servicios-config] No se pudo leer configuracion remota:", error?.code || error);
    return readServiciosConfigCache();
  }
}

export function escucharServiciosConfig(callback, onError) {
  return onSnapshot(
    serviciosRef,
    (snap) => {
      if (!snap.exists()) {
        const defaults = readServiciosConfigCache();
        callback(defaults);
        setDoc(
          serviciosRef,
          {
            ...defaults,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ).catch(() => {});
        return;
      }

      const normalized = normalizeServiciosConfig(snap.data());
      saveServiciosConfigCache(normalized);
      callback(normalized);
    },
    (error) => {
      console.warn("[servicios-config] Snapshot remoto no disponible:", error?.code || error);
      callback(readServiciosConfigCache());
      if (typeof onError === "function") onError(error);
    },
  );
}

export async function actualizarServiciosConfig(config) {
  const normalized = normalizeServiciosConfig(config);

  saveServiciosConfigCache(normalized);
  await setDoc(
    serviciosRef,
    {
      ...normalized,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return normalized;
}
