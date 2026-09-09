import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

const storage = new Map();
let tenant;
let analyticsAccess;

before(async () => {
  globalThis.window = {
    location: { hostname: "localhost" },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
  tenant = await import("../src/js/services/tenant.js");
  analyticsAccess = await import("../src/js/services/analytics_access.js");
});

beforeEach(() => {
  storage.clear();
});

describe("arquitectura privada por negocio", () => {
  test("crea referencias de coleccion dentro del negocio", () => {
    const ref = tenant.getCollectionRef("productos", "negocio-123");
    assert.equal(ref.path, "negocios/negocio-123/productos");
  });

  test("crea referencias de documento dentro del negocio", () => {
    const ref = tenant.getDocRef("cotizaciones", "cot-9", "negocio-123");
    assert.equal(ref.path, "negocios/negocio-123/cotizaciones/cot-9");
  });

  test("guarda configuracion como subcoleccion privada", () => {
    const ref = tenant.getTenantConfigDocRef("empresa", "negocio-123");
    assert.equal(ref.path, "negocios/negocio-123/configuracion/empresa");
  });

  test("usa el negocio almacenado cuando no se proporciona uno explicitamente", () => {
    tenant.saveTenantContext({ uid: "empleado-1", negocioId: "negocio-456" });
    assert.equal(
      tenant.getDocRef("cortes_caja", "2026-08-04").path,
      "negocios/negocio-456/cortes_caja/2026-08-04",
    );
  });

  test("rechaza referencias privadas cuando no existe contexto de negocio", () => {
    assert.throws(
      () => tenant.getCollectionRef("productos"),
      /No se pudo resolver el negocio/,
    );
  });

  test("incorpora los identificadores del negocio en cada registro", () => {
    assert.deepEqual(tenant.withTenantData({ nombre: "Producto" }, "negocio-123"), {
      nombre: "Producto",
      cuentaPrincipalUid: "negocio-123",
      negocioId: "negocio-123",
    });
  });

  test("filtra registros pertenecientes a otro negocio", () => {
    const items = [
      { id: "a", negocioId: "negocio-123" },
      { id: "b", negocioId: "negocio-999" },
    ];
    assert.deepEqual(
      tenant.filterItemsByTenant(items, "negocio-123").map((item) => item.id),
      ["a"],
    );
  });
});

describe("administracion exclusiva", () => {
  test("permite unicamente el correo administrador configurado", () => {
    assert.equal(
      analyticsAccess.hasAnalyticsAccess({ email: " LECHUGAPAPAYERO@GMAIL.COM " }),
      true,
    );
    assert.equal(
      analyticsAccess.hasAnalyticsAccess({
        email: "otro@gmail.com",
        superAdmin: true,
        accesoAnalitica: true,
      }),
      false,
    );
  });
});
