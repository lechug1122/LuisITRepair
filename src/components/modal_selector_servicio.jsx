import { useEffect } from "react";
import "../css/modal_selector_servicio.css";

const money = (value) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export default function ModalSelectorServicio({
  mostrar,
  cargando = false,
  servicios = [],
  onClose,
  onSeleccionar,
}) {
  useEffect(() => {
    if (!mostrar) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mostrar, onClose]);

  if (!mostrar) return null;

  return (
    <div className="selector-servicio-overlay" onClick={onClose}>
      <div className="selector-servicio-modal" onClick={(e) => e.stopPropagation()}>
        <div className="selector-servicio-header">
          <h3>Pagar servicio</h3>
          <button type="button" onClick={onClose}>
            X
          </button>
        </div>

        <p className="selector-servicio-subtitle">
          Selecciona un servicio con estado listo para cobrar.
        </p>

        {cargando && <p className="selector-servicio-empty">Cargando servicios...</p>}

        {!cargando && servicios.length === 0 && (
          <p className="selector-servicio-empty">No hay servicios listos para cobrar.</p>
        )}

        {!cargando && servicios.length > 0 && (
          <div className="selector-servicio-lista">
            {servicios.map((servicio) => (
              <button
                key={servicio.id}
                type="button"
                className="selector-servicio-item"
                onClick={() => onSeleccionar(servicio)}
              >
                <div className="selector-servicio-row">
                  <span className="selector-servicio-folio">{servicio.folio || "-"}</span>
                  <span className="selector-servicio-costo">{money(servicio.costo)}</span>
                </div>
                <div className="selector-servicio-row selector-servicio-meta">
                  <span>{servicio.nombre || "Cliente sin nombre"}</span>
                  <span>{servicio.telefono || "Sin telefono"}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
