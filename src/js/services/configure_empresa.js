import { getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getTiposNegocioPreset, normalizeTiposNegocio } from "./tipos_negocio";
import {
  allowLegacyTenantFallback,
  buildTenantStorageKey,
  getLegacyConfigDocRef,
  getTenantConfigDocRef,
  withTenantData,
} from "./tenant";
const EMPRESA_STORAGE_KEY = "empresa_config_cache_v1";

export const DEFAULT_EMPRESA_CONFIG = {
  nombre: import.meta.env.VITE_NEGOCIO_NOMBRE || "LuisITRepair",
  subtitulo: import.meta.env.VITE_NEGOCIO_SUBTITULO || "Servicios tecnicos y punto de venta",
  telefono: import.meta.env.VITE_NEGOCIO_TELEFONO || "",
  correoTickets: import.meta.env.VITE_NEGOCIO_CORREO_TICKETS || "",
  correoNotas: import.meta.env.VITE_NEGOCIO_CORREO_NOTAS || "",
  tipoNegocioId: "soporte-computo",
  tiposNegocio: getTiposNegocioPreset(),
  restaurante: {
    pisos: [{ id: "piso-1", nombre: "Piso 1", cantidadMesas: 12 }],
  },
};

// Limpia campos de texto antes de persistirlos o mostrarlos.
function toText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function normalizeRestauranteConfig(raw = {}) {
  const source = Array.isArray(raw?.pisos) && raw.pisos.length
    ? raw.pisos
    : DEFAULT_EMPRESA_CONFIG.restaurante.pisos;
  return {
    pisos: source.slice(0, 20).map((piso, index) => ({
      id: toText(piso?.id, `piso-${index + 1}`) || `piso-${index + 1}`,
      nombre: toText(piso?.nombre, `Piso ${index + 1}`) || `Piso ${index + 1}`,
      cantidadMesas: Math.min(200, Math.max(1, Math.trunc(Number(piso?.cantidadMesas) || 1))),
    })),
  };
}

// Mantiene estable la estructura de configuracion de empresa.
export function normalizeEmpresaConfig(raw = {}) {
  const tiposNegocio = normalizeTiposNegocio(raw?.tiposNegocio);
  const tipoNegocioId =
    String(raw?.tipoNegocioId || "").trim() &&
    tiposNegocio.some((item) => item.id === String(raw?.tipoNegocioId || "").trim())
      ? String(raw?.tipoNegocioId || "").trim()
      : tiposNegocio[0]?.id || DEFAULT_EMPRESA_CONFIG.tipoNegocioId;

  return {
    nombre: toText(raw?.nombre, DEFAULT_EMPRESA_CONFIG.nombre) || DEFAULT_EMPRESA_CONFIG.nombre,
    subtitulo: toText(raw?.subtitulo, DEFAULT_EMPRESA_CONFIG.subtitulo) || DEFAULT_EMPRESA_CONFIG.subtitulo,
    telefono: toText(raw?.telefono, DEFAULT_EMPRESA_CONFIG.telefono),
    correoTickets: toText(raw?.correoTickets, DEFAULT_EMPRESA_CONFIG.correoTickets).toLowerCase(),
    correoNotas: toText(raw?.correoNotas, DEFAULT_EMPRESA_CONFIG.correoNotas).toLowerCase(),
    tipoNegocioId,
    tiposNegocio,
    restaurante: normalizeRestauranteConfig(raw?.restaurante),
  };
}

// Sincroniza el nombre del negocio con el titulo del navegador.
export function syncEmpresaDocumentTitle(config) {
  if (typeof document === "undefined") return;

  const normalized = normalizeEmpresaConfig(config);
  document.title = normalized.nombre || DEFAULT_EMPRESA_CONFIG.nombre;
}

// Guarda la configuracion de empresa en cache local y actualiza el titulo.
function saveEmpresaConfigCache(config) {
  if (typeof window === "undefined") return;

  try {
    const normalized = normalizeEmpresaConfig(config);
    localStorage.setItem(buildTenantStorageKey(EMPRESA_STORAGE_KEY), JSON.stringify(normalized));
    syncEmpresaDocumentTitle(normalized);
  } catch {
    // noop
  }
}

