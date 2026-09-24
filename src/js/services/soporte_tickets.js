import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../initializer/firebase.js";
import { toMillis } from "./plan_features.js";

// ---------------------------------------------------------------------------
// Tickets de soporte con conversacion.
//
// Se siente como un chat, pero es un ticket: cada solicitud guarda su historia
// y su estado. No hay websockets ni presencia; Firestore ya avisa cuando la
// conversacion cambia, que es todo lo que hace falta.
//
//   soporte_tickets/{id}            -> la solicitud
//   soporte_tickets/{id}/mensajes   -> la conversacion
//
// Un mensaje con `interna: true` es una nota del equipo de CajaLibre. Las
// reglas de Firestore impiden que el cliente la lea, asi que no depende de que
// la pantalla se acuerde de esconderla.
// ---------------------------------------------------------------------------

export const TICKETS_COLLECTION = "soporte_tickets";
const MENSAJES_COLLECTION = "mensajes";

export const AUTOR_CLIENTE = "cliente";
export const AUTOR_SOPORTE = "soporte";

export const ESTADOS_TICKET = [
  { value: "abierto", label: "Abierto" },
  { value: "en_revision", label: "En revisión" },
  { value: "esperando_cliente", label: "Esperando tu respuesta" },
  { value: "respondido", label: "Respondido" },
  { value: "cerrado", label: "Cerrado" },
];

export const CATEGORIAS_TICKET = [
  { value: "ventas", label: "Problema con ventas" },
  { value: "inventario", label: "Inventario" },
  { value: "tickets", label: "Tickets / impresoras" },
  { value: "usuarios", label: "Usuarios" },
  { value: "restaurante", label: "Restaurante" },
  { value: "configuracion", label: "Configuración" },
  { value: "suscripcion", label: "Suscripción / Premium" },
  { value: "otro", label: "Otro" },
];

// Dos motivos de contacto distintos. Reportar una falla del sistema jamas se
// cobra; una sesion de acompañamiento para el plan gratuito si.
export const TIPO_SOPORTE_TECNICO = "tecnico";
export const TIPO_ASESORIA = "asesoria";

export const PRIORIDADES_TICKET = [
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Urgente: no puedo operar" },
];

function limpiar(value) {
  return String(value || "").trim();
}

export function etiquetaEstadoTicket(estado) {
  return ESTADOS_TICKET.find((item) => item.value === estado)?.label || "Abierto";
}

export function etiquetaCategoriaTicket(categoria) {
  return CATEGORIAS_TICKET.find((item) => item.value === categoria)?.label || "Otro";
}

export function normalizeTicket(raw = {}, id = "") {
  return {
    id: limpiar(id || raw?.id),
    negocioId: limpiar(raw?.negocioId),
    negocioNombre: limpiar(raw?.negocioNombre) || "Negocio",
    usuarioUid: limpiar(raw?.usuarioUid),
    usuarioNombre: limpiar(raw?.usuarioNombre) || "Usuario",
    usuarioCorreo: limpiar(raw?.usuarioCorreo),
    asunto: limpiar(raw?.asunto),
    categoria: limpiar(raw?.categoria) || "otro",
    tipo: raw?.tipo === TIPO_ASESORIA ? TIPO_ASESORIA : TIPO_SOPORTE_TECNICO,
    prioridad: raw?.prioridad === "alta" ? "alta" : "normal",
    estado: limpiar(raw?.estado) || "abierto",
    premium: raw?.premium === true,
    createdAt: toMillis(raw?.createdAt),
    updatedAt: toMillis(raw?.updatedAt),
    ultimoMensajeAt: toMillis(raw?.ultimoMensajeAt),
    ultimoMensajePor: limpiar(raw?.ultimoMensajePor),
    ultimoMensajeTexto: limpiar(raw?.ultimoMensajeTexto),
    sinLeerCliente: raw?.sinLeerCliente === true,
    sinLeerSoporte: raw?.sinLeerSoporte === true,
  };
}

export function normalizeMensaje(raw = {}, id = "") {
  return {
    id: limpiar(id || raw?.id),
    texto: String(raw?.texto || "").trim(),
    autor: raw?.autor === AUTOR_SOPORTE ? AUTOR_SOPORTE : AUTOR_CLIENTE,
    autorNombre: limpiar(raw?.autorNombre) || "Usuario",
    interna: raw?.interna === true,
    createdAt: toMillis(raw?.createdAt),
  };
}

function resumen(texto) {
  return String(texto || "").trim().slice(0, 160);
}

// --- Lado del negocio -------------------------------------------------------

