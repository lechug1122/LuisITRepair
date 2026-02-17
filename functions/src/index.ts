/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

function decodeHtmlEntities(text: string): string {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(text: string): string {
  return decodeHtmlEntities(String(text || "").replace(/<[^>]*>/g, "")).trim();
}

function parseMlSearchHtml(html: string) {
  const raw = String(html || "");
  const results: Array<Record<string, unknown>> = [];
  const regexTitle =
    /<a[^>]*class="(?:poly-component__title|poly-card__title|poly-item__title)[^"]*"[^>]*>[\s\S]*?<\/a>/g;

  let match: RegExpExecArray | null;
  while ((match = regexTitle.exec(raw)) !== null && results.length < 12) {
    const anchorHtml = match[0];
    const hrefMatch = anchorHtml.match(/href="([^"]+)"/i);
    const titleMatch = anchorHtml.match(/>([\s\S]*?)<\/a>$/i);
    const link = decodeHtmlEntities(hrefMatch ? hrefMatch[1] : "");
    const title = stripHtml(titleMatch ? titleMatch[1] : "");
    const start = match.index;
    const snippet = raw.slice(start, start + 10000);

    const priceMatch =
      snippet.match(/andes-money-amount__fraction[^>]*>([\d,.]+)</) ||
      snippet.match(/poly-price__current[^>]*>\s*\$?\s*([\d,.]+)/i) ||
      snippet.match(/"price"\s*:\s*([\d.]+)/i);
    const centsMatch = snippet.match(/andes-money-amount__cents[^>]*>(\d{1,2})</);
    const soldMatch = snippet.match(/(\+?\d[\d.,]*)\s+vendidos/i);

    const fraction = priceMatch ? priceMatch[1].replace(/[.,]/g, "") : "";
    const cents = centsMatch ? centsMatch[1] : "00";
    const price = fraction ? Number(`${fraction}.${cents}`) : 0;

    results.push({
      id: `web-${results.length + 1}`,
      title,
      price,
      permalink: link,
      condition: "-",
      sold_quantity: soldMatch ? Number(String(soldMatch[1]).replace(/[^\d]/g, "")) || 0 : 0,
    });
  }

  if (results.length > 0) {
    return {results: results.filter((r) => r.title && Number(r.price) > 0)};
  }

  // Fallback ultra-generico: cualquier anchor con texto + precio cercano.
  const generic: Array<Record<string, unknown>> = [];
  const regexGeneric = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let gm: RegExpExecArray | null;
  while ((gm = regexGeneric.exec(raw)) !== null && generic.length < 20) {
    const href = decodeHtmlEntities(gm[1] || "");
    const title = stripHtml(gm[2] || "");
    if (title.length < 12) continue;
    if (!/(mercadolibre|mlm|click|item|producto|iphone|memoria|usb|laptop|pc)/i.test(href + title)) {
      continue;
    }
    const start = gm.index;
    const snippet = raw.slice(start, start + 4000);
    const priceMatch =
      snippet.match(/andes-money-amount__fraction[^>]*>([\d,.]+)</) ||
      snippet.match(/"price"\s*:\s*([\d.]+)/i);
    const fraction = priceMatch ? String(priceMatch[1]).replace(/[^\d]/g, "") : "";
    const price = fraction ? Number(fraction) : 0;
    if (price <= 0) continue;

    generic.push({
      id: `gen-${generic.length + 1}`,
      title,
      price,
      permalink: href,
      condition: "-",
      sold_quantity: 0,
    });
  }

  return {results: generic.slice(0, 12)};
}

function buildQueryVariants(rawQuery: string): string[] {
  const clean = String(rawQuery || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return [];

  const tokens = clean.split(" ").filter(Boolean);
  const filtered = tokens.filter((t) => {
    if (t.length <= 2) return false;
    if (/^\d+(\.\d+)?$/.test(t)) return false;
    return !["tech", "color", "pastel", "modelo", "model", "stylos"].includes(t);
  });

  const variants = new Set<string>();
  variants.add(clean);

  if (filtered.length > 0) variants.add(filtered.join(" "));
  if (filtered.length >= 3) variants.add(filtered.slice(0, 3).join(" "));
  if (filtered.length >= 4) variants.add(filtered.slice(0, 4).join(" "));
  if (tokens.length >= 3) variants.add(tokens.slice(0, 3).join(" "));

  return [...variants].filter((v) => v.trim().length > 0).slice(0, 5);
}

async function fetchMlApi(
  query: string,
  limit: string,
  accessToken?: string
): Promise<{results: Array<Record<string, unknown>>; status: number; errorDetail?: string}> {
  const target =
    `https://api.mercadolibre.com/sites/MLM/search` +
    `?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}&status=active`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    Referer: "https://www.mercadolibre.com.mx/",
    Origin: "https://www.mercadolibre.com.mx",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const mlRes = await fetch(target, {
    method: "GET",
    headers,
  });

  if (!mlRes.ok) {
    const detail = await mlRes.text().catch(() => "");
    return {results: [], status: mlRes.status, errorDetail: String(detail || "").slice(0, 500)};
  }

  const payload = await mlRes.json().catch(() => null);
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return {
    results: results.filter((r: Record<string, unknown>) => Number(r?.price || 0) > 0),
    status: mlRes.status,
  };
}

async function refreshMlAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) return null;
  const payload = await res.json().catch(() => null);
  const token = String(payload?.access_token || "").trim();
  return token || null;
}

