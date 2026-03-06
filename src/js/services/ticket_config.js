const TICKET_CONFIG_STORAGE_KEY = "pos_ticket_config_v1";

export const DEFAULT_TICKET_CONFIG = {
  showLogo: true,
  showBusinessData: true,
  businessName: "LuisITRepair",
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
  return {
    showLogo: toBool(raw.showLogo, DEFAULT_TICKET_CONFIG.showLogo),
    showBusinessData: toBool(
      raw.showBusinessData,
      DEFAULT_TICKET_CONFIG.showBusinessData,
    ),
    businessName: toText(raw.businessName, DEFAULT_TICKET_CONFIG.businessName),
    businessAddress: toText(
      raw.businessAddress,
      DEFAULT_TICKET_CONFIG.businessAddress,
    ),
    businessPhone: toText(raw.businessPhone, DEFAULT_TICKET_CONFIG.businessPhone),
    showUnitPrice: toBool(raw.showUnitPrice, DEFAULT_TICKET_CONFIG.showUnitPrice),
    fullDescription: toBool(
      raw.fullDescription,
      DEFAULT_TICKET_CONFIG.fullDescription,
    ),
    showProductMeta: toBool(
      raw.showProductMeta,
      DEFAULT_TICKET_CONFIG.showProductMeta,
    ),
    showClientSection: toBool(
      raw.showClientSection,
      DEFAULT_TICKET_CONFIG.showClientSection,
    ),
    showClientName: toBool(
      raw.showClientName,
      DEFAULT_TICKET_CONFIG.showClientName,
    ),
    showClientPhone: toBool(
      raw.showClientPhone,
      DEFAULT_TICKET_CONFIG.showClientPhone,
    ),
    showPaymentSection: toBool(
      raw.showPaymentSection,
      DEFAULT_TICKET_CONFIG.showPaymentSection,
    ),
    showStatusSection: toBool(
      raw.showStatusSection,
      DEFAULT_TICKET_CONFIG.showStatusSection,
    ),
    showLegend: toBool(raw.showLegend, DEFAULT_TICKET_CONFIG.showLegend),
    legendText: toText(raw.legendText, DEFAULT_TICKET_CONFIG.legendText),
    footerText: toText(raw.footerText, DEFAULT_TICKET_CONFIG.footerText),
    extraTopLines: toText(raw.extraTopLines, DEFAULT_TICKET_CONFIG.extraTopLines),
    extraBottomLines: toText(
      raw.extraBottomLines,
      DEFAULT_TICKET_CONFIG.extraBottomLines,
    ),
  };
}

export function readTicketConfigStorage() {
  try {
    const raw = localStorage.getItem(TICKET_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TICKET_CONFIG };
    const parsed = JSON.parse(raw);
    return buildTicketConfig(parsed);
  } catch {
    return { ...DEFAULT_TICKET_CONFIG };
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

