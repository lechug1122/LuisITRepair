import React, { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../initializer/firebase";
import "../css/configuracion.css";
import UpdateModal from "../components/UpdateModal";


function Configuracion() {
  const navigate = useNavigate();
  const location = useLocation();

  const SYSTEM_VERSION = "1.3.0";

  const [showUpdate, setShowUpdate] = useState(false);
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
    { name: "Métodos de Pago", path: "/configuracion/metodos" },
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

    const ref = doc(db, "autorizados", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) return;

    const data = snap.data();

    // 🔥 SOLO ADMINISTRADOR
    if (data.rol !== "Administrador") return;

    // 🔥 SOLO SI NO HA VISTO ESTA VERSION
    if (data.versionVista !== SYSTEM_VERSION) {
      setShowUpdate(true);
    }
  });

  return () => unsubscribe();
}, []);

  // 🔥 Cerrar modal y guardar versión vista
  const handleCloseUpdate = async () => {
    const user = auth.currentUser;
    if (!user) return;

    await updateDoc(doc(db, "autorizados", user.uid), {
      versionVista: SYSTEM_VERSION,
    });

    setShowUpdate(false);
  };

  // 🔥 Escuchar empleados activos
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "empleados"), (snapshot) => {
      const activos = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((emp) => emp.estado === "Activo");

      setEmpleadosActivos(activos);
    });

    return () => unsub();
  }, []);

  // 🔥 Escuchar estado online
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "autorizados"), (snapshot) => {
      const onlineMap = {};
      snapshot.docs.forEach((doc) => {
        onlineMap[doc.id] = doc.data().online || false;
      });

      setEmpleadosActivos((prev) =>
        prev.map((emp) => ({
          ...emp,
          online: onlineMap[emp.uid] || false,
        }))
      );
    });

    return () => unsub();
  }, []);

  // 🔥 Estadísticas
  useEffect(() => {
    const unsubVentas = onSnapshot(collection(db, "ventas"), (snap) => {
      let total = 0;
      snap.docs.forEach((doc) => {
        total += doc.data().total || 0;
      });
      setStats((prev) => ({ ...prev, ventas: total }));
    });

    const unsubClientes = onSnapshot(collection(db, "clientes"), (snap) => {
      setStats((prev) => ({ ...prev, clientes: snap.size }));
    });

    const unsubServicios = onSnapshot(collection(db, "servicios"), (snap) => {
      setStats((prev) => ({ ...prev, servicios: snap.size }));
    });

    return () => {
      unsubVentas();
      unsubClientes();
      unsubServicios();
    };
  }, []);

  // 🔥 Cerrar sesión
  const handleLogout = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      await updateDoc(doc(db, "autorizados", user.uid), {
        online: false,
      });

      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  return (
    <>
      {showUpdate && (
        <UpdateModal onClose={handleCloseUpdate} />
      )}

      <div className="cfg-layout">
        {/* SIDEBAR */}
        <aside className="cfg-sidebar">
          <h3>⚙ Configuración</h3>
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

        {/* MAIN */}
        <main className="cfg-main">
          <Outlet />
        </main>

        {/* PANEL DERECHO */}
        <aside className="cfg-right">
          <div className="stats">
            <h4>📊 Estadísticas</h4>
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
            <h4>👥 Empleados Activos</h4>
            <ul>
              {empleadosActivos.map((emp) => (
                <li key={emp.id}>
                  {emp.nombre}
                  <span className={emp.online ? "online" : "offline"}>
                    {emp.online ? "En línea" : "Offline"}
                  </span>
                </li>
              ))}
            </ul>

            <button
              className="btn-logout-right"
              onClick={handleLogout}
            >
              🔒 Cerrar Sesión
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

export default Configuracion;