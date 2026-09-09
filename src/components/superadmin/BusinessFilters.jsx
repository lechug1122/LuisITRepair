import { FiDownload, FiRefreshCw, FiSearch } from "react-icons/fi";
import { ORDENES, TAMANOS_PAGINA } from "../../js/services/superadmin_negocios";
import { FILTROS_PAGINA, FILTROS_SERVIDOR } from "../../js/services/superadmin_filtros";

export default function BusinessFilters({
  busqueda,
  onBuscar,
  filtro,
  onFiltrar,
  orden,
  onOrdenar,
  pageSize,
  onPageSize,
  onExportar,
  onRecargar,
  ocupado = false,
}) {
  return (
    <div className="sa-toolbar">
      <div className="sa-search">
        <FiSearch aria-hidden="true" />
        <input
          type="search"
          value={busqueda}
          onChange={(event) => onBuscar(event.target.value)}
          placeholder="Buscar negocio, propietario, correo o negocioId..."
          aria-label="Buscar negocio"
        />
      </div>

      <div className="sa-chips" role="group" aria-label="Filtros rápidos">
        {[...FILTROS_SERVIDOR, ...FILTROS_PAGINA].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sa-chip ${filtro === item.id ? "active" : ""}`.trim()}
            onClick={() => onFiltrar(item.id)}
            aria-pressed={filtro === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="sa-selects">
        <label>
          Ordenar
          <select value={orden} onChange={(event) => onOrdenar(event.target.value)}>
            {ORDENES.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          Por página
          <select
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
          >
            {TAMANOS_PAGINA.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>

        <div className="sa-toolbar-actions">
          <button type="button" className="sa-btn" onClick={onRecargar} disabled={ocupado}>
            <FiRefreshCw aria-hidden="true" /> Actualizar
          </button>
          <button type="button" className="sa-btn" onClick={() => onExportar("csv")}>
            <FiDownload aria-hidden="true" /> CSV
          </button>
          <button type="button" className="sa-btn" onClick={() => onExportar("excel")}>
            <FiDownload aria-hidden="true" /> Excel
          </button>
          <button type="button" className="sa-btn" onClick={() => onExportar("pdf")}>
            <FiDownload aria-hidden="true" /> PDF
          </button>
        </div>
      </div>
    </div>
  );
}
