import test from "node:test";
import assert from "node:assert/strict";
import { describe } from "node:test";
import {
  COMPARATIVA_PLANES,
  LIMITE_HISTORIAL_CORTES_GRATUITO,
  PLAN_FREE_RESUMEN,
  PLAN_PREMIUM_RESUMEN,
  TICKET_EDITOR_LEGACY_END_DATE,
  TICKET_PREMIUM_NEW_BUSINESS_CUTOFF,
  canUseCashClosing,
  canUseCashReconciliation,
  canUseInventoryCount,
  canUseAutomaticPaymentPdf,
  canUseRestaurantActivityPayments,
  canUseRestaurantCookLimit,
  canUseRestaurantReservations,
  canUseServiceTracker,
  canUseServiceTrackingQr,
  canUseTicketEditor,
  esNegocioLegacy,
  isPremiumBusiness,
  isTicketEditorLegacyPeriodOver,
  showTicketEditorMigrationNotice,
  getRestaurantPlanLimits,
} from "../src/js/services/plan_features.js";

// Instantes fijos, para que nada dependa del dia en que se ejecuten ni de la
// zona horaria de la maquina.
const ANTES_DEL_CORTE = new Date("2026-09-12T10:00:00-06:00").getTime();
const DIA_DE_LA_MIGRACION = new Date("2026-09-21T00:00:00-06:00").getTime();

// Negocios de ejemplo. La antiguedad se mide SIEMPRE con la fecha del negocio.
const NEGOCIO_ANTIGUO = { createdAt: new Date("2026-09-01T09:00:00-06:00") };
const NEGOCIO_NUEVO = { createdAt: new Date("2026-09-15T09:00:00-06:00") };

function escenario(negocio, premiumState, ahoraMs) {
  const negocioLegacy = esNegocioLegacy(negocio);
  return {
    editarTicket: canUseTicketEditor({ premiumState, negocioLegacy, ahoraMs }),
    avisoMigracion: showTicketEditorMigrationNotice({ premiumState, negocioLegacy, ahoraMs }),
    conteoInventario: canUseInventoryCount({ premiumState }),
  };
}

describe("clasificacion del negocio", () => {
  test("la fecha de corte de negocios nuevos es anterior a la migracion", () => {
    assert.ok(
      new Date(TICKET_PREMIUM_NEW_BUSINESS_CUTOFF).getTime()
        < new Date(TICKET_EDITOR_LEGACY_END_DATE).getTime(),
    );
  });

  test("la migracion ocurre a la medianoche de Mexico, no en UTC", () => {
    assert.equal(DIA_DE_LA_MIGRACION, new Date("2026-09-21T06:00:00Z").getTime());
    assert.equal(isTicketEditorLegacyPeriodOver(ANTES_DEL_CORTE), false);
    assert.equal(isTicketEditorLegacyPeriodOver(DIA_DE_LA_MIGRACION), true);
  });

  test("un negocio anterior a la actualizacion es Legacy", () => {
    assert.equal(esNegocioLegacy(NEGOCIO_ANTIGUO), true);
  });

  test("un negocio creado despues de la actualizacion no es Legacy", () => {
    assert.equal(esNegocioLegacy(NEGOCIO_NUEVO), false);
  });

  test("un negocio sin fecha de creacion se considera antiguo", () => {
    // Solo puede faltarle si es anterior al dia en que se empezo a guardarla.
    assert.equal(esNegocioLegacy({ nombre: "Sin fecha" }), true);
  });

  test("acepta Timestamp de Firestore ademas de Date", () => {
    const comoTimestamp = { createdAt: { seconds: Math.floor(new Date("2026-09-01T09:00:00-06:00").getTime() / 1000) } };
    assert.equal(esNegocioLegacy(comoTimestamp), true);
  });

  test("agregar un empleado nuevo no cambia la antiguedad del negocio", () => {
    // La condicion es del negocio: la fecha de una cuenta no interviene.
    const negocio = { ...NEGOCIO_ANTIGUO, conteos: { usuariosTotal: 4 } };
    assert.equal(esNegocioLegacy(negocio), true);
    assert.equal(canUseTicketEditor({
      premiumState: "free",
      negocioLegacy: esNegocioLegacy(negocio),
      ahoraMs: ANTES_DEL_CORTE,
    }), true);
  });
});

