import React, { useCallback, useEffect, useState } from "react";
import "../css/modal_pago.css";
import useMonedaConfig from "../hooks/useMonedaConfig";

export default function ModalPago({
  mostrar,
  onClose,
  total,
  totalCobro,
  recargoTarjeta,
  recargoTarjetaMonto = 0,
  imprimirAlCobrar = true,
  tipoPago,
  setTipoPago,
  montoEfectivo,
  setMontoEfectivo,
  montoTarjeta,
  setMontoTarjeta,
  referenciaPago,
  setReferenciaPago,
  cambio,
  confirmarVenta,
  errorMensaje = "",
  habilitarPropina = false,
  propinaMonto = 0,
  setPropinaMonto = () => {},
  clienteData = null,
  onSolicitarClienteFiado = () => {},
}) {
  const { formatCurrency } = useMonedaConfig();
  const [mostrarPropina, setMostrarPropina] = useState(false);

  useEffect(() => {
    // El componente permanece montado al ocultarse; reinicia este panel para la próxima venta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!mostrar) setMostrarPropina(false);
  }, [mostrar]);

  const confirmarConValidacion = useCallback(() => {
    if (tipoPago === "fiado") {
      const telefono = String(clienteData?.telefono || "").replace(/\D/g, "");
      if (!clienteData?.id || telefono.length < 10) {
        onSolicitarClienteFiado();
        return;
      }
    }
    if (tipoPago === "tarjeta" && !referenciaPago.trim()) {
      alert("Ingresa la referencia de pago de tarjeta");
      return;
    }

    confirmarVenta();
  }, [tipoPago, referenciaPago, confirmarVenta, clienteData, onSolicitarClienteFiado]);

  useEffect(() => {
    const handleKey = (e) => {
      if (!mostrar) return;

      if (e.key === "Escape") {
        onClose();
      }

      if (e.key === "F1") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        confirmarConValidacion();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mostrar, onClose, confirmarConValidacion]);

  if (!mostrar) return null;

  const totalFinal = Number(totalCobro ?? total) || 0;
  const recargoActivo =
    tipoPago === "tarjeta" && recargoTarjeta?.habilitado && Number(recargoTarjetaMonto) > 0;

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
      <div
        className={`modal-cobro-pro ${tipoPago !== "efectivo" ? "sin-teclado" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-pago-title"
      >
        <div className="modal-header">
          <h2 id="modal-pago-title">COBRAR</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar cobro">X</button>
        </div>

        <div className={`contenido-cobro ${tipoPago !== "efectivo" ? "sin-teclado" : ""}`}>
          <div className="lado-izquierdo">
            <div className="total-grande-pro">{formatCurrency(totalFinal)}</div>

            {habilitarPropina && (
              <section className={`modal-tip-section ${mostrarPropina ? "open" : "collapsed"}`}>
                <button
                  type="button"
                  className="modal-tip-toggle"
                  aria-expanded={mostrarPropina}
                  onClick={() => setMostrarPropina((visible) => !visible)}
                >
                  <span>
                    <b>{mostrarPropina ? "−" : "+"}</b>
                    Agregar propina
                  </span>
                  <strong>{formatCurrency(propinaMonto)}</strong>
                </button>
                {mostrarPropina && (
                  <div className="modal-tip-content">
                    <div className="modal-tip-presets">
                      {[0, 10, 15, 20].map((percent) => (
                        <button
                          type="button"
                          key={percent}
                          className={
                            Number(propinaMonto || 0) === Number(total || 0) * (percent / 100)
                              ? "active"
                              : ""
                          }
                          onClick={() => setPropinaMonto(Number(total || 0) * (percent / 100))}
                        >
                          {percent === 0 ? "Sin propina" : `${percent}%`}
                        </button>
                      ))}
                    </div>
                    <label className="modal-tip-custom">
                      <span>Cantidad personalizada</span>
                      <div>
                        <b>$</b>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={propinaMonto || ""}
                          placeholder="0.00"
                          onChange={(event) => setPropinaMonto(Math.max(0, Number(event.target.value) || 0))}
                        />
                      </div>
                    </label>
                    <div className="modal-tip-total">
                      <span>Cuenta {formatCurrency(total)}</span>
                      <strong>Total {formatCurrency(totalFinal)}</strong>
                    </div>
                  </div>
                )}
              </section>
            )}

            {recargoActivo && (
              <div className="tarjeta-recargo-resumen">
                <div>
                  <span>Total base</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>
                <div>
                  <span>
                    Recargo tarjeta
                    {recargoTarjeta?.proveedor ? ` (${recargoTarjeta.proveedor})` : ""}
                  </span>
                  <strong>{formatCurrency(recargoTarjetaMonto)}</strong>
                </div>
                <div>
                  <span>Total a cobrar</span>
                  <strong>{formatCurrency(totalFinal)}</strong>
                </div>
              </div>
            )}

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
              <button
                className={tipoPago === "fiado" ? "activo fiado-activo" : ""}
                onClick={() => {
                  const telefono = String(clienteData?.telefono || "").replace(/\D/g, "");
                  if (!clienteData?.id || telefono.length < 10) return onSolicitarClienteFiado();
                  setTipoPago("fiado");
                }}
              >
                🧾 Fiar
              </button>
            </div>

            {tipoPago !== "fiado" && <div className="pago-input">
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
            </div>}

            {tipoPago === "fiado" && <div className="fiado-cobro-resumen"><strong>Venta a crédito</strong><span>{clienteData?.nombre}</span><small>Teléfono: {clienteData?.telefono}</small><p>El total se agregará automáticamente a su cuenta de Fiado.</p></div>}

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

            {tipoPago !== "fiado" && <div className={`cambio-pro ${cambio >= 0 ? "ok" : "error"}`}>
              {cambio >= 0 ? `Su cambio: ${formatCurrency(cambio)}` : "Monto insuficiente"}
            </div>}
            {errorMensaje ? (
              <div className="modal-pago-error" role="alert">{errorMensaje}</div>
            ) : null}
          </div>

          {tipoPago === "efectivo" && (
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
            {imprimirAlCobrar ? "F1 - Cobrar e Imprimir" : "F1 - Cobrar"}
          </button>

          <button className="btn-cancelar-pro" onClick={onClose}>
            ESC - Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
