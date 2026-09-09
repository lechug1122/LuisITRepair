import { getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  allowLegacyTenantFallback,
  buildTenantStorageKey,
  getLegacyConfigDocRef,
  getTenantConfigDocRef,
  withTenantData,
} from "./tenant";
import { detectMobileDevice } from "./mobile_detection";

const IMPRESORAS_SHARED_STORAGE_KEY = "impresoras_config_shared_v2";
const IMPRESORAS_LOCAL_STORAGE_KEY = "impresoras_config_local_v2";
const IMPRESORAS_LEGACY_STORAGE_KEY = "impresoras_config_cache_v1";

function getDefaultSalidaTicketMovil() {
  return detectMobileDevice() ? "imagen" : "dialogo";
}

const DEFAULT_LOCAL_IMPRESORAS_CONFIG = {
  modoImpresion: "dialogo",
  nombreImpresoraTicket: "",
  tamanoTicket: "58mm",
  nombreImpresoraHojaServicio: "",
  tamanoHojaServicio: "a4",
  salidaTicketMovil: getDefaultSalidaTicketMovil(),
};

const DEFAULT_SHARED_IMPRESORAS_CONFIG = {
  imprimirAlCobrar: true,
  imprimirAlIniciarServicio: true,
  documentoAlIniciarServicio: "ticket",
};

export const DEFAULT_IMPRESORAS_CONFIG = {
  ...DEFAULT_LOCAL_IMPRESORAS_CONFIG,
  ...DEFAULT_SHARED_IMPRESORAS_CONFIG,
};

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

function normalizeModoImpresion(value) {
  const normalized = toText(value, DEFAULT_LOCAL_IMPRESORAS_CONFIG.modoImpresion).toLowerCase();
  return normalized === "silenciosa" ? "silenciosa" : "dialogo";
}

function normalizeSalidaTicketMovil(value) {
  const normalized = toText(value, DEFAULT_LOCAL_IMPRESORAS_CONFIG.salidaTicketMovil).toLowerCase();
  return normalized === "imagen" ? "imagen" : "dialogo";
}

function normalizeTamanoTicket(value) {
  return String(value || "").trim().toLowerCase() === "80mm" ? "80mm" : "58mm";
}

function normalizeDocumentoAlIniciarServicio(value) {
  const normalized = toText(
    value,
    DEFAULT_SHARED_IMPRESORAS_CONFIG.documentoAlIniciarServicio,
  ).toLowerCase();

  if (normalized === "hoja" || normalized === "ambos") return normalized;
  return "ticket";
}

function normalizeTamanoHojaServicio(value) {
  const normalized = toText(
    value,
    DEFAULT_LOCAL_IMPRESORAS_CONFIG.tamanoHojaServicio,
  ).toLowerCase();

  if (normalized === "carta" || normalized === "letter") return "carta";
  return "a4";
}

function normalizeLocalImpresorasConfig(raw = {}) {
  const legacyPrinterName = toText(raw?.nombreImpresora);

  return {
    modoImpresion: normalizeModoImpresion(raw?.modoImpresion),
    nombreImpresoraTicket: toText(raw?.nombreImpresoraTicket ?? legacyPrinterName),
    tamanoTicket: normalizeTamanoTicket(raw?.tamanoTicket),
    nombreImpresoraHojaServicio: toText(
      raw?.nombreImpresoraHojaServicio ?? legacyPrinterName,
    ),
    tamanoHojaServicio: normalizeTamanoHojaServicio(raw?.tamanoHojaServicio),
    salidaTicketMovil: normalizeSalidaTicketMovil(raw?.salidaTicketMovil),
  };
}

