import { useMemo, useState } from "react";
import "../css/modal_comparador_precios.css";
import {
  calcularSugerenciaAutomatica,
  formatMoney
} from "../js/services/comparador_marketplaces";

export default function ModalComparadorPrecios({
  mostrar,
  producto,
  onClose
}) {
  const [queryEditada, setQueryEditada] = useState({
    productKey: "",
    value: ""
  });

  const productKey = producto?.id || producto?.nombre || "";
  const query =
    queryEditada.productKey === productKey
      ? queryEditada.value
      : (producto?.nombre || "");

  // Abre una busqueda manual del producto en Google Shopping.
  function abrirBusquedaGoogle(queryText) {
    if (!queryText) return;

    const queryEncoded = encodeURIComponent(`${queryText} precio Mexico`);
    const url = `https://www.google.com/search?q=${queryEncoded}&tbm=shop`;

    window.open(url, "_blank");
  }

  // Guarda la busqueda escrita por el usuario para el producto actual.
  function manejarCambioBusqueda(event) {
    setQueryEditada({
      productKey,
      value: event.target.value
    });
  }

  // Muestra una referencia automatica mientras no exista una consulta real al mercado.
  const comparativa = useMemo(() => {
    return calcularSugerenciaAutomatica(producto?.precioVenta || 0);
  }, [producto?.precioVenta]);

  if (!mostrar || !producto) return null;

  return (
    <div className="comparador-overlay" onClick={onClose}>
      <div className="comparador-modal" onClick={(e) => e.stopPropagation()}>
        <div className="comparador-header">
          <h3>Comparador de Precios</h3>

          {/* Boton para cerrar el modal. */}
          <button type="button" onClick={onClose} aria-label="Cerrar comparador">
            X
          </button>
        </div>

        <div className="comparador-producto">
          <div><b>Producto:</b> {producto.nombre}</div>
          <div><b>Tu precio:</b> {formatMoney(producto.precioVenta)}</div>
        </div>

        {/* Campo y boton para abrir una consulta externa. */}
        <div className="comparador-busqueda">
          <input
            value={query}
            onChange={manejarCambioBusqueda}
            placeholder="Buscar en Google Shopping..."
          />

          <button
            type="button"
            onClick={() => abrirBusquedaGoogle(query)}
            disabled={!query.trim()}
          >
            Buscar en Google
          </button>
        </div>

        {/* Muestra la referencia de mercado para apoyar la decision de precio. */}
        <div className="comparador-metricas">
          <div className="comparador-kpi">
            <small>Promedio ML</small>
            <b>{formatMoney(comparativa.promedio)}</b>
          </div>

          <div className="comparador-kpi">
            <small>Min / Max ML</small>
            <b>{formatMoney(comparativa.minimo)} / {formatMoney(comparativa.maximo)}</b>
          </div>

          <div className={`comparador-kpi ${comparativa.diferenciaAbs > 0 ? "alto" : "bajo"}`}>
            <small>Diferencia vs promedio</small>
            <b>{formatMoney(comparativa.diferenciaAbs)} ({comparativa.diferenciaPct.toFixed(1)}%)</b>
          </div>
        </div>
      </div>
    </div>
  );
}
