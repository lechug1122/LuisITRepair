import { useNavigate, useLocation } from "react-router-dom";
import "../css/pos.css";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="layout">

      {/* Sidebar */}
      <div className="sidebar">
        <h2>LuisITRepair</h2>
        <ul>
          <li
            className={location.pathname === "/" ? "active" : ""}
            onClick={() => navigate("/POS")}
          >
            Ventas
          </li>

          <li
            className={location.pathname === "/productos" ? "active" : ""}
            onClick={() => navigate("/productos")}
          >
            Productos
          </li>

          <li
            className={location.pathname === "/clientes" ? "active" : ""}
            onClick={() => navigate("/clientes")}
          >
            Clientes
          </li>

          <li
            className={location.pathname === "/reportes" ? "active" : ""}
            onClick={() => navigate("/reportes")}
          >
            Reportes
          </li>
        </ul>
      </div>

      {/* Contenido dinámico */}
      <div className="main-wrapper">
        {children}
      </div>

    </div>
  );
}
