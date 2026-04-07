import { useEffect, useState } from "react";
import { obtenerProveedores } from "../js/services/proveedores_firestore";

export default function useProveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recargar = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const items = await obtenerProveedores();
      setProveedores(Array.isArray(items) ? items : []);
    } catch (err) {
      console.warn("[proveedores] No se pudo cargar la coleccion:", err?.code || err);
      setProveedores([]);
      setError(err || null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    recargar();
  }, []);

  return {
    proveedores,
    loading,
    error,
    recargar,
  };
}
