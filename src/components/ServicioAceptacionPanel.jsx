import { useMemo, useState } from "react";
import {
  FiCheckCircle,
  FiCopy,
  FiExternalLink,
  FiFileText,
  FiRefreshCw,
  FiSend,
  FiXCircle,
} from "react-icons/fi";

import {
  ACEPTACION_ACEPTADA,
  ACEPTACION_PENDIENTE,
  ACEPTACION_RECHAZADA,
  etiquetaMotivoRechazo,
  leerAceptacion,
  leerHistorialAceptaciones,
  solicitarAceptacion,
} from "../js/services/servicio_aceptacion";

function fechaHora(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("es-MX", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Aceptacion del cliente, vista desde el negocio.
 *
 * El enlace en claro SOLO existe en memoria justo despues de generarlo: en
 * Firestore se guarda unicamente su hash. Es a proposito -- si el enlace se
 * guardara entero, cualquiera con acceso de lectura a la base podria firmar
 * por el cliente. Por eso, para reenviarlo hay que generar uno nuevo, y el
 * anterior deja de funcionar en ese momento.
 */
export default function ServicioAceptacionPanel({
  servicio,
  usuarioId = "",
  usuarioNombre = "",
  bloqueado = false,
  onActualizado,
  onExito,
  onError,
}) {
  const [generando, setGenerando] = useState(false);
  const [enlace, setEnlace] = useState("");
  const [verFirma, setVerFirma] = useState(false);

  const aceptacion = useMemo(() => leerAceptacion(servicio || {}), [servicio]);
  const versiones = useMemo(() => leerHistorialAceptaciones(servicio || {}), [servicio]);

  const generar = async () => {
    if (generando || !servicio?.id) return;
    setGenerando(true);
    try {
      const resultado = await solicitarAceptacion({
        servicioId: servicio.id,
        usuarioId,
        usuarioNombre,
      });
      setEnlace(resultado.enlace);
      onExito?.(
        resultado.esReenvio ? "Enlace nuevo generado." : "Solicitud de aceptación creada.",
        {
          detalle: resultado.esReenvio
            ? "El enlace anterior dejó de funcionar."
            : "Comparte el enlace con el cliente para que firme.",
        },
      );
      await onActualizado?.();
    } catch (error) {
      console.error("[aceptacion] No se pudo generar la solicitud:", error);
      onError?.("No pudimos crear la solicitud de aceptación. Intenta nuevamente.");
    } finally {
      setGenerando(false);
    }
  };

  const copiar = async () => {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      onExito?.("Enlace copiado.");
    } catch {
      // Algunos navegadores solo permiten el portapapeles bajo ciertas
      // condiciones. Mostrar el enlace para copiarlo a mano es mejor que
      // dejar a la persona sin salida.
      onError?.("No pudimos copiar el enlace.", { detalle: "Selecciónalo y cópialo manualmente." });
    }
  };

  const cabecera = (
    <div className="sv-bloque-encabezado">
      <div>
        <h3>Aceptación del cliente</h3>
        <p className="sv-bloque-sub">
          Firma digital de la orden. Disponible en el plan gratuito y en Premium.
        </p>
      </div>
    </div>
  );

  /* ------------------------------ Aceptada ------------------------------ */
  if (aceptacion.estado === ACEPTACION_ACEPTADA) {
    return (
      <div className="sv-modulo sv-aceptacion">
        {cabecera}
        <div className="sv-aceptacion-resultado sv-aceptacion-resultado--ok">
          <span className="sv-aceptacion-icono" aria-hidden="true"><FiCheckCircle /></span>
          <div>
            <strong>Aceptada</strong>
            <dl>
              <div><dt>Cliente</dt><dd>{aceptacion.nombreCliente || "—"}</dd></div>
              <div><dt>Fecha</dt><dd>{fechaHora(aceptacion.fechaRespuestaMs) || "—"}</dd></div>
              <div><dt>Versión</dt><dd>{aceptacion.version}</dd></div>
            </dl>
          </div>
          {aceptacion.firmaUrl || aceptacion.firmaDataUrl ? (
            <button type="button" className="sv-btn sv-btn--suave sv-btn--chico" onClick={() => setVerFirma(true)}>
              Ver firma
            </button>
          ) : null}
        </div>

        {verFirma ? (
          <div className="sv-visor" role="dialog" aria-modal="true" aria-label="Firma del cliente" onClick={() => setVerFirma(false)}>
            <button type="button" className="sv-visor-cerrar" onClick={() => setVerFirma(false)} aria-label="Cerrar">×</button>
            <figure onClick={(evento) => evento.stopPropagation()}>
              <img
                className="sv-firma-vista"
                src={aceptacion.firmaDataUrl || aceptacion.firmaUrl}
                alt={`Firma de ${aceptacion.nombreCliente || "el cliente"}`}
              />
              <figcaption>
                <strong>{aceptacion.nombreCliente || "Cliente"}</strong>
                <small>{fechaHora(aceptacion.fechaRespuestaMs)}</small>
              </figcaption>
            </figure>
          </div>
        ) : null}

        <HistorialVersiones versiones={versiones} />

        {!bloqueado ? (
          <button type="button" className="sv-btn sv-btn--suave sv-btn--chico" onClick={generar} disabled={generando}>
            <FiRefreshCw aria-hidden="true" />
            {generando ? "Generando…" : "Solicitar una nueva aceptación"}
          </button>
        ) : null}

        {enlace ? <EnlaceGenerado enlace={enlace} onCopiar={copiar} /> : null}
      </div>
    );
  }

  /* ------------------------------ Rechazada ----------------------------- */
  if (aceptacion.estado === ACEPTACION_RECHAZADA) {
    return (
      <div className="sv-modulo sv-aceptacion">
        {cabecera}
        <div className="sv-aceptacion-resultado sv-aceptacion-resultado--no">
          <span className="sv-aceptacion-icono" aria-hidden="true"><FiXCircle /></span>
          <div>
            <strong>Rechazada por el cliente</strong>
            <dl>
              <div><dt>Motivo</dt><dd>{etiquetaMotivoRechazo(aceptacion.motivoRechazo)}</dd></div>
              {aceptacion.comentarioRechazo ? (
                <div><dt>Comentario</dt><dd>{aceptacion.comentarioRechazo}</dd></div>
              ) : null}
              <div><dt>Fecha</dt><dd>{fechaHora(aceptacion.fechaRespuestaMs) || "—"}</dd></div>
            </dl>
          </div>
        </div>

        <HistorialVersiones versiones={versiones} />

        {!bloqueado ? (
          <button type="button" className="sv-btn sv-btn--principal" onClick={generar} disabled={generando}>
            <FiSend aria-hidden="true" />
            {generando ? "Generando…" : "Enviar un presupuesto corregido"}
          </button>
        ) : null}

        {enlace ? <EnlaceGenerado enlace={enlace} onCopiar={copiar} /> : null}
      </div>
    );
  }

  /* ------------------------------ Pendiente ----------------------------- */
  if (aceptacion.estado === ACEPTACION_PENDIENTE) {
    return (
      <div className="sv-modulo sv-aceptacion">
        {cabecera}
        <div className="sv-aceptacion-espera">
          <span className="sv-badge sv-badge--espera">
            <span className="sv-badge-punto" aria-hidden="true" />
            Esperando al cliente
          </span>
          <p>
            Solicitud del {fechaHora(aceptacion.fechaSolicitudMs) || "—"}
            {aceptacion.version > 1 ? ` · Versión ${aceptacion.version}` : ""}
          </p>
          {!aceptacion.enlaceVigente ? (
            <p className="sv-aceptacion-nota">
              El enlace caducó. Genera uno nuevo para que el cliente pueda firmar.
            </p>
          ) : null}
        </div>

        {enlace ? (
          <EnlaceGenerado enlace={enlace} onCopiar={copiar} />
        ) : (
          <p className="sv-aceptacion-nota">
            Por seguridad el enlace solo se muestra al generarlo: en la base de datos
            se guarda cifrado. Si necesitas reenviarlo, genera uno nuevo — el anterior
            dejará de funcionar.
          </p>
        )}

        <HistorialVersiones versiones={versiones} />

        {!bloqueado ? (
          <button type="button" className="sv-btn sv-btn--suave" onClick={generar} disabled={generando}>
            <FiRefreshCw aria-hidden="true" />
            {generando ? "Generando…" : "Generar un enlace nuevo"}
          </button>
        ) : null}
      </div>
    );
  }

  /* ---------------------------- No solicitada --------------------------- */
  return (
    <div className="sv-modulo sv-aceptacion">
      {cabecera}
      <div className="sv-aceptacion-vacia">
        <span aria-hidden="true"><FiFileText /></span>
        <div>
          <strong>No solicitada</strong>
          <p>
            Envíale al cliente un enlace para que revise la orden, acepte las
            condiciones y firme desde su propio teléfono. La firma se integra al
            PDF de la orden de servicio.
          </p>
        </div>
      </div>

      {!bloqueado ? (
        <button type="button" className="sv-btn sv-btn--principal" onClick={generar} disabled={generando}>
          <FiSend aria-hidden="true" />
          {generando ? "Generando…" : "Solicitar aceptación"}
        </button>
      ) : (
        <p className="sv-aceptacion-nota">Este servicio está cerrado.</p>
      )}

      {enlace ? <EnlaceGenerado enlace={enlace} onCopiar={copiar} /> : null}
    </div>
  );
}

function EnlaceGenerado({ enlace, onCopiar }) {
  return (
    <div className="sv-aceptacion-enlace">
      <p className="sv-aceptacion-nota">
        Compártelo con el cliente. Se muestra una sola vez.
      </p>
      <code>{enlace}</code>
      <div className="sv-aceptacion-enlace-acciones">
        <button type="button" className="sv-btn sv-btn--suave sv-btn--chico" onClick={onCopiar}>
          <FiCopy aria-hidden="true" /> Copiar enlace
        </button>
        <a className="sv-btn sv-btn--suave sv-btn--chico" href={enlace} target="_blank" rel="noreferrer">
          <FiExternalLink aria-hidden="true" /> Ver solicitud
        </a>
      </div>
    </div>
  );
}

function HistorialVersiones({ versiones }) {
  if (!versiones.length) return null;

  return (
    <details className="sv-aceptacion-historial">
      <summary>
        Versiones anteriores ({versiones.length})
      </summary>
      <ul>
        {versiones.map((version) => (
          <li key={`version-${version.version}`}>
            <span className={`sv-badge sv-badge--${version.estado === "aceptado" ? "positivo" : "negativo"}`}>
              <span className="sv-badge-punto" aria-hidden="true" />
              Versión {version.version} · {version.estado === "aceptado" ? "Aceptada" : "Rechazada"}
            </span>
            <small>
              {fechaHora(version.fechaRespuestaMs) || "Sin fecha"}
              {version.nombreCliente ? ` · ${version.nombreCliente}` : ""}
              {version.motivoRechazo ? ` · ${etiquetaMotivoRechazo(version.motivoRechazo)}` : ""}
            </small>
          </li>
        ))}
      </ul>
    </details>
  );
}
