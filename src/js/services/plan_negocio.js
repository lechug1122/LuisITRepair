// Fuente UNICA de verdad del plan de un negocio para el panel de superadmin.
//
// En Firestore conviven varios campos historicos que parecen indicar el plan
// (`estado`, `planActual`, `modalidad`, `gratuito`, `premium`). Ninguno lo es:
// el derecho de acceso Premium depende de `premiumUntil` vigente, igual que en
// useAutorizacionActual. Este modulo centraliza esa lectura para que la tabla,
// el drawer y las exportaciones no puedan contradecirse entre si.

export const PLAN_PREMIUM = "premium";
export const PLAN_FREE = "free";

export const PLAN_ETIQUETAS = {
  [PLAN_PREMIUM]: "Premium",
  [PLAN_FREE]: "Gratis",
};

export function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return toMillis(value.toDate());
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function toDate(value) {
  const ms = toMillis(value);
  return ms ? new Date(ms) : null;
}

/**
 * Resuelve el plan real de un negocio.
 *
 * `plan` solo puede ser "premium" cuando la vigencia pagada sigue viva. La
 * marca `premium` del documento se expone aparte como `marcaPremium`: sirve
 * para detectar inconsistencias, nunca para conceder acceso.
 */
export function resolverPlanNegocio(negocio = null, ahora = Date.now()) {
  const premiumUntilMs = toMillis(negocio?.premiumUntil);
  const vigente = premiumUntilMs > ahora;
  const marcaPremium = negocio?.premium === true;

  return {
    plan: vigente ? PLAN_PREMIUM : PLAN_FREE,
    etiqueta: vigente ? PLAN_ETIQUETAS[PLAN_PREMIUM] : PLAN_ETIQUETAS[PLAN_FREE],
    esPremium: vigente,
    marcaPremium,
    // Marca activa sin vigencia (o al reves) = dato que quedo desincronizado.
    inconsistente: marcaPremium !== vigente,
    premiumUntil: toDate(negocio?.premiumUntil),
    activadoEn: toDate(negocio?.premiumDesde || negocio?.premiumUltimoPago),
    ultimoPago: toDate(negocio?.premiumUltimoPago),
    proximoPago: toDate(negocio?.premiumProximoPago),
    canceladoEn: toDate(negocio?.premiumCanceladoAt),
    renovacionAutomatica: negocio?.renovacionAutomatica !== false,
    proveedor: String(negocio?.premiumProveedor || "").trim(),
    // Premium cancelado pero todavia dentro del periodo ya pagado.
    enPeriodoFinal: vigente && negocio?.renovacionAutomatica === false,
  };
}

export function esNegocioBloqueado(negocio = null) {
  return negocio?.estado === "bloqueado" || negocio?.estado === "suspendido";
}
