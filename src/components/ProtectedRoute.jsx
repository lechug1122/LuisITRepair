import { Navigate, useLocation } from "react-router-dom";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import AccesoErrorPanel from "./AccesoErrorPanel";
import PageLoader from "./PageLoader";
import {
  FASES_SESION,
  registrarRedireccion,
  resolverRutaSesion,
  rutasDeMotivos,
} from "../js/services/ruta_sesion";

/**
 * Puerta unica de las rutas privadas.
 *
 * No consulta Firestore ni interpreta motivos por su cuenta: pide el destino a
 * `resolverRutaSesion` y solo compara si esta pantalla ya es ese destino. Como
 * todas las guardias usan la misma funcion, ninguna puede contradecir a otra y
 * dos rutas no pueden rebotarse entre si.
 */
export default function ProtectedRoute({ allowMotives = [], children }) {
  const location = useLocation();
  const {
    loading,
    uid,
    accesoPermitido,
    motivoAcceso,
    mensajeAcceso,
  } = useAutorizacionActual();

  const destino = resolverRutaSesion({ loading, uid, accesoPermitido, motivoAcceso });

  // 1. Mientras Auth o Firestore siguen cargando no se decide nada.
  if (destino.fase === FASES_SESION.CARGANDO) {
    return <PageLoader text="Validando acceso..." />;
  }

  // 2. Un fallo de lectura se muestra como error real; jamas redirige.
  if (destino.fase === FASES_SESION.ERROR) {
    return <AccesoErrorPanel mensaje={mensajeAcceso} />;
  }

  // 3. Con acceso confirmado se abre la pantalla solicitada.
  if (destino.fase === FASES_SESION.PERMITIDO) {
    return children;
  }

  // 4. Las pantallas de onboarding y bloqueo declaran los motivos que
  //    resuelven: si el motivo de la sesion es uno de ellos, ya estamos donde
  //    corresponde.
  if (rutasDeMotivos(allowMotives).includes(destino.ruta)) {
    return children;
  }

  // 5. Seguro final: nunca navegar hacia la ruta en la que ya estamos.
  if (!destino.ruta || destino.ruta === location.pathname) {
    return <AccesoErrorPanel titulo="Acceso no disponible" mensaje={mensajeAcceso} />;
  }

  registrarRedireccion("ProtectedRoute", location.pathname, destino.ruta, destino.motivo);

  return (
    <Navigate
      to={destino.ruta}
      replace
      state={mensajeAcceso ? { accessMessage: mensajeAcceso } : undefined}
    />
  );
}
