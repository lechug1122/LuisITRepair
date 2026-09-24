import test from "node:test";
import assert from "node:assert/strict";
import { canUseServiceDeposits, COMPARATIVA_PLANES } from "../src/js/services/plan_features.js";
import { getPOSQuickActions } from "../src/js/services/pos_quick_actions.js";
import { syncTicketPlan, getTicketPlan } from "../src/js/services/ticket_plan.js";

test("Free conserva pagar servicio y elimina el abono sin dejar saltos en los atajos", () => {
  for (const premiumState of ["free", "loading"]) {
    assert.equal(canUseServiceDeposits({ premiumState }), false);
    assert.deepEqual(getPOSQuickActions({ serviciosHabilitados: true, premiumState }), [
      { id: "ventaExtra", tecla: "F1" },
      { id: "pagarServicio", tecla: "F2" },
      { id: "agregarCliente", tecla: "F3" },
    ]);
  }
});

test("Premium permite abonos solo cuando el módulo de servicios está habilitado", () => {
  assert.equal(canUseServiceDeposits({ premiumState: "premium" }), true);
  assert.deepEqual(getPOSQuickActions({ serviciosHabilitados: true, premiumState: "premium" }), [
    { id: "ventaExtra", tecla: "F1" },
    { id: "pagarServicio", tecla: "F2" },
    { id: "abonarServicio", tecla: "F3" },
    { id: "agregarCliente", tecla: "F4" },
  ]);
  assert.ok(!getPOSQuickActions({ premiumState: "premium" }).some(({ id }) => id === "abonarServicio"));
});

test("vencer Premium retira abonar servicio y renovar lo recupera", () => {
  try {
    syncTicketPlan("premium", Date.now() - 1);
    assert.equal(canUseServiceDeposits({ premiumState: getTicketPlan() }), false);
    syncTicketPlan("premium", Date.now() + 60000);
    assert.equal(canUseServiceDeposits({ premiumState: getTicketPlan() }), true);
    assert.equal(COMPARATIVA_PLANES.find(({ funcion }) => funcion === "Abonar servicio").free, false);
  } finally { syncTicketPlan("loading"); }
});
