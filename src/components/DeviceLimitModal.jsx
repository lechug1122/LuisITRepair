import { useEffect, useRef } from "react";

/**
 * Aviso de cuenta en uso en otro equipo.
 *
 * Es el unico mensaje que ve una persona bloqueada por el limite del plan
 * Gratuito, asi que esta escrito sin una sola palabra tecnica: nada de
 * identificadores, ni de sesiones internas, ni de base de datos.
 */
export default function DeviceLimitModal({
  equipo = null,
  procesando = false,
  onContinuar,
  onPremium,
  onCancelar,
}) {
  const dialogo = useRef(null);
  const botonPrincipal = useRef(null);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    botonPrincipal.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // El foco no puede escaparse del aviso: detras queda el sistema bloqueado.
  const alTeclear = (event) => {
    if (event.key !== "Tab") return;
    const foco = dialogo.current?.querySelectorAll("button:not([disabled])") || [];
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

  const ultimaActividad = equipo?.ultimaActividad
    ? equipo.ultimaActividad.toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    })
    : "";

  return (
    <div className="device-session-overlay" onKeyDown={alTeclear} role="presentation">
      <section
        ref={dialogo}
        className="device-session-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="device-session-titulo"
        aria-describedby="device-session-detalle"
      >
        <span className="device-session-kicker">Tu cuenta</span>
        <h2 id="device-session-titulo">Esta cuenta ya esta en uso</h2>

        <div id="device-session-detalle" className="device-session-texto">
          <p>Esta cuenta se esta utilizando actualmente en otro dispositivo.</p>
          <p>
            En el plan gratuito, cada usuario puede utilizar su cuenta en un solo
            dispositivo a la vez.
          </p>
          <p>
            Puedes cerrar la sesion del otro dispositivo para continuar aqui o cambiar a
            Premium para utilizar tu cuenta en multiples dispositivos.
          </p>
        </div>

        {equipo?.etiqueta ? (
          <div className="device-session-item">
            <strong>{equipo.etiqueta}</strong>
            {ultimaActividad ? <span>Se uso por ultima vez el {ultimaActividad}</span> : null}
          </div>
        ) : null}

        <div className="device-session-actions">
          <button
            ref={botonPrincipal}
            type="button"
            className="emp-btn emp-btn-primary"
            onClick={onContinuar}
            disabled={procesando}
          >
            {procesando ? "Un momento..." : "Cerrar sesion en el otro dispositivo y continuar"}
          </button>
          <button
            type="button"
            className="emp-btn emp-btn-soft"
            onClick={onPremium}
            disabled={procesando}
          >
            Conocer Premium
          </button>
          <button
            type="button"
            className="emp-btn emp-btn-ghost"
            onClick={onCancelar}
            disabled={procesando}
          >
            Cancelar
          </button>
        </div>
      </section>
    </div>
  );
}
