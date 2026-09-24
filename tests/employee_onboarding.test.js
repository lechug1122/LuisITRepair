import assert from "node:assert/strict";
import test from "node:test";
import {
  mensajeDeErrorAcceso,
  resolverAccesoSuscripcion,
} from "../src/js/services/suscripciones.js";

const negocio = { terminosAceptados: true, setupCompleto: true, estado: "gratuito" };
const empleado = { cuentaPrincipalUid: "owner", negocioId: "owner", esCuentaPrincipal: false };
const resolve = (autorizado = empleado, business = negocio, uid = "employee") =>
  resolverAccesoSuscripcion({ uid, autorizado, negocio: business });

for (const rol of ["trabajador", "mesero", "cajero", "admin"]) {
  test(`${rol} entra con el onboarding completado por el titular`, () => {
    assert.equal(resolve({ ...empleado, rol }).permitido, true);
    assert.equal(resolve({ ...empleado, rol, terminosAceptados: false, setupCompleto: false }).permitido, true);
  });
}

for (const field of ["terminosAceptados", "setupCompleto"]) {
  test(`personal espera al titular cuando falta ${field}`, () => {
    const result = resolve(empleado, { ...negocio, [field]: false });
    assert.equal(result.permitido, false);
    assert.equal(result.motivo, "negocio_bloqueado");
    assert.match(result.mensaje, /titular/);
  });
}

test("el titular conserva su flujo de registro", () => {
  // El avance lo marca el documento del negocio, que es lo que escriben
  // Terminos y la configuracion inicial.
  const negocioNuevo = { terminosAceptados: false, setupCompleto: false, estado: "pendiente" };
  assert.equal(resolve(empleado, negocioNuevo, "owner").motivo, "terminos_pendientes");
  assert.equal(
    resolve(empleado, { ...negocioNuevo, terminosAceptados: true }, "owner").motivo,
    "configuracion_inicial_pendiente",
  );
  assert.equal(resolve(empleado, negocio, "owner").permitido, true);
});

test("el titular entra aunque falten sus marcas personales", () => {
  // Caso real de produccion: negocios/{id} completo, pero autorizados/{uid} sin
  // setupCompleto. Antes el dueno quedaba atrapado en "Preparemos tu negocio".
  const resultado = resolve(
    { ...empleado, terminosAceptados: false, setupCompleto: false },
    negocio,
    "owner",
  );
  assert.equal(resultado.permitido, true);
  assert.equal(resultado.esTitular, true);
  assert.equal(resultado.perteneceANegocio, true);
});

test("el personal inactivo y los negocios suspendidos siguen bloqueados", () => {
  assert.equal(resolve({ ...empleado, activo: false }).motivo, "usuario_inactivo");
  assert.equal(resolve(empleado, { ...negocio, estado: "suspendido" }).motivo, "negocio_bloqueado");
});

test("el personal con negocio configurado queda marcado como miembro", () => {
  const result = resolve({ ...empleado, rol: "Cajero" });
  assert.equal(result.perteneceANegocio, true);
  assert.equal(result.requiereCrearNegocio, false);
  assert.equal(result.negocioId, "owner");
  assert.equal(result.esTitular, false);
  assert.equal(result.rol, "Cajero");
});

test("solo un usuario sin perfil pide crear negocio", () => {
  const nuevo = resolverAccesoSuscripcion({ uid: "nuevo", perfilExiste: false });
  assert.equal(nuevo.motivo, "sin_autorizacion");
  assert.equal(nuevo.requiereCrearNegocio, true);
  assert.equal(nuevo.perteneceANegocio, false);
  assert.equal(nuevo.esError, false);
  assert.equal(nuevo.negocioId, "");
  assert.equal(nuevo.esTitular, false);
});

test("un error de lectura del perfil nunca se convierte en usuario nuevo", () => {
  const error = { code: "permission-denied", message: "Missing or insufficient permissions" };
  const result = resolverAccesoSuscripcion({ uid: "employee", perfilError: error });
  assert.equal(result.motivo, "error_carga");
  assert.equal(result.esError, true);
  assert.equal(result.requiereCrearNegocio, false);
  assert.equal(result.permitido, false);
});

test("un error al leer el negocio nunca manda al onboarding", () => {
  const error = { code: "unavailable", message: "Backend unreachable" };

  for (const uid of ["employee", "owner"]) {
    const result = resolverAccesoSuscripcion({
      uid,
      autorizado: { ...empleado, terminosAceptados: false, setupCompleto: false },
      negocio: null,
      negocioError: error,
    });
    assert.equal(result.motivo, "error_carga");
    assert.equal(result.esError, true);
    assert.equal(result.requiereCrearNegocio, false);
  }
});

test("un negocio inexistente distingue titular de personal", () => {
  const titular = resolverAccesoSuscripcion({ uid: "owner", autorizado: empleado, negocio: null });
  assert.equal(titular.motivo, "sin_negocio");
  assert.equal(titular.requiereCrearNegocio, true);

  const personal = resolverAccesoSuscripcion({ uid: "employee", autorizado: empleado, negocio: null });
  assert.equal(personal.motivo, "negocio_bloqueado");
  assert.equal(personal.requiereCrearNegocio, false);
  assert.equal(personal.perteneceANegocio, false);
});

test("los errores de Firestore se traducen sin perder la causa", () => {
  assert.match(
    mensajeDeErrorAcceso({ code: "permission-denied" }),
    /permisos insuficientes/i,
  );
  assert.match(mensajeDeErrorAcceso({ code: "unavailable" }), /conexion/i);
  assert.equal(mensajeDeErrorAcceso({ message: "Falla rara" }), "Falla rara");
});
