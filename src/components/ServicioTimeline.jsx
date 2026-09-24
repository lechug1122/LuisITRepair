import { useMemo, useState } from "react";
import { FiCheck, FiClock } from "react-icons/fi";
import { leerHistorialEstados } from "../js/services/servicio_historial";
import { getEstadoServicio } from "../js/services/servicio_estados";

const ETIQUETA_ORIGEN = {
  negocio: "Negocio",
  cliente: "Cliente",
  sistema: "Sistema",
};

const PASOS_VISIBLES_AL_INICIO = 4;

function formatoFechaHora(fechaMs) {
  if (!fechaMs) return "";
  return new Date(fechaMs).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Linea de tiempo del servicio.
 *
 * Muestra lo que REALMENTE paso, no una plantilla de etapas fijas: si un
 * servicio nunca paso por "esperando autorizacion", esa linea no aparece.
 *
 * Un servicio anterior a esta funcion no tiene historial guardado.
 * `leerHistorialEstados` le sintetiza el alta y el estado actual a partir de
 * `createdAt` y `status`, que son datos reales del documento; esas entradas se
 * marcan como estimadas para no presentar como registro algo que no lo es.
 */
export default function ServicioTimeline({ servicio }) {
  const [expandido, setExpandido] = useState(false);
  const pasos = useMemo(() => leerHistorialEstados(servicio || {}), [servicio]);

  if (!pasos.length) {
    return (
      <p className="sv-timeline-vacio">
        Todavía no hay movimientos registrados en este servicio.
      </p>
    );
  }

  // Lo reciente importa mas que lo viejo: se muestra al reves y los pasos
  // antiguos se pliegan cuando son muchos.
  const orden = [...pasos].reverse();
  const ocultos = Math.max(0, orden.length - PASOS_VISIBLES_AL_INICIO);
  const visibles = expandido ? orden : orden.slice(0, PASOS_VISIBLES_AL_INICIO);

  return (
    <div className="sv-timeline-wrap">
      <ol className="sv-timeline">
        {visibles.map((paso) => {
          const info = getEstadoServicio(paso.estado);
          // El primero de la lista invertida es el movimiento vigente.
          const esActual = paso.id === orden[0]?.id;
          const fecha = formatoFechaHora(paso.fechaMs);

          return (
            <li
              key={paso.id}
              className={`sv-timeline-item sv-timeline-item--${info.tono} ${
                esActual ? "es-actual" : "es-hecho"
              }`}
            >
              <span className="sv-timeline-marca" aria-hidden="true">
                {esActual ? <FiClock /> : <FiCheck />}
              </span>

              <div className="sv-timeline-cuerpo">
                <strong>{paso.sintetica && paso.id === "h_creacion" ? "Servicio recibido" : info.label}</strong>
                <span className="sv-timeline-meta">
                  {fecha ? <time>{fecha}</time> : <em>Sin fecha registrada</em>}
                  {paso.usuarioNombre ? <span>· {paso.usuarioNombre}</span> : null}
                  <span className={`sv-timeline-origen sv-timeline-origen--${paso.origen}`}>
                    {ETIQUETA_ORIGEN[paso.origen] || ETIQUETA_ORIGEN.negocio}
                  </span>
                </span>
                {paso.nota ? <small className="sv-timeline-nota">{paso.nota}</small> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {ocultos > 0 ? (
        <button
          type="button"
          className="sv-timeline-mas"
          onClick={() => setExpandido((valor) => !valor)}
          aria-expanded={expandido}
        >
          {expandido ? "Mostrar solo lo reciente" : `Ver ${ocultos} movimiento${ocultos === 1 ? "" : "s"} anterior${ocultos === 1 ? "" : "es"}`}
        </button>
      ) : null}
    </div>
  );
}
