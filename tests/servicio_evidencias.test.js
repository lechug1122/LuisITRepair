import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  TIPOS_EVIDENCIA,
  agruparEvidencias,
  etiquetaTipoEvidencia,
  leerEvidencias,
  normalizarTipoEvidencia,
} from "../src/js/services/servicio_evidencias.js";
import {
  PLAN_FREE,
  PLAN_LOADING,
  PLAN_PREMIUM,
  canUseServiceEvidence,
  canUseServiceSignature,
  canViewServiceEvidence,
} from "../src/js/services/plan_features.js";

const firestoreRules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const storageRules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");
// Las reglas sin comentarios: el archivo documenta por que se descarto
// `firestore.get`, y esa mencion no debe confundirse con codigo activo.
const storageRulesCodigo = storageRules.replace(/^\s*\/\/.*$/gm, "");
const firebaseJson = JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8"));
const funcion = readFileSync(new URL("../functions/src/service_evidence.ts", import.meta.url), "utf8");
const cliente = readFileSync(new URL("../src/js/services/servicio_evidencias.js", import.meta.url), "utf8");

const foto = (extra = {}) => ({
  url: "https://ejemplo/foto.jpg",
  storagePath: "negocios/n1/servicios/s1/evidencias/ingreso/e1.jpg",
  ...extra,
});

describe("evidencias: plan", () => {
  test("subir evidencias es exclusivo de Premium", () => {
    assert.equal(canUseServiceEvidence({ premiumState: PLAN_PREMIUM }), true);
    assert.equal(canUseServiceEvidence({ premiumState: PLAN_FREE }), false);
  });

  test("un plan sin confirmar nunca concede acceso provisional", () => {
    assert.equal(canUseServiceEvidence({ premiumState: PLAN_LOADING }), false);
    assert.equal(canUseServiceEvidence(), false);
  });

  test("perder Premium no quita el derecho a VER lo ya documentado", () => {
    assert.equal(canViewServiceEvidence({ premiumState: PLAN_FREE }), true);
    assert.equal(canViewServiceEvidence({ premiumState: PLAN_PREMIUM }), true);
    assert.equal(canViewServiceEvidence({ premiumState: PLAN_LOADING }), false);
  });

  test("la firma de aceptacion esta en AMBOS planes", () => {
    assert.equal(canUseServiceSignature({ premiumState: PLAN_FREE }), true);
    assert.equal(canUseServiceSignature({ premiumState: PLAN_PREMIUM }), true);
    assert.equal(canUseServiceSignature({ premiumState: PLAN_LOADING }), false);
  });
});

describe("evidencias: categorias y lectura", () => {
  test("las cuatro categorias del proceso estan declaradas", () => {
    assert.deepEqual(
      TIPOS_EVIDENCIA.map((tipo) => tipo.key),
      ["ingreso", "diagnostico", "reparacion", "entrega"],
    );
  });

  test("una categoria desconocida cae en ingreso, sin romper la galeria", () => {
    assert.equal(normalizarTipoEvidencia("inventado"), "ingreso");
    assert.equal(normalizarTipoEvidencia(null), "ingreso");
    assert.equal(normalizarTipoEvidencia("DIAGNOSTICO"), "diagnostico");
  });

  test("nunca se muestra la clave interna", () => {
    TIPOS_EVIDENCIA.forEach((tipo) => {
      assert.ok(etiquetaTipoEvidencia(tipo.key).startsWith("Evidencia de"), tipo.key);
    });
  });

  test("lee el mapa de evidencias en orden cronologico", () => {
    const evidencias = leerEvidencias({
      evidencias: {
        e3: foto({ tipo: "entrega", fecha: { seconds: 300 } }),
        e1: foto({ tipo: "ingreso", fecha: { seconds: 100 } }),
        e2: foto({ tipo: "reparacion", fecha: { seconds: 200 } }),
      },
    });
    assert.deepEqual(evidencias.map((item) => item.tipo), ["ingreso", "reparacion", "entrega"]);
  });

  test("una evidencia sin url se descarta en vez de pintar una imagen rota", () => {
    const evidencias = leerEvidencias({ evidencias: { e1: { tipo: "ingreso" }, e2: foto() } });
    assert.equal(evidencias.length, 1);
  });

  test("un servicio sin evidencias no lanza", () => {
    assert.deepEqual(leerEvidencias({}), []);
    assert.deepEqual(leerEvidencias(undefined), []);
    assert.deepEqual(leerEvidencias({ evidencias: null }), []);
  });

  test("recoge las fotos heredadas de observacionesFotos", () => {
    // Campo que ya existia en el detalle. No se pierde lo que hubiera ahi.
    const evidencias = leerEvidencias({
      observacionesFotos: [{ url: "https://ejemplo/vieja.jpg", path: "ruta/vieja.jpg" }],
    });
    assert.equal(evidencias.length, 1);
    assert.equal(evidencias[0].tipo, "ingreso");
  });

  test("agrupa siempre en el orden del proceso", () => {
    const grupos = agruparEvidencias(leerEvidencias({
      evidencias: { e1: foto({ tipo: "entrega", fecha: { seconds: 1 } }) },
    }));
    assert.deepEqual(grupos.map((grupo) => grupo.key), ["ingreso", "diagnostico", "reparacion", "entrega"]);
    assert.equal(grupos.at(-1).fotos.length, 1);
  });
});

