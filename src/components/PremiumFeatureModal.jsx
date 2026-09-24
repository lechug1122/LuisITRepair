import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FiStar } from "react-icons/fi";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { resolvePremiumDestination } from "../js/services/premium_config";
import "../css/premium_feature.css";

/**
 * Aviso reutilizable para una funcion que pertenece a CajaLibre Premium.
 *
 * Solo describe la funcion y lleva al flujo de compra que ya existe; nunca
 * crea uno nuevo. Se abre unicamente cuando la persona intenta usar la
 * funcion, no al entrar a la pantalla.
 */
export default function PremiumFeatureModal({
  abierto = false,
  titulo = "Funcion Premium",
  mensaje = "",
  textoPrincipal = "Conocer Premium",
  textoSecundario = "Cancelar",
  onCerrar,
}) {
  const navigate = useNavigate();
  const authInfo = useAutorizacionActual();
  const dialogo = useRef(null);
  const botonPrincipal = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    botonPrincipal.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (anterior?.isConnected) anterior.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  const alTeclear = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCerrar?.();
      return;
    }
    if (event.key !== "Tab") return;

    const foco = dialogo.current?.querySelectorAll("button") || [];
    if (!foco.length) return;

    const primero = foco[0];
    const ultimo = foco[foco.length - 1];
    if (event.shiftKey && document.activeElement === primero) {
      event.preventDefault();
      ultimo.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primero.focus();
    }
  };

  const irAPremium = () => {
    onCerrar?.();
    navigate(resolvePremiumDestination(authInfo));
  };

  return (
    <div
      className="premium-feature-overlay"
      onClick={onCerrar}
      onKeyDown={alTeclear}
      role="presentation"
    >
      <section
        ref={dialogo}
        className="premium-feature-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-feature-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="premium-feature-pill">
          <FiStar aria-hidden="true" /> Premium
        </span>
        <h2 id="premium-feature-titulo">{titulo}</h2>
        <p>{mensaje}</p>

        <div className="premium-feature-actions">
          <button
            ref={botonPrincipal}
            type="button"
            className="premium-feature-btn premium-feature-btn-primary"
            onClick={irAPremium}
          >
            {textoPrincipal}
          </button>
          <button
            type="button"
            className="premium-feature-btn premium-feature-btn-soft"
            onClick={onCerrar}
          >
            {textoSecundario}
          </button>
        </div>
      </section>
    </div>
  );
}