async function fetchMlHtml(query: string, debug = false): Promise<{
  results: Array<Record<string, unknown>>;
  diagnostics?: Array<Record<string, unknown>>;
}> {
  const urls = [
    `https://www.mercadolibre.com.mx/jm/search?as_word=${encodeURIComponent(query)}`,
    `https://listado.mercadolibre.com.mx/${encodeURIComponent(query)}`,
    `https://m.mercadolibre.com.mx/${encodeURIComponent(query)}`,
  ];
  const diagnostics: Array<Record<string, unknown>> = [];

  for (const htmlUrl of urls) {
    const htmlRes = await fetch(htmlUrl, {
      method: "GET",
      headers: {
        Accept: "text/html",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        Referer: "https://www.mercadolibre.com.mx/",
      },
    });

    if (!htmlRes.ok) {
      diagnostics.push({ source: htmlUrl, status: htmlRes.status, ok: false });
      continue;
    }
    const html = await htmlRes.text();
    const parsed = parseMlSearchHtml(html);
    const rows = Array.isArray(parsed?.results) ? parsed.results : [];
    diagnostics.push({
      source: htmlUrl,
      status: htmlRes.status,
      ok: true,
      htmlLength: html.length,
      titleClassHits: (html.match(/poly-component__title/g) || []).length,
      priceHits: (html.match(/andes-money-amount__fraction/g) || []).length,
      resultados: rows.length,
      antiBotHint:
        /captcha|robot|automated|verify|cloudflare|access denied/i.test(html) ? true : false,
    });
    if (rows.length > 0) return { results: rows, diagnostics: debug ? diagnostics : undefined };
  }

  return { results: [], diagnostics: debug ? diagnostics : undefined };
}

export const mlSearch = onRequest({region: "southamerica-east1", invoker: "public"}, async (request, response) => {
  try {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "GET,OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    const q = String(request.query.q || "").trim();
    const limit = String(request.query.limit || "12").trim();
    const debugMode = String(request.query.debug || "").trim() === "1";
    let meliAccessToken = String(process.env.MELI_ACCESS_TOKEN || "").trim();
    const meliClientId = String(process.env.MELI_CLIENT_ID || "").trim();
    const meliClientSecret = String(process.env.MELI_CLIENT_SECRET || "").trim();
    const meliRefreshToken = String(process.env.MELI_REFRESH_TOKEN || "").trim();

    if (!q) {
      response.status(400).json({error: "Parametro q requerido."});
      return;
    }

    const queries = buildQueryVariants(q);
    let tokenRefreshed = false;

    const apiDiagnostics: Array<Record<string, unknown>> = [];
    for (const query of queries) {
      let apiPack = await fetchMlApi(query, limit, meliAccessToken || undefined);
      let apiResults = apiPack.results;

      if (
        (apiPack.status === 401 || apiPack.status === 403) &&
        !tokenRefreshed &&
        meliClientId &&
        meliClientSecret &&
        meliRefreshToken
      ) {
        const refreshedToken = await refreshMlAccessToken(
          meliClientId,
          meliClientSecret,
          meliRefreshToken
        );
        if (refreshedToken) {
          meliAccessToken = refreshedToken;
          tokenRefreshed = true;
          apiPack = await fetchMlApi(query, limit, meliAccessToken);
          apiResults = apiPack.results;
        }
      }

      if (apiPack.status === 403 && meliAccessToken) {
        // Some tokens/accounts are blocked for this endpoint; try public mode.
        const publicPack = await fetchMlApi(query, limit);
        if (publicPack.results.length > 0) {
          apiPack = publicPack;
          apiResults = publicPack.results;
        }
      }

      apiDiagnostics.push({
        query,
        source: "api",
        status: apiPack.status,
        resultados: apiResults.length,
        tokenConfigured: Boolean(meliAccessToken),
        tokenRefreshed,
        errorDetail: debugMode ? apiPack.errorDetail : undefined,
      });
      if (apiResults.length > 0) {
        response.status(200).json({
          results: apiResults,
          ...(debugMode ? { diagnostics: apiDiagnostics } : {}),
        });
        return;
      }
    }

    const htmlDiagnosticsAll: Array<Record<string, unknown>> = [];
    for (const query of queries) {
      const htmlPack = await fetchMlHtml(query, debugMode);
      const htmlResults = htmlPack.results;
      if (debugMode && Array.isArray(htmlPack.diagnostics)) {
        htmlDiagnosticsAll.push({ query, checks: htmlPack.diagnostics });
      }
      if (htmlResults.length > 0) {
        response.status(200).json({
          results: htmlResults,
          ...(debugMode ? { diagnostics: { api: apiDiagnostics, html: htmlDiagnosticsAll } } : {}),
        });
        return;
      }
    }

    response.status(200).json({
      results: [],
      detail: "Sin resultados para los terminos consultados",
      ...(debugMode ? { diagnostics: { api: apiDiagnostics, html: htmlDiagnosticsAll } } : {}),
    });
  } catch (error) {
    logger.error("mlSearch error", error);
    response.status(502).json({
      error: "No se pudo consultar Mercado Libre",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});
