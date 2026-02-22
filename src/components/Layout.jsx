import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import "../css/pos.css";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = [
    { label: "Ventas", path: "/POS", emoji: "🛒" },
    { label: "Productos", path: "/productos", emoji: "📦" },
    { label: "Clientes", path: "/clientes", emoji: "👥" },
    { label: "Reportes", path: "/reportes", emoji: "📊" },
  ];

  return (
    <div className={`layout ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          {sidebarOpen && (
            <div className="sidebar-brand">
              <span className="brand-icon">💻</span>
              <h2>LuisITRepair</h2>
            </div>
          )}
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Ocultar" : "Mostrar"}
          >
            {sidebarOpen ? "◀" : "▶"}
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

      {/* Contenido dinámico */}
      <div className="main-wrapper">
        {children}
      </div>

    </div>
  );
}
