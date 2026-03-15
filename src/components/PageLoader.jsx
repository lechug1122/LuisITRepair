import "../css/page_loader.css";

// Loader reutilizable para vistas o rutas que siguen cargando informacion.
export default function PageLoader({ text = "Cargando..." }) {
  return (
    <div className="page-loader-wrap" role="status" aria-live="polite">
      {/* Indicador visual principal de espera. */}
      <span className="loader" />
      {text ? <p className="page-loader-text">{text}</p> : null}
    </div>
  );
}
