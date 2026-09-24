// ---------------------------------------------------------------------------
// Destino unico de la sesion.
//
// Este modulo responde una sola pregunta: con el estado ya resuelto de la
// sesion, ¿donde debe estar el usuario? Todas las guardias de ruta preguntan
// aqui, nunca deciden por su cuenta.
//
// Es lo que impide los bucles de navegacion: si dos componentes calculan el
// destino con la misma funcion, es imposible que uno mande a /home mientras el
// otro regresa a /configuracion-inicial.
// ---------------------------------------------------------------------------

export const RUTA_INICIO = "/home";
export const RUTA_LOGIN = "/login";

// Cada motivo bloqueante tiene exactamente una pantalla que lo resuelve.
export const RUTA_POR_MOTIVO = {
  terminos_pendientes: "/terminos",
  configuracion_inicial_pendiente: "/configuracion-inicial",
  negocio_bloqueado: "/negocio-bloqueado",
};

export const FASES_SESION = {
  CARGANDO: "cargando",
  ERROR: "error",
  LOGIN: "login",
  ONBOARDING: "onboarding",
  PERMITIDO: "permitido",
};

/**
 * Traduce el estado de la sesion a un destino unico.
 *
 * `cargando` y `error` no tienen ruta: se resuelven mostrando una pantalla en
 * el lugar, jamas navegando. Asi un estado transitorio nunca produce un salto.
 */
export function resolverRutaSesion({
  loading = true,
  uid = "",
  accesoPermitido = false,
  motivoAcceso = "",
} = {}) {
  // 1. Mientras Auth, el perfil o el negocio siguen cargando no hay destino.
  if (loading) return { fase: FASES_SESION.CARGANDO, ruta: "", motivo: motivoAcceso };

  // 2. Sin sesion de Firebase el destino es siempre el login.
  if (!String(uid || "").trim()) {
    return { fase: FASES_SESION.LOGIN, ruta: RUTA_LOGIN, motivo: motivoAcceso };
  }

  // 3. Un fallo de lectura se muestra, no se navega.
  if (motivoAcceso === "error_carga") {
    return { fase: FASES_SESION.ERROR, ruta: "", motivo: motivoAcceso };
  }

  // 4. Con acceso confirmado el destino es el sistema.
  if (accesoPermitido) {
    return { fase: FASES_SESION.PERMITIDO, ruta: RUTA_INICIO, motivo: motivoAcceso };
  }

  // 5. Motivos con pantalla propia (terminos, configuracion inicial, bloqueo).
  const ruta = RUTA_POR_MOTIVO[motivoAcceso];
  if (ruta) return { fase: FASES_SESION.ONBOARDING, ruta, motivo: motivoAcceso };

  // 6. Sin acceso y sin pantalla que lo resuelva: de vuelta al login.
  return { fase: FASES_SESION.LOGIN, ruta: RUTA_LOGIN, motivo: motivoAcceso };
}

/**
 * Rutas que una guardia declara como propias a partir de sus motivos. Se usa
 * para saber si la pantalla actual ya es el destino de la sesion.
 */
export function rutasDeMotivos(motivos = []) {
  if (!Array.isArray(motivos)) return [];
  return motivos.map((motivo) => RUTA_POR_MOTIVO[motivo]).filter(Boolean);
}

const CLAVE_TRAZA_SESION = "cajalibre_debug_sesion";

/**
 * Diagnostico de sesion. Se enciende abriendo cualquier ruta con
 * `?debugSesion=1` y se apaga con `?debugSesion=0`; la preferencia queda
 * guardada en el navegador. Es opt-in tambien en desarrollo: la traza es util
 * cuando se depura el arranque de sesion, pero dejarla siempre encendida tapa
 * el resto de la consola mientras se trabaja en cualquier otra cosa.
 */
export function trazaSesionActiva() {
  try {
    if (typeof window === "undefined") return false;

    const parametro = new URLSearchParams(window.location.search).get("debugSesion");
    if (parametro === "1") {
      window.localStorage.setItem(CLAVE_TRAZA_SESION, "1");
      return true;
    }
    if (parametro === "0") {
      window.localStorage.removeItem(CLAVE_TRAZA_SESION);
      return false;
    }

    return window.localStorage.getItem(CLAVE_TRAZA_SESION) === "1";
  } catch {
    return false;
  }
}

/**
 * Deja constancia de cada salto automatico: que guardia lo decidio, desde
 * donde, hacia donde y por que motivo.
 */
export function registrarRedireccion(origen, desde, hacia, motivo = "") {
  if (!trazaSesionActiva()) return;
  console.warn("[REDIRECT]", { origen, desde, hacia, motivo });
}