// Recupera la configuracion cacheada para render inicial u offline.
export function readEmpresaConfigCache() {
  if (typeof window === "undefined") {
    return normalizeEmpresaConfig(DEFAULT_EMPRESA_CONFIG);
  }

  try {
    const raw = localStorage.getItem(buildTenantStorageKey(EMPRESA_STORAGE_KEY));
    if (!raw) return normalizeEmpresaConfig(DEFAULT_EMPRESA_CONFIG);
    return normalizeEmpresaConfig(JSON.parse(raw));
  } catch {
    return normalizeEmpresaConfig(DEFAULT_EMPRESA_CONFIG);
  }
}

async function hydrateEmpresaDoc(empresaRef) {
  if (allowLegacyTenantFallback()) {
    const legacySnap = await getDoc(getLegacyConfigDocRef("empresa"));
    if (legacySnap.exists()) {
      const normalizedLegacy = normalizeEmpresaConfig(legacySnap.data());
      await setDoc(
        empresaRef,
        {
          ...withTenantData(normalizedLegacy),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return normalizedLegacy;
    }
  }

  const defaults = normalizeEmpresaConfig(DEFAULT_EMPRESA_CONFIG);
  await setDoc(
    empresaRef,
    {
      ...withTenantData(defaults),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return defaults;
}

// Obtiene la configuracion remota y crea defaults cuando el documento no existe.
export const obtenerEmpresa = async () => {
  try {
    const empresaRef = getTenantConfigDocRef("empresa");
    const snap = await getDoc(empresaRef);

    if (!snap.exists()) {
      const hydrated = await hydrateEmpresaDoc(empresaRef);
      saveEmpresaConfigCache(hydrated);
      return hydrated;
    }

    const normalized = normalizeEmpresaConfig(snap.data());
    saveEmpresaConfigCache(normalized);
    return normalized;
  } catch (error) {
    console.warn("[empresa] No se pudo leer configuracion remota:", error?.code || error);
    return readEmpresaConfigCache();
  }
};

// Suscribe la configuracion de empresa para mantener la UI actualizada.
export const escucharEmpresa = (callback, onError) => {
  const empresaRef = getTenantConfigDocRef("empresa");
  return onSnapshot(
    empresaRef,
    (snap) => {
      if (!snap.exists()) {
        const defaults = readEmpresaConfigCache();
        callback(defaults);
        hydrateEmpresaDoc(empresaRef)
          .then((normalized) => {
            saveEmpresaConfigCache(normalized);
            callback(normalized);
          })
          .catch(() => {});
        return;
      }

      const normalized = normalizeEmpresaConfig(snap.data());
      saveEmpresaConfigCache(normalized);
      callback(normalized);
    },
    (error) => {
      console.warn("[empresa] Snapshot remoto no disponible:", error?.code || error);
      callback(readEmpresaConfigCache());
      if (typeof onError === "function") onError(error);
    },
  );
};

// Actualiza solo el nombre del negocio preservando el resto de la configuracion.
export const actualizarNombreEmpresa = async (nombre) => {
  const empresaActual = await obtenerEmpresa();
  const empresaRef = getTenantConfigDocRef("empresa");
  const normalized = normalizeEmpresaConfig({
    ...empresaActual,
    nombre,
  });

  saveEmpresaConfigCache(normalized);
  await setDoc(
    empresaRef,
    {
      ...withTenantData(normalized),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return normalized;
};

export const actualizarEmpresaConfig = async (config) => {
  const empresaActual = await obtenerEmpresa();
  const empresaRef = getTenantConfigDocRef("empresa");
  const normalized = normalizeEmpresaConfig({
    ...empresaActual,
    ...config,
  });

  saveEmpresaConfigCache(normalized);
  await setDoc(
    empresaRef,
    {
      ...withTenantData(normalized),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return normalized;
};
