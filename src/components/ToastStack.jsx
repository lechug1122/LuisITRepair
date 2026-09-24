import { FiAlertTriangle, FiCheck, FiInfo, FiX } from "react-icons/fi";
import "../css/toast_stack.css";

const ICONOS = {
  exito: FiCheck,
  error: FiAlertTriangle,
  info: FiInfo,
};

/**
 * Pila de avisos del modulo de Servicios. Solo presenta: el estado lo lleva
 * `useToasts`, para que la misma pila sirva en el detalle del servicio y en la
 * pagina publica de aceptacion sin arrastrar logica.
 *
 * `aria-live="polite"` en vez de "assertive": un aviso de exito no debe cortar
 * lo que el lector de pantalla este diciendo.
 */
export default function ToastStack({ toasts = [], onDescartar }) {
  if (!toasts.length) return null;

  return (
    <div className="sv-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icono = ICONOS[toast.tipo] || ICONOS.info;
        return (
          <article key={toast.id} className={`sv-toast sv-toast--${toast.tipo}`}>
            <span className="sv-toast-icono" aria-hidden="true">
              <Icono />
            </span>
            <div className="sv-toast-texto">
              <p>{toast.mensaje}</p>
              {toast.detalle ? <small>{toast.detalle}</small> : null}
            </div>
            <button
              type="button"
              className="sv-toast-cerrar"
              onClick={() => onDescartar?.(toast.id)}
              aria-label="Cerrar aviso"
            >
              <FiX aria-hidden="true" />
            </button>
          </article>
        );
      })}
    </div>
  );
}
