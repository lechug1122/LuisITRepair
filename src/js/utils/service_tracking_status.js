// Como se le cuenta al CLIENTE el estado de su servicio.
//
// Las claves y las etiquetas salen de `servicio_estados.js` (fuente unica);
// aqui solo se agrega lo que es propio del rastreador publico: en que etapa de
// la barra cae cada estado y que frase se le muestra a quien no conoce el
// negocio por dentro.

import {
  getEstadoServicio,
  normalizarEstadoServicio,
} from "../services/servicio_estados.js";

// Estados que cierran la linea de tiempo: no queda nada por esperar.
const CERRADOS = ["cancelado", "no_reparable", "abandonado", "rechazado"];

const ETAPA_Y_MENSAJE = {
  pendiente: { step: 0, detail: "Tu equipo fue recibido y espera la revisión inicial." },
  revision: { step: 1, detail: "Estamos revisando tu equipo para identificar la falla." },
  esperando_autorizacion: {
    step: 2,
    theme: "warning",
    detail: "Te enviamos el presupuesto. Esperamos tu autorización para continuar.",
  },
  autorizado: {
    step: 2,
    theme: "success",
    detail: "Autorizaste la orden. El trabajo entrará a reparación.",
  },
  rechazado: {
    step: 2,
    theme: "danger",
    detail: "No se autorizó la orden. Contacta al negocio para acordar los siguientes pasos.",
  },
  espera_refaccion: { step: 2, theme: "warning", detail: "El servicio está esperando piezas para continuar." },
  reparacion: { step: 3, detail: "Tu equipo está en proceso de reparación." },
  listo: {
    step: 4,
    theme: "success",
    detail: "El trabajo terminó. Contacta al negocio para coordinar la entrega.",
  },
  entregado: { step: 5, theme: "success", detail: "Tu equipo fue entregado y el servicio está concluido." },
  cancelado: { step: 4, theme: "danger", detail: "El servicio fue cancelado. Contacta al negocio para conocer los detalles." },
  no_reparable: {
    step: 4,
    theme: "neutral",
    detail: "El equipo no pudo repararse. Contacta al negocio para coordinar los siguientes pasos.",
  },
  abandonado: { step: 5, theme: "warning", detail: "El servicio fue cerrado al superar el plazo de abandono." },
};

export function getServiceTrackingState(raw) {
  const key = normalizarEstadoServicio(raw);
  const estado = getEstadoServicio(key);
  const extra = ETAPA_Y_MENSAJE[key] || { step: 0, detail: "Consulta con el negocio los detalles de tu servicio." };

  return {
    key,
    label: estado.label,
    theme: "blue",
    ...extra,
  };
}

export function getServiceTrackingSteps(raw) {
  const info = getServiceTrackingState(raw);
  const closed = CERRADOS.includes(info.key);
  return [
    { key: "recibido", title: "Servicio recibido" },
    { key: "revision", title: "Revisión" },
    { key: "autorizacion", title: "Autorización y refacciones" },
    { key: "reparacion", title: "Reparación" },
    { key: "finalizado", title: closed ? info.label : "Trabajo finalizado" },
    { key: "entrega", title: closed ? "Cierre del servicio" : "Entrega" },
  ];
}
