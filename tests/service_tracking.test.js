import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
require("tsx/cjs");
const { Timestamp } = require("firebase-admin/firestore");
const { buscarRastreoPublico, consultarServicioPublico } = require("./src/service_tracking.ts");
const now = Date.parse("2026-09-16T12:00:00Z");

function setup() {
  const service = {
    negocioId: "negocio-a", folio: "del14092601",
    status: "en_reparacion", marca: "Dell", modelo: "Inspiron",
    createdAt: Timestamp.fromMillis(now - 1000), updatedAt: Timestamp.fromMillis(now),
    nombre: "Cliente privado", telefono: "5555555555", direccion: "Privada",
    numeroSerie: "SECRETO", costo: 500, clienteId: "cliente-1",
  };
  const records = new Map([
    ["negocios/negocio-a", { premiumUntil: Timestamp.fromMillis(now + 1000) }],
    ["negocios/negocio-a/configuracion/servicios", { trackingEnabled: true }],
    ["negocios/negocio-a/configuracion/empresa", {
      negocioId: "negocio-a", nombre: "Taller", logo: "logo.png",
    }],
  ]);
  const item = {
    id: "servicio-1", ref: { path: "negocios/negocio-a/servicios/servicio-1" },
    data: () => service,
  };
  const filters = [];
  const query = {
    where: (...args) => { filters.push(args); return query; },
    limit: () => query,
    get: async () => ({ docs: [item].filter((d) => filters.every(
      ([field, , value]) => d.data()[field] === value,
    )) }),
  };
  const db = {
    collectionGroup: (name) => { assert.equal(name, "servicios"); return query; },
    doc: (path) => ({ path }),
    getAll: async (...refs) => refs.map(({ path }) => ({ data: () => records.get(path) })),
  };
  return { db, service, item, records };
}

test("consulta pública sin sesión devuelve el estatus y fechas compatibles con la página", async () => {
  const { db } = setup();
  const result = await buscarRastreoPublico(db, " del14092601 ");
  assert.equal(result.status, "en_reparacion");
  assert.equal(result.negocioNombre, "Taller");
  assert.deepEqual(result.updatedAt, { seconds: now / 1000, nanoseconds: 0 });
  assert.deepEqual(Object.keys(result).sort(), [
    "id", "folio", "tipoDispositivo", "marca", "modelo", "trabajo", "status",
    "createdAt", "updatedAt", "fechaAprox", "numeroSerie", "costo", "precioDespues",
    "hojaServicio", "aceptacion", "boleta", "evidencias", "negocioNombre", "negocioLogo",
  ].sort());
  assert.deepEqual(result.aceptacion, { estado: "no_solicitada", version: 0 });
  assert.deepEqual(result.evidencias, []);
  assert.equal(result.boleta, null);
  assert.equal(consultarServicioPublico.__endpoint.region[0], "southamerica-east1");
});

test("cualquier visitante puede consultar servicios con rastreo activo aunque Premium expiró", async () => {
  for (const premiumUntil of [undefined, Timestamp.fromMillis(now), Timestamp.fromMillis(now - 1)]) {
    const { db, records } = setup();
    records.set("negocios/negocio-a", { premiumUntil, premium: true });
    assert.equal((await buscarRastreoPublico(db, "del14092601")).status, "en_reparacion");
  }
  const { db, records } = setup();
  records.delete("negocios/negocio-a");
  assert.equal((await buscarRastreoPublico(db, "del14092601")).status, "en_reparacion");
});

test("respeta la desactivación del rastreador y la configuración faltante", async () => {
  const missing = setup();
  missing.records.delete("negocios/negocio-a/configuracion/servicios");
  assert.equal(await buscarRastreoPublico(missing.db, "del14092601"), null);
  const { db, records } = setup();
  records.set("negocios/negocio-a/configuracion/servicios", { trackingEnabled: false });
  assert.equal(await buscarRastreoPublico(db, "del14092601"), null);
});

test("un enlace de aceptación válido abre la ficha aunque el rastreo general esté apagado", async () => {
  const { db, records, service } = setup();
  const token = "a".repeat(43);
  const referencia = `negocio-a~servicio-1~${token}`;
  service.aceptacionToken = { hash: createHash("sha256").update(token).digest("hex") };
  records.set("negocios/negocio-a/configuracion/servicios", { trackingEnabled: false });

  assert.equal(await buscarRastreoPublico(db, "del14092601"), null);
  assert.equal(
    (await buscarRastreoPublico(db, "del14092601", referencia)).folio,
    "del14092601",
  );
  assert.equal(await buscarRastreoPublico(
    db, "del14092601", `negocio-a~otro-servicio~${token}`,
  ), null);
});

test("no mezcla negocios ni acepta servicios fuera de la ruta autorizada", async () => {
  const { db, service } = setup();
  service.negocioId = "negocio-b";
  assert.equal(await buscarRastreoPublico(db, "del14092601"), null);
  const other = setup();
  other.item.ref.path = "otra/raiz/servicios/servicio-1";
  assert.equal(await buscarRastreoPublico(other.db, "del14092601"), null);
});

