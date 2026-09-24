import { getEstadoServicio } from "../js/services/servicio_estados";

/**
 * Insignia del estado de un servicio.
 *
 * El color sale del TONO declarado en `servicio_estados.js`, nunca de un valor
 * suelto escrito en la pantalla: asi un estado no puede verse verde en una
 * lista y gris en otra.
 *
 * El punto de la izquierda cambia de forma segun el tono (relleno, anillo o
 * tachado) para que el estado siga siendo legible sin depender solo del color
 * -- por daltonismo y por impresiones en blanco y negro.
 */
export default function ServicioEstadoBadge({
  estado,
  tamano = "normal",
  className = "",
}) {
  const info = getEstadoServicio(estado);

  return (
    <span
      className={`sv-badge sv-badge--${info.tono} sv-badge--${tamano} ${className}`.trim()}
      title={info.descripcion}
    >
      <span className="sv-badge-punto" aria-hidden="true" />
      {info.label}
    </span>
  );
}
