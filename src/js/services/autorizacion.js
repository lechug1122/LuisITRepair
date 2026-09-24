import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../../initializer/firebase.js";
import { ANALYTICS_ALLOWED_EMAIL } from "./analytics_access";
import { normalizeNegocio, obtenerNegocio } from "./negocios";
import { resolverAccesoSuscripcion } from "./suscripciones";

/**
 * Superadministracion del sistema. Se decide por el correo autenticado, igual
 * que en Firestore Rules y que en el listener en tiempo real. Si esta lectura
 * puntual usara el campo del documento, ambos resolutores podrian contradecirse
 * y rebotar al usuario entre /login y /home.
 */
function esAdministradorDelSistema(uid = "") {
  const actual = auth?.currentUser || null;
  if (!actual || String(actual.uid || "") !== String(uid || "")) return false;
  return String(actual.email || "").trim().toLowerCase() === ANALYTICS_ALLOWED_EMAIL;
}

export function normalizeAutorizadoData(raw = {}, uid = "") {
  const safeUid = String(uid || "").trim();
  const cuentaPrincipalUid = String(raw?.cuentaPrincipalUid || safeUid).trim();
  const negocioId = String(raw?.negocioId || cuentaPrincipalUid || safeUid).trim();

  return {
    ...raw,
    activo: raw?.activo !== false,
    superAdmin: raw?.superAdmin === true,
    accesoAnalitica: raw?.accesoAnalitica === true,
    suscripcionControlada: raw?.suscripcionControlada === true,
    esCuentaPrincipal: raw?.esCuentaPrincipal === true || cuentaPrincipalUid === safeUid,
    cuentaPrincipalUid,
    negocioId,
    setupCompleto: raw?.setupCompleto === true,
    terminosAceptados: raw?.terminosAceptados === true,
    terminosVersion: String(raw?.terminosVersion || "").trim(),
  };
}

/**
 * Lee el negocio tolerando un fallo de transporte. En produccion el SDK
 * negocia el canal (long polling automatico) y la primera lectura puede
 * fallar por red; un error asi no debe convertirse en "usuario sin negocio".
 * Un rechazo por permisos no se reintenta: no va a cambiar.
 */
