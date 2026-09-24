import { useEffect, useState } from "react";
import {
  DEFAULT_TERMINOS_SERVICIO,
  escucharServiciosConfig,
  readServiciosConfigCache,
} from "../js/services/configure_servicios";
import useAutorizacionActual from "./useAutorizacionActual";
import { canUseSalesFeature } from "../js/services/plan_features.js";

export default function useServiciosConfig() {
  const { premiumState } = useAutorizacionActual();
  const [config, setConfig] = useState(() => readServiciosConfigCache());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = escucharServiciosConfig(
      (data) => {
        setConfig(data);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => unsubscribe?.();
  }, []);

  return {
    config,
    trackingEnabled: config?.trackingEnabled === true,
    precioRevision: Number(config?.precioRevision || 0),
    habilitarCanjes: !canUseSalesFeature("canjes", { premiumState, enabled: config?.habilitarCanjes === false }),
    catalogoCanjes: Array.isArray(config?.catalogoCanjes) ? config.catalogoCanjes : [],
    hojaServicioConfig: config?.hojaServicio || null,
    hojaServicioHabilitada: config?.hojaServicio?.habilitada !== false,
    terminosPersonalizados: config?.hojaServicio?.terminosPersonalizados !== false,
    terminosServicio: canUseSalesFeature("terminosPersonalizados", {
      premiumState, enabled: config?.hojaServicio?.terminosPersonalizados !== false,
    }) && Array.isArray(config?.hojaServicio?.terminos)
      ? config.hojaServicio.terminos
      : DEFAULT_TERMINOS_SERVICIO,
    politicaRetardo: config?.hojaServicio?.retardo || null,
    loading,
  };
}
