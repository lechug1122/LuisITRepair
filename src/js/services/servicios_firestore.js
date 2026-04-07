import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

import { db } from "../../initializer/firebase";
import { generarFolio } from "../utils_folio";
import {
  buildCamposPersonalizados,
  buildLegacyBlocksFromCampos,
  inferTipoNegocioServicio,
  normalizeTipoNegocio,
} from "./tipos_negocio";
import {
  dataBelongsToTenant,
  filterItemsByTenant,
  getTenantCollectionQuery,
  withTenantData,
} from "./tenant";

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
  return s === "entregado";
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

function toMoney(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function toInt(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function normalizeHojaServicioSnapshot(raw = {}) {
  if (!raw || typeof raw !== "object") return null;

  const terminos = Array.isArray(raw?.terminos)
    ? raw.terminos
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    : [];

  return {
    habilitada: raw?.habilitada !== false,
    terminos,
    retardo: {
      habilitado: !!raw?.retardo?.habilitado,
      diasTolerancia: toInt(raw?.retardo?.diasTolerancia, 0),
      cargo: toMoney(raw?.retardo?.cargo, 0),
      aplicarCadaDias: Math.max(1, toInt(raw?.retardo?.aplicarCadaDias, 1)),
      abandonoDias: Math.max(1, toInt(raw?.retardo?.abandonoDias, 30)),
      abandonoSiSuperaCosto: raw?.retardo?.abandonoSiSuperaCosto !== false,
    },
  };
}

function buildDedupeKey(data) {
  const telefono = String(data?.telefono || "").replace(/\D/g, "").slice(-10);
  const tipo = normalizarStatus(data?.tipoDispositivo);
  const marca = normText(data?.marca);
  const modelo = normText(data?.modelo);
  return `${telefono}|${tipo}|${marca}|${modelo}`;
}

/* =========================
   Folio helpers
========================= */
function folioToKey(folio) {
  return (folio || "").trim().replace(/\//g, "-");
}

function throwNice(msg) {
  throw new Error(msg);
}

function buildCodeError(message, code, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
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
   Construir payload
========================= */
async function construirPayload(form, folioOverride = "") {
  const tipo = form.tipoDispositivo;
  const tipoNegocioSnapshot = normalizeTipoNegocio(
    form?.tipoNegocioSnapshot || inferTipoNegocioServicio(form),
  );
  const camposPersonalizados = buildCamposPersonalizados(
    tipoNegocioSnapshot,
    form?.camposPersonalizados,
    form,
  );
  const legacyBlocks = buildLegacyBlocksFromCampos(tipo, camposPersonalizados);

  const folioFinal = (
    folioOverride || form.folio || (await generarFolio(form.marca)) || ""
  ).trim();

  const payload = {
    ...withTenantData({}),
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
    hojaServicio: normalizeHojaServicioSnapshot(form?.hojaServicio),
    tipoNegocioId: tipoNegocioSnapshot?.id || "",
    tipoNegocioNombre: tipoNegocioSnapshot?.nombre || "",
    tipoNegocioSnapshot,
    camposPersonalizados,

    folio: folioFinal,
    status: "pendiente",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  payload.laptopPc = legacyBlocks.laptopPc;
  payload.impresora = legacyBlocks.impresora;
  payload.monitor = legacyBlocks.monitor;

  return payload;
}

async function crearServicioConFolioReservado(payload) {
  const folio = (payload.folio || "").trim();
  if (!folio) throwNice("No se pudo generar folio.");

  const folioKey = folioToKey(folio);
  const folioRef = doc(db, "folios", folioKey);
  const servicioRef = doc(collection(db, "servicios"));

  await runTransaction(db, async (tx) => {
    const folioSnap = await tx.get(folioRef);
    if (folioSnap.exists()) {
      throw buildCodeError(
        `Ya existe un servicio con el folio ${folio}.`,
        "FOLIO_ALREADY_EXISTS",
        { folio },
      );
    }

    tx.set(folioRef, {
      folio,
      servicioId: servicioRef.id,
      createdAt: serverTimestamp(),
    });

    tx.set(servicioRef, payload);
  });

  return { id: servicioRef.id, folio };
}

export async function buscarServicioDuplicadoActivo(formLike) {
  const key = buildDedupeKey(formLike);
  const telefono = String(formLike?.telefono || "").replace(/\D/g, "").slice(-10);
  const trabajoNorm = normText(formLike?.trabajo || "");

  if (!telefono || !normalizarStatus(formLike?.tipoDispositivo)) return null;

  const tenantServiciosSnap = await getDocs(getTenantCollectionQuery("servicios"));
  const tenantServicios = filterItemsByTenant(
    tenantServiciosSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  );
  const porKey = tenantServicios.filter((item) => item?.dedupeKey === key);
  const porTelefono = tenantServicios.filter((item) => item?.telefono === telefono);

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

    if (!trabajoNorm || !normText(s?.trabajo)) return true;

    return normText(s?.trabajo) === trabajoNorm;
  });

  return duplicado || null;
}

/* =========================
   Crear
========================= */
export async function guardarServicio(form) {
  const manualFolio = String(form?.folio || "").trim();
  let dedupeChecked = false;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const folioCandidate = manualFolio || (await generarFolio(form?.marca));
    const payload = await construirPayload(form, folioCandidate);

    if (!dedupeChecked) {
      const duplicado = await buscarServicioDuplicadoActivo(payload);
      if (duplicado) throwDuplicate(duplicado);
      dedupeChecked = true;
    }

    const servicioExistente = await buscarServicioPorFolio(folioCandidate);
    if (servicioExistente) {
      if (manualFolio) {
        throw buildCodeError(
          `Ya existe un servicio con el folio ${folioCandidate}.`,
          "FOLIO_ALREADY_EXISTS",
          { folio: folioCandidate, servicioExistente },
        );
      }
      continue;
    }

    try {
      return await crearServicioConFolioReservado(payload);
    } catch (error) {
      if (error?.code === "FOLIO_ALREADY_EXISTS" && !manualFolio) {
        continue;
      }
      throw error;
    }
  }

  throwNice("No se pudo asignar un folio unico. Intenta crear el servicio otra vez.");
}

/* =========================
   Upsert por folio
========================= */
export async function guardarOActualizarPorFolio(form) {
  const payload = await construirPayload(form);

  const folio = (payload.folio || "").trim();
  if (!folio) throwNice("No se pudo generar folio.");

  const folioKey = folioToKey(folio);
  const folioRef = doc(db, "folios", folioKey);

  const nuevoServicioRef = doc(collection(db, "servicios"));

  const result = await runTransaction(db, async (tx) => {
    const folioSnap = await tx.get(folioRef);

    if (!folioSnap.exists()) {
      tx.set(folioRef, {
        folio,
        servicioId: nuevoServicioRef.id,
        createdAt: serverTimestamp(),
      });

      tx.set(nuevoServicioRef, payload);
      return { id: nuevoServicioRef.id, folio, mode: "created" };
    }

    const { servicioId } = folioSnap.data() || {};
    if (!servicioId) throwNice("Indice de folio invalido (sin servicioId).");

    const servRef = doc(db, "servicios", servicioId);
    const servSnap = await tx.get(servRef);
    if (servSnap.exists() && !dataBelongsToTenant(servSnap.data())) {
      throwNice("El servicio pertenece a otra cuenta.");
    }

    const patch = { ...payload };
    delete patch.createdAt;
    patch.updatedAt = serverTimestamp();

    tx.update(servRef, patch);
    return { id: servicioId, folio, mode: "updated" };
  });

  return result;
}

/* =========================
   Buscar por folio
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
    if (!dataBelongsToTenant(servSnap.data())) return null;

    return { id: servSnap.id, ...servSnap.data() };
  }

  const snap = await getDocs(getTenantCollectionQuery("servicios"));
  const d = snap.docs.find((item) => String(item.data()?.folio || "").trim() === folioLimpio);
  if (!d) return null;
  return { id: d.id, ...d.data() };
}

/* =========================
   Pendientes
========================= */
export async function listarServiciosPendientes() {
  const snap = await getDocs(getTenantCollectionQuery("servicios"));
  const all = filterItemsByTenant(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  all.sort((a, b) => {
    const left = a?.createdAt?.seconds || 0;
    const right = b?.createdAt?.seconds || 0;
    return right - left;
  });
  return all.filter((s) => !isFinalStatus(s.status));
}

/* =========================
   Historial
========================= */
export async function listarServiciosHistorial() {
  const snapAll = await getDocs(getTenantCollectionQuery("servicios"));
  const all = filterItemsByTenant(snapAll.docs.map((d) => ({ id: d.id, ...d.data() })));
  all.sort((a, b) => {
    const left = a?.createdAt?.seconds || 0;
    const right = b?.createdAt?.seconds || 0;
    return right - left;
  });
  return all.filter((s) => isFinalStatus(s.status));
}

/* =========================
   Actualizar por ID
========================= */
export async function actualizarServicioPorId(id, data) {
  const ref = doc(db, "servicios", id);

  const before = await getDoc(ref);
  if (!before.exists()) throwNice("Servicio no encontrado.");
  if (!dataBelongsToTenant(before.data())) throwNice("Servicio fuera del alcance de la cuenta.");

  const current = before.data() || {};

  if (data?.folio && data.folio.trim() !== (current.folio || "").trim()) {
    throwNice("No se permite cambiar el folio de un servicio existente.");
  }

  const patch = { ...data, updatedAt: serverTimestamp() };
  const nextStatus = data?.status ?? current?.status;
  const nextStatusNorm = normalizarStatus(nextStatus);
  const isFinal = isFinalStatus(nextStatusNorm);

  if (nextStatusNorm === "entregado") {
    patch.fechaEntregado = serverTimestamp();
  }

  if (
    data?.status &&
    nextStatusNorm !== "entregado"
  ) {
    patch.fechaEntregado = null;
  }

  if (isFinal) {
    patch.locked = true;
    patch.lockedReason = nextStatusNorm;
  } else {
    patch.locked = false;
    patch.lockedReason = null;
  }

  await updateDoc(ref, patch);

  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}

/* =========================
   Servicios por clienteId
========================= */
export async function listarServiciosPorClienteId(clienteId) {
  if (!clienteId) return [];

  const snapshot = await getDocs(getTenantCollectionQuery("servicios"));

  return filterItemsByTenant(snapshot.docs.map((docItem) => ({
    id: docItem.id,
    ...docItem.data(),
  })))
    .filter((item) => item?.clienteId === clienteId)
    .sort((a, b) => (b?.createdAt?.seconds || 0) - (a?.createdAt?.seconds || 0));
}
