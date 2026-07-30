import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { auth, db } from "../initializer/firebase";
import { hasAnalyticsAccess } from "../js/services/analytics_access";

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

const PRESENCE_TTL_MS = 2 * 60 * 1000;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export default function Navbar({
  panelAbierto = false,
  togglePanelNotificaciones = () => {},
  notificaciones = [],
  noLeidas = 0,
  mostrarNotificaciones = true,
  onDismissNotification = () => {},
}) {
  const location = useLocation();
  const { puede, nombre, rol, cuentaPrincipalUid, uid, superAdmin, accesoAnalitica } = useAutorizacionActual();
  const analyticsAccess = hasAnalyticsAccess({
    superAdmin,
    accesoAnalitica,
    email: auth.currentUser?.email,
  });
  const ownerBase = cuentaPrincipalUid || uid;
  const { nombreEmpresa, serviciosHabilitados, tipoNegocioActivo } = useEmpresaConfig();
  const [usuarioNombre, setUsuarioNombre] = useState("Usuario");
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [panelEmpleadosAbierto, setPanelEmpleadosAbierto] = useState(false);
  const [empleadosActivos, setEmpleadosActivos] = useState([]);
  const [presenciaAhora, setPresenciaAhora] = useState(() => Date.now());
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const menuUsuarioRef = useRef(null);
  const empleadosRef = useRef(null);

  const navItemsBase = [
    { label: "Generar Servicio", to: "/hoja_servicio", permission: "servicios.crear" },
    { label: "Servicios", to: "/servicios", permission: "servicios.ver" },
    { label: "Clientes", to: "/clientes", permission: "clientes.ver" },
    { label: "Punto de venta", to: "/POS", permission: "ventas.pos" },
    { label: "Configuracion", to: "/configuracion", permission: "configuracion.ver" },
    ...(analyticsAccess && !puede("configuracion.ver")
      ? [{ label: "Analítica", to: "/configuracion/suscripciones?vista=analitica", analyticsOnly: true }]
      : []),
  ].filter((item) => {
    if (item.analyticsOnly) return analyticsAccess;
    if (!serviciosHabilitados && ["/hoja_servicio", "/servicios"].includes(item.to)) {
      return false;
    }
    return puede(item.permission);
  });
  const restaurantMode = tipoNegocioActivo?.id === "restaurante";
  const rolNormalizado = String(rol || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const esAdministrador = rolNormalizado.includes("admin");
  const vistaRestaurantePorRol = rolNormalizado.includes("meser")
    ? "mesero"
    : rolNormalizado.includes("cocin") || rolNormalizado.includes("chef")
      ? "cocina"
      : rolNormalizado.includes("caj")
        ? "caja"
        : "";
  const restaurantAdminHome = esAdministrador
    ? [{ label: "Inicio", to: "/home", adminHome: true }]
    : [];
  const restaurantHomes = [
    { label: "Mesas", to: "/home?vista=mesero", restaurantView: "mesero", permission: "restaurante.mesero" },
    { label: "Cocina", to: "/home?vista=cocina", restaurantView: "cocina", permission: "restaurante.cocina" },
    { label: "Caja", to: "/POS", permission: "restaurante.caja" },
  ].filter((item) => puede(item.permission));
  const restaurantTools = [
    { label: "Platillos", to: "/productos", permission: "productos.ver" },
    ...(puede("configuracion.ver")
      ? [
          { label: "Configuración", to: "/configuracion", permission: "configuracion.ver" },
        ]
      : []),
  ].filter((item) => puede(item.permission));
  const navItems = restaurantMode
    ? [...restaurantAdminHome, ...restaurantHomes, ...restaurantTools]
    : navItemsBase;

  useEffect(() => {
    const fallback =
      auth.currentUser?.displayName ||
      String(auth.currentUser?.email || "Usuario").split("@")[0] ||
      "Usuario";
    const nombreVisible = String(nombre || "").trim();
    setUsuarioNombre(nombreVisible || fallback);
  }, [nombre]);

  useEffect(() => {
    setMenuMovilAbierto(false);
    setMenuUsuarioAbierto(false);
    setPanelEmpleadosAbierto(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!ownerBase) {
      setEmpleadosActivos([]);
      return undefined;
    }

    let empleados = [];
    let presencia = {};

    const actualizar = () => {
      setEmpleadosActivos(
        empleados.map((empleado) => ({
          ...empleado,
          online: presencia[empleado.uid]?.online === true,
          lastActive: presencia[empleado.uid]?.lastActive || null,
        })),
      );
    };

    const unsubEmpleados = onSnapshot(
      query(collection(db, "empleados"), where("cuentaPrincipalUid", "==", ownerBase)),
      (snapshot) => {
        empleados = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((empleado) => empleado.estado === "Activo");
        actualizar();
      },
      () => {
        empleados = [];
        actualizar();
      },
    );

    const unsubPresencia = onSnapshot(
      query(collection(db, "autorizados"), where("cuentaPrincipalUid", "==", ownerBase)),
      (snapshot) => {
        presencia = {};
        snapshot.docs.forEach((item) => {
          const data = item.data() || {};
          presencia[item.id] = {
            online: data.online === true,
            lastActive: data.lastActive || null,
          };
        });
        actualizar();
      },
    );

    return () => {
      unsubEmpleados();
      unsubPresencia();
    };
  }, [ownerBase]);

  useEffect(() => {
    const timer = setInterval(() => setPresenciaAhora(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

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
      if (empleadosRef.current && !empleadosRef.current.contains(event.target)) {
        setPanelEmpleadosAbierto(false);
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
    } catch (e) {
      console.error("Error al cerrar sesion:", e);
    } finally {
      setCerrandoSesion(false);
      window.location.replace("/");
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
          {nombreEmpresa || "LuisITRepair"}
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
                  className={({ isActive }) => {
                    if (item.adminHome) {
                      return `nav-link${location.pathname === "/home" && !location.search ? " active" : ""}`;
                    }
                    if (item.restaurantView) {
                      const currentView = new URLSearchParams(location.search).get("vista")
                        || vistaRestaurantePorRol
                        || "";
                      return `nav-link${location.pathname === "/home" && currentView === item.restaurantView ? " active" : ""}`;
                    }
                    return `nav-link${isActive ? " active" : ""}`;
                  }}
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
                  <i className="fi fi-br-bell navbar-tool-icon" aria-hidden="true" />
                  {noLeidas > 0 && <span className="bell-badge">{noLeidas}</span>}
                </button>

                {panelAbierto && (
                  <div className="notification-panel">
                      <div className="notification-panel-header">
                        <div className="notification-panel-header-actions">
                          <strong>Notificaciones</strong>
                          <span>{notificaciones.length}</span>
                        </div>
                      <button
                        type="button"
                        className="notification-panel-close"
                        aria-label="Cerrar panel de notificaciones"
                        onClick={togglePanelNotificaciones}
                      >
                        ×
                      </button>
                    </div>

                    {notificaciones.length === 0 && (
                      <p className="notification-panel-empty">Sin notificaciones.</p>
                    )}

                    {notificaciones.slice(0, 12).map((n) => (
                      <div key={n.id} className={`notification-panel-item ${n.nivel || "baja"}`}>
                        <div className="notification-panel-item-head">
                          <p className="notification-panel-title">{n.titulo}</p>
                          <button
                            type="button"
                            className="notification-panel-close"
                            aria-label={`Cerrar notificacion ${n.titulo}`}
                            onClick={() => onDismissNotification(n.id)}
                          >
                            ×
                          </button>
                        </div>
                        <p className="notification-panel-detail">{n.detalle}</p>
                        <span className="notification-panel-time">{formatoHora(n.fecha)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div ref={empleadosRef} className="position-relative">
              <button
                type="button"
                className="btn btn-light btn-sm rounded-circle employees-btn"
                onClick={() => {
                  setPanelEmpleadosAbierto((abierto) => !abierto);
                  setMenuUsuarioAbierto(false);
                }}
                title="Empleados activos"
                aria-label="Mostrar empleados activos"
                aria-expanded={panelEmpleadosAbierto}
              >
                <i className="fi fi-br-users-alt navbar-tool-icon" aria-hidden="true" />
              </button>

              {panelEmpleadosAbierto && (
                <div className="employees-panel">
                  <div className="employees-panel-header">
                    <strong>Empleados activos</strong>
                    <span>{empleadosActivos.length}</span>
                  </div>

                  <ul>
                    {empleadosActivos.map((empleado) => {
                      const online =
                        empleado.online &&
                        presenciaAhora - toMillis(empleado.lastActive) <= PRESENCE_TTL_MS;

                      return (
                        <li key={empleado.id}>
                          <span>{empleado.nombre}</span>
                          <span className={online ? "employees-online" : "employees-offline"}>
                            {online ? "En línea" : "Offline"}
                          </span>
                        </li>
                      );
                    })}

                    {empleadosActivos.length === 0 && (
                      <li className="employees-panel-empty">Sin empleados activos</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div
              ref={menuUsuarioRef}
              className="position-relative"
            >
              <button
                type="button"
                className="btn btn-light btn-sm rounded-circle user-menu-trigger"
                onClick={() => {
                  setMenuUsuarioAbierto((v) => !v);
                  setPanelEmpleadosAbierto(false);
                }}
                title={usuarioNombre}
              >
                <i className="fi fi-br-user navbar-tool-icon" aria-hidden="true" />
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
