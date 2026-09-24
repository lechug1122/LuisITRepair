import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { FREE_TICKET_AD, syncTicketPlan } from "../src/js/services/ticket_plan.js";

// Sustituye únicamente el proveedor de datos de empresa para probar el
// almacenamiento y la política real sin abrir una conexión a Firebase.
const source = (await readFile(new URL("../src/js/services/ticket_config.js", import.meta.url), "utf8"))
  .replace('import { readEmpresaConfigCache } from "./configure_empresa";', 'const readEmpresaConfigCache = () => ({ nombre: "Mi tienda" });')
  .replaceAll('"./ticket_plan.js"', JSON.stringify(new URL("../src/js/services/ticket_plan.js", import.meta.url).href))
  .replaceAll('"./plan_features.js"', JSON.stringify(new URL("../src/js/services/plan_features.js", import.meta.url).href));
const config = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

// Instantes fijos a cada lado del corte del 21 de septiembre de 2026.
const ANTES = new Date("2026-09-20T23:59:59-06:00").getTime();
const DESPUES = new Date("2026-09-21T00:00:00-06:00").getTime();

function conAlmacenamiento(prueba) {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    prueba();
  } finally {
    delete globalThis.localStorage;
    syncTicketPlan("loading");
  }
}

test("conserva el diseño al vencer Premium y lo recupera al renovar, incluso tras recargar", () => {
  conAlmacenamiento(() => {
    syncTicketPlan("premium", Date.now() + 60000);
    const custom = { footerText: "Vuelve pronto", showLegend: false, extraBottomLines: "Club de clientes" };
    assert.equal(config.saveTicketConfigStorage(custom), true);
    const saved = config.readTicketConfigStorage();
    assert.equal(config.readTicketPrintConfig().footerText, custom.footerText);
    assert.equal(config.readTicketPrintConfig().advertisingText, "");

    // Premium vencido y ya pasada la migración: vuelve el diseño predeterminado.
    syncTicketPlan("premium", Date.now() - 1);
    assert.equal(config.saveTicketConfigStorage(config.createDefaultTicketConfig(), DESPUES), false);
    const free = config.readTicketPrintConfig(saved, DESPUES);
    assert.equal(free.footerText, config.createDefaultTicketConfig().footerText);
    assert.equal(free.extraBottomLines, "");
    assert.equal(free.advertisingText, FREE_TICKET_AD);
    // El diseño guardado sigue intacto: nunca se borra.
    assert.deepEqual(config.readTicketConfigStorage(), saved);

    syncTicketPlan("premium", Date.now() + 60000);
    assert.deepEqual(config.readTicketPrintConfig(), { ...saved, advertisingText: "" });
    assert.deepEqual(config.resolveTicketConfig(config.readTicketConfigStorage(), "premium"), { ...saved, advertisingText: "" });

    syncTicketPlan("loading");
    assert.throws(() => config.readTicketPrintConfig(), /cargar tu plan/);
  });
});

const LEGACY = true;
const NUEVO = false;

test("Caso A: negocio antiguo Free guarda y aplica su diseño hasta la migración", () => {
  conAlmacenamiento(() => {
    syncTicketPlan("free", 0, LEGACY);
    const custom = { footerText: "Te esperamos", showLegend: false, extraBottomLines: "Promoción" };
    assert.equal(config.saveTicketConfigStorage(custom, ANTES), true);

    const impreso = config.readTicketPrintConfig(undefined, ANTES);
    assert.equal(impreso.footerText, custom.footerText);
    assert.equal(impreso.extraBottomLines, custom.extraBottomLines);
    // La publicidad no forma parte de esta migración: sigue apareciendo.
    assert.equal(impreso.advertisingText, FREE_TICKET_AD);
  });
});

test("Caso B: el negocio antiguo deja de guardar y de aplicar desde la migración", () => {
  conAlmacenamiento(() => {
    syncTicketPlan("free", 0, LEGACY);
    const custom = { footerText: "Te esperamos", showLegend: false, extraBottomLines: "Promoción" };
    assert.equal(config.saveTicketConfigStorage(custom, ANTES), true);
    const guardado = config.readTicketConfigStorage();

    assert.equal(config.saveTicketConfigStorage({ ...custom, footerText: "Otro" }, DESPUES), false);
    // Lo que ya estaba guardado se respeta; solo deja de aplicarse.
    assert.deepEqual(config.readTicketConfigStorage(), guardado);

    const impreso = config.readTicketPrintConfig(undefined, DESPUES);
    assert.equal(impreso.footerText, config.createDefaultTicketConfig().footerText);
    assert.equal(impreso.advertisingText, FREE_TICKET_AD);
  });
});

test("Caso C: un negocio nuevo Free no puede guardar ni durante la transición", () => {
  conAlmacenamiento(() => {
    syncTicketPlan("free", 0, NUEVO);
    const custom = { footerText: "Te esperamos", showLegend: false };
    assert.equal(config.saveTicketConfigStorage(custom, ANTES), false);

    const impreso = config.readTicketPrintConfig(undefined, ANTES);
    assert.equal(impreso.footerText, config.createDefaultTicketConfig().footerText);
  });
});

test("Free sigue imprimiendo tickets después de la migración", () => {
  conAlmacenamiento(() => {
    syncTicketPlan("free", 0, LEGACY);
    // Lo importante: no lanza. Imprimir nunca depende de personalizar.
    const impreso = config.readTicketPrintConfig(undefined, DESPUES);
    assert.equal(typeof impreso.footerText, "string");
    assert.equal(impreso.showLogo, config.createDefaultTicketConfig().showLogo);
  });
});

test("el guardado comprueba la fecha al momento de escribir, sin recargar", () => {
  conAlmacenamiento(() => {
    // Misma sesión abierta cruzando la medianoche del 21: el mismo estado en
    // memoria acepta antes y rechaza después.
    syncTicketPlan("free", 0, LEGACY);
    assert.equal(config.saveTicketConfigStorage({ footerText: "Antes" }, ANTES), true);
    assert.equal(config.saveTicketConfigStorage({ footerText: "Después" }, DESPUES), false);
  });
});
