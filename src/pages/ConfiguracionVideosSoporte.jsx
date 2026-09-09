import { useEffect, useState } from "react";
import { FiEdit2, FiExternalLink, FiPlay, FiPlus, FiSave, FiTrash2, FiX } from "react-icons/fi";
import {
  createSupportVideo,
  deleteSupportVideo,
  getVideoEmbedUrl,
  subscribeSupportVideos,
  updateSupportVideo,
} from "../js/services/support_videos";

const EMPTY_FORM = { title: "", url: "" };

export default function ConfiguracionVideosSoporte() {
  const [videos, setVideos] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => subscribeSupportVideos(
    (items) => {
      setVideos(items);
      setLoading(false);
    },
    () => {
      setMessage("No fue posible cargar los videos de soporte.");
      setLoading(false);
    },
  ), []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    if (!form.title.trim()) {
      setMessage("Escribe el título del video.");
      return;
    }
    if (!getVideoEmbedUrl(form.url)) {
      setMessage("Ingresa un enlace válido de YouTube o Vimeo.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) await updateSupportVideo(editingId, form);
      else await createSupportVideo(form);
      resetForm();
      setMessage(editingId ? "Video actualizado correctamente." : "Video agregado correctamente.");
    } catch (error) {
      console.error("No se pudo guardar el video de soporte:", error);
      setMessage("No fue posible guardar el video. Inténtalo nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const editVideo = (video) => {
    setEditingId(video.id);
    setForm({ title: video.title || "", url: video.url || "" });
    setMessage("");
    document.getElementById("support-video-title")?.focus();
  };

  const removeVideo = async (video) => {
    if (!window.confirm(`¿Eliminar el video “${video.title}”?`)) return;
    try {
      await deleteSupportVideo(video.id);
      if (editingId === video.id) resetForm();
      setMessage("Video eliminado.");
    } catch (error) {
      console.error("No se pudo eliminar el video de soporte:", error);
      setMessage("No fue posible eliminar el video.");
    }
  };

  return (
    <section className="cfg-support-videos">
      <div className="cfg-support-videos-intro">
        <span><FiPlay /> Centro de ayuda</span>
        <h2>Videos de soporte</h2>
        <p>Agrega guías en video que aparecerán en el apartado “Guías paso a paso”.</p>
      </div>

      <form className="cfg-support-video-form" onSubmit={handleSubmit}>
        <label>
          Título del video
          <input
            id="support-video-title"
            type="text"
            maxLength={120}
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Ej. Cómo realizar mi primera venta"
          />
        </label>
        <label>
          Enlace de YouTube o Vimeo
          <input
            type="url"
            value={form.url}
            onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </label>
        <div className="cfg-support-video-actions">
          <button type="submit" className="primary" disabled={saving}>
            {editingId ? <FiSave /> : <FiPlus />}
            {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Agregar video"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm}><FiX /> Cancelar</button>
          )}
        </div>
        {message && <p className="cfg-support-video-message" role="status">{message}</p>}
      </form>

      <div className="cfg-support-video-list">
        <h3>Videos publicados <span>{videos.length}</span></h3>
        {loading ? (
          <p className="cfg-support-video-empty">Cargando videos...</p>
        ) : videos.length === 0 ? (
          <p className="cfg-support-video-empty">Aún no hay videos publicados.</p>
        ) : videos.map((video) => (
          <article key={video.id}>
            <i><FiPlay /></i>
            <div>
              <strong>{video.title}</strong>
              <a href={video.url} target="_blank" rel="noreferrer">
                Ver enlace <FiExternalLink />
              </a>
            </div>
            <button type="button" title="Editar video" onClick={() => editVideo(video)}><FiEdit2 /></button>
            <button type="button" className="danger" title="Eliminar video" onClick={() => removeVideo(video)}><FiTrash2 /></button>
          </article>
        ))}
      </div>
    </section>
  );
}
