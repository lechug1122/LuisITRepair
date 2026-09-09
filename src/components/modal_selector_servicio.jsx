import { useEffect } from "react";
import "../css/modal_selector_servicio.css";
import useMonedaConfig from "../hooks/useMonedaConfig";

export default function ModalSelectorServicio({
  mostrar,
  cargando = false,
  servicios = [],
  titulo = "Pagar servicio",
  subtitulo = "Selecciona un servicio con estado listo para cobrar.",
  mensajeVacio = "No hay servicios listos para cobrar.",
  mostrarCosto = true,
  onClose,
  onSeleccionar,
}) {
  const { formatCurrency } = useMonedaConfig();
  const obtenerSaldo = (servicio) => Math.max(
    0,
    Number(String(servicio?.costo || "").replace(/[^\d.-]/g, "")) - Number(servicio?.totalAbonado || 0),
  );

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
          <h3>{titulo}</h3>
          <button type="button" onClick={onClose}>
            X
          </button>
        </div>

        <p className="selector-servicio-subtitle">
          {subtitulo}
        </p>

        {cargando && <p className="selector-servicio-empty">Cargando servicios...</p>}

        {!cargando && servicios.length === 0 && (
          <p className="selector-servicio-empty">{mensajeVacio}</p>
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
                  <span className="selector-servicio-costo">{mostrarCosto && obtenerSaldo(servicio) > 0 ? `Saldo: ${formatCurrency(obtenerSaldo(servicio))}` : "Precio por definir"}</span>
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
