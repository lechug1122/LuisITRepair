import React, { useEffect } from "react";
import "../css/modal_selector_producto.css";

export default function ModalSelectorProducto({
  mostrar,
  busqueda,
  productos,
  onClose,
  onSeleccionar
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
    <div className="selector-overlay" onClick={onClose}>
      <div className="selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="selector-header">
          <h3>Selecciona un producto</h3>
          <button type="button" onClick={onClose}>X</button>
        </div>

        <p className="selector-subtitle">
          Coincidencias para: <b>{busqueda}</b>
        </p>

        <div className="selector-lista">
          {productos.map((producto) => {
            const sinStock = Number(producto.stock || 0) <= 0;

            return (
              <button
                key={producto.id}
                type="button"
                className={`selector-item ${sinStock ? "agotado" : ""}`}
                onClick={() => onSeleccionar(producto)}
                disabled={sinStock}
              >
                <div className="selector-nombre">{producto.nombre}</div>
                <div className="selector-meta">
                  <span>Codigo: {producto.codigo || "-"}</span>
                  <span>Precio: ${Number(producto.precioVenta || 0).toFixed(2)}</span>
                  <span>Stock: {Number(producto.stock || 0)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
