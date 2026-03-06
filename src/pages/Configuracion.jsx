import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../initializer/firebase";
import UpdateModal from "../components/UpdateModal";
import "../css/configuracion.css";

const SYSTEM_VERSION = "1.5.0";
const PRESENCE_TTL_MS = 2 * 60 * 1000;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function estaEnLineaReciente(online, lastActive, ahoraMs = Date.now()) {
  if (!online) return false;
  const lastMs = toMillis(lastActive);
  if (!lastMs) return false;
  return ahoraMs - lastMs <= PRESENCE_TTL_MS;
}

function logSnapshotError(scope, error) {
  console.warn(
    `[configuracion] No se pudo leer ${scope}:`,
    error?.code || error,
  );
}

function Configuracion() {
  const navigate = useNavigate();
  const location = useLocation();
  const enSubSeccion = location.pathname !== "/configuracion";

  const [showUpdate, setShowUpdate] = useState(false);
  const [presenciaAhora, setPresenciaAhora] = useState(Date.now());
  const [empleadosActivos, setEmpleadosActivos] = useState([]);
  const [stats, setStats] = useState({
    ventas: 0,
    clientes: 0,
    servicios: 0,
  });

  const menuItems = [
    { name: "Panel General", path: "/configuracion" },
    { name: "Empresa", path: "/configuracion/empresa" },
    { name: "Empleados", path: "/configuracion/empleados" },
    { name: "Roles y Permisos", path: "/configuracion/roles" },
    { name: "POS", path: "/configuracion/pos" },
    { name: "Inventario", path: "/configuracion/inventario" },
    { name: "Servicios", path: "/configuracion/servicios" },
    { name: "Metodos de Pago", path: "/configuracion/metodos" },
    { name: "Impresoras", path: "/configuracion/impresoras" },
    { name: "Apariencia", path: "/configuracion/apariencia" },
    { name: "Notificaciones", path: "/configuracion/notificaciones" },
    { name: "Respaldos", path: "/configuracion/respaldos" },
    { name: "Seguridad", path: "/configuracion/seguridad" },
    { name: "Integraciones", path: "/configuracion/integraciones" },
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "autorizados", user.uid));
        if (!snap.exists()) return;

        const data = snap.data();
        if (data.rol !== "Administrador") return;

        if (data.versionVista !== SYSTEM_VERSION) {
          setShowUpdate(true);
        }
      } catch (error) {
        console.warn(
          "[configuracion] No se pudo validar version:",
          error?.code || error,
        );
      }
    });

    return () => unsubscribe();
  }, []);

  const handleCloseUpdate = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await updateDoc(doc(db, "autorizados", user.uid), {
        versionVista: SYSTEM_VERSION,
      });
      setShowUpdate(false);
    } catch (error) {
      console.warn(
        "[configuracion] No se pudo guardar versionVista:",
        error?.code || error,
      );
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "empleados"),
      (snapshot) => {
        const activos = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((emp) => emp.estado === "Activo");

        setEmpleadosActivos(activos);
      },
      (error) => {
        logSnapshotError("empleados", error);
        setEmpleadosActivos([]);
      },
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setPresenciaAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "autorizados"),
      (snapshot) => {
        const onlineMap = {};
        snapshot.docs.forEach((item) => {
          const data = item.data() || {};
          onlineMap[item.id] = {
            online: data.online === true,
            lastActive: data.lastActive || null,
          };
        });

        setEmpleadosActivos((prev) =>
          prev.map((emp) => ({
            ...emp,
            online: onlineMap[emp.uid]?.online || false,
            lastActive: onlineMap[emp.uid]?.lastActive || null,
          })),
        );
      },
      (error) => {
        logSnapshotError("autorizados", error);
      },
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubVentas = onSnapshot(
      collection(db, "ventas"),
      (snap) => {
        let total = 0;
        snap.docs.forEach((item) => {
          total += item.data().total || 0;
        });
        setStats((prev) => ({ ...prev, ventas: total }));
      },
      (error) => {
        logSnapshotError("ventas", error);
      },
    );

    const unsubClientes = onSnapshot(
      collection(db, "clientes"),
      (snap) => {
        setStats((prev) => ({ ...prev, clientes: snap.size }));
      },
      (error) => {
        logSnapshotError("clientes", error);
      },
    );

    const unsubServicios = onSnapshot(
      collection(db, "servicios"),
      (snap) => {
        setStats((prev) => ({ ...prev, servicios: snap.size }));
      },
      (error) => {
        logSnapshotError("servicios", error);
      },
    );

    return () => {
      unsubVentas();
      unsubClientes();
      unsubServicios();
    };
  }, []);

  const handleLogout = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await updateDoc(doc(db, "autorizados", user.uid), {
        online: false,
      });
    } catch (error) {
      console.warn(
        "[configuracion] No se pudo actualizar presencia al cerrar sesion:",
        error?.code || error,
      );
    }

    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Error al cerrar sesion:", error);
    }
  };

  return (
    <>
      {showUpdate && <UpdateModal onClose={handleCloseUpdate} />}

      <div className="cfg-layout">
        <aside className="cfg-sidebar">
          <h3>Configuracion</h3>
          <div className="cfg-version-chip">Version v{SYSTEM_VERSION}</div>
          <ul>
            {menuItems.map((item) => (
              <li
                key={item.name}
                className={location.pathname === item.path ? "active" : ""}
                onClick={() => navigate(item.path)}
              >
                {item.name}
              </li>
            ))}
          </ul>
        </aside>

        <main className="cfg-main">
          {enSubSeccion && (
            <div className="cfg-back-row">
              <button
                type="button"
                className="cfg-back-btn"
                onClick={() => navigate("/configuracion")}
              >
                ← Volver a Configuracion
              </button>
            </div>
          )}
          <Outlet />
        </main>

        <aside className="cfg-right">
          <div className="stats">
            <h4>Estadisticas</h4>
            <div className="stat">
              Ventas <strong>${stats.ventas.toFixed(2)}</strong>
            </div>
            <div className="stat">
              Servicios <strong>{stats.servicios}</strong>
            </div>
            <div className="stat">
              Clientes <strong>{stats.clientes}</strong>
            </div>
          </div>

          <div className="empleados-activos">
            <h4>Empleados Activos</h4>
            <ul>
              {empleadosActivos.map((emp) => {
                const onlineReal = estaEnLineaReciente(
                  emp.online,
                  emp.lastActive,
                  presenciaAhora,
                );
                return (
                  <li key={emp.id}>
                    {emp.nombre}
                    <span className={onlineReal ? "online" : "offline"}>
                      {onlineReal ? "En linea" : "Offline"}
                    </span>
                  </li>
                );
              })}
            </ul>

            <button className="btn-logout-right" onClick={handleLogout}>
              Cerrar Sesion
            </button>
          </div>

          <div className="cfg-version-card">
            <h4>Version del sistema</h4>
            <div className="cfg-version-row">
              <span>Version actual</span>
              <strong>v{SYSTEM_VERSION}</strong>
            </div>
            <button
              type="button"
              className="cfg-version-btn"
              onClick={() => setShowUpdate(true)}
            >
              Ver novedades
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

export default Configuracion;