export async function crearTicketSoporte({
  negocioId = "",
  negocioNombre = "",
  usuarioUid = "",
  usuarioNombre = "",
  usuarioCorreo = "",
  asunto = "",
  categoria = "otro",
  descripcion = "",
  prioridad = "normal",
  tipo = TIPO_SOPORTE_TECNICO,
  premium = false,
} = {}) {
  const safeNegocioId = limpiar(negocioId);
  const safeUid = limpiar(usuarioUid);
  if (!safeNegocioId || !safeUid) throw new Error("No se pudo identificar tu negocio.");
  if (!limpiar(asunto)) throw new Error("Escribe un asunto para tu solicitud.");
  if (!limpiar(descripcion)) throw new Error("Cuentanos que esta pasando.");

  const ahora = serverTimestamp();
  const ticketRef = await addDoc(collection(db, TICKETS_COLLECTION), {
    negocioId: safeNegocioId,
    cuentaPrincipalUid: safeNegocioId,
    negocioNombre: limpiar(negocioNombre) || "Negocio",
    usuarioUid: safeUid,
    usuarioNombre: limpiar(usuarioNombre) || "Usuario",
    usuarioCorreo: limpiar(usuarioCorreo),
    asunto: limpiar(asunto),
    categoria: limpiar(categoria) || "otro",
    tipo: tipo === TIPO_ASESORIA ? TIPO_ASESORIA : TIPO_SOPORTE_TECNICO,
    prioridad: prioridad === "alta" ? "alta" : "normal",
    estado: "abierto",
    // Se guarda el plan del momento para que el panel pueda ordenar sin leer
    // el negocio de cada ticket.
    premium: premium === true,
    createdAt: ahora,
    updatedAt: ahora,
    ultimoMensajeAt: ahora,
    ultimoMensajePor: AUTOR_CLIENTE,
    ultimoMensajeTexto: resumen(descripcion),
    sinLeerCliente: false,
    sinLeerSoporte: true,
  });

  await addDoc(collection(db, TICKETS_COLLECTION, ticketRef.id, MENSAJES_COLLECTION), {
    texto: String(descripcion).trim(),
    autor: AUTOR_CLIENTE,
    autorUid: safeUid,
    autorNombre: limpiar(usuarioNombre) || "Usuario",
    negocioId: safeNegocioId,
    interna: false,
    createdAt: ahora,
  });

  return ticketRef.id;
}

export function escucharTicketsDelNegocio(negocioId, onData, onError) {
  const safeNegocioId = limpiar(negocioId);
  if (!safeNegocioId) {
    onData?.([]);
    return () => {};
  }

  return onSnapshot(
    query(
      collection(db, TICKETS_COLLECTION),
      where("negocioId", "==", safeNegocioId),
      orderBy("ultimoMensajeAt", "desc"),
      limit(50),
    ),
    (snapshot) => onData?.(snapshot.docs.map((item) => normalizeTicket(item.data(), item.id))),
    (error) => onError?.(error),
  );
}

/**
 * Respuestas de soporte que el negocio todavia no ha leido.
 *
 * El aviso no se guarda como un documento aparte: el propio ticket ya dice que
 * hay algo nuevo, asi que responder no genera escrituras extra ni duplica el
 * mensaje en otra coleccion.
 */
export function escucharRespuestasSinLeer(negocioId, onData, onError) {
  const safeNegocioId = limpiar(negocioId);
  if (!safeNegocioId) {
    onData?.([]);
    return () => {};
  }

  return onSnapshot(
    query(
      collection(db, TICKETS_COLLECTION),
      where("negocioId", "==", safeNegocioId),
      where("sinLeerCliente", "==", true),
      limit(10),
    ),
    (snapshot) => onData?.(snapshot.docs.map((item) => normalizeTicket(item.data(), item.id))),
    (error) => onError?.(error),
  );
}

/**
 * Conversacion visible. El cliente pide explicitamente los mensajes que no son
 * internos: es lo unico que las reglas le dejan leer, asi que la consulta y el
 * permiso dicen exactamente lo mismo.
 */
export function escucharMensajesTicket(ticketId, { incluirInternas = false } = {}, onData, onError) {
  const safeId = limpiar(ticketId);
  if (!safeId) {
    onData?.([]);
    return () => {};
  }

  const base = collection(db, TICKETS_COLLECTION, safeId, MENSAJES_COLLECTION);
  const consulta = incluirInternas
    ? query(base, orderBy("createdAt", "asc"), limit(200))
    : query(base, where("interna", "==", false), orderBy("createdAt", "asc"), limit(200));

  return onSnapshot(
    consulta,
    (snapshot) => onData?.(snapshot.docs.map((item) => normalizeMensaje(item.data(), item.id))),
    (error) => onError?.(error),
  );
}

