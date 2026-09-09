// Consultas del panel de superadmin.
//
// Reglas de esta capa:
//  - Nunca leer colecciones operativas (ventas, clientes, servicios, fiados,
//    cortes). El superadmin administra CajaLibre, no la operacion comercial
//    privada de cada negocio.
//  - Unica excepcion: el catalogo de productos, que se lee SOLO bajo peticion
//    explicita al descargar el expediente de un negocio concreto. Nunca se
//    carga para la tabla, el resumen ni la analitica.
//  - Nunca traer la coleccion completa: todo va paginado con limit/startAfter.
//  - Los totales se resuelven con agregaciones (getCountFromServer), que se
//    cobran por bloques de 1000 entradas de indice en vez de por documento.

import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "../../initializer/firebase";
import { normalizeNegocio } from "./negocios";
import { resolverPlanNegocio } from "./plan_negocio";
import { clasificarActividad } from "./actividad_negocio";

export const TAMANOS_PAGINA = [25, 50, 100];

export const ORDENES = [
  { id: "recientes", label: "Más recientes", campo: "createdAt", dir: "desc" },
  { id: "antiguos", label: "Más antiguos", campo: "createdAt", dir: "asc" },
  { id: "nombre", label: "Nombre", campo: "nombre", dir: "asc" },
  // Ojo: ordenar por este campo deja fuera a los negocios que todavia no lo
  // tienen sellado (Firestore excluye documentos sin el campo del orderBy).
  { id: "actividad", label: "Última actividad", campo: "ultimaActividad", dir: "desc" },
  { id: "usuarios", label: "Más usuarios", campo: "conteos.usuariosTotal", dir: "desc" },
];

const ESTADOS_BLOQUEO = ["bloqueado", "suspendido"];

function diasAtras(dias) {
  return new Date(Date.now() - dias * 86400000);
}

/** Enriquece un documento de negocio con plan y actividad ya resueltos. */
export function decorarNegocio(raw, id, ahora = Date.now()) {
  const negocio = normalizeNegocio(raw, id);
  const ultimaActividadMs = negocio.ultimaActividad?.toMillis?.()
    || (negocio.ultimaActividad ? new Date(negocio.ultimaActividad).getTime() : 0);
  const ultimoAccesoMs = negocio.ultimoAcceso?.toMillis?.()
    || (negocio.ultimoAcceso ? new Date(negocio.ultimoAcceso).getTime() : 0);

  return {
    ...negocio,
    plan: resolverPlanNegocio(negocio, ahora),
    actividad: clasificarActividad(ultimaActividadMs || ultimoAccesoMs, ahora),
    ultimaActividadMs: ultimaActividadMs || 0,
    ultimoAccesoMs: ultimoAccesoMs || 0,
  };
}

/**
 * Construye las restricciones del listado. Se mantienen a un solo campo
 * filtrado a la vez para no exigir indices compuestos: el resto del refinado
 * (busqueda por texto) se hace sobre la pagina ya cargada.
 */
function restriccionesDe(filtro = "todos") {
  if (filtro === "bloqueados") return [where("estado", "in", ESTADOS_BLOQUEO)];
  if (filtro === "incompletos") return [where("setupCompleto", "==", false)];
  if (filtro === "premium") return [where("premiumUntil", ">", new Date())];
  return [];
}

/**
 * Una pagina de negocios. `cursor` es el ultimo QueryDocumentSnapshot recibido,
 * tal como lo pide startAfter.
 */
export async function listarNegociosPagina({
  pageSize = 25,
  cursor = null,
  orden = "recientes",
  filtro = "todos",
} = {}) {
  const config = ORDENES.find((item) => item.id === orden) || ORDENES[0];
  const restricciones = restriccionesDe(filtro);
  // Firestore exige ordenar primero por el campo del rango cuando hay uno.
  const ordenamientos = filtro === "premium" && config.campo !== "premiumUntil"
    ? [orderBy("premiumUntil", "desc")]
    : [orderBy(config.campo, config.dir)];

  const partes = [...restricciones, ...ordenamientos, limit(pageSize)];
  if (cursor) partes.push(startAfter(cursor));

  const snap = await getDocs(query(collection(db, "negocios"), ...partes));
  const ahora = Date.now();

  return {
    negocios: snap.docs.map((item) => decorarNegocio(item.data(), item.id, ahora)),
    cursor: snap.docs.at(-1) || null,
    hayMas: snap.docs.length === pageSize,
  };
}

async function contar(...restricciones) {
  const snap = await getCountFromServer(query(collection(db, "negocios"), ...restricciones));
  return snap.data().count || 0;
}

/**
 * Tarjetas de resumen. Todo por agregacion: no descarga ni un documento de
 * negocio, y ninguna cifra proviene de datos comerciales.
 */
