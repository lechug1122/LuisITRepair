import { useEffect, useState } from "react";
import { escucharEmpresa, readEmpresaConfigCache } from "../js/services/configure_empresa";

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

    return () => unsubscribe?.();
  }, []);

  return {
    empresa,
    nombreEmpresa: String(empresa?.nombre || "").trim(),
    loading,
  };
}
