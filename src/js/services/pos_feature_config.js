import { getTicketPlan } from "./ticket_plan.js";
import { resolvePOSFeatures } from "./plan_features.js";

const KEY = "cajalibre_pos_features_v2";
export const DEFAULT_POS_FEATURES = { promocionesDescuentos: true, fiado: true, descuentoAutorizado: true, consultaPrecios: true };

export function readPOSFeaturePreferences() {
  try { return { ...DEFAULT_POS_FEATURES, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEFAULT_POS_FEATURES }; }
}

export function readPOSFeatureConfig() {
  return resolvePOSFeatures(readPOSFeaturePreferences(), getTicketPlan());
}

export function savePOSFeatureConfig(value) {
  if (getTicketPlan() !== "premium") return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_POS_FEATURES, ...value }));
    window.dispatchEvent(new CustomEvent("pos-features-change", { detail: value }));
    return true;
  } catch { return false; }
}
