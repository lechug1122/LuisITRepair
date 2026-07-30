import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../initializer/firebase";
import { resolveTenantId, withTenantData } from "./tenant";

const COLLECTION = "restaurante_ordenes";
const TABLE_GROUPS_CONFIG = "restaurante_grupos_mesas";
const OPERATION_CONFIG = "restaurante_operacion";

function timestampMs(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value || 0);
}

export async function crearOrdenRestaurante(data = {}, tenantId = "") {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) throw new Error("No se pudo identificar el negocio.");

  const payload = withTenantData({
    pisoId: String(data.pisoId || "").trim(),
    pisoNombre: String(data.pisoNombre || "").trim(),
    mesaNumero: Number(data.mesaNumero || 0),
    mesaKey: String(data.mesaKey || "").trim(),
    mesaKeys: Array.isArray(data.mesaKeys)
      ? data.mesaKeys.map((item) => String(item || "").trim()).filter(Boolean)
      : [String(data.mesaKey || "").trim()].filter(Boolean),
    mesaEtiqueta: String(data.mesaEtiqueta || "").trim(),
    tipoServicio: String(data.tipoServicio || "mesa").trim(),
    clienteNombre: String(data.clienteNombre || "").trim(),
    mesaAsignada: data.mesaAsignada !== false,
    items: Array.isArray(data.items) ? data.items : [],
    nota: String(data.nota || "").trim(),
    total: Number(data.total || 0),
    status: "nueva",
    creadaPorUid: String(data.creadaPorUid || "").trim(),
    creadaPorNombre: String(data.creadaPorNombre || "").trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, negocioId);

  const ref = await addDoc(collection(db, COLLECTION), payload);
  return { id: ref.id, ...payload };
}

