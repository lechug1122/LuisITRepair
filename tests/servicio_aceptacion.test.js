import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  ACEPTACION_ACEPTADA,
  ACEPTACION_NO_SOLICITADA,
  ACEPTACION_PENDIENTE,
  ACEPTACION_RECHAZADA,
  MOTIVOS_RECHAZO,
  construirEnlaceAceptacion,
  construirReferencia,
  esMotivoRechazoValido,
  etiquetaMotivoRechazo,
  leerAceptacion,
  leerHistorialAceptaciones,
  leerReferencia,
  respuestaRegistrada,
  siguienteVersionAceptacion,
} from "../src/js/services/servicio_aceptacion_modelo.js";
import { estadoTrasRespuestaCliente } from "../src/js/services/servicio_estados.js";

const funcion = readFileSync(new URL("../functions/src/service_acceptance.ts", import.meta.url), "utf8");
// Las utilidades de Storage (nombre del bucket y validacion de imagenes) son
// compartidas con las evidencias, asi que viven en su propio modulo.
const storageUtils = readFileSync(new URL("../functions/src/storage_bucket.ts", import.meta.url), "utf8");
const pdf = readFileSync(new URL("../src/js/services/pdf_hoja_servicio.js", import.meta.url), "utf8");
const appJsx = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const reglas = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

const TOKEN = "a".repeat(43);
const ts = (segundos) => ({ seconds: segundos });

describe("aceptacion: lectura", () => {
  test("un servicio sin el campo es 'no solicitada', no un error", () => {
    const aceptacion = leerAceptacion({});
    assert.equal(aceptacion.estado, ACEPTACION_NO_SOLICITADA);
    assert.equal(aceptacion.version, 0);
    assert.equal(aceptacion.enlaceVigente, false);
    assert.doesNotThrow(() => leerAceptacion(undefined));
    assert.doesNotThrow(() => leerAceptacion({ aceptacion: "texto raro" }));
  });

  test("un estado desconocido no se acepta como valido", () => {
    assert.equal(leerAceptacion({ aceptacion: { estado: "inventado" } }).estado, ACEPTACION_NO_SOLICITADA);
  });

  test("una aceptacion firmada devuelve nombre, firma y fecha", () => {
    const aceptacion = leerAceptacion({
      aceptacion: {
        estado: ACEPTACION_ACEPTADA,
        version: 2,
        nombreCliente: "Ana López",
        firmaUrl: "https://ejemplo/firma.png",
        aceptoCondiciones: true,
        fechaRespuesta: ts(1700),
      },
    });
    assert.equal(aceptacion.estado, ACEPTACION_ACEPTADA);
    assert.equal(aceptacion.nombreCliente, "Ana López");
    assert.equal(aceptacion.aceptoCondiciones, true);
    assert.equal(aceptacion.fechaRespuestaMs, 1700 * 1000);
  });
});

describe("aceptacion: vigencia del enlace", () => {
  const base = {
    aceptacion: { estado: ACEPTACION_PENDIENTE, version: 1 },
    aceptacionToken: { usado: false, expiraEn: ts(2000) },
  };

  test("vigente mientras no se use ni caduque", () => {
    assert.equal(leerAceptacion(base, 1000 * 1000).enlaceVigente, true);
  });

  test("un enlace ya usado deja de servir", () => {
    const usado = { ...base, aceptacionToken: { ...base.aceptacionToken, usado: true } };
    assert.equal(leerAceptacion(usado, 1000 * 1000).enlaceVigente, false);
  });

  test("un enlace caducado deja de servir", () => {
    assert.equal(leerAceptacion(base, 9999 * 1000).enlaceVigente, false);
  });

  test("una orden ya respondida no tiene enlace vigente", () => {
    const respondida = { ...base, aceptacion: { estado: ACEPTACION_ACEPTADA, version: 1 } };
    assert.equal(leerAceptacion(respondida, 1000 * 1000).enlaceVigente, false);
  });
});

describe("aceptacion: versionado", () => {
  test("la primera solicitud es la version 1", () => {
    assert.equal(siguienteVersionAceptacion(undefined), 1);
    assert.equal(siguienteVersionAceptacion(null), 1);
  });

  test("regenerar un enlace sin responder NO crea una version nueva", () => {
    // Reenviar el mismo presupuesto es reenviarlo, no renegociarlo.
    assert.equal(siguienteVersionAceptacion({ estado: ACEPTACION_PENDIENTE, version: 1 }), 1);
  });

  test("tras una respuesta del cliente, la siguiente solicitud sube de version", () => {
    assert.equal(siguienteVersionAceptacion({ estado: ACEPTACION_RECHAZADA, version: 1 }), 2);
    assert.equal(siguienteVersionAceptacion({ estado: ACEPTACION_ACEPTADA, version: 3 }), 4);
  });

  test("solo cuenta como respuesta lo que el cliente contesto", () => {
    assert.equal(respuestaRegistrada({ estado: ACEPTACION_PENDIENTE }), false);
    assert.equal(respuestaRegistrada({ estado: ACEPTACION_ACEPTADA }), true);
    assert.equal(respuestaRegistrada({ estado: ACEPTACION_RECHAZADA }), true);
  });

  test("el historial se lee de la version mas reciente a la mas antigua", () => {
    const versiones = leerHistorialAceptaciones({
      autorizaciones: [
        { version: 1, estado: ACEPTACION_RECHAZADA, motivoRechazo: "precio" },
        { version: 2, estado: ACEPTACION_ACEPTADA, nombreCliente: "Ana" },
      ],
    });
    assert.deepEqual(versiones.map((item) => item.version), [2, 1]);
  });

  test("un servicio sin historial de autorizaciones no lanza", () => {
    assert.deepEqual(leerHistorialAceptaciones({}), []);
    assert.deepEqual(leerHistorialAceptaciones({ autorizaciones: "raro" }), []);
  });
});

