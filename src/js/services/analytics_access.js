export const ANALYTICS_ALLOWED_EMAIL = "lechugapapayero@gmail.com";

export function hasAnalyticsAccess({
  superAdmin = false,
  accesoAnalitica = false,
  email = "",
} = {}) {
  return (
    superAdmin === true ||
    accesoAnalitica === true ||
    String(email || "").trim().toLowerCase() === ANALYTICS_ALLOWED_EMAIL
  );
}