export async function obtenerResumenGlobal() {
  const ahora = new Date();
  const [negocios, premium, bloqueados, incompletos, activos7, activos30, usuarios] =
    await Promise.all([
      contar(),
      contar(where("premiumUntil", ">", ahora)),
      contar(where("estado", "in", ESTADOS_BLOQUEO)),
      contar(where("setupCompleto", "==", false)),
      contar(where("ultimaActividad", ">=", diasAtras(7))),
      // Se cuenta por complemento: una consulta con where sobre
      // `ultimaActividad` excluye los negocios que aun no tienen el campo, y
      // esos son precisamente los que nunca han registrado uso.
      contar(where("ultimaActividad", ">=", diasAtras(30))),
      getCountFromServer(collection(db, "autorizados")).then((s) => s.data().count || 0),
    ]);

  return {
    negocios,
    premium,
    free: Math.max(0, negocios - premium),
    bloqueados,
    incompletos,
    activos7,
    inactivos30: Math.max(0, negocios - activos30),
    usuarios,
  };
}

/** Usuarios de un negocio. Solo datos de cuenta, nunca operativos. */
export async function obtenerUsuariosNegocio(negocioId = "") {
  const safeId = String(negocioId || "").trim();
  if (!safeId) return [];

  const snap = await getDocs(
    query(collection(db, "autorizados"), where("negocioId", "==", safeId)),
  );

  return snap.docs.map((item) => {
    const data = item.data() || {};
    const deshabilitado = data.activo === false || data.estado === "Deshabilitado";
    const pendiente = !deshabilitado && (data.estado === "Pendiente" || data.activo === null);
    return {
      id: item.id,
      uid: String(data.uid || item.id),
      nombre: String(data.nombre || "").trim(),
      correo: String(data.correo || "").trim(),
      rol: String(data.rol || "").trim(),
      esTitular: String(data.cuentaPrincipalUid || "") === item.id,
      estado: deshabilitado ? "Deshabilitado" : pendiente ? "Pendiente" : "Activo",
      activo: !deshabilitado,
      lastActive: data.lastActive || null,
      createdAt: data.createdAt || null,
    };
  }).sort((a, b) => Number(b.esTitular) - Number(a.esTitular)
    || a.nombre.localeCompare(b.nombre, "es"));
}

/** Historial administrativo ya existente del negocio (no se crea coleccion nueva). */
export async function obtenerHistorialAdmin(negocioId = "", cantidad = 40) {
  const safeId = String(negocioId || "").trim();
  if (!safeId) return [];
  const snap = await getDocs(
    query(
      collection(db, "negocios", safeId, "admin_bitacora"),
      orderBy("createdAt", "desc"),
      limit(cantidad),
    ),
  );
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

/**
 * Registra una accion administrativa relevante en la bitacora que ya usa el
 * sistema. Solo acciones importantes: nunca visitas ni clics del superadmin.
 */
export async function registrarAccionAdmin({
  negocioId,
  action,
  actorUid = "",
  detalle = "",
} = {}) {
  const safeId = String(negocioId || "").trim();
  const safeAction = String(action || "").trim();
  if (!safeId || !safeAction) return;

  const docId = `${safeAction}__${safeId}__${Date.now()}`.replace(/[^a-z0-9_-]/gi, "_");
  await setDoc(doc(db, "negocios", safeId, "admin_bitacora", docId), {
    tipo: safeAction,
    negocioId: safeId,
    actorUid: String(actorUid || ""),
    detalle: String(detalle || "").slice(0, 500),
    origen: "superadmin",
    createdAt: serverTimestamp(),
  });
}

// Tope de productos por expediente. Un catalogo enorme no debe convertir una
// descarga en miles de lecturas silenciosas.
export const MAX_PRODUCTOS_EXPORT = 5000;

/**
 * Catalogo de productos de un negocio.
 *
 * Se consulta unicamente cuando el superadmin pide descargar el expediente de
 * ese negocio: no se precarga en la tabla ni alimenta ninguna estadistica.
 * Devuelve el inventario (que hay dado de alta), NO el historial de ventas.
 */
export async function obtenerProductosNegocio(negocioId = "", tope = MAX_PRODUCTOS_EXPORT) {
  const safeId = String(negocioId || "").trim();
  if (!safeId) return { productos: [], truncado: false };

  const snap = await getDocs(
    query(collection(db, "negocios", safeId, "productos"), limit(tope + 1)),
  );
  const docs = snap.docs.slice(0, tope);

  return {
    productos: docs.map((item) => ({ id: item.id, ...item.data() })),
    truncado: snap.docs.length > tope,
  };
}
