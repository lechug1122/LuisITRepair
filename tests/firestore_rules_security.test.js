import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const rootCollections = [
  "productos",
  "ventas",
  "clientes",
  "cotizaciones",
  "cortes_caja",
  "configuracion",
  "empleados",
  "proveedores",
  "servicios",
  "sesiones_dispositivo",
];

describe("reglas de aislamiento de Firestore", () => {
  test("no concede permisos a colecciones operativas en la raiz", () => {
    rootCollections.forEach((name) => {
      assert.equal(
        rules.includes(`match /${name}/{document}`),
        false,
        `La coleccion global ${name} no debe tener reglas de acceso`,
      );
    });
  });

  test("define la ruta privada de subcolecciones por negocio", () => {
    assert.match(rules, /match \/negocios\/\{negocioId\}\/\{subcollection\}\/\{document\}/);
    assert.match(rules, /negocioId == currentTenantId\(\)/);
    assert.match(rules, /canUseOperationalCollection\(subcollection\)/);
  });

  test("la superadministracion depende del correo autenticado", () => {
    assert.match(
      rules,
      /request\.auth\.token\.email == 'lechugapapayero@gmail\.com'/,
    );
    assert.doesNotMatch(rules, /authData\(\)\.superAdmin == true/);
  });

  test("no contiene escrituras incondicionales", () => {
    assert.doesNotMatch(rules, /allow\s+(write|create|update|delete)[^;]*:\s*if\s+true\s*;/);
  });
});
