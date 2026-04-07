import { useEffect, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";
import { auth, db } from "../initializer/firebase";
import { obtenerEstadoAutorizacion } from "../js/services/autorizacion";
import { obtenerEmpresa, readEmpresaConfigCache } from "../js/services/configure_empresa";
import { consumeDeviceConflictMessage } from "../js/services/device_sessions";
import "../css/login.scss";

function getFriendlyLoginError(error) {
  const code = String(error?.code || "").trim();
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found" ||
    code === "auth/invalid-email"
  ) {
    return "Credenciales incorrectas.";
  }

  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return "No se pudo validar tu acceso. Revisa permisos y reglas de Firestore.";
  }

  return String(error?.message || "").trim() || "No se pudo iniciar sesion.";
}

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeAccessMessage = String(location.state?.accessMessage || "").trim();
  const [nombreEmpresa, setNombreEmpresa] = useState(
    () => readEmpresaConfigCache().nombre || "LuisITRepair",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [storedAccessMessage] = useState(() => consumeDeviceConflictMessage());
  const accessMessage = routeAccessMessage || storedAccessMessage;

  const clearAccessMessage = () => {
    if (!routeAccessMessage) return;
    navigate(location.pathname, { replace: true, state: {} });
  };

  useEffect(() => {
    let mounted = true;

    obtenerEmpresa()
      .then((empresa) => {
        if (!mounted) return;
        const nombre = String(empresa?.nombre || "").trim();
        if (nombre) setNombreEmpresa(nombre);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearAccessMessage();
    setError("");

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      const user = userCredential.user;
      const estado = await obtenerEstadoAutorizacion(user.uid);
      if (!estado.permitido) {
        await signOut(auth);
        setError(estado.mensaje || "No tienes acceso a este sistema.");
        return;
      }

      const docRef = doc(db, "autorizados", user.uid);
      await updateDoc(docRef, {
        activo: true,
        online: true,
        lastActive: new Date(),
      }).catch(() => {});

      localStorage.setItem("rol", estado.autorizado?.rol || "");
      navigate("/home", { replace: true });
    } catch (error) {
      await signOut(auth).catch(() => {});
      setError(getFriendlyLoginError(error));
    }
  };

  return (
    <div className="login-page">
      <div className="session">
        <div className="left">
          <svg
            enableBackground="new 0 0 300 302.5"
            viewBox="0 0 300 302.5"
            xmlns="http://www.w3.org/2000/svg"
          >
            <style>{`.st0{fill:#fff;}`}</style>
            <path
              className="st0"
              d="m126 302.2c-2.3 0.7-5.7 0.2-7.7-1.2l-105-71.6c-2-1.3-3.7-4.4-3.9-6.7l-9.4-126.7c-0.2-2.4 1.1-5.6 2.8-7.2l93.2-86.4c1.7-1.6 5.1-2.6 7.4-2.3l125.6 18.9c2.3 0.4 5.2 2.3 6.4 4.4l63.5 110.1c1.2 2 1.4 5.5 0.6 7.7l-46.4 118.3c-0.9 2.2-3.4 4.6-5.7 5.3l-121.4 37.4z"
            />
          </svg>
        </div>

        <form className="log-in" autoComplete="off" onSubmit={handleSubmit}>
          <h4>
            Bienvenido a <span>{nombreEmpresa}</span>
          </h4>

          <p>Esta seccion es solo para usuarios autorizados.</p>

          <div className="floating-label">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                clearAccessMessage();
                setError("");
                setEmail(e.target.value);
              }}
              placeholder=" "
              autoComplete="email"
              required
            />
            <label>Correo:</label>
          </div>

          <div className="floating-label">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                clearAccessMessage();
                setError("");
                setPassword(e.target.value);
              }}
              placeholder=" "
              autoComplete="current-password"
              required
            />
            <label>Contrasena:</label>
          </div>

          <button type="submit">Iniciar sesion</button>

          {(error || accessMessage) && (
            <p style={{ color: "crimson", marginTop: "12px" }}>
              {error || accessMessage}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
