const KEY = "cajalibre_pos_features_v2";
export const DEFAULT_POS_FEATURES = { promocionesDescuentos: true, fiado: true };
export function readPOSFeatureConfig() { try { return { ...DEFAULT_POS_FEATURES, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULT_POS_FEATURES; } }
export function savePOSFeatureConfig(value) { try { localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_POS_FEATURES, ...value })); window.dispatchEvent(new CustomEvent("pos-features-change", { detail: value })); return true; } catch { return false; } }