describe("aceptacion: motivos de rechazo", () => {
  test("estan los cinco motivos y ninguno muestra la clave interna", () => {
    assert.equal(MOTIVOS_RECHAZO.length, 5);
    MOTIVOS_RECHAZO.forEach((motivo) => {
      assert.ok(!motivo.label.includes("_"), motivo.key);
      assert.equal(esMotivoRechazoValido(motivo.key), true);
    });
  });

  test("un motivo inventado se rechaza", () => {
    assert.equal(esMotivoRechazoValido("cualquier_cosa"), false);
    assert.equal(esMotivoRechazoValido(""), false);
    assert.equal(etiquetaMotivoRechazo("cualquier_cosa"), "Otro motivo");
  });
});

describe("aceptacion: referencia del enlace", () => {
  test("ida y vuelta de la referencia", () => {
    const referencia = construirReferencia("negocio1", "servicio1", TOKEN);
    assert.deepEqual(leerReferencia(referencia), {
      negocioId: "negocio1", servicioId: "servicio1", token: TOKEN,
    });
  });

  test("rechaza referencias con barras o recorridos de ruta", () => {
    // Sin esto, el enlace podria apuntar a un documento distinto del aparente.
    assert.equal(leerReferencia(`negocios/otro~servicio1~${TOKEN}`), null);
    assert.equal(leerReferencia(`..~servicio1~${TOKEN}`), null);
    assert.equal(leerReferencia(`n1~../../otro~${TOKEN}`), null);
  });

  test("rechaza referencias mal formadas o con token corto", () => {
    assert.equal(leerReferencia("n1~s1"), null);
    assert.equal(leerReferencia("n1~s1~corto"), null);
    assert.equal(leerReferencia(""), null);
    assert.equal(leerReferencia(null), null);
  });

  test("el enlace apunta a la ruta publica registrada en la aplicacion", () => {
    const enlace = construirEnlaceAceptacion("n1~s1~token", "https://cajalibre.com.mx/");
    assert.equal(enlace, "https://cajalibre.com.mx/aceptar/n1~s1~token");
    assert.match(appJsx, /path="\/aceptar\/:referencia"/);
  });

  test("los enlaces nuevos abren la aceptacion dentro de Status", () => {
    const enlace = construirEnlaceAceptacion(
      "n1~s1~token", "https://cajalibre.com.mx/", "SV 123",
    );
    assert.equal(
      enlace,
      "https://cajalibre.com.mx/status/SV%20123?aceptacion=n1~s1~token#aceptacion-cliente",
    );
  });
});

describe("aceptacion: separacion entre estado y aceptacion", () => {
  test("aceptar mueve el servicio solo si estaba esperando la respuesta", () => {
    assert.equal(estadoTrasRespuestaCliente("esperando_autorizacion", "aceptado"), "autorizado");
    assert.equal(estadoTrasRespuestaCliente("revision", "aceptado"), "revision");
  });

  test("la Cloud Function aplica la misma regla que la aplicacion", () => {
    assert.match(funcion, /estadoActual === "esperando_autorizacion"/);
    assert.match(funcion, /decision === "aceptado" \? "autorizado" : "rechazado"/);
  });
});

