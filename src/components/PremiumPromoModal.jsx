import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FiCheck, FiHeart, FiStar, FiX } from "react-icons/fi";
import logo from "../assets/logo.png";
import apoyo from "../assets/apoyo.png";
import usePremiumPromo from "../hooks/usePremiumPromo";
import "../css/premium-promo.css";

const BENEFICIOS_FREE = [
  "Ventas y punto de venta",
  "Control de inventario",
  "Gestión de clientes",
  "Reportes básicos",
  "Funciones principales de CajaLibre",
  "Actualizaciones principales",
];

const BENEFICIOS_PREMIUM = [
  { titulo: "Sin publicidad", detalle: "Disfruta del sistema sin anuncios." },
  { titulo: "Soporte preferente", detalle: "Atención más rápida y personalizada." },
  { titulo: "Logo de tu negocio", detalle: "Personaliza CajaLibre con el logo de tu negocio." },
  { titulo: "Funciones adicionales", detalle: "Accede a nuevas herramientas y funciones adicionales." },
  { titulo: "Usuarios ilimitados", detalle: "Todo tu equipo, sin restricciones." },
];

/**
 * Aviso de planes CajaLibre Free / Premium.
 *
 * Toda la decision de "quien lo ve y cada cuando" vive en `usePremiumPromo`;
 * aqui solo queda la presentacion y la accesibilidad del dialogo.
 */
export default function PremiumPromoModal({ authInfo, bloqueado = false }) {
  const navigate = useNavigate();
  const { abierto, cerrar, destinoPremium } = usePremiumPromo(authInfo, { bloqueado });
  const dialogo = useRef(null);
  const botonCerrar = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    botonCerrar.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (anterior?.isConnected) anterior.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  const alTeclear = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      cerrar();
      return;
    }
    if (event.key !== "Tab") return;
    const foco = dialogo.current?.querySelectorAll("button, a[href]") || [];
    if (!foco.length) return;
    const primero = foco[0];
    const ultimo = foco[foco.length - 1];
    if (event.shiftKey && document.activeElement === primero) {
      event.preventDefault();
      ultimo.focus();
    }
    if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primero.focus();
    }
  };

  const apoyar = () => {
    cerrar();
    navigate(destinoPremium);
  };

  // Donacion voluntaria: reutiliza la pagina que ya existe para el plan gratuito.
  const donar = () => {
    cerrar();
    navigate("/configuracion/donacion");
  };

  return (
    <div className="promo-overlay" onClick={cerrar} onKeyDown={alTeclear} role="presentation">
      <section
        ref={dialogo}
        className="promo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-premium-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={botonCerrar}
          type="button"
          className="promo-cerrar"
          onClick={cerrar}
          aria-label="Cerrar planes de CajaLibre"
        >
          <FiX />
        </button>

        <div className="promo-grid">
          <header className="promo-intro">
            <img className="promo-logo" src={logo} alt="CajaLibre" />
            <h2 id="promo-premium-titulo">¡Gracias por ser parte de <span>CajaLibre!</span></h2>
            <p>
              Siempre vamos a procurar que CajaLibre tenga una opción gratuita.
              Tu apoyo nos ayuda a mantener el sistema, mejorarlo y seguir
              desarrollando nuevas funciones para todos.
            </p>
            <p className="promo-destacado">
              <FiHeart aria-hidden="true" />
              <strong>Tu apoyo hoy hace posible un mejor sistema mañana.</strong>
            </p>
            <img className="promo-ilustracion" src={apoyo} alt="Técnico de CajaLibre agradeciendo tu apoyo" />
            <span className="promo-firma">Juntos hacemos más.</span>
          </header>

          <article className="promo-plan promo-plan-free">
            <span className="promo-plan-badge">GRATIS</span>
            <span className="promo-plan-icono"><FiCheck aria-hidden="true" /></span>
            <h3>CajaLibre Free</h3>
            <p className="promo-plan-sub">Siempre gratuito</p>
            <p className="promo-plan-texto">
              Todas las funciones esenciales para que puedas gestionar tu negocio sin costo.
            </p>
            <ul>
              {BENEFICIOS_FREE.map((item) => (
                <li key={item}><FiCheck aria-hidden="true" /><span>{item}</span></li>
              ))}
            </ul>
            <button type="button" className="promo-donar" onClick={donar}>
              <FiHeart aria-hidden="true" /> Donar
            </button>
            <p className="promo-plan-nota">
              Este plan siempre estará disponible.
              Gracias por usar y confiar en CajaLibre.
            </p>
          </article>

          <article className="promo-plan promo-plan-premium">
            <span className="promo-plan-icono"><FiStar aria-hidden="true" /></span>
            <h3>CajaLibre Premium</h3>
            <p className="promo-plan-sub">Más beneficios para ti y todo tu equipo.</p>
            <strong className="promo-precio">$300 <small>MXN / mes</small></strong>
            <p className="promo-plan-texto">Una suscripción por negocio, con usuarios ilimitados.</p>
            <ul>
              {BENEFICIOS_PREMIUM.map((item) => (
                <li key={item.titulo}>
                  <FiCheck aria-hidden="true" />
                  <span><strong>{item.titulo}</strong>{item.detalle}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <footer className="promo-footer">
          <button type="button" className="promo-apoyar" onClick={apoyar}>
            <FiHeart aria-hidden="true" /> Quiero apoyar el proyecto
          </button>
          <button type="button" className="promo-ahora-no" onClick={cerrar}>
            Ahora no, gracias
          </button>
          <small>Conoce Premium antes de decidir. Este botón no realiza ningún cobro.</small>
        </footer>
      </section>
    </div>
  );
}
