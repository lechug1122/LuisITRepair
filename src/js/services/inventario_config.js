const INVENTARIO_CONFIG_STORAGE_KEY = "inventario_catalogo_config_v1";

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

export function createDefaultInventarioConfig() {
  return {
    autocompletarDescripcionCodigo: true,
    mostrarAvisoCatalogo: true,
    camposProductoCompletos: true,
  };
}

export function buildInventarioConfig(raw = {}) {
  const defaults = createDefaultInventarioConfig();

  return {
    autocompletarDescripcionCodigo: toBool(
      raw.autocompletarDescripcionCodigo,
      defaults.autocompletarDescripcionCodigo,
    ),
    mostrarAvisoCatalogo: toBool(raw.mostrarAvisoCatalogo, defaults.mostrarAvisoCatalogo),
    camposProductoCompletos: toBool(
      raw.camposProductoCompletos,
      defaults.camposProductoCompletos,
    ),
  };
}

export function readInventarioConfigStorage() {
  try {
    const raw = localStorage.getItem(INVENTARIO_CONFIG_STORAGE_KEY);
    if (!raw) return createDefaultInventarioConfig();
    return buildInventarioConfig(JSON.parse(raw));
  } catch {
    return createDefaultInventarioConfig();
  }
}

export function saveInventarioConfigStorage(config) {
  try {
    const normalized = buildInventarioConfig(config);
    localStorage.setItem(INVENTARIO_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}
