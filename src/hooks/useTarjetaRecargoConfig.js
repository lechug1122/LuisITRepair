import { useEffect, useState } from "react";
import {
  escucharTarjetaRecargoConfig,
  readTarjetaRecargoConfigCache,
} from "../js/services/tarjeta_recargo_config";

export default function useTarjetaRecargoConfig() {
  const [config, setConfig] = useState(() => readTarjetaRecargoConfigCache());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = escucharTarjetaRecargoConfig(
      (data) => {
        setConfig(data);
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
        console.warn(
          "[recargo-tarjeta] No se pudo cerrar el listener:",
          error?.code || error,
        );
      }
    };
  }, []);

  return {
    config,
    loading,
  };
}
