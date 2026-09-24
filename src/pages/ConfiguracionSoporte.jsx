import { useEffect, useMemo, useRef, useState } from "react";
import { FiLifeBuoy, FiLock, FiStar } from "react-icons/fi";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import {
  AUTOR_SOPORTE,
  ESTADOS_TICKET,
  TIPO_ASESORIA,
  cambiarEstadoTicket,
  escucharMensajesTicket,
  escucharTodosLosTickets,
  etiquetaCategoriaTicket,
  etiquetaEstadoTicket,
  guardarConfigAsesoria,
  escucharConfigAsesoria,
  marcarTicketLeido,
  responderTicket,
} from "../js/services/soporte_tickets";
import "../css/admin_soporte.css";

const FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "abierto", label: "Abiertos" },
  { value: "en_revision", label: "En revisión" },
  { value: "esperando_cliente", label: "Esperando respuesta" },
  { value: "cerrado", label: "Cerrados" },
  { value: "free", label: "Free" },
  { value: "premium", label: "Premium" },
];

function fechaCorta(ms) {
  return ms ? new Date(ms).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "-";
}

export default function ConfiguracionSoporte() {
  const { uid, nombre } = useAutorizacionActual();
  const [tickets, setTickets] = useState([]);
  const [filtro, setFiltro] = useState("todos");
  const [seleccionado, setSeleccionado] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [respuesta, setRespuesta] = useState("");
  const [esNotaInterna, setEsNotaInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [asesoria, setAsesoria] = useState({ precioPorHora: 0, moneda: "MXN", nota: "" });
  const [precioBorrador, setPrecioBorrador] = useState("");
  const finConversacion = useRef(null);

  useEffect(() => {
    const detener = escucharTodosLosTickets(
      setTickets,
      (err) => setError(err?.message || "No se pudieron leer los tickets."),
    );
    return () => detener?.();
  }, []);

  useEffect(() => {
    const detener = escucharConfigAsesoria(
      (config) => {
        setAsesoria(config);
        setPrecioBorrador(config.precioPorHora ? String(config.precioPorHora) : "");
      },
      () => {},
    );
    return () => detener?.();
  }, []);

  useEffect(() => {
    if (!seleccionado) {
      setMensajes([]);
      return undefined;
    }
    // El administrador si ve las notas internas.
    const detener = escucharMensajesTicket(
      seleccionado.id,
      { incluirInternas: true },
      setMensajes,
      (err) => setError(err?.message || "No se pudo abrir la conversación."),
    );
    marcarTicketLeido(seleccionado.id, true);
    return () => detener?.();
  }, [seleccionado]);

  useEffect(() => {
    finConversacion.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  const visibles = useMemo(() => {
    const lista = tickets.filter((t) => {
      if (filtro === "todos") return true;
      if (filtro === "free") return !t.premium;
      if (filtro === "premium") return t.premium;
      return t.estado === filtro;
    });
    // Soporte preferente: los negocios Premium primero, sin prometer tiempos.
    return [...lista].sort((a, b) => {
      if (a.premium !== b.premium) return a.premium ? -1 : 1;
      return (b.ultimoMensajeAt || 0) - (a.ultimoMensajeAt || 0);
    });
  }, [filtro, tickets]);

  const enviarRespuesta = async (event) => {
    event.preventDefault();
    if (enviando || !respuesta.trim() || !seleccionado) return;
    setEnviando(true);
    setError("");
    try {
      await responderTicket({
        ticketId: seleccionado.id,
        negocioId: seleccionado.negocioId,
        texto: respuesta,
        autor: AUTOR_SOPORTE,
        autorUid: uid,
        autorNombre: "Soporte CajaLibre",
        interna: esNotaInterna,
      });
      setRespuesta("");
      setEsNotaInterna(false);
    } catch (err) {
      setError(err?.message || "No se pudo enviar la respuesta.");
    } finally {
      setEnviando(false);
    }
  };

  const guardarPrecio = async (event) => {
    event.preventDefault();
    try {
      await guardarConfigAsesoria({ ...asesoria, precioPorHora: Number(precioBorrador) || 0 });
    } catch (err) {
      setError(err?.message || "No se pudo guardar el precio.");
    }
  };

  return (
    <section className="admin-sop" aria-labelledby="admin-sop-title">
      <header className="admin-sop-head">
        <h2 id="admin-sop-title"><FiLifeBuoy aria-hidden="true" /> Soporte</h2>
        <p>Solicitudes de los negocios. Los negocios Premium aparecen primero.</p>
      </header>

      <form className="admin-sop-precio" onSubmit={guardarPrecio}>
        <label>
          <span>Costo de la asesoría personalizada (por hora, plan Free)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={precioBorrador}
            onChange={(e) => setPrecioBorrador(e.target.value)}
            placeholder="Sin definir"
          />
        </label>
        <button type="submit">Guardar</button>
        <small>
          Si lo dejas vacío, a los negocios se les dice que tiene costo pero no se
          muestra ninguna cifra.
        </small>
      </form>

      {error && <p className="admin-sop-error" role="alert">{error}</p>}

      <div className="admin-sop-filtros">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={filtro === f.value ? "active" : ""}
            onClick={() => setFiltro(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="admin-sop-layout">
        <div className="admin-sop-tabla-scroll">
          <table className="admin-sop-tabla">
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Asunto</th>
                <th>Categoría</th>
                <th>Plan</th>
                <th>Estado</th>
                <th>Último mensaje</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => (
                <tr
                  key={t.id}
                  className={`${seleccionado?.id === t.id ? "selected" : ""}${t.sinLeerSoporte ? " sin-leer" : ""}`}
                  onClick={() => setSeleccionado(t)}
                >
                  <td>{t.negocioNombre}</td>
                  <td>
                    {t.asunto}
                    {t.tipo === TIPO_ASESORIA && <span className="admin-sop-tag">Asesoría</span>}
                  </td>
                  <td>{etiquetaCategoriaTicket(t.categoria)}</td>
                  <td>
                    {t.premium
                      ? <span className="admin-sop-premium"><FiStar aria-hidden="true" /> Premium</span>
                      : <span className="admin-sop-free">Free</span>}
                  </td>
                  <td><span className={`admin-sop-estado ${t.estado}`}>{etiquetaEstadoTicket(t.estado)}</span></td>
                  <td>{fechaCorta(t.ultimoMensajeAt)}</td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr><td colSpan={6} className="admin-sop-vacio">Sin solicitudes.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {seleccionado && (
          <aside className="admin-sop-conversacion">
            <header>
              <div>
                <strong>{seleccionado.asunto}</strong>
                <small>
                  {seleccionado.negocioNombre} · {seleccionado.usuarioNombre}
                  {seleccionado.premium ? " · Soporte preferente" : ""}
                </small>
              </div>
              <select
                value={seleccionado.estado}
                onChange={(e) => cambiarEstadoTicket(seleccionado.id, e.target.value)}
              >
                {ESTADOS_TICKET.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </header>

            <div className="admin-sop-mensajes">
              {mensajes.map((m) => (
                <div
                  key={m.id}
                  className={`admin-sop-mensaje ${m.autor}${m.interna ? " interna" : ""}`}
                >
                  <div className="admin-sop-mensaje-head">
                    <strong>{m.interna ? "Nota interna" : m.autorNombre}</strong>
                    {m.interna && <FiLock aria-hidden="true" title="Solo la ve el equipo" />}
                    <span>{fechaCorta(m.createdAt)}</span>
                  </div>
                  <p>{m.texto}</p>
                </div>
              ))}
              <div ref={finConversacion} />
            </div>

            <form className="admin-sop-responder" onSubmit={enviarRespuesta}>
              <textarea
                value={respuesta}
                onChange={(e) => setRespuesta(e.target.value)}
                rows={3}
                placeholder={esNotaInterna ? "Nota privada del equipo…" : "Respuesta para el cliente…"}
              />
              <label className={`admin-sop-interna-check${esNotaInterna ? " on" : ""}`}>
                <input
                  type="checkbox"
                  checked={esNotaInterna}
                  onChange={(e) => setEsNotaInterna(e.target.checked)}
                />
                <FiLock aria-hidden="true" /> Nota interna: el cliente no la verá
              </label>
              <button type="submit" disabled={enviando || !respuesta.trim()}>
                {enviando ? "Enviando…" : esNotaInterna ? "Guardar nota interna" : "Responder al cliente"}
              </button>
              <small className="admin-sop-firma">Responde como Soporte CajaLibre ({nombre}).</small>
            </form>
          </aside>
        )}
      </div>
    </section>
  );
}
