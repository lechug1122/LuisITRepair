import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/status.css";

export default function Status() {
  const [folio, setFolio] = useState("");
  const navigate = useNavigate();

  const handleBuscar = (event) => {
    event.preventDefault();
    const f = (folio || "").trim();
    if (!f) return;

    navigate(`/status/${encodeURIComponent(f)}`);
  };

  return (
    <main className="status-page status-page--centered">
      <section className="status-box status-entry">
        <div className="status-entry-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3M9 3h6v4H9zM8 12h8M8 16h5" /></svg></div>
        <span className="status-eyebrow">Seguimiento de servicio</span>
        <h1>¿Cómo va tu equipo?</h1>
        <p>Consulta el estado de tu servicio con el folio de tu ticket.</p>
        <form onSubmit={handleBuscar}>
          <label className="status-input-label" htmlFor="status-folio">Folio de servicio</label>
          <input
            type="text"
            id="status-folio"
            placeholder="Ej. del14092601"
            className="status-input"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-describedby="status-folio-help"
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
          />
          <p id="status-folio-help" className="status-input-help">Encuéntralo en tu hoja de servicio o ticket.</p>
          <div className="status-actions">
            <button className="status-button" type="submit">Consultar servicio</button>
            <button type="button" className="status-button status-button-secondary" onClick={() => navigate("/status/scan")}>Escanear QR</button>
          </div>
        </form>
        <div className="status-entry-foot">Consulta pública · No necesitas iniciar sesión.</div>
      </section>
    </main>
  );
}
