import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../initializer/firebase";
import Advertising from "../components/Advertising";
import UpdateModal from "../components/UpdateModal";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import "../css/configuracion.css";
import { hasAnalyticsAccess } from "../js/services/analytics_access";

const SYSTEM_VERSION = "2.1";
const SUPPORT_PHONE = "2731159520";
const SUPPORT_EMAIL = "cajalibre.puntodeventa@gmail.com";
const SUPPORT_WHATSAPP_URL = `https://wa.me/52${SUPPORT_PHONE}?text=${encodeURIComponent(
  "Hola, necesito ayuda con el sistema.",
)}`;
const SUPPORT_MAILTO_URL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "Soporte del sistema",
)}&body=${encodeURIComponent("Hola, necesito ayuda con el sistema.")}`;
const DONATION_WHATSAPP_URL = `https://wa.me/52${SUPPORT_PHONE}?text=${encodeURIComponent(
  "Hola, quiero apoyar CajaLibre con una donacion.",
)}`;

export default function Configuracion() {
  const navigate = useNavigate();
  const location = useLocation();
  const enSubSeccion = location.pathname !== "/configuracion";
  const ocultarPanelLateral =
    location.pathname === "/configuracion/suscripciones" ||
    location.pathname === "/configuracion/analitica" ||
    location.pathname === "/configuracion/mi-suscripcion" ||
    location.pathname === "/configuracion/pago-premium" ||
    location.pathname === "/configuracion/donacion";
  const { serviciosHabilitados, tipoNegocioActivo } = useEmpresaConfig();
  const { superAdmin, accesoAnalitica, cuentaPrincipalUid, uid, premiumState } = useAutorizacionActual();
  const esUsuarioGratuito = premiumState === "free";
  const analyticsAccess = hasAnalyticsAccess({
    superAdmin,
    accesoAnalitica,
    email: auth.currentUser?.email,
  });
  const esAdministradorNegocio =
    superAdmin !== true &&
    String(uid || "").trim() !== "" &&
    String(uid || "").trim() === String(cuentaPrincipalUid || "").trim();

  const [showUpdate, setShowUpdate] = useState(false);

  const menuItems = [
    { name: "Panel General", path: "/configuracion" },
    { name: "Empresa", path: "/configuracion/empresa" },
    ...(tipoNegocioActivo?.id !== "restaurante"
      ? [{ name: "Proveedores", path: "/configuracion/proveedores" }]
      : []),
    { name: "Empleados", path: "/configuracion/empleados" },
    ...(analyticsAccess
      ? [{ name: "Administracion", path: "/configuracion/suscripciones" }]
      : []),
    ...(esAdministradorNegocio
      ? [
        { name: "Mi Plan", path: "/configuracion/mi-suscripcion" },
        { name: "Pago Premium", path: "/configuracion/pago-premium" },
      ]
      : []),
    { name: "POS", path: "/configuracion/pos" },
    ...(tipoNegocioActivo?.id === "restaurante"
      ? [{ name: "Restaurante", path: "/configuracion/restaurante" }]
      : []),
    { name: tipoNegocioActivo?.id === "restaurante" ? "Platillos" : "Inventario", path: "/configuracion/inventario" },
    ...(tipoNegocioActivo?.id !== "restaurante" ? [{
      name: serviciosHabilitados ? "Servicios" : "Canjes y fidelidad",
      path: "/configuracion/servicios",
    }] : []),
    { name: "Metodos de Pago", path: "/configuracion/metodos" },
    { name: "Apariencia", path: "/configuracion/apariencia" },
    { name: "Notificaciones", path: "/configuracion/notificaciones" },
    { name: "Impresoras", path: "/configuracion/impresoras" },
    ...(esUsuarioGratuito
      ? [{ name: "Donacion", path: "/configuracion/donacion" }]
      : []),
    // { name: "Respaldos", path: "/configuracion/respaldos" },
    // { name: "Seguridad", path: "/configuracion/seguridad" },
    // { name: "Integraciones", path: "/configuracion/integraciones" },
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

  const handleLogout = async () => {
    const user = auth.currentUser;

    try {
      if (!user) {
        window.location.replace("/");
        return;
      }
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
    } catch (error) {
      console.error("Error al cerrar sesion:", error);
    } finally {
      window.location.replace("/");
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
            {esUsuarioGratuito && <Advertising placement="settings" />}

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

                {esUsuarioGratuito && (
                  <a
                    className="cfg-help-btn cfg-help-btn-donation"
                    href={DONATION_WHATSAPP_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Donacion
                  </a>
                )}
              </div>
            </div>

            <button className="btn-logout-right" onClick={handleLogout}>
              Cerrar Sesion
            </button>
          </aside>
        )}
      </div>
    </>
  );
}
