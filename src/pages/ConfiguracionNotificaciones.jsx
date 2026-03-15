import { useEffect, useState } from "react";
import useNotificacionesConfig from "../hooks/useNotificacionesConfig";
import {
  actualizarNotificacionesConfig,
  NOTIFICACIONES_CATALOGO,
} from "../js/services/configure_notificaciones";

export default function ConfiguracionNotificaciones() {
  const { config, loading } = useNotificacionesConfig();
  const [draft, setDraft] = useState(config);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const toggleItem = (key) => {
    setDraft((prev) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
  };

  const activarTodo = () => {
    const next = {};
    NOTIFICACIONES_CATALOGO.forEach((item) => {
      next[item.key] = true;
    });
    setDraft(next);
  };

  const desactivarTodo = () => {
    const next = {};
    NOTIFICACIONES_CATALOGO.forEach((item) => {
      next[item.key] = false;
    });
    setDraft(next);
  };

  const handleGuardar = async () => {
    if (guardando) return;
    try {
      setGuardando(true);
      await actualizarNotificacionesConfig(draft);
      setMensaje("Configuracion de notificaciones guardada.");
      window.setTimeout(() => setMensaje(""), 2500);
    } catch (error) {
      console.error("No se pudo guardar configuracion de notificaciones:", error);
      setMensaje("No se pudo guardar la configuracion.");
      window.setTimeout(() => setMensaje(""), 2500);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="cfg-pos-wrap">
      <div className="cfg-pos-page-head">
        <h2>Notificaciones</h2>
        <p>Activa solo las alertas que quieres ver en dashboard, panel global y avisos internos.</p>
      </div>

      <div className="cfg-pos-card cfg-empresa-card">
        <div className="cfg-ticket-block cfg-ticket-block-wide">
          <div className="cfg-collapse-head" style={{ marginBottom: 16 }}>
            <div>
              <h4>Centro de alertas</h4>
              <small className="cfg-pos-help">
                Estos checks aplican para las notificaciones internas del sistema.
              </small>
            </div>
            <div className="corte-actions">
              <button type="button" className="btn-light" onClick={activarTodo}>
                Activar todo
              </button>
              <button type="button" className="btn-light" onClick={desactivarTodo}>
                Desactivar todo
              </button>
            </div>
          </div>

          <div className="emp-permisos-grid">
            {NOTIFICACIONES_CATALOGO.map((item) => (
              <label key={item.key} className="emp-perm-item">
                <input
                  type="checkbox"
                  checked={draft?.[item.key] !== false}
                  disabled={loading}
                  onChange={() => toggleItem(item.key)}
                />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </div>
              </label>
            ))}
          </div>

          <div className="emp-form-actions" style={{ marginTop: 18 }}>
            <button type="button" className="emp-btn emp-btn-primary" onClick={handleGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>

          {mensaje ? <small className="cfg-pos-saved">{mensaje}</small> : null}
        </div>
      </div>
    </section>
  );
}
