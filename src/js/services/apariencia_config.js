import { auth } from "../../initializer/firebase";

const APARIENCIA_CONFIG_STORAGE_KEY = "app_apariencia_config_v2";
const LEGACY_STORAGE_KEYS = ["app_apariencia_config_v2", "app_apariencia_config"];
export const APARIENCIA_EVENT = "app:appearance-changed";

export const DEFAULT_APARIENCIA_CONFIG = {
  themeMode: "claro",
  accent: "azul",
  density: "normal",
  radius: "suave",
  animations: true,
  contrast: "normal",
  fontScale: "normal",
  ticketFont: "mono",
  pdfFont: "helvetica",
  language: "es-MX",
  dateFormat: "dd/mm/aaaa",
};

const ACCENT_COLORS = {
  azul: "#2563eb",
  verde: "#16a34a",
  turquesa: "#0d9488",
  naranja: "#ea580c",
};

const ACCENT_TONES = {
  azul: {
    strong: "#1d4ed8",
    deep: "#1e3a8a",
    navbarStart: "#1d4ed8",
    navbarEnd: "#1e3a8a",
  },
  verde: {
    strong: "#15803d",
    deep: "#14532d",
    navbarStart: "#15803d",
    navbarEnd: "#14532d",
  },
  turquesa: {
    strong: "#0f766e",
    deep: "#134e4a",
    navbarStart: "#0f766e",
    navbarEnd: "#134e4a",
  },
  naranja: {
    strong: "#c2410c",
    deep: "#7c2d12",
    navbarStart: "#c2410c",
    navbarEnd: "#7c2d12",
  },
};

const RADIUS_VALUES = {
  cuadrado: 8,
  suave: 12,
  redondeado: 16,
};

const FONT_SCALE_VALUES = {
  pequeno: 0.95,
  normal: 1,
  grande: 1.06,
};

const TICKET_FONT_VALUES = {
  mono: '"Courier New", "Liberation Mono", monospace',
  ui: '"Segoe UI", Arial, sans-serif',
  compacta: "Arial, Helvetica, sans-serif",
};

const PDF_FONT_VALUES = {
  helvetica: "helvetica",
  courier: "courier",
  times: "times",
};

function resolveUserId(userId = null) {
  if (userId) return userId;
  try {
    return auth?.currentUser?.uid || null;
  } catch {
    return null;
  }
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "");
  if (normalized.length !== 6) return "37,99,235";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "37,99,235";
  return `${r}, ${g}, ${b}`;
}

function buildStorageKey(userId = null) {
  const uid = resolveUserId(userId);
  return uid
    ? `${APARIENCIA_CONFIG_STORAGE_KEY}_${uid}`
    : `${APARIENCIA_CONFIG_STORAGE_KEY}_anon`;
}

function readRawConfig(userId = null) {
  try {
    const direct = localStorage.getItem(buildStorageKey(userId));
    if (direct) return direct;

    // Si no existe por usuario, intenta clave anonima para no perder ajustes.
    if (resolveUserId(userId)) {
      const anon = localStorage.getItem(buildStorageKey(null));
      if (anon) return anon;
    }

    for (const key of LEGACY_STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw) return raw;
    }

    return null;
  } catch {
    return null;
  }
}

function toText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value;
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

export function buildAparienciaConfig(raw = {}) {
  return {
    themeMode: toText(raw.themeMode, DEFAULT_APARIENCIA_CONFIG.themeMode),
    accent: toText(raw.accent, DEFAULT_APARIENCIA_CONFIG.accent),
    density: toText(raw.density, DEFAULT_APARIENCIA_CONFIG.density),
    radius: toText(raw.radius, DEFAULT_APARIENCIA_CONFIG.radius),
    animations: toBool(raw.animations, DEFAULT_APARIENCIA_CONFIG.animations),
    contrast: toText(raw.contrast, DEFAULT_APARIENCIA_CONFIG.contrast),
    fontScale: toText(raw.fontScale, DEFAULT_APARIENCIA_CONFIG.fontScale),
    ticketFont: toText(raw.ticketFont, DEFAULT_APARIENCIA_CONFIG.ticketFont),
    pdfFont: toText(raw.pdfFont, DEFAULT_APARIENCIA_CONFIG.pdfFont),
    language: toText(raw.language, DEFAULT_APARIENCIA_CONFIG.language),
    dateFormat: toText(raw.dateFormat, DEFAULT_APARIENCIA_CONFIG.dateFormat),
  };
}

