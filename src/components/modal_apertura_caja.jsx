import React, { useEffect } from "react";
import "../css/modal_pago.css";

export default function ModalAperturaCaja({ mostrar, onClose, fondoInicial, setFondoInicial, confirmarApertura }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (!mostrar) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") confirmarApertura();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mostrar, onClose, confirmarApertura]);

  if (!mostrar) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-cobro-pro">
        <div className="modal-header">
          <h2>Apertura de Caja</h2>
          <button onClick={onClose}>X</button>
        </div>

        <div className="contenido-cobro">
          <div style={{ padding: 12 }}>
            <p>Captura el monto inicial en caja para comenzar ventas del día.</p>
            <div className="pago-input">
              <label>Fondo inicial:</label>
              <input
                type="number"
                value={fondoInicial}
                onChange={(e) => setFondoInicial(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        </div>

        <div className="acciones-pro">
          <button className="btn-confirmar-pro" onClick={confirmarApertura}>
            Guardar
          </button>
          <button className="btn-cancelar-pro" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
