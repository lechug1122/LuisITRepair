import { readEmpresaConfigCache } from "./configure_empresa";

const FACTURACION_CONFIG_STORAGE_KEY = "pos_facturacion_config_v1";

export function createDefaultFacturacionConfig() {
  const empresa = readEmpresaConfigCache();

  return {
    enabled: false,
    emisionMode: "ticket_y_factura",
    serie: "A",
    folioActual: 1,
    autoIncrement: true,
    razonSocial: empresa.nombre,
    rfcEmisor: "",
    rfcReceptorPublicoGeneral: "XAXX010101000",
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
}

export const DEFAULT_FACTURACION_CONFIG = createDefaultFacturacionConfig();

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
  const defaults = createDefaultFacturacionConfig();

  return {
    enabled: toBool(raw.enabled, defaults.enabled),
    emisionMode: toText(raw.emisionMode, defaults.emisionMode),
    serie: toText(raw.serie, defaults.serie).slice(0, 8),
    folioActual: toInt(raw.folioActual, defaults.folioActual, 1),
    autoIncrement: toBool(raw.autoIncrement, defaults.autoIncrement),
    razonSocial: toText(raw.razonSocial, defaults.razonSocial),
    rfcEmisor: normalizeRFC(toText(raw.rfcEmisor, defaults.rfcEmisor)),
    rfcReceptorPublicoGeneral: normalizeRFC(
      toText(raw.rfcReceptorPublicoGeneral, defaults.rfcReceptorPublicoGeneral),
    ),
    regimenFiscal: toText(raw.regimenFiscal, defaults.regimenFiscal),
    codigoPostalEmisor: toText(raw.codigoPostalEmisor, defaults.codigoPostalEmisor)
      .replace(/\D/g, "")
      .slice(0, 5),
    usoCFDI: toText(raw.usoCFDI, defaults.usoCFDI),
    metodoPago: toText(raw.metodoPago, defaults.metodoPago),
    formaPago: toText(raw.formaPago, defaults.formaPago),
    requiereRFCCliente: toBool(raw.requiereRFCCliente, defaults.requiereRFCCliente),
    requiereCorreoCliente: toBool(raw.requiereCorreoCliente, defaults.requiereCorreoCliente),
    timbradoPruebas: toBool(raw.timbradoPruebas, defaults.timbradoPruebas),
    terminosFactura: toText(raw.terminosFactura, defaults.terminosFactura),
  };
}

export function readFacturacionConfigStorage() {
  try {
    const raw = localStorage.getItem(FACTURACION_CONFIG_STORAGE_KEY);
    if (!raw) return createDefaultFacturacionConfig();
    return buildFacturacionConfig(JSON.parse(raw));
  } catch {
    return createDefaultFacturacionConfig();
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
