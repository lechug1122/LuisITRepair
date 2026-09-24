import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ESTADOS_SERVICIO,
  esEstadoCerrado,
  esEstadoFinal,
  estadoAlSolicitarAceptacion,
  estadoTrasRespuestaCliente,
  etiquetaEstadoServicio,
  getEstadosSeleccionables,
  normalizarEstadoServicio,
  tonoEstadoServicio,
} from "../src/js/services/servicio_estados.js";
import {
  construirEntradaHistorial,
  contarCambiosRegistrados,
  leerHistorialEstados,
  nuevaClaveHistorial,
} from "../src/js/services/servicio_historial.js";
import { STATUS, statusInfo } from "../src/js/utils/status_map.js";
import { getServiceTrackingState } from "../src/js/utils/service_tracking_status.js";

const tsHace = (minutos) => ({ seconds: Math.floor((Date.now() - minutos * 60000) / 1000) });

describe("estados de servicio", () => {
  test("los servicios ya guardados conservan su clave", () => {
    // Estas claves estan escritas en documentos reales: si alguna dejara de
    // reconocerse, ese servicio apareceria como "Pendiente".
    ["pendiente", "revision", "reparacion", "espera_refaccion", "listo",
      "entregado", "cancelado", "no_reparable", "abandonado"].forEach((clave) => {
      assert.equal(normalizarEstadoServicio(clave), clave, clave);
    });
  });

  test("los nombres nuevos son alias de los estados que ya existian", () => {
    assert.equal(normalizarEstadoServicio("en_revision"), "revision");
    assert.equal(normalizarEstadoServicio("en_reparacion"), "reparacion");
    assert.equal(normalizarEstadoServicio("en_espera_de_refaccion"), "espera_refaccion");
    assert.equal(normalizarEstadoServicio("finalizado"), "listo");
  });

  test("tolera acentos, mayusculas y espacios", () => {
    assert.equal(normalizarEstadoServicio("En Revisión"), "revision");
    assert.equal(normalizarEstadoServicio("  EN REPARACIÓN  "), "reparacion");
  });

  test("un estado desconocido nunca rompe la pantalla", () => {
    assert.equal(normalizarEstadoServicio("cualquier_cosa"), "pendiente");
    assert.equal(normalizarEstadoServicio(null), "pendiente");
    assert.equal(normalizarEstadoServicio(undefined), "pendiente");
    assert.equal(normalizarEstadoServicio(""), "pendiente");
  });

  test("a la persona nunca se le muestra la clave interna", () => {
    ESTADOS_SERVICIO.forEach((estado) => {
      assert.ok(!etiquetaEstadoServicio(estado.key).includes("_"), estado.key);
    });
    assert.equal(etiquetaEstadoServicio("en_revision"), "En revision");
    assert.equal(etiquetaEstadoServicio("rechazado"), "Rechazado por el cliente");
  });

  test("cada estado declara un tono conocido, sin colores sueltos", () => {
    const tonos = new Set([
      "neutral", "info", "espera", "positivo", "activo",
      "destacado", "final", "negativo", "apagado",
    ]);
    ESTADOS_SERVICIO.forEach((estado) => {
      assert.ok(tonos.has(estado.tono), `${estado.key} usa el tono ${estado.tono}`);
    });
    assert.equal(tonoEstadoServicio("esperando_autorizacion"), "espera");
    assert.equal(tonoEstadoServicio("listo"), "destacado");
  });

  test("el desplegable no ofrece estados que decide el sistema", () => {
    const claves = getEstadosSeleccionables("revision").map((estado) => estado.key);
    assert.ok(!claves.includes("abandonado"));
    assert.ok(!claves.includes("entregado"));
    assert.ok(claves.includes("esperando_autorizacion"));
    assert.ok(claves.includes("autorizado"));
    assert.ok(claves.includes("rechazado"));
  });

  test("un servicio entregado conserva su estado en el desplegable", () => {
    const claves = getEstadosSeleccionables("entregado").map((estado) => estado.key);
    assert.ok(claves.includes("entregado"));
  });

  test("solo entregado y abandonado cierran el servicio", () => {
    assert.equal(esEstadoFinal("entregado"), true);
    assert.equal(esEstadoFinal("abandonado"), true);
    assert.equal(esEstadoFinal("cancelado"), false);
    assert.equal(esEstadoCerrado("cancelado"), true);
    assert.equal(esEstadoCerrado("reparacion"), false);
  });
});

describe("transiciones automaticas", () => {
  test("pedir la aceptacion deja el servicio esperando al cliente", () => {
    assert.equal(estadoAlSolicitarAceptacion("revision"), "esperando_autorizacion");
    assert.equal(estadoAlSolicitarAceptacion("pendiente"), "esperando_autorizacion");
  });

  test("un servicio ya cerrado no vuelve a esperar firma", () => {
    assert.equal(estadoAlSolicitarAceptacion("entregado"), "entregado");
    assert.equal(estadoAlSolicitarAceptacion("abandonado"), "abandonado");
  });

  test("la respuesta del cliente mueve el estado", () => {
    assert.equal(estadoTrasRespuestaCliente("esperando_autorizacion", "aceptado"), "autorizado");
    assert.equal(estadoTrasRespuestaCliente("esperando_autorizacion", "rechazado"), "rechazado");
  });

  test("autorizar NO pone el servicio en reparacion", () => {
    // Empezar a reparar es una decision del negocio, no una consecuencia de
    // que el cliente firme.
    assert.notEqual(estadoTrasRespuestaCliente("esperando_autorizacion", "aceptado"), "reparacion");
  });

  test("la firma no retrocede un servicio que ya avanzo", () => {
    assert.equal(estadoTrasRespuestaCliente("reparacion", "aceptado"), "reparacion");
    assert.equal(estadoTrasRespuestaCliente("listo", "rechazado"), "listo");
  });
});

