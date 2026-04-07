import { useEffect, useState } from "react";
import {
  escucharMoneda,
  formatCurrency as formatCurrencyValue,
  LATAM_CURRENCY_OPTIONS,
  readMonedaConfigCache,
} from "../js/services/moneda_config";

export default function useMonedaConfig() {
  const [moneda, setMoneda] = useState(() => readMonedaConfigCache());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = escucharMoneda(
      (data) => {
        setMoneda(data);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => {
      try {
        unsubscribe?.();
      } catch (error) {
        console.warn("[moneda] No se pudo cerrar el listener:", error?.code || error);
      }
    };
  }, []);

  return {
    moneda,
    loading,
    opcionesMoneda: LATAM_CURRENCY_OPTIONS,
    codigoMoneda: String(moneda?.code || "").trim(),
    simboloMoneda: String(moneda?.symbol || "").trim(),
    formatCurrency: (value, options = {}) => formatCurrencyValue(value, moneda, options),
  };
}