async function leerNegocioConReintento(negocioId, intentos = 2) {
  let ultimoError = null;

  for (let intento = 0; intento < intentos; intento += 1) {
    try {
      return { negocio: await obtenerNegocio(negocioId), error: null };
    } catch (error) {
      ultimoError = error;
      const code = String(error?.code || "").toLowerCase();
      if (code.includes("permission-denied")) break;
      if (intento < intentos - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  }

  return { negocio: null, error: ultimoError };
}

/**
 * Lectura puntual del estado de acceso. Comparte la misma decision central que
 * el listener en tiempo real (`useAutorizacionActual`): aqui solo se consulta
 * Firestore y se le entregan a `resolverAccesoSuscripcion` los estados
 * explicitos de existencia y de error.
 *
 * Regla invariable: un error de Firestore nunca se traduce a "usuario sin
 * negocio"; se devuelve como motivo `error_carga`.
 */
export async function obtenerEstadoAutorizacion(uid) {
  const safeUid = String(uid || "").trim();

  if (!safeUid) {
    return {
      ...resolverAccesoSuscripcion({ uid: "" }),
      autorizado: null,
      negocio: null,
    };
  }

  let snap = null;
  try {
    snap = await getDoc(doc(db, "autorizados", safeUid));
  } catch (error) {
    console.error("[autorizacion] No se pudo leer el perfil del usuario:", error?.code || error);
    return {
      ...resolverAccesoSuscripcion({ uid: safeUid, perfilError: error }),
      autorizado: null,
      negocio: null,
    };
  }

  if (!snap.exists()) {
    return {
      ...resolverAccesoSuscripcion({ uid: safeUid, perfilExiste: false }),
      autorizado: null,
      negocio: null,
    };
  }

  const sistemaAdmin = esAdministradorDelSistema(safeUid);
  const autorizado = {
    ...normalizeAutorizadoData(snap.data() || {}, safeUid),
    superAdmin: sistemaAdmin,
    accesoAnalitica: sistemaAdmin,
  };
  const cuentaPrincipalUid = autorizado.cuentaPrincipalUid;
  const negocioId = autorizado.negocioId || cuentaPrincipalUid;
  let suscripcion = null;
  let negocio = null;
  let negocioError = null;

  if (!autorizado.superAdmin) {
    const lectura = await leerNegocioConReintento(negocioId);
    negocio = lectura.negocio;
    negocioError = lectura.error;
    if (negocioError) {
      console.error("[autorizacion] No se pudo leer el negocio:", negocioError?.code || negocioError);
    }
  }

  if (autorizado.suscripcionControlada && !autorizado.superAdmin) {
    try {
      const suscripcionSnap = await getDoc(doc(db, "suscripciones", cuentaPrincipalUid));
      if (suscripcionSnap.exists()) {
        suscripcion = suscripcionSnap.data() || null;
      }
    } catch (error) {
      // La suscripcion no define la pertenencia al negocio: se registra el
      // fallo y el acceso se resuelve como si aun no estuviera configurada.
      console.warn("[autorizacion] No se pudo leer la suscripcion:", error?.code || error);
    }
  }

  const acceso = resolverAccesoSuscripcion({
    uid: safeUid,
    autorizado,
    suscripcion,
    negocio: negocio ? normalizeNegocio(negocio, negocioId) : null,
    perfilExiste: true,
    negocioError,
  });

  return {
    ...acceso,
    autorizado,
    negocio,
  };
}

/**
 * Busca a que negocio pertenece un usuario cuando su documento de
 * `autorizados` no existe. Sirve para no crear un negocio duplicado a alguien
 * que en realidad ya fue dado de alta como personal de otro negocio.
 *
 * Orden de busqueda:
 *   1. `negocios/{uid}`: titular cuyo registro quedo incompleto.
 *   2. Ficha de empleado (`negocios/{negocioId}/empleados`) con su uid.
 */
export async function buscarMembresiaDeUsuario(uid) {
  const safeUid = String(uid || "").trim();
  const resultado = {
    uid: safeUid,
    negocioId: "",
    rol: "",
    esTitular: false,
    origen: "",
    error: null,
  };

  if (!safeUid) return resultado;

  try {
    const propio = await getDoc(doc(db, "negocios", safeUid));
    if (propio.exists()) {
      return {
        ...resultado,
        negocioId: safeUid,
        esTitular: true,
        origen: "negocio_propio",
      };
    }
  } catch (error) {
    console.error("[autorizacion] No se pudo revisar el negocio propio:", error?.code || error);
    resultado.error = error;
  }

  try {
    const fichas = await getDocs(
      query(collectionGroup(db, "empleados"), where("uid", "==", safeUid), limit(5)),
    );
    const ficha = fichas.docs.find((item) => {
      const data = item.data() || {};
      return Boolean(
        String(data?.negocioId || data?.cuentaPrincipalUid || item.ref.parent.parent?.id || "").trim(),
      );
    });

    if (ficha) {
      const data = ficha.data() || {};
      const negocioIdFicha = String(
        data?.negocioId || data?.cuentaPrincipalUid || ficha.ref.parent.parent?.id || "",
      ).trim();

      return {
        ...resultado,
        negocioId: negocioIdFicha,
        rol: String(data?.rol || "").trim(),
        // Solo es titular si la ficha apunta a su propio negocio; cualquier
        // otra combinacion se trata como personal de un negocio ajeno.
        esTitular: data?.esCuentaPrincipal === true && negocioIdFicha === safeUid,
        origen: "empleado",
      };
    }
  } catch (error) {
    // Sin indice o sin permisos no se puede confirmar la membresia: se reporta
    // para que quien llama decida, nunca se asume "usuario nuevo".
    console.error("[autorizacion] No se pudo revisar la ficha de empleado:", error?.code || error);
    resultado.error = error;
  }

  return resultado;
}

export async function esUsuarioAutorizado(uid) {
  const estado = await obtenerEstadoAutorizacion(uid);
  return estado.permitido;
}
