import { FiChevronLeft, FiChevronRight, FiInbox } from "react-icons/fi";
import { etiquetaUltimoAcceso } from "../../js/services/actividad_negocio";
import { esNegocioBloqueado } from "../../js/services/plan_negocio";

const COLUMNAS = [
  { label: "Negocio", clase: "" },
  { label: "Propietario", clase: "sa-hide-md" },
  { label: "Plan", clase: "" },
  { label: "Usuarios", clase: "sa-hide-lg" },
  { label: "Actividad", clase: "" },
  { label: "Último acceso", clase: "sa-hide-md" },
  { label: "Configuración", clase: "sa-hide-lg" },
  { label: "Estado", clase: "" },
];

function EstadoBadge({ negocio }) {
  if (esNegocioBloqueado(negocio)) {
    const texto = negocio.estado.charAt(0).toUpperCase() + negocio.estado.slice(1);
    return <span className="sa-badge sa-badge-rojo">{texto}</span>;
  }
  if (negocio.estado === "pendiente") {
    return <span className="sa-badge sa-badge-ambar">Pendiente</span>;
  }
  return <span className="sa-badge sa-badge-verde">Activo</span>;
}

function FilaCargando() {
  return (
    <tr className="sa-row-skeleton">
      {COLUMNAS.map((columna) => (
        <td key={columna.label} className={columna.clase}><span /></td>
      ))}
    </tr>
  );
}

export default function BusinessTable({
  negocios,
  cargando,
  seleccionadoId,
  onSeleccionar,
  pagina,
  hayMas,
  onAnterior,
  onSiguiente,
  mensajeVacio = "No se encontraron negocios.",
}) {
  const mostrarVacio = !cargando && negocios.length === 0;

  return (
    <div className="sa-table-card">
      <div className="sa-table-scroll">
        <table className="sa-table">
          <thead>
            <tr>
              {COLUMNAS.map((columna) => (
                <th key={columna.label} className={columna.clase} scope="col">{columna.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando
              ? Array.from({ length: 6 }, (_, index) => <FilaCargando key={index} />)
              : negocios.map((negocio) => (
                <tr
                  key={negocio.negocioId}
                  className={seleccionadoId === negocio.negocioId ? "selected" : ""}
                  onClick={() => onSeleccionar(negocio)}
                  tabIndex={0}
                  aria-label={`Ver detalle de ${negocio.nombre}`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSeleccionar(negocio);
                    }
                  }}
                >
                  <td>
                    <div className="sa-cell-name">
                      <strong>{negocio.nombre}</strong>
                      <small>{negocio.negocioId}</small>
                    </div>
                  </td>
                  <td className="sa-hide-md">
                    <div className="sa-cell-name">
                      <small>{negocio.correo || "Sin correo"}</small>
                    </div>
                  </td>
                  <td>
                    <span className={`sa-badge sa-badge-${negocio.plan.esPremium ? "premium" : "free"}`}>
                      {negocio.plan.etiqueta}
                    </span>
                  </td>
                  <td className="sa-hide-lg sa-num">{negocio.conteos?.usuariosTotal ?? 0}</td>
                  <td>
                    <span className={`sa-badge sa-badge-${negocio.actividad.tono}`}>
                      <i className="sa-dot" aria-hidden="true" />
                      {negocio.actividad.label}
                    </span>
                  </td>
                  <td className="sa-hide-md">
                    {etiquetaUltimoAcceso(negocio.ultimoAccesoMs || negocio.ultimaActividadMs)}
                  </td>
                  <td className="sa-hide-lg">
                    {negocio.setupCompleto ? "Completa" : "Incompleta"}
                  </td>
                  <td><EstadoBadge negocio={negocio} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {mostrarVacio ? (
        <div className="sa-empty">
          <FiInbox aria-hidden="true" />
          <strong>{mensajeVacio}</strong>
          <span>Ajusta la búsqueda o los filtros para ver otros negocios.</span>
        </div>
      ) : null}

      <div className="sa-pager">
        <span className="sa-pager-info">
          Página {pagina + 1}
          {negocios.length ? ` · ${negocios.length} negocios en pantalla` : ""}
        </span>
        <div className="sa-pager-actions">
          <button
            type="button"
            className="sa-btn"
            onClick={onAnterior}
            disabled={pagina === 0 || cargando}
          >
            <FiChevronLeft aria-hidden="true" /> Anterior
          </button>
          <button
            type="button"
            className="sa-btn"
            onClick={onSiguiente}
            disabled={!hayMas || cargando}
          >
            Siguiente <FiChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
