// ---------------------------------------------------------------------------
// Historial de estados de un servicio.
//
// POR QUE ES UN MAPA Y NO UN ARREGLO
//
// Firestore no acepta `serverTimestamp()` dentro de un arreglo: el centinela
// solo puede ir en una ruta de campo. Guardar el historial como arreglo
// obligaria a sellar cada paso con la hora del equipo del usuario -- justo lo
// que no se quiere para un registro que puede tener valor probatorio.
//
// Guardado como mapa, cada entrada es su propia ruta
// (`historialEstados.h_xxx.fecha`) y puede llevar la hora del SERVIDOR. Como
// regalo: dos personas que cambian el estado a la vez escriben claves
// distintas, asi que ninguna pisa a la otra (con un arreglo, la segunda
// reescribia el arreglo completo y borraba el paso de la primera).
//
// Hacia afuera esto no se nota: `leerHistorialEstados()` siempre devuelve una
// lista ordenada, y acepta tanto el mapa nuevo como un arreglo, por si algun
// documento quedo guardado con la forma antigua.
// ---------------------------------------------------------------------------

import {
  ORIGEN_NEGOCIO,
  ORIGEN_SISTEMA,
  etiquetaEstadoServicio,
  normalizarEstadoServicio,
} from "./servicio_estados.js";

/** Milisegundos desde Timestamp de Firestore, Date, numero o texto. 0 si no hay. */
export function fechaAMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * Clave de una entrada. Lleva el instante al frente para que el orden
 * alfabetico coincida con el cronologico aunque falte la fecha del servidor,
 * y una cola aleatoria para que dos cambios del mismo milisegundo no choquen.
 *
 * Sin puntos ni barras: la clave forma parte de una ruta de campo de Firestore.
 */
export function nuevaClaveHistorial(ahoraMs = Date.now(), aleatorio = Math.random()) {
  const sello = String(ahoraMs).padStart(14, "0");
  const cola = aleatorio.toString(36).slice(2, 8).padEnd(6, "0");
  return `h${sello}${cola}`;
}

/**
 * Entrada de historial lista para guardar. `fecha` la pone quien escribe
 * (con `serverTimestamp()` desde la app, con la hora del servidor desde una
 * Cloud Function), porque este modulo es puro y no conoce Firestore.
 */
export function construirEntradaHistorial({
  estado,
  usuarioId = "",
  usuarioNombre = "",
  origen = ORIGEN_NEGOCIO,
  nota = "",
} = {}) {
  return {
    estado: normalizarEstadoServicio(estado),
    usuarioId: String(usuarioId || "").trim(),
    usuarioNombre: String(usuarioNombre || "").trim(),
    origen: String(origen || ORIGEN_NEGOCIO).trim(),
    nota: String(nota || "").trim(),
  };
}

function normalizarEntrada(raw, claveFallback = "") {
  if (!raw || typeof raw !== "object") return null;
  const estado = normalizarEstadoServicio(raw.estado);
  const fechaMs = fechaAMillis(raw.fecha);
  return {
    id: String(raw.id || claveFallback || ""),
    estado,
    etiqueta: etiquetaEstadoServicio(estado),
    fecha: raw.fecha || null,
    fechaMs,
    usuarioId: String(raw.usuarioId || ""),
    usuarioNombre: String(raw.usuarioNombre || ""),
    origen: String(raw.origen || ORIGEN_NEGOCIO),
    nota: String(raw.nota || ""),
  };
}

/**
 * Historial completo, en orden cronologico.
 *
 * Un servicio anterior a esta funcion no tiene historial guardado y no por eso
 * debe verse vacio: se sintetiza su primer paso a partir de `createdAt`, que
 * es un dato real del documento. La entrada sintetica se marca con
 * `sintetica: true` para que la interfaz pueda distinguirla de un paso
 * realmente registrado.
 */
export function leerHistorialEstados(servicio = {}) {
  const crudo = servicio?.historialEstados;
  let entradas = [];

  if (Array.isArray(crudo)) {
    entradas = crudo.map((item, indice) => normalizarEntrada(item, `h_legacy_${indice}`));
  } else if (crudo && typeof crudo === "object") {
    entradas = Object.entries(crudo).map(([clave, item]) => normalizarEntrada(item, clave));
  }

  entradas = entradas.filter(Boolean).sort((a, b) => {
    if (a.fechaMs !== b.fechaMs) return a.fechaMs - b.fechaMs;
    return String(a.id).localeCompare(String(b.id));
  });

  const creadoMs = fechaAMillis(servicio?.createdAt);
  const faltaInicio = !entradas.some((item) => item.origen === ORIGEN_SISTEMA && item.estado === "pendiente");

  if (creadoMs && faltaInicio) {
    entradas.unshift({
      id: "h_creacion",
      estado: "pendiente",
      etiqueta: "Servicio recibido",
      fecha: servicio.createdAt,
      fechaMs: creadoMs,
      usuarioId: "",
      usuarioNombre: "",
      origen: ORIGEN_SISTEMA,
      nota: "",
      sintetica: true,
    });
  }

  // Un servicio viejo tampoco tiene registrado su estado actual. Se agrega al
  // final, sin fecha, para que la linea de tiempo muestre donde esta parado.
  const estadoActual = normalizarEstadoServicio(servicio?.status);
  const ultimo = entradas[entradas.length - 1];
  if (!ultimo || ultimo.estado !== estadoActual) {
    entradas.push({
      id: "h_actual",
      estado: estadoActual,
      etiqueta: etiquetaEstadoServicio(estadoActual),
      fecha: servicio?.updatedAt || null,
      fechaMs: fechaAMillis(servicio?.updatedAt),
      usuarioId: "",
      usuarioNombre: "",
      origen: ORIGEN_SISTEMA,
      nota: "",
      sintetica: true,
    });
  }

  return entradas;
}

/** Cuantos cambios de estado quedaron realmente registrados. */
export function contarCambiosRegistrados(servicio = {}) {
  return leerHistorialEstados(servicio).filter((item) => !item.sintetica).length;
}
