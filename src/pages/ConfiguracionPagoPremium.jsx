import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { FiCheck, FiCreditCard, FiStar } from "react-icons/fi";
import { PREMIUM_PAYMENT_PROVIDERS } from "../js/services/premium_config";
import { crearSuscripcionMercadoPago, consultarSuscripcionMercadoPago } from "../js/services/premium_payments";
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
  cancelled: "Reactivar CajaLibre Premium",
  paused: "Reactivar CajaLibre Premium",
};

function actionLabel(status) {
  return ACTION_LABELS[status] || "Continuar con Mercado Pago";
}

const beneficios = [
  "Sin publicidad",
  "Soporte preferente",
  "Insignia/icono premium",
  "Funciones adicionales",
  "Usuarios ilimitados",
];

export default function ConfiguracionPagoPremium() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [premiumActivo, setPremiumActivo] = useState(false);
  const [status, setStatus] = useState("none");
  const correoComprador = auth.currentUser?.email || "";

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
  return (
    <section className="cfg-sus-wrap premium-payment" aria-labelledby="premium-payment-title">
      <div className="cfg-header">
        <h1 id="premium-payment-title">Pago Premium</h1>
        <p>Conoce tu suscripción y revisa el importe mensual de CajaLibre Premium.</p>
      </div>

      <div className="premium-payment-grid">
        <article className="cfg-pos-card premium-payment-plan">
          <span className="premium-payment-badge"><FiStar aria-hidden="true" /> Premium</span>
          <h2>CajaLibre Premium</h2>
          <p>Más beneficios para ti y todo tu equipo.</p>
          <div className="premium-payment-price">$300 <span>MXN / mes</span></div>
          <p>Una suscripción por negocio, con usuarios ilimitados.</p>
          <ul className="premium-payment-benefits">
            {beneficios.map((beneficio) => (
              <li key={beneficio}><FiCheck aria-hidden="true" /> {beneficio}</li>
            ))}
          </ul>
        </article>

        <article className="cfg-pos-card premium-payment-summary">
          <h2>Resumen de la suscripción</h2>
          <dl>
            <div><dt>Plan</dt><dd>Premium</dd></div>
            <div><dt>Frecuencia</dt><dd>Mensual</dd></div>
            <div><dt>Usuarios</dt><dd>Ilimitados</dd></div>
            <div className="premium-payment-total"><dt>Importe mensual</dt><dd>$300 MXN</dd></div>
          </dl>
          <div className="premium-payment-provider"><FiCreditCard aria-hidden="true" /><span>Formas de pago</span></div>
          <p id="premium-payment-availability" className="premium-payment-notice">
            Mercado Pago cobrará $300 MXN cada mes después de que autorices la suscripción. PayPal estará disponible próximamente.
          </p>
          {premiumActivo ? (
            <p role="status" className="premium-payment-notice">
              <strong>Premium está activo</strong> para tu negocio (cobro confirmado).
            </p>
          ) : (
            <>
              <div className="premium-payment-options">
                {PREMIUM_PAYMENT_PROVIDERS.map((provider) => (
                  <button key={provider.id} type="button" className="premium-payment-button" disabled={provider.id !== "mercadopago" || busy || !correoComprador} onClick={() => run("checkout")} aria-describedby="premium-payment-availability">
                    {provider.id === "mercadopago" ? (busy ? "Procesando…" : actionLabel(status)) : "PayPal · Próximamente"}
                  </button>
                ))}
              </div>
              <p className="premium-payment-notice">Pago seguro procesado por Mercado Pago.</p>
            </>
          )}
          <div className="premium-payment-options">
            <button type="button" className="emp-btn emp-btn-soft" disabled={busy} onClick={() => run("status")}>Consultar estado</button>
          </div>
          {message && <p role="status">{message}</p>}
          {error && <p role="alert">{error}</p>}
          <Link className="premium-payment-back" to="/configuracion/mi-suscripcion">Volver a Mi Plan</Link>
        </article>
      </div>
    </section>
  );
}
