export const DEFAULT_CONFIG = {
  theme: 'light',
  language: 'es',
  dateFormat: 'DD/MM/YYYY',
  numberFormat: 'comma',
};

export function getConfig() {
  try {
    const s = localStorage.getItem('appConfig');
    return s ? JSON.parse(s) : DEFAULT_CONFIG;
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

export function setConfig(cfg) {
  const merged = { ...getConfig(), ...cfg };
  localStorage.setItem('appConfig', JSON.stringify(merged));
  return merged;
}

export default {
  DEFAULT_CONFIG,
  getConfig,
  setConfig,
};
