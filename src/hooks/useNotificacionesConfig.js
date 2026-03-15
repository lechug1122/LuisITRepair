import { useEffect, useState } from "react";
import {
  escucharNotificacionesConfig,
  readNotificacionesConfigCache,
} from "../js/services/configure_notificaciones";

export default function useNotificacionesConfig() {
  const [config, setConfig] = useState(() => readNotificacionesConfigCache());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = escucharNotificacionesConfig(
      (data) => {
        setConfig(data);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsubscribe?.();
  }, []);

  return { config, loading };
}
