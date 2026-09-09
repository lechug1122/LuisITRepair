import { getCollectionRef, getDocRef } from "./tenant";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { dataBelongsToTenant, filterItemsByTenant, withTenantData } from "./tenant";

const proveedoresCol = () => getCollectionRef("proveedores");

export const PROVEEDOR_ESTADO_OPTIONS = [
  "Activo",
  "En evaluacion",
  "Pausado",
  "Bloqueado",
];

export const PROVEEDOR_MONEDA_OPTIONS = ["MXN", "USD", "EUR"];

export const PROVEEDOR_TIPO_SUGERIDO = [
  "Refacciones",
  "Equipos",
  "Consumibles",
  "Servicios",
  "Distribuidor",
  "Logistica",
  "Mayorista",
];

export const PROVEEDOR_COMPRA_ESTADO_OPTIONS = [
  "Pagada",
  "Pendiente",
  "Parcial",
  "Cancelada",
];

export const DEFAULT_COMPRA_PROVEEDOR = {
  fecha: "",
  folio: "",
  concepto: "",
  monto: 0,
  estado: PROVEEDOR_COMPRA_ESTADO_OPTIONS[0],
  notas: "",
};

export const DEFAULT_PROVEEDOR = {
  nombre: "",
  nombreComercial: "",
  contactoPrincipal: "",
  telefono: "",
  whatsapp: "",
  correo: "",
  direccion: "",
  ciudadEstado: "",
  rfc: "",
  sitioWeb: "",
  tipoProveedor: "",
  categorias: [],
  marcas: [],
  productosServicios: [],
  listaPrecios: "",
  moneda: "MXN",
  tiempoEntrega: "",
  costoEnvio: 0,
  pedidoMinimo: 0,
  condicionesPago: "",
  banco: "",
  cuenta: "",
  clabe: "",
  diasCredito: 0,
  descuentoHabitual: 0,
  garantia: "",
  politicaDevoluciones: "",
  estado: "Activo",
  calificacion: 0,
  ultimaCompraFecha: "",
  montoTotalComprado: 0,
  notasInternas: "",
  historialCompras: [],
};

