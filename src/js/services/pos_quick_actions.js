import { canUseServiceDeposits } from "./plan_features.js";

export function getPOSQuickActions({ serviciosHabilitados = false, funcionesPOS = {}, premiumState = "loading" } = {}) {
  return [
    ["ventaExtra", true],
    ["promociones", funcionesPOS.promocionesDescuentos],
    ["pagarServicio", serviciosHabilitados],
    ["pagarFiado", funcionesPOS.fiado],
    ["abonarServicio", serviciosHabilitados && canUseServiceDeposits({ premiumState })],
    ["descuentoManual", funcionesPOS.descuentoAutorizado],
    ["agregarCliente", true],
  ].filter(([, visible]) => visible === true)
    .map(([id], index) => ({ id, tecla: `F${index + 1}` }));
}