export async function asignarMesaOrdenRestaurante(
  orderId,
  {
    pisoId = "",
    pisoNombre = "",
    mesaNumero = 0,
    mesaKey = "",
    mesaKeys = [],
    mesaEtiqueta = "",
    actorUid = "",
    actorNombre = "",
  } = {},
) {
  const id = String(orderId || "").trim();
  const key = String(mesaKey || "").trim();
  if (!id || !key) throw new Error("Selecciona una orden y una mesa válidas.");

  const ref = doc(db, COLLECTION, id);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("La orden ya no existe.");
    const current = snapshot.data() || {};
    if (current.tipoServicio !== "comer_aqui" || current.mesaAsignada === true) {
      throw new Error("Esta orden ya tiene una mesa asignada.");
    }

    transaction.update(ref, {
      pisoId: String(pisoId || "").trim(),
      pisoNombre: String(pisoNombre || "").trim(),
      mesaNumero: Number(mesaNumero || 0),
      mesaKey: key,
      mesaKeys: Array.isArray(mesaKeys) && mesaKeys.length ? mesaKeys.map(String) : [key],
      mesaEtiqueta: String(mesaEtiqueta || "").trim() || `Mesa ${mesaNumero}`,
      mesaAsignada: true,
      mesaAsignadaPorUid: String(actorUid || "").trim(),
      mesaAsignadaPorNombre: String(actorNombre || "").trim(),
      mesaAsignadaAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function cobrarOrdenesRestaurante(
  orderIds = [],
  {
    ventaData = null,
    metodoPago = "",
    referenciaPago = "",
    total = 0,
    propina = 0,
    actorUid = "",
    actorNombre = "",
  } = {},
) {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(String).filter(Boolean))];
  if (!ids.length) throw new Error("No hay órdenes para cobrar.");

  const batch = writeBatch(db);
  const ventaRef = doc(collection(db, "ventas"));
  if (ventaData) {
    batch.set(ventaRef, withTenantData(ventaData));
  }
  ids.forEach((id) => {
    batch.update(doc(db, COLLECTION, id), {
      status: "cobrada",
      ventaId: ventaRef.id,
      metodoPago: String(metodoPago || "").trim(),
      referenciaPago: String(referenciaPago || "").trim(),
      totalCobradoCuenta: Number(total || 0),
      propina: Number(propina || 0),
      cobradaPorUid: String(actorUid || "").trim(),
      cobradaPorNombre: String(actorNombre || "").trim(),
      cobradaAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return { ventaId: ventaRef.id };
}

export function escucharGruposMesasRestaurante(tenantId = "", onItems, onError) {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) return () => {};

  return onSnapshot(
    doc(db, "configuracion", `${TABLE_GROUPS_CONFIG}__${negocioId}`),
    (snapshot) => {
      const grupos = snapshot.exists() && Array.isArray(snapshot.data()?.grupos)
        ? snapshot.data().grupos
        : [];
      onItems?.(grupos);
    },
    onError,
  );
}

export async function guardarGruposMesasRestaurante(grupos = [], tenantId = "") {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) throw new Error("No se pudo identificar el negocio.");

  const gruposLimpios = (Array.isArray(grupos) ? grupos : []).map((grupo) => ({
    id: String(grupo?.id || "").trim(),
    principalMesaKey: String(grupo?.principalMesaKey || "").trim(),
    mesaKeys: Array.isArray(grupo?.mesaKeys)
      ? [...new Set(grupo.mesaKeys.map((item) => String(item || "").trim()).filter(Boolean))]
      : [],
    etiqueta: String(grupo?.etiqueta || "").trim(),
  })).filter((grupo) => grupo.id && grupo.principalMesaKey && grupo.mesaKeys.length > 1);

  await setDoc(
    doc(db, "configuracion", `${TABLE_GROUPS_CONFIG}__${negocioId}`),
    withTenantData({
      grupos: gruposLimpios,
      updatedAt: serverTimestamp(),
    }, negocioId),
    { merge: true },
  );
}

function localDateKey() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function normalizeOperacionRestaurante(raw = {}) {
  const fechaActual = localDateKey();
  return {
    limiteCocineroActivo: raw?.limiteCocineroActivo === true,
    maxPlatillosPorCocinero: Math.max(1, Number(raw?.maxPlatillosPorCocinero) || 10),
    minutosAlertaCocina: Math.max(1, Math.min(180, Number(raw?.minutosAlertaCocina) || 15)),
    pagosPersonalActivos: raw?.pagosPersonalActivos === true,
    porcentajeMesero: Math.max(0, Math.min(100, Number(raw?.porcentajeMesero) || 0)),
    porcentajeCocinero: Math.max(0, Math.min(100, Number(raw?.porcentajeCocinero) || 0)),
    fechaDisponibilidad: String(raw?.fechaDisponibilidad || ""),
    platillosAgotados: String(raw?.fechaDisponibilidad || "") === fechaActual
      && Array.isArray(raw?.platillosAgotados)
      ? raw.platillosAgotados.map(String)
      : [],
  };
}

export function escucharOperacionRestaurante(tenantId = "", onData, onError) {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) return () => {};

  return onSnapshot(
    doc(db, "configuracion", `${OPERATION_CONFIG}__${negocioId}`),
    (snapshot) => onData?.(normalizeOperacionRestaurante(snapshot.exists() ? snapshot.data() : {})),
    onError,
  );
}

export async function guardarOperacionRestaurante(data = {}, tenantId = "") {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) throw new Error("No se pudo identificar el negocio.");
  const current = normalizeOperacionRestaurante(data);

  await setDoc(
    doc(db, "configuracion", `${OPERATION_CONFIG}__${negocioId}`),
    withTenantData({
      limiteCocineroActivo: current.limiteCocineroActivo,
      maxPlatillosPorCocinero: current.maxPlatillosPorCocinero,
      minutosAlertaCocina: current.minutosAlertaCocina,
      pagosPersonalActivos: current.pagosPersonalActivos,
      porcentajeMesero: current.porcentajeMesero,
      porcentajeCocinero: current.porcentajeCocinero,
      updatedAt: serverTimestamp(),
    }, negocioId),
    { merge: true },
  );
}

export async function guardarPlatillosAgotadosRestaurante(ids = [], tenantId = "") {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) throw new Error("No se pudo identificar el negocio.");

  await setDoc(
    doc(db, "configuracion", `${OPERATION_CONFIG}__${negocioId}`),
    withTenantData({
      fechaDisponibilidad: localDateKey(),
      platillosAgotados: [...new Set((Array.isArray(ids) ? ids : []).map(String))],
      updatedAt: serverTimestamp(),
    }, negocioId),
    { merge: true },
  );
}

export function escucharOrdenesRestaurante(tenantId = "", onItems, onError) {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) return () => {};

  const ordersQuery = query(
    collection(db, COLLECTION),
    where("cuentaPrincipalUid", "==", negocioId),
  );

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      const orders = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => timestampMs(a.createdAt) - timestampMs(b.createdAt));
      onItems?.(orders);
    },
    onError,
  );
}

export async function actualizarEstadoOrdenRestaurante(
  orderId,
  status,
  { actorUid = "", actorNombre = "" } = {},
) {
  const id = String(orderId || "").trim();
  if (!id) throw new Error("Orden no válida.");

  const ref = doc(db, COLLECTION, id);
  const safeActorUid = String(actorUid || "").trim();
  const safeActorNombre = String(actorNombre || "").trim();

  await updateDoc(ref, {
    status,
    atendidaPorUid: safeActorUid,
    atendidaPorNombre: safeActorNombre,
    updatedAt: serverTimestamp(),
    ...(status === "preparando" ? { preparacionIniciadaAt: serverTimestamp() } : {}),
    ...(status === "lista" ? { listaAt: serverTimestamp() } : {}),
  });

  return { ok: true };
}

