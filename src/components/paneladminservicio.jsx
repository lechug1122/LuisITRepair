import { useEffect, useMemo, useState } from "react";
import { actualizarServicioPorId } from "../js/services/servicios_firestore";
import { STATUS } from "../js/utils/status_map";
import { imprimirEtiquetas } from "../components/print_label";

function normalizarStatus(raw) {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

const PASOS_BASE = [
  { key: "pendiente", label: "Pendiente" },
  { key: "proceso", label: "En proceso" },
  { key: "final", label: "Finalizado" },
];

const ADMIN_STATUS_OPTIONS = STATUS.filter((item) => item.value !== "entregado");

const PROGRESO_POR_STATUS = {
  pendiente: { pct: 0, theme: "normal", finalLabel: "Finalizado" },
  revision: { pct: 30, theme: "normal", finalLabel: "Finalizado" },
  espera_refaccion: { pct: 40, theme: "normal", finalLabel: "Finalizado" },
  en_espera_de_refaccion: { pct: 40, theme: "normal", finalLabel: "Finalizado" },
  reparacion: { pct: 55, theme: "normal", finalLabel: "Finalizado" },
  en_reparacion: { pct: 55, theme: "normal", finalLabel: "Finalizado" },
  trabajando: { pct: 60, theme: "normal", finalLabel: "Finalizado" },
  listo: { pct: 100, theme: "normal", finalLabel: "Finalizado" },
  finalizado: { pct: 100, theme: "normal", finalLabel: "Finalizado" },
  entregado: { pct: 100, theme: "normal", finalLabel: "Finalizado" },
  cancelado: { pct: 100, theme: "danger", finalLabel: "Cancelado" },
  no_reparable: { pct: 100, theme: "muted", finalLabel: "No reparable" },
};

function getCfg(statusNormalized) {
  return (
    PROGRESO_POR_STATUS[statusNormalized] || {
      pct: 0,
      theme: "normal",
      finalLabel: "Finalizado",
    }
  );
}

function normalizeAdminStatus(raw) {
  const normalized = normalizarStatus(raw);
  if (!normalized) return "pendiente";
  if (normalized === "entregado" || normalized === "finalizado") return "listo";
  if (normalized === "en_reparacion") return "reparacion";
  if (normalized === "en_espera_de_refaccion") return "espera_refaccion";
  return normalized;
}

function WizardProgress({ status }) {
  const normalizedStatus = normalizarStatus(status);
  const cfg = getCfg(normalizedStatus);

  const pasos = useMemo(() => {
    const copy = PASOS_BASE.map((paso) => ({ ...paso }));
    const idx = copy.findIndex((paso) => paso.key === "final");
    if (idx !== -1) copy[idx].label = cfg.finalLabel;
    return copy;
  }, [cfg.finalLabel]);

  let activeIndex = 0;
  if (cfg.pct >= 25) activeIndex = 1;
  if (cfg.pct >= 85) activeIndex = 2;

  const themeClass =
    cfg.theme === "danger"
      ? "wizard--danger"
      : cfg.theme === "muted"
        ? "wizard--muted"
        : "wizard--normal";

  return (
    <div
      className={`wizard-progress2 ${themeClass}`}
      style={{ ["--pct"]: `${cfg.pct}%`, ["--steps"]: pasos.length }}
    >
      <div className="wizard-track" />
      <div className="wizard-fill" />

      {pasos.map((paso, index) => {
        let cls = "wizard-step";
        if (index < activeIndex) cls += " complete";
        if (index === activeIndex) cls += " in-progress";

        return (
          <div key={paso.key} className={cls}>
            <div className="wizard-node" />
            <div className="wizard-label">{paso.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function PanelAdminServicio({
  servicio,
  onActualizado,
  onImprimir,
  onRegresar,
}) {
  const [status, setStatus] = useState("pendiente");
  const [notaAdmin, setNotaAdmin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(normalizeAdminStatus(servicio?.status));
    setNotaAdmin(servicio?.notaAdmin || "");
  }, [servicio?.id, servicio?.status, servicio?.notaAdmin]);

  const handleGuardar = async () => {
    if (!servicio?.id) return;
    if (!confirm("¿Guardar cambios del servicio?")) return;

    setSaving(true);
    try {
      const payload = {
        status,
        notaAdmin,
      };

      const actualizado = await actualizarServicioPorId(servicio.id, payload);

      onActualizado?.({
        ...servicio,
        ...actualizado,
        ...payload,
        id: servicio.id,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-card">
      <h2 className="admin-title">Visualizador de estado</h2>

      <div className="admin-section">
        <div className="admin-row">
          <h3>Actualizar el estado</h3>
        </div>

        <WizardProgress status={status} />

        <label className="admin-label">Estado</label>
        <select
          className="admin-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={saving}
        >
          {ADMIN_STATUS_OPTIONS.map((item, idx) => (
            <option key={`status-${idx}`} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="admin-section">
        <h3 className="admin-subtitle">Notas internas (solo admin)</h3>
        <textarea
          className="admin-notes"
          placeholder="Ej: Cliente pidio llamada antes, trajo cargador..."
          value={notaAdmin}
          onChange={(e) => setNotaAdmin(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="admin-actions">
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={onImprimir}
        >
          Imprimir ticket
        </button>

        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={() => {
            if (confirm("¿Seguro que deseas regresar?")) onRegresar?.();
          }}
        >
          Regresar a home
        </button>

        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={() => {
            const urlStatus = `${window.location.origin}/status/${encodeURIComponent(String(servicio?.folio || "").trim())}`;
            imprimirEtiquetas(servicio, urlStatus, 1);
          }}
        >
          Imprimir etiqueta
        </button>

        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={handleGuardar}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
