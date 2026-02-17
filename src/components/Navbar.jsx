import { NavLink } from "react-router-dom";

function formatoHora(fechaMs) {
  if (!fechaMs) return "";
  try {
    return new Date(fechaMs).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Navbar({
  panelAbierto = false,
  togglePanelNotificaciones = () => {},
  notificaciones = [],
  noLeidas = 0,
}) {
  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary fixed-top shadow-sm no-print">
      <div className="container-fluid">
        <NavLink className="navbar-brand fw-bold" to="/home">
          LuisITRepair
        </NavLink>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarSupportedContent"
          aria-controls="navbarSupportedContent"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon" />
        </button>

        <div className="collapse navbar-collapse" id="navbarSupportedContent">
          <ul className="navbar-nav ms-3 mb-2 mb-lg-0 gap-2">
            <li className="nav-item">
              <NavLink className="nav-link" to="/hoja_servicio" end>
                Generar Servicio
              </NavLink>
            </li>

            <li className="nav-item">
              <NavLink className="nav-link" to="/servicios">
                Servicios
              </NavLink>
            </li>

            <li className="nav-item">
              <NavLink className="nav-link" to="/clientes">
                Clientes
              </NavLink>
            </li>

            <li className="nav-item">
              <NavLink className="nav-link" to="/POS">
                Punto de venta
              </NavLink>
            </li>

            <li className="nav-item">
              <NavLink className="nav-link" to="/configuracion">
                Configuracion
              </NavLink>
            </li>
          </ul>

          <div className="d-flex align-items-center gap-2 ms-auto position-relative">
            <button
              type="button"
              className="btn btn-light btn-sm rounded-circle bell-btn"
              onClick={togglePanelNotificaciones}
              title="Notificaciones"
            >
              <span className="bell-icon">{"\u{1F514}"}</span>
              {noLeidas > 0 && <span className="bell-badge">{noLeidas}</span>}
            </button>

            {panelAbierto && (
              <div className="notification-panel">
                <div className="notification-panel-header">
                  <strong>Notificaciones</strong>
                  <span>{notificaciones.length}</span>
                </div>

                {notificaciones.length === 0 && (
                  <p className="notification-panel-empty">Sin notificaciones.</p>
                )}

                {notificaciones.slice(0, 12).map((n) => (
                  <div key={n.id} className={`notification-panel-item ${n.nivel || "baja"}`}>
                    <p className="notification-panel-title">{n.titulo}</p>
                    <p className="notification-panel-detail">{n.detalle}</p>
                    <span className="notification-panel-time">{formatoHora(n.fecha)}</span>
                  </div>
                ))}
              </div>
            )}

            <form
              className="d-flex align-items-center gap-2"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                className="form-control form-control-sm rounded-pill px-3"
                type="search"
                placeholder="Buscar..."
                style={{ marginTop: "16px", width: "220px", height: "32px" }}
              />

              <button
                className="btn btn-light btn-sm rounded-pill px-3"
                style={{ height: "32px" }}
                type="submit"
              >
                Buscar
              </button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  );
}
