import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../css/cookie-consent.css";

const STORAGE_KEY = "cajalibre_cookie_consent";

function updateGoogleConsent(accepted) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("consent", "update", {
    ad_storage: accepted ? "granted" : "denied",
    ad_user_data: accepted ? "granted" : "denied",
    ad_personalization: accepted ? "granted" : "denied",
    analytics_storage: accepted ? "granted" : "denied",
    functionality_storage: "granted",
    security_storage: "granted",
  });
  window.gtag("set", "ads_data_redaction", !accepted);
}

export default function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    try {
      setOpen(!localStorage.getItem(STORAGE_KEY));
    } catch {
      setOpen(true);
    }
    const reopen = () => {
      setDetails(true);
      setOpen(true);
    };
    window.addEventListener("cajalibre:cookie-settings", reopen);
    return () => window.removeEventListener("cajalibre:cookie-settings", reopen);
  }, []);

  const save = (accepted) => {
    try {
      localStorage.setItem(STORAGE_KEY, accepted ? "accepted" : "rejected");
    } catch {
      // La preferencia se conserva al menos durante la pagina actual.
    }
    updateGoogleConsent(accepted);
    setOpen(false);
    setDetails(false);
  };

  if (!open) return null;

  return (
    <div className="cookie-consent" role="dialog" aria-modal="true" aria-labelledby="cookie-title">
      <div className="cookie-consent-copy">
        <span className="cookie-consent-icon" aria-hidden="true">🍪</span>
        <div>
          <h2 id="cookie-title">Tu privacidad importa</h2>
          <p>
            Usamos almacenamiento necesario para que CajaLibre funcione. Con tu permiso,
            Google puede usar cookies y datos para mostrar y medir anuncios.
          </p>
          {details && (
            <div className="cookie-consent-details">
              <p><strong>Necesarias:</strong> seguridad, sesión y preferencias básicas; permanecen activas.</p>
              <p><strong>Publicidad y medición:</strong> Google AdSense y medición publicitaria; son opcionales.</p>
            </div>
          )}
          <div className="cookie-consent-links">
            <Link to="/privacidad">Política de privacidad</Link>
            <Link to="/cookies">Política de cookies</Link>
          </div>
        </div>
      </div>
      <div className="cookie-consent-actions">
        <button type="button" className="cookie-btn secondary" onClick={() => setDetails((value) => !value)}>
          {details ? "Ocultar" : "Configurar"}
        </button>
        <button type="button" className="cookie-btn secondary" onClick={() => save(false)}>Rechazar</button>
        <button type="button" className="cookie-btn primary" onClick={() => save(true)}>Aceptar</button>
      </div>
    </div>
  );
}
