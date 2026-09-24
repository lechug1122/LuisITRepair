import test from "node:test";
import assert from "node:assert/strict";
import { query, queryEqual, where, limit } from "firebase/firestore";
import { getCollectionRef } from "../src/js/services/tenant.js";
import { priceLookupQuery, consultarPrecioNegocio } from "../src/js/services/consulta_precios.js";
import { canUsePriceChecker, COMPARATIVA_PLANES, PLAN_PREMIUM_RESUMEN } from "../src/js/services/plan_features.js";
import { syncTicketPlan } from "../src/js/services/ticket_plan.js";
import { priceLookupScope, selectPriceProduct, pricePromotions } from "../src/js/services/consulta_precios_model.js";

const codigo = "001234567890";
const product = (negocioId, precioVenta = 22, extra = {}) => ({
  id: "coca", path: `negocios/${negocioId}/productos/coca`, negocioId, cuentaPrincipalUid: negocioId,
  codigo, nombre: "Coca-Cola Original", presentacion: "600 ml", precioVenta, stock: 10, activo: true, ...extra,
});
const promo = (extra = {}) => ({
  id: "oferta", path: "negocios/a/promociones_descuentos/oferta", negocioId: "a", activo: true,
  nombre: "Dos Coca-Cola", clase: "promocion", fechaInicio: "2026-09-01", fechaFin: "2026-09-30",
  requerimientos: [{ productoId: "coca", cantidad: 1 }], productoBeneficiadoId: "coca", cantidadBeneficiada: 1,
  beneficioTipo: "precio_especial", beneficioValor: 18, ...extra,
});

test("la consulta es Premium y no inicia lecturas con Free, plan pendiente o suscripción vencida", async () => {
  try {
    for (const state of ["free", "loading"]) {
      syncTicketPlan(state);
      assert.equal(canUsePriceChecker({ premiumState: state }), false);
      // Incluso sin un negocio válido falla primero la regla Premium, antes de crear la consulta.
      await assert.rejects(consultarPrecioNegocio("", codigo), /CajaLibre Premium/);
    }
    syncTicketPlan("premium", Date.now() - 1);
    await assert.rejects(consultarPrecioNegocio("a", codigo), /CajaLibre Premium/);
    assert.equal(canUsePriceChecker({ premiumState: "premium" }), true);
    assert.equal(COMPARATIVA_PLANES.find((row) => row.funcion === "Consulta de precios").free, false);
    assert.ok(PLAN_PREMIUM_RESUMEN.incluye.some((item) => item.startsWith("Consulta de precios")));
  } finally { syncTicketPlan("loading"); }
});

test("el mismo código conserva precios diferentes en dos negocios y sus consultas usan rutas distintas", () => {
  const rows = [product("a", 22), product("b", 35)];
  assert.equal(selectPriceProduct(rows, priceLookupScope("a", codigo)).precio, 22);
  assert.equal(selectPriceProduct(rows, priceLookupScope("b", codigo)).precio, 35);
  for (const negocioId of ["a", "b"]) {
    assert.ok(queryEqual(priceLookupQuery(negocioId, codigo), query(
      getCollectionRef("productos", negocioId), where("codigo", "==", codigo), limit(10),
    )));
  }
  assert.ok(!queryEqual(priceLookupQuery("a", codigo), priceLookupQuery("b", codigo)));
});

test("no acepta productos de rutas ajenas ni metadatos de otro negocio", () => {
  const scope = priceLookupScope("a", codigo);
  for (const row of [product("b"), product("a", 22, { negocioId: "b" }), product("a", 22, { cuentaPrincipalUid: "b" }), product("a", 22, { path: "productos/coca" })]) {
    assert.equal(selectPriceProduct([row], scope), null);
  }
  assert.equal(selectPriceProduct([product("b")], scope), null);
});

test("conserva ceros iniciales, rechaza negocios vacíos y no realiza búsquedas parciales", () => {
  assert.equal(priceLookupScope("a", ` ${codigo}\r\n`).codigo, codigo);
  assert.throws(() => priceLookupScope("", codigo));
  assert.throws(() => priceLookupScope("a/b", codigo));
  assert.throws(() => priceLookupScope("a", ""));
  assert.equal(selectPriceProduct([product("a")], priceLookupScope("a", "001234")), null);
});

test("los inactivos no se muestran y agotados conservan su precio sin exponer costos internos", () => {
  const scope = priceLookupScope("a", codigo);
  assert.equal(selectPriceProduct([product("a", 22, { activo: false })], scope), null);
  assert.equal(selectPriceProduct([product("a", 22, { tipo: "servicio" })], scope), null);
  const found = selectPriceProduct([product("a", 22, { stock: 0, precioCompra: 10, notasInternas: "Privado" })], scope);
  assert.equal(found.disponible, false);
  assert.equal(found.precio, 22);
  assert.ok(!Object.hasOwn(found, "precioCompra"));
  assert.ok(!Object.hasOwn(found, "notasInternas"));
  assert.throws(() => selectPriceProduct([product("a"), product("a", 25, { id: "otro" })], scope), /más de un/);
  assert.throws(() => selectPriceProduct([product("a", -1)], scope), /precio válido/);
});

test("muestra 2 por 40 únicamente con una promoción vigente del negocio y ese producto", () => {
  const item = selectPriceProduct([product("a")], priceLookupScope("a", codigo));
  const offers = pricePromotions([
    promo(), promo({ id: "ajena", path: "negocios/b/promociones_descuentos/oferta", negocioId: "b" }),
    promo({ id: "vencida", fechaFin: "2026-09-01" }), promo({ id: "inactiva", activo: false }),
    promo({ id: "futura", fechaInicio: "2026-09-20" }),
    promo({ id: "otro", requerimientos: [{ productoId: "papas", cantidad: 1 }], productoBeneficiadoId: "papas" }),
  ], item, "2026-09-17");
  assert.equal(offers.length, 1);
  assert.equal(offers[0].cantidad, 2);
  assert.equal(offers[0].precio, 40);
});

test("los descuentos por paquete restan un monto fijo por ciclo y no por cada unidad", () => {
  const item = selectPriceProduct([product("a")], priceLookupScope("a", codigo));
  const [offer] = pricePromotions([promo({ beneficioTipo: "monto_fijo", beneficioValor: 5, cantidadBeneficiada: 2 })], item, "2026-09-17");
  assert.equal(offer.cantidad, 3);
  assert.equal(offer.precio, 61);
});

test("los descuentos que requieren autorización no se prometen al cliente", () => {
  const item = selectPriceProduct([product("a")], priceLookupScope("a", codigo));
  const rule = promo({ clase: "descuento", aplicaA: "productos", objetivoIds: ["coca"], tipo: "porcentaje", valor: 10, autorizacion: "requiere_autorizacion" });
  assert.deepEqual(pricePromotions([rule], item, "2026-09-17"), []);
  const [offer] = pricePromotions([{ ...rule, autorizacion: "sin_autorizacion" }], item, "2026-09-17");
  assert.equal(offer.precio, 19.8);
});
