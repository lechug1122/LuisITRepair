import { Navigate } from "react-router-dom";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import PageLoader from "./PageLoader";

export default function ServiceModuleRoute({
  fallbackPath = "/home",
  children,
}) {
  const { loading, serviciosHabilitados } = useEmpresaConfig();

  if (loading) return <PageLoader text="Cargando configuracion..." />;
  if (!serviciosHabilitados) return <Navigate to={fallbackPath} replace />;

  return children;
}
