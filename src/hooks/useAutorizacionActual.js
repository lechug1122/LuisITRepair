import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../initializer/firebase";
import { normalizarPermisos, tienePermiso } from "../js/services/permisos";

export default function useAutorizacionActual() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState("");
  const [rol, setRol] = useState("");
  const [activo, setActivo] = useState(false);
  const [permisos, setPermisos] = useState({});

  useEffect(() => {
    let unsubDoc = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }

      if (!user) {
        setUid("");
        setRol("");
        setActivo(false);
        setPermisos({});
        setLoading(false);
        return;
      }

      setUid(user.uid);
      unsubDoc = onSnapshot(
        doc(db, "autorizados", user.uid),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};
          const nextRol = String(data?.rol || "");
          setRol(nextRol);
          setActivo(data?.activo === true);
          setPermisos(normalizarPermisos(nextRol, data?.permisos || {}));
          setLoading(false);
        },
        () => {
          setRol("");
          setActivo(false);
          setPermisos({});
          setLoading(false);
        },
      );
    });

    return () => {
      if (unsubDoc) unsubDoc();
      unsubAuth();
    };
  }, []);

  const api = useMemo(() => {
    return {
      loading,
      uid,
      rol,
      activo,
      permisos,
      puede: (key) => tienePermiso(rol, permisos, key),
    };
  }, [loading, uid, rol, activo, permisos]);

  return api;
}