function normalizeSharedImpresorasConfig(raw = {}) {
  return {
    imprimirAlCobrar: toBoolean(
      raw?.imprimirAlCobrar,
      DEFAULT_SHARED_IMPRESORAS_CONFIG.imprimirAlCobrar,
    ),
    imprimirAlIniciarServicio: toBoolean(
      raw?.imprimirAlIniciarServicio,
      DEFAULT_SHARED_IMPRESORAS_CONFIG.imprimirAlIniciarServicio,
    ),
    documentoAlIniciarServicio: normalizeDocumentoAlIniciarServicio(
      raw?.documentoAlIniciarServicio,
    ),
  };
}

function mergeImpresorasConfig(localConfig = {}, sharedConfig = {}) {
  return {
    ...DEFAULT_IMPRESORAS_CONFIG,
    ...normalizeLocalImpresorasConfig(localConfig),
    ...normalizeSharedImpresorasConfig(sharedConfig),
  };
}

export function normalizeImpresorasConfig(raw = {}) {
  return {
    ...normalizeLocalImpresorasConfig(raw),
    ...normalizeSharedImpresorasConfig(raw),
  };
}

function readLegacyImpresorasConfigCache() {
  if (typeof window === "undefined") return;

  try {
    const raw = localStorage.getItem(IMPRESORAS_LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return normalizeImpresorasConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveLocalImpresorasConfigCache(config) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      buildTenantStorageKey(IMPRESORAS_LOCAL_STORAGE_KEY),
      JSON.stringify(normalizeLocalImpresorasConfig(config)),
    );
  } catch {
    // noop
  }
}

function saveSharedImpresorasConfigCache(config) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      buildTenantStorageKey(IMPRESORAS_SHARED_STORAGE_KEY),
      JSON.stringify(normalizeSharedImpresorasConfig(config)),
    );
  } catch {
    // noop
  }
}

function readLocalImpresorasConfigCache() {
  if (typeof window === "undefined") {
    return normalizeLocalImpresorasConfig(DEFAULT_LOCAL_IMPRESORAS_CONFIG);
  }

  try {
    const raw = localStorage.getItem(buildTenantStorageKey(IMPRESORAS_LOCAL_STORAGE_KEY));
    if (raw) return normalizeLocalImpresorasConfig(JSON.parse(raw));
  } catch {
    // noop
  }

  if (allowLegacyTenantFallback()) {
    const legacy = readLegacyImpresorasConfigCache();
    if (legacy) return normalizeLocalImpresorasConfig(legacy);
  }

  return normalizeLocalImpresorasConfig(DEFAULT_LOCAL_IMPRESORAS_CONFIG);
}

function readSharedImpresorasConfigCache() {
  if (typeof window === "undefined") {
    return normalizeSharedImpresorasConfig(DEFAULT_SHARED_IMPRESORAS_CONFIG);
  }

  try {
    const raw = localStorage.getItem(buildTenantStorageKey(IMPRESORAS_SHARED_STORAGE_KEY));
    if (raw) return normalizeSharedImpresorasConfig(JSON.parse(raw));
  } catch {
    // noop
  }

  if (allowLegacyTenantFallback()) {
    const legacy = readLegacyImpresorasConfigCache();
    if (legacy) return normalizeSharedImpresorasConfig(legacy);
  }

  return normalizeSharedImpresorasConfig(DEFAULT_SHARED_IMPRESORAS_CONFIG);
}

export function readImpresorasConfigCache() {
  return mergeImpresorasConfig(
    readLocalImpresorasConfigCache(),
    readSharedImpresorasConfigCache(),
  );
}

async function hydrateImpresorasDoc(ref) {
  if (allowLegacyTenantFallback()) {
    const legacySnap = await getDoc(getLegacyConfigDocRef("impresoras"));
    if (legacySnap.exists()) {
      const normalizedLegacy = normalizeSharedImpresorasConfig(legacySnap.data());
      await setDoc(
        ref,
        { ...withTenantData(normalizedLegacy), updatedAt: serverTimestamp() },
        { merge: true },
      );
      return normalizedLegacy;
    }
  }

  const defaults = normalizeSharedImpresorasConfig(DEFAULT_SHARED_IMPRESORAS_CONFIG);
  await setDoc(
    ref,
    { ...withTenantData(defaults), updatedAt: serverTimestamp() },
    { merge: true },
  );
  return defaults;
}