export async function responderTicket({
  ticketId = "",
  negocioId = "",
  texto = "",
  autor = AUTOR_CLIENTE,
  autorUid = "",
  autorNombre = "",
  interna = false,
} = {}) {
  const safeId = limpiar(ticketId);
  const cuerpo = String(texto || "").trim();
  if (!safeId || !cuerpo) return;

  const esSoporte = autor === AUTOR_SOPORTE;
  const ahora = serverTimestamp();

  await addDoc(collection(db, TICKETS_COLLECTION, safeId, MENSAJES_COLLECTION), {
    texto: cuerpo,
    autor: esSoporte ? AUTOR_SOPORTE : AUTOR_CLIENTE,
    autorUid: limpiar(autorUid),
    autorNombre: limpiar(autorNombre) || (esSoporte ? "Soporte CajaLibre" : "Usuario"),
    negocioId: limpiar(negocioId),
    interna: esSoporte && interna === true,
    createdAt: ahora,
  });

  // Una nota interna no cambia el estado del ticket ni avisa al cliente:
  // para el negocio no ha pasado nada.
  if (esSoporte && interna === true) {
    await updateDoc(doc(db, TICKETS_COLLECTION, safeId), { updatedAt: ahora });
    return;
  }

  await updateDoc(doc(db, TICKETS_COLLECTION, safeId), {
    updatedAt: ahora,
    ultimoMensajeAt: ahora,
    ultimoMensajePor: esSoporte ? AUTOR_SOPORTE : AUTOR_CLIENTE,
    ultimoMensajeTexto: resumen(cuerpo),
    estado: esSoporte ? "respondido" : "abierto",
    sinLeerCliente: esSoporte,
    sinLeerSoporte: !esSoporte,
  });
}

export async function marcarTicketLeido(ticketId, porSoporte = false) {
  const safeId = limpiar(ticketId);
  if (!safeId) return;
  await updateDoc(doc(db, TICKETS_COLLECTION, safeId), {
    [porSoporte ? "sinLeerSoporte" : "sinLeerCliente"]: false,
  }).catch(() => {});
}

// --- Panel de administracion ------------------------------------------------

export function escucharTodosLosTickets(onData, onError) {
  return onSnapshot(
    query(collection(db, TICKETS_COLLECTION), orderBy("ultimoMensajeAt", "desc"), limit(200)),
    (snapshot) => onData?.(snapshot.docs.map((item) => normalizeTicket(item.data(), item.id))),
    (error) => onError?.(error),
  );
}

export async function cambiarEstadoTicket(ticketId, estado) {
  const safeId = limpiar(ticketId);
  const safeEstado = limpiar(estado);
  if (!safeId || !ESTADOS_TICKET.some((item) => item.value === safeEstado)) return;
  await updateDoc(doc(db, TICKETS_COLLECTION, safeId), {
    estado: safeEstado,
    updatedAt: serverTimestamp(),
  });
}

export async function listarTicketsDelNegocio(negocioId, tope = 50) {
  const safeNegocioId = limpiar(negocioId);
  if (!safeNegocioId) return [];
  const snapshot = await getDocs(
    query(
      collection(db, TICKETS_COLLECTION),
      where("negocioId", "==", safeNegocioId),
      orderBy("ultimoMensajeAt", "desc"),
      limit(tope),
    ),
  );
  return snapshot.docs.map((item) => normalizeTicket(item.data(), item.id));
}

// --- Costo de la asesoria personalizada -------------------------------------
//
// El precio por hora se configura desde Administracion. Mientras no exista, la
// pantalla dice que tiene costo pero NO inventa una cifra.

const ASESORIA_DOC = doc(db, "configuracion_cajalibre", "asesoria");

export function normalizeAsesoriaConfig(raw = {}) {
  const precio = Number(raw?.precioPorHora);
  return {
    precioPorHora: Number.isFinite(precio) && precio > 0 ? precio : 0,
    moneda: limpiar(raw?.moneda) || "MXN",
    nota: String(raw?.nota || "").trim(),
  };
}

export function escucharConfigAsesoria(onData, onError) {
  return onSnapshot(
    ASESORIA_DOC,
    (snapshot) => onData?.(normalizeAsesoriaConfig(snapshot.exists() ? snapshot.data() : {})),
    (error) => onError?.(error),
  );
}

export async function guardarConfigAsesoria(config = {}) {
  await setDoc(
    ASESORIA_DOC,
    {
      ...normalizeAsesoriaConfig(config),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
