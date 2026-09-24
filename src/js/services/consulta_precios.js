import { getDocs, query, where, limit } from "firebase/firestore";
import { getCollectionRef } from "./tenant.js";
import { priceLookupScope, selectPriceProduct, pricePromotions } from "./consulta_precios_model.js";
import { canUsePriceChecker } from "./plan_features.js";
import { getTicketPlan } from "./ticket_plan.js";
import { readPOSFeaturePreferences } from "./pos_feature_config.js";

function assertPremiumPriceChecker() {
  // Dos bloqueos distintos merecen dos mensajes distintos: el plan no se
  // resuelve igual que un interruptor que el propio negocio apago.
  if (!canUsePriceChecker({ premiumState: getTicketPlan() })) {
    throw new Error("La consulta de precios está disponible con CajaLibre Premium.");
  }
  if (readPOSFeaturePreferences().consultaPrecios === false) {
    throw new Error("La consulta de precios está desactivada en la configuración del punto de venta.");
  }
}

export function priceLookupQuery(negocioId, codigo) {
  const scope = priceLookupScope(negocioId, codigo);
  return query(getCollectionRef("productos", scope.negocioId), where("codigo", "==", scope.codigo), limit(10));
}

function rows(snapshot) {
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id, path: item.ref.path }));
}

export async function consultarPrecioNegocio(negocioId, codigo, { promocionesHabilitadas = false } = {}) {
  assertPremiumPriceChecker();
  const scope = priceLookupScope(negocioId, codigo);
  const [products, promotions] = await Promise.allSettled([
    getDocs(priceLookupQuery(scope.negocioId, scope.codigo)),
    promocionesHabilitadas
      ? getDocs(query(getCollectionRef("promociones_descuentos", scope.negocioId), where("activo", "==", true)))
      : Promise.resolve(null),
  ]);
  if (products.status === "rejected") throw products.reason;
  assertPremiumPriceChecker();
  const producto = selectPriceProduct(rows(products.value), scope);
  const now = new Date();
  const hoy = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    negocioId: scope.negocioId, codigo: scope.codigo, producto,
    promociones: promotions.status === "fulfilled" && promotions.value
      ? pricePromotions(rows(promotions.value), producto, hoy) : [],
    errorPromociones: promotions.status === "rejected",
  };
}
