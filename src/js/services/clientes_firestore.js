import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  orderBy,
  query,
  where,
  serverTimestamp,
  startAt,
  endAt,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../initializer/firebase";

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
    ...patch,
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

  // Prefix search por nombreNorm
  const qy = query(
    collection(db, "clientes"),
    orderBy("nombreNorm"),
    startAt(norm),
    endAt(norm + "\uf8ff"),
    limit(maxFetch)
  );

  const snap = await getDocs(qy);
  const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const inC = compact(input);

  let candidatos = arr;

  // Fallback para clientes viejos con nombreNorm/nombreCompact vacios.
  if (candidatos.length < maxReturn) {
    const fallbackQ = query(
      collection(db, "clientes"),
      orderBy("updatedAt", "desc"),
      limit(Math.max(maxFetch * 2, 120)),
    );
    const fallbackSnap = await getDocs(fallbackQ);
    const fallback = fallbackSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => {
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
  const qy = query(collection(db, "clientes"), orderBy("updatedAt", "desc"), limit(max));
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Leer un cliente por ID
export async function obtenerClientePorId(id) {
  const snap = await getDoc(doc(db, "clientes", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listarServiciosPorClienteId(clienteId) {
  const qy = query(
    collection(db, "servicios"),
    where("clienteId", "==", clienteId)
  );

  const snap = await getDocs(qy);

  const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // ordenar en el cliente (sin índice)
  arr.sort(
    (a, b) =>
      (b?.createdAt?.seconds || 0) - (a?.createdAt?.seconds || 0)
  );

  return arr;
}
