import { useEffect, useMemo, useState } from "react";
import "../css/modal_comparador_precios.css";
import {
  calcularComparativa,
  calcularSugerenciaAutomatica,
  formatMoney
} from "../js/services/comparador_marketplaces";


export default function ModalComparadorPrecios({
  mostrar,
  producto,
  onClose
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultados, setResultados] = useState([]);

  useEffect(() => {
    if (!mostrar || !producto) return;
    setQuery(producto.nombre || "");
    setResultados([]);
    setError("");
  }, [mostrar, producto]);

function abrirBusquedaGoogle(queryText) {
  if (!queryText) return;

  const queryEncoded = encodeURIComponent(queryText + " precio México");
  const url = `https://www.google.com/search?q=${queryEncoded}&tbm=shop`;

  window.open(url, "_blank");
}


const comparativa = useMemo(() => {
  if (resultados && resultados.length > 0) {
    return calcularComparativa(producto?.precioVenta || 0, resultados);
  }
  return calcularSugerenciaAutomatica(producto?.precioVenta || 0);
}, [producto?.precioVenta, resultados]);


  if (!mostrar || !producto) return null;


  return (
    <div className="comparador-overlay" onClick={onClose}>
      <div className="comparador-modal" onClick={(e) => e.stopPropagation()}>
        <div className="comparador-header">
          <h3>Comparador de Precios</h3>
          <button type="button" onClick={onClose}>X</button>
        </div>

        <div className="comparador-producto">
          <div><b>Producto:</b> {producto.nombre}</div>
          <div><b>Tu precio:</b> {formatMoney(producto.precioVenta)}</div>
        </div>
<div className="comparador-busqueda">
  <input
    value={query}
    onChange={(e) => setQuery(e.target.value)}
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

   
        {!!error && (
          <div className="comparador-error">
            <div>{error}</div>
            <a
              href={buildMercadoLibreSearchLink(query || producto.nombre)}
              target="_blank"
              rel="noreferrer"
              className="comparador-link-ml"
            >
              Abrir búsqueda en Mercado Libre
            </a>
          </div>
        )}

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
