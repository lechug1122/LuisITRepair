// ---------------------------------------------------------------------------
// Fuente UNICA de los estados de un servicio.
//
// Antes esta informacion vivia repartida en tres tablas que no coincidian
// (`status_map.js`, `estado_config.js` y `service_tracking_status.js`), asi que
// el mismo servicio podia llamarse "En reparacion" en el detalle y
// "reparacion" en el rastreador. Aqui se declara una sola vez: la clave que se
// guarda, la etiqueta que ve la persona y el tono visual del badge.
//
// REGLA DE COMPATIBILIDAD: las claves guardadas NO cambian. Un servicio creado
// hace un año guarda "revision" y lo seguira guardando; los nombres nuevos
// ("en_revision") entran como alias de lectura. Nunca se migran documentos.
//
// El modulo es puro -- no importa React ni Firestore -- para poder probarlo con
// `node --test` y para que la misma regla sirva en la pantalla, en el PDF y en
// el rastreador publico.
// ---------------------------------------------------------------------------

/** Origen de un cambio de estado. Quien lo provoco, no quien lo escribio. */
export const ORIGEN_NEGOCIO = "negocio";
export const ORIGEN_CLIENTE = "cliente";
export const ORIGEN_SISTEMA = "sistema";

// El tono NO es un color suelto: es una intencion. La hoja de estilos decide
// como se pinta cada tono, de modo que agregar un estado nunca obligue a
// inventar un color nuevo ni deje dos estados con el mismo aspecto por error.
//
//   neutral    -> todavia no pasa nada
//   info       -> el negocio esta trabajando en ello
//   espera     -> la pelota esta en la cancha del cliente o de un proveedor
//   positivo   -> avanzo bien
//   activo     -> hay trabajo fisico en curso
//   destacado  -> requiere accion inmediata del negocio (entregar)
//   final      -> el servicio se cerro bien
//   negativo   -> el servicio se cerro mal
//   apagado    -> se cerro sin culpa de nadie
export const ESTADOS_SERVICIO = [
  {
    key: "pendiente",
    label: "Pendiente",
    tono: "neutral",
    orden: 0,
    descripcion: "El equipo fue recibido y espera la revision inicial.",
  },
  {
    key: "revision",
    label: "En revision",
    tono: "info",
    orden: 1,
    descripcion: "Se esta revisando el equipo para identificar la falla.",
  },
  {
    key: "esperando_autorizacion",
    label: "Esperando autorizacion",
    tono: "espera",
    orden: 2,
    descripcion: "Se envio el presupuesto y se espera la respuesta del cliente.",
  },
  {
    key: "autorizado",
    label: "Autorizado",
    tono: "positivo",
    orden: 3,
    descripcion: "El cliente autorizo la orden de servicio.",
  },
  {
    key: "rechazado",
    label: "Rechazado por el cliente",
    tono: "negativo",
    orden: 3,
    descripcion: "El cliente no autorizo la orden de servicio.",
  },
  {
    key: "espera_refaccion",
    label: "Esperando refaccion",
    tono: "espera",
    orden: 4,
    descripcion: "El servicio espera piezas para poder continuar.",
  },
  {
    key: "reparacion",
    label: "En reparacion",
    tono: "activo",
    orden: 5,
    descripcion: "El equipo esta en proceso de reparacion.",
  },
  {
    key: "listo",
    label: "Listo para entregar",
    tono: "destacado",
    orden: 6,
    descripcion: "El trabajo termino y el equipo espera a ser entregado.",
  },
  {
    key: "entregado",
    label: "Entregado",
    tono: "final",
    orden: 7,
    cierra: true,
    descripcion: "El equipo fue entregado y el servicio esta concluido.",
  },
  {
    key: "no_reparable",
    label: "No reparable",
    tono: "apagado",
    orden: 8,
    descripcion: "El equipo no pudo repararse.",
  },
  {
    key: "cancelado",
    label: "Cancelado",
    tono: "negativo",
    orden: 8,
    descripcion: "El servicio fue cancelado.",
  },
  // `abandonado` NO es opcion de la lista: lo escribe solo el cierre automatico
  // por plazo vencido (`cerrarServiciosAbandonados`). Se declara aqui para que
  // el badge y el rastreador sepan pintarlo, no para ofrecerlo en un select.
  {
    key: "abandonado",
    label: "Cerrado por abandono",
    tono: "apagado",
    orden: 9,
    cierra: true,
    automatico: true,
    descripcion: "El servicio se cerro al superar el plazo de abandono.",
  },
];

const POR_CLAVE = new Map(ESTADOS_SERVICIO.map((estado) => [estado.key, estado]));

