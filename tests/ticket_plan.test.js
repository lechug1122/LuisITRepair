import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTicketPlan,
  canUseTicketEditor,
  FREE_TICKET_AD,
  getTicketPlan,
  isLegacyTicketBusiness,
  isTicketEditorLegacyPeriodOver,
  syncTicketPlan,
  TICKET_EDITOR_LEGACY_END_DATE,
} from "../src/js/services/ticket_plan.js";

const defaults = { footerText: "Gracias", showLegend: true, extraBottomLines: "" };
const custom = { footerText: "Mensaje personalizado", showLegend: false, extraBottomLines: "Promoción", advertisingText: "" };

// Instantes fijos a cada lado del corte, para que la prueba no dependa del dia
// en que se ejecuta ni de la zona horaria de la maquina.
const ANTES = new Date("2026-09-20T23:59:59-06:00").getTime();
const DESPUES = new Date("2026-09-21T00:00:00-06:00").getTime();

const LEGACY = true;
const NUEVO = false;

test("el corte ocurre a la medianoche de Mexico, no en UTC", () => {
  assert.equal(TICKET_EDITOR_LEGACY_END_DATE, "2026-09-21T00:00:00-06:00");
  // Misma medianoche mexicana expresada en UTC: 06:00 del dia 21.
  assert.equal(DESPUES, new Date("2026-09-21T06:00:00Z").getTime());
  assert.equal(isTicketEditorLegacyPeriodOver(ANTES), false);
  assert.equal(isTicketEditorLegacyPeriodOver(DESPUES), true);
});

test("un negocio antiguo Free personaliza hasta la migración y deja de hacerlo después", () => {
  assert.equal(canUseTicketEditor({ premiumState: "free", negocioLegacy: LEGACY, ahoraMs: ANTES }), true);
  assert.equal(canUseTicketEditor({ premiumState: "free", negocioLegacy: LEGACY, ahoraMs: DESPUES }), false);
});

test("un negocio nuevo Free no personaliza ni durante la transición", () => {
  assert.equal(canUseTicketEditor({ premiumState: "free", negocioLegacy: NUEVO, ahoraMs: ANTES }), false);
});

test("Premium personaliza siempre, sin importar la antigüedad ni la fecha", () => {
  assert.equal(canUseTicketEditor({ premiumState: "premium", negocioLegacy: NUEVO, ahoraMs: DESPUES }), true);
  assert.equal(canUseTicketEditor({ premiumState: "premium", negocioLegacy: LEGACY, ahoraMs: DESPUES }), true);
});

test("un plan todavía sin confirmar nunca habilita la edición", () => {
  assert.equal(canUseTicketEditor({ premiumState: "loading", negocioLegacy: LEGACY, ahoraMs: ANTES }), false);
});

test("el negocio antiguo conserva su diseño durante la transición, con la publicidad puesta", () => {
  assert.deepEqual(applyTicketPlan(custom, defaults, "free", ANTES, LEGACY), {
    ...custom,
    advertisingText: FREE_TICKET_AD,
  });
  assert.equal(custom.footerText, "Mensaje personalizado");
});

test("el negocio nuevo Free imprime el diseño predeterminado desde el inicio", () => {
  assert.deepEqual(applyTicketPlan(custom, defaults, "free", ANTES, NUEVO), {
    ...defaults,
    advertisingText: FREE_TICKET_AD,
  });
});

test("Free vuelve al diseño predeterminado a partir de la migración", () => {
  assert.deepEqual(applyTicketPlan(custom, defaults, "free", DESPUES, LEGACY), {
    ...defaults,
    advertisingText: FREE_TICKET_AD,
  });
  // El diseño guardado no se toca: solo se deja de aplicar.
  assert.equal(custom.footerText, "Mensaje personalizado");
});

test("Premium conserva mensajes personalizados sin publicidad", () => {
  assert.deepEqual(applyTicketPlan(custom, defaults, "premium", ANTES, NUEVO), custom);
  assert.deepEqual(applyTicketPlan(custom, defaults, "premium", DESPUES, NUEVO), custom);
});

test("un plan pendiente no habilita personalización ni publicidad", () => {
  assert.deepEqual(applyTicketPlan(custom, defaults, "loading", ANTES, LEGACY), { ...defaults, advertisingText: "" });
});

test("la sesión sincroniza la antigüedad del negocio junto con el plan", () => {
  syncTicketPlan("free", 0, true);
  assert.equal(isLegacyTicketBusiness(), true);
  syncTicketPlan("free", 0, false);
  assert.equal(isLegacyTicketBusiness(), false);
  // Cerrar sesión no puede dejar el beneficio encendido para la siguiente.
  syncTicketPlan("loading");
  assert.equal(isLegacyTicketBusiness(), false);
});

test("la impresión consulta el plan en memoria y respeta vencimiento y cierre de sesión", () => {
  syncTicketPlan("premium", Date.now() + 60000);
  assert.equal(getTicketPlan(), "premium");
  syncTicketPlan("premium", Date.now() - 1);
  assert.equal(getTicketPlan(), "free");
  syncTicketPlan("loading");
  assert.equal(getTicketPlan(), "loading");
});
