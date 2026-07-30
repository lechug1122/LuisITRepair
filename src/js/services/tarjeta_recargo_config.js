import { getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  buildTenantStorageKey,
  getTenantConfigDocRef,
  withTenantData,
} from "./tenant";

const TARJETA_RECARGO_STORAGE_KEY = "tarjeta_recargo_config_v1";

export const DEFAULT_TARJETA_RECARGO_CONFIG = {
  habilitado: true,
  proveedor: "Mercado Pago",
  porcentajeBase: 2.999,
  ivaComision: 16.697,
};

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function toText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const normalized = String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function normalizeTarjetaRecargoConfig(raw = {}) {
  return {
    habilitado: toBool(raw?.habilitado, DEFAULT_TARJETA_RECARGO_CONFIG.habilitado),
    proveedor: toText(raw?.proveedor, DEFAULT_TARJETA_RECARGO_CONFIG.proveedor),
    porcentajeBase: Math.max(
      0,
      toNumber(raw?.porcentajeBase, DEFAULT_TARJETA_RECARGO_CONFIG.porcentajeBase),
    ),
    ivaComision: Math.max(
      0,
      toNumber(raw?.ivaComision, DEFAULT_TARJETA_RECARGO_CONFIG.ivaComision),
    ),
  };
}

export function calcularRecargoTarjeta(total, configRaw = {}) {
  const config = normalizeTarjetaRecargoConfig(configRaw);
  const base = Math.max(0, Number(total) || 0);
  const porcentajeTotal = config.habilitado
    ? config.porcentajeBase * (1 + config.ivaComision / 100)
    : 0;
  const recargo = roundMoney(base * (porcentajeTotal / 100));

  return {
    habilitado: config.habilitado,
    proveedor: config.proveedor,
    porcentajeBase: config.porcentajeBase,
    ivaComision: config.ivaComision,
    porcentajeTotal,
    recargo,
    totalConRecargo: roundMoney(base + recargo),
  };
}

function saveTarjetaRecargoConfigCache(config) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      buildTenantStorageKey(TARJETA_RECARGO_STORAGE_KEY),
      JSON.stringify(normalizeTarjetaRecargoConfig(config)),
    );
  } catch {
    // noop
  }
}

export function readTarjetaRecargoConfigCache() {
  if (typeof window === "undefined") {
    return { ...DEFAULT_TARJETA_RECARGO_CONFIG };
  }

  try {
    const raw = localStorage.getItem(buildTenantStorageKey(TARJETA_RECARGO_STORAGE_KEY));
    if (!raw) return { ...DEFAULT_TARJETA_RECARGO_CONFIG };
    return normalizeTarjetaRecargoConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TARJETA_RECARGO_CONFIG };
  }
}

async function hydrateTarjetaRecargoDoc(ref) {
  const defaults = normalizeTarjetaRecargoConfig(DEFAULT_TARJETA_RECARGO_CONFIG);
  await setDoc(
    ref,
    { ...withTenantData(defaults), updatedAt: serverTimestamp() },
    { merge: true },
  );
  return defaults;
}

export const obtenerTarjetaRecargoConfig = async () => {
  try {
    const ref = getTenantConfigDocRef("recargo_tarjeta");
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      const hydrated = await hydrateTarjetaRecargoDoc(ref);
      saveTarjetaRecargoConfigCache(hydrated);
      return hydrated;
    }

    const normalized = normalizeTarjetaRecargoConfig(snap.data());
    saveTarjetaRecargoConfigCache(normalized);
    return normalized;
  } catch (error) {
    console.warn("[recargo-tarjeta] No se pudo leer configuracion remota:", error?.code || error);
    return readTarjetaRecargoConfigCache();
  }
};

export const escucharTarjetaRecargoConfig = (callback, onError) => {
  const ref = getTenantConfigDocRef("recargo_tarjeta");
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        const defaults = readTarjetaRecargoConfigCache();
        callback(defaults);
        hydrateTarjetaRecargoDoc(ref)
          .then((normalized) => {
            saveTarjetaRecargoConfigCache(normalized);
            callback(normalized);
          })
          .catch(() => {});
        return;
      }

      const normalized = normalizeTarjetaRecargoConfig(snap.data());
      saveTarjetaRecargoConfigCache(normalized);
      callback(normalized);
    },
    (error) => {
      console.warn("[recargo-tarjeta] Snapshot remoto no disponible:", error?.code || error);
      callback(readTarjetaRecargoConfigCache());
      if (typeof onError === "function") onError(error);
    },
  );
};

export const actualizarTarjetaRecargoConfig = async (config) => {
  const ref = getTenantConfigDocRef("recargo_tarjeta");
  const normalized = normalizeTarjetaRecargoConfig(config);
  saveTarjetaRecargoConfigCache(normalized);

  await setDoc(
    ref,
    { ...withTenantData(normalized), updatedAt: serverTimestamp() },
    { merge: true },
  );

  return normalized;
};