export async function cancelarOrdenesRestaurante(
  orderIds = [],
  { motivo = "", actorUid = "", actorNombre = "" } = {},
) {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(String).filter(Boolean))];
  const motivoLimpio = String(motivo || "").trim();
  if (!ids.length) throw new Error("No hay órdenes para cancelar.");
  if (motivoLimpio.length < 3) throw new Error("Escribe el motivo de la cancelación.");
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(doc(db, COLLECTION, id), {
    status: "cancelada",
    cancelacionMotivo: motivoLimpio,
    canceladaPorUid: String(actorUid || "").trim(),
    canceladaPorNombre: String(actorNombre || "").trim(),
    canceladaAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  await batch.commit();
}

const RESERVATIONS_COLLECTION = "restaurante_reservaciones";
const SHIFTS_COLLECTION = "restaurante_turnos";

export function escucharReservacionesRestaurante(tenantId = "", onItems, onError) {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) return () => {};
  return onSnapshot(
    query(collection(db, RESERVATIONS_COLLECTION), where("cuentaPrincipalUid", "==", negocioId)),
    (snapshot) => onItems?.(snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.fechaHora || "").localeCompare(String(b.fechaHora || "")))),
    onError,
  );
}

export async function guardarReservacionRestaurante(data = {}, tenantId = "") {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) throw new Error("No se pudo identificar el negocio.");
  const payload = withTenantData({
    clienteNombre: String(data.clienteNombre || "").trim(),
    telefono: String(data.telefono || "").trim(),
    personas: Math.max(1, Number(data.personas || 1)),
    fechaHora: String(data.fechaHora || "").trim(),
    notas: String(data.notas || "").trim(),
    estado: String(data.estado || "reservada"),
    mesaKey: String(data.mesaKey || "").trim(),
    mesaNumero: Math.max(0, Number(data.mesaNumero || 0)),
    mesaEtiqueta: String(data.mesaEtiqueta || "").trim(),
    pisoId: String(data.pisoId || "").trim(),
    pisoNombre: String(data.pisoNombre || "").trim(),
    updatedAt: serverTimestamp(),
  }, negocioId);
  if (!payload.clienteNombre || !payload.fechaHora) throw new Error("Nombre y fecha son obligatorios.");
  if (data.id) {
    await updateDoc(doc(db, RESERVATIONS_COLLECTION, String(data.id)), payload);
    return String(data.id);
  }
  const ref = await addDoc(collection(db, RESERVATIONS_COLLECTION), { ...payload, createdAt: serverTimestamp() });
  return ref.id;
}

export async function actualizarEstadoReservacionRestaurante(id, estado) {
  await updateDoc(doc(db, RESERVATIONS_COLLECTION, String(id)), {
    estado: String(estado || "reservada"),
    updatedAt: serverTimestamp(),
  });
}

export async function obtenerTurnoActivoRestaurante(tenantId = "", actorUid = "") {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId || !actorUid) return null;
  const snapshot = await getDocs(
    query(collection(db, SHIFTS_COLLECTION), where("cuentaPrincipalUid", "==", negocioId)),
  );
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.actorUid === actorUid && item.estado === "abierto")
    .sort((a, b) => timestampMs(b.inicioAt) - timestampMs(a.inicioAt))[0] || null;
}

export async function iniciarTurnoRestaurante({ rol = "", actorUid = "", actorNombre = "" } = {}, tenantId = "") {
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId || !actorUid) throw new Error("No se pudo identificar al empleado.");
  const ref = await addDoc(collection(db, SHIFTS_COLLECTION), withTenantData({
    rol: String(rol || "").trim(),
    actorUid: String(actorUid),
    actorNombre: String(actorNombre || "").trim(),
    estado: "abierto",
    inicioAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, negocioId));
  return { id: ref.id, rol, actorUid, actorNombre, estado: "abierto", inicioAt: new Date() };
}

export async function cerrarTurnoRestaurante(id, resumen = {}) {
  if (!id) throw new Error("No hay un turno abierto.");
  await updateDoc(doc(db, SHIFTS_COLLECTION, String(id)), {
    estado: "cerrado",
    cierreAt: serverTimestamp(),
    resumen,
    updatedAt: serverTimestamp(),
  });
}
