import { signOut } from "firebase/auth";
import { auth } from "../initializer/firebase";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { SOPORTE_CAJA_LIBRE } from "../js/services/negocios";
import AppFooter from "../components/AppFooter";
import "../css/onboarding.css";

export default function NegocioBloqueado() {
  const { loading, mensajeAcceso, suscripcion } = useAutorizacionActual();
  const whatsappUrl = `${SOPORTE_CAJA_LIBRE.whatsapp}?text=${encodeURIComponent(
    "Hola, necesito soporte porque mi negocio aparece bloqueado en CajaLibre.",
  )}`;

  const salir = async () => {
    await signOut(auth).catch(() => {});
    window.location.replace("/");
  };

  return (
    <>
      <main className="onboarding-page">
        <section className="onboarding-card blocked-card">
        <div className="onboarding-head">
          <span>CajaLibre</span>
          <h1>Acceso temporalmente restringido</h1>
          <p>
            {loading
              ? "Validando el estado del negocio..."
              : mensajeAcceso || "Este negocio no puede acceder a los modulos operativos por ahora."}
          </p>
        </div>

        {suscripcion?.detalle ? (
          <div className="free-plan-note">
            <strong>Detalle</strong>
            <p>{suscripcion.detalle}</p>
          </div>
        ) : null}

        <div className="blocked-contact-grid">
          <div>
            <span>Telefono</span>
            <strong>{SOPORTE_CAJA_LIBRE.telefono}</strong>
          </div>
          <div>
            <span>Correo</span>
            <strong>{SOPORTE_CAJA_LIBRE.correo}</strong>
          </div>
        </div>

        <div className="onboarding-actions">
          <button type="button" className="onboarding-btn-soft" onClick={salir}>
            Cerrar sesion
          </button>
          <a className="onboarding-btn-primary as-link" href={whatsappUrl} target="_blank" rel="noreferrer">
            Contactar soporte
          </a>
        </div>
        </section>
      </main>
      <AppFooter />
    </>
  );
}
