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
        const data = await listarClientes({ max: 300 });
        if (alive) setItems(Array.isArray(data) ? data : []);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => (alive = false);
  }, []);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;

    return items.filter((c) => {
      return (
        (c.nombre || "").toLowerCase().includes(s) ||
        (c.telefono || "").toString().includes(s)
      );
    });
  }, [q, items]);

  const volverPantallaAnterior = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/home");
  };

  return (
    <div className="clientes-page">
      <div className="clientes-container">
        <button
          type="button"
          className="clientes-back-btn"
          onClick={volverPantallaAnterior}
        >
          ← Volver
        </button>

        {/* HEADER */}
      <div className="clientes-header">

  <div className="clientes-hero-animated">

    <div className="bubbles">
      <span></span>
      <span></span>
      <span></span>
    </div>

    <div className="clientes-hero-content">
      <div className="clientes-hero-top">
        <div>
          <h1>Clientes</h1>
          <p>Gestión y seguimiento de clientes</p>
        </div>
      </div>
    </div>

  </div>

</div>

        {/* BUSCADOR */}
        <div className="clientes-search">
          <input
            placeholder="Buscar cliente por nombre o teléfono..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* MENSAJES */}
        {loading && <p className="clientes-msg">Cargando clientes...</p>}
        {!loading && filtrados.length === 0 && (
          <p className="clientes-msg">No se encontraron clientes</p>
        )}

        {/* GRID */}
        {!loading && filtrados.length > 0 && (
          <div className="clientes-grid">
            {filtrados.map((c) => (
              <div
                key={c.id}
                className="cliente-card"
                onClick={() => navigate(`/clientes/${c.id}`)}
              >
                <div className="cliente-left">
                  <div className="cliente-avatar">
                    {c.nombre?.charAt(0)?.toUpperCase() || "?"}
                  </div>

                  <div>
                    <div className="cliente-name">
                      {c.nombre || "Sin nombre"}
                    </div>

                    <div className="cliente-phone">
                      {c.telefono || "Sin teléfono"}
                    </div>

                    {c.direccion && (
                      <div className="cliente-address">
                        {c.direccion}
                      </div>
                    )}
                  </div>
                </div>

                <div className="cliente-arrow">›</div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
