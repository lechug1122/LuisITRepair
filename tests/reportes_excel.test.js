import test from "node:test";
import assert from "node:assert/strict";
import { describe } from "node:test";
import {
  PLAN_FREE,
  PLAN_LOADING,
  PLAN_PREMIUM,
  REPORTES_PLAN,
  canUseReport,
  esReportePremium,
} from "../src/js/services/plan_features.js";
import {
  PERIODOS,
  REPORTES,
  categoriasVisibles,
  obtenerReporte,
  periodoAnterior,
  reporteDisponible,
  reportesVisibles,
  resolverPeriodo,
} from "../src/js/services/reportes/catalogo_reportes.js";

// Reportes que el sistema todavia NO puede construir con datos reales. Estan
// en el catalogo solo para explicar que habria que empezar a registrar.
const PENDIENTES_DE_DATOS = [
  "cancelaciones",
  "devoluciones",
  "inventario_kardex",
  "inventario_conteo",
  "auditoria",
];

describe("acceso a los reportes segun el plan", () => {
  test("todo reporte del catalogo declara su plan", () => {
    const sinPlan = REPORTES.filter((reporte) => !REPORTES_PLAN[reporte.id]).map((r) => r.id);
    // Un reporte sin plan declarado seria inalcanzable: canUseReport lo niega.
    assert.deepEqual(sinPlan, []);
  });

  test("un negocio gratuito alcanza los reportes gratuitos", () => {
    const gratuitos = REPORTES.filter((reporte) => !esReportePremium(reporte.id));
    assert.ok(gratuitos.length > 0);
    gratuitos.forEach((reporte) => {
      assert.equal(canUseReport(reporte.id, { premiumState: PLAN_FREE }), true, reporte.id);
    });
  });

  test("un negocio gratuito no alcanza ningun reporte Premium", () => {
    const premium = REPORTES.filter((reporte) => esReportePremium(reporte.id));
    assert.ok(premium.length > 0);
    premium.forEach((reporte) => {
      assert.equal(canUseReport(reporte.id, { premiumState: PLAN_FREE }), false, reporte.id);
      assert.equal(canUseReport(reporte.id, { premiumState: PLAN_PREMIUM }), true, reporte.id);
    });
  });

  test("un plan sin confirmar no concede ni los reportes gratuitos", () => {
    // Ante la duda no se exporta nada: la pantalla espera a saber el plan real.
    REPORTES.forEach((reporte) => {
      assert.equal(canUseReport(reporte.id, { premiumState: PLAN_LOADING }), false, reporte.id);
      assert.equal(canUseReport(reporte.id), false, reporte.id);
    });
  });

  test("un identificador desconocido nunca concede acceso", () => {
    ["", "no_existe", null, undefined, 0].forEach((id) => {
      assert.equal(canUseReport(id, { premiumState: PLAN_PREMIUM }), false, String(id));
    });
  });

  test("una clave heredada de Object no se confunde con un reporte", () => {
    // `REPORTES_PLAN["__proto__"]` devuelve un objeto heredado, que es
    // "verdadero". Sin comprobar que la clave sea propia, un id asi pasaria
    // la comprobacion de acceso y se leerian datos de un reporte Premium.
    ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"].forEach((id) => {
      assert.equal(canUseReport(id, { premiumState: PLAN_PREMIUM }), false, id);
      assert.equal(esReportePremium(id), false, id);
    });
  });
});