export function readAparienciaConfigStorage(userId = null) {
  try {
    const raw = readRawConfig(userId);
    if (!raw) return { ...DEFAULT_APARIENCIA_CONFIG };
    return buildAparienciaConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_APARIENCIA_CONFIG };
  }
}

export function saveAparienciaConfigStorage(config, userId = null) {
  try {
    const normalized = buildAparienciaConfig(config);
    const payload = JSON.stringify(normalized);
    localStorage.setItem(buildStorageKey(userId), payload);
    // Espejo para carga inicial antes de que Firebase resuelva auth.
    localStorage.setItem(buildStorageKey(null), payload);
    return true;
  } catch {
    return false;
  }
}

export function applyAparienciaConfig(config) {
  if (typeof document === "undefined") return;

  const normalized = buildAparienciaConfig(config);
  const accent = ACCENT_COLORS[normalized.accent] || ACCENT_COLORS.azul;
  const tones = ACCENT_TONES[normalized.accent] || ACCENT_TONES.azul;
  const radius = RADIUS_VALUES[normalized.radius] || RADIUS_VALUES.suave;
  const fontScale = FONT_SCALE_VALUES[normalized.fontScale] || FONT_SCALE_VALUES.normal;
  const ticketFont = TICKET_FONT_VALUES[normalized.ticketFont] || TICKET_FONT_VALUES.mono;
  const accentRgb = hexToRgb(accent);

  document.documentElement.style.setProperty("--app-accent", accent);
  document.documentElement.style.setProperty("--app-accent-strong", tones.strong);
  document.documentElement.style.setProperty("--app-accent-deep", tones.deep);
  document.documentElement.style.setProperty("--app-accent-rgb", accentRgb);
  document.documentElement.style.setProperty("--app-accent-soft", `rgba(${accentRgb}, 0.18)`);
  document.documentElement.style.setProperty("--app-accent-soft-2", `rgba(${accentRgb}, 0.28)`);
  document.documentElement.style.setProperty("--app-navbar-start", tones.navbarStart);
  document.documentElement.style.setProperty("--app-navbar-end", tones.navbarEnd);
  document.documentElement.style.setProperty("--bs-primary", accent);
  document.documentElement.style.setProperty("--bs-primary-rgb", accentRgb);
  document.documentElement.style.setProperty("--bs-link-color", accent);
  document.documentElement.style.setProperty("--bs-link-hover-color", tones.strong);
  document.documentElement.style.setProperty("--app-radius", `${radius}px`);
  document.documentElement.style.setProperty("--app-font-scale", String(fontScale));
  document.documentElement.style.setProperty("--app-ticket-font", ticketFont);
  document.documentElement.lang = normalized.language.startsWith("es") ? "es" : "en";

  document.body.classList.toggle("ui-density-compact", normalized.density === "compacta");
  document.body.classList.toggle("ui-high-contrast", normalized.contrast === "alto");
  document.body.classList.toggle("ui-no-motion", !normalized.animations);
  document.body.classList.toggle("ui-theme-dark", normalized.themeMode === "oscuro");
  document.body.classList.toggle("ui-theme-light", normalized.themeMode !== "oscuro");

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(APARIENCIA_EVENT, { detail: normalized }));
  }
}

export function getTicketFontFamily(config = null) {
  const normalized = buildAparienciaConfig(config || readAparienciaConfigStorage());
  return TICKET_FONT_VALUES[normalized.ticketFont] || TICKET_FONT_VALUES.mono;
}

export function getPdfFontFamily(config = null) {
  const normalized = buildAparienciaConfig(config || readAparienciaConfigStorage());
  return PDF_FONT_VALUES[normalized.pdfFont] || PDF_FONT_VALUES.helvetica;
}

export function applyAparienciaFromStorage(userId = null) {
  applyAparienciaConfig(readAparienciaConfigStorage(userId));
}
