import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_FREE,
  PLAN_PREMIUM,
  esNegocioBloqueado,
  resolverPlanNegocio,
} from "../src/js/services/plan_negocio.js";
import {
  ACTIVIDAD_UMBRALES,
  clasificarActividad,
  etiquetaUltimoAcceso,
} from "../src/js/services/actividad_negocio.js";

const dia = 86400000;
const ahora = Date.UTC(2026, 8, 8, 12, 0, 0);

test("el plan lo decide la vigencia pagada, no las banderas historicas", () => {
  // Caso del bug: estado "gratuito" y planActual "Gratuito" mientras Premium
  // sigue vigente. Manda premiumUntil.
  const vigente = resolverPlanNegocio({
    estado: "gratuito",
    planActual: "Gratuito",
    gratuito: true,
    premiumUntil: new Date(ahora + 10 * dia),
  }, ahora);
  assert.equal(vigente.plan, PLAN_PREMIUM);
  assert.equal(vigente.etiqueta, "Premium");

  // Y al reves: planActual dice Premium pero ya vencio.
  const vencido = resolverPlanNegocio({
    planActual: "Premium",
    premium: true,
    premiumUntil: new Date(ahora - dia),
  }, ahora);
  assert.equal(vencido.plan, PLAN_FREE);
  assert.equal(vencido.etiqueta, "Gratis");
});

test("detecta la marca premium desincronizada sin concederle acceso", () => {
  const desincronizado = resolverPlanNegocio({ premium: true, premiumUntil: null }, ahora);
  assert.equal(desincronizado.esPremium, false);
  assert.equal(desincronizado.marcaPremium, true);
  assert.equal(desincronizado.inconsistente, true);

  const coherente = resolverPlanNegocio({
    premium: true,
    premiumUntil: new Date(ahora + dia),
  }, ahora);
  assert.equal(coherente.inconsistente, false);
});

test("un negocio sin datos de premium es gratuito", () => {
  const plan = resolverPlanNegocio(null, ahora);
  assert.equal(plan.plan, PLAN_FREE);
  assert.equal(plan.esPremium, false);
  assert.equal(plan.inconsistente, false);
});

test("premium cancelado conserva el periodo ya pagado", () => {
  const plan = resolverPlanNegocio({
    premium: true,
    premiumUntil: new Date(ahora + 5 * dia),
    renovacionAutomatica: false,
  }, ahora);
  assert.equal(plan.esPremium, true);
  assert.equal(plan.enPeriodoFinal, true);
});

test("solo bloqueado y suspendido cortan el acceso operativo", () => {
  assert(esNegocioBloqueado({ estado: "bloqueado" }));
  assert(esNegocioBloqueado({ estado: "suspendido" }));
  ["activo", "gratuito", "pendiente"].forEach((estado) => {
    assert(!esNegocioBloqueado({ estado }), estado);
  });
});

test("la actividad se clasifica por los umbrales centralizados", () => {
  const casos = [
    [0, "frecuente"],
    [ACTIVIDAD_UMBRALES.frecuente, "frecuente"],
    [ACTIVIDAD_UMBRALES.frecuente + 1, "activo"],
    [ACTIVIDAD_UMBRALES.activo, "activo"],
    [ACTIVIDAD_UMBRALES.activo + 1, "poco"],
    [ACTIVIDAD_UMBRALES.poco, "poco"],
    [ACTIVIDAD_UMBRALES.poco + 1, "inactivo"],
    [400, "inactivo"],
  ];
  casos.forEach(([dias, esperado]) => {
    const resultado = clasificarActividad(ahora - dias * dia, ahora);
    assert.equal(resultado.id, esperado, `${dias} dias`);
    assert.equal(resultado.dias, dias);
  });
});

test("sin señal de actividad no se inventa un nivel", () => {
  const resultado = clasificarActividad(0, ahora);
  assert.equal(resultado.id, "desconocido");
  assert.equal(resultado.dias, null);
  assert.equal(etiquetaUltimoAcceso(0), "Sin registro");
});

test("el ultimo acceso se describe en lenguaje relativo", () => {
  assert.match(etiquetaUltimoAcceso(ahora - 3600000, ahora), /^Hoy /);
  assert.match(etiquetaUltimoAcceso(ahora - dia, ahora), /^Ayer /);
  assert.equal(etiquetaUltimoAcceso(ahora - 5 * dia, ahora), "Hace 5 días");
});