describe("historial de estados", () => {
  test("las claves ordenan cronologicamente y no llevan puntos", () => {
    const antes = nuevaClaveHistorial(1_700_000_000_000, 0.5);
    const despues = nuevaClaveHistorial(1_700_000_001_000, 0.5);
    assert.ok(antes < despues);
    // La clave forma parte de una ruta de campo de Firestore.
    assert.ok(!antes.includes("."));
    assert.ok(!antes.includes("/"));
  });

  test("dos cambios del mismo instante no comparten clave", () => {
    const a = nuevaClaveHistorial(1_700_000_000_000, 0.1234);
    const b = nuevaClaveHistorial(1_700_000_000_000, 0.9876);
    assert.notEqual(a, b);
  });

  test("la entrada guarda estado canonico, usuario y origen", () => {
    const entrada = construirEntradaHistorial({
      estado: "en_reparacion",
      usuarioId: "u1",
      usuarioNombre: "Luis",
      origen: "negocio",
    });
    assert.equal(entrada.estado, "reparacion");
    assert.equal(entrada.usuarioNombre, "Luis");
    assert.equal(entrada.origen, "negocio");
  });

  test("lee el historial guardado como mapa y lo ordena", () => {
    const servicio = {
      status: "reparacion",
      createdAt: tsHace(300),
      historialEstados: {
        h00000000000003xxxxxx: { estado: "reparacion", fecha: tsHace(10), origen: "negocio" },
        h00000000000001xxxxxx: { estado: "pendiente", fecha: tsHace(300), origen: "sistema" },
        h00000000000002xxxxxx: { estado: "revision", fecha: tsHace(100), origen: "negocio" },
      },
    };
    const pasos = leerHistorialEstados(servicio);
    assert.deepEqual(pasos.map((p) => p.estado), ["pendiente", "revision", "reparacion"]);
    assert.equal(contarCambiosRegistrados(servicio), 3);
  });

  test("acepta tambien un historial guardado como arreglo", () => {
    const pasos = leerHistorialEstados({
      status: "revision",
      createdAt: tsHace(60),
      historialEstados: [
        { estado: "pendiente", fecha: tsHace(60), origen: "sistema" },
        { estado: "en_revision", fecha: tsHace(30), origen: "negocio" },
      ],
    });
    assert.deepEqual(pasos.map((p) => p.estado), ["pendiente", "revision"]);
  });

  test("un servicio viejo sin historial no se ve vacio", () => {
    // Compatibilidad: documentos anteriores a esta funcion. Se reconstruye lo
    // que si es dato real (alta y estado actual) y se marca como estimado.
    const pasos = leerHistorialEstados({ status: "listo", createdAt: tsHace(500) });
    assert.equal(pasos.length, 2);
    assert.equal(pasos[0].estado, "pendiente");
    assert.equal(pasos[0].sintetica, true);
    assert.equal(pasos[1].estado, "listo");
    assert.equal(contarCambiosRegistrados({ status: "listo", createdAt: tsHace(500) }), 0);
  });

  test("un servicio sin ningun dato no lanza", () => {
    assert.doesNotThrow(() => leerHistorialEstados({}));
    assert.doesNotThrow(() => leerHistorialEstados(undefined));
  });

  test("ignora entradas corruptas sin tirar la linea de tiempo", () => {
    const pasos = leerHistorialEstados({
      status: "revision",
      createdAt: tsHace(60),
      historialEstados: { h1: null, h2: "texto suelto", h3: { estado: "revision", fecha: tsHace(5) } },
    });
    assert.ok(pasos.every((paso) => typeof paso.estado === "string"));
  });
});

describe("compatibilidad de las tablas derivadas", () => {
  test("status_map sigue exponiendo value/label/color", () => {
    STATUS.forEach((item) => {
      assert.equal(typeof item.value, "string");
      assert.equal(typeof item.label, "string");
      assert.match(item.color, /^#[0-9a-f]{6}$/i);
    });
    assert.equal(statusInfo("en_revision").label, "En revision");
  });

  test("el rastreador publico entiende los estados nuevos", () => {
    const esperando = getServiceTrackingState("esperando_autorizacion");
    assert.equal(esperando.label, "Esperando autorizacion");
    assert.ok(esperando.detail.length > 0);
    assert.equal(getServiceTrackingState("autorizado").theme, "success");
    assert.equal(getServiceTrackingState("rechazado").theme, "danger");
  });

  test("el rastreador nunca le muestra al cliente una clave cruda", () => {
    ESTADOS_SERVICIO.forEach((estado) => {
      assert.ok(!getServiceTrackingState(estado.key).label.includes("_"), estado.key);
    });
  });
});
