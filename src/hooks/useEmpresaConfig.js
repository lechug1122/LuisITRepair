import { useEffect, useState } from "react";
import { escucharEmpresa, readEmpresaConfigCache } from "../js/services/configure_empresa";
import { empresaTieneServicios, getTipoNegocioActivo } from "../js/services/tipos_negocio";

export default function useEmpresaConfig() {
  const [empresa, setEmpresa] = useState(() => readEmpresaConfigCache());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = escucharEmpresa(
      (data) => {
        setEmpresa(data);
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
        console.warn("[empresa] No se pudo cerrar el listener:", error?.code || error);
      }
    };
  }, []);

  return {
    empresa,
    nombreEmpresa: String(empresa?.nombre || "").trim(),
    logoEmpresa: String(empresa?.logo || "").trim(),
    tipoNegocioActivo: getTipoNegocioActivo(empresa),
    serviciosHabilitados: empresaTieneServicios(empresa),
    loading,
  };
}
