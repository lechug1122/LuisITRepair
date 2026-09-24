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

  test("los servicios completos no tienen lectura pública", () => {
    assert.doesNotMatch(rules, /match \/\{path=\*\*\}\/servicios\/\{document\}/);
    assert.match(
      rules,
      /match \/_legacy_servicios\/\{document\}\s*\{\s*allow read:\s*if isSignedIn\(\)/,
    );
    assert.doesNotMatch(
      rules,
      /subcollection == ['"]servicios['"]\s*\|\|/,
    );
  });

  test("el rastreador público usa una proyección limitada y exige Premium vigente", () => {
    assert.match(rules, /match \/negocios\/\{negocioId\}\/servicios_publicos\/\{document\}/);
    // La busqueda por folio es un collectionGroup: sin el comodin recursivo el
    // motor ni siquiera evalua la regla anclada al negocio y niega la consulta.
    assert.match(rules, /match \/\{path=\*\*\}\/servicios_publicos\/\{document\}/);
    assert.match(
      rules,
      /rastreoPublicoDisponible\(resource\.data\.negocioId\)/,
    );
    assert.match(rules, /request\.resource\.data\.keys\(\)\.hasOnly/);
    assert.match(rules, /negocio\.premiumUntil is timestamp && negocio\.premiumUntil > request\.time/);
    assert.match(rules, /trackingEnabled['"),\s]+false['"),\s]+== true/);
  });

  test("las reservaciones requieren Premium también en Firestore", () => {
    assert.match(
      rules,
      /subcollection != ['"]restaurante_reservaciones['"] \|\| negocioTienePremiumVigente\(negocioId\)/,
    );
  });
});
