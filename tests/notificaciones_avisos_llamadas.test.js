import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

// Cuantas veces se llama de verdad a `listarNotificacionesNegocio`.
//
// El callable viaja por `fetch`, asi que contar peticiones a su URL es contar
// invocaciones de la Cloud Function. La regresion que vigila este archivo es la
// que provocaba ~589 llamadas al dia: una escucha que consultaba cada 60
// segundos y volvia a consultar cada vez que se recreaba.

const URL_FUNCION = "listarNotificacionesNegocio";

const almacen = new Map();
let llamadas = 0;
let respuesta = [];
// Temporizadores y oyentes capturados, para dispararlos sin esperar minutos.
let intervalos = [];
let oyentesVisibilidad = [];
let avisos;

before(async () => {
  globalThis.window = {
    location: { hostname: "cajalibre.com.mx" },
    localStorage: {
      getItem: (clave) => almacen.get(clave) ?? null,
      setItem: (clave, valor) => almacen.set(clave, String(valor)),
      removeItem: (clave) => almacen.delete(clave),
    },
    setInterval: (fn) => {
      intervalos.push(fn);
      return intervalos.length;
    },
    clearInterval: (id) => {
      if (id) intervalos[id - 1] = null;
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };

  globalThis.document = {
    visibilityState: "visible",
    addEventListener: (evento, fn) => {
      if (evento === "visibilitychange") oyentesVisibilidad.push(fn);
    },
    removeEventListener: (evento, fn) => {
      if (evento !== "visibilitychange") return;
      oyentesVisibilidad = oyentesVisibilidad.filter((item) => item !== fn);
    },
  };

  globalThis.fetch = async (url) => {
    if (String(url).includes(URL_FUNCION)) llamadas += 1;
    return {
      status: 200,
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ result: respuesta }),
      text: async () => JSON.stringify({ result: respuesta }),
    };
  };

  avisos = await import("../src/js/services/notificaciones_globales.js");
});

beforeEach(() => {
  llamadas = 0;
  respuesta = [];
  intervalos = [];
  oyentesVisibilidad = [];
  almacen.clear();
});

// Deja correr las promesas del callable.
const asentar = () => new Promise((resolve) => setTimeout(resolve, 60));

// Cada prueba usa su propio negocio: el canal y su copia viven en el modulo.
let contadorNegocios = 0;
const negocioNuevo = () => `neg-${(contadorNegocios += 1)}`;