describe("Premium es del negocio y respeta el periodo pagado", () => {
  test("Caso F: cancelar no revoca el periodo ya pagado", () => {
    const cancelado = {
      premiumUntil: new Date("2026-09-30T00:00:00-06:00"),
      renovacionAutomatica: false,
    };
    assert.equal(isPremiumBusiness(cancelado, ANTES_DEL_CORTE), true);
  });

  test("al terminar el periodo pagado deja de ser Premium", () => {
    const vencido = { premiumUntil: new Date("2026-09-10T00:00:00-06:00") };
    assert.equal(isPremiumBusiness(vencido, ANTES_DEL_CORTE), false);
  });

  test("un negocio sin vigencia no es Premium", () => {
    assert.equal(isPremiumBusiness({}, ANTES_DEL_CORTE), false);
    assert.equal(isPremiumBusiness(null, ANTES_DEL_CORTE), false);
  });
});

describe("casos completos de acceso", () => {
  test("Caso A: negocio antiguo Free antes de la migracion", () => {
    assert.deepEqual(escenario(NEGOCIO_ANTIGUO, "free", ANTES_DEL_CORTE), {
      editarTicket: true,
      avisoMigracion: true,
      conteoInventario: false,
    });
  });

  test("Caso B: negocio antiguo Free el dia de la migracion", () => {
    assert.deepEqual(escenario(NEGOCIO_ANTIGUO, "free", DIA_DE_LA_MIGRACION), {
      editarTicket: false,
      avisoMigracion: false,
      conteoInventario: false,
    });
  });

  test("Caso C: negocio nuevo Free, sin periodo de transicion", () => {
    assert.deepEqual(escenario(NEGOCIO_NUEVO, "free", ANTES_DEL_CORTE), {
      editarTicket: false,
      avisoMigracion: false,
      conteoInventario: false,
    });
  });

  test("Caso D: negocio nuevo Premium", () => {
    assert.deepEqual(escenario(NEGOCIO_NUEVO, "premium", ANTES_DEL_CORTE), {
      editarTicket: true,
      avisoMigracion: false,
      conteoInventario: true,
    });
  });

  test("Caso E: negocio antiguo Premium, antes y despues de la migracion", () => {
    assert.deepEqual(escenario(NEGOCIO_ANTIGUO, "premium", ANTES_DEL_CORTE), {
      editarTicket: true,
      avisoMigracion: false,
      conteoInventario: true,
    });
    assert.deepEqual(escenario(NEGOCIO_ANTIGUO, "premium", DIA_DE_LA_MIGRACION), {
      editarTicket: true,
      avisoMigracion: false,
      conteoInventario: true,
    });
  });

  test("un plan todavia sin confirmar no habilita nada", () => {
    assert.deepEqual(escenario(NEGOCIO_ANTIGUO, "loading", ANTES_DEL_CORTE), {
      editarTicket: false,
      avisoMigracion: false,
      conteoInventario: false,
    });
  });
});

describe("cierre y arqueo de caja son capacidades distintas", () => {
  test("Free puede cerrar caja, pero no realizar el arqueo", () => {
    assert.equal(canUseCashClosing({ premiumState: "free" }), true);
    assert.equal(canUseCashReconciliation({ premiumState: "free" }), false);
  });

  test("Premium puede cerrar caja y realizar el arqueo", () => {
    assert.equal(canUseCashClosing({ premiumState: "premium" }), true);
    assert.equal(canUseCashReconciliation({ premiumState: "premium" }), true);
  });

  test("mientras el plan carga no se habilita ninguna accion", () => {
    assert.equal(canUseCashClosing({ premiumState: "loading" }), false);
    assert.equal(canUseCashReconciliation({ premiumState: "loading" }), false);
  });
});

