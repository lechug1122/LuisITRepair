import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../css/cookie-consent.css";

// Se versiona la llave para que el aviso se muestre otra vez cuando cambia lo
// que comunica. Antes ofrecia aceptar o rechazar la publicidad, pero esa
// eleccion no se respetaba: los anuncios se cargaban igual. Ahora el aviso
// informa (la publicidad forma parte del plan gratuito) en vez de ofrecer una
// opcion inexistente, asi que quien ya habia respondido debe volver a verlo.
const STORAGE_KEY = "cajalibre_aviso_cookies_v2";

function faltaAvisar() {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch {
    // Sin acceso al almacenamiento no se puede saber si ya lo vio: se muestra.
    return true;
  }
}

export default function CookieConsent() {
  const [open, setOpen] = useState(faltaAvisar);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    const reopen = () => {
      setDetails(true);
      setOpen(true);
    };
    window.addEventListener("cajalibre:cookie-settings", reopen);
    return () => window.removeEventListener("cajalibre:cookie-settings", reopen);
  }, []);

  const confirmar = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "visto");
    } catch {
      // El aviso se oculta al menos durante la pagina actual.
    }
    setOpen(false);
    setDetails(false);
  };

  if (!open) return null;

  return (
    <div className="cookie-consent" role="dialog" aria-modal="true" aria-labelledby="cookie-title">
      <div className="cookie-consent-copy">
        <span className="cookie-consent-icon" aria-hidden="true">🍪</span>
        <div>
          <h2 id="cookie-title">Cookies y publicidad</h2>
          <p>
            Usamos almacenamiento necesario para que CajaLibre funcione. El plan
            gratuito muestra anuncios y el proveedor puede usar cookies para
            servirlos y medirlos. Con CajaLibre Premium no se muestran anuncios.
          </p>
          {details && (
            <div className="cookie-consent-details">
              <p><strong>Necesarias:</strong> seguridad, sesión y preferencias básicas; permanecen activas.</p>
              <p><strong>Publicidad y medición:</strong> los anuncios los sirve Adsterra desde un dominio independiente, aislado de tu sesión y de los datos de tu negocio. Puede usar cookies para servir, limitar y medir anuncios y detectar fraude.</p>
              <p><strong>Cómo desactivarlos:</strong> los anuncios forman parte del plan gratuito y ayudan a sostener el proyecto. Para usar CajaLibre sin anuncios, activa Premium.</p>
            </div>
          )}
          <div className="cookie-consent-links">
            <Link to="/privacidad">Política de privacidad</Link>
            <Link to="/cookies">Política de cookies</Link>
          </div>
        </div>
      </div>
      <div className="cookie-consent-actions">
        <button
          type="button"
          className="cookie-btn secondary"
          onClick={() => setDetails((value) => !value)}
        >
          {details ? "Ocultar" : "Más información"}
        </button>
        <button type="button" className="cookie-btn primary" onClick={confirmar}>
          Entendido
        </button>
      </div>
    </div>
  );
}
