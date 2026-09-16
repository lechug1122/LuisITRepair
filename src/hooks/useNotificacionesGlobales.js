import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  escucharEstadoNotificaciones,
  escucharNotificacionesDelNegocio,
  marcarAvisoPresentado,
  marcarNotificacionesLeidas,
  refrescarNotificacionesDelNegocio,
} from "../js/services/notificaciones_globales";

/**
 * Avisos de CajaLibre para este negocio.
 *
 * Dos escuchas y nada mas: los avisos que le tocan al negocio y el estado de
 * lectura de ESTA persona. Se combinan aqui para que la campana reciba una
 * sola lista ya resuelta.
 *
 * Un fallo de Firestore deja la lista vacia: un aviso que no se pudo leer no
 * debe romper la pantalla de nadie.
 *
 * La consulta de avisos no se repite sola cada minuto: el servicio reparte una
 * copia reciente y `refrescar` fuerza una lectura cuando de verdad hace falta
 * (al abrir el panel, por ejemplo).
 */
export default function useNotificacionesGlobales({
  negocioId = "",
  uid = "",
  premiumState = "loading",
  activo = true,
} = {}) {
  const [avisos, setAvisos] = useState([]);
  const [estado, setEstado] = useState({ leidas: [], avisadas: [] });
  const estadoRef = useRef(estado);

  const habilitado = activo
    && Boolean(negocioId)
    && Boolean(uid)
    && (premiumState === "free" || premiumState === "premium");

  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  // Sin negocio o sin plan confirmado no se abre ninguna escucha. Las listas
  // que se exponen ya salen vacias en ese caso, asi que no hace falta limpiar
  // el estado a mano.
  useEffect(() => {
    if (!habilitado) return undefined;

    const detener = escucharNotificacionesDelNegocio(
      { negocioId, premiumState },
      (items) => setAvisos(items),
      (error) => {
        console.warn("[avisos] No se pudieron leer los avisos:", error?.code || error);
        setAvisos([]);
      },
    );

    return () => detener?.();
  }, [habilitado, negocioId, premiumState]);

  useEffect(() => {
    if (!habilitado) return undefined;

    const detener = escucharEstadoNotificaciones(
      { negocioId, uid },
      (valor) => setEstado(valor),
      (error) => console.warn("[avisos] No se pudo leer el estado:", error?.code || error),
    );

    return () => detener?.();
  }, [habilitado, negocioId, uid]);

  const lista = useMemo(() => {
    if (!habilitado) return [];
    const leidas = new Set(estado.leidas);
    return avisos.map((aviso) => ({ ...aviso, leida: leidas.has(aviso.id) }));
  }, [avisos, estado.leidas, habilitado]);

  const sinLeer = useMemo(() => lista.filter((item) => !item.leida).length, [lista]);

  // Aviso importante que esta persona todavia no ha visto. Se muestra como
  // banner una sola vez: no vuelve a aparecer al cambiar de pantalla.
  const avisoImportante = useMemo(() => {
    const avisadas = new Set(estado.avisadas);
    return lista.find((item) => item.prioridad === "importante" && !avisadas.has(item.id)) || null;
  }, [lista, estado.avisadas]);

  // Lectura bajo demanda. Se salta la copia reciente a proposito: quien abre
  // el panel esta pidiendo ver lo ultimo.
  const refrescar = useCallback((forzar = true) => {
    if (!habilitado) return;
    refrescarNotificacionesDelNegocio({ negocioId, premiumState }, forzar);
  }, [habilitado, negocioId, premiumState]);

  const marcarLeida = useCallback((id) => {
    if (!habilitado || !id) return;
    const actuales = new Set(estadoRef.current.leidas);
    if (actuales.has(id)) return;
    actuales.add(id);
    marcarNotificacionesLeidas({ negocioId, uid, leidas: [...actuales] }).catch(() => {});
  }, [habilitado, negocioId, uid]);

  const marcarTodasLeidas = useCallback(() => {
    if (!habilitado) return;
    const todas = new Set([...estadoRef.current.leidas, ...avisos.map((item) => item.id)]);
    marcarNotificacionesLeidas({ negocioId, uid, leidas: [...todas] }).catch(() => {});
  }, [avisos, habilitado, negocioId, uid]);

  const descartarAvisoImportante = useCallback(() => {
    if (!habilitado || !avisoImportante) return;
    const vistas = new Set([...estadoRef.current.avisadas, avisoImportante.id]);
    marcarAvisoPresentado({ negocioId, uid, avisadas: [...vistas] }).catch(() => {});
  }, [avisoImportante, habilitado, negocioId, uid]);

  return useMemo(() => ({
    avisos: lista,
    sinLeer,
    avisoImportante,
    refrescar,
    marcarLeida,
    marcarTodasLeidas,
    descartarAvisoImportante,
  }), [
    avisoImportante,
    descartarAvisoImportante,
    lista,
    marcarLeida,
    marcarTodasLeidas,
    refrescar,
    sinLeer,
  ]);
}
