import { useEffect, useMemo, useState } from "react";
import useMonedaConfig from "../hooks/useMonedaConfig";
import {
  actualizarMoneda,
  formatCurrency,
  getCurrencyOption,
} from "../js/services/moneda_config";
import { SUSCRIPCION_METODOS_PAGO } from "../js/services/suscripciones";

export default function ConfiguracionMetodosPago() {
  const { codigoMoneda, opcionesMoneda } = useMonedaConfig();
  const [monedaCode, setMonedaCode] = useState(codigoMoneda);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");

  useEffect(() => {
    setMonedaCode(codigoMoneda);
  }, [codigoMoneda]);

  const monedaPreview = useMemo(
    () => getCurrencyOption(monedaCode),
    [monedaCode],
  );

  const handleGuardar = async () => {
    if (guardando) return;

    try {
      setGuardando(true);
      setErrorDetalle("");
      await actualizarMoneda(monedaCode);
      setMensaje("Moneda actualizada para POS y tickets.");
      window.setTimeout(() => setMensaje(""), 2500);
    } catch (error) {
      console.error("No se pudo guardar la moneda:", error);
      setMensaje("No se pudo guardar la moneda.");
      setErrorDetalle(String(error?.code || error?.message || "Error desconocido"));
      window.setTimeout(() => setMensaje(""), 2500);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="cfg-pos-wrap">
      <div className="cfg-pos-page-head">
        <h2>Metodos de Pago</h2>
        <p>
          Define la moneda del sistema y los metodos visibles para registrar cobros de
          suscripciones.
        </p>
      </div>

      <div className="cfg-pos-card cfg-empresa-card">
        <div className="cfg-ticket-block cfg-ticket-block-wide">
          <h4>Moneda principal</h4>
          <label htmlFor="metodos-moneda">Tipo de moneda</label>
          <select
            id="metodos-moneda"
            value={monedaCode}
            onChange={(e) => setMonedaCode(e.target.value)}
          >
            {opcionesMoneda.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>

          <div className="cfg-empresa-preview">
            <strong>Vista previa:</strong>{" "}
            {formatCurrency(12345.67, monedaPreview)}{" "}
            <span style={{ opacity: 0.75 }}>
              ({monedaPreview.country} - {monedaPreview.symbol})
            </span>
          </div>

          <small className="cfg-pos-help">
            Este ajuste impacta el punto de venta, el cambio mostrado al cobrar y el ticket.
          </small>

          <button
            type="button"
            className="cfg-ticket-test-btn"
            onClick={handleGuardar}
            disabled={guardando}
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>

          {mensaje ? <small className="cfg-pos-saved">{mensaje}</small> : null}
          {errorDetalle ? <small className="cfg-pos-help">Detalle: {errorDetalle}</small> : null}
        </div>
      </div>

      <div className="cfg-pos-card cfg-metodos-card">
        <div className="cfg-metodos-head">
          <div>
            <h3>Metodos para suscripciones</h3>
            <p>
              Estos son los medios de pago que ya puedes mostrar al registrar o editar
              usuarios con suscripcion.
            </p>
          </div>
          <span className="cfg-metodos-pill">Visible en Configuracion</span>
        </div>

        <div className="cfg-metodos-grid">
          {SUSCRIPCION_METODOS_PAGO.map((item) => (
            <article key={item.value} className="cfg-metodos-option">
              <strong>{item.label}</strong>
              <small>Disponible para registrar el cobro del usuario.</small>
            </article>
          ))}
        </div>

        <small className="cfg-pos-help">
          Por ahora se muestran como opciones de control administrativo para suscripciones:
          Tarjeta, Transferencia, Mercado Pago y PayPal.
        </small>
      </div>
    </section>
  );
}
