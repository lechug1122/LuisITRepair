import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../initializer/firebase";
import { migrateLegacyTenantDataOnce } from "../js/services/legacy_tenant_migration";
import { escucharNegocio } from "../js/services/negocios";
import { normalizeAutorizadoData } from "../js/services/autorizacion";
import { normalizarPermisos, tienePermiso } from "../js/services/permisos";
import { resolverAccesoSuscripcion } from "../js/services/suscripciones";
import { clearTenantContext, saveTenantContext } from "../js/services/tenant";

export default function useAutorizacionActual() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [activo, setActivo] = useState(false);
  const [permisos, setPermisos] = useState({});
  const [superAdmin, setSuperAdmin] = useState(false);
  const [accesoAnalitica, setAccesoAnalitica] = useState(false);
  const [cuentaPrincipalUid, setCuentaPrincipalUid] = useState("");
  const [suscripcionControlada, setSuscripcionControlada] = useState(false);
  const [accesoPermitido, setAccesoPermitido] = useState(false);
  const [motivoAcceso, setMotivoAcceso] = useState("");
  const [mensajeAcceso, setMensajeAcceso] = useState("");
  const [suscripcion, setSuscripcion] = useState(null);

  useEffect(() => {
    let unsubDoc = null;
    let unsubSuscripcion = null;
    let unsubNegocio = null;
    let cancelled = false;

    const safeUnsubscribe = (unsubscribe) => {
      if (typeof unsubscribe !== "function") return;
      try {
        unsubscribe();
      } catch (error) {
        console.warn("[autorizacion] No se pudo cerrar un listener:", error?.code || error);
      }
    };

    const resetState = () => {
      clearTenantContext();
      setUid("");
      setNombre("");
      setRol("");
      setActivo(false);
      setPermisos({});
      setSuperAdmin(false);
      setAccesoAnalitica(false);
      setCuentaPrincipalUid("");
      setSuscripcionControlada(false);
      setAccesoPermitido(false);
      setMotivoAcceso("");
      setMensajeAcceso("");
      setSuscripcion(null);
      setLoading(false);
    };

    const stopSuscripcion = () => {
      if (unsubSuscripcion) {
        safeUnsubscribe(unsubSuscripcion);
        unsubSuscripcion = null;
      }
    };

    const stopNegocio = () => {
      if (unsubNegocio) {
        safeUnsubscribe(unsubNegocio);
        unsubNegocio = null;
      }
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubDoc) {
        safeUnsubscribe(unsubDoc);
        unsubDoc = null;
      }
      stopSuscripcion();
      stopNegocio();

      if (!user) {
        resetState();
        return;
      }

      setLoading(true);
      setUid(user.uid);
      setNombre(user.displayName || String(user.email || "").split("@")[0] || "Usuario");

      unsubDoc = onSnapshot(
        doc(db, "autorizados", user.uid),
        (snap) => {
          const data = normalizeAutorizadoData(snap.exists() ? snap.data() : {}, user.uid);
          const nextRol = String(data?.rol || "");
          const nextNombre = String(data?.nombre || "").trim();
          const nextActivo = data.activo;
          const nextSuperAdmin = data.superAdmin;
          const nextAccesoAnalitica = data.accesoAnalitica;
          const nextCuentaPrincipalUid = data.cuentaPrincipalUid;
          const nextNegocioId = data.negocioId || nextCuentaPrincipalUid;
          const nextSuscripcionControlada = data.suscripcionControlada;
          const nextAutorizado = data;

          saveTenantContext({
            uid: user.uid,
            cuentaPrincipalUid: nextCuentaPrincipalUid,
            negocioId: nextNegocioId,
            superAdmin: nextSuperAdmin,
            suscripcionControlada: nextSuscripcionControlada,
          });

          if (nextCuentaPrincipalUid && (nextSuperAdmin || nextSuscripcionControlada !== true)) {
            migrateLegacyTenantDataOnce(nextCuentaPrincipalUid).catch(() => {});
          }

          if (nextNombre) setNombre(nextNombre);
          setRol(nextRol);
          setActivo(nextActivo);
          setPermisos(normalizarPermisos(nextRol, data?.permisos || {}));
          setSuperAdmin(nextSuperAdmin);
          setAccesoAnalitica(nextAccesoAnalitica);
          setCuentaPrincipalUid(nextCuentaPrincipalUid);
          setSuscripcionControlada(nextSuscripcionControlada);

          stopSuscripcion();
          stopNegocio();

          const resolverYAplicarAcceso = (suscripcionData = null, negocioData = null) => {
            if (cancelled) return;
            const acceso = resolverAccesoSuscripcion({
              uid: user.uid,
              autorizado: nextAutorizado,
              suscripcion: suscripcionData,
              negocio: negocioData,
            });
            setSuscripcion(acceso.suscripcion || null);
            setAccesoPermitido(acceso.permitido);
            setMotivoAcceso(acceso.motivo || "");
            setMensajeAcceso(acceso.mensaje || "");
            setLoading(false);
          };

          if (!nextSuperAdmin && nextNegocioId) {
            unsubNegocio = escucharNegocio(
              nextNegocioId,
              (negocioData) => {
                if (nextSuscripcionControlada && !nextSuperAdmin && nextCuentaPrincipalUid) {
                  return;
                }
                resolverYAplicarAcceso(null, negocioData);
              },
              () => resolverYAplicarAcceso(null, null),
            );
          }

          if (nextSuscripcionControlada && !nextSuperAdmin && nextCuentaPrincipalUid) {
            unsubSuscripcion = onSnapshot(
              doc(db, "suscripciones", nextCuentaPrincipalUid),
              async (susSnap) => {
                let negocioData = null;
                if (nextNegocioId) {
                  negocioData = await new Promise((resolve) => {
                    const off = escucharNegocio(
                      nextNegocioId,
                      (data) => {
                        off();
                        resolve(data);
                      },
                      () => {
                        off();
                        resolve(null);
                      },
                    );
                  });
                }
                resolverYAplicarAcceso(susSnap.exists() ? susSnap.data() : null, negocioData);
              },
              () => {
                resolverYAplicarAcceso(null, null);
              },
            );
            return;
          }

          if (nextSuperAdmin || !nextNegocioId) {
            resolverYAplicarAcceso(null, null);
          }
        },
        () => {
          setNombre(user.displayName || String(user.email || "").split("@")[0] || "");
          setRol("");
          setActivo(false);
          setPermisos({});
          setSuperAdmin(false);
          setAccesoAnalitica(false);
          setCuentaPrincipalUid("");
          setSuscripcionControlada(false);
          setAccesoPermitido(false);
          setMotivoAcceso("");
          setMensajeAcceso("");
          setSuscripcion(null);
          setLoading(false);
        },
      );
    });

    return () => {
      cancelled = true;
      if (unsubDoc) safeUnsubscribe(unsubDoc);
      stopSuscripcion();
      stopNegocio();
      safeUnsubscribe(unsubAuth);
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
      superAdmin,
      accesoAnalitica,
      cuentaPrincipalUid,
      suscripcionControlada,
      accesoPermitido,
      motivoAcceso,
      mensajeAcceso,
      suscripcion,
      puede: (key) => tienePermiso(rol, permisos, key),
    };
  }, [
    loading,
    uid,
    nombre,
    rol,
    activo,
    permisos,
    superAdmin,
    accesoAnalitica,
    cuentaPrincipalUid,
    suscripcionControlada,
    accesoPermitido,
    motivoAcceso,
    mensajeAcceso,
    suscripcion,
  ]);

  return api;
}
