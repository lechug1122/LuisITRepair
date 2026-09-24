import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL(`${process.env.TEMP}/cajalibre-browser-tests/node_modules/playwright/index.mjs`).href);
const browser = await chromium.launch({ headless: true });
const baseURL = process.env.PRICE_TEST_URL || "http://127.0.0.1:5174";
const state = `
import React from '/node_modules/.vite/deps/react.js';
const { useSyncExternalStore } = React;
window.priceFixture ||= { negocioId: 'a', premiumState: 'premium', promos: true, calls: [] };
const subscribe = (cb) => { window.addEventListener('price-fixture-change', cb); return () => window.removeEventListener('price-fixture-change', cb); };
const useBusiness = () => useSyncExternalStore(subscribe, () => window.priceFixture.negocioId);
`;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error("Browser error:", error.message); });
  page.on("requestfailed", (request) => console.error("Request failed:", request.url(), request.failure()?.errorText));
  page.on("response", (response) => { if (response.status() >= 400) console.error("HTTP", response.status(), response.url()); });
  await page.route("**/src/hooks/useAutorizacionActual.js*", (route) => route.fulfill({ contentType: "application/javascript", body: state + `export default function useAuth() { return { negocioId: useBusiness(), premiumState: useSyncExternalStore(subscribe, () => window.priceFixture.premiumState) }; }` }));
  await page.route("**/src/hooks/useEmpresaConfig.js*", (route) => route.fulfill({ contentType: "application/javascript", body: state + `export default function useEmpresa() { return { nombreEmpresa: useBusiness() === 'a' ? 'Abarrotes La Esquina' : 'Abarrotes El Centro' }; }` }));
  await page.route("**/src/hooks/useMonedaConfig.js*", (route) => route.fulfill({ contentType: "application/javascript", body: `export default function useMoneda() { return { formatCurrency: value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value) }; }` }));
  await page.route("**/src/hooks/usePOSFeatures.js*", (route) => route.fulfill({ contentType: "application/javascript", body: state + `export default function usePOS() { return { promocionesDescuentos: useSyncExternalStore(subscribe, () => window.priceFixture.promos) }; }` }));
  await page.route("**/src/js/services/consulta_precios.js*", (route) => route.fulfill({ contentType: "application/javascript", body: `
export async function consultarPrecioNegocio(negocioId, codigo, options) {
  window.priceFixture.calls.push({ negocioId, codigo, options });
  if (codigo === 'lento') await new Promise(resolve => { window.resolvePriceRequest = resolve; });
  const producto = codigo === 'no-existe' ? null : { id: 'coca', negocioId, codigo, nombre: 'Coca-Cola Original', presentacion: '600 ml', precio: negocioId === 'a' ? 22 : 35, disponible: codigo !== 'agotado' };
  return { negocioId, codigo, producto, promociones: producto && options.promocionesHabilitadas && negocioId === 'a' ? [{ id: 'oferta', nombre: 'Oferta de la semana', tipo: 'paquete', cantidad: 2, precio: 40 }] : [], errorPromociones: false };
}` }));
  await page.route("**/price-test", (route) => route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/fixtures/consulta_precios.jsx"></script></body></html>` }));
  await page.goto(`${baseURL}/price-test`);
  await page.clock.install();
  const input = page.locator("#consulta-codigo");
  await input.waitFor();
  assert.ok(await input.evaluate((el) => el === document.activeElement));
  const scan = async (codigo) => { await input.fill(codigo); await input.press("Enter"); };
  await scan("001234567890");
  await page.waitForFunction(() => document.querySelector(".consulta-price")?.textContent === "$22.00");
  assert.ok((await page.locator(".consulta-promo").innerText()).includes("2 por $40.00"));
  assert.equal(await input.inputValue(), "");
  assert.ok(await input.evaluate((el) => el === document.activeElement));
  await page.screenshot({ path: `${process.env.TEMP}/cajalibre-precios-desktop.png`, fullPage: true });

  // Un resultado pendiente del negocio anterior nunca vuelve a aparecer.
  await scan("lento");
  await page.waitForFunction(() => typeof window.resolvePriceRequest === "function");
  await page.evaluate(() => { window.priceFixture.negocioId = "b"; window.dispatchEvent(new Event("price-fixture-change")); });
  await page.waitForFunction(() => document.querySelector(".consulta-business")?.textContent.includes("El Centro"));
  await page.evaluate(() => window.resolvePriceRequest());
  assert.equal(await page.locator(".consulta-price").count(), 0);
  await scan("001234567890");
  await page.waitForFunction(() => document.querySelector(".consulta-price")?.textContent === "$35.00");
  assert.equal(await page.locator(".consulta-promo").count(), 0);
  assert.equal(await page.evaluate(() => window.priceFixture.calls.at(-1).negocioId), "b");
  await page.clock.fastForward(10000);
  await page.waitForFunction(() => !document.querySelector(".consulta-price"));
  assert.ok((await page.locator(".consulta-empty").innerText()).includes("Conoce el precio"));

  await scan("agotado");
  await page.waitForFunction(() => document.querySelector(".consulta-stock")?.textContent === "Agotado");
  await scan("no-existe");
  await page.waitForFunction(() => document.querySelector(".consulta-empty")?.textContent.includes("Producto no encontrado"));
  await page.evaluate(() => { window.priceFixture.negocioId = "a"; window.priceFixture.promos = false; window.dispatchEvent(new Event("price-fixture-change")); });
  await scan("001234567890");
  await page.waitForFunction(() => document.querySelector(".consulta-price")?.textContent === "$22.00");
  assert.equal(await page.locator(".consulta-promo").count(), 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${process.env.TEMP}/cajalibre-precios-mobile.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const callsBeforeFree = await page.evaluate(() => window.priceFixture.calls.length);
  await page.evaluate(() => { window.priceFixture.premiumState = "free"; window.dispatchEvent(new Event("price-fixture-change")); });
  await page.waitForFunction(() => location.pathname === "/configuracion/pos" && !document.querySelector("#consulta-codigo"));
  assert.equal(await page.evaluate(() => window.priceFixture.calls.length), callsBeforeFree);
  await page.evaluate(() => { window.priceFixture.premiumState = "premium"; window.dispatchEvent(new Event("price-fixture-change")); });
  await input.waitFor();
  assert.equal(await page.locator(".consulta-price").count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS consulta Premium, bloqueo y renovación, lector/Enter, enfoque, promociones, aislamiento por negocio, respuestas tardías, reinicio a 10 segundos y móvil sin desbordes.");
} finally { await browser.close(); }
