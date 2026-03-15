const DIRECT_FUNCTION_URL =
  "https://southamerica-east1-hojaservice-3ab3d.cloudfunctions.net/googleImageSearch";

export async function buscarImagenModeloGoogle(queryText) {
  const q = String(queryText || "").trim();
  if (!q) return { result: null, error: "" };

  const endpoints = [
    `/api/google-image/search?q=${encodeURIComponent(q)}`,
    `${DIRECT_FUNCTION_URL}?q=${encodeURIComponent(q)}`,
  ];

  let lastError = "";

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { method: "GET" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        lastError = data?.detail || data?.error || `status ${res.status}`;
        continue;
      }

      return {
        result: data?.result || null,
        error: String(data?.detail || ""),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    result: null,
    error: lastError || "No se pudo consultar imagen del modelo.",
  };
}
