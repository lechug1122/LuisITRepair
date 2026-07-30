import { Navigate, useLocation } from "react-router-dom";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import PageLoader from "./PageLoader";
import { auth } from "../initializer/firebase";
import { hasAnalyticsAccess } from "../js/services/analytics_access";

export default function PermissionRoute({
  permission = "",
  permissionsAny = [],
  requireSuperAdmin = false,
  requireAnalyticsAccess = false,
  allowAnalyticsAccess = false,
  requireSubscriptionOwner = false,
  fallbackPath = "/home",
  children,
}) {
  const location = useLocation();
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

  if (loading) return <PageLoader text="Cargando permisos..." />;
  if (!activo || !accesoPermitido) {
    if (motivoAcceso === "negocio_bloqueado") {
      return <Navigate to="/negocio-bloqueado" replace />;
    }
    if (motivoAcceso === "terminos_pendientes") {
      return <Navigate to="/terminos" replace />;
    }
    if (motivoAcceso === "configuracion_inicial_pendiente") {
      return <Navigate to="/configuracion-inicial" replace />;
    }
    return (
      <Navigate
        to="/login"
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

  return children;
}
