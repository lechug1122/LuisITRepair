import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../initializer/firebase";

const empresaRef = doc(db, "configuracion", "empresa");
const EMPRESA_STORAGE_KEY = "empresa_config_cache_v1";

export const DEFAULT_EMPRESA_CONFIG = {
  nombre: import.meta.env.VITE_NEGOCIO_NOMBRE || "LuisITRepair",
  subtitulo: import.meta.env.VITE_NEGOCIO_SUBTITULO || "Servicios tecnicos y punto de venta",
};

// Limpia campos de texto antes de persistirlos o mostrarlos.
function toText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

// Mantiene estable la estructura de configuracion de empresa.
export function normalizeEmpresaConfig(raw = {}) {
  return {
    nombre: toText(raw?.nombre, DEFAULT_EMPRESA_CONFIG.nombre) || DEFAULT_EMPRESA_CONFIG.nombre,
    subtitulo: toText(raw?.subtitulo, DEFAULT_EMPRESA_CONFIG.subtitulo) || DEFAULT_EMPRESA_CONFIG.subtitulo,
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
    localStorage.setItem(EMPRESA_STORAGE_KEY, JSON.stringify(normalized));
    syncEmpresaDocumentTitle(normalized);
  } catch {
    // noop
  }
}

// Recupera la configuracion cacheada para render inicial u offline.
export function readEmpresaConfigCache() {
  if (typeof window === "undefined") {
    return { ...DEFAULT_EMPRESA_CONFIG };
  }

  try {
    const raw = localStorage.getItem(EMPRESA_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EMPRESA_CONFIG };
    return normalizeEmpresaConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_EMPRESA_CONFIG };
  }
}

// Obtiene la configuracion remota y crea defaults cuando el documento no existe.
export const obtenerEmpresa = async () => {
  try {
    const snap = await getDoc(empresaRef);

    if (!snap.exists()) {
      const defaults = { ...DEFAULT_EMPRESA_CONFIG };
      saveEmpresaConfigCache(defaults);
      await setDoc(
        empresaRef,
        {
          ...defaults,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return defaults;
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
  return onSnapshot(
    empresaRef,
    (snap) => {
      if (!snap.exists()) {
        const defaults = readEmpresaConfigCache();
        callback(defaults);
        setDoc(
          empresaRef,
          {
            ...defaults,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ).catch(() => {});
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
  const normalized = normalizeEmpresaConfig({
    ...empresaActual,
    nombre,
  });

  saveEmpresaConfigCache(normalized);
  await setDoc(
    empresaRef,
    {
      ...normalized,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return normalized;
};
