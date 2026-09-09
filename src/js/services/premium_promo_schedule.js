// Reglas puras de la promocion de planes (Free / Premium).
//
// Se mantienen sin dependencias de React ni de Firestore para poder probarlas
// con `node --test` y para que la decision de "quien la ve" viva en un solo
// lugar, en vez de repartirse entre el componente visual y el hook.

export const PREMIUM_PROMO_MAX_POR_SEMANA = 2;

// Roles que pueden decidir sobre el plan del negocio. Se comparan normalizados
// para tolerar acentos, mayusculas y las variantes que ya existen en Firestore.
const ROLES_CON_PROMO = ["admin", "propietario", "owner", "dueno", "titular"];

function normalizarTexto(raw = "") {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function esRolConPromo(rol = "") {
  const key = normalizarTexto(rol);
  if (!key) return false;
  return ROLES_CON_PROMO.some((item) => key.includes(item));
}

// El titular de la cuenta es quien realmente puede contratar Premium: su uid
// coincide con la cuenta principal del negocio.
export function esTitularDelNegocio(info = {}) {
  const uid = String(info?.uid || "").trim();
  if (!uid) return false;
  return uid === String(info?.cuentaPrincipalUid || "").trim();
}

/**
 * Clave de semana calendario ISO-8601 (lunes 00:00 a domingo 23:59) con el
 * formato "2026-W37". Se calcula en hora local porque el negocio opera en su
 * propia zona horaria.
 */
export function semanaPromoKey(fecha = new Date()) {
  const base = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diaLunesCero = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - diaLunesCero + 3); // jueves de la semana ISO
  const jueves = base.getTime();
  const anio = base.getFullYear();
  const primerJueves = new Date(anio, 0, 4);
  primerJueves.setDate(primerJueves.getDate() - ((primerJueves.getDay() + 6) % 7) + 3);
  const semana = 1 + Math.round((jueves - primerJueves.getTime()) / (7 * 86400000));
  return `${anio}-W${String(semana).padStart(2, "0")}`;
}

/**
 * Decide si el aviso puede mostrarse ahora mismo.
 *
 * Premium se lee del estado tri-state central (`premiumState`): solo "free"
 * confirmado es elegible. "loading" nunca lo es, para que no aparezca un flash
 * de promocion mientras todavia no se sabe el plan real del negocio.
 */
export function esPromoPremiumElegible(info = {}) {
  if (!info || info.loading) return false;
  if (info.superAdmin === true) return false;
  if (info.activo !== true || info.accesoPermitido !== true) return false;
  if (info.premiumState !== "free") return false;
  if (info.negocio?.premium === true) return false;
  if (!String(info.uid || "").trim()) return false;
  return esTitularDelNegocio(info) || esRolConPromo(info.rol);
}

/**
 * Devuelve el siguiente contador semanal, o null si ya se alcanzo el limite.
 * Si la clave guardada pertenece a otra semana el contador se reinicia solo,
 * sin necesidad de limpiar nada manualmente.
 */
export function siguienteEstadoPromo(estado, ahora = Date.now()) {
  const weekKey = semanaPromoKey(new Date(ahora));
  const guardadas = Number(estado?.showCount);
  const mostradas = String(estado?.weekKey || "") === weekKey && Number.isFinite(guardadas)
    ? Math.max(0, guardadas)
    : 0;
  if (mostradas >= PREMIUM_PROMO_MAX_POR_SEMANA) return null;
  return { weekKey, showCount: mostradas + 1 };
}
