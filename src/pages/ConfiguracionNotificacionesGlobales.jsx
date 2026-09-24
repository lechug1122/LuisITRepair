import { useCallback, useEffect, useMemo, useState } from "react";
import { FiBell, FiSend } from "react-icons/fi";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { listarNegociosPagina } from "../js/services/superadmin_negocios";
import {
  DESTINATARIOS_NOTIFICACION,
  PRIORIDADES_NOTIFICACION,
  TIPOS_NOTIFICACION,
  cambiarEstadoNotificacion,
  crearNotificacionGlobal,
  etiquetaTipoNotificacion,
  listarNotificacionesGlobales,
} from "../js/services/notificaciones_globales";
import "../css/admin_notificaciones.css";

const FORM_INICIAL = {
  titulo: "",
  mensaje: "",
  tipo: "informacion",
  prioridad: "normal",
  destinatarios: "todos",
  planes: ["free", "premium"],
  negocioIds: [],
  enlaceUrl: "",
  enlaceTexto: "",
  publicarAt: "",
  expiresAt: "",
};

function fecha(ms) {
  return ms ? new Date(ms).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "-";
}

export default function ConfiguracionNotificacionesGlobales() {
  const { uid, superAdmin } = useAutorizacionActual();
  const [form, setForm] = useState(FORM_INICIAL);
  const [negocios, setNegocios] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [historial, setHistorial] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const recargarHistorial = useCallback(() => {
    if (!superAdmin) return;
    listarNotificacionesGlobales()
      .then(setHistorial)
      .catch((err) => console.warn("[avisos] No se pudo leer el historial:", err?.code || err));
  }, [superAdmin]);

  useEffect(() => {
    if (!superAdmin) return;
    recargarHistorial();
    listarNegociosPagina({ pageSize: 100, orden: "nombre" })
      .then((res) => setNegocios(res?.negocios || []))
      .catch((err) => console.warn("[avisos] No se pudieron listar negocios:", err?.code || err));
  }, [recargarHistorial, superAdmin]);

  const negociosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return negocios.slice(0, 40);
    return negocios
      .filter((n) => `${n.nombre || ""} ${n.correo || ""} ${n.id || ""}`.toLowerCase().includes(texto))
      .slice(0, 40);
  }, [busqueda, negocios]);

  const actualizar = (campo, valor) => setForm((prev) => ({ ...prev, [campo]: valor }));

  const alternarNegocio = (id) => {
    setForm((prev) => {
      const actuales = new Set(prev.negocioIds);
      if (actuales.has(id)) actuales.delete(id);
      else actuales.add(id);
      return { ...prev, negocioIds: [...actuales] };
    });
  };

  const alternarPlan = (plan) => {
    setForm((prev) => {
      const actuales = new Set(prev.planes);
      if (actuales.has(plan)) actuales.delete(plan);
      else actuales.add(plan);
      return { ...prev, planes: [...actuales] };
    });
  };

  const enviar = async (event) => {
    event.preventDefault();
    if (enviando) return;
    setError("");
    setMensaje("");
    setEnviando(true);
    try {
      await crearNotificacionGlobal(form, uid);
      setForm(FORM_INICIAL);
      setMensaje("Aviso publicado. Los negocios que corresponden ya pueden verlo.");
      recargarHistorial();
    } catch (err) {
      setError(err?.message || "No se pudo publicar el aviso.");
    } finally {
      setEnviando(false);
    }
  };

  const alternarActivo = async (item) => {
    try {
      await cambiarEstadoNotificacion(item.id, !item.activo);
      recargarHistorial();
    } catch (err) {
      setError(err?.message || "No se pudo cambiar el aviso.");
    }
  };

  return (
    <section className="admin-notif" aria-labelledby="admin-notif-title">
      <header className="admin-notif-head">
        <h2 id="admin-notif-title"><FiBell aria-hidden="true" /> Notificaciones</h2>
        <p>Envía avisos dentro de CajaLibre a los negocios que elijas.</p>
      </header>

      <form className="admin-notif-form" onSubmit={enviar}>
        <div className="admin-notif-grid">
          <label className="admin-notif-field admin-notif-full">
            <span>Título</span>
            <input
              value={form.titulo}
              onChange={(e) => actualizar("titulo", e.target.value)}
              maxLength={90}
              required
            />
          </label>

          <label className="admin-notif-field admin-notif-full">
            <span>Mensaje</span>
            <textarea
              value={form.mensaje}
              onChange={(e) => actualizar("mensaje", e.target.value)}
              rows={4}
              maxLength={600}
              required
            />
          </label>

          <label className="admin-notif-field">
            <span>Tipo</span>
            <select value={form.tipo} onChange={(e) => actualizar("tipo", e.target.value)}>
              {TIPOS_NOTIFICACION.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-notif-field">
            <span>Prioridad</span>
            <select value={form.prioridad} onChange={(e) => actualizar("prioridad", e.target.value)}>
              {PRIORIDADES_NOTIFICACION.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <small>Un aviso importante además aparece como banner una sola vez.</small>
          </label>

          <label className="admin-notif-field">
            <span>Destinatarios</span>
            <select
              value={form.destinatarios}
              onChange={(e) => actualizar("destinatarios", e.target.value)}
            >
              {DESTINATARIOS_NOTIFICACION.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          {form.destinatarios === "plan" && (
            <div className="admin-notif-field">
              <span>Planes</span>
              <div className="admin-notif-chips">
                {["free", "premium"].map((plan) => (
                  <label key={plan} className="admin-notif-chip">
                    <input
                      type="checkbox"
                      checked={form.planes.includes(plan)}
                      onChange={() => alternarPlan(plan)}
                    />
                    {plan === "free" ? "Free" : "Premium"}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="admin-notif-field">
            <span>Publicar el</span>
            <input
              type="datetime-local"
              value={form.publicarAt}
              onChange={(e) => actualizar("publicarAt", e.target.value)}
            />
            <small>Vacío publica de inmediato.</small>
          </label>

          <label className="admin-notif-field">
            <span>Expira el (opcional)</span>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => actualizar("expiresAt", e.target.value)}
            />
          </label>

          <label className="admin-notif-field">
            <span>Enlace (opcional)</span>
            <input
              value={form.enlaceUrl}
              onChange={(e) => actualizar("enlaceUrl", e.target.value)}
              placeholder="/configuracion/pago-premium"
            />
          </label>

          <label className="admin-notif-field">
            <span>Texto del botón</span>
            <input
              value={form.enlaceTexto}
              onChange={(e) => actualizar("enlaceTexto", e.target.value)}
              placeholder="Conocer Premium"
            />
          </label>
        </div>

        {form.destinatarios === "negocios" && (
          <div className="admin-notif-negocios">
            <label className="admin-notif-field admin-notif-full">
              <span>Buscar negocio</span>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o correo"
              />
            </label>
            <p className="admin-notif-count">
              {form.negocioIds.length} negocio(s) seleccionado(s)
            </p>
            <div className="admin-notif-lista">
              {negociosFiltrados.map((n) => (
                <label key={n.id} className="admin-notif-negocio">
                  <input
                    type="checkbox"
                    checked={form.negocioIds.includes(n.id)}
                    onChange={() => alternarNegocio(n.id)}
                  />
                  <span>
                    <strong>{n.nombre || "Negocio"}</strong>
                    <small>{n.correo || n.id}</small>
                  </span>
                </label>
              ))}
              {negociosFiltrados.length === 0 && <p className="admin-notif-vacio">Sin resultados.</p>}
            </div>
          </div>
        )}

        {error && <p className="admin-notif-error" role="alert">{error}</p>}
        {mensaje && <p className="admin-notif-ok" role="status">{mensaje}</p>}

        <button type="submit" className="admin-notif-enviar" disabled={enviando}>
          <FiSend aria-hidden="true" /> {enviando ? "Publicando…" : "Publicar aviso"}
        </button>
      </form>

      <section className="admin-notif-historial">
        <h3>Avisos publicados</h3>
        {historial.length === 0 && <p className="admin-notif-vacio">Todavía no has publicado avisos.</p>}
        <div className="admin-notif-tabla-scroll">
          <table className="admin-notif-tabla">
            <thead>
              <tr>
                <th>Título</th>
                <th>Tipo</th>
                <th>Destinatarios</th>
                <th>Publicado</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {historial.map((item) => (
                <tr key={item.id}>
                  <td>{item.titulo}</td>
                  <td>{etiquetaTipoNotificacion(item.tipo)}</td>
                  <td>
                    {item.destinatarios === "todos" && "Todos"}
                    {item.destinatarios === "plan" && `Plan: ${item.planes.join(", ") || "todos"}`}
                    {item.destinatarios === "negocios" && `${item.negocioIds.length} negocio(s)`}
                  </td>
                  <td>{fecha(item.publicarAt || item.createdAt)}</td>
                  <td>
                    <span className={item.activo ? "admin-notif-pill on" : "admin-notif-pill off"}>
                      {item.activo ? "Activo" : "Desactivado"}
                    </span>
                  </td>
                  <td>
                    <button type="button" onClick={() => alternarActivo(item)}>
                      {item.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
