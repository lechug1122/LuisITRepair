import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../css/status.css";

import {
  getFirestore,
  collection,
  query,
  where,
  limit,
  onSnapshot,
} from "firebase/firestore";

/* =========================
   CONFIG
========================= */
const COLLECTION = "servicios"; // <- si tu colección se llama diferente, cámbiala aquí

/* =========================
   Helpers
========================= */
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

function formatFecha(ts) {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleString("es-MX");
}

function formatFechaDate(d) {
  if (!(d instanceof Date)) return "-";
  return d.toLocaleString("es-MX");
}

function money(n) {
  const val = Number(n) || 0;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(val);
}

function timeAgo(date) {
  if (!(date instanceof Date)) return "";
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "hace unos segundos";
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.floor(hr / 24);
  return `hace ${days} día(s)`;
}

/* =========================
   Wizard (cliente)
========================= */
const PASOS_BASE = [
  { key: "pendiente", label: "Pendiente" },
  { key: "proceso", label: "En proceso" },
  { key: "final", label: "Finalizado" },
  { key: "entregado", label: "Entregado" },
];

const PROGRESO_POR_STATUS = {
  pendiente: { pct: 0, theme: "normal", finalLabel: "Finalizado" },
  revision: { pct: 30, theme: "normal", finalLabel: "Finalizado" },
  en_espera_de_refaccion: { pct: 40, theme: "normal", finalLabel: "Finalizado" },
  en_reparacion: { pct: 55, theme: "normal", finalLabel: "Finalizado" },
  trabajando: { pct: 60, theme: "normal", finalLabel: "Finalizado" },

  listo: { pct: 85, theme: "normal", finalLabel: "Finalizado" },
  finalizado: { pct: 85, theme: "normal", finalLabel: "Finalizado" },

  entregado: { pct: 100, theme: "normal", finalLabel: "Finalizado" },

  cancelado: { pct: 100, theme: "danger", finalLabel: "Cancelado" },
  no_reparable: { pct: 100, theme: "muted", finalLabel: "No reparable" },
};

function getCfg(status) {
  const s = normalizarStatus(status);
  return PROGRESO_POR_STATUS[s] || { pct: 0, theme: "normal", finalLabel: "Finalizado" };
}

