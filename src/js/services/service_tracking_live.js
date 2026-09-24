// Renueva la consulta pública mientras la página está visible. Nunca solapa
// peticiones ni entrega respuestas después de cerrar/cambiar el rastreador.
export function observeServiceTracking({
  folio, lookup, onData, onError, intervalMs = 15000,
  documentTarget = globalThis.document, windowTarget = globalThis.window,
  setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout,
}) {
  let stopped = false;
  let running = false;
  let timer;
  const clear = () => { if (timer !== undefined) clearTimer(timer); timer = undefined; };
  async function refresh() {
    if (stopped || running || documentTarget?.hidden) return;
    clear();
    running = true;
    try {
      const data = await lookup(folio);
      if (!stopped) onData(data);
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      running = false;
      if (!stopped && !documentTarget?.hidden) timer = setTimer(refresh, intervalMs);
    }
  }
  function visibilityChanged() {
    clear();
    if (!documentTarget?.hidden) void refresh();
  }
  documentTarget?.addEventListener("visibilitychange", visibilityChanged);
  windowTarget?.addEventListener("focus", refresh);
  void refresh();
  return () => {
    stopped = true;
    clear();
    documentTarget?.removeEventListener("visibilitychange", visibilityChanged);
    windowTarget?.removeEventListener("focus", refresh);
  };
}
