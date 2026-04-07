import { getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  allowLegacyTenantFallback,
  buildTenantStorageKey,
  getLegacyConfigDocRef,
  getTenantConfigDocRef,
  withTenantData,
} from "./tenant";

const MONEDA_STORAGE_KEY = "moneda_config_cache_v1";

export const LATAM_CURRENCY_OPTIONS = [
  { code: "MXN", locale: "es-MX", country: "Mexico", label: "Peso mexicano (MXN)", symbol: "$" },
  { code: "USD", locale: "es-PA", country: "Panama / El Salvador", label: "Dolar estadounidense (USD)", symbol: "US$" },
  { code: "ARS", locale: "es-AR", country: "Argentina", label: "Peso argentino (ARS)", symbol: "$" },
  { code: "BOB", locale: "es-BO", country: "Bolivia", label: "Boliviano (BOB)", symbol: "Bs" },
  { code: "BRL", locale: "pt-BR", country: "Brasil", label: "Real brasileno (BRL)", symbol: "R$" },
  { code: "CLP", locale: "es-CL", country: "Chile", label: "Peso chileno (CLP)", symbol: "$" },
  { code: "COP", locale: "es-CO", country: "Colombia", label: "Peso colombiano (COP)", symbol: "$" },
  { code: "CRC", locale: "es-CR", country: "Costa Rica", label: "Colon costarricense (CRC)", symbol: "CRC" },
  { code: "CUP", locale: "es-CU", country: "Cuba", label: "Peso cubano (CUP)", symbol: "$" },
  { code: "DOP", locale: "es-DO", country: "Republica Dominicana", label: "Peso dominicano (DOP)", symbol: "RD$" },
  { code: "GTQ", locale: "es-GT", country: "Guatemala", label: "Quetzal (GTQ)", symbol: "Q" },
  { code: "HNL", locale: "es-HN", country: "Honduras", label: "Lempira (HNL)", symbol: "L" },
  { code: "NIO", locale: "es-NI", country: "Nicaragua", label: "Cordoba oro (NIO)", symbol: "C$" },
  { code: "PAB", locale: "es-PA", country: "Panama", label: "Balboa (PAB)", symbol: "B/." },
  { code: "PEN", locale: "es-PE", country: "Peru", label: "Sol peruano (PEN)", symbol: "S/" },
  { code: "PYG", locale: "es-PY", country: "Paraguay", label: "Guarani (PYG)", symbol: "Gs." },
  { code: "UYU", locale: "es-UY", country: "Uruguay", label: "Peso uruguayo (UYU)", symbol: "$" },
  { code: "VES", locale: "es-VE", country: "Venezuela", label: "Bolivar digital (VES)", symbol: "Bs." },
];

export const DEFAULT_MONEDA_CONFIG = LATAM_CURRENCY_OPTIONS[0];

function findCurrencyOption(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  return LATAM_CURRENCY_OPTIONS.find((item) => item.code === normalizedCode) || null;
}

function toText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getCurrencyOption(code) {
  return findCurrencyOption(code) || DEFAULT_MONEDA_CONFIG;
}

export function normalizeMonedaConfig(raw = {}) {
  const option = getCurrencyOption(raw?.code || raw?.currency);
  return {
    code: option.code,
    locale: option.locale,
    country: option.country,
    label: option.label,
    symbol: option.symbol,
  };
}

function saveMonedaConfigCache(config) {
  if (typeof window === "undefined") return;

  try {
    const normalized = normalizeMonedaConfig(config);
    localStorage.setItem(
      buildTenantStorageKey(MONEDA_STORAGE_KEY),
      JSON.stringify({ code: normalized.code }),
    );
  } catch {
    // noop
  }
}

export function readMonedaConfigCache() {
  if (typeof window === "undefined") {
    return { ...DEFAULT_MONEDA_CONFIG };
  }

  try {
    const raw = localStorage.getItem(buildTenantStorageKey(MONEDA_STORAGE_KEY));
    if (!raw) return { ...DEFAULT_MONEDA_CONFIG };
    const parsed = JSON.parse(raw);
    return normalizeMonedaConfig(parsed);
  } catch {
    return { ...DEFAULT_MONEDA_CONFIG };
  }
}

export function formatCurrency(value, config, options = {}) {
  const moneda = normalizeMonedaConfig(config || readMonedaConfigCache());
  return new Intl.NumberFormat(moneda.locale, {
    style: "currency",
    currency: moneda.code,
    ...options,
  }).format(toNumber(value));
}

async function hydrateMonedaDoc(ref) {
  if (allowLegacyTenantFallback()) {
    const legacySnap = await getDoc(getLegacyConfigDocRef("moneda"));
    if (legacySnap.exists()) {
      const normalizedLegacy = normalizeMonedaConfig(legacySnap.data());
      await setDoc(
        ref,
        { ...withTenantData({ code: normalizedLegacy.code }), updatedAt: serverTimestamp() },
        { merge: true },
      );
      return normalizedLegacy;
    }
  }

  const defaults = { code: DEFAULT_MONEDA_CONFIG.code };
  await setDoc(
    ref,
    { ...withTenantData(defaults), updatedAt: serverTimestamp() },
    { merge: true },
  );
  return normalizeMonedaConfig(defaults);
}

export const obtenerMoneda = async () => {
  try {
    const monedaRef = getTenantConfigDocRef("moneda");
    const snap = await getDoc(monedaRef);

    if (!snap.exists()) {
      const hydrated = await hydrateMonedaDoc(monedaRef);
      saveMonedaConfigCache(hydrated);
      return hydrated;
    }

    const normalized = normalizeMonedaConfig(snap.data());
    saveMonedaConfigCache(normalized);
    return normalized;
  } catch (error) {
    console.warn("[moneda] No se pudo leer configuracion remota:", error?.code || error);
    return readMonedaConfigCache();
  }
};

export const escucharMoneda = (callback, onError) => {
  const monedaRef = getTenantConfigDocRef("moneda");
  return onSnapshot(
    monedaRef,
    (snap) => {
      if (!snap.exists()) {
        const defaults = readMonedaConfigCache();
        callback(defaults);
        hydrateMonedaDoc(monedaRef)
          .then((normalized) => {
            saveMonedaConfigCache(normalized);
            callback(normalized);
          })
          .catch(() => {});
        return;
      }

      const normalized = normalizeMonedaConfig(snap.data());
      saveMonedaConfigCache(normalized);
      callback(normalized);
    },
    (error) => {
      console.warn("[moneda] Snapshot remoto no disponible:", error?.code || error);
      callback(readMonedaConfigCache());
      if (typeof onError === "function") onError(error);
    },
  );
};

export const actualizarMoneda = async (code) => {
  const monedaRef = getTenantConfigDocRef("moneda");
  const normalized = normalizeMonedaConfig({ code: toText(code, DEFAULT_MONEDA_CONFIG.code) });
  saveMonedaConfigCache(normalized);

  await setDoc(
    monedaRef,
    {
      ...withTenantData({ code: normalized.code }),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return normalized;
};
