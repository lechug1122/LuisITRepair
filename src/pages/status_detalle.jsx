import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../css/status.css";

import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../initializer/firebase";

const COLLECTION = "servicios";

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

function permitePrecioCero(status) {
  const s = normalizarStatus(status);
  return s === "cancelado" || s === "no_reparable";
}

function formatFecha(ts) {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleString("es-MX");
}

function formatFechaDate(date) {
  if (!(date instanceof Date)) return "-";
  return date.toLocaleString("es-MX");
}

function money(value) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(amount);
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
  return `hace ${days} dia(s)`;
}

const STATUS_STEP_META = {
  pendiente: {
    currentStep: 0,
    resultLabel: "Finalizado",
    closeLabel: "Entregado",
    theme: "blue",
  },
  revision: {
    currentStep: 1,
    resultLabel: "Finalizado",
    closeLabel: "Entregado",
    theme: "blue",
  },
  en_espera_de_refaccion: {
    currentStep: 2,
    resultLabel: "Finalizado",
    closeLabel: "Entregado",
    theme: "blue",
  },
  en_reparacion: {
    currentStep: 3,
    resultLabel: "Finalizado",
    closeLabel: "Entregado",
    theme: "blue",
  },
  trabajando: {
    currentStep: 3,
    resultLabel: "Finalizado",
    closeLabel: "Entregado",
    theme: "blue",
  },
  listo: {
    currentStep: 4,
    resultLabel: "Finalizado",
    closeLabel: "Entregado",
    theme: "blue",
  },
  finalizado: {
    currentStep: 4,
    resultLabel: "Finalizado",
    closeLabel: "Entregado",
    theme: "blue",
  },
  entregado: {
    currentStep: 5,
    resultLabel: "Finalizado",
    closeLabel: "Entregado",
    theme: "blue",
  },
  cancelado: {
    currentStep: 4,
    resultLabel: "Cancelado",
    closeLabel: "Cierre",
    theme: "danger",
  },
  no_reparable: {
    currentStep: 4,
    resultLabel: "No reparable",
    closeLabel: "Cierre",
    theme: "dark",
  },
};

function getStepperMeta(status) {
  const key = normalizarStatus(status);
  return {
    key,
    ...(STATUS_STEP_META[key] || STATUS_STEP_META.pendiente),
  };
}

function getRevisionDetalle(statusKey) {
  if (statusKey === "pendiente") {
    return "Servicio recibido y esperando revision inicial.";
  }
  if (statusKey === "revision") return "Diagnostico inicial en curso.";
  if (statusKey === "cancelado") {
    return "La revision se detuvo antes de llegar a una conclusion final.";
  }
  if (statusKey === "no_reparable") {
    return "La revision detecto una falla que impide la reparacion.";
  }
  return "Revision tecnica completada.";
}

function getRefaccionDetalle(statusKey, fechaAprox) {
  if (statusKey === "en_espera_de_refaccion") {
    return fechaAprox
      ? `Esperando refaccion o autorizacion. Fecha estimada: ${fechaAprox}.`
      : "Esperando refaccion o autorizacion para continuar.";
  }
  if (["pendiente", "revision"].includes(statusKey)) {
    return "Este paso se usa cuando el equipo necesita piezas o aprobacion.";
  }
  return "Paso de refaccion cubierto o no requerido para continuar.";
}

function getReparacionDetalle(statusKey) {
  if (statusKey === "en_reparacion" || statusKey === "trabajando") {
    return "Equipo en trabajo tecnico dentro del taller.";
  }
  if (["pendiente", "revision", "en_espera_de_refaccion"].includes(statusKey)) {
    return "La reparacion iniciara cuando el diagnostico y las piezas esten listas.";
  }
  if (statusKey === "cancelado") return "La reparacion ya no continuara.";
  if (statusKey === "no_reparable") {
    return "No fue posible llegar a una etapa de reparacion efectiva.";
  }
  return "Reparacion finalizada correctamente.";
}

