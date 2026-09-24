// Compatibilidad: la tabla de estados se declara ahora en
// `servicio_estados.js`, que es la fuente unica. Este archivo solo conserva la
// forma `{ key, label, step, color }` que espera el ticket impreso.
//
// Antes vivia aqui una tercera lista de estados, distinta de la de
// `status_map.js` y de la del rastreador: el mismo servicio podia aparecer
// como "Cotizacion" en el ticket y como "Pendiente" en el detalle. Quien
// escriba codigo nuevo deberia importar de `servicio_estados.js`.

import {
  ESTADOS_SERVICIO,
  getEstadoServicio,
  normalizarEstadoServicio,
} from "./servicio_estados.js";
import { statusInfo } from "../utils/status_map.js";

export const ESTADOS = ESTADOS_SERVICIO.map((estado) => ({
  key: estado.key,
  label: estado.label,
  step: estado.orden,
  color: statusInfo(estado.key).color,
}));

/** Texto libre -> clave canonica. */
export const normalizarEstado = normalizarEstadoServicio;

export function getEstadoInfo(raw) {
  const estado = getEstadoServicio(raw);
  return {
    key: estado.key,
    label: estado.label,
    step: estado.orden,
    color: statusInfo(estado.key).color,
  };
}

/** Ya viene ordenado por avance del servicio. */
export function getEstadosOrdenados() {
  return [...ESTADOS].sort((a, b) => a.step - b.step);
}
