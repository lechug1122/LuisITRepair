import { NavLink } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="navbar no-print">
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary fixed-top shadow-sm">
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
          {/* ✅ UN SOLO UL para que no se separen */}
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
              <NavLink className="nav-link" to="/configuracion">
                Configuracion
              </NavLink>
            </li>
          </ul>

          {/* ✅ Buscador a la derecha */}
          <form
            className="d-flex align-items-center gap-2 ms-auto"
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              className="form-control form-control-sm rounded-pill px-3"
              type="search"
              placeholder="Buscar..."
              style={{marginTop:"16px", width: "220px", height: "32px" }}
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
    </nav>
    </nav>
  );
}
