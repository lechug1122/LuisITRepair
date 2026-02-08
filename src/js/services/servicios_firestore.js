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
  setDoc,
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
  // Firestore NO permite "/" en IDs
  return (folio || "").trim().replace(/\//g, "-");
}

function throwNice(msg) {
  throw new Error(msg);
}

/* =========================
   ✅ arma un payload LIMPIO según tipoDispositivo
========================= */
function construirPayload(form) {
  const tipo = form.tipoDispositivo;

  const payload = {
    // Cliente
    nombre: form.nombre || "",
    direccion: form.direccion || "",
    telefono: form.telefono || "",

    // Equipo general
    tipoDispositivo: tipo || "",
    marca: form.marca || "",
    modelo: form.modelo || "",

    // Otros
    trabajo: form.trabajo || "",
    precioDespues: !!form.precioDespues,
    costo: form.precioDespues ? "" : form.costo || "",

    // control entrega
    entregado: false,
    fechaEntregado: null,

    // extras
    folio: generarFolio(form.marca),
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
   - Si tu UI por error llama "guardar" otra vez,
     esto lo bloqueará y NO se duplicará.
========================= */
export async function guardarServicio(form) {
  const payload = construirPayload(form);

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
   ÚSALO si quieres que "si ya existe el folio, actualice",
   y si no existe, cree.
   (Esto corrige el caso típico de UI que vuelve a mandar el form)
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

    // IMPORTANTE: no sobreescribas createdAt al actualizar
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

  // fallback (por si hay registros viejos sin índice)
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
   - Bloquea cambiar folio (para evitar inconsistencias del índice).
   - updatedAt siempre
   - maneja entregado/fechaEntregado
========================= */
export async function actualizarServicioPorId(id, data) {
  const ref = doc(db, "servicios", id);

  // leemos actual para bloquear cambios de folio
  const before = await getDoc(ref);
  if (!before.exists()) throwNice("Servicio no encontrado.");

  const current = before.data() || {};

  // ❌ Bloquear cambio de folio (recomendado)
  if (data?.folio && data.folio.trim() !== (current.folio || "").trim()) {
    throwNice("No se permite cambiar el folio de un servicio existente.");
  }

  const patch = { ...data, updatedAt: serverTimestamp() };

  if (data?.entregado === true) patch.fechaEntregado = serverTimestamp();
  if (data?.entregado === false) patch.fechaEntregado = null;

  await updateDoc(ref, patch);

  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}
