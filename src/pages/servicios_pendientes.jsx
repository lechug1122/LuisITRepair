import { useEffect, useState } from "react";
import {
  listarServiciosPendientes,
  listarServiciosHistorial,
} from "../js/services/servicios_firestore";
import { useNavigate } from "react-router-dom";
import "../css/servicios.css";

/* ✅ Normaliza status para usarlo como className CSS */
function normalizarClaseEstado(raw) {
  if (!raw) return "pendiente";
  return raw
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

export default function Servicios() {
  const [tab, setTab] = useState("pendientes");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const data =
          tab === "pendientes"
            ? await listarServiciosPendientes()
            : await listarServiciosHistorial();

        if (alive) setItems(Array.isArray(data) ? data : []);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => (alive = false);
  }, [tab]);

  const formatFecha = (ts) => {
    if (!ts?.seconds) return "-";
    return new Date(ts.seconds * 1000).toLocaleDateString("es-MX");
  };

  return (
    <div className="servicios-page">
      <div className="servicios-box">
        <div className="servicios-title-row">
          <h2 className="servicios-title">Servicios</h2>

          <div className="servicios-tabs">
            <button
              className={tab === "pendientes" ? "tab-bn active" : "tab-bn"}
              onClick={() => setTab("pendientes")}
              type="button"
            >
              Pendientes
            </button>
            <button
              className={tab === "historial" ? "tab-bn active" : "tab-bn"}
              onClick={() => setTab("historial")}
              type="button"
            >
              Historial
            </button>
          </div>
        </div>

        {loading && <p className="servicios-msg">Cargando...</p>}

        {!loading && items.length === 0 && (
          <p className="servicios-msg">No hay servicios para mostrar</p>
        )}

        {!loading && items.length > 0 && (
          <>
            {/* ✅ DESKTOP/TABLET: TABLA */}
            <div className="tabla-wrapper only-desktop">
              <div className="tabla-box">
                <table className="tabla-servicios">
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Descripción</th>
                      <th>Cliente</th>
                      <th>Tipo</th>
                      <th>Fecha ingreso</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s) => {
                      const clsEstado = normalizarClaseEstado(s.status);

                      return (
                        <tr key={s.id}>
                          <td>
                            <b>{s.folio}</b>
                          </td>
                          <td className="desc-col">{s.trabajo || "—"}</td>
                          <td>{s.nombre || "—"}</td>
                          <td className="tipo-col">{s.tipoDispositivo || "—"}</td>
                          <td>{formatFecha(s.createdAt)}</td>
                          <td>
                            <span className={`estado-badge estado-${clsEstado}`}>
                              {s.status || "Pendiente"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn-ver"
                              onClick={() => navigate(`/servicios/${s.folio}`)}
                              type="button"
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ✅ MOBILE: CARDS */}
            <div className="cards-wrapper only-mobile">
              {items.map((s) => {
                const clsEstado = normalizarClaseEstado(s.status);

                return (
                  <div
                    key={s.id}
                    className="serv-card"
                    onClick={() => navigate(`/servicios/${s.folio}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        navigate(`/servicios/${s.folio}`);
                      }
                    }}
                  >
                    <div className="serv-card-top">
                      <div className="serv-card-folio">
                        <span className="muted">Folio</span>
                        <b className="folio">{s.folio || "—"}</b>
                      </div>

                      <span className={`estado-badge estado-${clsEstado}`}>
                        {s.status || "Pendiente"}
                      </span>
                    </div>

                    <div className="serv-card-body">
                      <div className="serv-row">
                        <span className="muted">Cliente</span>
                        <span className="value">{s.nombre || "—"}</span>
                      </div>

                      <div className="serv-row">
                        <span className="muted">Tipo</span>
                        <span className="value">{s.tipoDispositivo || "—"}</span>
                      </div>

                      <div className="serv-row">
                        <span className="muted">Ingreso</span>
                        <span className="value">{formatFecha(s.createdAt)}</span>
                      </div>

                      <div className="serv-row serv-desc">
                        <span className="muted">Descripción</span>
                        <span className="value">{s.trabajo || "—"}</span>
                      </div>
                    </div>

                    <div className="serv-card-actions">
                      <button
                        className="btn-ver full"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/servicios/${s.folio}`);
                        }}
                        type="button"
                      >
                        Ver detalle
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