export function getModoImpresionLabel(configRaw = {}) {
  const config = normalizeImpresorasConfig(configRaw);
  return config.modoImpresion === "silenciosa"
    ? "Impresion silenciosa"
    : "Dialogo del navegador";
}

export function getDocumentoInicioServicioLabel(configRaw = {}) {
  const config = normalizeImpresorasConfig(configRaw);

  if (config.documentoAlIniciarServicio === "hoja") return "Hoja de servicio";
  if (config.documentoAlIniciarServicio === "ambos") return "Ticket y hoja de servicio";
  return "Ticket de servicio";
}

export function getTamanoHojaServicioLabel(configRaw = {}) {
  const config = normalizeImpresorasConfig(configRaw);
  return config.tamanoHojaServicio === "carta" ? "Carta" : "A4";
}

export function getSalidaTicketMovilLabel(configRaw = {}) {
  const config = normalizeImpresorasConfig(configRaw);
  return config.salidaTicketMovil === "imagen"
    ? "Guardar o compartir como imagen"
    : "Dialogo del navegador";
}

export async function obtenerImpresorasConfig() {
  try {
    const impresorasRef = getTenantConfigDocRef("impresoras");
    const snap = await getDoc(impresorasRef);

    if (!snap.exists()) {
      const hydrated = await hydrateImpresorasDoc(impresorasRef);
      saveSharedImpresorasConfigCache(hydrated);
      return mergeImpresorasConfig(readLocalImpresorasConfigCache(), hydrated);
    }

    const normalizedShared = normalizeSharedImpresorasConfig(snap.data());
    saveSharedImpresorasConfigCache(normalizedShared);
    return mergeImpresorasConfig(readLocalImpresorasConfigCache(), normalizedShared);
  } catch (error) {
    console.warn(
      "[impresoras-config] No se pudo leer configuracion remota:",
      error?.code || error,
    );
    return readImpresorasConfigCache();
  }
}

export function escucharImpresorasConfig(callback, onError) {
  const impresorasRef = getTenantConfigDocRef("impresoras");
  return onSnapshot(
    impresorasRef,
    (snap) => {
      if (!snap.exists()) {
        const sharedDefaults = normalizeSharedImpresorasConfig(DEFAULT_SHARED_IMPRESORAS_CONFIG);
        saveSharedImpresorasConfigCache(sharedDefaults);
        callback(mergeImpresorasConfig(readLocalImpresorasConfigCache(), sharedDefaults));
        hydrateImpresorasDoc(impresorasRef)
          .then((normalized) => {
            saveSharedImpresorasConfigCache(normalized);
            callback(mergeImpresorasConfig(readLocalImpresorasConfigCache(), normalized));
          })
          .catch(() => {});
        return;
      }

      const normalizedShared = normalizeSharedImpresorasConfig(snap.data());
      saveSharedImpresorasConfigCache(normalizedShared);
      callback(mergeImpresorasConfig(readLocalImpresorasConfigCache(), normalizedShared));
    },
    (error) => {
      console.warn(
        "[impresoras-config] Snapshot remoto no disponible:",
        error?.code || error,
      );
      callback(readImpresorasConfigCache());
      if (typeof onError === "function") onError(error);
    },
  );
}

export async function actualizarImpresorasConfig(config) {
  const impresorasRef = getTenantConfigDocRef("impresoras");
  const normalizedLocal = normalizeLocalImpresorasConfig(config);
  const normalizedShared = normalizeSharedImpresorasConfig(config);

  saveLocalImpresorasConfigCache(normalizedLocal);
  saveSharedImpresorasConfigCache(normalizedShared);
  await setDoc(
    impresorasRef,
    {
      ...withTenantData(normalizedShared),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return mergeImpresorasConfig(normalizedLocal, normalizedShared);
}
