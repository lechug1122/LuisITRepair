import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../initializer/firebase";
import { obtenerEstadoAutorizacion } from "../js/services/autorizacion";
import PageLoader from "./PageLoader";

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [permitido, setPermitido] = useState(false);
  const [mensajeAcceso, setMensajeAcceso] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPermitido(false);
        setMensajeAcceso("");
        setLoading(false);
        return;
      }

      try {
        const estado = await obtenerEstadoAutorizacion(user.uid);
        setPermitido(estado.permitido);
        setMensajeAcceso(estado.mensaje || "");

        if (!estado.permitido) {
          await signOut(auth).catch(() => {});
        }
      } catch (error) {
        setPermitido(false);
        setMensajeAcceso(
          String(error?.message || "").trim() || "No se pudo validar tu acceso.",
        );
        await signOut(auth).catch(() => {});
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  if (loading) return <PageLoader text="Validando acceso..." />;

  if (!permitido) {
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
