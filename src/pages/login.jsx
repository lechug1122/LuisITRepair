import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../initializer/firebase";
import "../css/login.scss"; // ⬅️ aquí va el CSS del diseño
import { useNavigate } from "react-router-dom"; // ✅ FALTABA

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

   try {
  await signInWithEmailAndPassword(auth, email.trim(), password);

  // ✅ redirige al home (o a donde quieras)
  navigate("/home", { replace: true });

} catch (err) {
  setError("Credenciales incorrectas o acceso no autorizado.");
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
            d="m126 302.2c-2.3 0.7-5.7 0.2-7.7-1.2l-105-71.6c-2-1.3-3.7-4.4-3.9-6.7l-9.4-126.7c-0.2-2.4 1.1-5.6 2.8-7.2l93.2-86.4c1.7-1.6 5.1-2.6 7.4-2.3l125.6 18.9c2.3 0.4 5.2 2.3 6.4 4.4l63.5 110.1c1.2 2 1.4 5.5 0.6 7.7l-46.4 118.3c-0.9 2.2-3.4 4.6-5.7 5.3l-121.4 37.4zm63.4-102.7c2.3-0.7 4.8-3.1 5.7-5.3l19.9-50.8c0.9-2.2 0.6-5.7-0.6-7.7l-27.3-47.3c-1.2-2-4.1-4-6.4-4.4l-53.9-8c-2.3-0.4-5.7 0.7-7.4 2.3l-40 37.1c-1.7 1.6-3 4.9-2.8 7.2l4.1 54.4c0.2 2.4 1.9 5.4 3.9 6.7l45.1 30.8c2 1.3 5.4 1.9 7.7 1.2l52-16.2z"
          />
        </svg>
      </div>

      <form className="log-in" autoComplete="off" onSubmit={handleSubmit}>
        <h4>
          Bienvenido a <span>LuisITRapairControl</span>
        </h4>
        <p>Bienvenido de nuevo. Esta sección es solo para administradores autorizados. Inicia sesión para continuar.</p>

        <div className="floating-label">
          <input
            placeholder="Email"
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
          <label htmlFor="email">Correo:</label>
        </div>

        <div className="floating-label">
          <input
            placeholder="Password"
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          <label htmlFor="password">Contraseña:</label>
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
