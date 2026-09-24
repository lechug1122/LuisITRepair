import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Avisos breves del modulo de Servicios.
//
// El `global-toast` del layout es para los avisos que manda CajaLibre a todos
// los negocios; no sirve para decir "Estado actualizado" despues de un clic.
// Esto es lo otro: efimero, local a la pantalla y sin proveedor global, para
// no obligar a `App.jsx` a montar nada nuevo.
//
// Reemplaza a `alert()`, que bloquea el navegador, no se puede leer con
// lector de pantalla como cambio de estado y en movil tapa la pantalla
// completa.
// ---------------------------------------------------------------------------

const DURACION_POR_TIPO = {
  exito: 3200,
  info: 3200,
  // Un error se lee mas despacio y suele venir con instrucciones.
  error: 6000,
};

export default function useToasts() {
  const [toasts, setToasts] = useState([]);
  const temporizadores = useRef(new Map());
  const contador = useRef(0);

  const descartar = useCallback((id) => {
    setToasts((actuales) => actuales.filter((item) => item.id !== id));
    const temporizador = temporizadores.current.get(id);
    if (temporizador) {
      window.clearTimeout(temporizador);
      temporizadores.current.delete(id);
    }
  }, []);

  const avisar = useCallback((mensaje, tipo = "exito", opciones = {}) => {
    const texto = String(mensaje || "").trim();
    if (!texto) return "";

    contador.current += 1;
    const id = `toast-${contador.current}`;
    const duracion = Number(opciones?.duracion) || DURACION_POR_TIPO[tipo] || DURACION_POR_TIPO.info;

    setToasts((actuales) => [
      // Tres a la vez es el limite util: mas que eso ya nadie los lee y tapan
      // la interfaz justo cuando la persona quiere seguir trabajando.
      ...actuales.slice(-2),
      { id, mensaje: texto, tipo, detalle: String(opciones?.detalle || "").trim() },
    ]);

    temporizadores.current.set(id, window.setTimeout(() => descartar(id), duracion));
    return id;
  }, [descartar]);

  useEffect(() => {
    const pendientes = temporizadores.current;
    return () => {
      pendientes.forEach((temporizador) => window.clearTimeout(temporizador));
      pendientes.clear();
    };
  }, []);

  return {
    toasts,
    descartar,
    avisar,
    exito: useCallback((mensaje, opciones) => avisar(mensaje, "exito", opciones), [avisar]),
    info: useCallback((mensaje, opciones) => avisar(mensaje, "info", opciones), [avisar]),
    error: useCallback((mensaje, opciones) => avisar(mensaje, "error", opciones), [avisar]),
  };
}
