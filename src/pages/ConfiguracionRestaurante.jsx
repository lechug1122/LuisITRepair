import { useEffect, useState } from "react";
import { FiCoffee, FiSave, FiUsers } from "react-icons/fi";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import {
  escucharOperacionRestaurante,
  guardarOperacionRestaurante,
} from "../js/services/restaurante_firestore";

export default function ConfiguracionRestaurante() {
  const { uid, cuentaPrincipalUid } = useAutorizacionActual();
  const tenantId = cuentaPrincipalUid || uid;
  const [config, setConfig] = useState({
    limiteCocineroActivo: false,
    maxPlatillosPorCocinero: 10,
    minutosAlertaCocina: 15,
    pagosPersonalActivos: false,
    porcentajeMesero: 0,
    porcentajeCocinero: 0,
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => escucharOperacionRestaurante(
    tenantId,
    setConfig,
    (error) => setMensaje(error?.message || "No se pudo cargar la configuración."),
  ), [tenantId]);

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    setMensaje("");
    try {
      await guardarOperacionRestaurante(config, tenantId);
      setMensaje("Configuración de cocina guardada.");
    } catch (error) {
      setMensaje(error?.message || "No se pudo guardar la configuración.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="cfg-restaurant-operation">
      <header className="cfg-section-header">
        <div>
          <span>Operación</span>
          <h2>Configuración de Restaurante</h2>
          <p>Controla la carga de trabajo de cocina y la disponibilidad diaria.</p>
        </div>
        <FiCoffee />
      </header>

      <article className="cfg-restaurant-operation-card">
        <div className="cfg-restaurant-operation-title">
          <FiUsers />
          <div>
            <h3>Carga máxima por cocinero</h3>
            <p>Evita que un cocinero tome más platillos de los que puede preparar al mismo tiempo.</p>
          </div>
        </div>

        <label className="cfg-restaurant-limit-toggle">
          <input
            type="checkbox"
            checked={config.limiteCocineroActivo}
            onChange={(event) => setConfig((current) => ({
              ...current,
              limiteCocineroActivo: event.target.checked,
            }))}
          />
          <span>
            <strong>{config.limiteCocineroActivo ? "Límite activado" : "Sin límite"}</strong>
            <small>
              {config.limiteCocineroActivo
                ? "Cada cocinero tendrá una cantidad máxima de platillos en preparación."
                : "Los cocineros podrán tomar cualquier cantidad de comandas."}
            </small>
          </span>
        </label>

        {config.limiteCocineroActivo && (
          <label className="cfg-restaurant-limit-field">
            <span>Máximo de platillos activos por cocinero</span>
            <input
              type="number"
              min="1"
              max="100"
              value={config.maxPlatillosPorCocinero}
              onChange={(event) => setConfig((current) => ({
                ...current,
                maxPlatillosPorCocinero: Math.max(1, Math.min(100, Number(event.target.value) || 1)),
              }))}
            />
          </label>
        )}
        <label className="cfg-restaurant-limit-field">
          <span>Alerta de retraso en cocina (minutos)</span>
          <input type="number" min="1" max="180" value={config.minutosAlertaCocina} onChange={(event) => setConfig((current) => ({ ...current, minutosAlertaCocina: Math.max(1, Math.min(180, Number(event.target.value) || 15)) }))} />
        </label>

        <div className="cfg-restaurant-operation-note">
          Los platillos agotados se administran directamente desde la pantalla de Cocina y se
          restablecen automáticamente al comenzar un nuevo día.
        </div>

        {mensaje && <p className="cfg-restaurant-operation-message">{mensaje}</p>}
        <button type="button" className="cfg-restaurant-save" disabled={guardando} onClick={guardar}>
          <FiSave /> {guardando ? "Guardando..." : "Guardar configuración"}
        </button>
      </article>

      <article className="cfg-restaurant-operation-card">
        <div className="cfg-restaurant-operation-title">
          <FiUsers />
          <div>
            <h3>Pago automático por actividad</h3>
            <p>Calcula una comisión diaria para meseros y cocineros a partir de las cuentas cobradas.</p>
          </div>
        </div>
        <label className="cfg-restaurant-limit-toggle">
          <input
            type="checkbox"
            checked={config.pagosPersonalActivos}
            onChange={(event) => setConfig((current) => ({
              ...current,
              pagosPersonalActivos: event.target.checked,
            }))}
          />
          <span>
            <strong>{config.pagosPersonalActivos ? "Comisiones activadas" : "Comisiones desactivadas"}</strong>
            <small>El cálculo aparecerá en el corte de caja únicamente cuando esté activado.</small>
          </span>
        </label>
        {config.pagosPersonalActivos && (
          <>
            <label className="cfg-restaurant-limit-field">
              <span>Porcentaje para el mesero por las ventas de sus mesas</span>
              <input type="number" min="0" max="100" step="0.1" value={config.porcentajeMesero} onChange={(event) => setConfig((current) => ({ ...current, porcentajeMesero: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))} />
            </label>
            <label className="cfg-restaurant-limit-field">
              <span>Porcentaje para el cocinero sobre el valor de los platillos preparados</span>
              <input type="number" min="0" max="100" step="0.1" value={config.porcentajeCocinero} onChange={(event) => setConfig((current) => ({ ...current, porcentajeCocinero: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))} />
            </label>
            <div className="cfg-restaurant-operation-note">
              Mesero: porcentaje de las ventas asociadas a sus cuentas. Cocinero: porcentaje del valor
              de los platillos que tomó y preparó. Los productos de inventario no generan comisión de cocina.
            </div>
          </>
        )}
        {mensaje && <p className="cfg-restaurant-operation-message">{mensaje}</p>}
        <button type="button" className="cfg-restaurant-save" disabled={guardando} onClick={guardar}>
          <FiSave /> {guardando ? "Guardando..." : "Guardar pagos"}
        </button>
      </article>
    </section>
  );
}
