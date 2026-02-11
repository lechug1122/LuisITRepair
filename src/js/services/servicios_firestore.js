import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

import { db } from "../../initializer/firebase";
import { generarFolio } from "../utils_folio";

/* =========================
   Helpers status
========================= */
function normalizarStatus(raw) {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_ ]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

function isFinalStatus(status) {
  const s = normalizarStatus(status);
  return s === "entregado" || s === "cancelado" || s === "no_reparable";
}

/* =========================
   ✅ Folio helpers (índice único)
========================= */
function folioToKey(folio) {
  return (folio || "").trim().replace(/\//g, "-"); // Firestore NO permite "/" en IDs
}

function throwNice(msg) {
  throw new Error(msg);
}

/* =========================
   ✅ arma un payload LIMPIO según tipoDispositivo
   ✅ IMPORTANTE: folio estable (no se regenera si ya existe)
========================= */
async function construirPayload(form) {
  const tipo = form.tipoDispositivo;

  // ✅ Folio estable (await OBLIGATORIO)
  const folioFinal = (
    form.folio || (await generarFolio(form.marca)) || ""
  ).trim();

  const payload = {
    clienteId: form.clienteId || null,
    nombre: form.nombre || "",
    direccion: form.direccion || "",
    telefono: form.telefono || "",

    tipoDispositivo: tipo || "",
    marca: form.marca || "",
    modelo: form.modelo || "",

    trabajo: form.trabajo || "",
    precioDespues: !!form.precioDespues,
    costo: form.precioDespues ? "" : form.costo || "",

    entregado: false,
    fechaEntregado: null,

    folio: folioFinal,
    status: "pendiente",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (tipo === "laptop" || tipo === "pc") {
    payload.laptopPc = {
      procesador: form.procesador || "",
      ram: form.ram || "",
      disco: form.disco || "",
      estadoPantalla: form.estadoPantalla || "",
      estadoTeclado: form.estadoTeclado || "",
      estadoMouse: form.estadoMouse || "",
      funciona: form.funciona || "",
      enciendeEquipo: form.enciendeEquipo || "",
      contrasenaEquipo: form.contrasenaEquipo || "",
    };
  }

  if (tipo === "impresora") {
    payload.impresora = {
      tipoImpresora: form.tipoImpresora || "",
      imprime: form.imprime || "",
      condicionesImpresora: form.condicionesImpresora || "",
    };
  }

  if (tipo === "monitor") {
    payload.monitor = {
      tamanoMonitor: form.tamanoMonitor || "",
      colores: form.colores || "",
      condicionesMonitor: form.condicionesMonitor || "",
    };
  }

  return payload;
}

/* =========================
   ✅ CREAR (BLOQUEA duplicado por folio)
========================= */
export async function guardarServicio(form) {
  // 🔥 AQUÍ EL CAMBIO
  const payload = await construirPayload(form);

  const folio = (payload.folio || "").trim();
  if (!folio) throwNice("No se pudo generar folio.");

  const folioKey = folioToKey(folio);

  const folioRef = doc(db, "folios", folioKey);
  const servicioRef = doc(collection(db, "servicios")); // id nuevo

  await runTransaction(db, async (tx) => {
    const folioSnap = await tx.get(folioRef);
    if (folioSnap.exists()) {
      throwNice(`⚠️ Ya existe un servicio con el folio ${folio}.`);
    }

    // Reservar folio (único)
    tx.set(folioRef, {
      folio,
      servicioId: servicioRef.id,
      createdAt: serverTimestamp(),
    });

    // Crear servicio
    tx.set(servicioRef, payload);
  });

  return { id: servicioRef.id, folio };
}


/* =========================
   ✅ UPSERT por FOLIO (ANTI-DUPLICADOS)
   - si existe => actualiza
   - si no existe => crea
========================= */
export async function guardarOActualizarPorFolio(form) {
  const payload = construirPayload(form);

  const folio = (payload.folio || "").trim();
  if (!folio) throwNice("No se pudo generar folio.");

  const folioKey = folioToKey(folio);
  const folioRef = doc(db, "folios", folioKey);

  const nuevoServicioRef = doc(collection(db, "servicios"));

  const result = await runTransaction(db, async (tx) => {
    const folioSnap = await tx.get(folioRef);

    if (!folioSnap.exists()) {
      // no existe => crear
      tx.set(folioRef, {
        folio,
        servicioId: nuevoServicioRef.id,
        createdAt: serverTimestamp(),
      });

      tx.set(nuevoServicioRef, payload);
      return { id: nuevoServicioRef.id, folio, mode: "created" };
    }

    // existe => actualizar el doc existente (NO duplica)
    const { servicioId } = folioSnap.data() || {};
    if (!servicioId) throwNice("Índice de folio inválido (sin servicioId).");

    const servRef = doc(db, "servicios", servicioId);

    // no sobreescribas createdAt al actualizar
    const patch = { ...payload };
    delete patch.createdAt;
    patch.updatedAt = serverTimestamp();

    tx.update(servRef, patch);
    return { id: servicioId, folio, mode: "updated" };
  });

  return result;
}

/* =========================
   ✅ Buscar por folio (usa índice)
========================= */
export async function buscarServicioPorFolio(folio) {
  const folioLimpio = (folio || "").trim();
  if (!folioLimpio) return null;

  const folioKey = folioToKey(folioLimpio);
  const folioRef = doc(db, "folios", folioKey);
  const folioSnap = await getDoc(folioRef);

  if (folioSnap.exists()) {
    const { servicioId } = folioSnap.data() || {};
    if (!servicioId) return null;

    const servRef = doc(db, "servicios", servicioId);
    const servSnap = await getDoc(servRef);
    if (!servSnap.exists()) return null;

    return { id: servSnap.id, ...servSnap.data() };
  }

  // fallback (registros viejos sin índice)
  const q = query(collection(db, "servicios"), where("folio", "==", folioLimpio));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/* =========================
   ✅ Pendientes (NO finales)
========================= */
export async function listarServiciosPendientes() {
  const qy = query(collection(db, "servicios"), orderBy("createdAt", "desc"));
  const snap = await getDocs(qy);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return all.filter((s) => !isFinalStatus(s.status));
}

/* =========================
   ✅ Historial (finales)
========================= */
export async function listarServiciosHistorial() {
  const FINAL_LABELS = ["Entregado", "Cancelado", "No reparable"];

  try {
    const qy = query(
      collection(db, "servicios"),
      where("status", "in", FINAL_LABELS),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    const qyAll = query(collection(db, "servicios"), orderBy("createdAt", "desc"));
    const snapAll = await getDocs(qyAll);
    const all = snapAll.docs.map((d) => ({ id: d.id, ...d.data() }));
    return all.filter((s) => isFinalStatus(s.status));
  }
}

/* =========================
   ✅ Actualizar por ID (NO crea, NO duplica)
   - Bloquea cambiar folio
========================= */
export async function actualizarServicioPorId(id, data) {
  const ref = doc(db, "servicios", id);

  const before = await getDoc(ref);
  if (!before.exists()) throwNice("Servicio no encontrado.");

  const current = before.data() || {};

  if (data?.folio && data.folio.trim() !== (current.folio || "").trim()) {
    throwNice("No se permite cambiar el folio de un servicio existente.");
  }

  const patch = { ...data, updatedAt: serverTimestamp() };

  // 🔥 SI CAMBIA STATUS A ENTREGADO → GUARDA FECHA
  if (normalizarStatus(data?.status) === "entregado") {
    patch.fechaEntregado = serverTimestamp();
  }

  // 🔥 SI DEJA DE SER ENTREGADO → BORRA FECHA
  if (
    data?.status &&
    normalizarStatus(data.status) !== "entregado"
  ) {
    patch.fechaEntregado = null;
  }

  await updateDoc(ref, patch);

  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}

/* =========================
   ✅ Servicios por clienteId
   (para ClienteDetalle)
========================= */
export async function listarServiciosPorClienteId(clienteId) {
  if (!clienteId) return [];

  const q = query(
    collection(db, "servicios"),
    where("clienteId", "==", clienteId), // 🔴 ESTE CAMPO ES CLAVE
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}