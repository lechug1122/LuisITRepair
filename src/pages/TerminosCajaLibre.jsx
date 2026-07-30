import { useState } from "react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../initializer/firebase";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import {
  TERMINOS_CAJA_LIBRE_VERSION,
  aceptarTerminosNegocio,
} from "../js/services/negocios";
import { obtenerEstadoAutorizacion } from "../js/services/autorizacion";
import terminosPdf from "../assets/Terminos_y_Condiciones_Caja_Libre.pdf";
import AppFooter from "../components/AppFooter";
import "../css/onboarding.css";

export default function TerminosCajaLibre({ readOnly = false }) {
  const navigate = useNavigate();
  const { loading, uid, nombre, cuentaPrincipalUid } = useAutorizacionActual();
  const [acepta, setAcepta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const aceptar = async () => {
    if (!acepta || guardando) return;
    setGuardando(true);
    setError("");

    try {
      await aceptarTerminosNegocio({
        uid,
        negocioId: cuentaPrincipalUid || uid,
        nombre,
        correo: auth.currentUser?.email || "",
      });
      const estadoActualizado = await obtenerEstadoAutorizacion(uid);
      if (estadoActualizado.motivo === "terminos_pendientes") {
        throw new Error(
          "La aceptación todavía no pudo confirmarse. Revisa tu conexión e intenta nuevamente.",
        );
      }
      if (
        !estadoActualizado.permitido &&
        estadoActualizado.motivo !== "configuracion_inicial_pendiente"
      ) {
        throw new Error(
          estadoActualizado.mensaje || "No se pudo confirmar el acceso a tu negocio.",
        );
      }
      window.location.replace("/configuracion-inicial");
    } catch (err) {
      setError(err?.message || "No se pudo guardar la aceptacion.");
    } finally {
      setGuardando(false);
    }
  };

  const rechazar = async () => {
    await signOut(auth).catch(() => {});
    window.location.replace("/");
  };

  if (loading) {
    return (
      <>
        <main className="onboarding-page">
          <section className="onboarding-card">
            <h1>Terminos y Condiciones</h1>
            <p>Cargando informacion de tu cuenta...</p>
          </section>
        </main>
        <AppFooter />
      </>
    );
  }

  return (
    <>
      <main className="onboarding-page">
        <section className="onboarding-card onboarding-card-wide">
        <div className="onboarding-head">
          <span>CajaLibre</span>
          <h1>Terminos y Condiciones</h1>
          <p>
            {readOnly
              ? "Consulta los terminos y condiciones vigentes de CajaLibre."
              : "Antes de entrar al sistema, el administrador del negocio debe revisar y aceptar los terminos vigentes."}
          </p>
        </div>

        <div className="terms-actions-row">
          <a className="onboarding-secondary-link" href={terminosPdf} target="_blank" rel="noreferrer">
            Abrir PDF completo
          </a>
          <span>Version {TERMINOS_CAJA_LIBRE_VERSION}</span>
        </div>

        <div className="terms-frame">
          <iframe title="Terminos y Condiciones CajaLibre" src={terminosPdf} />
        </div>

        {!readOnly ? (
          <label className="terms-check">
            <input
              type="checkbox"
              checked={acepta}
              onChange={(e) => setAcepta(e.target.checked)}
            />
            <span>
              He leido y acepto los Terminos y Condiciones de CajaLibre para mi negocio.
            </span>
          </label>
        ) : null}

        {error ? <div className="onboarding-error">{error}</div> : null}

        {readOnly ? (
          <div className="onboarding-actions">
            <button type="button" className="onboarding-btn-soft" onClick={() => navigate(-1)}>
              Regresar
            </button>
          </div>
        ) : (
          <div className="onboarding-actions">
            <button type="button" className="onboarding-btn-soft" onClick={rechazar}>
              Rechazar y salir
            </button>
            <button
              type="button"
              className="onboarding-btn-primary"
              disabled={!acepta || guardando}
              onClick={aceptar}
            >
              {guardando ? "Guardando..." : "Aceptar y continuar"}
            </button>
          </div>
        )}
        </section>
      </main>
      <AppFooter />
    </>
  );
}
