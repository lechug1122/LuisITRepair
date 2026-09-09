import { useEffect, useRef, useState } from "react";
import "../css/ad_panel.css";

// Adsterra necesita leer/escribir su propia cookie (control de frecuencia,
// antifraude) o invoke.js truena con SecurityError. Un iframe con srcDoc no
// tiene un origen propio: si le damos allow-same-origin ahi, hereda el
// origen del documento padre y Adsterra quedaria con acceso total a
// CajaLibre (cookies, localStorage, sesion). Por eso el anuncio se sirve
// desde un sitio de Hosting aparte (origen realmente distinto): asi
// allow-same-origin solo le da acceso a ESE origen aislado, nunca al de la
// app. No apuntar esto nunca a una URL del mismo dominio que CajaLibre.
const AD_FRAME_ORIGIN = "https://cajalibre-ads.web.app";

export default function AdPanel({ placement = "dashboard" }) {
  const frame = useRef(null);
  const [status, setStatus] = useState("loading");
  const adPlacement = placement === "dashboard" ? "dashboard" : "settings";
  const width = adPlacement === "dashboard" ? 160 : 300;
  const height = adPlacement === "dashboard" ? 600 : 250;
  useEffect(() => {
    let cancelado = false;
    const timeout = window.setTimeout(() => {
      if (!cancelado) setStatus("failed");
    }, 6000);
    const receive = (event) => {
      if (cancelado || event.origin !== AD_FRAME_ORIGIN || event.source !== frame.current?.contentWindow) return;
      if (event.data === "cajalibre-ad-ready") { clearTimeout(timeout); setStatus("ready"); }
      if (event.data === "cajalibre-ad-error") { clearTimeout(timeout); setStatus("failed"); }
    };
    window.addEventListener("message", receive);
    return () => {
      cancelado = true;
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
  }, [adPlacement]);
  const src = `${AD_FRAME_ORIGIN}/ad-frame.html?placement=${adPlacement}`;
  const handleLoad = () => {
    if (import.meta.env.DEV) {
      console.log(`[ADS] iframe ${adPlacement} cargado`);
      console.log("[ADS] iframe src:", src);
    }
  };
  // El espacio publicitario permanece montado y con el mismo tamano siempre:
  // si el proveedor falla, tarda o esta bloqueado, se conserva UNICAMENTE la
  // etiqueta "Publicidad" (sin un segundo texto/placeholder) para no generar
  // saltos de layout ni duplicar el aviso al navegar.
  return (
    <aside
      className={`ad-panel ad-panel--${adPlacement} ad-panel--${status}`}
      style={{ width: width + 2, height: height + 42 }}
      aria-label="Publicidad"
    >
      <span className="ad-panel-label">Publicidad</span>
      <iframe
        key={adPlacement}
        ref={frame}
        title="Anuncio"
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        src={src}
        width={width}
        height={height}
        className="ad-frame"
        onLoad={handleLoad}
      />
    </aside>
  );
}
