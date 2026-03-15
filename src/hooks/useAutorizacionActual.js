import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDocs, limit, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../initializer/firebase";
import { normalizarPermisos, tienePermiso } from "../js/services/permisos";

export default function useAutorizacionActual() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [activo, setActivo] = useState(false);
  const [permisos, setPermisos] = useState({});

  useEffect(() => {
    let unsubDoc = null;
    let cancelled = false;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }

      if (!user) {
        setUid("");
        setNombre("");
        setRol("");
        setActivo(false);
        setPermisos({});
        setLoading(false);
        return;
      }

      setUid(user.uid);
      setNombre(user.displayName || String(user.email || "").split("@")[0] || "Usuario");

      getDocs(
        query(
          collection(db, "empleados"),
          where("uid", "==", user.uid),
          limit(1),
        ),
      )
        .then((snap) => {
          if (cancelled || snap.empty) return;
          const nombreEmpleado = String(snap.docs[0]?.data()?.nombre || "").trim();
          if (nombreEmpleado) setNombre(nombreEmpleado);
        })
        .catch(() => {});

      unsubDoc = onSnapshot(
        doc(db, "autorizados", user.uid),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};
          const nextRol = String(data?.rol || "");
          const nextNombre = String(data?.nombre || "").trim();
          if (nextNombre) setNombre(nextNombre);
          setRol(nextRol);
          setActivo(data?.activo === true);
          setPermisos(normalizarPermisos(nextRol, data?.permisos || {}));
          setLoading(false);
        },
        () => {
          setNombre(user.displayName || String(user.email || "").split("@")[0] || "");
          setRol("");
          setActivo(false);
          setPermisos({});
          setLoading(false);
        },
      );
    });

    return () => {
      cancelled = true;
      if (unsubDoc) unsubDoc();
      unsubAuth();
    };
  }, []);

  const api = useMemo(() => {
    return {
      loading,
      uid,
      nombre,
      rol,
      activo,
      permisos,
      puede: (key) => tienePermiso(rol, permisos, key),
    };
  }, [loading, uid, nombre, rol, activo, permisos]);

  return api;
}
