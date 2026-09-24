import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers";
import { observeServiceTracking } from "../src/js/services/service_tracking_live.js";
import { getServiceTrackingState, getServiceTrackingSteps } from "../src/js/utils/service_tracking_status.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(lookup) {
  const documentTarget = Object.assign(new EventTarget(), { hidden: false });
  const windowTarget = new EventTarget();
  const timers = new Map();
  const data = [];
  const errors = [];
  let nextId = 0;
  const stop = observeServiceTracking({
    folio: "del14092601", lookup, documentTarget, windowTarget,
    onData: (value) => data.push(value), onError: (error) => errors.push(error),
    setTimer: (callback, ms) => { assert.equal(ms, 15000); timers.set(++nextId, callback); return nextId; },
    clearTimer: (id) => timers.delete(id),
  });
  async function tick() {
    const [id, callback] = [...timers][0];
    timers.delete(id);
    await callback();
  }
  return { documentTarget, windowTarget, timers, data, errors, stop, tick };
}

test("los estados del detalle avanzan por las seis etapas del rastreador", () => {
  const values = ["pendiente", "revision", "espera_refaccion", "reparacion", "listo", "entregado"];
  values.forEach((value, step) => {
    assert.equal(getServiceTrackingState(value).step, step);
    assert.equal(getServiceTrackingSteps(value).length, 6);
  });
  assert.equal(getServiceTrackingState("En espera de refacción").step, 2);
  assert.equal(getServiceTrackingState("en_revision").step, 1);
  assert.deepEqual(getServiceTrackingState("reparacion"), getServiceTrackingState("en_reparacion"));
  assert.equal(getServiceTrackingState("finalizado").step, 4);
  assert.equal(getServiceTrackingState("abandonado").step, 5);
  assert.equal(getServiceTrackingSteps("cancelado")[4].title, "Cancelado");
});

test("el rastreador recibe los cambios guardados sin recargar la página", async () => {
  let status = "revision";
  const tracker = setup(async (folio) => ({ folio, status }));
  try {
    await flush();
    status = "espera_refaccion";
    await tracker.tick();
    status = "reparacion";
    await tracker.tick();
    assert.deepEqual(tracker.data.map((value) => getServiceTrackingState(value.status).step), [1, 2, 3]);
    assert.equal(tracker.timers.size, 1);
  } finally { tracker.stop(); }
});

test("pausa las consultas en segundo plano y actualiza al volver a la pestaña", async () => {
  let calls = 0;
  const tracker = setup(async () => ({ status: "revision", calls: ++calls }));
  try {
    await flush();
    tracker.documentTarget.hidden = true;
    tracker.documentTarget.dispatchEvent(new Event("visibilitychange"));
    tracker.windowTarget.dispatchEvent(new Event("focus"));
    await flush();
    assert.equal(calls, 1);
    assert.equal(tracker.timers.size, 0);
    tracker.documentTarget.hidden = false;
    tracker.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flush();
    assert.equal(calls, 2);
    assert.equal(tracker.timers.size, 1);
  } finally { tracker.stop(); }
});

test("no solapa consultas al recuperar el foco durante una petición pendiente", async () => {
  let resolve;
  let calls = 0;
  const tracker = setup(() => { calls++; return new Promise((callback) => { resolve = callback; }); });
  try {
    tracker.windowTarget.dispatchEvent(new Event("focus"));
    tracker.documentTarget.dispatchEvent(new Event("visibilitychange"));
    assert.equal(calls, 1);
    resolve({ status: "revision" });
    await flush();
    assert.equal(tracker.data.length, 1);
    assert.equal(tracker.timers.size, 1);
  } finally { tracker.stop(); }
});

test("reintenta un error transitorio y recibe el estado siguiente", async () => {
  let calls = 0;
  const tracker = setup(async () => {
    if (++calls === 2) throw new Error("Sin conexión");
    return { status: calls === 1 ? "revision" : "reparacion" };
  });
  try {
    await flush();
    await tracker.tick();
    assert.equal(tracker.errors.length, 1);
    assert.equal(tracker.data.at(-1).status, "revision");
    await tracker.tick();
    assert.equal(tracker.data.at(-1).status, "reparacion");
  } finally { tracker.stop(); }
});

test("ignora respuestas pendientes y retira los eventos al cerrar el rastreador", async () => {
  let resolve;
  let calls = 0;
  const tracker = setup(() => { calls++; return new Promise((callback) => { resolve = callback; }); });
  tracker.stop();
  resolve({ status: "entregado" });
  await flush();
  tracker.windowTarget.dispatchEvent(new Event("focus"));
  tracker.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 1);
  assert.equal(tracker.data.length, 0);
  assert.equal(tracker.timers.size, 0);
});
