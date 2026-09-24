// Simula las reglas de Firestore contra la API oficial de Firebase Rules.
//
// Las pruebas de `firestore_rules_security.test.js` leen el texto de las
// reglas; esto las EJECUTA, que es distinto: comprueba que un permiso se
// conceda o se niegue de verdad, con los `get()` de autorizados y negocios
// resueltos por mocks.
//
// Fuera de `npm test` porque necesita credenciales de Google Cloud:
//
//   gcloud auth login
//   node tests/firestore-rules-simulacion.mjs
//
// Lo importante que cubre: que los servicios que YA existen (sin los campos
// nuevos) se sigan pudiendo editar. Un fallo ahi significa que la aplicacion
// deja de funcionar para todo el mundo.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROYECTO = process.env.FIREBASE_PROJECT || "cajalibre-b4ca5";
const reglas = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

function token() {
  try {
    // `shell: true` porque en Windows gcloud es un .cmd. Node deja un aviso de
    // libuv al terminar en esa combinacion; es ruido, no un fallo: el resultado
    // de las comprobaciones se imprime antes y el codigo de salida es correcto.
    return execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      shell: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    console.error("No se pudo obtener un token. Ejecuta: gcloud auth login");
    process.exit(1);
  }
}

const AUTORIZADO = {
  rol: "Administrador",
  activo: true,
  negocioId: "n1",
  cuentaPrincipalUid: "n1",
  permisos: { "servicios.ver": true, "servicios.crear": true },
};

const NEGOCIO_FREE = { cuentaPrincipalUid: "n1", estado: "gratuito", premium: false, conteos: { usuariosTotal: 1 } };
const NEGOCIO_PREMIUM = { ...NEGOCIO_FREE, premium: true, premiumUntil: "2027-01-01T00:00:00Z" };

const SERVICIO = {
  negocioId: "n1", cuentaPrincipalUid: "n1", folio: "SV-1", status: "revision", costo: "100",
};

const EVIDENCIA = { e1: { url: "https://ejemplo/foto.jpg", tipo: "ingreso" } };
const FIRMADA = { estado: "aceptado", version: 1, nombreCliente: "Ana" };

const mocks = (negocio) => [
  {
    function: "get",
    args: [{ exactValue: "/databases/(default)/documents/autorizados/u1" }],
    result: { value: { data: AUTORIZADO } },
  },
  {
    function: "exists",
    args: [{ exactValue: "/databases/(default)/documents/autorizados/u1" }],
    result: { value: true },
  },
  {
    function: "get",
    args: [{ exactValue: "/databases/(default)/documents/negocios/n1" }],
    result: { value: { data: negocio } },
  },
];

const caso = (nombre, expectation, negocio, antes, despues) => ({
  nombre,
  expectation,
  request: {
    auth: { uid: "u1", token: { email: "persona@negocio.com" } },
    path: "/databases/(default)/documents/negocios/n1/servicios/s1",
    method: "update",
    time: "2026-09-20T18:00:00Z",
    resource: { data: despues },
  },
  resource: { data: antes },
  functionMocks: mocks(negocio),
});

const CASOS = [
  // Compatibilidad: lo que ya funcionaba tiene que seguir funcionando.
  caso("un servicio ya existente se sigue pudiendo editar", "ALLOW", NEGOCIO_FREE,
    SERVICIO, { ...SERVICIO, status: "reparacion" }),

  // Aceptacion: el negocio solicita, el servidor registra.
  caso("el negocio puede crear la solicitud de aceptacion", "ALLOW", NEGOCIO_FREE,
    SERVICIO, { ...SERVICIO, status: "esperando_autorizacion", aceptacion: { estado: "pendiente", version: 1 } }),
  caso("NADIE puede falsificar una aceptacion firmada", "DENY", NEGOCIO_FREE,
    SERVICIO, { ...SERVICIO, aceptacion: FIRMADA }),
  caso("ni siquiera un negocio Premium puede falsificarla", "DENY", NEGOCIO_PREMIUM,
    SERVICIO, { ...SERVICIO, aceptacion: FIRMADA }),
  caso("se puede editar el servicio dejando la aceptacion intacta", "ALLOW", NEGOCIO_FREE,
    { ...SERVICIO, aceptacion: FIRMADA }, { ...SERVICIO, costo: "200", aceptacion: FIRMADA }),
  caso("no se puede borrar una version archivada", "DENY", NEGOCIO_FREE,
    { ...SERVICIO, autorizaciones: [{ version: 1, estado: "rechazado" }] },
    { ...SERVICIO, autorizaciones: [] }),

  // Evidencias: Premium escribe, Free conserva.
  caso("un negocio Premium sube evidencias", "ALLOW", NEGOCIO_PREMIUM,
    SERVICIO, { ...SERVICIO, evidencias: EVIDENCIA }),
  caso("un negocio Premium borra evidencias", "ALLOW", NEGOCIO_PREMIUM,
    { ...SERVICIO, evidencias: EVIDENCIA }, SERVICIO),
  caso("un negocio gratuito NO puede subir evidencias", "DENY", NEGOCIO_FREE,
    SERVICIO, { ...SERVICIO, evidencias: EVIDENCIA }),
  caso("al perder Premium las evidencias tampoco se pueden borrar", "DENY", NEGOCIO_FREE,
    { ...SERVICIO, evidencias: EVIDENCIA }, SERVICIO),
];

const respuesta = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROYECTO}:test`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token()}`,
    "x-goog-user-project": PROYECTO,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    source: { files: [{ name: "firestore.rules", content: reglas }] },
    testSuite: {
      testCases: CASOS.map(({ nombre, ...resto }) => (void nombre, resto)),
    },
  }),
});

const datos = await respuesta.json();
if (datos.error) {
  console.error("La API rechazo la peticion:", datos.error.message);
  process.exit(1);
}

let fallos = 0;
(datos.testResults || []).forEach((resultado, indice) => {
  const ok = resultado.state === "SUCCESS";
  if (!ok) fallos += 1;
  console.log(`  ${ok ? "ok    " : "FALLO "} ${CASOS[indice].nombre} (${CASOS[indice].expectation})`);
});

console.log(`\n${CASOS.length - fallos} de ${CASOS.length} comprobaciones correctas.`);
process.exit(fallos ? 1 : 0);