// Nombres alternos que apuntan a un estado ya existente. Incluye los nombres
// "largos" de la especificacion nueva y los historicos de `estado_config.js`,
// para que ningun servicio guardado quede sin etiqueta.
const ALIAS = {
  en_revision: "revision",
  revisando: "revision",
  diagnostico: "revision",
  en_diagnostico: "revision",
  cotizacion: "esperando_autorizacion",
  presupuesto: "esperando_autorizacion",
  esperando_aprobacion: "esperando_autorizacion",
  aprobado: "autorizado",
  autorizada: "autorizado",
  rechazada: "rechazado",
  rechazado_por_el_cliente: "rechazado",
  en_reparacion: "reparacion",
  reparando: "reparacion",
  trabajando: "reparacion",
  pruebas: "reparacion",
  en_pruebas: "reparacion",
  en_espera_de_refaccion: "espera_refaccion",
  espera_de_refaccion: "espera_refaccion",
  esperando_refaccion: "espera_refaccion",
  // `finalizado` siempre significo "el trabajo termino, falta entregar", que es
  // justo lo que hoy se llama `listo`. Ya se trataba asi en el detalle.
  finalizado: "listo",
  terminado: "listo",
  completado: "listo",
  listo_para_entregar: "listo",
};

/** Texto libre -> clave canonica. Nunca lanza: ante la duda, "pendiente". */
export function normalizarEstadoServicio(raw) {
  const limpio = String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  if (!limpio) return "pendiente";
  if (POR_CLAVE.has(limpio)) return limpio;
  if (Object.prototype.hasOwnProperty.call(ALIAS, limpio)) return ALIAS[limpio];
  return "pendiente";
}

/** Metadatos completos del estado (clave, etiqueta, tono, descripcion). */
export function getEstadoServicio(raw) {
  return POR_CLAVE.get(normalizarEstadoServicio(raw)) || POR_CLAVE.get("pendiente");
}

/** Etiqueta visible. Jamas devuelve la clave interna tipo "en_revision". */
export function etiquetaEstadoServicio(raw) {
  return getEstadoServicio(raw).label;
}

/** Tono del badge, para que la hoja de estilos no repita la tabla. */
export function tonoEstadoServicio(raw) {
  return getEstadoServicio(raw).tono;
}

/**
 * Estados que una persona puede elegir a mano, en orden de avance.
 *
 * `entregado` se ofrece solo si el servicio YA esta entregado (para no perder
 * el valor al abrir el select). Marcar como entregado se hace desde el cobro,
 * no cambiando un desplegable, y `abandonado` lo decide el sistema.
 */
export function getEstadosSeleccionables(estadoActual = "") {
  const actual = normalizarEstadoServicio(estadoActual);
  return ESTADOS_SERVICIO
    .filter((estado) => !estado.automatico)
    .filter((estado) => estado.key !== "entregado" || actual === "entregado")
    .sort((a, b) => a.orden - b.orden);
}

/** Cierra el servicio: ya no admite edicion operativa. */
export function esEstadoFinal(raw) {
  return getEstadoServicio(raw).cierra === true;
}

/** Termino su ciclo, con o sin exito. Util para no pedir precio final. */
export function esEstadoCerrado(raw) {
  const key = normalizarEstadoServicio(raw);
  return esEstadoFinal(key) || key === "cancelado" || key === "no_reparable";
}

// ---------------------------------------------------------------------------
// Transiciones automaticas.
//
// Deliberadamente son POCAS. El sistema solo mueve el estado cuando la accion
// no deja lugar a dudas: pedir la autorizacion y la respuesta del cliente.
// Empezar a reparar y entregar son decisiones del negocio y siguen siendo
// manuales -- que el cliente autorice no significa que alguien haya tomado el
// desarmador.
// ---------------------------------------------------------------------------

/** Estado al enviarle al cliente la solicitud de aceptacion. */
export function estadoAlSolicitarAceptacion(estadoActual) {
  const actual = normalizarEstadoServicio(estadoActual);
  // Un servicio ya cerrado no regresa a esperar firma por pedir el enlace.
  if (esEstadoFinal(actual)) return actual;
  return "esperando_autorizacion";
}

/**
 * Estado despues de que el cliente responde.
 *
 * Solo aplica si el servicio estaba realmente esperando esa respuesta. Si el
 * negocio ya avanzo (por ejemplo, ya esta reparando porque el cliente autorizo
 * por telefono), la firma se registra pero NO retrocede el estado.
 */
export function estadoTrasRespuestaCliente(estadoActual, respuesta) {
  const actual = normalizarEstadoServicio(estadoActual);
  if (actual !== "esperando_autorizacion") return actual;
  if (respuesta === "aceptado") return "autorizado";
  if (respuesta === "rechazado") return "rechazado";
  return actual;
}
