import { useEffect, useMemo, useState } from "react";
import { actualizarServicioPorId } from "../js/services/servicios_firestore";
import { STATUS, statusInfo } from "../js/utils/status_map";
import { imprimirEtiquetas } from "../components/print_label";

/* ======================================================
   1️⃣ NORMALIZADOR (CLAVE DEL PROBLEMA)
   Convierte "En reparación" -> "en_reparacion"
====================================================== */
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

/* ======================================================
   2️⃣ PASOS FIJOS DEL PROGRESS
====================================================== */
const PASOS_BASE = [
  { key: "pendiente", label: "Pendiente" },
  { key: "proceso", label: "En proceso" },
  { key: "final", label: "Finalizado" },
  { key: "entregado", label: "Entregado" },
];

/* ======================================================
   3️⃣ MAPA DE PROGRESO (YA NORMALIZADO)
====================================================== */
const PROGRESO_POR_STATUS = {
  // 🔹 Inicio
  pendiente: { pct: 0, theme: "normal", finalLabel: "Finalizado" },

  // 🔹 EN PROCESO (orden interno)
  revision: { pct: 30, theme: "normal", finalLabel: "Finalizado" }, // en proceso (inicio)
  en_espera_de_refaccion: {
    pct: 40,
    theme: "normal",
    finalLabel: "Finalizado",
  }, // un poco más adelante
  en_reparacion: { pct: 55, theme: "normal", finalLabel: "Finalizado" }, // más avanzado
  trabajando: { pct: 60, theme: "normal", finalLabel: "Finalizado" },

  // 🔹 FINAL
  listo: { pct: 85, theme: "normal", finalLabel: "Finalizado" },
  finalizado: { pct: 85, theme: "normal", finalLabel: "Finalizado" },

  // 🔹 TERMINADO
  entregado: { pct: 100, theme: "normal", finalLabel: "Finalizado" },

  // 🔹 ESTADOS ESPECIALES
  cancelado: { pct: 100, theme: "danger", finalLabel: "Cancelado" },
  no_reparable: { pct: 100, theme: "muted", finalLabel: "No reparable" },
};

/* ======================================================
   4️⃣ OBTENER CONFIG DEL STATUS (CON FALLBACK)
====================================================== */
function getCfg(statusNormalized) {
  return (
    PROGRESO_POR_STATUS[statusNormalized] || {
      pct: 0,
      theme: "normal",
      finalLabel: "Finalizado",
    }
  );
}

/* ======================================================
   5️⃣ COMPONENTE PROGRESS BAR
====================================================== */
function WizardProgress({ status }) {
  const normalizedStatus = normalizarStatus(status);
  const cfg = getCfg(normalizedStatus);

  const pasos = useMemo(() => {
    const copy = PASOS_BASE.map((p) => ({ ...p }));
    const idx = copy.findIndex((p) => p.key === "final");
    if (idx !== -1) copy[idx].label = cfg.finalLabel;
    return copy;
  }, [cfg.finalLabel]);

  // 0–24: pendiente | 25–74: proceso | 75–99: final | 100: entregado
  let activeIndex = 0;
  if (cfg.pct >= 25) activeIndex = 1;
  if (cfg.pct >= 75) activeIndex = 2;
  if (cfg.pct >= 100) activeIndex = 3;

  const themeClass =
    cfg.theme === "danger"
      ? "wizard--danger"
      : cfg.theme === "muted"
        ? "wizard--muted"
        : "wizard--normal";

  return (
    <div
      className={`wizard-progress2 ${themeClass}`}
      style={{ ["--pct"]: `${cfg.pct}%` }}
    >
      <div className="wizard-track" />
      <div className="wizard-fill" />

      {pasos.map((paso, i) => {
        let cls = "wizard-step";
        if (i < activeIndex) cls += " complete";
        if (i === activeIndex) cls += " in-progress";

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

/* ======================================================
   6️⃣ PANEL ADMIN SERVICIO
   ✅ AÑADIDO: entregado (booleano)
====================================================== */
export default function PanelAdminServicio({
  servicio,
  onActualizado,
  onImprimir,
  onRegresar,
}) {
  const [status, setStatus] = useState("pendiente");
  const [notaAdmin, setNotaAdmin] = useState("");
  const [entregadoBool, setEntregadoBool] = useState(false); // ✅ NUEVO
  const [saving, setSaving] = useState(false);

  const estadoActual = statusInfo(servicio?.status);
  const estadoSeleccionado = statusInfo(status);

  useEffect(() => {
    setStatus(servicio?.status || "pendiente");
    setNotaAdmin(servicio?.notaAdmin || "");
    setEntregadoBool(!!servicio?.entregado); // ✅ NUEVO (lee de Firebase)
  }, [servicio?.id]);

  const handleGuardar = async () => {
    if (!servicio?.id) return;
    if (!confirm("¿Guardar cambios del servicio?")) return;

    setSaving(true);
    try {
      const payload = {
        status,
        notaAdmin,
        // ✅ Si NO estás marcando entregado, entonces false
        // (así "Listo" no cuenta como entregado)
        entregado: false,
      };

      const actualizado = await actualizarServicioPorId(servicio.id, payload);

      setEntregadoBool(false);

      // 🔑 MERGE para no perder datos
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

  const handleEntregado = async () => {
    if (!servicio?.id) return;
    if (!confirm("¿Marcar como ENTREGADO?")) return;

    setSaving(true);
    try {
      const payload = {
        status: "Entregado",
        entregado: true, // ✅ NUEVO
      };

      const actualizado = await actualizarServicioPorId(servicio.id, payload);

      setStatus("Entregado");
      setEntregadoBool(true);

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

        {/* ✅ PROGRESS BAR */}
        <WizardProgress status={status} />

        {/* ✅ Indicador booleano (solo UI, opcional) */}
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Entregado: <b>{entregadoBool ? "Sí" : "No"}</b>
        </div>

        <label className="admin-label">Estado</label>
        <select
          className="admin-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={saving || entregadoBool} // opcional: bloquear cambios si ya entregó
        >
          {STATUS.map((e, idx) => (
            <option key={`status-${idx}`} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>

        <button
          className="admin-btn"
          onClick={handleGuardar}
          disabled={saving || entregadoBool} // opcional: no guardar cambios si ya entregó
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      <div className="admin-section">
        <h3 className="admin-subtitle">Notas internas (solo admin)</h3>
        <textarea
          className="admin-notes"
          placeholder="Ej: Cliente pidió llamada antes, trajo cargador..."
          value={notaAdmin}
          onChange={(e) => setNotaAdmin(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="admin-actions">
        <button className="admin-btn admin-btn-secondary" onClick={onImprimir}>
          Imprimir ticket
        </button>

        <button
          className="admin-btn admin-btn-secondary"
          onClick={() => {
            if (confirm("¿Seguro que deseas regresar?")) onRegresar?.();
          }}
        >
          Regresar a home
        </button>
        <button
          className="admin-btn admin-btn-secondary"
          onClick={() => {
            const urlStatus = `${window.location.origin}/status/${servicio?.folio}`;
            imprimirEtiquetas(servicio, urlStatus, 1); // 12 etiquetas (ajusta)
          }}
        >
          Imprimir etiqueta
        </button>

        <button
          className="admin-btn admin-btn-danger"
          onClick={handleEntregado}
          disabled={saving || entregadoBool} // ✅ si ya está entregado, deshabilita
        >
          {entregadoBool ? "Ya entregado" : "Marcar como entregado"}
        </button>
      </div>
    </div>
  );
}
