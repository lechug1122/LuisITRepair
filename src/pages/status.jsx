import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/status.css";

export default function Status() {
  const [folio, setFolio] = useState("");
  const navigate = useNavigate();

  const handleBuscar = () => {
    const f = (folio || "").trim();
    if (!f) return;

    // ✅ abre la “ventana” (ruta) con el folio
    navigate(`/status/${encodeURIComponent(f)}`);
  };

  return (
    <div className="page-container">
      <div className="status-box">
        <h2>Consulta de servicio</h2>

        <input
          type="text"
          placeholder="Ingresa el folio del servicio"
          className="status-input"
          value={folio}
          onChange={(e) => setFolio(e.target.value)}
        />

      <div className="status-actions">
  <button className="status-button" onClick={handleBuscar}>
    Consultar
  </button>

  <button
    type="button"
    className="status-button status-button-secondary"
    onClick={() => navigate("/status/scan")}
  >
    Escanear QR
  </button>
</div>

      </div>
    </div>
  );
}
