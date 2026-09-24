import { getCollectionRef, getDocRef, resolveTenantId } from "./tenant";
import {
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

import { auth, db } from "../../initializer/firebase";
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
import { canUseServiceTrackingQr, canUseServiceDeposits } from "./plan_features.js";
import { getTicketPlan } from "./ticket_plan.js";
import {
  ORIGEN_NEGOCIO,
  ORIGEN_SISTEMA,
  normalizarEstadoServicio,
} from "./servicio_estados.js";
import { construirEntradaHistorial, nuevaClaveHistorial } from "./servicio_historial.js";
import { readServiciosConfigCache } from "./configure_servicios.js";
import { readEmpresaConfigCache } from "./configure_empresa.js";

const PUBLIC_SERVICES_COLLECTION = "servicios_publicos";
const PUBLIC_BUSINESSES_COLLECTION = "rastreo_publico_negocios";

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
  return s === "entregado" || s === "abandonado";
}

/* =========================
   Historial de estados

   El historial se guarda como MAPA (no arreglo) porque Firestore solo admite
   `serverTimestamp()` en una ruta de campo, nunca dentro de un arreglo. Asi
   cada paso queda sellado con la hora del servidor y dos personas que cambian
   el estado a la vez escriben claves distintas en vez de pisarse.
   Ver `servicio_historial.js` para la lectura.
========================= */

/** Quien esta operando, para firmar el paso del historial. */
function usuarioActualParaHistorial() {
  const usuario = auth?.currentUser || null;
  return {
    usuarioId: String(usuario?.uid || ""),
    usuarioNombre: String(usuario?.displayName || usuario?.email || ""),
  };
}

/**
 * Campos que agregan un paso al historial, listos para `update`.
 *
 * Devuelve `{}` cuando no hay nada que registrar, para poder derramarlo sin
 * condicionales en el llamador.
 */
export function camposDePasoHistorial({
  estado,
  estadoAnterior = null,
  origen = ORIGEN_NEGOCIO,
  usuarioId,
  usuarioNombre,
  nota = "",
  forzar = false,
} = {}) {
  const siguiente = normalizarEstadoServicio(estado);
  if (!forzar && estadoAnterior !== null && normalizarEstadoServicio(estadoAnterior) === siguiente) {
    return {};
  }

  const identidad = usuarioId === undefined && usuarioNombre === undefined
    ? usuarioActualParaHistorial()
    : { usuarioId: usuarioId || "", usuarioNombre: usuarioNombre || "" };

  const entrada = construirEntradaHistorial({
    estado: siguiente,
    origen,
    nota,
    ...identidad,
  });

  return {
    [`historialEstados.${nuevaClaveHistorial()}`]: {
      ...entrada,
      fecha: serverTimestamp(),
    },
    ultimoCambioEstadoEn: serverTimestamp(),
  };
}

