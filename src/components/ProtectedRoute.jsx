import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../initializer/firebase";
import { esUsuarioAutorizado } from "../js/services/autorizacion";

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [permitido, setPermitido] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPermitido(false);
        setLoading(false);
        return;
      }

      const ok = await esUsuarioAutorizado(user.uid);
      setPermitido(ok);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) return <div style={{ padding: 20 }}>Cargando...</div>;

  if (!permitido) return <Navigate to="/login" replace />;

  return children;
}
