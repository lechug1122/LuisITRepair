import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FiAlertCircle,
  FiArrowRight,
  FiCheck,
  FiLock,
  FiMinus,
  FiStar,
} from "react-icons/fi";
import {
  COMPARATIVA_PLANES,
  PLAN_FREE_RESUMEN,
  PLAN_PREMIUM_RESUMEN,
  TICKET_EDITOR_LEGACY_UNTIL_LABEL,
} from "../js/services/plan_features";
import { crearSuscripcionMercadoPago, consultarSuscripcionMercadoPago } from "../js/services/premium_payments";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { auth } from "../initializer/firebase";
import "../css/pago_premium.css";

const STATUS_MESSAGES = {
  none: "Todavía no hay una suscripción.",
  review: "Hay una solicitud reciente en proceso.",
  pending: "Tu activación está pendiente de autorización en Mercado Pago.",
  authorized: "Suscripción autorizada. El primer cobro se confirmará por webhook.",
  paused: "La suscripción está pausada.",
  cancelled: "Tu suscripción fue cancelada.",
};

const ACTION_LABELS = {
  pending: "Continuar activación",
  cancelled: "Reactivar Premium",
  paused: "Reactivar Premium",
};

function actionLabel(status) {
  return ACTION_LABELS[status] || "Actualizar a Premium";
}

/** Celda de la comparativa: incluido, no incluido, o un texto propio. */
function CeldaPlan({ valor }) {
  if (valor === true) {
    return (
      <span className="pp-yes">
        <FiCheck aria-hidden="true" />
        <span className="pp-sr-only">Incluido</span>
      </span>
    );
  }
  if (valor === false) {
    return (
      <span className="pp-no">
        <FiMinus aria-hidden="true" />
        <span className="pp-sr-only">No incluido</span>
      </span>
    );
  }
  return <span className="pp-cell-text">{valor}</span>;
}

