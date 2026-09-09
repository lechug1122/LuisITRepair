import { useEffect, useRef } from "react";
import { FiCheck, FiHeart, FiStar, FiX } from "react-icons/fi";
import logo from "../assets/logo.png";
import "../css/modal-donacion.css";

const free = ["Ventas y punto de venta", "Control de inventario", "Gestión de clientes", "Reportes básicos", "Hasta 3 usuarios", "Soporte estándar", "Actualizaciones principales"];
const premium = ["Sin publicidad", "Usuarios ilimitados", "Soporte preferente", "Logo de tu negocio", "Funciones adicionales"];

export default function ModalDonacion({ abierto, onCerrar, onApoyar }) {
  const dialog = useRef(null);
  const close = useRef(null);
  useEffect(() => {
    if (!abierto) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [abierto]);
  if (!abierto) return null;
  const keyDown = event => {
    if (event.key === "Escape") { event.stopPropagation(); onCerrar(); }
    if (event.key !== "Tab") return;
    const buttons = dialog.current.querySelectorAll("button, a[href]");
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return (
    <div className="donacion-overlay" onClick={onCerrar} onKeyDown={keyDown}>
      <section ref={dialog} className="donacion-modal" role="dialog" aria-modal="true" aria-labelledby="donacion-title" onClick={event => event.stopPropagation()}>
        <button ref={close} type="button" className="donacion-cerrar" onClick={onCerrar} aria-label="Cerrar planes"><FiX /></button>
        <div className="donacion-grid">
          <header className="donacion-intro">
            <img src={logo} alt="CajaLibre" />
            <span className="donacion-eyebrow">Punto de venta para todos</span>
            <h2 id="donacion-title">¡Gracias por ser parte de <span>CajaLibre!</span></h2>
            <p>Tu negocio puede seguir usando el plan gratuito. Apoyar el proyecto es completamente voluntario.</p>
            <p>Tu apoyo nos ayuda a mantener el sistema, mejorarlo y desarrollar nuevas funciones para todos.</p>
            <div className="donacion-gracias"><FiHeart aria-hidden="true" /><strong>Tu apoyo hoy hace posible un mejor sistema mañana.</strong></div>
            <span className="donacion-firma">Juntos hacemos más.</span>
          </header>
          <article className="donacion-plan donacion-free">
            <span className="donacion-plan-icon"><FiCheck aria-hidden="true" /></span>
            <h3>CajaLibre Free</h3><p>Siempre gratuito</p>
            <strong className="donacion-precio">GRATIS</strong>
            <p>Lo esencial para gestionar tu negocio sin costo.</p>
            <ul>{free.map(item => <li key={item}><FiCheck aria-hidden="true" />{item}</li>)}</ul>
            <div className="donacion-plan-note">Puedes continuar con este plan. Gracias por usar y confiar en CajaLibre.</div>
          </article>
          <article className="donacion-plan donacion-premium">
            <span className="donacion-recomendado">Más para tu negocio</span>
            <span className="donacion-plan-icon"><FiStar aria-hidden="true" /></span>
            <h3>CajaLibre Premium</h3><p>Más beneficios para todo tu equipo</p>
            <strong className="donacion-precio">$300 <small>MXN / mes</small></strong>
            <p>Una suscripción por negocio.</p>
            <ul>{premium.map(item => <li key={item}><FiCheck aria-hidden="true" />{item}</li>)}</ul>
            <div className="donacion-plan-note">Si cancelas la renovación, conservas Premium hasta terminar tu periodo pagado.</div>
          </article>
        </div>
        <footer className="donacion-footer">
          <span><FiHeart aria-hidden="true" /> Tu apoyo mantiene este proyecto vivo.</span>
          <div><button type="button" className="donacion-apoyar" onClick={onApoyar}><FiHeart aria-hidden="true" /> Quiero apoyar el proyecto</button>
            <button type="button" className="donacion-ahora-no" onClick={onCerrar}>Ahora no, seguir gratis</button></div>
          <small>Conoce Premium antes de decidir. Este botón no realiza ningún cobro.</small>
        </footer>
      </section>
    </div>
  );
}