describe("aceptacion: seguridad del servidor", () => {
  test("el token se guarda solo como hash", () => {
    assert.match(funcion, /createHash\("sha256"\)/);
  });

  test("el hash se compara en tiempo constante", () => {
    assert.match(funcion, /timingSafeEqual/);
  });

  test("la respuesta se registra dentro de una transaccion", () => {
    // Sin transaccion, dos toques rapidos podrian registrar dos aceptaciones.
    assert.match(funcion, /runTransaction/);
    assert.match(funcion, /"aceptacionToken\.usado": true/);
  });

  test("se valida condiciones, nombre y firma antes de aceptar", () => {
    assert.match(funcion, /aceptoCondiciones !== true/);
    assert.match(funcion, /Escribe tu nombre para registrar la aceptación/);
    assert.match(funcion, /Falta la firma/);
  });

  test("el bucket de la firma se nombra explicitamente", () => {
    // Depender de `getStorage().bucket()` ata la funcion al FIREBASE_CONFIG
    // que tuviera el proyecto el dia del despliegue.
    assert.match(storageUtils, /function bucketDelProyecto\(\)/);
    assert.match(storageUtils, /firebasestorage\.app/);
    // Se comprueba la llamada real, no la mencion en el comentario.
    assert.equal(storageUtils.includes("getStorage().bucket().file("), false);
    assert.match(storageUtils, /bucketDelProyecto\(\)\.file\(/);
  });

  test("se comprueba que el archivo de firma sea un PNG real", () => {
    // La firma de un PNG y la de un JPEG se validan en el modulo compartido.
    assert.match(storageUtils, /89504e470d0a1a0a/);
    assert.match(storageUtils, /ffd8ff/);
    assert.match(funcion, /MAX_FIRMA_BYTES/);
    assert.match(funcion, /leerImagenBase64\(\s*firmaBase64, "image\/png", MAX_FIRMA_BYTES/);
  });

  test("un enlace de una version anterior no responde la orden vigente", () => {
    assert.match(funcion, /aceptacionToken\?\.version\) !== Number\(servicio\.aceptacion\?\.version\)/);
  });

  test("la proyeccion al cliente no expone datos internos del negocio", () => {
    const proyeccion = funcion.split("function proyeccionParaCliente")[1].split("/** Consulta")[0];
    ["notaAdmin", "abonos", "totalAbonado", "empleado", "dedupeKey", "clienteId"]
      .forEach((campo) => {
        assert.equal(proyeccion.includes(campo), false, `la proyeccion no debe incluir ${campo}`);
      });
  });

  test("la boleta llega desglosada, nunca copiada tal cual del documento", () => {
    // El cliente firma un presupuesto y tiene derecho a leerlo renglon por
    // renglon, pero solo a traves de `publicBoleta`, que copia por lista
    // explicita: concepto, cantidad, precio e importe y nada mas.
    const proyeccion = funcion.split("function proyeccionParaCliente")[1].split("/** Consulta")[0];
    assert.match(proyeccion, /boleta: publicBoleta\(servicio\)/);
    assert.equal(proyeccion.includes("servicio.boleta"), false);
  });

  test("el cliente escribe por lista blanca, nunca el documento completo", () => {
    const transaccion = funcion.split("const patch: Record<string, unknown> = {")[1];
    assert.ok(transaccion);
    ["costo", "notaAdmin", "boleta", "precioDespues"].forEach((campo) => {
      assert.equal(transaccion.split("tx.update")[0].includes(`${campo}:`), false, campo);
    });
  });
});

describe("aceptacion: integridad en las reglas de Firestore", () => {
  test("el negocio no puede escribir una aceptacion firmada a mano", () => {
    // Solo la Cloud Function (SDK de administracion, que no pasa por reglas)
    // puede dejar una aceptacion en "aceptado" o "rechazado".
    assert.match(reglas, /function aceptacionIntegra\(\)/);
    assert.match(reglas, /nueva\.get\('estado', ''\) in \['', 'pendiente'\]/);
    assert.match(reglas, /subcollection != 'servicios' \|\| request\.resource == null \|\| aceptacionIntegra\(\)/);
  });

  test("el historial de autorizaciones solo puede crecer", () => {
    assert.match(reglas, /historialNuevo\.size\(\) >= historialPrevio\.size\(\)/);
  });
});

describe("firma en el PDF existente", () => {
  test("no se creo un generador de PDF nuevo", () => {
    // El unico generador de la orden de servicio sigue siendo este.
    assert.equal((pdf.match(/export async function generarPdfHojaServicio/g) || []).length, 1);
    assert.equal(pdf.includes("generarPdfAceptacion"), false);
  });

  test("la firma se integra en el bloque de firmas que ya existia", () => {
    assert.match(pdf, /function drawFirmas\(doc, y, setPdfFont, form\)/);
    assert.match(pdf, /function drawAutomotiveSignatures\(doc, setPdfFont, y = 196, form = null\)/);
  });

  test("sin aceptacion registrada se conserva la raya de siempre", () => {
    const bloque = pdf.split("function drawFirmas(")[1].split("function isAutomotiveTemplate")[0];
    assert.match(bloque, /if \(!aceptacion\) return;/);
    assert.match(bloque, /NOMBRE Y FIRMA DEL CLIENTE/);
  });

  test("solo se pinta la firma de una aceptacion realmente aceptada", () => {
    assert.match(pdf, /aceptacion\.estado !== "aceptado"\) return null/);
  });

  test("las evidencias van en un anexo acotado, no entre las secciones", () => {
    assert.match(pdf, /const MAX_EVIDENCIAS_POR_TIPO = 2/);
    assert.match(pdf, /miniaturaUrl \|\| foto\.url/);
  });
});
