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

function normText(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDedupeKey(data) {
  const telefono = String(data?.telefono || "").replace(/\D/g, "").slice(-10);
  const tipo = normalizarStatus(data?.tipoDispositivo);
  const marca = normText(data?.marca);
  const modelo = normText(data?.modelo);
  return `${telefono}|${tipo}|${marca}|${modelo}`;
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

function throwDuplicate(duplicado) {
  const err = new Error(
    `Ya existe un servicio activo similar con folio ${duplicado?.folio || "-"}.`
  );
  err.code = "DUPLICATE_SERVICE";
  err.duplicado = duplicado;
  throw err;
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
    numeroSerie: form.omitirNumeroSerie ? "" : String(form.numeroSerie || "").trim(),
    omitirNumeroSerie: !!form.omitirNumeroSerie,

    trabajo: form.trabajo || "",
    precioDespues: !!form.precioDespues,
    costo: form.precioDespues ? "" : form.costo || "",
    caracteristicasPendientes: !!form.caracteristicasPendientes,
    trabajoNorm: normText(form.trabajo || ""),
    dedupeKey: buildDedupeKey(form),

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

export async function buscarServicioDuplicadoActivo(formLike) {
  const key = buildDedupeKey(formLike);
  const telefono = String(formLike?.telefono || "").replace(/\D/g, "").slice(-10);
  const trabajoNorm = normText(formLike?.trabajo || "");

  if (!telefono || !normalizarStatus(formLike?.tipoDispositivo)) return null;

  // 1) Registros nuevos (con dedupeKey)
  const qKey = query(collection(db, "servicios"), where("dedupeKey", "==", key));
  const snapKey = await getDocs(qKey);
  const porKey = snapKey.docs.map((d) => ({ id: d.id, ...d.data() }));

  // 2) Fallback para registros viejos sin dedupeKey
  const qTel = query(collection(db, "servicios"), where("telefono", "==", telefono));
  const snapTel = await getDocs(qTel);
  const porTelefono = snapTel.docs.map((d) => ({ id: d.id, ...d.data() }));

  const candidatos = [...porKey, ...porTelefono].filter(
    (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i
  );

  const duplicado = candidatos.find((s) => {
    if (isFinalStatus(s.status)) return false;

    const mismoEquipo =
      buildDedupeKey(s) === key ||
      (
        String(s?.telefono || "").replace(/\D/g, "").slice(-10) === telefono &&
        normalizarStatus(s?.tipoDispositivo) === normalizarStatus(formLike?.tipoDispositivo) &&
        normText(s?.marca) === normText(formLike?.marca) &&
        normText(s?.modelo) === normText(formLike?.modelo)
      );

    if (!mismoEquipo) return false;

    // Si no hay descripción en ninguno, ya lo consideramos duplicado.
    if (!trabajoNorm || !normText(s?.trabajo)) return true;

    // Misma descripción de falla => duplicado fuerte.
    return normText(s?.trabajo) === trabajoNorm;
  });

  return duplicado || null;
}

/* =========================
   ✅ CREAR (BLOQUEA duplicado por folio)
========================= */
export async function guardarServicio(form) {
  // 🔥 AQUÍ EL CAMBIO
  const payload = await construirPayload(form);

  const duplicado = await buscarServicioDuplicadoActivo(payload);
  if (duplicado) throwDuplicate(duplicado);

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
  const qyAll = query(collection(db, "servicios"), orderBy("createdAt", "desc"));
  const snapAll = await getDocs(qyAll);
  const all = snapAll.docs.map((d) => ({ id: d.id, ...d.data() }));
  return all.filter((s) => isFinalStatus(s.status));
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
  const nextStatus = data?.status ?? current?.status;
  const nextStatusNorm = normalizarStatus(nextStatus);
  const isFinal = isFinalStatus(nextStatusNorm);

  // 🔥 SI CAMBIA STATUS A ENTREGADO → GUARDA FECHA
  if (nextStatusNorm === "entregado") {
    patch.fechaEntregado = serverTimestamp();
  }

  // 🔥 SI DEJA DE SER ENTREGADO → BORRA FECHA
  if (
    data?.status &&
    nextStatusNorm !== "entregado"
  ) {
    patch.fechaEntregado = null;
  }

  // 🔒 Cualquier estado final queda bloqueado
  if (isFinal) {
    patch.locked = true;
    patch.lockedReason = nextStatusNorm;
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
