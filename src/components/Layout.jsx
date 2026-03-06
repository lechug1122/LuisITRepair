import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import "../css/pos.css";
import useAutorizacionActual from "../hooks/useAutorizacionActual";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { puede } = useAutorizacionActual();

  useEffect(() => {
    const syncSidebarForViewport = () => {
      if (window.innerWidth <= 900) {
        setSidebarOpen(true);
      }
    };

    syncSidebarForViewport();
    window.addEventListener("resize", syncSidebarForViewport);
    return () => window.removeEventListener("resize", syncSidebarForViewport);
  }, []);

  const menuItems = [
    { label: "Ventas", path: "/POS", emoji: "🛒", permission: "ventas.pos" },
    { label: "Productos", path: "/productos", emoji: "📦", permission: "productos.ver" },
    { label: "Clientes", path: "/clientes", emoji: "👥", permission: "clientes.ver" },
    { label: "Reportes", path: "/reportes", emoji: "📊", permission: "reportes.ver" },
  ].filter((item) => puede(item.permission));

  return (
    <div className={`layout ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <div className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          {sidebarOpen && (
            <div className="sidebar-brand">
              <span className="brand-icon brand-badge">L</span>
              <h2>LuisITRepair</h2>
            </div>
          )}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Ocultar" : "Mostrar"}
          >
            {sidebarOpen ? "<" : ">"}
          </button>
        </div>

        <ul className="sidebar-menu">
          {menuItems.map((item) => (
            <li
              key={item.path}
              className={location.pathname === item.path ? "active" : ""}
              onClick={() => navigate(item.path)}
              title={item.label}
            >
              <span className="menu-icon">{item.emoji}</span>
              {sidebarOpen && <span className="menu-label">{item.label}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="main-wrapper">{children}</div>
    </div>
  );
}