function isCancelableParaAbandono(status) {
  const s = normalizarStatus(status);
  return s === "cancelado" || s === "no_reparable";
}

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let year = 0;
  let month = 0;
  let day = 0;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [year, month, day] = raw.split("-").map(Number);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    [day, month, year] = raw.split("/").map(Number);
  } else {
    return null;
  }

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDays(from, to) {
  if (!(from instanceof Date) || !(to instanceof Date)) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function shouldAutoCloseByAbandono(servicio, today = new Date()) {
  if (!servicio || isFinalStatus(servicio?.status)) return false;
  if (!isCancelableParaAbandono(servicio?.status)) return false;

  const retardo = servicio?.hojaServicio?.retardo || servicio?.retardo || {};
  if (!retardo?.habilitado) return false;

  const fechaEntrega = parseDateOnly(servicio?.fechaAprox);
  if (!fechaEntrega) return false;

  const hoy = new Date(today);
  hoy.setHours(0, 0, 0, 0);

  const diasTolerancia = Math.max(0, toInt(retardo?.diasTolerancia, 0));
  const abandonoDias = Math.max(1, toInt(retardo?.abandonoDias, 30));
  const diasRetardoAplicados = Math.max(0, diffDays(fechaEntrega, hoy) - diasTolerancia);

  return diasRetardoAplicados >= abandonoDias;
}

export async function cerrarServiciosAbandonados(servicios = []) {
  const pendientesDeCierre = servicios.filter((servicio) => shouldAutoCloseByAbandono(servicio));
  if (!pendientesDeCierre.length) return servicios;

  const batch = writeBatch(db);

  pendientesDeCierre.forEach((servicio) => {
    batch.update(getDocRef("servicios", servicio.id), {
      ...camposDePasoHistorial({
        estado: "abandonado",
        estadoAnterior: servicio?.status,
        origen: ORIGEN_SISTEMA,
        usuarioId: "",
        usuarioNombre: "",
        nota: "Cierre automatico por plazo de abandono",
      }),
      status: "abandonado",
      entregado: false,
      fechaCierre: serverTimestamp(),
      cierreMotivo: "abandono",
      locked: true,
      lockedReason: "abandonado",
      updatedAt: serverTimestamp(),
      retardo: {
        ...(servicio?.retardo || {}),
        abandonoActivo: true,
        abandonoMotivo: "dias",
      },
    });
  });

  try {
    await batch.commit();
    await Promise.allSettled(pendientesDeCierre.map((servicio) => publicarRastreoServicio({
      ...servicio,
      status: "abandonado",
      id: servicio.id,
    })));
  } catch (error) {
    console.warn("[servicios] No se pudo cerrar abandono automaticamente:", error?.code || error);
  }

  const cerrados = new Set(pendientesDeCierre.map((servicio) => servicio.id));
  return servicios.map((servicio) => (
    cerrados.has(servicio.id)
      ? {
          ...servicio,
          status: "abandonado",
          cierreMotivo: "abandono",
          locked: true,
          lockedReason: "abandonado",
          retardo: {
            ...(servicio?.retardo || {}),
            abandonoActivo: true,
            abandonoMotivo: "dias",
          },
        }
      : servicio
  ));
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

function canPublishServiceTracking() {
  return canUseServiceTrackingQr({
    premiumState: getTicketPlan(),
    trackingEnabled: readServiciosConfigCache().trackingEnabled,
  });
}

/**
 * Proyección pública estricta. Nunca se copia el documento completo del
 * servicio: quedan fuera cliente, teléfono, dirección, serie, costos, pagos,
 * notas internas, empleado, boleta y cualquier campo técnico.
 */
export function buildPublicServiceTracking(service = {}, negocioId = "") {
  return {
    negocioId: String(negocioId || service?.negocioId || service?.cuentaPrincipalUid || "").trim(),
    folio: String(service?.folio || "").trim(),
    tipoDispositivo: String(service?.tipoDispositivo || "").trim(),
    marca: String(service?.marca || "").trim(),
    modelo: String(service?.modelo || "").trim(),
    trabajo: String(service?.trabajo || "").trim(),
    status: String(service?.status || "pendiente").trim(),
    fechaAprox: String(service?.fechaAprox || "").trim(),
    createdAt: service?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    trackingEnabled: true,
  };
}

function buildPublicBusinessTracking(negocioId = "") {
  const empresa = readEmpresaConfigCache();
  return {
    negocioId: String(negocioId || "").trim(),
    nombre: String(empresa?.nombre || "").trim(),
    logo: String(empresa?.logo || "").trim(),
    trackingEnabled: true,
    updatedAt: serverTimestamp(),
  };
}

export async function sincronizarMarcaRastreoPublico(tenantId = "") {
  if (!canPublishServiceTracking()) return false;
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) return false;
  await setDoc(
    doc(db, PUBLIC_BUSINESSES_COLLECTION, negocioId),
    buildPublicBusinessTracking(negocioId),
    { merge: true },
  );
  return true;
}

async function publicarRastreoServicio(servicio = {}, negocioId = "") {
  if (!canPublishServiceTracking()) return false;
  const tenantId = String(negocioId || resolveTenantId() || "").trim();
  const serviceId = String(servicio?.id || "").trim();
  if (!tenantId || !serviceId || !servicio?.folio) return false;

  const batch = writeBatch(db);
  batch.set(
    doc(db, PUBLIC_BUSINESSES_COLLECTION, tenantId),
    buildPublicBusinessTracking(tenantId),
    { merge: true },
  );
  batch.set(
    getDocRef(PUBLIC_SERVICES_COLLECTION, serviceId, tenantId),
    buildPublicServiceTracking(servicio, tenantId),
    { merge: true },
  );
  await batch.commit();
  return true;
}

/** Publica o refresca de forma segura los servicios históricos al activar QR. */
export async function sincronizarRastreoServiciosPublicos(tenantId = "") {
  if (!canPublishServiceTracking()) return { sincronizados: 0 };
  const negocioId = resolveTenantId(tenantId);
  if (!negocioId) throwNice("No se pudo identificar el negocio.");

  const snapshot = await getDocs(getTenantCollectionQuery("servicios", negocioId));
  await sincronizarMarcaRastreoPublico(negocioId);

  let sincronizados = 0;
  for (let start = 0; start < snapshot.docs.length; start += 400) {
    const batch = writeBatch(db);
    snapshot.docs.slice(start, start + 400).forEach((item) => {
      batch.set(
        getDocRef(PUBLIC_SERVICES_COLLECTION, item.id, negocioId),
        buildPublicServiceTracking({ id: item.id, ...item.data() }, negocioId),
        { merge: true },
      );
      sincronizados += 1;
    });
    await batch.commit();
  }

  return { sincronizados };
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
    // Primer paso del historial. Va dentro del documento (no con ruta de
    // campo) porque el servicio todavia no existe; `serverTimestamp()` si se
    // admite dentro de un mapa anidado, solo no dentro de un arreglo.
    historialEstados: {
      [nuevaClaveHistorial()]: {
        ...construirEntradaHistorial({
          estado: "pendiente",
          origen: ORIGEN_SISTEMA,
          nota: "Servicio recibido",
          ...usuarioActualParaHistorial(),
        }),
        fecha: serverTimestamp(),
      },
    },
    ultimoCambioEstadoEn: serverTimestamp(),
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
  const folioRef = getDocRef("folios", folioKey);
  const servicioRef = doc(getCollectionRef("servicios"));
  const negocioId = resolveTenantId();
  const publicarRastreo = canPublishServiceTracking();

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
    if (publicarRastreo) {
      tx.set(
        doc(db, PUBLIC_BUSINESSES_COLLECTION, negocioId),
        buildPublicBusinessTracking(negocioId),
        { merge: true },
      );
      tx.set(
        getDocRef(PUBLIC_SERVICES_COLLECTION, servicioRef.id, negocioId),
        buildPublicServiceTracking({ id: servicioRef.id, ...payload }, negocioId),
        { merge: true },
      );
    }
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
  const folioRef = getDocRef("folios", folioKey);

  const nuevoServicioRef = doc(getCollectionRef("servicios"));
  const negocioId = resolveTenantId();
  const publicarRastreo = canPublishServiceTracking();

  const result = await runTransaction(db, async (tx) => {
    const folioSnap = await tx.get(folioRef);

    if (!folioSnap.exists()) {
      tx.set(folioRef, {
        folio,
        servicioId: nuevoServicioRef.id,
        createdAt: serverTimestamp(),
      });

      tx.set(nuevoServicioRef, payload);
      if (publicarRastreo) {
        tx.set(
          doc(db, PUBLIC_BUSINESSES_COLLECTION, negocioId),
          buildPublicBusinessTracking(negocioId),
          { merge: true },
        );
        tx.set(
          getDocRef(PUBLIC_SERVICES_COLLECTION, nuevoServicioRef.id, negocioId),
          buildPublicServiceTracking({ id: nuevoServicioRef.id, ...payload }, negocioId),
          { merge: true },
        );
      }
      return { id: nuevoServicioRef.id, folio, mode: "created" };
    }

    const { servicioId } = folioSnap.data() || {};
    if (!servicioId) throwNice("Indice de folio invalido (sin servicioId).");

    const servRef = getDocRef("servicios", servicioId);
    const servSnap = await tx.get(servRef);
    if (servSnap.exists() && !dataBelongsToTenant(servSnap.data())) {
      throwNice("El servicio pertenece a otra cuenta.");
    }

    const patch = { ...payload };
    delete patch.createdAt;
    // El historial pertenece al servicio, no al formulario: reescribirlo con
    // el mapa recien construido borraria todos los pasos ya registrados.
    delete patch.historialEstados;
    patch.updatedAt = serverTimestamp();

    tx.update(servRef, patch);
    if (publicarRastreo) {
      tx.set(
        doc(db, PUBLIC_BUSINESSES_COLLECTION, negocioId),
        buildPublicBusinessTracking(negocioId),
        { merge: true },
      );
      tx.set(
        getDocRef(PUBLIC_SERVICES_COLLECTION, servicioId, negocioId),
        buildPublicServiceTracking({ id: servicioId, ...servSnap.data(), ...patch }, negocioId),
        { merge: true },
      );
    }
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
  const folioRef = getDocRef("folios", folioKey);
  const folioSnap = await getDoc(folioRef);

  if (folioSnap.exists()) {
    const { servicioId } = folioSnap.data() || {};
    if (!servicioId) return null;

    const servRef = getDocRef("servicios", servicioId);
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

export async function buscarServicioPublicoPorFolio(folio, aceptacion = "") {
  const folioLimpio = String(folio || "").trim();
  if (!folioLimpio) return null;
  const consultar = httpsCallable(
    getFunctions(db.app, "southamerica-east1"),
    "consultarServicioPublico",
  );
  const result = await consultar({
    folio: folioLimpio,
    aceptacion: String(aceptacion || ""),
  });
  return result.data || null;
}

/* =========================
   Pendientes
========================= */
export async function listarServiciosPendientes() {
  const snap = await getDocs(getTenantCollectionQuery("servicios"));
  const all = await cerrarServiciosAbandonados(
    filterItemsByTenant(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
  );
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
  const all = await cerrarServiciosAbandonados(
    filterItemsByTenant(snapAll.docs.map((d) => ({ id: d.id, ...d.data() }))),
  );
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
export async function actualizarServicioPorId(id, data, opciones = {}) {
  if (["abonos", "totalAbonado", "ultimoAbonoEn"].some((key) => Object.hasOwn(data || {}, key))
    && !canUseServiceDeposits({ premiumState: getTicketPlan() })) {
    throwNice("Abonar servicio está disponible con CajaLibre Premium.");
  }
  const ref = getDocRef("servicios", id);

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

  // Un cambio de estado siempre deja rastro. Se compara por estado CANONICO:
  // pasar de "revision" a "en_revision" es el mismo estado escrito de otra
  // forma y no merece una linea en la historia del servicio.
  Object.assign(patch, camposDePasoHistorial({
    estado: nextStatus,
    estadoAnterior: current?.status,
    origen: opciones?.origen || ORIGEN_NEGOCIO,
    usuarioId: opciones?.usuarioId,
    usuarioNombre: opciones?.usuarioNombre,
    nota: opciones?.nota || "",
  }));

  if (nextStatusNorm === "entregado") {
    patch.fechaEntregado = serverTimestamp();
  }

  if (nextStatusNorm === "abandonado") {
    patch.fechaCierre = serverTimestamp();
    patch.cierreMotivo = "abandono";
  }

  if (
    data?.status &&
    nextStatusNorm !== "entregado" &&
    nextStatusNorm !== "abandonado"
  ) {
    patch.fechaEntregado = null;
    patch.fechaCierre = null;
    patch.cierreMotivo = null;
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
  const actualizado = { id: snap.id, ...snap.data() };
  try {
    await publicarRastreoServicio(actualizado);
  } catch (error) {
    console.warn("[servicios] No se pudo actualizar el rastreo público:", error?.code || error);
  }
  return actualizado;
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
