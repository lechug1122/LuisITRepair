import { Navigate } from "react-router-dom";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import PageLoader from "./PageLoader";

export default function PermissionRoute({
  permission = "",
  fallbackPath = "/home",
  children,
}) {
  const { loading, activo, puede } = useAutorizacionActual();

  if (loading) return <PageLoader text="Cargando permisos..." />;
  if (!activo) return <Navigate to="/login" replace />;
  if (permission && !puede(permission)) return <Navigate to={fallbackPath} replace />;

  return children;
}
