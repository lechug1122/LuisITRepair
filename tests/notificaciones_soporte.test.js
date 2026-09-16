import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  audienciaDelNegocio,
  construirAudiencia,
  notificacionVigente,
} from "../src/js/services/notificaciones_globales.js";
import { canUseCashClosing, canUseCashReconciliation } from "../src/js/services/plan_features.js";

// Un aviso le llega a un negocio cuando su audiencia y las etiquetas del
// negocio comparten al menos una entrada. Es exactamente lo que hace la
// consulta (array-contains-any) y lo que comprueban las reglas.
function leLlega(audiencia, negocio) {
  const etiquetas = audienciaDelNegocio(negocio);
  return audiencia.some((tag) => etiquetas.includes(tag));
}

const NEGOCIO_A_FREE = { negocioId: "negA", premiumState: "free" };
const NEGOCIO_B_FREE = { negocioId: "negB", premiumState: "free" };
const NEGOCIO_C_PREMIUM = { negocioId: "negC", premiumState: "premium" };

describe("a quien le llega cada aviso", () => {
  test("un aviso para todos llega a cualquier negocio", () => {
    const audiencia = construirAudiencia({ destinatarios: "todos" });
    assert.deepEqual(audiencia, ["todos"]);
    assert.equal(leLlega(audiencia, NEGOCIO_A_FREE), true);
    assert.equal(leLlega(audiencia, NEGOCIO_C_PREMIUM), true);
  });

  test("un aviso a un negocio concreto NO llega a los demas", () => {
    const audiencia = construirAudiencia({ destinatarios: "negocios", negocioIds: ["negA"] });
    assert.deepEqual(audiencia, ["negocio:negA"]);
    assert.equal(leLlega(audiencia, NEGOCIO_A_FREE), true);
    assert.equal(leLlega(audiencia, NEGOCIO_B_FREE), false);
    assert.equal(leLlega(audiencia, NEGOCIO_C_PREMIUM), false);
  });

  test("un aviso a varios negocios llega solo a los elegidos", () => {
    const audiencia = construirAudiencia({
      destinatarios: "negocios",
      negocioIds: ["negA", "negC", "negA"],
    });
    assert.deepEqual(audiencia, ["negocio:negA", "negocio:negC"]);
    assert.equal(leLlega(audiencia, NEGOCIO_A_FREE), true);
    assert.equal(leLlega(audiencia, NEGOCIO_C_PREMIUM), true);
    assert.equal(leLlega(audiencia, NEGOCIO_B_FREE), false);
  });

  test("un aviso solo para Free no llega a Premium", () => {
    const audiencia = construirAudiencia({ destinatarios: "plan", planes: ["free"] });
    assert.deepEqual(audiencia, ["plan:free"]);
    assert.equal(leLlega(audiencia, NEGOCIO_A_FREE), true);
    assert.equal(leLlega(audiencia, NEGOCIO_C_PREMIUM), false);
  });

  test("un aviso solo para Premium no llega a Free", () => {
    const audiencia = construirAudiencia({ destinatarios: "plan", planes: ["premium"] });
    assert.equal(leLlega(audiencia, NEGOCIO_C_PREMIUM), true);
    assert.equal(leLlega(audiencia, NEGOCIO_A_FREE), false);
  });

  test("elegir los dos planes equivale a enviarlo a todos", () => {
    const audiencia = construirAudiencia({ destinatarios: "plan", planes: ["free", "premium"] });
    assert.deepEqual(audiencia, ["todos"]);
  });

  test("sin negocios elegidos el aviso no le llega a nadie", () => {
    const audiencia = construirAudiencia({ destinatarios: "negocios", negocioIds: [] });
    assert.deepEqual(audiencia, []);
    assert.equal(leLlega(audiencia, NEGOCIO_A_FREE), false);
  });
});

describe("vigencia de un aviso", () => {
  const ahora = new Date("2026-09-15T12:00:00Z").getTime();
  const base = { activo: true, publicarAt: 0, expiresAt: 0 };

  test("un aviso desactivado no se muestra", () => {
    assert.equal(notificacionVigente({ ...base, activo: false }, ahora), false);
  });

  test("un aviso programado no se muestra antes de su fecha", () => {
    const futuro = new Date("2026-09-20T00:00:00Z").getTime();
    assert.equal(notificacionVigente({ ...base, publicarAt: futuro }, ahora), false);
  });

  test("un aviso caducado deja de mostrarse solo", () => {
    const pasado = new Date("2026-09-10T00:00:00Z").getTime();
    assert.equal(notificacionVigente({ ...base, expiresAt: pasado }, ahora), false);
  });

  test("dentro de su ventana si se muestra", () => {
    assert.equal(notificacionVigente(base, ahora), true);
  });
});

describe("corte de caja", () => {
  test("Free puede cerrar y solo Premium puede hacer el arqueo", () => {
    assert.equal(canUseCashClosing({ premiumState: "premium" }), true);
    assert.equal(canUseCashClosing({ premiumState: "free" }), true);
    assert.equal(canUseCashReconciliation({ premiumState: "free" }), false);
    assert.equal(canUseCashReconciliation({ premiumState: "premium" }), true);
  });

  test("un plan sin confirmar no abre el modulo", () => {
    assert.equal(canUseCashClosing({ premiumState: "loading" }), false);
    assert.equal(canUseCashClosing({}), false);
  });
});
