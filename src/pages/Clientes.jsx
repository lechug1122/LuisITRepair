import { useEffect, useMemo, useState } from "react";
import { listarClientes } from "../js/services/clientes_firestore";
import { useNavigate } from "react-router-dom";
import "../css/clientes.css";

export default function Clientes() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await listarClientes({ max: 200 });
        if (alive) setItems(Array.isArray(data) ? data : []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => (alive = false);
  }, []);

  const filtrados = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return items;

    return items.filter((c) => {
      const nombre = (c.nombre || "").toLowerCase();
      const tel = (c.telefono || "").toString();
      return nombre.includes(s) || tel.includes(s);
    });
  }, [q, items]);

  return (
    <div className="clientes-page">
      <div className="clientes-box">
        <div className="clientes-header">
          <h2 className="clientes-title">Clientes</h2>
          <button className="btn-primary" onClick={() => navigate("/hoja_servicio")}>
            + Nuevo servicio
          </button>
        </div>

        <div className="clientes-search">
          <input
            placeholder="Buscar por nombre o teléfono..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {loading && <p className="clientes-msg">Cargando...</p>}
        {!loading && filtrados.length === 0 && (
          <p className="clientes-msg">No hay clientes</p>
        )}

        {!loading && filtrados.length > 0 && (
          <div className="clientes-list">
            {filtrados.map((c) => (
              <button
                key={c.id}
                type="button"
                className="cliente-item"
                onClick={() => navigate(`/clientes/${c.id}`)}
              >
                <div className="cliente-main">
                  <div className="cliente-name">{c.nombre || "Sin nombre"}</div>
                  <div className="cliente-sub">
                    {c.telefono ? `📞 ${c.telefono}` : "📞 Sin teléfono"}
                    {c.direccion ? ` • 📍 ${c.direccion}` : ""}
                  </div>
                </div>
                <div className="cliente-go">›</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