function text(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function normalizedKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactKey(value) {
  return normalizedKey(value).replace(/\s+/g, "");
}

function phoneKey(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function money(value, fallback = 0) {
  const normalized = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(normalized) ? normalized : fallback;
}

function int(value, fallback = 0) {
  const normalized = Number(String(value ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(normalized) ? Math.max(0, Math.round(normalized)) : fallback;
}

function decimal(value, fallback = 0, max = Number.POSITIVE_INFINITY) {
  const normalized = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(normalized)) return fallback;
  return Math.min(Math.max(0, normalized), max);
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => text(String(item || ""))).filter(Boolean);
  }

  if (typeof value !== "string") return [];

  return value
    .split(/[\n,]+/g)
    .map((item) => text(item))
    .filter(Boolean);
}

function uniqueList(items) {
  return [...new Set(items.map((item) => text(item)).filter(Boolean))];
}

function dateValue(value) {
  const normalized = text(value);
  if (!normalized) return 0;
  const parsed = new Date(`${normalized}T12:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function createCompraId() {
  return `compra_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCompraProveedor(raw = {}, fallbackId = "") {
  return {
    id: text(raw?.id || fallbackId || createCompraId()),
    fecha: text(raw?.fecha),
    folio: text(raw?.folio),
    concepto: text(raw?.concepto || raw?.descripcion),
    monto: money(raw?.monto, DEFAULT_COMPRA_PROVEEDOR.monto),
    estado: text(raw?.estado) || DEFAULT_COMPRA_PROVEEDOR.estado,
    notas: text(raw?.notas),
    createdAt:
      typeof raw?.createdAt === "string" ? raw.createdAt : text(raw?.createdAt),
  };
}

function serializeCompraProveedor(raw = {}, fallbackId = "") {
  const compra = normalizeCompraProveedor(raw, fallbackId);
  return {
    id: compra.id || createCompraId(),
    fecha: compra.fecha,
    folio: compra.folio,
    concepto: compra.concepto,
    monto: compra.monto,
    estado: compra.estado,
    notas: compra.notas,
    createdAt: compra.createdAt || new Date().toISOString(),
  };
}

function sortHistorialCompras(items = []) {
  return [...items].sort((a, b) => {
    const byDate = dateValue(b.fecha) - dateValue(a.fecha);
    if (byDate !== 0) return byDate;
    return toMillis(b.createdAt) - toMillis(a.createdAt);
  });
}

function latestDate(left = "", right = "") {
  const leftTime = dateValue(left);
  const rightTime = dateValue(right);
  if (!leftTime) return text(right);
  if (!rightTime) return text(left);
  return rightTime >= leftTime ? text(right) : text(left);
}

function buildSearchText(proveedor) {
  return [
    proveedor.nombre,
    proveedor.nombreComercial,
    proveedor.contactoPrincipal,
    proveedor.telefono,
    proveedor.whatsapp,
    proveedor.correo,
    proveedor.rfc,
    proveedor.tipoProveedor,
    proveedor.estado,
    ...(proveedor.categorias || []),
    ...(proveedor.marcas || []),
    ...(proveedor.productosServicios || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildDedupeKeys(proveedor) {
  return {
    nombreKey: normalizedKey(proveedor?.nombre),
    nombreComercialKey: normalizedKey(proveedor?.nombreComercial),
    correoKey: compactKey(proveedor?.correo),
    rfcKey: compactKey(proveedor?.rfc),
    telefonoKey: phoneKey(proveedor?.telefono),
    whatsappKey: phoneKey(proveedor?.whatsapp),
  };
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeProveedor(raw = {}, id = raw?.id || "") {
  const historialCompras = sortHistorialCompras(
    (Array.isArray(raw?.historialCompras) ? raw.historialCompras : [])
      .map((item, index) => normalizeCompraProveedor(item, `${id || "proveedor"}_${index + 1}`))
      .filter((item) => item.fecha || item.concepto || item.monto),
  );

  const proveedor = {
    id: text(id),
    nombre: text(raw?.nombre),
    nombreComercial: text(raw?.nombreComercial),
    contactoPrincipal: text(raw?.contactoPrincipal),
    telefono: text(raw?.telefono),
    whatsapp: text(raw?.whatsapp),
    correo: text(raw?.correo),
    direccion: text(raw?.direccion),
    ciudadEstado: text(raw?.ciudadEstado),
    rfc: text(raw?.rfc),
    sitioWeb: text(raw?.sitioWeb),
    tipoProveedor: text(raw?.tipoProveedor),
    categorias: uniqueList(toList(raw?.categorias)),
    marcas: uniqueList(toList(raw?.marcas)),
    productosServicios: uniqueList(toList(raw?.productosServicios)),
    listaPrecios: text(raw?.listaPrecios),
    moneda: text(raw?.moneda) || DEFAULT_PROVEEDOR.moneda,
    tiempoEntrega: text(raw?.tiempoEntrega),
    costoEnvio: money(raw?.costoEnvio, DEFAULT_PROVEEDOR.costoEnvio),
    pedidoMinimo: money(raw?.pedidoMinimo, DEFAULT_PROVEEDOR.pedidoMinimo),
    condicionesPago: text(raw?.condicionesPago),
    banco: text(raw?.banco),
    cuenta: text(raw?.cuenta),
    clabe: text(raw?.clabe),
    diasCredito: int(raw?.diasCredito, DEFAULT_PROVEEDOR.diasCredito),
    descuentoHabitual: decimal(raw?.descuentoHabitual, DEFAULT_PROVEEDOR.descuentoHabitual, 100),
    garantia: text(raw?.garantia),
    politicaDevoluciones: text(raw?.politicaDevoluciones),
    estado: text(raw?.estado) || DEFAULT_PROVEEDOR.estado,
    calificacion: decimal(raw?.calificacion, DEFAULT_PROVEEDOR.calificacion, 5),
    ultimaCompraFecha: text(raw?.ultimaCompraFecha),
    montoTotalComprado: money(raw?.montoTotalComprado, DEFAULT_PROVEEDOR.montoTotalComprado),
    notasInternas: text(raw?.notasInternas),
    historialCompras,
    cuentaPrincipalUid: text(raw?.cuentaPrincipalUid),
    createdAt: raw?.createdAt || null,
    updatedAt: raw?.updatedAt || null,
  };

  return {
    ...proveedor,
    dedupe: buildDedupeKeys(proveedor),
    searchText: buildSearchText(proveedor),
  };
}

function sortProveedores(items = []) {
  return [...items].sort((a, b) => {
    const byName = String(a.nombreComercial || a.nombre).localeCompare(
      String(b.nombreComercial || b.nombre),
      "es",
      { sensitivity: "base" },
    );

    if (byName !== 0) return byName;
    return toMillis(b.updatedAt) - toMillis(a.updatedAt);
  });
}

function sameDedupe(a = {}, b = {}) {
  return (
    String(a?.nombreKey || "") === String(b?.nombreKey || "") &&
    String(a?.nombreComercialKey || "") === String(b?.nombreComercialKey || "") &&
    String(a?.correoKey || "") === String(b?.correoKey || "") &&
    String(a?.rfcKey || "") === String(b?.rfcKey || "") &&
    String(a?.telefonoKey || "") === String(b?.telefonoKey || "") &&
    String(a?.whatsappKey || "") === String(b?.whatsappKey || "")
  );
}

function intersects(left = [], right = []) {
  return left.some((item) => right.includes(item));
}

function detectarCoincidencias(existing, candidate) {
  const matches = [];
  const existingPhones = [
    existing?.dedupe?.telefonoKey,
    existing?.dedupe?.whatsappKey,
  ].filter(Boolean);
  const candidatePhones = [
    candidate?.dedupe?.telefonoKey,
    candidate?.dedupe?.whatsappKey,
  ].filter(Boolean);
  const existingNames = [
    existing?.dedupe?.nombreKey,
    existing?.dedupe?.nombreComercialKey,
  ].filter(Boolean);
  const candidateNames = [
    candidate?.dedupe?.nombreKey,
    candidate?.dedupe?.nombreComercialKey,
  ].filter(Boolean);

  if (candidate?.dedupe?.rfcKey && candidate.dedupe.rfcKey === existing?.dedupe?.rfcKey) {
    matches.push("RFC");
  }

  if (
    candidate?.dedupe?.correoKey &&
    candidate.dedupe.correoKey === existing?.dedupe?.correoKey
  ) {
    matches.push("correo");
  }

  if (candidateNames.length && intersects(candidateNames, existingNames)) {
    matches.push("nombre del proveedor");
  }

  if (candidatePhones.length && intersects(candidatePhones, existingPhones)) {
    matches.push("telefono o WhatsApp");
  }

  return [...new Set(matches)];
}

export async function obtenerProveedores() {
  const snapshot = await getDocs(proveedoresCol());
  return sortProveedores(
    filterItemsByTenant(snapshot.docs.map((item) => normalizeProveedor(item.data(), item.id))),
  );
}

export async function guardarProveedor(payload, proveedorId = "") {
  const normalized = normalizeProveedor(payload, proveedorId);
  const targetId = text(proveedorId) || doc(proveedoresCol()).id;
  const existentes = await obtenerProveedores();
  const proveedorActual = existentes.find((item) => item.id === targetId) || null;
  const historialCompras = Array.isArray(payload?.historialCompras)
    ? normalized.historialCompras.map((item, index) =>
        serializeCompraProveedor(item, item.id || `${targetId}_${index + 1}`),
      )
    : proveedorActual?.historialCompras || [];

  if (!proveedorActual || !sameDedupe(proveedorActual.dedupe, normalized.dedupe)) {
    const duplicado = existentes
      .filter((item) => item.id !== targetId)
      .find((item) => detectarCoincidencias(item, normalized).length > 0);

    if (duplicado) {
      const coincidencias = detectarCoincidencias(duplicado, normalized);
      const nombreDuplicado =
        duplicado.nombre || duplicado.nombreComercial || "proveedor existente";
      throw new Error(
        `Ya existe un proveedor similar: "${nombreDuplicado}". Coincidencias detectadas: ${coincidencias.join(", ")}.`,
      );
    }
  }

  await setDoc(
    getDocRef("proveedores", targetId),
    withTenantData({
      id: targetId,
      nombre: normalized.nombre,
      nombreComercial: normalized.nombreComercial,
      contactoPrincipal: normalized.contactoPrincipal,
      telefono: normalized.telefono,
      whatsapp: normalized.whatsapp,
      correo: normalized.correo,
      direccion: normalized.direccion,
      ciudadEstado: normalized.ciudadEstado,
      rfc: normalized.rfc,
      sitioWeb: normalized.sitioWeb,
      tipoProveedor: normalized.tipoProveedor,
      categorias: normalized.categorias,
      marcas: normalized.marcas,
      productosServicios: normalized.productosServicios,
      listaPrecios: normalized.listaPrecios,
      moneda: normalized.moneda,
      tiempoEntrega: normalized.tiempoEntrega,
      costoEnvio: normalized.costoEnvio,
      pedidoMinimo: normalized.pedidoMinimo,
      condicionesPago: normalized.condicionesPago,
      banco: normalized.banco,
      cuenta: normalized.cuenta,
      clabe: normalized.clabe,
      diasCredito: normalized.diasCredito,
      descuentoHabitual: normalized.descuentoHabitual,
      garantia: normalized.garantia,
      politicaDevoluciones: normalized.politicaDevoluciones,
      estado: normalized.estado,
      calificacion: normalized.calificacion,
      ultimaCompraFecha: normalized.ultimaCompraFecha,
      montoTotalComprado: normalized.montoTotalComprado,
      notasInternas: normalized.notasInternas,
      historialCompras,
      dedupe: normalized.dedupe,
      searchText: normalized.searchText,
      updatedAt: serverTimestamp(),
      ...(text(proveedorId) ? {} : { createdAt: serverTimestamp() }),
    }),
    { merge: true },
  );

  return {
    ...normalized,
    id: targetId,
    historialCompras,
  };
}

export async function registrarCompraProveedor(proveedorId, payload = {}) {
  const id = text(proveedorId);
  if (!id) throw new Error("Proveedor invalido");

  const proveedorRef = getDocRef("proveedores", id);
  const snapshot = await getDoc(proveedorRef);

  if (!snapshot.exists()) {
    throw new Error("No se encontro el proveedor seleccionado.");
  }
  if (!dataBelongsToTenant(snapshot.data())) {
    throw new Error("Proveedor fuera del alcance de la cuenta actual.");
  }

  const proveedor = normalizeProveedor(snapshot.data(), snapshot.id);
  const compra = serializeCompraProveedor(payload);

  if (!compra.fecha) {
    throw new Error("Captura la fecha de la compra.");
  }

  if (!compra.concepto) {
    throw new Error("Captura el concepto de la compra.");
  }

  if (compra.monto <= 0) {
    throw new Error("Captura un monto mayor a 0.");
  }

  const historialCompras = sortHistorialCompras([
    compra,
    ...(proveedor.historialCompras || []),
  ]).map((item, index) => serializeCompraProveedor(item, item.id || `${id}_${index + 1}`));

  const montoTotalComprado = Number(proveedor.montoTotalComprado || 0) + compra.monto;
  const ultimaCompraFecha = latestDate(proveedor.ultimaCompraFecha, compra.fecha);

  await setDoc(
    proveedorRef,
    {
      historialCompras,
      montoTotalComprado,
      ultimaCompraFecha,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return normalizeProveedor(
    {
      ...proveedor,
      historialCompras,
      montoTotalComprado,
      ultimaCompraFecha,
      updatedAt: new Date().toISOString(),
    },
    id,
  );
}

export async function eliminarProveedor(proveedorId) {
  const id = text(proveedorId);
  if (!id) throw new Error("Proveedor invalido");
  const snapshot = await getDoc(getDocRef("proveedores", id));
  if (snapshot.exists() && !dataBelongsToTenant(snapshot.data())) {
    throw new Error("Proveedor fuera del alcance de la cuenta actual.");
  }
  await deleteDoc(getDocRef("proveedores", id));
}