export default function ConfiguracionPagoPremium() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [premiumActivo, setPremiumActivo] = useState(false);
  const [status, setStatus] = useState("none");
  const correoComprador = auth.currentUser?.email || "";
  // El plan que se muestra sale de la misma fuente que el resto del sistema:
  // una suscripción cancelada sigue siendo Premium hasta terminar su periodo.
  const { isPremium, mostrarAvisoMigracionTicket } = useAutorizacionActual();

  async function consultarEstado(mensajeExito) {
    const { status: nuevoStatus, premiumActivo: activo } = await consultarSuscripcionMercadoPago();
    setStatus(nuevoStatus);
    setPremiumActivo(activo);
    setMessage(activo
      ? (mensajeExito || "¡Suscripción aprobada! Premium quedó activo para tu negocio.")
      : STATUS_MESSAGES[nuevoStatus] || "La suscripción sigue en revisión.");
  }

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "checkout") {
        const resultado = await crearSuscripcionMercadoPago();
        if (resultado.alreadyActive) {
          await consultarEstado();
        } else {
          window.location.assign(resultado.url);
        }
      } else {
        await consultarEstado();
      }
    } catch (err) {
      setError(["functions/not-found", "functions/internal", "functions/unavailable"].includes(err.code)
        ? "El servicio de pruebas no está disponible. Comprueba que las funciones de Firebase estén publicadas."
        : err.message || "No se pudo conectar con Mercado Pago.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    run("status");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const esPremium = isPremium || premiumActivo;

  return (
    <section className="cfg-sus-wrap premium-payment" aria-labelledby="pp-title">
      <header className="pp-head">
        <div className="pp-head-copy">
          <h1 id="pp-title">Planes de CajaLibre</h1>
          <p>
            Compara lo que incluye cada plan y elige el que le sirva a tu negocio.
            La suscripción es por negocio, no por usuario.
          </p>
        </div>
        <p className={`pp-status${esPremium ? " pp-status-premium" : ""}`} role="status">
          {esPremium ? <FiStar aria-hidden="true" /> : null}
          Tu plan actual: <strong>{esPremium ? "Premium" : "Free"}</strong>
        </p>
      </header>

      <div className="pp-plans">
        <article className="pp-plan" aria-labelledby="pp-plan-free">
          <h2 className="pp-plan-name" id="pp-plan-free">{PLAN_FREE_RESUMEN.nombre}</h2>
          <p className="pp-plan-tagline">{PLAN_FREE_RESUMEN.descripcion}</p>

          <div className="pp-price">
            <span className="pp-price-amount">{PLAN_FREE_RESUMEN.precio}</span>
            <span className="pp-price-period">{PLAN_FREE_RESUMEN.periodo}</span>
          </div>

          <ul className="pp-features">
            {PLAN_FREE_RESUMEN.incluye.map((item) => (
              <li key={item}><FiCheck aria-hidden="true" /> {item}</li>
            ))}
          </ul>

          <p className="pp-plan-note">
            {esPremium
              ? "Tu negocio tiene Premium, así que no dependes de estos límites."
              : "Es el plan que usas hoy. Puedes seguir en él todo el tiempo que quieras."}
          </p>
        </article>

        <article className="pp-plan pp-plan-premium" aria-labelledby="pp-plan-premium">
          <span className="pp-plan-ribbon">
            <FiStar aria-hidden="true" /> Recomendado
          </span>

          <h2 className="pp-plan-name" id="pp-plan-premium">{PLAN_PREMIUM_RESUMEN.nombre}</h2>
          <p className="pp-plan-tagline">{PLAN_PREMIUM_RESUMEN.descripcion}</p>

          <div className="pp-price">
            <span className="pp-price-amount">{PLAN_PREMIUM_RESUMEN.precio}</span>
            <span className="pp-price-period">{PLAN_PREMIUM_RESUMEN.periodo}</span>
          </div>

          <ul className="pp-features">
            {PLAN_PREMIUM_RESUMEN.incluye.map((item) => (
              <li key={item}><FiCheck aria-hidden="true" /> {item}</li>
            ))}
          </ul>

          {esPremium ? (
            <p className="pp-plan-note pp-plan-note-ok">
              <strong>Premium está activo</strong> para tu negocio. Administra la
              suscripción desde Mi Plan.
            </p>
          ) : (
            <div className="pp-cta-zone">
              <button
                type="button"
                className="pp-btn pp-btn-primary"
                disabled={busy || !correoComprador}
                onClick={() => run("checkout")}
              >
                {busy ? "Procesando…" : actionLabel(status)}
                {busy ? null : <FiArrowRight aria-hidden="true" />}
              </button>
              <p className="pp-trust">
                <FiLock aria-hidden="true" />
                Pago seguro con Mercado Pago. Cancela cuando quieras.
              </p>
              <p className="pp-trust-alt">PayPal estará disponible próximamente.</p>
            </div>
          )}
        </article>
      </div>

      <section className="pp-compare" aria-labelledby="pp-compare-title">
        <h2 id="pp-compare-title">Comparación de funciones</h2>
        <p className="pp-compare-sub">Todo lo que hoy verifica el sistema, plan por plan.</p>

        <div className="pp-table-scroll">
          <table className="pp-table">
            <thead>
              <tr>
                <th scope="col">Función</th>
                <th scope="col" className="pp-col-plan">Free</th>
                <th scope="col" className="pp-col-plan pp-col-premium">Premium</th>
              </tr>
            </thead>
            <tbody>
              {COMPARATIVA_PLANES.map((fila) => (
                <tr key={fila.funcion}>
                  <th scope="row">{fila.funcion}</th>
                  <td className="pp-col-plan"><CeldaPlan valor={fila.free} /></td>
                  <td className="pp-col-plan pp-col-premium">
                    <CeldaPlan valor={fila.premium ?? true} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {mostrarAvisoMigracionTicket && (
          <p className="pp-legacy-note">
            <FiAlertCircle aria-hidden="true" />
            <span>
              Tu negocio conserva temporalmente la edición de tickets hasta el{" "}
              {TICKET_EDITOR_LEGACY_UNTIL_LABEL}.
            </span>
          </p>
        )}
      </section>

      <section className="pp-account" aria-labelledby="pp-account-title">
        <div className="pp-account-copy">
          <h2 id="pp-account-title">Estado de tu suscripción</h2>
          <p>
            {esPremium
              ? "Desde Mi Plan puedes revisar la vigencia y administrar la renovación."
              : "Aquí verás el avance de tu activación con Mercado Pago."}
          </p>
        </div>

        <div className="pp-account-actions">
          <button type="button" className="pp-btn pp-btn-ghost" disabled={busy} onClick={() => run("status")}>
            {busy ? "Consultando…" : "Consultar estado"}
          </button>
          <Link className="pp-link" to="/configuracion/mi-suscripcion">
            Ir a Mi Plan <FiArrowRight aria-hidden="true" />
          </Link>
        </div>

        {message && <p className="pp-message pp-message-info" role="status">{message}</p>}
        {error && <p className="pp-message pp-message-error" role="alert">{error}</p>}
      </section>
    </section>
  );
}
