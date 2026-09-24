import { useEffect, useState } from "react";
import useAutorizacionActual from "./useAutorizacionActual";
import { readPOSFeaturePreferences } from "../js/services/pos_feature_config";
import { resolvePOSFeatures } from "../js/services/plan_features";

export default function usePOSFeatures() {
  const { premiumState } = useAutorizacionActual();
  const [preferences, setPreferences] = useState(readPOSFeaturePreferences);
  useEffect(() => {
    const update = () => setPreferences(readPOSFeaturePreferences());
    window.addEventListener("pos-features-change", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("pos-features-change", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return resolvePOSFeatures(preferences, premiumState);
}
