// Prueba manual de navegador para la ficha publica unificada.
//
//   npm run dev
//   node tests/status-integrado-browser.mjs

// Comprueba que seguimiento, aceptacion, fotos y PDF viven en /status/:folio.

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ||
  pathToFileURL(`${process.env.TEMP}/cajalibre-browser-tests/node_modules/playwright/index.mjs`).href
);

const BASE = process.env.CAJALIBRE_DEV_URL || "http://127.0.0.1:5173";
const FOLIO = "SV-STATUS-001";
const REFERENCIA = `negocio1~servicio1~${"a".repeat(43)}`;
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const servicio = {
  id: "servicio1",
  folio: FOLIO,
  tipoDispositivo: "Laptop",
  marca: "Dell",
  modelo: "Inspiron",
  numeroSerie: "ABC123",
  trabajo: "Cambio de teclado",
  status: "esperando_autorizacion",
  createdAt: { seconds: 1758300000, nanoseconds: 0 },
  updatedAt: { seconds: 1758400000, nanoseconds: 0 },
  fechaAprox: "25/09/2026",
  negocioNombre: "Taller Demo",
  negocioLogo: "",
  costo: "1850",
  precioDespues: false,
  hojaServicio: { terminos: ["Respaldar los datos antes de la intervención."] },
  aceptacion: { estado: "pendiente", version: 1 },
  boleta: {
    tipoDocumento: "venta",
    folio: "B-0001",
    fecha: "2026-09-18",
    formaPago: "efectivo",
    notas: "Incluye limpieza interna.",
    items: [
      { item: "P-001", descripcion: "Teclado Dell Inspiron", cantidad: 1, pUnitario: 1200, importe: 1200 },
      { item: "P-002", descripcion: "Mano de obra", cantidad: 1, pUnitario: 650, importe: 650 },
    ],
    total: 1850,
  },
  evidencias: [{
    id: "foto1", url: PIXEL, miniaturaUrl: PIXEL, tipo: "ingreso",
    descripcion: "Estado al recibir el equipo", fecha: { seconds: 1758300000, nanoseconds: 0 },
  }],
};

const orden = {
  enlace: "vigente",
  orden: {
    folio: FOLIO,
    cliente: "Ana López",
    tipoDispositivo: "Laptop",
    marca: "Dell",
    modelo: "Inspiron",
    numeroSerie: "ABC123",
    trabajo: "Cambio de teclado",
    costo: "1850",
    precioDespues: false,
    boleta: servicio.boleta,
    terminos: servicio.hojaServicio.terminos,
  },
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem("cajalibre_aviso_cookies_v2", "visto"));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

await page.route("**/consultarServicioPublico", (route) => route.fulfill({
  status: 200, contentType: "application/json", body: JSON.stringify({ result: servicio }),
}));
await page.route("**/consultarOrdenAceptacion", (route) => route.fulfill({
  status: 200, contentType: "application/json", body: JSON.stringify({ result: orden }),
}));
await page.route("**/responderOrdenAceptacion", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ result: {
    estado: "aceptado", folio: FOLIO,
    fechaRespuesta: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
  } }),
}));

await page.goto(
  `${BASE}/status/${encodeURIComponent(FOLIO)}?aceptacion=${encodeURIComponent(REFERENCIA)}#aceptacion-cliente`,
  { waitUntil: "networkidle" },
);
await page.waitForSelector("#aceptacion-cliente", { timeout: 15000 });

assert.equal(new URL(page.url()).pathname, `/status/${FOLIO}`);
assert.equal(await page.locator("#aceptacion-cliente").count(), 1);
assert.equal(await page.locator("#aceptacion-cliente #status-order-evidence-title").count(), 1);
assert.equal(await page.locator("#aceptacion-cliente .status-order-pdf").count(), 1);
assert.equal(await page.locator(".status-evidence-grid img").count(), 1);
// La boleta se lee dentro del propio vale, renglon por renglon.
assert.equal(await page.locator(".status-receipt-table tbody tr").count(), 2);
assert.match(await page.locator(".status-receipt-total").innerText(), /1,850/);
assert.equal(
  await page.locator("#status-order-evidence-title").evaluate((element) =>
    Boolean(element.compareDocumentPosition(document.querySelector(".sv-firma")) & Node.DOCUMENT_POSITION_FOLLOWING)),
  true,
);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
  true,
);

await page.fill(".status-acceptance-form input[type=\"text\"]", "Ana López");
await page.check(".status-acceptance-check input");
const canvas = page.locator(".sv-firma-lienzo canvas");
const box = await canvas.boundingBox();
await canvas.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", clientX: box.x + 30, clientY: box.y + 80, pressure: .5 });
await canvas.dispatchEvent("pointermove", { pointerId: 1, pointerType: "touch", clientX: box.x + 150, clientY: box.y + 100, pressure: .5 });
await canvas.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", clientX: box.x + 150, clientY: box.y + 100 });
await page.click(".status-acceptance-actions .status-button:not(.status-button-secondary)");
await page.waitForSelector(".status-acceptance-result--accepted");

const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
await page.click(".status-order-pdf");
const download = await downloadPromise;
assert.equal(download.suggestedFilename(), `comprobante_${FOLIO}.pdf`);

const boletaPromise = page.waitForEvent("download", { timeout: 30000 });
await page.click(".status-receipt-pdf");
assert.equal((await boletaPromise).suggestedFilename(), "boleta-B-0001.pdf");
assert.deepEqual(errors, []);

await browser.close();
console.log("Status integrado: aceptación, fotos y PDF verificados en móvil.");
