const FACTURACION_CONFIG_STORAGE_KEY = "pos_facturacion_config_v1";

export const DEFAULT_FACTURACION_CONFIG = {
  enabled: false,
  emisionMode: "ticket_y_factura",
  serie: "A",
  folioActual: 1,
  autoIncrement: true,
  razonSocial: "LuisITRepair",
  rfcEmisor: "",
  regimenFiscal: "626",
  codigoPostalEmisor: "",
  usoCFDI: "G03",
  metodoPago: "PUE",
  formaPago: "01",
  requiereRFCCliente: true,
  requiereCorreoCliente: false,
  timbradoPruebas: true,
  terminosFactura: "",
};

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function toText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value;
}

function toInt(value, fallback = 1, min = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const normalized = Math.floor(n);
  return normalized < min ? min : normalized;
}

function normalizeRFC(value = "") {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]/g, "")
    .slice(0, 13);
}

export function buildFacturacionConfig(raw = {}) {
  return {
    enabled: toBool(raw.enabled, DEFAULT_FACTURACION_CONFIG.enabled),
    emisionMode: toText(raw.emisionMode, DEFAULT_FACTURACION_CONFIG.emisionMode),
    serie: toText(raw.serie, DEFAULT_FACTURACION_CONFIG.serie).slice(0, 8),
    folioActual: toInt(raw.folioActual, DEFAULT_FACTURACION_CONFIG.folioActual, 1),
    autoIncrement: toBool(
      raw.autoIncrement,
      DEFAULT_FACTURACION_CONFIG.autoIncrement,
    ),
    razonSocial: toText(raw.razonSocial, DEFAULT_FACTURACION_CONFIG.razonSocial),
    rfcEmisor: normalizeRFC(toText(raw.rfcEmisor, DEFAULT_FACTURACION_CONFIG.rfcEmisor)),
    regimenFiscal: toText(
      raw.regimenFiscal,
      DEFAULT_FACTURACION_CONFIG.regimenFiscal,
    ),
    codigoPostalEmisor: toText(
      raw.codigoPostalEmisor,
      DEFAULT_FACTURACION_CONFIG.codigoPostalEmisor,
    )
      .replace(/\D/g, "")
      .slice(0, 5),
    usoCFDI: toText(raw.usoCFDI, DEFAULT_FACTURACION_CONFIG.usoCFDI),
    metodoPago: toText(raw.metodoPago, DEFAULT_FACTURACION_CONFIG.metodoPago),
    formaPago: toText(raw.formaPago, DEFAULT_FACTURACION_CONFIG.formaPago),
    requiereRFCCliente: toBool(
      raw.requiereRFCCliente,
      DEFAULT_FACTURACION_CONFIG.requiereRFCCliente,
    ),
    requiereCorreoCliente: toBool(
      raw.requiereCorreoCliente,
      DEFAULT_FACTURACION_CONFIG.requiereCorreoCliente,
    ),
    timbradoPruebas: toBool(
      raw.timbradoPruebas,
      DEFAULT_FACTURACION_CONFIG.timbradoPruebas,
    ),
    terminosFactura: toText(
      raw.terminosFactura,
      DEFAULT_FACTURACION_CONFIG.terminosFactura,
    ),
  };
}

export function readFacturacionConfigStorage() {
  try {
    const raw = localStorage.getItem(FACTURACION_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FACTURACION_CONFIG };
    return buildFacturacionConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_FACTURACION_CONFIG };
  }
}

export function saveFacturacionConfigStorage(config) {
  try {
    const normalized = buildFacturacionConfig(config);
    localStorage.setItem(FACTURACION_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

