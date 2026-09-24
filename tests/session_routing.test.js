import assert from "node:assert/strict";
import test from "node:test";
import {
  FASES_SESION,
  RUTA_LOGIN,
  resolverRutaSesion,
  rutasDeMotivos,
} from "../src/js/services/ruta_sesion.js";

// Tabla real de rutas guardadas en App.jsx: ruta -> motivos que resuelve.
const RUTAS_PROTEGIDAS = {
  "/home": [],
  "/terminos": ["terminos_pendientes"],
  "/configuracion-inicial": ["configuracion_inicial_pendiente"],
  "/negocio-bloqueado": ["negocio_bloqueado"],
};

// Copia fiel de la decision de ProtectedRoute.
function decisionDeGuardia(ruta, sesion) {
  const destino = resolverRutaSesion(sesion);
  if (destino.fase === FASES_SESION.CARGANDO) return { accion: "cargando" };
  if (destino.fase === FASES_SESION.ERROR) return { accion: "error" };
  if (destino.fase === FASES_SESION.PERMITIDO) return { accion: "render" };
  if (rutasDeMotivos(RUTAS_PROTEGIDAS[ruta] || []).includes(destino.ruta)) {
    return { accion: "render" };
  }
  if (!destino.ruta || destino.ruta === ruta) return { accion: "error" };
  return { accion: "navegar", ruta: destino.ruta };
}

// Copia fiel de la decision del efecto de sesion en login.jsx.
function decisionDeLogin(sesion) {
  if (sesion.loading || !sesion.uid) return { accion: "formulario" };
  if (sesion.motivoAcceso === "error_carga") return { accion: "mensaje" };
  const destino = resolverRutaSesion(sesion);
  if (destino.ruta && destino.ruta !== RUTA_LOGIN) return { accion: "navegar", ruta: destino.ruta };
  return { accion: "mensaje" };
}

function recorrer(rutaInicial, sesion, pasosMaximos = 10) {
  const visitadas = [rutaInicial];
  let ruta = rutaInicial;

  for (let paso = 0; paso < pasosMaximos; paso += 1) {
    const decision = ruta === RUTA_LOGIN ? decisionDeLogin(sesion) : decisionDeGuardia(ruta, sesion);
    if (decision.accion !== "navegar") return { visitadas, final: decision.accion, ruta };
    if (visitadas.includes(decision.ruta)) {
      throw new Error(`Bucle de navegacion: ${visitadas.join(" -> ")} -> ${decision.ruta}`);
    }
    visitadas.push(decision.ruta);
    ruta = decision.ruta;
  }

  throw new Error(`Navegacion sin fin: ${visitadas.join(" -> ")}`);
}

const SESIONES = {
  duenoConAcceso: { loading: false, uid: "owner", accesoPermitido: true, motivoAcceso: "sin_control_suscripcion" },
  empleadoConAcceso: { loading: false, uid: "employee", accesoPermitido: true, motivoAcceso: "al_corriente" },
  titularSinTerminos: { loading: false, uid: "owner", accesoPermitido: false, motivoAcceso: "terminos_pendientes" },
  titularSinConfiguracion: { loading: false, uid: "owner", accesoPermitido: false, motivoAcceso: "configuracion_inicial_pendiente" },
  personalEnEspera: { loading: false, uid: "employee", accesoPermitido: false, motivoAcceso: "negocio_bloqueado" },
  usuarioInactivo: { loading: false, uid: "employee", accesoPermitido: false, motivoAcceso: "usuario_inactivo" },
  suscripcionVencida: { loading: false, uid: "owner", accesoPermitido: false, motivoAcceso: "suscripcion_bloqueada" },
  sinPerfil: { loading: false, uid: "nuevo", accesoPermitido: false, motivoAcceso: "sin_autorizacion" },
  sinNegocio: { loading: false, uid: "owner", accesoPermitido: false, motivoAcceso: "sin_negocio" },
  errorDeCarga: { loading: false, uid: "employee", accesoPermitido: false, motivoAcceso: "error_carga" },
  cargando: { loading: true, uid: "employee", accesoPermitido: false, motivoAcceso: "" },
  sinSesion: { loading: false, uid: "", accesoPermitido: false, motivoAcceso: "" },
};

const RUTAS_INICIALES = [...Object.keys(RUTAS_PROTEGIDAS), RUTA_LOGIN];

for (const [nombre, sesion] of Object.entries(SESIONES)) {
  test(`ninguna ruta entra en bucle con la sesion ${nombre}`, () => {
    RUTAS_INICIALES.forEach((ruta) => {
      const recorrido = recorrer(ruta, sesion);
      assert.ok(
        ["render", "cargando", "error", "mensaje", "formulario"].includes(recorrido.final),
        `${ruta} termino en ${recorrido.final}`,
      );
      assert.ok(recorrido.visitadas.length <= 2, `${ruta} necesito ${recorrido.visitadas.length} saltos`);
    });
  });
}

test("cada sesion tiene un unico destino", () => {
  assert.equal(resolverRutaSesion(SESIONES.duenoConAcceso).ruta, "/home");
  assert.equal(resolverRutaSesion(SESIONES.empleadoConAcceso).ruta, "/home");
  assert.equal(resolverRutaSesion(SESIONES.titularSinTerminos).ruta, "/terminos");
  assert.equal(resolverRutaSesion(SESIONES.titularSinConfiguracion).ruta, "/configuracion-inicial");
  assert.equal(resolverRutaSesion(SESIONES.personalEnEspera).ruta, "/negocio-bloqueado");
  assert.equal(resolverRutaSesion(SESIONES.usuarioInactivo).ruta, RUTA_LOGIN);
});

test("cargando y error nunca producen una navegacion", () => {
  assert.equal(resolverRutaSesion(SESIONES.cargando).ruta, "");
  assert.equal(resolverRutaSesion(SESIONES.cargando).fase, FASES_SESION.CARGANDO);
  assert.equal(resolverRutaSesion(SESIONES.errorDeCarga).ruta, "");
  assert.equal(resolverRutaSesion(SESIONES.errorDeCarga).fase, FASES_SESION.ERROR);
});

test("el personal en espera ve su pantalla, no el asistente del titular", () => {
  const decision = decisionDeGuardia("/negocio-bloqueado", SESIONES.personalEnEspera);
  assert.equal(decision.accion, "render");

  // El caso que provocaba el bucle: /home mandaba al asistente y el asistente
  // regresaba a /home. Ahora el destino del personal nunca es el asistente.
  assert.notEqual(resolverRutaSesion(SESIONES.personalEnEspera).ruta, "/configuracion-inicial");
});

test("una sesion sin pantalla que la resuelva se detiene en el login", () => {
  const recorrido = recorrer("/home", SESIONES.suscripcionVencida);
  assert.deepEqual(recorrido.visitadas, ["/home", RUTA_LOGIN]);
  assert.equal(recorrido.final, "mensaje");
});
