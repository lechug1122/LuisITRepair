export const ANALYTICS_ALLOWED_EMAIL = "lechugapapayero@gmail.com";

export function hasAnalyticsAccess({
  email = "",
} = {}) {
  return String(email || "").trim().toLowerCase() === ANALYTICS_ALLOWED_EMAIL;
}
