import { useEffect, useState } from "react";
import {
  listarServiciosPendientes,
  listarServiciosHistorial,
} from "../js/services/servicios_firestore";
import { useNavigate } from "react-router-dom";
import "../css/servicios.css";

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

        if (alive) setItems(data);
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
              
            >
              Pendientes
            </button>
            <button
              className={tab === "historial" ? "tab-bn active" : "tab-bn"}
              onClick={() => setTab("historial")}
              
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
          <div className="tabla-wrapper">
            <div className="tabla-box">
              {
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
                    {items.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <b>{s.folio}</b>
                        </td>
                        <td>{s.trabajo || "—"}</td>
                        <td>{s.nombre || "—"}</td>

                        <td className="tipo-col">
                          {" "}
                          {/* ✅ NUEVO */}
                          {s.tipoDispositivo || "—"}
                        </td>

                        <td>{formatFecha(s.createdAt)}</td>

                        <td>
                          <span
                            className={`estado-badge estado-${(s.status || "pendiente").toLowerCase()}`}
                          >
                            {s.status || "pendiente"}
                          </span>
                        </td>

                        <td>
                          <button
                            className="btn-ver"
                           onClick={() => navigate(`/servicios/${s.folio}`)}
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
