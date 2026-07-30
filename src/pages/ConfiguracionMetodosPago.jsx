import { useEffect, useMemo, useState } from "react";
import useMonedaConfig from "../hooks/useMonedaConfig";
import useTarjetaRecargoConfig from "../hooks/useTarjetaRecargoConfig";
import {
  actualizarMoneda,
  formatCurrency,
  getCurrencyOption,
} from "../js/services/moneda_config";
import {
  actualizarTarjetaRecargoConfig,
  calcularRecargoTarjeta,
} from "../js/services/tarjeta_recargo_config";
import { SUSCRIPCION_METODOS_PAGO } from "../js/services/suscripciones";

export default function ConfiguracionMetodosPago() {
  const { codigoMoneda, opcionesMoneda } = useMonedaConfig();
  const { config: recargoTarjetaConfig } = useTarjetaRecargoConfig();
  const [monedaCode, setMonedaCode] = useState(codigoMoneda);
  const [guardando, setGuardando] = useState(false);
  const [guardandoRecargo, setGuardandoRecargo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");
  const [recargoDraft, setRecargoDraft] = useState(recargoTarjetaConfig);

  useEffect(() => {
    setMonedaCode(codigoMoneda);
  }, [codigoMoneda]);

  useEffect(() => {
    setRecargoDraft(recargoTarjetaConfig);
  }, [recargoTarjetaConfig]);

  const monedaPreview = useMemo(
    () => getCurrencyOption(monedaCode),
    [monedaCode],
  );

  const recargoPreview = useMemo(
    () => calcularRecargoTarjeta(1000, recargoDraft),
    [recargoDraft],
  );

  const actualizarRecargoDraft = (field, value) => {
    setRecargoDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

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

  const handleGuardarRecargo = async () => {
    if (guardandoRecargo) return;

    try {
      setGuardandoRecargo(true);
      setErrorDetalle("");
      await actualizarTarjetaRecargoConfig(recargoDraft);
      setMensaje("Recargo de tarjeta actualizado para POS.");
      window.setTimeout(() => setMensaje(""), 2500);
    } catch (error) {
      console.error("No se pudo guardar el recargo de tarjeta:", error);
      setMensaje("No se pudo guardar el recargo de tarjeta.");
      setErrorDetalle(String(error?.code || error?.message || "Error desconocido"));
      window.setTimeout(() => setMensaje(""), 2500);
    } finally {
      setGuardandoRecargo(false);
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

      <div className="cfg-pos-card cfg-metodos-recargo-card">
        <div className="cfg-ticket-block cfg-ticket-block-wide">
          <h4>Recargo por tarjeta</h4>

          <label className="cfg-check-row" htmlFor="recargo-tarjeta-habilitado">
            <input
              id="recargo-tarjeta-habilitado"
              type="checkbox"
              checked={!!recargoDraft.habilitado}
              onChange={(e) => actualizarRecargoDraft("habilitado", e.target.checked)}
            />
            <span>Aplicar recargo automatico al cobrar con tarjeta</span>
          </label>

          <label htmlFor="recargo-tarjeta-proveedor">Proveedor o etiqueta</label>
          <input
            id="recargo-tarjeta-proveedor"
            type="text"
            value={recargoDraft.proveedor || ""}
            onChange={(e) => actualizarRecargoDraft("proveedor", e.target.value)}
            placeholder="Mercado Pago"
          />

          <label htmlFor="recargo-tarjeta-base">Porcentaje base</label>
          <input
            id="recargo-tarjeta-base"
            type="number"
            step="0.001"
            min="0"
            value={recargoDraft.porcentajeBase ?? ""}
            onChange={(e) => actualizarRecargoDraft("porcentajeBase", e.target.value)}
          />

          <label htmlFor="recargo-tarjeta-iva">IVA sobre la comision</label>
          <input
            id="recargo-tarjeta-iva"
            type="number"
            step="0.001"
            min="0"
            value={recargoDraft.ivaComision ?? ""}
            onChange={(e) => actualizarRecargoDraft("ivaComision", e.target.value)}
          />

          <div className="cfg-card-surcharge-preview">
            <strong>Vista previa sobre {formatCurrency(1000, monedaPreview)}:</strong>
            <span>Base {Number(recargoPreview.porcentajeBase || 0).toFixed(3)}%</span>
            <span>IVA {Number(recargoPreview.ivaComision || 0).toFixed(3)}%</span>
            <span>Total {Number(recargoPreview.porcentajeTotal || 0).toFixed(4)}%</span>
          </div>

          <div className="cfg-card-surcharge-result">
            <strong>Comision:</strong>{" "}
            {formatCurrency(recargoPreview.recargo, monedaPreview)}{" "}
            <span>({recargoDraft.proveedor || "Tarjeta"})</span>
          </div>

          <div className="cfg-card-surcharge-result">
            <strong>Total a cobrar en tarjeta:</strong>{" "}
            {formatCurrency(recargoPreview.totalConRecargo, monedaPreview)}
          </div>

          <small className="cfg-pos-help">
            Ejemplo solicitado: precio del producto + porcentaje base + IVA de la comision.
            Esto se aplicara automaticamente al elegir tarjeta en POS.
          </small>

          <button
            type="button"
            className="cfg-ticket-test-btn"
            onClick={handleGuardarRecargo}
            disabled={guardandoRecargo}
          >
            {guardandoRecargo ? "Guardando..." : "Guardar recargo de tarjeta"}
          </button>
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
