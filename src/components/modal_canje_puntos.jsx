import React, { useCallback, useEffect } from "react";
import "../css/modal_canje_puntos.css";

export default function ModalCanjePuntos({
  mostrar,
  onClose,
  cliente,
  puntosCliente,
  canjesDisponibles,
  canjeSeleccionadoId,
  formatCurrency,
  onSeleccionarCanje,
  onGuardarPuntos,
}) {
  const cerrar = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!mostrar) return undefined;

    const handleKey = (event) => {
      if (event.key === "Escape") {
        cerrar();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [cerrar, mostrar]);

  if (!mostrar) return null;

  const money = typeof formatCurrency === "function"
    ? formatCurrency
    : (value) => `$${Number(value || 0).toFixed(2)}`;

  return (
    <div className="modal-canje-overlay" onClick={cerrar}>
      <div
        className="modal-canje"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-canje-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-canje-header">
          <div>
            <p className="modal-canje-kicker">Programa de canje</p>
            <h2 id="modal-canje-title">Este cliente ya puede canjear</h2>
            <p className="modal-canje-copy">
              {cliente?.nombre || "Cliente"} tiene <strong>{puntosCliente}</strong> puntos disponibles.
              Selecciona el producto a entregar ahora o guarda los puntos para despues.
            </p>
          </div>

          <button
            type="button"
            className="modal-canje-close"
            onClick={cerrar}
            aria-label="Cerrar modal de canje"
          >
            X
          </button>
        </div>

        <div className="modal-canje-grid">
          {canjesDisponibles.map((producto) => {
            const seleccionado = producto.id === canjeSeleccionadoId;
            return (
              <article
                key={producto.id}
                className={`modal-canje-card ${seleccionado ? "is-selected" : ""}`}
              >
                <div className="modal-canje-card-top">
                  <span className="modal-canje-category">{producto.categoria}</span>
                  <span className="modal-canje-points">{producto.puntosRequeridos} pts</span>
                </div>

                <h3>{producto.nombre}</h3>
                <p>Valor aproximado: {money(producto.precio)}</p>
                <p>Stock disponible: {producto.stockDisponible}</p>

                <button
                  type="button"
                  className={`modal-canje-select ${seleccionado ? "is-selected" : ""}`}
                  onClick={() => onSeleccionarCanje?.(producto.id)}
                >
                  {seleccionado ? "Canje seleccionado" : "Seleccionar este canje"}
                </button>
              </article>
            );
          })}
        </div>

        <div className="modal-canje-actions">
          <button
            type="button"
            className="modal-canje-save"
            onClick={onGuardarPuntos}
          >
            Guardar puntos para despues
          </button>

          <button
            type="button"
            className="modal-canje-secondary"
            onClick={cerrar}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
