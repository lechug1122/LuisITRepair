import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import "../css/pos.css";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { FiBarChart2, FiChevronLeft, FiChevronRight, FiClipboard, FiClock, FiCreditCard, FiFileText, FiGift, FiPackage, FiPlusCircle, FiShoppingCart, FiTag, FiUsers } from "react-icons/fi";

export default function Layout({ children, restaurantMode = false }) {
  const MOBILE_WORKSPACE_BREAKPOINT = 900;
  const COMPACT_DESKTOP_BREAKPOINT = 1280;
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { puede } = useAutorizacionActual();
  const { nombreEmpresa, tipoNegocioActivo } = useEmpresaConfig();
  const modoRestaurante = restaurantMode || tipoNegocioActivo?.id === "restaurante";
  const esRutaPOS = String(location.pathname || "").toLowerCase() === "/pos";
  const esRutaReportes = String(location.pathname || "").toLowerCase() === "/reportes";
  const vistaParamPOS = esRutaPOS ? new URLSearchParams(location.search).get("vista") : "";
  const vistaPOS = esRutaPOS && ["clientes", "cotizacion"].includes(vistaParamPOS)
    ? vistaParamPOS
    : (esRutaPOS ? "ventas" : "");
  const mostrarMenuCotizacion = ["soporte-computo", "telefonia", "automotriz"].includes(
    String(tipoNegocioActivo?.id || ""),
  );
  const vistaRestaurante = esRutaPOS && modoRestaurante
    ? (new URLSearchParams(location.search).get("cuenta") || "nueva")
    : "";

  useEffect(() => {
    const syncSidebarForViewport = () => {
      if (window.innerWidth <= MOBILE_WORKSPACE_BREAKPOINT) {
        setSidebarOpen(true);
        return;
      }

      setSidebarOpen(window.innerWidth > COMPACT_DESKTOP_BREAKPOINT);
    };

    syncSidebarForViewport();
    window.addEventListener("resize", syncSidebarForViewport);
    return () => window.removeEventListener("resize", syncSidebarForViewport);
  }, []);

  useEffect(() => {
    // El POS necesita un fondo de workspace para no dejar el shell vacio cuando hay poco contenido.
    document.body.classList.toggle("body-pos-workspace", esRutaPOS);
    return () => document.body.classList.remove("body-pos-workspace");
  }, [esRutaPOS]);

  const menuItemsBase = [
    {
      label: "Ventas",
      path: "/POS",
      icon: FiShoppingCart,
      permission: "ventas.pos",
      active: esRutaPOS ? vistaPOS === "ventas" : location.pathname === "/POS",
    },
    ...(mostrarMenuCotizacion ? [{
      label: "Cotizaciones",
      path: "/POS?vista=cotizacion",
      icon: FiFileText,
      permission: "ventas.pos",
      active: esRutaPOS && vistaPOS === "cotizacion",
    }] : []),
    {
      label: modoRestaurante ? "Platillos" : "Inventario",
      path: "/productos",
      icon: modoRestaurante ? FiClipboard : FiPackage,
      permission: "productos.ver",
      active: location.pathname === "/productos",
    },
    {
      label: "Clientes",
      path: esRutaPOS && !modoRestaurante ? "/POS?vista=clientes" : "/clientes",
      icon: FiUsers,
      permission: "clientes.ver",
      active: esRutaPOS && !modoRestaurante
        ? vistaPOS === "clientes"
        : String(location.pathname || "").startsWith("/clientes"),
    },
    {
      label: "Fiado",
      path: "/fiado",
      icon: FiCreditCard,
      permission: "clientes.ver",
      active: location.pathname === "/fiado",
    },
    {
      label: "Promociones",
      path: "/promociones",
      icon: FiTag,
      permissionsAny: ["promociones.gestionar", "descuentos.gestionar"],
      active: location.pathname === "/promociones",
    },
    {
      label: "Reportes",
      path: "/reportes",
      icon: FiBarChart2,
      permission: "reportes.ver",
      active: location.pathname === "/reportes",
    },
  ];
  const menuItemsRestaurante = [
    
    { label: "Nueva cuenta", path: "/POS?cuenta=nueva", icon: FiPlusCircle, active: vistaRestaurante === "nueva" },
    { label: "Cuentas abiertas", path: "/POS?cuenta=abiertas", icon: FiClipboard, active: vistaRestaurante === "abiertas" },
    { label: "Historial", path: "/POS?cuenta=historial", icon: FiClock, active: vistaRestaurante === "historial" },
    { label: "Reservaciones", path: "/POS?cuenta=reservaciones", icon: FiGift, active: vistaRestaurante === "reservaciones" },
    {
      label: "Reportes", path: "/reportes", icon: FiBarChart2, permission: "reportes.ver", active: location.pathname === "/reportes",},
  ];
  const menuItems = (modoRestaurante && (esRutaPOS || esRutaReportes) ? menuItemsRestaurante : menuItemsBase)
    .filter((item) => (
      (!item.permission || puede(item.permission))
      && (!item.permissionsAny || item.permissionsAny.some((permission) => puede(permission)))
    ));

  const marcaVisible = nombreEmpresa || "LuisITRepair";
  const inicialMarca = marcaVisible.trim().charAt(0).toUpperCase() || "L";

  return (
    <div
      className={[
        "workspace-layout",
        sidebarOpen ? "workspace-layout-open" : "workspace-layout-closed",
        esRutaPOS ? "workspace-layout-route-pos" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={`workspace-sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="workspace-sidebar-header">
          {sidebarOpen && (
            <div className="workspace-sidebar-brand">
              <span className="brand-icon brand-badge">{inicialMarca}</span>
              <div className="workspace-brand-copy"><h2>{marcaVisible}</h2><span>Panel de gestión</span></div>
            </div>
          )}
          <button
            className="workspace-sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Ocultar" : "Mostrar"}
            aria-label={sidebarOpen ? "Contraer menú lateral" : "Expandir menú lateral"}
            type="button"
          >
            {sidebarOpen ? <FiChevronLeft /> : <FiChevronRight />}
          </button>
        </div>

        {sidebarOpen && <span className="workspace-menu-caption">Menú principal</span>}
        <ul className="workspace-sidebar-menu" aria-label="Menú principal">
          {menuItems.map((item) => (
            <li
              key={item.path}
              className={item.active ? "active" : ""}
              onClick={() => navigate(item.path)}
              title={item.label}
              role="button"
              tabIndex={0}
              aria-current={item.active ? "page" : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") navigate(item.path);
              }}
            >
              <span className="menu-icon"><item.icon /></span>
              {sidebarOpen && <span className="menu-label">{item.label}</span>}
            </li>
          ))}
        </ul>
        <div className="workspace-sidebar-footer">
          <span className="workspace-status-dot" />
          {sidebarOpen && <span>Sistema conectado</span>}
        </div>
      </div>

      <div className="workspace-main">{children}</div>
    </div>
  );
}
