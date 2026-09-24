import { canUseTicketEditor } from "./plan_features.js";

export const FREE_TICKET_AD = "Punto de venta cajalibre.com.mx";

// Re-exportadas para que quien ya importaba desde aqui no tenga que saber
// donde viven ahora las reglas. La fuente unica es `plan_features.js`.
export {
  TICKET_EDITOR_LEGACY_END_DATE,
  TICKET_EDITOR_LEGACY_UNTIL_LABEL,
  TICKET_PREMIUM_NEW_BUSINESS_CUTOFF,
  canUseTicketEditor,
  isTicketEditorLegacyPeriodOver,
} from "./plan_features.js";

// Estado en memoria, actualizado por el proveedor de autorización; nunca por
// la configuración editable ni por localStorage. Guarda tambien si el negocio
// es anterior a la migracion, porque de eso depende que se aplique su diseño.
let currentPlan = { state: "loading", expiresAt: 0, legacy: false };

export function syncTicketPlan(state, expiresAt = 0, legacy = false) {
  currentPlan = { state, expiresAt, legacy: legacy === true };
}

export function getTicketPlan() {
  if (currentPlan.state === "premium" && currentPlan.expiresAt <= Date.now()) return "free";
  return currentPlan.state;
}

/** Negocio anterior a la migracion, segun lo ultimo que confirmo la sesion. */
export function isLegacyTicketBusiness() {
  return currentPlan.legacy === true;
}

/**
 * Aplica la politica del plan al diseño del ticket.
 *
 * El diseño guardado nunca se borra: cuando no corresponde usarlo simplemente
 * se imprime con los valores predeterminados, y vuelve solo en cuanto el plan
 * o la fecha lo permiten otra vez.
 *
 * La publicidad depende del plan, no de la edicion: durante el periodo de
 * transicion un negocio gratuito antiguo puede personalizar su ticket y aun
 * asi conserva la linea de CajaLibre.
 */
export function applyTicketPlan(
  config,
  defaults,
  state,
  now = Date.now(),
  legacy = isLegacyTicketBusiness(),
) {
  const puedeEditar = canUseTicketEditor({
    premiumState: state,
    negocioLegacy: legacy,
    ahoraMs: now,
  });

  return {
    ...(puedeEditar ? config : defaults),
    advertisingText: state === "free" ? FREE_TICKET_AD : "",
  };
}
