import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { auth, db } from "../initializer/firebase";

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
  mostrarNotificaciones = true,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { puede } = useAutorizacionActual();
  const [usuarioNombre, setUsuarioNombre] = useState("Usuario");
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const menuUsuarioRef = useRef(null);

  const navItems = [
    { label: "Generar Servicio", to: "/hoja_servicio", permission: "servicios.crear" },
    { label: "Servicios", to: "/servicios", permission: "servicios.ver" },
    { label: "Clientes", to: "/clientes", permission: "clientes.ver" },
    { label: "Punto de venta", to: "/POS", permission: "ventas.pos" },
    { label: "Configuracion", to: "/configuracion", permission: "configuracion.ver" },
  ].filter((item) => puede(item.permission));

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUsuarioNombre("Usuario");
        return;
      }

      const fallback = user.displayName || String(user.email || "Usuario").split("@")[0];
      setUsuarioNombre(fallback);

      try {
        const empQ = query(
          collection(db, "empleados"),
          where("uid", "==", user.uid),
          limit(1),
        );
        const empSnap = await getDocs(empQ);
        if (!empSnap.empty) {
          const nombreEmpleado = String(empSnap.docs[0]?.data()?.nombre || "").trim();
          if (nombreEmpleado) {
            setUsuarioNombre(nombreEmpleado);
            return;
          }
        }

        const autSnap = await getDoc(doc(db, "autorizados", user.uid));
        const nombreAutorizado = String(autSnap.data()?.nombre || "").trim();
        if (nombreAutorizado) setUsuarioNombre(nombreAutorizado);
      } catch {
        // fallback ya seteado
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    setMenuMovilAbierto(false);
    setMenuUsuarioAbierto(false);
  }, [location.pathname]);

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia("(min-width: 992px)").matches) {
        setMenuMovilAbierto(false);
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    // Cierra el dropdown del usuario al hacer click fuera del contenedor.
    const onDocClick = (event) => {
      if (!menuUsuarioRef.current) return;
      if (!menuUsuarioRef.current.contains(event.target)) {
        setMenuUsuarioAbierto(false);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleLogout = async () => {
    if (cerrandoSesion) return;

    setMenuUsuarioAbierto(false);
    setCerrandoSesion(true);
    const user = auth.currentUser;

    if (user?.uid) {
      try {
        // Intenta marcar presencia offline, pero no bloquea la salida.
        await updateDoc(doc(db, "autorizados", user.uid), {
          online: false,
          lastActive: new Date(),
        });
      } catch (e) {
        console.warn("No se pudo actualizar presencia al cerrar sesion:", e?.code || e);
      }
    }

    try {
      await signOut(auth);
      navigate("/login", { replace: true });
    } catch (e) {
      console.error("Error al cerrar sesion:", e);
    } finally {
      setCerrandoSesion(false);
    }
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary fixed-top shadow-sm no-print app-navbar">
      <div className="container-fluid">
        <NavLink
          className="navbar-brand fw-bold"
          to="/home"
          onClick={() => setMenuMovilAbierto(false)}
        >
          LuisITRepair
        </NavLink>

        <button
          className={`navbar-toggler ${menuMovilAbierto ? "" : "collapsed"}`}
          type="button"
          onClick={() => setMenuMovilAbierto((v) => !v)}
          aria-controls="navbarSupportedContent"
          aria-expanded={menuMovilAbierto}
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon" />
        </button>

        <div
          className={`collapse navbar-collapse ${menuMovilAbierto ? "show" : ""}`}
          id="navbarSupportedContent"
        >
          <ul className="navbar-nav ms-3 mb-2 mb-lg-0 gap-2 app-navbar-links">
            {navItems.map((item) => (
              <li key={item.to} className="nav-item">
                <NavLink
                  className="nav-link"
                  to={item.to}
                  end={item.to === "/hoja_servicio"}
                  onClick={() => setMenuMovilAbierto(false)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="d-flex align-items-center gap-2 ms-auto position-relative navbar-right-tools">
            {mostrarNotificaciones && (
              <>
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
              </>
            )}

            <div
              ref={menuUsuarioRef}
              className="position-relative"
            >
              <button
                type="button"
                className="btn btn-light btn-sm rounded-circle user-menu-trigger"
                onClick={() => setMenuUsuarioAbierto((v) => !v)}
                title={usuarioNombre}
              >
                {"\u{1F464}"}
              </button>

              {menuUsuarioAbierto && (
                <div className="user-menu-panel">
                  <div className="user-menu-name" title={usuarioNombre}>
                    {usuarioNombre}
                  </div>

               

                  <button
                    type="button"
                    className="btn btn-danger btn-sm w-100 text-start user-menu-btn"
                    onClick={handleLogout}
                    disabled={cerrandoSesion}
                  >
                    {cerrandoSesion ? "Saliendo..." : "Cerrar sesion"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
