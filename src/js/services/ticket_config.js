import { readEmpresaConfigCache } from "./configure_empresa";
import { applyTicketPlan, getTicketPlan, isLegacyTicketBusiness } from "./ticket_plan.js";
import { canUseTicketEditor } from "./plan_features.js";

const TICKET_CONFIG_STORAGE_KEY = "pos_ticket_config_v1";

export function createDefaultTicketConfig() {
  const empresa = readEmpresaConfigCache();

  return {
    showLogo: true,
    showBusinessData: true,
    boldAllText: true,
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
    boldAllText: toBool(raw.boldAllText, defaults.boldAllText),
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

export function saveTicketConfigStorage(config, now = Date.now(), legacy = isLegacyTicketBusiness()) {
  // Unica puerta de escritura del diseño. Aunque alguien habilitara los
  // controles por su cuenta, el guardado sigue respetando plan, antiguedad del
  // negocio y fecha. La comprobacion se hace al guardar, asi que el corte del
  // 21 de septiembre surte efecto sin recargar la pagina.
  const permitido = canUseTicketEditor({
    premiumState: getTicketPlan(),
    negocioLegacy: legacy,
    ahoraMs: now,
  });
  if (!permitido) return false;
  try {
    const normalized = buildTicketConfig(config);
    localStorage.setItem(TICKET_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function resolveTicketConfig(
  raw,
  premiumState,
  empresa = readEmpresaConfigCache(),
  now = Date.now(),
  legacy = isLegacyTicketBusiness(),
) {
  const config = applyTicketPlan(
    buildTicketConfig(raw),
    createDefaultTicketConfig(),
    premiumState,
    now,
    legacy,
  );
  if (empresa.tipoNegocioId === "tienda-abarrotes") config.showStatusSection = false;
  return config;
}

export function readTicketPrintConfig(raw, now = Date.now(), legacy = isLegacyTicketBusiness()) {
  const plan = getTicketPlan();
  if (plan === "loading") {
    throw new Error("Espera a que termine de cargar tu plan para imprimir el ticket.");
  }
  // Imprimir nunca depende del plan: lo unico que cambia es el diseño que se
  // aplica y la linea de publicidad.
  return resolveTicketConfig(
    raw || readTicketConfigStorage(),
    plan,
    readEmpresaConfigCache(),
    now,
    legacy,
  );
}

export function splitTicketLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
