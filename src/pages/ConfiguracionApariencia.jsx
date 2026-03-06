import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_APARIENCIA_CONFIG,
  applyAparienciaConfig,
  readAparienciaConfigStorage,
  saveAparienciaConfigStorage,
} from "../js/services/apariencia_config";
import { auth } from "../initializer/firebase";

const COLOR_OPTIONS = [
  { key: "azul", label: "Azul", color: "#2563eb" },
  { key: "verde", label: "Verde", color: "#16a34a" },
  { key: "turquesa", label: "Turquesa", color: "#0d9488" },
  { key: "naranja", label: "Naranja", color: "#ea580c" },
];

export default function ConfiguracionApariencia() {
  const [userId, setUserId] = useState(() => auth.currentUser?.uid || null);
  const [cfg, setCfg] = useState(() => readAparienciaConfigStorage(auth.currentUser?.uid || null));
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      const uid = user?.uid || null;
      setUserId(uid);
      setCfg(readAparienciaConfigStorage(uid));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    applyAparienciaConfig(cfg);
    const ok = saveAparienciaConfigStorage(cfg, userId);
    if (!ok) return undefined;

    setGuardado(true);
    const t = setTimeout(() => setGuardado(false), 1200);
    return () => clearTimeout(t);
  }, [cfg, userId]);

  const colorPreview = useMemo(
    () => COLOR_OPTIONS.find((item) => item.key === cfg.accent)?.color || "#2563eb",
    [cfg.accent],
  );

  const patch = (key, value) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section className="cfg-appearance-wrap">
      <div className="cfg-pos-card cfg-appearance-card">
        <div className="cfg-ticket-head">
          <h3>Apariencia</h3>
          <button
            type="button"
            className="cfg-ticket-test-btn"
            onClick={() => setCfg({ ...DEFAULT_APARIENCIA_CONFIG })}
          >
            Restablecer
          </button>
        </div>

        <div className="cfg-appearance-grid">
          <div className="cfg-ticket-block">
            <h4>Tema y fuentes</h4>
            <label>Tema visual</label>
            <select value={cfg.themeMode} onChange={(e) => patch("themeMode", e.target.value)}>
              <option value="claro">Claro</option>
              <option value="oscuro">Oscuro</option>
            </select>

            <label>Fuente para ticket</label>
            <select value={cfg.ticketFont} onChange={(e) => patch("ticketFont", e.target.value)}>
              <option value="mono">Monoespaciada (ticket clasico)</option>
              <option value="ui">UI legible</option>
              <option value="compacta">Compacta</option>
            </select>

            <label>Fuente para PDF</label>
            <select value={cfg.pdfFont} onChange={(e) => patch("pdfFont", e.target.value)}>
              <option value="helvetica">Helvetica</option>
              <option value="courier">Courier</option>
              <option value="times">Times</option>
            </select>
          </div>

          <div className="cfg-ticket-block">
            <h4>Color principal</h4>
            <div className="cfg-appearance-color-row">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`cfg-appearance-color-btn ${cfg.accent === opt.key ? "active" : ""}`}
                  onClick={() => patch("accent", opt.key)}
                >
                  <span style={{ background: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>

            <label>Densidad visual</label>
            <select value={cfg.density} onChange={(e) => patch("density", e.target.value)}>
              <option value="normal">Normal</option>
              <option value="compacta">Compacta</option>
            </select>

            <label>Tamano de bordes</label>
            <select value={cfg.radius} onChange={(e) => patch("radius", e.target.value)}>
              <option value="cuadrado">Cuadrado</option>
              <option value="suave">Suave</option>
              <option value="redondeado">Redondeado</option>
            </select>
          </div>

          <div className="cfg-ticket-block">
            <h4>Accesibilidad</h4>
            <label>Tamano de texto</label>
            <select value={cfg.fontScale} onChange={(e) => patch("fontScale", e.target.value)}>
              <option value="pequeno">Pequeno</option>
              <option value="normal">Normal</option>
              <option value="grande">Grande</option>
            </select>

            <label>Contraste</label>
            <select value={cfg.contrast} onChange={(e) => patch("contrast", e.target.value)}>
              <option value="normal">Normal</option>
              <option value="alto">Alto</option>
            </select>

            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={cfg.animations}
                onChange={(e) => patch("animations", e.target.checked)}
              />
              Activar animaciones
            </label>
          </div>

          <div className="cfg-ticket-block">
            <h4>Region y formato</h4>
            <label>Idioma de interfaz</label>
            <select value={cfg.language} onChange={(e) => patch("language", e.target.value)}>
              <option value="es-MX">Espanol (Mexico)</option>
              <option value="en-US">Ingles (US)</option>
            </select>

            <label>Formato de fecha</label>
            <select value={cfg.dateFormat} onChange={(e) => patch("dateFormat", e.target.value)}>
              <option value="dd/mm/aaaa">DD/MM/AAAA</option>
              <option value="mm/dd/aaaa">MM/DD/AAAA</option>
              <option value="aaaa-mm-dd">AAAA-MM-DD</option>
            </select>
          </div>
        </div>

        <div className="cfg-appearance-preview">
          <h4>Vista previa</h4>
          <div className="cfg-appearance-preview-card" style={{ borderColor: colorPreview }}>
            <strong style={{ color: colorPreview }}>LuisITRepair</strong>
            <p>
              Esta vista previa muestra el color principal y el estilo de apariencia aplicado.
            </p>
            <div className="cfg-appearance-preview-meta">
              Tema: {cfg.themeMode === "oscuro" ? "Oscuro" : "Claro"} | Ticket: {cfg.ticketFont} | PDF:{" "}
              {cfg.pdfFont}
            </div>
            <button type="button" style={{ background: colorPreview, fontFamily: "var(--app-ticket-font)" }}>
              Boton de ejemplo
            </button>
          </div>
        </div>

        <small className="cfg-pos-help">Se guarda automaticamente en este equipo.</small>
        {guardado && <small className="cfg-pos-saved">Guardado automaticamente.</small>}
      </div>

      <div className="cfg-pos-card cfg-appearance-card">
        <h3>Incluye actualmente</h3>
        <div className="cfg-appearance-features">
          <div>Tema claro/oscuro por usuario</div>
          <div>Fuentes para tickets y PDF</div>
          <div>Logo y branding por sucursal</div>
          <div>Formatos regionales de moneda y fecha</div>
          <div>Atajos de teclado y accesibilidad</div>
          <div>Perfil visual por rol (cajero/tecnico/admin)</div>
        </div>
      </div>
    </section>
  );
}