function WizardProgress({ status }) {
  const cfg = getCfg(status);

  const pasos = useMemo(() => {
    const copy = PASOS_BASE.map((p) => ({ ...p }));
    const idx = copy.findIndex((p) => p.key === "final");
    if (idx !== -1) copy[idx].label = cfg.finalLabel;
    return copy;
  }, [cfg.finalLabel]);

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
    <div className={`wizard-progress2 ${themeClass}`} style={{ ["--pct"]: `${cfg.pct}%` }}>
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

/* =========================
   Página cliente /status/:folio
========================= */
export default function StatusDetalleCliente() {
  const { folio } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [servicio, setServicio] = useState(null);

  // ✅ “última actualización” (cuando llega snapshot)
  const [lastClientUpdate, setLastClientUpdate] = useState(null);

  useEffect(() => {
    const f = (folio || "").trim();
    if (!f) return;

    const db = getFirestore();

    setLoading(true);
    setServicio(null);

    const q = query(collection(db, COLLECTION), where("folio", "==", f), limit(1));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoading(false);

        if (snap.empty) {
          setServicio(null);
          setLastClientUpdate(new Date());
          return;
        }

        const doc = snap.docs[0];
        const data = doc.data();
        setServicio({ id: doc.id, ...data });
        setLastClientUpdate(new Date());
      },
      (err) => {
        console.error("onSnapshot error:", err);
        setLoading(false);
        setServicio(null);
        setLastClientUpdate(new Date());
      }
    );

    return () => unsub();
  }, [folio]);

  // ✅ Precio a mostrar (respeta precioDespues)
  const precioTexto = useMemo(() => {
    if (!servicio) return "-";
    if (servicio?.precioDespues) return "El precio aparecerá cuando el estatus sea actualizado.";

    const raw = servicio?.costo;
    const n = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return "El precio aparecerá cuando el estatus sea actualizado.";

    return money(n);
  }, [servicio]);

  // ✅ “Última actualización” (prioridad):
  const ultimaActualizacionTexto = useMemo(() => {
    if (!servicio && !lastClientUpdate) return "-";

    const ts = servicio?.updatedAt || servicio?.lastUpdate || servicio?.modifiedAt || null;

    if (ts?.seconds) {
      const d = new Date(ts.seconds * 1000);
      return `${formatFecha(ts)} (${timeAgo(d)})`;
    }

    if (lastClientUpdate instanceof Date) {
      return `${formatFechaDate(lastClientUpdate)} (${timeAgo(lastClientUpdate)})`;
    }

    return "-";
  }, [servicio, lastClientUpdate]);

  // ✅ Loading
  if (loading) {
    return (
      <div className="page-container">
        <div className="status-box status-box--wide">
          <h2>Cargando…</h2>
        </div>
      </div>
    );
  }

  // ❌ No encontrado
  if (!servicio) {
    return (
      <div className="page-container">
        <div className="status-box status-box--wide">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <button className="status-button" style={{ width: 120, marginBottom: 0 }} onClick={() => navigate("/status")}>
              ← Volver
            </button>
            <div style={{ flex: 1 }} />
          </div>

          <h2>Servicio no encontrado</h2>
          <p>Folio: <b>{folio}</b></p>
          <p>No existe un servicio con ese folio.</p>
        </div>
      </div>
    );
  }

  const boleta = servicio?.boleta || null;

  return (
    <div className="page-container">
      <div className="status-box status-box--wide">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
          <button
            type="button"
            onClick={() => navigate("/status")}
            style={{ width: 120 }}
          >
            ← Volver
          </button>

          <div style={{ flex: 1 }}>
            <h2 style={{ marginBottom: 6 }}>Estado de tu servicio</h2>
            <div className="status-lastupdate">
              Folio: <b>{servicio.folio}</b> · Ingreso: {formatFecha(servicio.createdAt)}
            </div>
            <div className="status-lastupdate">
              Última actualización: <b>{ultimaActualizacionTexto}</b>
            </div>
          </div>
        </div>

        {/* Progreso */}
        <div className="status-section">
          <h3>Progreso</h3>
          <WizardProgress status={servicio.status} />

          <div className="status-kpis">
            <div className="status-kpi">
              <div className="k">Estado actual</div>
              <div className="v">{servicio.status || "-"}</div>
            </div>

            <div className="status-kpi">
              <div className="k">Entrega aproximada</div>
              <div className="v">{servicio.fechaAprox || "-"}</div>
            </div>

            <div className="status-kpi">
              <div className="k">Costo</div>
              <div className="v">{precioTexto}</div>
            </div>
          </div>
        </div>

        {/* Equipo / Servicio */}
        <div className="status-kpis" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginTop: 12 }}>
          <div className="status-section" style={{ marginTop: 0 }}>
            <h3>Equipo</h3>
            <p><b>Tipo:</b> {servicio.tipoDispositivo || "-"}</p>
            <p><b>Marca:</b> {servicio.marca || "-"}</p>
            <p><b>Modelo:</b> {servicio.modelo || "-"}</p>
          </div>

          <div className="status-section" style={{ marginTop: 0 }}>
            <h3>Servicio</h3>
            <p><b>Descripción:</b> {servicio.trabajo || "-"}</p>
            <p><b>Dirección:</b> {servicio.direccion || "-"}</p>
          </div>
        </div>

        {/* Observaciones */}
        <div className="status-section">
          <h3>Observaciones</h3>
          <div className="statusd-textarea">
            {servicio.observaciones ? servicio.observaciones : "Sin observaciones por ahora."}
          </div>
        </div>

        {/* Boleta */}
        <div className="status-section">
          <h3>Boleta de venta</h3>

          {!boleta ? (
            <div className="statusd-muted">Aún no se ha generado una boleta para este servicio.</div>
          ) : (
            <>
              <div className="status-kpis">
                <div className="status-kpi">
                  <div className="k">Fecha</div>
                  <div className="v">{boleta.fecha || "-"}</div>
                </div>
                <div className="status-kpi">
                  <div className="k">Forma de pago</div>
                  <div className="v">{boleta.formaPago || "-"}</div>
                </div>
                <div className="status-kpi">
                  <div className="k">Total</div>
                  <div className="v">{money(boleta.total ?? servicio.costo ?? 0)}</div>
                </div>
              </div>

              {Array.isArray(boleta.items) && boleta.items.length > 0 && (
                <div className="statusd-tablewrap">
                  <table className="statusd-table">
                    <thead>
                      <tr>
                        <th>ITEM</th>
                        <th>DESCRIPCIÓN</th>
                        <th style={{ textAlign: "right" }}>P. UNIT</th>
                        <th style={{ textAlign: "right" }}>CANT</th>
                        <th style={{ textAlign: "right" }}>IMPORTE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boleta.items.map((it, i) => {
                        const p = Number(it?.pUnitario) || 0;
                        const c = Number(it?.cantidad) || 0;
                        const imp = p * c;
                        return (
                          <tr key={i}>
                            <td>{it?.item || "-"}</td>
                            <td>{it?.descripcion || "-"}</td>
                            <td style={{ textAlign: "right" }}>{money(p)}</td>
                            <td style={{ textAlign: "right" }}>{c}</td>
                            <td style={{ textAlign: "right" }}>{money(imp)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <b>Notas:</b>
                <div className="statusd-textarea">
                  {boleta.notas ? boleta.notas : "Sin notas."}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="statusd-foot">
          <small>
            Si tienes dudas, menciona tu folio <b>{servicio.folio}</b>.
          </small>
        </div>
      </div>
    </div>
  );
}
