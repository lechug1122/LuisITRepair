import { esTitularDelNegocio } from "./premium_promo_schedule";

export const PREMIUM_SITE_URL = "https://cajalibre.com.mx";
export const PREMIUM_PAYMENT_PATH = "/configuracion/pago-premium";
export const PREMIUM_RETURN_URL = `${PREMIUM_SITE_URL}${PREMIUM_PAYMENT_PATH}`;

export const PREMIUM_PAYMENT_PROVIDERS = [
  { id: "mercadopago", name: "Mercado Pago" },
  { id: "paypal", name: "PayPal" },
];

/**
 * Destino unico de cualquier boton "Conocer Premium".
 *
 * Solo el titular puede contratar, y es el unico que pasa la guardia de la
 * pantalla de pago; el resto del personal llega a Configuracion, que es hasta
 * donde le permiten las rutas actuales. No se crea ningun otro flujo de compra.
 */
export function resolvePremiumDestination(authInfo = {}) {
  return esTitularDelNegocio(authInfo) ? PREMIUM_PAYMENT_PATH : "/configuracion";
}
