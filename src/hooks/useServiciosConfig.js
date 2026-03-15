import { useEffect, useState } from "react";
import {
  escucharServiciosConfig,
  readServiciosConfigCache,
} from "../js/services/configure_servicios";

export default function useServiciosConfig() {
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
    precioRevision: Number(config?.precioRevision || 0),
    habilitarCanjes: config?.habilitarCanjes !== false,
    catalogoCanjes: Array.isArray(config?.catalogoCanjes) ? config.catalogoCanjes : [],
    hojaServicioConfig: config?.hojaServicio || null,
    hojaServicioHabilitada: config?.hojaServicio?.habilitada !== false,
    terminosServicio: Array.isArray(config?.hojaServicio?.terminos)
      ? config.hojaServicio.terminos
      : [],
    politicaRetardo: config?.hojaServicio?.retardo || null,
    loading,
  };
}