describe("catalogo de reportes", () => {
  test("no hay identificadores repetidos", () => {
    const ids = REPORTES.map((reporte) => reporte.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("cada reporte tiene nombre, descripcion y una categoria existente", () => {
    const categorias = new Set(categoriasVisibles({ esRestaurante: true }).map((c) => c.id));
    REPORTES.forEach((reporte) => {
      assert.ok(reporte.nombre, reporte.id);
      assert.ok(reporte.descripcion, reporte.id);
      assert.ok(categorias.has(reporte.categoria), `${reporte.id}: ${reporte.categoria}`);
    });
  });

  test("los reportes que no se pueden generar explican que falta registrar", () => {
    const pendientes = REPORTES.filter((reporte) => !reporteDisponible(reporte));
    assert.deepEqual(pendientes.map((r) => r.id).sort(), [...PENDIENTES_DE_DATOS].sort());
    pendientes.forEach((reporte) => {
      // No basta con desactivarlos: la persona debe saber por que.
      assert.ok(
        String(reporte.motivoNoDisponible || "").length > 60,
        `${reporte.id} necesita explicar el motivo`,
      );
    });
  });

  test("los reportes de restaurante solo se ofrecen en modo restaurante", () => {
    const enTienda = reportesVisibles({ esRestaurante: false }).map((r) => r.id);
    const enRestaurante = reportesVisibles({ esRestaurante: true }).map((r) => r.id);
    const soloRestaurante = REPORTES.filter((r) => r.soloRestaurante).map((r) => r.id);

    assert.ok(soloRestaurante.length > 0);
    soloRestaurante.forEach((id) => {
      assert.ok(!enTienda.includes(id), `${id} no debe verse en una tienda`);
      assert.ok(enRestaurante.includes(id), `${id} debe verse en un restaurante`);
    });
  });

  test("obtenerReporte devuelve null para lo que no existe", () => {
    assert.equal(obtenerReporte("no_existe"), null);
    assert.equal(obtenerReporte(""), null);
    assert.equal(obtenerReporte("__proto__"), null);
    assert.equal(obtenerReporte("resumen_ventas")?.id, "resumen_ventas");
  });
});

describe("periodos", () => {
  // Un miercoles, para que "esta semana" empiece en un lunes distinto del dia.
  const MIERCOLES = new Date(2026, 8, 16, 15, 30, 0);

  test("cada periodo devuelve un rango con inicio y fin de dia completos", () => {
    PERIODOS.forEach((periodo) => {
      const { desde, hasta } = resolverPeriodo(periodo.id, { ahora: MIERCOLES });
      assert.ok(desde instanceof Date, periodo.id);
      assert.ok(hasta instanceof Date, periodo.id);
      assert.ok(desde <= hasta, periodo.id);
      assert.equal(desde.getHours(), 0, periodo.id);
      assert.equal(hasta.getHours(), 23, periodo.id);
    });
  });

  test("la semana empieza en lunes", () => {
    const { desde } = resolverPeriodo("esta_semana", { ahora: MIERCOLES });
    assert.equal(desde.getDay(), 1);
    assert.equal(desde.getDate(), 14);
  });

  test("el mes anterior termina el ultimo dia de ese mes", () => {
    const { desde, hasta } = resolverPeriodo("mes_anterior", { ahora: MIERCOLES });
    assert.equal(desde.getMonth(), 7);
    assert.equal(desde.getDate(), 1);
    assert.equal(hasta.getMonth(), 7);
    assert.equal(hasta.getDate(), 31);
  });

  test("un periodo desconocido cae en el mes en curso, no en un rango vacio", () => {
    const { desde, hasta } = resolverPeriodo("inventado", { ahora: MIERCOLES });
    assert.equal(desde.getMonth(), MIERCOLES.getMonth());
    assert.equal(desde.getDate(), 1);
    assert.equal(hasta.getDate(), MIERCOLES.getDate());
  });

  test("el periodo anterior tiene la misma duracion y termina justo antes", () => {
    const actual = resolverPeriodo("este_mes", { ahora: MIERCOLES });
    const anterior = periodoAnterior(actual);
    const dias = (rango) => Math.round((rango.hasta - rango.desde) / 86400000) + 1;

    assert.equal(dias(anterior), dias(actual));
    // Termina el dia inmediatamente anterior al inicio del periodo actual.
    assert.equal(anterior.hasta.getDate(), 31);
    assert.equal(anterior.hasta.getMonth(), 7);
    assert.ok(anterior.hasta < actual.desde);
  });

  test("sin fechas no hay periodo anterior que comparar", () => {
    assert.equal(periodoAnterior({ desde: null, hasta: null }), null);
  });
});
