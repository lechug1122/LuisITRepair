import { useNavigate } from "react-router-dom";
import "../css/notfound.css";
import img404 from "../assets/404_not_found.png";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="notfound-page">
      <div className="notfound-card">
        <img
          src={img404}
          alt="Página no encontrada"
          className="notfound-img"
        />

        <h1 className="notfound-code">404</h1>
        <h2 className="notfound-title">Página no encontrada</h2>

        <p className="notfound-text">
          La página que buscas no existe o fue movida.
        </p>

        <div className="notfound-actions">
          <button className="btn-primary" onClick={() => navigate("/")}>
            Ir al inicio
          </button>

          <button className="btn-light" onClick={() => navigate(-1)}>
            Volver atrás
          </button>
        </div>
      </div>
    </div>
  );
}
