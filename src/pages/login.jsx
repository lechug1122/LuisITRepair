import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "../initializer/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import "../css/login.scss";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const user = userCredential.user;

      // 🔥 Verificar si está en autorizados
      const docRef = doc(db, "autorizados", user.uid);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        await signOut(auth);
        setError("Usuario no autorizado.");
        return;
      }

      const data = snap.data();

      // 🔥 Verificar si está activo
      if (!data.activo) {
        await signOut(auth);
        setError("Usuario inactivo. Contacte al administrador.");
        return;
      }

      // 🔥 Marcar como en línea
      await updateDoc(docRef, {
        online: true,
        lastActive: new Date(),
      });

      // 🔥 Guardar rol en localStorage (opcional)
      localStorage.setItem("rol", data.rol);

      // ✅ Redirigir
      navigate("/home", { replace: true });

    } catch (err) {
      setError("Credenciales incorrectas.");
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
            Bienvenido a <span>LuisITRepairControl</span>
          </h4>

          <p>
            Esta sección es solo para usuarios autorizados.
          </p>

          <div className="floating-label">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label>Correo:</label>
          </div>

          <div className="floating-label">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label>Contraseña:</label>
          </div>

          <button type="submit">Iniciar Sesión</button>

          {error && (
            <p style={{ color: "crimson", marginTop: "12px" }}>
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}