import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../initializer/firebase";
import { RUTA_INICIO } from "../js/services/ruta_sesion";
import "../css/page_loader.css";

/**
 * Pantalla para los estados que no deben navegar solos: fallos reales de carga
 * (permisos de Firestore, red caida) y pantallas abiertas por un usuario al
 * que no le corresponden.
 *
 * Existe por dos razones. Primero, para que un error nunca se confunda con
 * "usuario sin negocio". Segundo, para que ninguna pantalla tenga que
 * redirigir por su cuenta: cualquier salto queda en manos del usuario, y un
 * click no puede provocar un bucle de navegacion.
 */
export default function AccesoErrorPanel({
  titulo = "No pudimos cargar tu cuenta",
  mensaje = "",
  mostrarReintentar = true,
  mostrarCerrarSesion = true,
  mostrarInicio = false,
}) {
  const navigate = useNavigate();

  const cerrarSesion = async () => {
    await signOut(auth).catch(() => {});
    window.location.replace("/login");
  };

  return (
    <div className="page-loader-wrap" role="alert" aria-live="assertive">
      <h2 style={{ margin: 0, fontSize: "1.25rem", textAlign: "center" }}>{titulo}</h2>
      <p className="page-loader-text" style={{ maxWidth: 520, textAlign: "center", fontWeight: 500 }}>
        {mensaje || "Ocurrio un problema al validar tu acceso. Intenta de nuevo en unos momentos."}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {mostrarInicio ? (
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => navigate(RUTA_INICIO, { replace: true })}
          >
            Ir al inicio
          </button>
        ) : null}
        {mostrarReintentar ? (
          <button type="button" className="btn btn-dark" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        ) : null}
        {mostrarCerrarSesion ? (
          <button type="button" className="btn btn-outline-secondary" onClick={cerrarSesion}>
            Cerrar sesion
          </button>
        ) : null}
      </div>
    </div>
  );
}