function getResultadoDetalle(statusKey) {
  if (statusKey === "listo" || statusKey === "finalizado") {
    return "El equipo ya termino proceso y esta listo para la siguiente etapa.";
  }
  if (statusKey === "cancelado") {
    return "El servicio fue marcado como cancelado y quedo cerrado.";
  }
  if (statusKey === "no_reparable") {
    return "No fue posible reparar el equipo y el servicio quedo cerrado.";
  }
  if (statusKey === "entregado") {
    return "El resultado tecnico fue confirmado antes de la entrega.";
  }
  return "Se mostrara cuando el tecnico concluya el proceso.";
}

function getCloseDetail(statusKey, ultimaActualizacionTexto) {
  if (statusKey === "entregado") {
    return `Entrega confirmada. Ultima actualizacion: ${ultimaActualizacionTexto}`;
  }
  if (statusKey === "cancelado" || statusKey === "no_reparable") {
    return "Servicio cerrado sin entrega al cliente.";
  }
  if (statusKey === "listo" || statusKey === "finalizado") {
    return "Pendiente de entrega o cierre con cliente.";
  }
  return "Disponible cuando el servicio llegue a su etapa final.";
}

function StatusStepper({ status, createdAt, fechaAprox, ultimaActualizacionTexto }) {
  const meta = useMemo(() => getStepperMeta(status), [status]);

  const steps = useMemo(() => {
    const baseSteps = [
      {
        key: "pendiente",
        title: "Pendiente",
        detail: createdAt
          ? `Ingreso registrado: ${formatFecha(createdAt)}`
          : "Ingreso pendiente de registrar.",
      },
      {
        key: "revision",
        title: "Revision",
        detail: getRevisionDetalle(meta.key),
      },
      {
        key: "refaccion",
        title: "Espera de refaccion",
        detail: getRefaccionDetalle(meta.key, fechaAprox),
      },
      {
        key: "reparacion",
        title: "Reparacion",
        detail: getReparacionDetalle(meta.key),
      },
      {
        key: "resultado",
        title: meta.resultLabel,
        detail: getResultadoDetalle(meta.key),
      },
      {
        key: "cierre",
        title: meta.closeLabel,
        detail: getCloseDetail(meta.key, ultimaActualizacionTexto),
      },
    ];

    return baseSteps.map((step, index) => {
      let state = "pending";
      if (meta.key === "entregado" && index <= meta.currentStep) {
        state = "completed";
      } else if (index < meta.currentStep) {
        state = "completed";
      } else if (index === meta.currentStep) {
        state = "active";
      }

      let statusText = "Pendiente";
      if (state === "completed") {
        if (meta.key === "entregado" && index === meta.currentStep) {
          statusText = "Entregado";
        } else {
          statusText = "Completado";
        }
      }
      if (state === "active") {
        if (step.key === "pendiente") statusText = "Registrado";
        else if (step.key === "revision") statusText = "En revision";
        else if (step.key === "refaccion") statusText = "En espera";
        else if (step.key === "reparacion") statusText = "En reparacion";
        else if (step.key === "resultado") statusText = meta.resultLabel;
        else statusText = meta.closeLabel === "Cierre" ? "Cerrado" : meta.closeLabel;
      }

      return {
        ...step,
        state,
        statusText,
      };
    });
  }, [createdAt, fechaAprox, meta, ultimaActualizacionTexto]);

  return (
    <div className={`status-stepper-box status-stepper-theme-${meta.theme}`}>
      {steps.map((step, index) => (
        <div
          key={step.key}
          className={`status-stepper-step status-stepper-${step.state}`}
        >
          <div className="status-stepper-circle">
            {step.state === "completed" ? (
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                height="16"
                width="16"
                aria-hidden="true"
              >
                <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z"></path>
              </svg>
            ) : (
              index + 1
            )}
          </div>
          <div className="status-stepper-line"></div>
          <div className="status-stepper-content">
            <div className="status-stepper-title">{step.title}</div>
            <div className="status-stepper-status">{step.statusText}</div>
            <div className="status-stepper-time">{step.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StatusDetalleCliente() {
  const { folio: folioParam } = useParams();
  const navigate = useNavigate();
  const folio = useMemo(() => {
    const raw = String(folioParam || "").trim();
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [folioParam]);

  const [loading, setLoading] = useState(true);
  const [servicio, setServicio] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [lastClientUpdate, setLastClientUpdate] = useState(null);

  function handleGoBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/status");
  }

  useEffect(() => {
    const f = (folio || "").trim();
    if (!f) return undefined;

    setLoading(true);
    setServicio(null);
    setLookupError("");

    const q = query(collection(db, COLLECTION), where("folio", "==", f), limit(1));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoading(false);
        setLookupError("");

        if (snap.empty) {
          setServicio(null);
          setLastClientUpdate(new Date());
          return;
        }

        const doc = snap.docs[0];
        setServicio({ id: doc.id, ...doc.data() });
        setLastClientUpdate(new Date());
      },
      (err) => {
        console.error("onSnapshot error:", err);
        setLoading(false);
        setServicio(null);
        if ((err?.code || "").includes("permission-denied")) {
          setLookupError("No hay permisos para consultar este servicio. Contacta al administrador.");
        } else {
          setLookupError("No se pudo consultar el servicio en este momento. Intenta de nuevo.");
        }
        setLastClientUpdate(new Date());
      },
    );

    return () => unsub();
  }, [folio]);

  const precioTexto = useMemo(() => {
    if (!servicio) return "-";
    if (servicio?.precioDespues) {
      return "El precio aparecera cuando el estatus sea actualizado.";
    }

    const raw = servicio?.costo;
    const sanitized = String(raw ?? "").replace(/[^\d.]/g, "");
    if (!sanitized) {
      return "El precio aparecera cuando el estatus sea actualizado.";
    }

    const amount = Number(sanitized);
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      (amount === 0 && !permitePrecioCero(servicio?.status))
    ) {
      return "El precio aparecera cuando el estatus sea actualizado.";
    }

    return money(amount);
  }, [servicio]);

  const ultimaActualizacionTexto = useMemo(() => {
    if (!servicio && !lastClientUpdate) return "-";

    const ts = servicio?.updatedAt || servicio?.lastUpdate || servicio?.modifiedAt || null;
    if (ts?.seconds) {
      const date = new Date(ts.seconds * 1000);
      return `${formatFecha(ts)} (${timeAgo(date)})`;
    }

    if (lastClientUpdate instanceof Date) {
      return `${formatFechaDate(lastClientUpdate)} (${timeAgo(lastClientUpdate)})`;
    }

    return "-";
  }, [servicio, lastClientUpdate]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="status-box status-box--wide">
          <h2>Cargando...</h2>
        </div>
      </div>
    );
  }

  if (!servicio) {
    return (
      <div className="page-container">
        <div className="status-box status-box--wide">
          <div className="status-header">
            <button
              className="status-back-link"
              type="button"
              onClick={handleGoBack}
              aria-label="Volver"
              title="Volver"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"
                ></path>
              </svg>
              <span>Volver</span>
            </button>
          </div>

          <h2>{lookupError ? "No se pudo consultar el servicio" : "Servicio no encontrado"}</h2>
          <p>Folio: <b>{folio}</b></p>
          <p>{lookupError || "No existe un servicio con ese folio."}</p>
        </div>
      </div>
    );
  }

  const boleta = servicio?.boleta || null;

  return (
    <div className="page-container">
      <div className="status-box status-box--wide">
        <div className="status-hero">
          <button
            type="button"
            className="status-back-link"
            onClick={handleGoBack}
            aria-label="Volver"
            title="Volver"
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"
              ></path>
            </svg>
            <span>Volver</span>
          </button>

          <div className="status-header-main">
            <span className="status-eyebrow">Seguimiento en tiempo real</span>
            <div className="status-header-topline">
              <div className="status-title-copy">
                <h2>Estado de tu servicio</h2>
                <p>Revisa el avance del equipo y la informacion clave de tu servicio.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="status-section status-section--progress">
          <div className="status-section-head">
            <div>
              <h3>Progreso</h3>
              <p>Seguimiento visual del servicio desde el ingreso hasta la entrega final.</p>
            </div>
          </div>

          <div className="status-progress-layout">
            <StatusStepper
              status={servicio.status}
              createdAt={servicio.createdAt}
              fechaAprox={servicio.fechaAprox}
              ultimaActualizacionTexto={ultimaActualizacionTexto}
            />

            <div className="status-progress-side">
              <div className="status-meta-grid status-meta-grid--side">
                <div className="status-meta-card">
                  <span>Folio</span>
                  <strong>{servicio.folio}</strong>
                </div>
                <div className="status-meta-card">
                  <span>Ingreso</span>
                  <strong>{formatFecha(servicio.createdAt)}</strong>
                </div>
                <div className="status-meta-card status-meta-card-wide">
                  <span>Ultima actualizacion</span>
                  <strong>{ultimaActualizacionTexto}</strong>
                </div>
              </div>

              <div className="status-kpis status-kpis--progress">
                <div className="status-kpi status-kpi--state">
                  <div className="k">Estado actual</div>
                  <div className="v v--wrap">{servicio.status || "-"}</div>
                </div>

                <div className="status-kpi">
                  <div className="k">Entrega aproximada</div>
                  <div className="v v--wrap">{servicio.fechaAprox || "-"}</div>
                </div>

                <div className="status-kpi status-kpi--highlight">
                  <div className="k">Costo</div>
                  <div className="v v--wrap">{precioTexto}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="status-detail-grid">
          <div className="status-section status-section--info">
            <h3>Equipo</h3>
            <p><b>Tipo:</b> {servicio.tipoDispositivo || "-"}</p>
            <p><b>Marca:</b> {servicio.marca || "-"}</p>
            <p><b>Modelo:</b> {servicio.modelo || "-"}</p>
            <p>
              <b>No. de serie:</b>{" "}
              {servicio.omitirNumeroSerie ? "No proporcionado" : servicio.numeroSerie || "-"}
            </p>
          </div>

          <div className="status-section status-section--info">
            <h3>Servicio</h3>
            <p><b>Descripcion:</b> {servicio.trabajo || "-"}</p>
            <p><b>Direccion:</b> {servicio.direccion || "-"}</p>
          </div>
        </div>

        <div className="status-section">
          <h3>Observaciones</h3>
          <div className="statusd-textarea">
            {servicio.observaciones || "Sin observaciones por ahora."}
          </div>
        </div>

        <div className="status-section">
          <h3>Boleta de venta</h3>

          {!boleta ? (
            <div className="statusd-muted">Aun no se ha generado una boleta para este servicio.</div>
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

              {Array.isArray(boleta.items) && boleta.items.length > 0 ? (
                <div className="statusd-tablewrap">
                  <table className="statusd-table">
                    <thead>
                      <tr>
                        <th>ITEM</th>
                        <th>DESCRIPCION</th>
                        <th style={{ textAlign: "right" }}>P. UNIT</th>
                        <th style={{ textAlign: "right" }}>CANT</th>
                        <th style={{ textAlign: "right" }}>IMPORTE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boleta.items.map((item, index) => {
                        const price = Number(item?.pUnitario) || 0;
                        const qty = Number(item?.cantidad) || 0;
                        const total = price * qty;

                        return (
                          <tr key={index}>
                            <td>{item?.item || "-"}</td>
                            <td>{item?.descripcion || "-"}</td>
                            <td style={{ textAlign: "right" }}>{money(price)}</td>
                            <td style={{ textAlign: "right" }}>{qty}</td>
                            <td style={{ textAlign: "right" }}>{money(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="status-notes-block">
                <b>Notas:</b>
                <div className="statusd-textarea">
                  {boleta.notas || "Sin notas."}
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
