import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../initializer/firebase";
import UpdateModal from "../components/UpdateModal";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import useMonedaConfig from "../hooks/useMonedaConfig";
import "../css/configuracion.css";

const SYSTEM_VERSION = "1.9";
const PRESENCE_TTL_MS = 2 * 60 * 1000;
const SUPPORT_PHONE = "2731430147";
const SUPPORT_EMAIL = "luisitrepairhuatusco@gmail.com";
const SUPPORT_WHATSAPP_URL = `https://wa.me/52${SUPPORT_PHONE}?text=${encodeURIComponent(
  "Hola, necesito ayuda con el sistema.",
)}`;
const SUPPORT_MAILTO_URL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "Soporte del sistema",
)}&body=${encodeURIComponent("Hola, necesito ayuda con el sistema.")}`;

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

export default function Configuracion() {
  const navigate = useNavigate();
  const location = useLocation();
  const enSubSeccion = location.pathname !== "/configuracion";
  const ocultarPanelLateral =
    location.pathname === "/configuracion/suscripciones" ||
    location.pathname === "/configuracion/mi-suscripcion";
  const { serviciosHabilitados } = useEmpresaConfig();
  const { formatCurrency } = useMonedaConfig();
  const { superAdmin, cuentaPrincipalUid, suscripcionControlada, uid } = useAutorizacionActual();
  const ownerBase = cuentaPrincipalUid || uid;
  const esTitularSuscripcion =
    superAdmin !== true &&
    suscripcionControlada === true &&
    String(uid || "").trim() !== "" &&
    String(uid || "").trim() === String(cuentaPrincipalUid || "").trim();

  const [showUpdate, setShowUpdate] = useState(false);
  const [presenciaAhora, setPresenciaAhora] = useState(() => Date.now());
  const [empleadosActivos, setEmpleadosActivos] = useState([]);
  const [stats, setStats] = useState({
    ventas: 0,
    clientes: 0,
    servicios: 0,
  });

  const menuItems = [
    { name: "Panel General", path: "/configuracion" },
    { name: "Empresa", path: "/configuracion/empresa" },
    { name: "Proveedores", path: "/configuracion/proveedores" },
    { name: "Empleados", path: "/configuracion/empleados" },
    ...(superAdmin ? [{ name: "Suscripciones", path: "/configuracion/suscripciones" }] : []),
    ...(esTitularSuscripcion
      ? [{ name: "Mi Suscripcion", path: "/configuracion/mi-suscripcion" }]
      : []),
    { name: "POS", path: "/configuracion/pos" },
    { name: "Inventario", path: "/configuracion/inventario" },
    {
      name: serviciosHabilitados ? "Servicios" : "Canjes y fidelidad",
      path: "/configuracion/servicios",
    },
    { name: "Metodos de Pago", path: "/configuracion/metodos" },
    { name: "Apariencia", path: "/configuracion/apariencia" },
    { name: "Notificaciones", path: "/configuracion/notificaciones" },
    { name: "Impresoras", path: "/configuracion/impresoras" },
    // { name: "Respaldos", path: "/configuracion/respaldos" },
    // { name: "Seguridad", path: "/configuracion/seguridad" },
    // { name: "Integraciones", path: "/configuracion/integraciones" },
  ];

  const empleadosActivosVisibles = useMemo(() => {
    if (!ownerBase) return [];

    return empleadosActivos.filter((emp) => {
      const owner = String(emp?.cuentaPrincipalUid || emp?.uid || "").trim();
      return owner === ownerBase;
    });
  }, [empleadosActivos, ownerBase]);

  const statsVisibles = useMemo(() => {
    if (!ownerBase) return { ventas: 0, clientes: 0, servicios: 0 };
    return {
      ventas: stats.ventas,
      clientes: stats.clientes,
      servicios: serviciosHabilitados ? stats.servicios : 0,
    };
  }, [ownerBase, serviciosHabilitados, stats.clientes, stats.servicios, stats.ventas]);

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
    if (!ownerBase) return undefined;

    const unsub = onSnapshot(
      query(collection(db, "empleados"), where("cuentaPrincipalUid", "==", ownerBase)),
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
  }, [ownerBase]);

  useEffect(() => {
    const t = setInterval(() => setPresenciaAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ownerBase) return undefined;

    const unsub = onSnapshot(
      query(collection(db, "autorizados"), where("cuentaPrincipalUid", "==", ownerBase)),
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
  }, [ownerBase]);

  useEffect(() => {
    if (!ownerBase) return undefined;

    const unsubVentas = onSnapshot(
      query(collection(db, "ventas"), where("cuentaPrincipalUid", "==", ownerBase)),
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
      query(collection(db, "clientes"), where("cuentaPrincipalUid", "==", ownerBase)),
      (snap) => {
        setStats((prev) => ({ ...prev, clientes: snap.size }));
      },
      (error) => {
        logSnapshotError("clientes", error);
      },
    );

    let unsubServicios = () => {};
    if (serviciosHabilitados) {
      unsubServicios = onSnapshot(
        query(collection(db, "servicios"), where("cuentaPrincipalUid", "==", ownerBase)),
        (snap) => {
          setStats((prev) => ({ ...prev, servicios: snap.size }));
        },
        (error) => {
          logSnapshotError("servicios", error);
        },
      );
    }

    return () => {
      unsubVentas();
      unsubClientes();
      unsubServicios();
    };
  }, [ownerBase, serviciosHabilitados]);

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

      <div className={`cfg-layout ${ocultarPanelLateral ? "cfg-layout-no-right" : ""}`}>
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

        <main className={`cfg-main ${ocultarPanelLateral ? "cfg-main-no-right" : ""}`}>
          {enSubSeccion && (
            <div className="cfg-back-row">
              <button
                type="button"
                className="cfg-back-btn"
                onClick={() => navigate("/configuracion")}
              >
                Volver a Configuracion
              </button>
            </div>
          )}
          <Outlet />
        </main>

        {!ocultarPanelLateral && (
          <aside className="cfg-right">
            <div className="stats">
              <h4>Estadisticas</h4>
              <div className="stat">
                Ventas <strong>{formatCurrency(statsVisibles.ventas)}</strong>
              </div>
              {serviciosHabilitados && (
                <div className="stat">
                  Servicios <strong>{statsVisibles.servicios}</strong>
                </div>
              )}
              <div className="stat">
                Clientes <strong>{statsVisibles.clientes}</strong>
              </div>
            </div>

            <div className="empleados-activos">
              <h4>Empleados Activos</h4>
              <ul>
                {empleadosActivosVisibles.map((emp) => {
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

                {empleadosActivosVisibles.length === 0 && (
                  <li>
                    <span>Sin empleados activos</span>
                    <span className="offline">-</span>
                  </li>
                )}
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

            <div className="cfg-help-card">
              <div className="cfg-help-head">
                <h4>Ayuda</h4>
                <span>Soporte directo</span>
              </div>

              <p className="cfg-help-text">
                Si necesitas apoyo con configuracion, errores o cambios del sistema, puedes
                contactarme por cualquiera de estos medios.
              </p>

              <div className="cfg-help-contact">
                <span>Telefono</span>
                <strong>{SUPPORT_PHONE}</strong>
              </div>

              <div className="cfg-help-contact">
                <span>Correo</span>
                <strong>{SUPPORT_EMAIL}</strong>
              </div>

              <div className="cfg-help-actions">
                <a
                  className="cfg-help-btn cfg-help-btn-whatsapp"
                  href={SUPPORT_WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir WhatsApp
                </a>

                <a
                  className="cfg-help-btn cfg-help-btn-mail"
                  href={SUPPORT_MAILTO_URL}
                >
                  Enviar correo
                </a>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
