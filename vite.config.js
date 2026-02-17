import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(text) {
  return decodeHtmlEntities(String(text || "").replace(/<[^>]*>/g, "")).trim();
}

function parseMlSearchHtml(html) {
  const raw = String(html || "");
  const results = [];
  const regexTitle = /<a[^>]*class="poly-component__title"[^>]*>[\s\S]*?<\/a>/g;

  let match;
  while ((match = regexTitle.exec(raw)) !== null && results.length < 12) {
    const anchorHtml = match[0];
    const hrefMatch = anchorHtml.match(/href="([^"]+)"/i);
    const titleMatch = anchorHtml.match(/>([\s\S]*?)<\/a>$/i);
    const link = decodeHtmlEntities(hrefMatch ? hrefMatch[1] : "");
    const title = stripHtml(titleMatch ? titleMatch[1] : "");
    const start = match.index;
    const snippet = raw.slice(start, start + 10000);

    const priceMatch = snippet.match(/andes-money-amount__fraction[^>]*>([\d,.]+)</);
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

  return { results: results.filter((r) => r.title && r.price > 0) };
}

function mlComparatorProxy() {
  return {
    name: "ml-comparator-proxy",
    configureServer(server) {
      server.middlewares.use("/api/ml/search", async (req, res) => {
        try {
          const u = new URL(req.url || "", "http://localhost");
          const q = (u.searchParams.get("q") || "").trim();
          const limit = u.searchParams.get("limit") || "12";

          if (!q) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ error: "Parametro q requerido." }));
            return;
          }

          const target = `https://api.mercadolibre.com/sites/MLM/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`;
          const mlRes = await fetch(target, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
              Referer: "https://www.mercadolibre.com.mx/",
              Origin: "https://www.mercadolibre.com.mx",
            },
          });

          let bodyText = await mlRes.text();
          let statusCode = mlRes.status;

          // Fallback: si API oficial bloquea (403/429/5xx), parsear HTML de resultados.
          if (!mlRes.ok) {
            const htmlUrl = `https://www.mercadolibre.com.mx/jm/search?as_word=${encodeURIComponent(q)}`;
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

            if (htmlRes.ok) {
              const html = await htmlRes.text();
              const parsed = parseMlSearchHtml(html);
              bodyText = JSON.stringify(parsed);
              statusCode = 200;
            }
          }

          res.statusCode = statusCode;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(bodyText);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(
            JSON.stringify({
              error: "Proxy local no pudo consultar Mercado Libre.",
              detail: error?.message || String(error),
            })
          );
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mlComparatorProxy()],
})
