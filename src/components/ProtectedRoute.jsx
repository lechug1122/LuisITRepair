import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../initializer/firebase";
import { obtenerEstadoAutorizacion } from "../js/services/autorizacion";
import PageLoader from "./PageLoader";

const MOTIVE_ROUTE = {
  terminos_pendientes: "/terminos",
  configuracion_inicial_pendiente: "/configuracion-inicial",
  negocio_bloqueado: "/negocio-bloqueado",
};

export default function ProtectedRoute({ allowMotives = [], children }) {
  const [loading, setLoading] = useState(true);
  const [permitido, setPermitido] = useState(false);
  const [mensajeAcceso, setMensajeAcceso] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPermitido(false);
        setMensajeAcceso("");
        setMotivo("");
        setLoading(false);
        return;
      }

      try {
        const estado = await obtenerEstadoAutorizacion(user.uid);
        setPermitido(estado.permitido);
        setMensajeAcceso(estado.mensaje || "");
        setMotivo(estado.motivo || "");
      } catch (error) {
        setPermitido(false);
        setMotivo("");
        setMensajeAcceso(
          String(error?.message || "").trim() || "No se pudo validar tu acceso.",
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  if (loading) return <PageLoader text="Validando acceso..." />;

  if (!auth.currentUser) return <Navigate to="/login" replace />;

  if (!permitido && allowMotives.includes(motivo)) {
    return children;
  }

  if (!permitido) {
    const route = MOTIVE_ROUTE[motivo];
    if (route) {
      return (
        <Navigate
          to={route}
          replace
          state={mensajeAcceso ? { accessMessage: mensajeAcceso } : undefined}
        />
      );
    }

    return (
      <Navigate
        to="/login"
        replace
        state={mensajeAcceso ? { accessMessage: mensajeAcceso } : undefined}
      />
    );
  }

  return children;
}
