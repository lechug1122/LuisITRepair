import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../css/clientes.css";

import { obtenerClientePorId } from "../js/services/clientes_firestore";
import { listarServiciosPorClienteId } from "../js/services/servicios_firestore";

function fmtFecha(ts) {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleDateString("es-MX");
}

export default function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState(null);
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pendientes");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const c = await obtenerClientePorId(id);
        if (!alive) return;
        setCliente(c);

const s = await listarServiciosPorClienteId(id);

setServicios(Array.isArray(s) ? s : []);
      } catch (e) {
        console.error("Error cargando detalle del cliente:", e);

        if (e?.code === "failed-precondition") {
          setError("Preparando datos, intenta nuevamente en unos segundos…");
        } else {
          setError("No se pudo cargar la información del cliente.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => (alive = false);
  }, [id]);

  const pendientes = useMemo(
    () => servicios.filter((x) => (x.status || "").toLowerCase() !== "entregado"),
    [servicios]
  );

  const historial = useMemo(
    () => servicios.filter((x) => (x.status || "").toLowerCase() === "entregado"),
    [servicios]
  );

  const list = tab === "pendientes" ? pendientes : historial;

  return (
    <div className="clientes-page">
      <div className="clientes-box">
        <div className="clientes-header">
          <button className="btn-light" onClick={() => navigate(-1)}>
            ← Volver
          </button>
          <h2 className="clientes-title">Detalle del cliente</h2>
          <button className="btn-primary" onClick={() => navigate("/hoja-servicio")}>
            + Nuevo servicio
          </button>
        </div>

        {loading && <p className="clientes-msg">Cargando...</p>}
        {error && <p className="clientes-msg">{error}</p>}

        {!loading && !error && !cliente && (
          <p className="clientes-msg">Cliente no encontrado</p>
        )}

        {!loading && !error && cliente && (
          <>
            <div className="cliente-card">
              <div className="cliente-name big">{cliente.nombre}</div>
              <div className="cliente-sub">
                {cliente.telefono ? `📞 ${cliente.telefono}` : "📞 Sin teléfono"}
                {cliente.direccion ? ` • 📍 ${cliente.direccion}` : ""}
              </div>
            </div>

            <div className="tabs-row">
              <button
                className={tab === "pendientes" ? "tab active" : "tab"}
                onClick={() => setTab("pendientes")}
              >
                Pendientes ({pendientes.length})
              </button>
              <button
                className={tab === "historial" ? "tab active" : "tab"}
                onClick={() => setTab("historial")}
              >
                Historial ({historial.length})
              </button>
            </div>

            {list.length === 0 && (
              <p className="clientes-msg">No hay servicios aquí</p>
            )}

            {list.length > 0 && (
              <div className="clientes-list">
                {list.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="cliente-item"
                    onClick={() => navigate(`/servicios/${s.folio}`)}
                  >
                    <div className="cliente-main">
                      <div className="cliente-name">
                        Folio: <b>{s.folio}</b>
                      </div>
                      <div className="cliente-sub">
                        {s.tipoDispositivo || "—"} • {s.marca || "—"}{" "}
                        {s.modelo || ""} • {fmtFecha(s.createdAt)} •{" "}
                        {s.status || "pendiente"}
                      </div>
                    </div>
                    <div className="cliente-go">›</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