describe("llamadas a listarNotificacionesNegocio", () => {
  test("una escucha consulta una sola vez", async () => {
    const detener = avisos.escucharNotificacionesDelNegocio(
      { negocioId: negocioNuevo(), premiumState: "free" },
      () => {},
    );
    await asentar();
    assert.equal(llamadas, 1);
    detener();
  });

  test("varias escuchas del mismo negocio comparten una sola consulta", async () => {
    const negocioId = negocioNuevo();
    const parar = [1, 2, 3].map(() => avisos.escucharNotificacionesDelNegocio(
      { negocioId, premiumState: "free" },
      () => {},
    ));
    await asentar();

    // Antes eran tres llamadas simultaneas; ahora comparten la misma promesa.
    assert.equal(llamadas, 1);
    parar.forEach((fn) => fn());
  });

  test("reabrir la escucha no vuelve a consultar dentro de la ventana de cache", async () => {
    const negocioId = negocioNuevo();

    // Esto es el churn real: premiumState pasa por "loading" y el efecto se
    // vuelve a montar. Antes cada vuelta costaba una llamada.
    for (let vuelta = 0; vuelta < 5; vuelta += 1) {
      const detener = avisos.escucharNotificacionesDelNegocio(
        { negocioId, premiumState: "free" },
        () => {},
      );
      await asentar();
      detener();
    }

    assert.equal(llamadas, 1);
  });

  test("la copia guardada evita consultar al recargar la pagina", async () => {
    const negocioId = negocioNuevo();
    const detener = avisos.escucharNotificacionesDelNegocio(
      { negocioId, premiumState: "free" },
      () => {},
    );
    await asentar();
    detener();
    assert.equal(llamadas, 1);

    // Una recarga pierde la memoria del modulo pero conserva localStorage. Se
    // simula pidiendo una instancia nueva del modulo.
    const recargado = await import("../src/js/services/notificaciones_globales.js?recarga=1");
    const detener2 = recargado.escucharNotificacionesDelNegocio(
      { negocioId, premiumState: "free" },
      () => {},
    );
    await asentar();

    assert.equal(llamadas, 1, "la copia del navegador debe evitar la consulta");
    detener2();
  });

  test("con la pestana oculta el respaldo no consulta", async () => {
    const detener = avisos.escucharNotificacionesDelNegocio(
      { negocioId: negocioNuevo(), premiumState: "free" },
      () => {},
    );
    await asentar();
    assert.equal(llamadas, 1);

    globalThis.document.visibilityState = "hidden";
    intervalos.filter(Boolean).forEach((fn) => fn());
    await asentar();

    assert.equal(llamadas, 1, "en segundo plano no debe salir ninguna consulta");
    globalThis.document.visibilityState = "visible";
    detener();
  });

  test("volver a la pestana no consulta si la copia sigue fresca", async () => {
    const detener = avisos.escucharNotificacionesDelNegocio(
      { negocioId: negocioNuevo(), premiumState: "free" },
      () => {},
    );
    await asentar();

    globalThis.document.visibilityState = "visible";
    oyentesVisibilidad.forEach((fn) => fn());
    await asentar();

    assert.equal(llamadas, 1);
    detener();
  });

  test("abrir el panel fuerza una lectura aunque la copia sea reciente", async () => {
    const negocioId = negocioNuevo();
    const detener = avisos.escucharNotificacionesDelNegocio(
      { negocioId, premiumState: "free" },
      () => {},
    );
    await asentar();
    assert.equal(llamadas, 1);

    await avisos.refrescarNotificacionesDelNegocio({ negocioId, premiumState: "free" });
    await asentar();

    assert.equal(llamadas, 2, "el refresco manual debe saltarse la copia");
    detener();
  });

  test("sin nadie escuchando, un refresco no dispara consultas", async () => {
    const negocioId = negocioNuevo();
    await avisos.refrescarNotificacionesDelNegocio({ negocioId, premiumState: "free" });
    await asentar();
    assert.equal(llamadas, 0);
  });

  test("al soltar la ultima escucha se limpian temporizador y oyente", async () => {
    const detener = avisos.escucharNotificacionesDelNegocio(
      { negocioId: negocioNuevo(), premiumState: "free" },
      () => {},
    );
    await asentar();
    assert.equal(oyentesVisibilidad.length, 1);

    detener();

    assert.equal(oyentesVisibilidad.length, 0, "el oyente debe retirarse");
    assert.equal(intervalos.filter(Boolean).length, 0, "el intervalo debe pararse");
  });

  test("un negocio premium y uno free no comparten copia", async () => {
    const negocioId = negocioNuevo();
    const a = avisos.escucharNotificacionesDelNegocio(
      { negocioId, premiumState: "free" },
      () => {},
    );
    await asentar();
    const b = avisos.escucharNotificacionesDelNegocio(
      { negocioId, premiumState: "premium" },
      () => {},
    );
    await asentar();

    // La audiencia cambia con el plan: son dos consultas distintas.
    assert.equal(llamadas, 2);
    a();
    b();
  });
});

describe("lo que se entrega sigue siendo lo mismo", () => {
  test("descarta los avisos vencidos y ordena del mas nuevo al mas viejo", async () => {
    const ahora = Date.now();
    respuesta = [
      { id: "viejo", titulo: "Viejo", audiencia: ["todos"], activo: true, createdAt: ahora - 90000 },
      { id: "vencido", titulo: "Vencido", audiencia: ["todos"], activo: true, createdAt: ahora, expiresAt: ahora - 1000 },
      { id: "nuevo", titulo: "Nuevo", audiencia: ["todos"], activo: true, createdAt: ahora - 1000 },
      { id: "apagado", titulo: "Apagado", audiencia: ["todos"], activo: false, createdAt: ahora },
      { id: "programado", titulo: "Programado", audiencia: ["todos"], activo: true, createdAt: ahora, publicarAt: ahora + 600000 },
    ];

    let recibidos = null;
    const detener = avisos.escucharNotificacionesDelNegocio(
      { negocioId: negocioNuevo(), premiumState: "free" },
      (lista) => { recibidos = lista; },
    );
    await asentar();

    assert.deepEqual(recibidos.map((item) => item.id), ["nuevo", "viejo"]);
    detener();
  });

  test("una escucha que llega tarde recibe la copia de inmediato", async () => {
    const negocioId = negocioNuevo();
    respuesta = [
      { id: "a", titulo: "A", audiencia: ["todos"], activo: true, createdAt: Date.now() },
    ];

    const primera = avisos.escucharNotificacionesDelNegocio({ negocioId, premiumState: "free" }, () => {});
    await asentar();

    let entregaInmediata = null;
    const segunda = avisos.escucharNotificacionesDelNegocio(
      { negocioId, premiumState: "free" },
      (lista) => { if (entregaInmediata === null) entregaInmediata = lista; },
    );

    // Sin esperar nada: la lista ya estaba resuelta.
    assert.equal(entregaInmediata?.length, 1);
    assert.equal(llamadas, 1);
    primera();
    segunda();
  });
});
