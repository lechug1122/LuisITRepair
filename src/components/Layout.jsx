import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import "../css/pos.css";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";

export default function Layout({ children }) {
  const MOBILE_WORKSPACE_BREAKPOINT = 900;
  const COMPACT_DESKTOP_BREAKPOINT = 1280;
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { puede } = useAutorizacionActual();
  const { nombreEmpresa } = useEmpresaConfig();
  const esRutaPOS = String(location.pathname || "").toLowerCase() === "/pos";
  const vistaPOS = esRutaPOS
    ? (new URLSearchParams(location.search).get("vista") === "clientes" ? "clientes" : "ventas")
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

  const menuItems = [
    {
      label: "Ventas",
      path: "/POS",
      emoji: "🛒",
      permission: "ventas.pos",
      active: esRutaPOS ? vistaPOS === "ventas" : location.pathname === "/POS",
    },
    {
      label: "Inventario",
      path: "/productos",
      emoji: "📦",
      permission: "productos.ver",
      active: location.pathname === "/productos",
    },
    {
      label: "Clientes",
      path: esRutaPOS ? "/POS?vista=clientes" : "/clientes",
      emoji: "👥",
      permission: "clientes.ver",
      active: esRutaPOS
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
  ].filter((item) => puede(item.permission));

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
