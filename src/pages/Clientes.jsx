import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listarClientes } from "../js/services/clientes_firestore";
import useServiciosConfig from "../hooks/useServiciosConfig";
import "../css/clientes.css";

function getNextGoal(points) {
  const value = Number(points || 0);
  if (value >= 1000) return "Meta elite alcanzada";
  if (value >= 500) return "Siguiente meta: 1000 pts";
  if (value >= 250) return "Siguiente meta: 500 pts";
  if (value >= 100) return "Siguiente meta: 250 pts";
  return "Siguiente meta: 100 pts";
}

export function ClientesPanel({ embedded = false, onSelectCliente = null } = {}) {
  const navigate = useNavigate();
  const { habilitarCanjes } = useServiciosConfig();
  const mostrarProgramaCanjes = !habilitarCanjes;
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

    return () => {
      alive = false;
    };
  }, []);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;

    return items.filter((cliente) => (
      (cliente.nombre || "").toLowerCase().includes(s)
      || (cliente.telefono || "").toString().includes(s)
    ));
  }, [items, q]);

  const totalPuntos = useMemo(
    () => items.reduce((acc, cliente) => acc + Number(cliente?.puntos || 0), 0),
    [items],
  );

  const clientesConPuntos = useMemo(
    () => items.filter((cliente) => Number(cliente?.puntos || 0) > 0).length,
    [items],
  );

  const clienteTop = useMemo(
    () => [...items].sort((a, b) => Number(b?.puntos || 0) - Number(a?.puntos || 0))[0] || null,
    [items],
  );

  const volverPantallaAnterior = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/home");
  };

  const abrirCliente = (cliente) => {
    if (typeof onSelectCliente === "function") {
      onSelectCliente(cliente);
      return;
    }

    navigate(`/clientes/${cliente.id}`);
  };

  return (
    <div className={`clientes-page ${embedded ? "clientes-page-embedded" : ""}`}>
      <div className={`clientes-container ${embedded ? "clientes-container-embedded" : ""}`}>
        {!embedded && (
          <button
            type="button"
            className="clientes-back-btn"
            onClick={volverPantallaAnterior}
          >
            Volver
          </button>
        )}

        <div className={`clientes-header ${embedded ? "clientes-header-embedded" : ""}`}>
          <div className="clientes-hero-animated">
            <div className="bubbles">
              <span />
              <span />
              <span />
            </div>

            <div className="clientes-hero-content">
              <div className="clientes-hero-top">
                <div>
                  <h1>{embedded ? "Clientes en caja" : "Clientes"}</h1>
                  <p>
                    {embedded
                      ? "Busca, revisa y carga un cliente sin salir del punto de venta."
                      : mostrarProgramaCanjes
                        ? "Gestion y seguimiento con enfoque en fidelidad y recompensas."
                        : "Gestion y seguimiento del historial, contacto y actividad de clientes."}
                  </p>
                </div>
                {mostrarProgramaCanjes && !embedded && (
                  <button
                    type="button"
                    className="btn-hero"
                    onClick={() => navigate("/configuracion/servicios#canjes")}
                  >
                    Configurar canjes
                  </button>
                )}
                {embedded && (
                  <span className="clientes-embed-pill">
                    Toca un cliente para usarlo en la venta
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`clientes-search ${embedded ? "clientes-search-embedded" : ""}`}>
          <input
            placeholder="Buscar cliente por nombre o telefono..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {mostrarProgramaCanjes && (
          <section className={`clientes-loyalty-strip ${embedded ? "clientes-loyalty-strip-embedded" : ""}`}>
            <article className="clientes-loyalty-card">
              <span>Clientes con puntos</span>
              <strong>{clientesConPuntos}</strong>
              <small>Ya estan participando en el programa</small>
            </article>

            <article className="clientes-loyalty-card">
              <span>Puntos acumulados</span>
              <strong>{totalPuntos}</strong>
              <small>Saldo total disponible entre clientes</small>
            </article>

            <article className="clientes-loyalty-card highlight">
              <span>Meta sugerida</span>
              <strong>
                {clienteTop
                  ? `${clienteTop.nombre}: ${Number(clienteTop.puntos || 0)} pts`
                  : "100 / 250 / 500 / 1000 pts"}
              </strong>
              <small>
                {clienteTop
                  ? getNextGoal(clienteTop.puntos)
                  : "Escalones listos para descuentos y canjes"}
              </small>
            </article>
          </section>
        )}

        {loading && <p className="clientes-msg">Cargando clientes...</p>}
        {!loading && filtrados.length === 0 && (
          <p className="clientes-msg">No se encontraron clientes</p>
        )}

        {!loading && filtrados.length > 0 && (
          <div className={`clientes-grid ${embedded ? "clientes-grid-embedded" : ""}`}>
            {filtrados.map((cliente) => (
              <div
                key={cliente.id}
                className={`cliente-card ${embedded ? "cliente-card-embedded" : ""}`}
                onClick={() => abrirCliente(cliente)}
              >
                <div className="cliente-left">
                  <div className="cliente-avatar">
                    {cliente.nombre?.charAt(0)?.toUpperCase() || "?"}
                  </div>

                  <div>
                    <div className="cliente-name">
                      {cliente.nombre || "Sin nombre"}
                    </div>

                    <div className="cliente-phone">
                      {cliente.telefono || "Sin telefono"}
                    </div>

                    {cliente.direccion && (
                      <div className="cliente-address">
                        {cliente.direccion}
                      </div>
                    )}

                    {mostrarProgramaCanjes && (
                      <div className="cliente-points-row">
                        <span className="cliente-points-pill">
                          {Number(cliente.puntos || 0)} pts
                        </span>
                        <span className="cliente-points-next">
                          {getNextGoal(cliente.puntos)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="cliente-arrow">
                  {embedded ? "Usar" : ">"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Clientes() {
  return <ClientesPanel />;
}
