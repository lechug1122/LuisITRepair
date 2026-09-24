import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

// Casos 1 a 11 del control de sesiones por dispositivo, sobre la decision real
// que toma el sistema dentro de la transaccion de Firestore.

const almacen = new Map();
let sesiones;

before(async () => {
  globalThis.window = {
    location: { hostname: "localhost" },
    localStorage: {
      getItem: (clave) => almacen.get(clave) ?? null,
      setItem: (clave, valor) => almacen.set(clave, String(valor)),
      removeItem: (clave) => almacen.delete(clave),
    },
  };
  sesiones = await import("../src/js/services/device_sessions.js");
});

beforeEach(() => {
  almacen.clear();
});

const TABLET_A = "dev-tablet-a";
const TABLET_B = "dev-tablet-b";
const AHORA = new Date("2026-09-12T12:00:00Z").getTime();

function sesionDe(deviceId, { minutosSinActividad = 0, activa = true, sessionId = "s1" } = {}) {
  return {
    deviceId,
    sessionId,
    activa,
    lastActivity: new Date(AHORA - (minutosSinActividad * 60 * 1000)),
  };
}

function decidir(previo, deviceId, forzar = false) {
  return sesiones.decidirSesionUnica({ previo, deviceId, forzar, ahoraMs: AHORA });
}

describe("plan Gratuito: una sesion por usuario", () => {
  test("Caso 1: el primer equipo entra sin obstaculos", () => {
    assert.equal(decidir(null, TABLET_A).permitido, true);
  });

  test("Caso 2: recargar la pagina no se lee como un segundo dispositivo", () => {
    const decision = decidir(sesionDe(TABLET_A), TABLET_A);
    assert.equal(decision.permitido, true);
    assert.equal(decision.mismoDispositivo, true);
  });

  test("Caso 3: volver a entrar desde el mismo equipo conserva su sesion", () => {
    // Navegador cerrado sin salir del sistema: el registro sigue activo y es
    // del mismo equipo, asi que se refresca en lugar de abrir otro.
    const decision = decidir(sesionDe(TABLET_A, { minutosSinActividad: 3 }), TABLET_A);
    assert.equal(decision.permitido, true);
    assert.equal(decision.mismoDispositivo, true);
  });

  test("Caso 4: un segundo equipo queda bloqueado mientras el primero sigue vivo", () => {
    const decision = decidir(sesionDe(TABLET_A), TABLET_B);
    assert.equal(decision.permitido, false);
  });

  test("Caso 5: el segundo equipo entra si el usuario decide reemplazar", () => {
    const decision = decidir(sesionDe(TABLET_A), TABLET_B, true);
    assert.equal(decision.permitido, true);
    assert.equal(decision.mismoDispositivo, false);
    // El equipo anterior deja de ser el autorizado: su vigilancia lo expulsa.
    assert.equal(decision.reemplaza, true);
  });

  test("Caso 8: tras un cierre de sesion normal otro equipo entra sin aviso", () => {
    const decision = decidir(sesionDe(TABLET_A, { activa: false }), TABLET_B);
    assert.equal(decision.permitido, true);
  });

  test("Caso 9: una sesion abandonada no bloquea para siempre", () => {
    const vencida = sesionDe(TABLET_A, { minutosSinActividad: 30 });
    assert.equal(sesiones.sesionVigente(vencida, AHORA), false);
    assert.equal(decidir(vencida, TABLET_B).permitido, true);
  });

  test("una sesion reciente de otro equipo si sigue contando", () => {
    const viva = sesionDe(TABLET_A, { minutosSinActividad: 5 });
    assert.equal(sesiones.sesionVigente(viva, AHORA), true);
    assert.equal(decidir(viva, TABLET_B).permitido, false);
  });

  test("un registro sin equipo identificado nunca deja la cuenta atrapada", () => {
    assert.equal(decidir({ activa: true, lastActivity: new Date(AHORA) }, TABLET_B).permitido, true);
  });

  test("Caso 10: dos equipos a la vez, solo uno queda autorizado", () => {
    // La transaccion serializa: el segundo siempre lee lo que dejo el primero.
    const primero = decidir(null, TABLET_A);
    assert.equal(primero.permitido, true);

    const yaEscrito = sesionDe(TABLET_A, { minutosSinActividad: 0 });
    const segundo = decidir(yaEscrito, TABLET_B);
    assert.equal(segundo.permitido, false);
  });
});

describe("identificador del dispositivo", () => {
  test("se crea una sola vez y sobrevive a cerrar sesion", () => {
    const primero = sesiones.getCurrentDeviceId();
    const segundo = sesiones.getCurrentDeviceId();
    assert.equal(primero, segundo);
    assert.ok(primero.length > 8);
    assert.equal(almacen.get("cajalibre_device_id"), primero);
  });

  test("no le muestra datos tecnicos al usuario", () => {
    const etiqueta = sesiones.getCurrentDeviceLabel();
    assert.match(etiqueta, / en /);
    assert.ok(!etiqueta.includes(sesiones.getCurrentDeviceId()));
  });
});

describe("aviso para la pantalla de inicio de sesion", () => {
  test("el texto del equipo expulsado no usa terminos tecnicos", () => {
    const aviso = sesiones.AVISO_SESION_REEMPLAZADA;
    const texto = `${aviso.titulo} ${aviso.mensaje}`.toLowerCase();
    ["uid", "deviceid", "firestore", "sessionid", "token"].forEach((termino) => {
      assert.ok(!texto.includes(termino), `el aviso menciona ${termino}`);
    });
    assert.equal(aviso.mostrarPremium, true);
  });
});
