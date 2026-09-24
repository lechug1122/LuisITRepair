import test from "node:test";
import assert from "node:assert/strict";
import {
  PREMIUM_SALES_FEATURES, canUseSalesFeature, resolvePOSFeatures,
  COMPARATIVA_PLANES, PLAN_FREE_RESUMEN,
} from "../src/js/services/plan_features.js";
import { syncTicketPlan, getTicketPlan } from "../src/js/services/ticket_plan.js";
import {
  readPOSFeatureConfig, readPOSFeaturePreferences, savePOSFeatureConfig,
} from "../src/js/services/pos_feature_config.js";

test("Free y un plan pendiente no habilitan las nuevas funciones aunque estén activadas", () => {
  for (const premiumState of ["free", "loading"]) {
    for (const feature of PREMIUM_SALES_FEATURES) {
      assert.equal(canUseSalesFeature(feature, { premiumState, enabled: true }), false);
    }
  }
  assert.equal(canUseSalesFeature("constructor", { premiumState: "premium" }), false);
});

test("cada casilla Premium se desactiva independientemente", () => {
  for (const feature of PREMIUM_SALES_FEATURES) {
    assert.equal(canUseSalesFeature(feature, { premiumState: "premium", enabled: true }), true);
    assert.equal(canUseSalesFeature(feature, { premiumState: "premium", enabled: false }), false);
  }
  assert.deepEqual(resolvePOSFeatures({ promocionesDescuentos: false, fiado: true, descuentoAutorizado: true, consultaPrecios: true }, "premium"), {
    promocionesDescuentos: false, fiado: true, descuentoAutorizado: true, consultaPrecios: true,
  });
  assert.deepEqual(resolvePOSFeatures({ promocionesDescuentos: true, fiado: false, descuentoAutorizado: false, consultaPrecios: false }, "premium"), {
    promocionesDescuentos: true, fiado: false, descuentoAutorizado: false, consultaPrecios: false,
  });
});

test("el vencimiento bloquea funciones y la renovación recupera las preferencias", () => {
  const preferences = { promocionesDescuentos: true, fiado: false, descuentoAutorizado: true, consultaPrecios: true };
  const saved = structuredClone(preferences);
  try {
    syncTicketPlan("premium", Date.now() + 60000);
    assert.deepEqual(resolvePOSFeatures(preferences, getTicketPlan()), preferences);
    syncTicketPlan("premium", Date.now() - 1);
    assert.deepEqual(resolvePOSFeatures(preferences, getTicketPlan()), {
      promocionesDescuentos: false, fiado: false, descuentoAutorizado: false, consultaPrecios: false,
    });
    assert.deepEqual(preferences, saved);
    syncTicketPlan("premium", Date.now() + 60000);
    assert.deepEqual(resolvePOSFeatures(preferences, getTicketPlan()), saved);
  } finally { syncTicketPlan("loading"); }
});

test("la comparación comercial presenta fiados, canjes y descuentos como Premium", () => {
  for (const funcion of ["Ventas fiadas", "Canjes y programa de puntos", "Descuentos y promociones", "Descuento autorizado con contraseña", "Modificar y agregar terminos y condiciones"]) {
    assert.equal(COMPARATIVA_PLANES.find((row) => row.funcion === funcion)?.free, false);
  }
  assert.ok(!PLAN_FREE_RESUMEN.incluye.join(" ").includes("fiados"));
});

test("las casillas guardadas sobreviven a Free y un intento de cambio Free no las sobrescribe", () => {
  const previousStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.window = new EventTarget();
  const preferences = { promocionesDescuentos: false, fiado: true, descuentoAutorizado: false, consultaPrecios: true };
  try {
    syncTicketPlan("premium", Date.now() + 60000);
    assert.equal(savePOSFeatureConfig(preferences), true);
    assert.deepEqual(readPOSFeatureConfig(), preferences);
    syncTicketPlan("free");
    assert.equal(savePOSFeatureConfig({ promocionesDescuentos: true, fiado: false, descuentoAutorizado: true, consultaPrecios: false }), false);
    assert.deepEqual(readPOSFeatureConfig(), { promocionesDescuentos: false, fiado: false, descuentoAutorizado: false, consultaPrecios: false });
    assert.deepEqual(readPOSFeaturePreferences(), preferences);
    syncTicketPlan("premium", Date.now() + 60000);
    assert.deepEqual(readPOSFeatureConfig(), preferences);
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.window = previousWindow;
    syncTicketPlan("loading");
  }
});
