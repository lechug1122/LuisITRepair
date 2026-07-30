import { FiCoffee, FiHeart, FiX } from "react-icons/fi";
import "../css/modal-donacion.css";

const PAYPAL_URL = "https://paypal.me/CajaLibre";
const MERCADO_PAGO_URL = "https://link.mercadopago.com.mx/cajalibre";

export default function ModalDonacion({ abierto, onCerrar, onApoyar }) {
  if (!abierto) return null;
  return (
    <div className="donacion-overlay" onClick={onCerrar}>
      <section className="donacion-modal" role="dialog" aria-modal="true" aria-labelledby="donacion-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="donacion-cerrar" onClick={onCerrar} aria-label="Cerrar"><FiX /></button>
        <div className="donacion-taza"><FiCoffee /><span><FiHeart /></span></div>
        <small>Ayuda a mantener CajaLibre gratuito</small>
        <h2 id="donacion-title">Dale un cafecito al programador ☕</h2>
        <p>Cada aportación ayuda a mantener los servidores, corregir errores y crear nuevas funciones para tu negocio.</p>
        <div className="donacion-beneficios">
          <span>✓ Sin mensualidades obligatorias</span>
          <span>✓ Mejoras continuas</span>
          <span>✓ Apoyo totalmente voluntario</span>
        </div>
        <div className="donacion-acciones">
          <a href={PAYPAL_URL} target="_blank" rel="noreferrer" onClick={onApoyar}>Invitar por PayPal</a>
          <a href={MERCADO_PAGO_URL} target="_blank" rel="noreferrer" onClick={onApoyar}>Invitar por Mercado Pago</a>
        </div>
        <button type="button" className="donacion-ahora-no" onClick={onCerrar}>Quizá en otro momento</button>
        <em>Gracias por usar y apoyar CajaLibre.</em>
      </section>
    </div>
  );
}
