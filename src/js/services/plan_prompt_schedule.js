const DAY = 86400000;

export function isPlanPromptOwner(info) {
  return !info.loading && info.activo === true && info.accesoPermitido === true &&
    info.premiumState === "free" && info.negocio?.premium !== true &&
    Boolean(info.uid) && info.uid === info.cuentaPrincipalUid &&
    info.uid === info.negocio?.cuentaPrincipalUid;
}

export function nextPlanPromptHistory(history, now = Date.now()) {
  const recent = (Array.isArray(history) ? history : [])
    .filter(value => Number.isFinite(value) && value > now - 7 * DAY)
    .sort((a, b) => a - b);
  if (recent.length >= 3 || (recent.length && now - recent.at(-1) < 2 * DAY)) return null;
  return [...recent, now];
}