describe("evidencias: reglas de seguridad", () => {
  test("firebase.json declara el archivo de reglas de Storage", () => {
    assert.equal(firebaseJson.storage?.rules, "storage.rules");
  });

  test("el plan gratuito no puede modificar el mapa de evidencias", () => {
    assert.match(
      firestoreRules,
      /request\.resource\.data\.get\('evidencias', \{\}\) == resource\.data\.get\('evidencias', \{\}\)/,
    );
  });

  test("un negocio gratuito tampoco puede crear un servicio con evidencias", () => {
    assert.match(firestoreRules, /request\.resource\.data\.get\('evidencias', \{\}\) == \{\}/);
  });

  test("el bucket esta cerrado para los clientes", () => {
    // El aislamiento lo garantizan las Cloud Functions, no estas reglas: las
    // reglas de Storage de este proyecto no pueden leer Firestore.
    assert.match(storageRules, /match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/);
    assert.equal(storageRules.includes("allow read, write: if true"), false);
    assert.equal(/allow (read|write|create|update|delete)[^:]*: if (?!false)/.test(storageRulesCodigo), false);
  });

  test("no quedan reglas que dependan de leer Firestore", () => {
    // Fallaban en silencio y daban una sensacion falsa de proteccion.
    assert.equal(storageRulesCodigo.includes("firestore.get("), false);
    assert.equal(storageRulesCodigo.includes("firestore.exists("), false);
  });

});

describe("evidencias: la subida pasa por el servidor", () => {
  test("el cliente NO escribe directo en Storage", () => {
    // Las reglas de Storage de este proyecto no pueden leer Firestore, asi que
    // no hay forma segura de que el navegador suba por su cuenta.
    assert.equal(cliente.includes("firebase/storage"), false);
    assert.match(cliente, /subirEvidenciaServicio/);
    assert.match(cliente, /eliminarEvidenciaServicio/);
  });

  test("el negocio se resuelve en el servidor, nunca se acepta del cliente", () => {
    // Si el negocio llegara como parametro, cualquiera podria escribir en otro.
    assert.match(funcion, /autorizados\/\$\{uid\}/);
    assert.match(funcion, /autorizado\.negocioId \|\| autorizado\.cuentaPrincipalUid \|\| uid/);
    const contexto = funcion.split("async function resolverContexto")[1].split("/** Premium")[0];
    assert.equal(contexto.includes("request.data?.negocioId"), false);
  });

  test("exige sesion, permiso de servicios y Premium vigente", () => {
    assert.match(funcion, /unauthenticated/);
    assert.match(funcion, /permisos\["servicios\.ver"\] === true/);
    assert.match(funcion, /premiumUntil/);
    assert.match(funcion, /hasta\.toMillis\(\) > Date\.now\(\)/);
  });

  test("comprueba que el servicio sea del negocio de quien llama", () => {
    assert.match(funcion, /servicio\.negocioId !== negocioId && servicio\.cuentaPrincipalUid !== negocioId/);
  });

  test("respeta el tope de evidencias por servicio", () => {
    assert.match(funcion, /LIMITE_EVIDENCIAS = 60/);
    assert.match(funcion, /contarEvidencias\(contexto\.servicio\) >= LIMITE_EVIDENCIAS/);
  });

  test("la fecha la pone el servidor", () => {
    assert.match(funcion, /fecha: FieldValue\.serverTimestamp\(\)/);
  });

  test("al borrar, solo toca archivos del propio negocio", () => {
    assert.match(funcion, /ruta\.startsWith\(`negocios\/\$\{contexto\.negocioId\}\/`\)/);
  });

  test("una categoria inventada se rechaza en el servidor", () => {
    assert.match(funcion, /TIPOS\.has\(tipo\)/);
  });
});
