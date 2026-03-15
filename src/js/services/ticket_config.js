import { readEmpresaConfigCache } from "./configure_empresa";

const TICKET_CONFIG_STORAGE_KEY = "pos_ticket_config_v1";

export function createDefaultTicketConfig() {
  const empresa = readEmpresaConfigCache();

  return {
    showLogo: true,
    showBusinessData: true,
    businessName: empresa.nombre,
    businessAddress: "",
    businessPhone: "",
    showUnitPrice: true,
    fullDescription: true,
    showProductMeta: true,
    showClientSection: true,
    showClientName: true,
    showClientPhone: true,
    showPaymentSection: true,
    showStatusSection: true,
    showLegend: true,
    legendText: "Se aceptan cambios con ticket en producto en buen estado.",
    footerText: "Gracias por tu preferencia.",
    extraTopLines: "",
    extraBottomLines: "",
  };
}

export const DEFAULT_TICKET_CONFIG = createDefaultTicketConfig();

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

export function buildTicketConfig(raw = {}) {
  const defaults = createDefaultTicketConfig();

  return {
    showLogo: toBool(raw.showLogo, defaults.showLogo),
    showBusinessData: toBool(raw.showBusinessData, defaults.showBusinessData),
    businessName: toText(raw.businessName, defaults.businessName),
    businessAddress: toText(raw.businessAddress, defaults.businessAddress),
    businessPhone: toText(raw.businessPhone, defaults.businessPhone),
    showUnitPrice: toBool(raw.showUnitPrice, defaults.showUnitPrice),
    fullDescription: toBool(raw.fullDescription, defaults.fullDescription),
    showProductMeta: toBool(raw.showProductMeta, defaults.showProductMeta),
    showClientSection: toBool(raw.showClientSection, defaults.showClientSection),
    showClientName: toBool(raw.showClientName, defaults.showClientName),
    showClientPhone: toBool(raw.showClientPhone, defaults.showClientPhone),
    showPaymentSection: toBool(raw.showPaymentSection, defaults.showPaymentSection),
    showStatusSection: toBool(raw.showStatusSection, defaults.showStatusSection),
    showLegend: toBool(raw.showLegend, defaults.showLegend),
    legendText: toText(raw.legendText, defaults.legendText),
    footerText: toText(raw.footerText, defaults.footerText),
    extraTopLines: toText(raw.extraTopLines, defaults.extraTopLines),
    extraBottomLines: toText(raw.extraBottomLines, defaults.extraBottomLines),
  };
}

export function readTicketConfigStorage() {
  try {
    const raw = localStorage.getItem(TICKET_CONFIG_STORAGE_KEY);
    if (!raw) return createDefaultTicketConfig();
    const parsed = JSON.parse(raw);
    return buildTicketConfig(parsed);
  } catch {
    return createDefaultTicketConfig();
  }
}

export function saveTicketConfigStorage(config) {
  try {
    const normalized = buildTicketConfig(config);
    localStorage.setItem(TICKET_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function splitTicketLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
