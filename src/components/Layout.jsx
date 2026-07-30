import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import "../css/pos.css";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";

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
  const vistaPOS = esRutaPOS
    ? (new URLSearchParams(location.search).get("vista") === "clientes" ? "clientes" : "ventas")
    : "";
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
      emoji: "🛒",
      permission: "ventas.pos",
      active: esRutaPOS ? vistaPOS === "ventas" : location.pathname === "/POS",
    },
    {
      label: modoRestaurante ? "Platillos" : "Inventario",
      path: "/productos",
      emoji: modoRestaurante ? "🍽️" : "📦",
      permission: "productos.ver",
      active: location.pathname === "/productos",
    },
    {
      label: "Clientes",
      path: esRutaPOS && !modoRestaurante ? "/POS?vista=clientes" : "/clientes",
      emoji: "👥",
      permission: "clientes.ver",
      active: esRutaPOS && !modoRestaurante
        ? vistaPOS === "clientes"
        : String(location.pathname || "").startsWith("/clientes"),
    },
    {
      label: "Reportes",
      path: "/reportes",
      emoji: "📊",
      permission: "reportes.ver",
      active: location.pathname === "/reportes",
    },
  ];
  const menuItemsRestaurante = [
    
    { label: "Nueva cuenta", path: "/POS?cuenta=nueva", emoji: "🧾", active: vistaRestaurante === "nueva" },
    { label: "Cuentas abiertas", path: "/POS?cuenta=abiertas", emoji: "🍽️", active: vistaRestaurante === "abiertas" },
    { label: "Historial", path: "/POS?cuenta=historial", emoji: "🕘", active: vistaRestaurante === "historial" },
    { label: "Reservaciones", path: "/POS?cuenta=reservaciones", emoji: "📅", active: vistaRestaurante === "reservaciones" },
    {
      label: "Reportes",  path: "/reportes",emoji: "📊", permission: "reportes.ver", active: location.pathname === "/reportes",},
  ];
  const menuItems = (modoRestaurante && (esRutaPOS || esRutaReportes) ? menuItemsRestaurante : menuItemsBase)
    .filter((item) => !item.permission || puede(item.permission));

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
              <h2>{marcaVisible}</h2>
            </div>
          )}
          <button
            className="workspace-sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Ocultar" : "Mostrar"}
          >
            {sidebarOpen ? "<" : ">"}
          </button>
        </div>

        <ul className="workspace-sidebar-menu">
          {menuItems.map((item) => (
            <li
              key={item.path}
              className={item.active ? "active" : ""}
              onClick={() => navigate(item.path)}
              title={item.label}
            >
              <span className="menu-icon">{item.emoji}</span>
              {sidebarOpen && <span className="menu-label">{item.label}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="workspace-main">{children}</div>
    </div>
  );
}
