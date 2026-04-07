import { Navigate } from "react-router-dom";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import PageLoader from "./PageLoader";

export default function PermissionRoute({
  permission = "",
  requireSuperAdmin = false,
  requireSubscriptionOwner = false,
  fallbackPath = "/home",
  children,
}) {
  const {
    loading,
    activo,
    accesoPermitido,
    mensajeAcceso,
    puede,
    superAdmin,
    suscripcionControlada,
    uid,
    cuentaPrincipalUid,
  } =
    useAutorizacionActual();
  const esTitularSuscripcion =
    superAdmin !== true &&
    suscripcionControlada === true &&
    String(uid || "").trim() !== "" &&
    String(uid || "").trim() === String(cuentaPrincipalUid || "").trim();

  if (loading) return <PageLoader text="Cargando permisos..." />;
  if (!activo || !accesoPermitido) {
    return (
      <Navigate
        to="/login"
        replace
        state={mensajeAcceso ? { accessMessage: mensajeAcceso } : undefined}
      />
    );
  }
  if (requireSuperAdmin && !superAdmin) return <Navigate to={fallbackPath} replace />;
  if (requireSubscriptionOwner && !esTitularSuscripcion) {
    return <Navigate to={fallbackPath} replace />;
  }
  if (permission && !puede(permission)) return <Navigate to={fallbackPath} replace />;

  return children;
}
