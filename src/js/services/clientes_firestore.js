import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../initializer/firebase";
import {
  dataBelongsToTenant,
  filterItemsByTenant,
  getTenantCollectionQuery,
  withTenantData,
} from "./tenant";

/* ========= Normalización ========= */
function separarCamelCase(s) {
  return (s || "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function normalizarTexto(raw) {
  return separarCamelCase(raw)
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // sin acentos
    .replace(/[^a-z0-9 ]/g, " ")      // símbolos -> espacio
    .trim()
    .replace(/\s+/g, " ");
}

export function compact(raw) {
  return normalizarTexto(raw).replace(/\s+/g, "");
}

/* ========= Similaridad ========= */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/* ========= Crear cliente ========= */
export async function crearCliente({
  nombre,
  telefono,
  direccion,
  numeroSeriePreferido = "",
  omitirNumeroSerie = false,
}) {
  const nombreNorm = normalizarTexto(nombre);
  const nombreCompact = compact(nombre);

  const ref = await addDoc(collection(db, "clientes"), {
    ...withTenantData({}),
    nombre: (nombre || "").trim(),
    nombreNorm,
    nombreCompact,
    telefono: (telefono || "").trim(),
    direccion: (direccion || "").trim(),
    numeroSeriePreferido: omitirNumeroSerie
      ? ""
      : String(numeroSeriePreferido || "").trim(),
    omitirNumeroSerie: !!omitirNumeroSerie,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: ref.id };
}

/* ========= Actualizar cliente ========= */
export async function actualizarCliente(id, patch) {
  const ref = doc(db, "clientes", id);
  const snap = await getDoc(ref);
  const actual = snap.exists() ? snap.data() : {};
  if (snap.exists() && !dataBelongsToTenant(actual)) {
    throw new Error("Cliente fuera del alcance de la cuenta actual.");
  }

  const nombreFinal = Object.prototype.hasOwnProperty.call(patch || {}, "nombre")
    ? String(patch?.nombre || "").trim()
    : String(actual?.nombre || "").trim();
  const omitirNumeroSerieFinal = Object.prototype.hasOwnProperty.call(
    patch || {},
    "omitirNumeroSerie"
  )
    ? !!patch?.omitirNumeroSerie
    : !!actual?.omitirNumeroSerie;
  const numeroSerieFinal = Object.prototype.hasOwnProperty.call(
    patch || {},
    "numeroSeriePreferido"
  )
    ? String(patch?.numeroSeriePreferido || "").trim()
    : String(actual?.numeroSeriePreferido || "").trim();

  await updateDoc(ref, {
    ...withTenantData(patch),
    numeroSeriePreferido: omitirNumeroSerieFinal ? "" : numeroSerieFinal,
    omitirNumeroSerie: omitirNumeroSerieFinal,
    nombreNorm: normalizarTexto(nombreFinal),
    nombreCompact: compact(nombreFinal),
    updatedAt: serverTimestamp(),
  });
}

/* ========= Buscar similares ========= */
export async function buscarClientesSimilares(
  input,
  { maxFetch = 50, maxReturn = 8 } = {}
) {
  const norm = normalizarTexto(input);
  if (!norm) return [];
  const snap = await getDocs(getTenantCollectionQuery("clientes"));
  const arr = filterItemsByTenant(
    snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  )
    .filter((c) => {
      const nombreN = normalizarTexto(c?.nombreNorm || c?.nombre || "");
      const nombreC = compact(c?.nombreCompact || c?.nombre || "");
      return nombreN.includes(norm) || nombreC.includes(compact(input));
    })
    .slice(0, maxFetch);

  const inC = compact(input);

  let candidatos = arr;

  // Fallback para clientes viejos con nombreNorm/nombreCompact vacios.
  if (candidatos.length < maxReturn) {
    const fallback = filterItemsByTenant(
      snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    ).filter((c) => {
      const nombreN = normalizarTexto(c?.nombre || "");
      const nombreC = compact(c?.nombre || "");
      return nombreN.includes(norm) || nombreC.includes(inC);
    });

    const byId = new Map();
    [...arr, ...fallback].forEach((c) => byId.set(c.id, c));
    candidatos = [...byId.values()];
  }

  // Ranking por distancia
  const ranked = candidatos
    .map((c) => {
      const cC = c.nombreCompact || compact(c.nombre || "");
      const dist = levenshtein(inC, cC);
      return { ...c, _dist: dist };
    })
    .sort((a, b) => a._dist - b._dist)
    .slice(0, maxReturn);

  return ranked;
}
// Lista clientes (últimos actualizados)
export async function listarClientes({ max = 100 } = {}) {
  const snap = await getDocs(getTenantCollectionQuery("clientes"));
  return filterItemsByTenant(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    .sort((a, b) => toMillis(b?.updatedAt) - toMillis(a?.updatedAt))
    .slice(0, max);
}

// Leer un cliente por ID
export async function obtenerClientePorId(id) {
  const snap = await getDoc(doc(db, "clientes", id));
  if (!snap.exists()) return null;
  if (!dataBelongsToTenant(snap.data())) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listarServiciosPorClienteId(clienteId) {
  const snap = await getDocs(getTenantCollectionQuery("servicios"));
  const arr = filterItemsByTenant(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    .filter((item) => item?.clienteId === clienteId);

  // ordenar en el cliente (sin índice)
  arr.sort(
    (a, b) =>
      (b?.createdAt?.seconds || 0) - (a?.createdAt?.seconds || 0)
  );

  return arr;
}

function toMillis(raw) {
  if (!raw) return 0;
  if (typeof raw?.toDate === "function") return raw.toDate().getTime();
  if (typeof raw?.seconds === "number") return raw.seconds * 1000;
  const fecha = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
}

export async function listarVentasPorCliente({ clienteId = "", telefono = "" } = {}) {
  const telefonoLimpio = String(telefono || "").trim();
  if (!clienteId && !telefonoLimpio) return [];

  const snap = await getDocs(getTenantCollectionQuery("ventas"));
  const byId = new Map();

  snap.docs.forEach((d) => {
    const data = d.data() || {};
    if (!dataBelongsToTenant(data)) return;
    const sameCliente = clienteId && data?.clienteId === clienteId;
    const sameTelefono = telefonoLimpio && String(data?.clienteTelefono || "").trim() === telefonoLimpio;
    if (sameCliente || sameTelefono) {
      byId.set(d.id, { id: d.id, ...data });
    }
  });

  return [...byId.values()].sort(
    (a, b) => toMillis(b?.fecha || b?.createdAt) - toMillis(a?.fecha || a?.createdAt),
  );
}
