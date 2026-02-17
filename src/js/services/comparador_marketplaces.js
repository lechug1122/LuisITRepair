const MONEY = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const toNumber = (value) => {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const formatMoney = (value) => MONEY.format(toNumber(value));

export function buildMercadoLibreSearchLink(queryText) {
  return `https://listado.mercadolibre.com.mx/${encodeURIComponent(String(queryText || "").trim())}`;
}

export function buildGoogleShoppingSearchLink(queryText) {
  const q = String(queryText || "").trim();
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;
}

export function buildGoogleSearchLink(queryText) {
  const q = String(queryText || "").trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

const DIRECT_FUNCTION_URL =
  "https://southamerica-east1-hojaservice-3ab3d.cloudfunctions.net/mlSearch";
const SERP_ENDPOINT = "/api/serp/search";

async function fetchMlEndpoint(endpoint) {
  const res = await fetch(endpoint, { method: "GET" });
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  const bodyText = await res.text();

  const tryParseJson = () => {
    try {
      return JSON.parse(bodyText);
    } catch {
      return null;
    }
  };

  if (!res.ok) {
    let msg = `status ${res.status}`;
    const errJson = tryParseJson();
    if (errJson) {
      msg = errJson?.error || errJson?.message || msg;
    } else if (bodyText.trim().startsWith("<")) {
      msg = "endpoint no disponible en despliegue (respondio HTML)";
    } else if (bodyText.trim()) {
      msg = bodyText.slice(0, 140);
    }
    throw new Error(`No se pudo consultar Mercado Libre (${msg}).`);
  }

  let data = null;
  if (contentType.includes("application/json")) {
    data = tryParseJson();
  } else if (bodyText.trim().startsWith("{") || bodyText.trim().startsWith("[")) {
    data = tryParseJson();
  }

  if (!data) {
    throw new Error(
      "Respuesta invalida del comparador (se esperaba JSON). Verifica el endpoint /api/ml/search."
    );
  }

  return data;
}

export async function buscarMercadoLibre(queryText) {
  const q = String(queryText || "").trim();
  if (!q) return [];

  const endpoints = [
    `/api/ml/search?q=${encodeURIComponent(q)}&limit=12`,
    `${DIRECT_FUNCTION_URL}?q=${encodeURIComponent(q)}&limit=12`,
  ];

  let data = null;
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      data = await fetchMlEndpoint(endpoint);
      if (data) break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!data) {
    throw lastError || new Error("No se pudo consultar Mercado Libre.");
  }

  const resultados = Array.isArray(data?.results) ? data.results : [];

  return resultados
    .filter((r) => Number.isFinite(Number(r?.price)))
    .map((r) => ({
      id: r.id,
      titulo: r.title || "Sin titulo",
      precio: Number(r.price || 0),
      link: r.permalink || "",
      condicion: r.condition || "-",
      vendidos: Number(r.sold_quantity || 0),
    }));
}

async function buscarGoogleShoppingSerpapi(queryText) {
  const q = String(queryText || "").trim();
  if (!q) return [];

  const res = await fetch(`${SERP_ENDPOINT}?q=${encodeURIComponent(q)}&limit=12`, {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error(`Comparador Google no disponible (status ${res.status}).`);
  }

  const data = await res.json().catch(() => null);
  const items = Array.isArray(data?.results) ? data.results : [];
  return items
    .filter((r) => Number.isFinite(Number(r?.price)))
    .map((r, i) => ({
      id: r.id || `g-${i + 1}`,
      titulo: r.title || "Sin titulo",
      precio: Number(r.price || 0),
      link: r.link || r.permalink || "",
      condicion: r.store || "Google Shopping",
      vendidos: 0,
    }));
}

export async function buscarComparativaPrecios(queryText) {
  const q = String(queryText || "").trim();
  if (!q) return { resultados: [], fuente: "none", error: "" };

  const allowSerp = String(import.meta.env.VITE_ENABLE_SERPAPI || "").trim() === "1";
  try {
    const ml = await buscarMercadoLibre(q);
    if (ml.length > 0) return { resultados: ml, fuente: "mercado_libre", error: "" };
  } catch (e) {
    const mlError = e?.message || "No se pudo consultar Mercado Libre.";
    if (!allowSerp) return { resultados: [], fuente: "mercado_libre", error: mlError };
  }

  if (!allowSerp) {
    return { resultados: [], fuente: "mercado_libre", error: "Sin resultados automáticos por bloqueo del proveedor." };
  }

  try {
    const google = await buscarGoogleShoppingSerpapi(q);
    if (google.length > 0) return { resultados: google, fuente: "google_shopping", error: "" };
    return { resultados: [], fuente: "google_shopping", error: "Google Shopping no devolvió resultados." };
  } catch (e) {
    return { resultados: [], fuente: "google_shopping", error: e?.message || "No se pudo consultar Google Shopping." };
  }
}

export function calcularComparativa(precioLocal, resultados) {
  const local = toNumber(precioLocal);
  const precios = (resultados || []).map((r) => toNumber(r.precio)).filter((n) => n > 0);

  if (!precios.length) {
    return {
      local,
      promedio: 0,
      minimo: 0,
      maximo: 0,
      diferenciaAbs: 0,
      diferenciaPct: 0,
    };
  }

  const suma = precios.reduce((acc, n) => acc + n, 0);
  const promedio = suma / precios.length;
  const minimo = Math.min(...precios);
  const maximo = Math.max(...precios);
  const diferenciaAbs = local - promedio;
  const diferenciaPct = promedio > 0 ? (diferenciaAbs / promedio) * 100 : 0;

  return {
    local,
    promedio,
    minimo,
    maximo,
    diferenciaAbs,
    diferenciaPct,
  };
}
export function calcularSugerenciaAutomatica(precioLocal) {
  const local = toNumber(precioLocal);

  if (!local) {
    return {
      local: 0,
      promedio: 0,
      minimo: 0,
      maximo: 0,
      diferenciaAbs: 0,
      diferenciaPct: 0,
    };
  }

  // Simulación inteligente de mercado mexicano retail
  const promedio = local * 0.93;   // mercado suele estar 5-10% abajo
  const minimo = local * 0.88;
  const maximo = local * 1.12;

  const diferenciaAbs = local - promedio;
  const diferenciaPct = promedio > 0 ? (diferenciaAbs / promedio) * 100 : 0;

  return {
    local,
    promedio,
    minimo,
    maximo,
    diferenciaAbs,
    diferenciaPct,
  };
}