test("folio inexistente devuelve null", async () => {
  const { db } = setup();
  assert.equal(await buscarRastreoPublico(db, "inexistente"), null);
});

test("un servicio histórico sin copia pública devuelve el estado vigente del original", async () => {
  const { db, service, records } = setup();
  assert.equal(records.has("rastreo_publico_negocios/negocio-a"), false);
  service.status = "revision";
  assert.equal((await buscarRastreoPublico(db, "del14092601")).status, "revision");
  service.status = "listo";
  assert.equal((await buscarRastreoPublico(db, "del14092601")).status, "listo");
});

test("la marca faltante no impide consultar el servicio ni expone información privada", async () => {
  const { db, records } = setup();
  records.delete("negocios/negocio-a/configuracion/empresa");
  const result = await buscarRastreoPublico(db, "del14092601");
  assert.equal(result.status, "en_reparacion");
  assert.equal(result.negocioNombre, "");
  assert.equal(result.negocioLogo, "");
  assert.equal(result.telefono, undefined);
  assert.equal(result.direccion, undefined);
  assert.equal(result.clienteId, undefined);
});

test("acceptance and photos are projected in the same public tracking response", async () => {
  const { db, service } = setup();
  service.aceptacion = {
    estado: "aceptado", version: 2, nombreCliente: "Ana",
    aceptoCondiciones: true, firmaUrl: "https://files/firma.png",
    firmaDataUrl: "data:image/png;base64,AAAA",
    fechaRespuesta: Timestamp.fromMillis(now), solicitadaPorId: "privado",
  };
  service.evidencias = {
    foto1: {
      url: "https://files/foto.jpg", miniaturaUrl: "https://files/thumb.jpg",
      tipo: "reparacion", descripcion: "Trabajo terminado",
      fecha: Timestamp.fromMillis(now - 500), usuarioId: "privado",
    },
  };

  const result = await buscarRastreoPublico(db, "del14092601");
  assert.equal(result.aceptacion.estado, "aceptado");
  assert.equal(result.aceptacion.firmaUrl, "https://files/firma.png");
  assert.equal(result.aceptacion.solicitadaPorId, undefined);
  assert.deepEqual(result.evidencias[0], {
    id: "foto1", url: "https://files/foto.jpg", miniaturaUrl: "https://files/thumb.jpg",
    tipo: "reparacion", descripcion: "Trabajo terminado",
    fecha: { seconds: (now / 1000) - 1, nanoseconds: 500000000 },
  });
  assert.equal(result.evidencias[0].usuarioId, undefined);
});

test("rechaza folios inválidos antes de consultar Firebase", async () => {
  for (const value of [undefined, {}, 123, " ", "x".repeat(121)]) {
    await assert.rejects(buscarRastreoPublico({}, value), { code: "invalid-argument" });
  }
});

test("la boleta viaja desglosada y sin campos de la trastienda", async () => {
  const { db, service } = setup();
  service.boleta = {
    tipoDocumento: "venta", folio: "B-9", fecha: "2026-09-16", formaPago: "efectivo",
    notas: "Incluye limpieza.",
    // Campos que el negocio guarda para si y que NUNCA deben salir.
    costoCompra: 400, proveedor: "Mayorista X", empleado: "Luis",
    items: [
      { item: "P-001", descripcion: "Teclado", cantidad: 2, pUnitario: "600", costoCompra: 400, productoId: "prod-9" },
      { item: "", descripcion: "", cantidad: 0, pUnitario: 0 },
      "renglon corrupto",
    ],
    total: 1200,
  };
  const { boleta } = await buscarRastreoPublico(db, "del14092601");

  assert.deepEqual(Object.keys(boleta).sort(), [
    "tipoDocumento", "folio", "fecha", "formaPago", "notas", "items", "total", "truncada",
  ].sort());
  assert.deepEqual(boleta.items, [
    { item: "P-001", descripcion: "Teclado", cantidad: 2, pUnitario: 600, importe: 1200 },
  ]);
  assert.equal(boleta.total, 1200);
  assert.equal(boleta.truncada, false);
  assert.equal(JSON.stringify(boleta).includes("costoCompra"), false);
  assert.equal(JSON.stringify(boleta).includes("Mayorista"), false);
  assert.equal(JSON.stringify(boleta).includes("prod-9"), false);
});

test("una boleta a medio llenar no se muestra, y una larga se recorta", async () => {
  const vacia = setup();
  vacia.service.boleta = { items: [], total: 0 };
  assert.equal((await buscarRastreoPublico(vacia.db, "del14092601")).boleta, null);

  const larga = setup();
  larga.service.boleta = {
    items: Array.from({ length: 80 }, (_, i) => ({
      item: `P-${i}`, descripcion: `Concepto ${i}`, cantidad: 1, pUnitario: 10,
    })),
  };
  const { boleta } = await buscarRastreoPublico(larga.db, "del14092601");
  assert.equal(boleta.items.length, 60);
  assert.equal(boleta.truncada, true);
  // Sin total guardado, el total es la suma de lo que SI se muestra.
  assert.equal(boleta.total, 600);
});
