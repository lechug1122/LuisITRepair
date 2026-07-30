import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../initializer/firebase";

export const TERMINOS_CAJA_LIBRE_VERSION = "2026-07-22";
export const PLAN_GRATUITO = "Gratuito";
export const NEGOCIO_ESTADOS = ["activo", "bloqueado", "suspendido", "pendiente", "gratuito"];
export const ESTADOS_CON_ACCESO_OPERATIVO = ["activo", "gratuito", "pendiente"];

export const SOPORTE_CAJA_LIBRE = {
  telefono: "2731430147",
  correo: "cajalibre.puntodeventa@gmail.com",
  whatsapp: "https://wa.me/522731430147",
};

function cleanText(value = "") {
  return String(value || "").trim();
}

export function normalizeNegocio(raw = {}, id = "") {
  const negocioId = cleanText(raw?.negocioId || id || raw?.cuentaPrincipalUid);
  const estado = NEGOCIO_ESTADOS.includes(raw?.estado) ? raw.estado : "gratuito";

  return {
    ...raw,
    id: cleanText(id || negocioId),
    negocioId,
    cuentaPrincipalUid: cleanText(raw?.cuentaPrincipalUid || negocioId),
    nombre: cleanText(raw?.nombre || raw?.titularNombre || "Negocio"),
    estado,
    planActual: cleanText(raw?.planActual || PLAN_GRATUITO) || PLAN_GRATUITO,
    gratuito: raw?.gratuito !== false,
    usuariosGratis: raw?.usuariosGratis !== false,
    cobrosAutomaticos: raw?.cobrosAutomaticos === true,
    setupCompleto: raw?.setupCompleto === true,
    terminosAceptados: raw?.terminosAceptados === true,
    terminosVersion: cleanText(raw?.terminosVersion),
    bloqueoRazon: cleanText(raw?.bloqueoRazon),
    soporteTelefono: cleanText(raw?.soporteTelefono || SOPORTE_CAJA_LIBRE.telefono),
    soporteCorreo: cleanText(raw?.soporteCorreo || SOPORTE_CAJA_LIBRE.correo),
    conteos: {
      usuariosTotal: Number(raw?.conteos?.usuariosTotal || 0),
      usuariosActivos: Number(raw?.conteos?.usuariosActivos || 0),
      usuariosPendientes: Number(raw?.conteos?.usuariosPendientes || 0),
      usuariosDeshabilitados: Number(raw?.conteos?.usuariosDeshabilitados || 0),
      equiposTotal: Number(raw?.conteos?.equiposTotal || 0),
    },
  };
}

export function puedeAccederOperativo(negocio = null) {
  if (!negocio?.negocioId) return true;
  if (negocio.estado === "bloqueado" || negocio.estado === "suspendido") return false;
  return ESTADOS_CON_ACCESO_OPERATIVO.includes(negocio.estado);
}

export async function obtenerNegocio(negocioId = "") {
  const safeId = cleanText(negocioId);
  if (!safeId) return null;

  const snap = await getDoc(doc(db, "negocios", safeId));
  if (!snap.exists()) return null;
  return normalizeNegocio(snap.data(), snap.id);
}

export function escucharNegocio(negocioId = "", onData, onError) {
  const safeId = cleanText(negocioId);
  if (!safeId) {
    onData?.(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, "negocios", safeId),
    (snap) => {
      onData?.(snap.exists() ? normalizeNegocio(snap.data(), snap.id) : null);
    },
    onError,
  );
}