describe("restaurante y servicios por plan", () => {
  test("Free conserva la operación básica pero no las funciones migradas", () => {
    const plan = { premiumState: "free" };
    assert.equal(canUseRestaurantCookLimit(plan), false);
    assert.equal(canUseRestaurantActivityPayments(plan), false);
    assert.equal(canUseAutomaticPaymentPdf(plan), false);
    assert.equal(canUseRestaurantReservations(plan), false);
    assert.equal(canUseServiceTracker(plan), false);
    assert.equal(canUseServiceTrackingQr({ ...plan, trackingEnabled: true }), false);
    assert.deepEqual(getRestaurantPlanLimits(plan), {
      maxPisos: 1,
      maxMesasPorPiso: 10,
      maxMesasTotal: 10,
    });
  });

  test("Premium respeta además el interruptor de rastreo", () => {
    const plan = { premiumState: "premium" };
    assert.equal(canUseRestaurantCookLimit(plan), true);
    assert.equal(canUseRestaurantActivityPayments(plan), true);
    assert.equal(canUseAutomaticPaymentPdf(plan), true);
    assert.equal(canUseRestaurantReservations(plan), true);
    assert.equal(canUseServiceTracker(plan), true);
    assert.equal(canUseServiceTrackingQr({ ...plan, trackingEnabled: false }), false);
    assert.equal(canUseServiceTrackingQr({ ...plan, trackingEnabled: true }), true);
    assert.deepEqual(getRestaurantPlanLimits(plan), {
      maxPisos: 20,
      maxMesasPorPiso: 200,
      maxMesasTotal: 4000,
    });
  });
});

describe("comparacion de planes que ve el usuario", () => {
  const filaDe = (nombre) => COMPARATIVA_PLANES.find((item) => item.funcion === nombre);

  test("la edicion de tickets se presenta como funcion Premium", () => {
    assert.equal(filaDe("Edicion y personalizacion de tickets").free, false);
  });

  test("el conteo de inventario se presenta como funcion Premium", () => {
    assert.equal(filaDe("Conteo de inventario").free, false);
  });

  test("el cierre es gratuito y el arqueo detallado es Premium", () => {
    assert.equal(filaDe("Cierre de caja").free, true);
    assert.equal(filaDe("Arqueo de caja y PDF detallado").free, false);
  });

  test("Free muestra solo tres cortes y Premium el historial completo", () => {
    assert.equal(LIMITE_HISTORIAL_CORTES_GRATUITO, 3);
    assert.equal(filaDe("Historial de cortes de caja").free, "3 mas recientes");
    assert.equal(filaDe("Historial de cortes de caja").premium, "Completo");
  });

  test("imprimir tickets sigue siendo gratuito, es una funcion distinta de editarlos", () => {
    assert.equal(filaDe("Impresion de tickets").free, true);
  });

  test("Premium anuncia las dos funciones que se migran", () => {
    const texto = PLAN_PREMIUM_RESUMEN.incluye.join(" | ");
    assert.ok(texto.includes("Edicion y personalizacion de tickets"));
    assert.ok(texto.includes("Conteo de inventario"));
  });

  test("Free no anuncia ninguna funcion que ya sea Premium", () => {
    const texto = PLAN_FREE_RESUMEN.incluye.join(" | ").toLowerCase();
    assert.ok(!texto.includes("personalizacion"));
    assert.ok(!texto.includes("conteo"));
    assert.ok(!texto.includes("arqueo"));
    assert.ok(!texto.includes("sin publicidad"));
    // Lo que si conserva: vender e imprimir.
    assert.ok(texto.includes("tickets"));
  });
});
