import { Navigate, useLocation } from "react-router-dom";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import AccesoErrorPanel from "./AccesoErrorPanel";
import PageLoader from "./PageLoader";
import usePOSFeatures from "../hooks/usePOSFeatures";
import { auth } from "../initializer/firebase";
import { hasAnalyticsAccess } from "../js/services/analytics_access";
import {
  FASES_SESION,
  registrarRedireccion,
  resolverRutaSesion,
} from "../js/services/ruta_sesion";

export default function PermissionRoute({
  permission = "",
  permissionsAny = [],
  requireSuperAdmin = false,
  requireAnalyticsAccess = false,
  allowAnalyticsAccess = false,
  requireSubscriptionOwner = false,
  salesFeature = "",
  fallbackPath = "/home",
  children,
}) {
  const location = useLocation();
  const salesFeatures = usePOSFeatures();
  const {
    loading,
    activo,
    accesoPermitido,
    motivoAcceso,
    mensajeAcceso,
    puede,
    superAdmin,
    accesoAnalitica,
    uid,
    cuentaPrincipalUid,
  } =
    useAutorizacionActual();
  const esAdministradorNegocio =
    superAdmin !== true &&
    String(uid || "").trim() !== "" &&
    String(uid || "").trim() === String(cuentaPrincipalUid || "").trim();

  // El acceso a la sesion lo decide la misma funcion que usa ProtectedRoute:
  // aqui solo se evaluan permisos, nunca se reinterpreta el motivo.
  const destino = resolverRutaSesion({ loading, uid, accesoPermitido, motivoAcceso });

  if (destino.fase === FASES_SESION.CARGANDO) {
    return <PageLoader text="Cargando permisos..." />;
  }

  // Un error de lectura no significa que al usuario le falte un negocio ni un
  // permiso: se informa y se deja reintentar.
  if (destino.fase === FASES_SESION.ERROR) {
    return <AccesoErrorPanel mensaje={mensajeAcceso} />;
  }

  if (destino.fase !== FASES_SESION.PERMITIDO || !activo) {
    if (!destino.ruta || destino.ruta === location.pathname) {
      return <AccesoErrorPanel titulo="Acceso no disponible" mensaje={mensajeAcceso} />;
    }

    registrarRedireccion("PermissionRoute", location.pathname, destino.ruta, destino.motivo);

    return (
      <Navigate
        to={destino.ruta}
        replace
        state={mensajeAcceso ? { accessMessage: mensajeAcceso } : undefined}
      />
    );
  }
  if (requireSuperAdmin && !superAdmin) return <Navigate to={fallbackPath} replace />;
  if (requireAnalyticsAccess && !hasAnalyticsAccess({
    superAdmin,
    accesoAnalitica,
    email: auth.currentUser?.email,
  })) {
    return <Navigate to={fallbackPath} replace />;
  }
  if (requireSubscriptionOwner && !esAdministradorNegocio) {
    return <Navigate to={fallbackPath} replace />;
  }
  const analyticsException =
    allowAnalyticsAccess &&
    ["/configuracion/analitica", "/configuracion/suscripciones"].includes(location.pathname) &&
    hasAnalyticsAccess({ superAdmin, accesoAnalitica, email: auth.currentUser?.email });
  const hasAnyPermission = Array.isArray(permissionsAny)
    && permissionsAny.length > 0
    && permissionsAny.some((item) => puede(item));
  if (permission && !puede(permission) && !hasAnyPermission && !analyticsException) {
    return <Navigate to={fallbackPath} replace />;
  }

  if (salesFeature && salesFeatures[salesFeature] !== true) {
    return <Navigate to="/configuracion/pos" replace />;
  }
  return children;
}