export async function crearNegocioInicial({
  negocioId,
  nombre,
  telefono = "",
  correo = "",
  administradorUid = "",
} = {}) {
  const safeNegocioId = cleanText(negocioId || administradorUid);
  if (!safeNegocioId) throw new Error("Falta negocioId.");

  await setDoc(
    doc(db, "negocios", safeNegocioId),
    {
      negocioId: safeNegocioId,
      cuentaPrincipalUid: safeNegocioId,
      administradorUid: cleanText(administradorUid || safeNegocioId),
      nombre: cleanText(nombre) || "Mi negocio",
      telefono: cleanText(telefono),
      correo: cleanText(correo),
      estado: "pendiente",
      planActual: PLAN_GRATUITO,
      modalidad: "gratuito",
      gratuito: true,
      usuariosGratis: true,
      cobrosAutomaticos: false,
      costosInternosVisibles: false,
      setupCompleto: false,
      terminosAceptados: false,
      terminosVersion: "",
      conteos: {
        usuariosTotal: 1,
        usuariosActivos: 1,
        usuariosPendientes: 0,
        usuariosDeshabilitados: 0,
        equiposTotal: 0,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function aceptarTerminosNegocio({ uid, negocioId, nombre = "", correo = "" } = {}) {
  const safeUid = cleanText(uid);
  const safeNegocioId = cleanText(negocioId);
  if (!safeUid || !safeNegocioId) throw new Error("Falta usuario o negocio.");

  const acceptedAt = serverTimestamp();
  const acceptanceNonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const aceptacionRef = doc(
    db,
    "terminos_aceptaciones",
    `${safeNegocioId}_${safeUid}_${TERMINOS_CAJA_LIBRE_VERSION}_${acceptanceNonce}`,
  );

  const logSoftError = (scope, error) => {
    console.warn(`[terminos] No se pudo guardar ${scope}:`, error?.code || error);
  };

  const acceptanceBatch = writeBatch(db);
  acceptanceBatch.set(aceptacionRef, {
    uid: safeUid,
    negocioId: safeNegocioId,
    cuentaPrincipalUid: safeNegocioId,
    nombre: cleanText(nombre),
    correo: cleanText(correo),
    version: TERMINOS_CAJA_LIBRE_VERSION,
    aceptado: true,
    acceptedAt,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  });
  await acceptanceBatch.commit();

  // Estas dos escrituras son obligatorias. Si alguna falla, no se avanza al
  // onboarding para evitar que la ruta protegida regrese nuevamente a Términos.
  await Promise.all([
    setDoc(
      doc(db, "negocios", safeNegocioId),
      {
        terminosAceptados: true,
        terminosVersion: TERMINOS_CAJA_LIBRE_VERSION,
        terminosAceptadosPorUid: safeUid,
        terminosAceptadosAt: acceptedAt,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
    setDoc(
      doc(db, "autorizados", safeUid),
      {
        terminosAceptados: true,
        terminosVersion: TERMINOS_CAJA_LIBRE_VERSION,
        terminosAceptadosAt: acceptedAt,
      },
      { merge: true },
    ),
  ]);

  await setDoc(
    doc(db, "admin_bitacora", `${Date.now()}_${safeUid}_terminos`),
    {
      tipo: "terminos_aceptados",
      uid: safeUid,
      negocioId: safeNegocioId,
      version: TERMINOS_CAJA_LIBRE_VERSION,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  ).catch((error) => logSoftError("bitacora", error));
}

export async function completarConfiguracionInicial({
  uid,
  negocioId,
  nombre,
  telefono = "",
  correoTickets = "",
  correoNotas = "",
  tipoNegocioId = "",
  administradorNombre = "",
  cantidadEmpleados = 1,
  rolesIniciales = [],
} = {}) {
  const safeNegocioId = cleanText(negocioId);
  const safeUid = cleanText(uid);
  if (!safeNegocioId || !safeUid) throw new Error("Falta usuario o negocio.");

  const logSoftError = (scope, error) => {
    console.warn(`[configuracion-inicial] No se pudo guardar ${scope}:`, error?.code || error);
  };

  await setDoc(
    doc(db, "negocios", safeNegocioId),
    {
      nombre: cleanText(nombre) || "Mi negocio",
      telefono: cleanText(telefono),
      tipoNegocioId: cleanText(tipoNegocioId),
      equipoInicial: {
        cantidad: Math.max(1, Number(cantidadEmpleados) || 1),
        roles: Array.isArray(rolesIniciales)
          ? rolesIniciales.map(cleanText).filter(Boolean)
          : [],
      },
      estado: "gratuito",
      setupCompleto: true,
      planActual: PLAN_GRATUITO,
      modalidad: "gratuito",
      gratuito: true,
      cobrosAutomaticos: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    doc(db, "configuracion", `empresa__${safeNegocioId}`),
    {
      nombre: cleanText(nombre) || "Mi negocio",
      telefono: cleanText(telefono),
      correoTickets: cleanText(correoTickets).toLowerCase(),
      correoNotas: cleanText(correoNotas).toLowerCase(),
      tipoNegocioId: cleanText(tipoNegocioId),
      negocioId: safeNegocioId,
      cuentaPrincipalUid: safeNegocioId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    doc(db, "autorizados", safeUid),
    {
      setupCompleto: true,
    },
    { merge: true },
  );

  try {
    const empleadosSnap = await getDocs(
      query(
        collection(db, "empleados"),
        where("cuentaPrincipalUid", "==", safeNegocioId),
      ),
    );
    const administradorDocs = empleadosSnap.docs.filter(
      (empleadoDoc) => cleanText(empleadoDoc.data()?.uid) === safeUid,
    );
    if (administradorDocs.length > 0) {
      const batch = writeBatch(db);
      administradorDocs.forEach((empleadoDoc) => {
        batch.update(empleadoDoc.ref, {
          nombre: cleanText(administradorNombre) || empleadoDoc.data()?.nombre || "Administrador",
          telefono: cleanText(telefono),
          setupCompleto: true,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  } catch (error) {
    logSoftError("empleado administrador", error);
  }

  await setDoc(
    doc(db, "admin_bitacora", `${Date.now()}_${safeUid}_setup`),
    {
      tipo: "configuracion_inicial_completa",
      uid: safeUid,
      negocioId: safeNegocioId,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  ).catch((error) => logSoftError("bitacora", error));
}

export async function actualizarConteosNegocio(negocioId = "") {
  const safeNegocioId = cleanText(negocioId);
  if (!safeNegocioId) return null;

  const usuariosQuery = query(
    collection(db, "autorizados"),
    where("negocioId", "==", safeNegocioId),
  );
  const usuariosSnap = await getDocs(usuariosQuery);
  let usuariosActivos = 0;
  let usuariosPendientes = 0;
  let usuariosDeshabilitados = 0;

  usuariosSnap.forEach((item) => {
    const data = item.data() || {};
    if (data.activo === false || data.estado === "Deshabilitado") {
      usuariosDeshabilitados += 1;
    } else if (data.estado === "Pendiente" || data.activo === null) {
      usuariosPendientes += 1;
    } else {
      usuariosActivos += 1;
    }
  });

  const equiposCount = await getCountFromServer(
    query(collection(db, "sesiones_dispositivo"), where("negocioId", "==", safeNegocioId)),
  ).catch(() => null);

  const conteos = {
    usuariosTotal: usuariosSnap.size,
    usuariosActivos,
    usuariosPendientes,
    usuariosDeshabilitados,
    equiposTotal: equiposCount?.data()?.count || 0,
  };

  await updateDoc(doc(db, "negocios", safeNegocioId), {
    conteos,
    updatedAt: serverTimestamp(),
  });

  return conteos;
}

export async function actualizarEstadoNegocio({
  negocioId,
  estado,
  razon = "",
  actorUid = "",
} = {}) {
  const safeNegocioId = cleanText(negocioId);
  const safeEstado = cleanText(estado).toLowerCase();
  if (!safeNegocioId || !NEGOCIO_ESTADOS.includes(safeEstado)) {
    throw new Error("Estado de negocio invalido.");
  }

  const bloqueoFecha = ["bloqueado", "suspendido"].includes(safeEstado)
    ? serverTimestamp()
    : null;

  const batch = writeBatch(db);
  batch.set(
    doc(db, "negocios", safeNegocioId),
    {
      estado: safeEstado,
      bloqueoRazon: cleanText(razon),
      bloqueoFecha,
      updatedAt: serverTimestamp(),
      updatedByUid: cleanText(actorUid),
    },
    { merge: true },
  );
  batch.set(
    doc(db, "admin_bitacora", `${Date.now()}_${cleanText(actorUid) || "system"}_${safeNegocioId}`),
    {
      tipo: "estado_negocio_actualizado",
      negocioId: safeNegocioId,
      estado: safeEstado,
      razon: cleanText(razon),
      actorUid: cleanText(actorUid),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
}

async function deleteQueryDocuments(colName, field, negocioId, deletedIds) {
  const snapshot = await getDocs(query(collection(db, colName), where(field, "==", negocioId)));
  const refs = snapshot.docs.filter((item) => !deletedIds.has(`${colName}/${item.id}`));

  for (let index = 0; index < refs.length; index += 450) {
    const batch = writeBatch(db);
    refs.slice(index, index + 450).forEach((item) => {
      deletedIds.add(`${colName}/${item.id}`);
      batch.delete(item.ref);
    });
    await batch.commit();
  }

  return refs.length;
}

async function deleteKnownConfigDocuments(negocioId, deletedIds) {
  const snapshot = await getDocs(collection(db, "configuracion"));
  const refs = snapshot.docs.filter((item) => {
    if (deletedIds.has(`configuracion/${item.id}`)) return false;
    const data = item.data() || {};
    return (
      item.id.endsWith(`__${negocioId}`) ||
      cleanText(data?.negocioId) === negocioId ||
      cleanText(data?.cuentaPrincipalUid) === negocioId
    );
  });

  for (let index = 0; index < refs.length; index += 450) {
    const batch = writeBatch(db);
    refs.slice(index, index + 450).forEach((item) => {
      deletedIds.add(`configuracion/${item.id}`);
      batch.delete(item.ref);
    });
    await batch.commit();
  }

  return refs.length;
}

export async function eliminarNegocioConDatos({ negocioId, actorUid = "", razon = "" } = {}) {
  const safeNegocioId = cleanText(negocioId);
  if (!safeNegocioId) throw new Error("Falta negocioId.");

  await setDoc(
    doc(db, "admin_bitacora", `${Date.now()}_${cleanText(actorUid) || "system"}_${safeNegocioId}_delete`),
    {
      tipo: "negocio_eliminado",
      negocioId: safeNegocioId,
      actorUid: cleanText(actorUid),
      razon: cleanText(razon),
      aviso:
        "Eliminacion solicitada desde panel superadmin. Se eliminan datos Firestore del negocio; Auth requiere limpieza aparte.",
      createdAt: serverTimestamp(),
    },
    { merge: true },
  ).catch((error) => {
    console.warn("[negocios] No se pudo registrar bitacora de eliminacion:", error?.code || error);
  });

  const deletedIds = new Set();
  const collectionsByTenant = [
    "autorizados",
    "empleados",
    "clientes",
    "productos",
    "proveedores",
    "ventas",
    "cortes_caja",
    "egresos_diarios",
    "servicios",
    "sesiones_dispositivo",
    "pos_mobile_scans",
    "terminos_aceptaciones",
  ];

  let totalDeleted = 0;
  for (const colName of collectionsByTenant) {
    totalDeleted += await deleteQueryDocuments(colName, "negocioId", safeNegocioId, deletedIds);
    totalDeleted += await deleteQueryDocuments(colName, "cuentaPrincipalUid", safeNegocioId, deletedIds);
  }

  totalDeleted += await deleteKnownConfigDocuments(safeNegocioId, deletedIds);

  const batch = writeBatch(db);
  batch.delete(doc(db, "negocios", safeNegocioId));
  batch.delete(doc(db, "suscripciones", safeNegocioId));
  await batch.commit();
  totalDeleted += 2;

  return { totalDeleted };
}
