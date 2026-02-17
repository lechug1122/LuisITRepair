import React, { useCallback, useEffect } from "react";
import "../css/modal_pago.css";

export default function ModalPago({
  mostrar,
  onClose,
  total,
  tipoPago,
  setTipoPago,
  montoEfectivo,
  setMontoEfectivo,
  montoTarjeta,
  setMontoTarjeta,
  referenciaPago,
  setReferenciaPago,
  cambio,
  confirmarVenta
}) {
  const confirmarConValidacion = useCallback(() => {
    if (tipoPago === "tarjeta" && !referenciaPago.trim()) {
      alert("Ingresa la referencia de pago de tarjeta");
      return;
    }

    confirmarVenta();
  }, [tipoPago, referenciaPago, confirmarVenta]);

  useEffect(() => {
    const handleKey = (e) => {
      if (!mostrar) return;

      if (e.key === "Escape") {
        onClose();
      }

      if (e.key === "F1") {
        e.preventDefault();
        confirmarConValidacion();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mostrar, onClose, confirmarConValidacion]);

  if (!mostrar) return null;

  const agregarNumero = (num) => {
    if (tipoPago === "tarjeta") {
      setMontoTarjeta((prev) => Number(`${prev}${num}`));
      return;
    }

    setMontoEfectivo((prev) => Number(`${prev}${num}`));
  };

  const limpiar = () => {
    if (tipoPago === "tarjeta") {
      setMontoTarjeta(0);
      return;
    }

    setMontoEfectivo(0);
  };

  return (
    <div className="modal-overlay">
      <div className={`modal-cobro-pro ${tipoPago === "tarjeta" ? "sin-teclado" : ""}`}>
        <div className="modal-header">
          <h2>COBRAR</h2>
          <button onClick={onClose}>X</button>
        </div>

        <div className={`contenido-cobro ${tipoPago === "tarjeta" ? "sin-teclado" : ""}`}>
          <div className="lado-izquierdo">
            <div className="total-grande-pro">${total.toFixed(2)}</div>

            <div className="metodos">
              <button
                className={tipoPago === "efectivo" ? "activo" : ""}
                onClick={() => setTipoPago("efectivo")}
              >
                {"\u{1F4B5}"} Efectivo
              </button>

              <button
                className={tipoPago === "tarjeta" ? "activo" : ""}
                onClick={() => setTipoPago("tarjeta")}
              >
                {"\u{1F4B3}"} Tarjeta
              </button>
            </div>

            <div className="pago-input">
              <label>{tipoPago === "tarjeta" ? "Monto tarjeta:" : "Pago con:"}</label>
              <input
                type="number"
                value={tipoPago === "tarjeta" ? montoTarjeta : montoEfectivo}
                onChange={(e) => {
                  const valor = Number(e.target.value);

                  if (tipoPago === "tarjeta") {
                    setMontoTarjeta(valor);
                    return;
                  }

                  setMontoEfectivo(valor);
                }}
              />
            </div>

            {tipoPago === "tarjeta" && (
              <div className="pago-input referencia-input">
                <label>Referencia:</label>
                <input
                  type="text"
                  value={referenciaPago}
                  onChange={(e) => setReferenciaPago(e.target.value)}
                  placeholder="Folio o autorizacion"
                />
              </div>
            )}

            <div className={`cambio-pro ${cambio >= 0 ? "ok" : "error"}`}>
              {cambio >= 0 ? `Su cambio: $${cambio.toFixed(2)}` : "Monto insuficiente"}
            </div>
          </div>

          {tipoPago !== "tarjeta" && (
            <div className="lado-derecho">
              <div className="teclado">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "OK"].map((k, idx) => {
                  if (k === "C") {
                    return (
                      <button key={`c-${idx}`} onClick={limpiar}>
                        C
                      </button>
                    );
                  }

                  if (k === "OK") {
                    return (
                      <button key={`ok-${idx}`} onClick={confirmarConValidacion}>
                        OK
                      </button>
                    );
                  }

                  return (
                    <button key={k} onClick={() => agregarNumero(k)}>
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="acciones-pro">
          <button className="btn-confirmar-pro" onClick={confirmarConValidacion}>
            F1 - Cobrar e Imprimir
          </button>

          <button className="btn-cancelar-pro" onClick={onClose}>
            ESC - Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
