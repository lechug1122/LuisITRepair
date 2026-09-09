import { useEffect, useState } from "react";
import {
  escucharImpresorasConfig,
  readImpresorasConfigCache,
} from "../js/services/impresoras_config";

export default function useImpresorasConfig() {
  const [config, setConfig] = useState(() => readImpresorasConfigCache());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = escucharImpresorasConfig(
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
    modoImpresion: config?.modoImpresion || "dialogo",
    nombreImpresoraTicket: config?.nombreImpresoraTicket || "",
    tamanoTicket: config?.tamanoTicket === "80mm" ? "80mm" : "58mm",
    nombreImpresoraHojaServicio: config?.nombreImpresoraHojaServicio || "",
    tamanoHojaServicio: config?.tamanoHojaServicio || "a4",
    salidaTicketMovil: config?.salidaTicketMovil || "dialogo",
    nombreImpresora: config?.nombreImpresoraTicket || "",
    imprimirAlCobrar: config?.imprimirAlCobrar !== false,
    imprimirAlIniciarServicio: config?.imprimirAlIniciarServicio !== false,
    documentoAlIniciarServicio: config?.documentoAlIniciarServicio || "ticket",
    loading,
  };
}
