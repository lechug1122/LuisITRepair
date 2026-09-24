import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiAlertCircle } from "react-icons/fi";

import { consultarOrdenAceptacion } from "../js/services/servicio_aceptacion";
import "../css/servicio_modulo.css";
import "../css/aceptacion_orden.css";

/**
 * Compatibilidad con los enlaces `/aceptar/...` ya enviados.
 *
 * La aceptacion NO vive en una pantalla aparte: el cliente firma dentro de su
 * propio vale, junto a las fotografias, la boleta y el PDF. Mantener aqui un
 * segundo formulario significaba dos pantallas que se contradicen en cuanto
 * una cambia, asi que esta ruta solo traduce el enlace viejo al folio y abre
 * el vale en la seccion de la firma.
 */
export default function AceptacionOrden() {
  const { referencia } = useParams();
  const navigate = useNavigate();
  const [fallo, setFallo] = useState("");

  useEffect(() => {
    let vigente = true;
    consultarOrdenAceptacion(referencia).then((datos) => {
      if (!vigente) return;
      const folio = datos?.orden?.folio;
      if (!folio) {
        setFallo("Este enlace no es válido o ya no está disponible.");
        return;
      }
      navigate(
        `/status/${encodeURIComponent(folio)}?aceptacion=${encodeURIComponent(referencia)}#aceptacion-cliente`,
        { replace: true },
      );
    }).catch((error) => {
      console.error("[aceptacion] No se pudo abrir la orden:", error);
      if (vigente) setFallo(error?.message || "Este enlace no es válido o ya no está disponible.");
    });
    return () => { vigente = false; };
  }, [navigate, referencia]);

  if (fallo) {
    return (
      <main className="sv-modulo ao-pagina ao-centrada">
        <section className="ao-aviso ao-aviso--error">
          <span className="ao-aviso-icono" aria-hidden="true"><FiAlertCircle /></span>
          <h1>No pudimos abrir esta orden</h1>
          <p>{fallo}</p>
          <p className="ao-aviso-pie">Contacta al negocio para que te envíe un enlace nuevo.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="sv-modulo ao-pagina ao-centrada">
      <div className="ao-cargando" role="status">
        <span className="ao-spinner" aria-hidden="true" />
        Abriendo tu orden de servicio…
      </div>
    </main>
  );
}
