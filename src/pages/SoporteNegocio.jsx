import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiLifeBuoy, FiPlus, FiStar } from "react-icons/fi";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { auth } from "../initializer/firebase";
import {
  AUTOR_CLIENTE,
  CATEGORIAS_TICKET,
  PRIORIDADES_TICKET,
  TIPO_ASESORIA,
  TIPO_SOPORTE_TECNICO,
  crearTicketSoporte,
  escucharConfigAsesoria,
  escucharMensajesTicket,
  escucharTicketsDelNegocio,
  etiquetaCategoriaTicket,
  etiquetaEstadoTicket,
  marcarTicketLeido,
  responderTicket,
} from "../js/services/soporte_tickets";
import "../css/soporte_negocio.css";

function fechaCorta(ms) {
  return ms ? new Date(ms).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "";
}

const FORM_INICIAL = {
  asunto: "",
  categoria: "otro",
  descripcion: "",
  prioridad: "normal",
  tipo: TIPO_SOPORTE_TECNICO,
};

export default function SoporteNegocio() {
  const { uid, nombre, negocioId, cuentaPrincipalUid, isPremium } = useAutorizacionActual();
  const { nombreEmpresa } = useEmpresaConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const negocio = negocioId || cuentaPrincipalUid;

  const [tickets, setTickets] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [form, setForm] = useState(() => ({
    ...FORM_INICIAL,
    tipo: searchParams.get("tipo") === TIPO_ASESORIA ? TIPO_ASESORIA : TIPO_SOPORTE_TECNICO,
  }));
  const [creando, setCreando] = useState(searchParams.get("nuevo") === "1");
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [asesoria, setAsesoria] = useState({ precioPorHora: 0, moneda: "MXN" });
  const finConversacion = useRef(null);

  const ticketAbiertoId = searchParams.get("ticket") || "";
  const ticketAbierto = useMemo(
    () => tickets.find((t) => t.id === ticketAbiertoId) || null,
    [ticketAbiertoId, tickets],
  );

  useEffect(() => {
    if (!negocio) return undefined;
    const detener = escucharTicketsDelNegocio(
      negocio,
      setTickets,
      (err) => setError(err?.message || "No se pudieron leer tus solicitudes."),
    );
    return () => detener?.();
  }, [negocio]);

  useEffect(() => {
    const detener = escucharConfigAsesoria(setAsesoria, () => {});
    return () => detener?.();
  }, []);

  useEffect(() => {
    if (!ticketAbiertoId) {
      setMensajes([]);
      return undefined;
    }
    // El negocio nunca pide las notas internas: las reglas tampoco se las dan.
    const detener = escucharMensajesTicket(
      ticketAbiertoId,
      { incluirInternas: false },
      setMensajes,
      (err) => setError(err?.message || "No se pudo abrir la conversación."),
    );
    marcarTicketLeido(ticketAbiertoId, false);
    return () => detener?.();
  }, [ticketAbiertoId]);

  useEffect(() => {
    finConversacion.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  const abrirTicket = (id) => setSearchParams(id ? { ticket: id } : {});

  const crear = async (event) => {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      const id = await crearTicketSoporte({
        negocioId: negocio,
        negocioNombre: nombreEmpresa,
        usuarioUid: uid,
        usuarioNombre: nombre,
        usuarioCorreo: auth.currentUser?.email || "",
        premium: isPremium,
        ...form,
      });
      setForm(FORM_INICIAL);
      setCreando(false);
      setSearchParams({ ticket: id });
    } catch (err) {
      setError(err?.message || "No se pudo crear la solicitud.");
    } finally {
      setEnviando(false);
    }
  };

  const responder = async (event) => {
    event.preventDefault();
    if (enviando || !respuesta.trim() || !ticketAbierto) return;
    setEnviando(true);
    try {
      await responderTicket({
        ticketId: ticketAbierto.id,
        negocioId: negocio,
        texto: respuesta,
        autor: AUTOR_CLIENTE,
        autorUid: uid,
        autorNombre: nombre,
      });
      setRespuesta("");
    } catch (err) {
      setError(err?.message || "No se pudo enviar tu mensaje.");
    } finally {
      setEnviando(false);
    }
  };

  if (ticketAbierto) {
    return (
      <section className="sop-wrap">
        <button type="button" className="sop-volver" onClick={() => abrirTicket("")}>
          <FiArrowLeft aria-hidden="true" /> Todas mis solicitudes
        </button>

        <header className="sop-detalle-head">
          <div>
            <h1>{ticketAbierto.asunto}</h1>
            <p>
              {etiquetaCategoriaTicket(ticketAbierto.categoria)} · Creada el{" "}
              {fechaCorta(ticketAbierto.createdAt)}
            </p>
          </div>
          <span className={`sop-estado ${ticketAbierto.estado}`}>
            {etiquetaEstadoTicket(ticketAbierto.estado)}
          </span>
        </header>

        <div className="sop-conversacion">
          {mensajes.map((m) => (
            <div key={m.id} className={`sop-mensaje ${m.autor}`}>
              <div className="sop-mensaje-head">
                <strong>{m.autor === "soporte" ? "Soporte CajaLibre" : m.autorNombre}</strong>
                <span>{fechaCorta(m.createdAt)}</span>
              </div>
              <p>{m.texto}</p>
            </div>
          ))}
          <div ref={finConversacion} />
        </div>

        {ticketAbierto.estado === "cerrado" ? (
          <p className="sop-cerrado">
            Esta solicitud está cerrada. Si lo necesitas, abre una nueva.
          </p>
        ) : (
          <form className="sop-responder" onSubmit={responder}>
            <textarea
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              rows={3}
              placeholder="Escribe tu mensaje…"
            />
            <button type="submit" disabled={enviando || !respuesta.trim()}>
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </form>
        )}

        {error && <p className="sop-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="sop-wrap">
      <header className="sop-head">
        <div>
          <h1><FiLifeBuoy aria-hidden="true" /> Mis solicitudes de soporte</h1>
          <p>
            Reportar un problema del sistema no tiene costo.
            {isPremium && " Tu negocio tiene soporte preferente."}
          </p>
        </div>
        <button type="button" className="sop-nuevo" onClick={() => setCreando((v) => !v)}>
          <FiPlus aria-hidden="true" /> Nueva solicitud
        </button>
      </header>

      {isPremium && (
        <p className="sop-premium-nota">
          <FiStar aria-hidden="true" /> Soporte preferente incluido en tu plan Premium.
        </p>
      )}

      {creando && (
        <form className="sop-form" onSubmit={crear}>
          <div className="sop-tipo">
            <label className={form.tipo === TIPO_SOPORTE_TECNICO ? "on" : ""}>
              <input
                type="radio"
                name="tipo"
                checked={form.tipo === TIPO_SOPORTE_TECNICO}
                onChange={() => setForm((p) => ({ ...p, tipo: TIPO_SOPORTE_TECNICO }))}
              />
              <strong>Soporte técnico</strong>
              <small>Algo no funciona, un error o un problema de acceso. Sin costo.</small>
            </label>
            <label className={form.tipo === TIPO_ASESORIA ? "on" : ""}>
              <input
                type="radio"
                name="tipo"
                checked={form.tipo === TIPO_ASESORIA}
                onChange={() => setForm((p) => ({ ...p, tipo: TIPO_ASESORIA }))}
              />
              <strong>Asesoría personalizada</strong>
              <small>
                Configuración, carga de productos o capacitación.
                {!isPremium && " Tiene costo por hora en el plan gratuito."}
              </small>
            </label>
          </div>

          {form.tipo === TIPO_ASESORIA && !isPremium && (
            <p className="sop-aviso-costo">
              La asesoría personalizada para el plan gratuito tiene costo por hora
              {asesoria.precioPorHora
                ? `: $${asesoria.precioPorHora} ${asesoria.moneda} por hora.`
                : ". Te confirmaremos el costo antes de agendar."}
            </p>
          )}

          <label className="sop-field">
            <span>Asunto</span>
            <input
              value={form.asunto}
              onChange={(e) => setForm((p) => ({ ...p, asunto: e.target.value }))}
              maxLength={90}
              required
            />
          </label>

          <div className="sop-field-row">
            <label className="sop-field">
              <span>Categoría</span>
              <select
                value={form.categoria}
                onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}
              >
                {CATEGORIAS_TICKET.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>

            <label className="sop-field">
              <span>Prioridad</span>
              <select
                value={form.prioridad}
                onChange={(e) => setForm((p) => ({ ...p, prioridad: e.target.value }))}
              >
                {PRIORIDADES_TICKET.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="sop-field">
            <span>Cuéntanos qué está pasando</span>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
              rows={5}
              required
            />
          </label>

          <button type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </button>
        </form>
      )}

      {error && <p className="sop-error" role="alert">{error}</p>}

      <div className="sop-lista">
        {tickets.length === 0 && !creando && (
          <p className="sop-vacio">
            Todavía no has abierto ninguna solicitud. Antes de escribirnos, revisa el{" "}
            <Link to="/ayuda">Centro de ayuda</Link>.
          </p>
        )}
        {tickets.map((t) => (
          <button key={t.id} type="button" className="sop-item" onClick={() => abrirTicket(t.id)}>
            <div className="sop-item-main">
              <strong>
                {t.asunto}
                {t.sinLeerCliente && <span className="sop-punto" aria-label="Nueva respuesta" />}
              </strong>
              <p>{t.ultimoMensajeTexto}</p>
            </div>
            <div className="sop-item-meta">
              <span className={`sop-estado ${t.estado}`}>{etiquetaEstadoTicket(t.estado)}</span>
              <small>{fechaCorta(t.ultimoMensajeAt)}</small>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
