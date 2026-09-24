// Compatibilidad: esta tabla se declara ahora en `servicio_estados.js`, que es
// la fuente unica de los estados de un servicio. Aqui solo se le da la forma
// `{ value, label, color }` que ya esperaban las pantallas, para no obligarlas
// a cambiar todas de golpe.
//
// Quien escriba codigo nuevo deberia importar de `servicio_estados.js`.

import {
  ESTADOS_SERVICIO,
  getEstadoServicio,
  normalizarEstadoServicio,
} from "../services/servicio_estados.js";

// Un color por TONO, no por estado: asi dos estados que significan lo mismo no
// pueden terminar con colores distintos por descuido.
const COLOR_POR_TONO = {
  neutral: "#64748b",
  info: "#2563eb",
  espera: "#b45309",
  positivo: "#15803d",
  activo: "#7c3aed",
  destacado: "#047857",
  final: "#0f766e",
  negativo: "#dc2626",
  apagado: "#6b7280",
};

export const STATUS = ESTADOS_SERVICIO.map((estado) => ({
  value: estado.key,
  label: estado.label,
  color: COLOR_POR_TONO[estado.tono] || COLOR_POR_TONO.neutral,
  tono: estado.tono,
  // Los estados automaticos (abandono) existen para poder mostrarlos, pero
  // ninguna pantalla debe ofrecerlos en un desplegable.
  automatico: estado.automatico === true,
}));

export function statusInfo(value) {
  const estado = getEstadoServicio(value);
  return {
    value: estado.key,
    label: estado.label,
    color: COLOR_POR_TONO[estado.tono] || COLOR_POR_TONO.neutral,
    tono: estado.tono,
  };
}

/** Texto libre -> clave guardada. Reexportado por comodidad de las pantallas. */
export const normalizeStatusValue = normalizarEstadoServicio;

export const STATUS2 = [
  { key: "pendiente", label: "Pendiente", step: 1, color: "#9ca3af" },
  { key: "trabajando", label: "Trabajando", step: 2, color: "#2563eb" },
  { key: "finalizado", label: "Finalizado", step: 3, color: "#22c55e" },
  { key: "entregado", label: "Entregado", step: 4, color: "#22c55e" },
];

export const statusInfo2 = (key) =>
  STATUS2.find((s) => s.key === key) || STATUS2[0];
