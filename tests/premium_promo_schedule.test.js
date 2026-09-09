import test from "node:test";
import assert from "node:assert/strict";
import {
  PREMIUM_PROMO_MAX_POR_SEMANA,
  esPromoPremiumElegible,
  esRolConPromo,
  semanaPromoKey,
  siguienteEstadoPromo,
} from "../src/js/services/premium_promo_schedule.js";

const titular = {
  uid: "titular",
  cuentaPrincipalUid: "titular",
  rol: "Administrador",
  loading: false,
  activo: true,
  accesoPermitido: true,
  premiumState: "free",
  negocio: { cuentaPrincipalUid: "titular", premium: false },
};
const empleado = { ...titular, uid: "empleado" };

test("solo administradores y propietarios de un negocio gratuito", () => {
  assert(esPromoPremiumElegible(titular));
  assert(esPromoPremiumElegible({ ...empleado, rol: "administrador" }));
  assert(esPromoPremiumElegible({ ...empleado, rol: "Propietario" }));
  assert(esPromoPremiumElegible({ ...titular, rol: "Cajero" })); // titular, aunque el rol sea otro
  assert(!esPromoPremiumElegible({ ...empleado, rol: "Cajero" }));
  assert(!esPromoPremiumElegible({ ...empleado, rol: "Tecnico" }));
});

test("nunca se muestra sin certeza del plan ni con Premium activo", () => {
  assert(!esPromoPremiumElegible({ ...titular, premiumState: "premium" }));
  assert(!esPromoPremiumElegible({ ...titular, premiumState: "loading" }));
  assert(!esPromoPremiumElegible({ ...titular, loading: true }));
  assert(!esPromoPremiumElegible({ ...titular, negocio: { premium: true } }));
  assert(!esPromoPremiumElegible({ ...titular, activo: false }));
  assert(!esPromoPremiumElegible({ ...titular, accesoPermitido: false }));
  assert(!esPromoPremiumElegible({ ...titular, superAdmin: true }));
});

test("reconoce las variantes de rol con acentos y sinonimos", () => {
  ["Administrador", "admin", "ADMINISTRADOR", "Propietario", "owner", "Dueño"]
    .forEach((rol) => assert(esRolConPromo(rol), rol));
  ["Cajero", "Vendedor", "Mesero", "Cocina", ""].forEach((rol) => assert(!esRolConPromo(rol), rol));
});

test("la semana va de lunes a domingo", () => {
  const lunes = new Date(2026, 8, 7);
  assert.equal(lunes.getDay(), 1);
  assert.equal(semanaPromoKey(lunes), "2026-W37");
  assert.equal(semanaPromoKey(new Date(2026, 8, 13, 23, 59)), "2026-W37");
  assert.equal(semanaPromoKey(new Date(2026, 8, 14)), "2026-W38");
});

test("maximo dos avisos por semana calendario, con reinicio automatico", () => {
  const lunes = new Date(2026, 8, 7).getTime();
  const primero = siguienteEstadoPromo(null, lunes);
  assert.deepEqual(primero, { weekKey: "2026-W37", showCount: 1 });

  const segundo = siguienteEstadoPromo(primero, lunes + 86400000);
  assert.deepEqual(segundo, { weekKey: "2026-W37", showCount: PREMIUM_PROMO_MAX_POR_SEMANA });

  const domingo = new Date(2026, 8, 13, 23, 0).getTime();
  assert.equal(siguienteEstadoPromo(segundo, domingo), null);

  const siguienteLunes = new Date(2026, 8, 14, 8, 0).getTime();
  assert.deepEqual(siguienteEstadoPromo(segundo, siguienteLunes), {
    weekKey: "2026-W38",
    showCount: 1,
  });
});

test("un contador corrupto no desbloquea avisos infinitos", () => {
  const semana = semanaPromoKey(new Date());
  assert.equal(siguienteEstadoPromo({ weekKey: semana, showCount: 99 }), null);
  assert.deepEqual(siguienteEstadoPromo({ weekKey: semana, showCount: "x" }), {
    weekKey: semana,
    showCount: 1,
  });
});
