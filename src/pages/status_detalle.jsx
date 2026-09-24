import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { buscarServicioPublicoPorFolio } from "../js/services/servicios_firestore";
import { observeServiceTracking } from "../js/services/service_tracking_live.js";
import { getServiceTrackingState as stateInfo, getServiceTrackingSteps } from "../js/utils/service_tracking_status.js";
import { generarPdfHojaServicio } from "../js/services/pdf_hoja_servicio.js";
import { agruparEvidencias, leerEvidencias } from "../js/services/servicio_evidencias.js";
import { generarPdfBoletaVenta } from "../js/services/pdf_boleta_venta.js";
import { datosPdfBoleta, leerBoletaPublica } from "../js/services/servicio_boleta_publica.js";
import StatusAceptacionCliente from "../components/StatusAceptacionCliente.jsx";
import "../css/status.css";

function formatFecha(ts) {
  if (typeof ts?.seconds !== "number") return "Sin registrar";
  return new Date(ts.seconds * 1000).toLocaleString("es-MX", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function BackButton({ onClick }) {
  return <button type="button" className="status-back-link" onClick={onClick} aria-label="Volver a la consulta" title="Volver">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
  </button>;
}

function StatusStepper({ info, createdAt, fechaAprox }) {
  const details = [
    `Ingreso: ${formatFecha(createdAt)}`,
    "Diagnóstico del equipo y evaluación del trabajo.",
    fechaAprox ? `Fecha estimada: ${fechaAprox}` : "Esta etapa se utiliza cuando se necesitan piezas o aprobación.",
    "Trabajo técnico para resolver la falla.",
    "Resultado del servicio y preparación de la entrega.",
    "Entrega del equipo al cliente.",
  ];
  const steps = getServiceTrackingSteps(info.key);
  return <ol className={`status-stepper-box status-stepper-theme-${info.theme}`} aria-label="Etapas del servicio">
    {steps.map((step, index) => {
      const state = info.key === "entregado" || index < info.step ? "completed" : index === info.step ? "active" : "pending";
      return <li key={step.key} className={`status-stepper-step status-stepper-${state}`} aria-current={state === "active" ? "step" : undefined}>
        <div className="status-stepper-circle" aria-hidden="true">{state === "completed" ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 4 4L19 6" /></svg> : index + 1}</div>
        <div className="status-stepper-content"><div className="status-stepper-title">{step.title}</div>
          <span className="status-stepper-status">{state === "active" ? "Etapa actual" : state === "completed" ? "Completado" : "Pendiente"}</span>
          <p className="status-stepper-time">{state === "active" ? info.detail : details[index]}</p>
        </div>
      </li>;
    })}
  </ol>;
}

export default function StatusDetalleCliente() {
  const { folio: folioParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const folio = useMemo(() => {
    const raw = String(folioParam || "").trim();
    try { return decodeURIComponent(raw); } catch { return raw; }
  }, [folioParam]);
  const [loading, setLoading] = useState(true);
  const [servicio, setServicio] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [lastClientUpdate, setLastClientUpdate] = useState(null);
  const [exportingSheet, setExportingSheet] = useState(false);
  const [exportingReceipt, setExportingReceipt] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const acceptanceReference = useMemo(
    () => new URLSearchParams(location.search).get("aceptacion") || "",
    [location.search],
  );

  function handleGoBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/status");
  }

  useEffect(() => {
    let cancelled = false;
    let unsubscribe;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setServicio(null);
      setLookupError("");
      unsubscribe = observeServiceTracking({
        folio,
        lookup: (folioConsultado) => buscarServicioPublicoPorFolio(
          folioConsultado,
          acceptanceReference,
        ),
        onData: (data) => {
          setServicio(data);
          setLastClientUpdate(new Date());
          setLookupError("");
          setLoading(false);
        },
        onError: (err) => {
          console.error("Consulta pública de servicio:", err);
          setLookupError("No se pudo actualizar el servicio. Volveremos a intentarlo automáticamente.");
          setLoading(false);
        },
      });
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [acceptanceReference, folio]);

  useEffect(() => {
    if (loading || !acceptanceReference) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById("aceptacion-cliente")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [acceptanceReference, loading]);

  if (loading) return <main className="status-page status-page--centered"><section className="status-box status-empty" role="status" aria-live="polite">
    <span className="status-loader" aria-hidden="true" /><h1>Consultando tu servicio</h1><p>Estamos buscando la información de tu folio.</p>
  </section></main>;

  if (!servicio) return <main className="status-page status-page--centered"><section className="status-box status-empty">
    <div className="status-header"><BackButton onClick={handleGoBack} /><span className="status-eyebrow">Consulta de servicio</span></div>
    <h1>{lookupError ? "No se pudo consultar el servicio" : "Servicio no encontrado"}</h1>
    <div className="status-empty-folio">Folio <strong>{folio}</strong></div>
    <p role={lookupError ? "alert" : undefined}>{lookupError || "No hay un servicio disponible para consulta con ese folio. Comprueba que esté escrito correctamente."}</p>
    <button className="status-button" type="button" onClick={() => navigate("/status")}>Consultar otro folio</button>
  </section></main>;

  const info = stateInfo(servicio.status);
  const updatedAt = servicio.updatedAt || servicio.lastUpdate || servicio.modifiedAt;
  const updatedText = typeof updatedAt?.seconds === "number" ? formatFecha(updatedAt) : lastClientUpdate?.toLocaleString("es-MX") || "Sin registrar";
  const evidenceGroups = agruparEvidencias(leerEvidencias(servicio)).filter((group) => group.fotos.length);

  const downloadServiceSheet = async () => {
    if (exportingSheet) return;
    setExportingSheet(true);
    setDownloadError("");
    try {
      const result = await generarPdfHojaServicio({
        ...servicio,
        nombre: servicio.aceptacion?.nombreCliente || "Cliente",
        telefono: "",
        direccion: "",
      }, servicio.folio || folio, {
        download: true,
        empresaOverride: {
          nombre: servicio.negocioNombre || "CajaLibre",
          logo: servicio.negocioLogo || "",
        },
      });
      if (result?.ok === false) throw result.error || new Error("PDF no generado");
    } catch (error) {
      console.error("Descarga pública de hoja de servicio:", error);
      setDownloadError("No pudimos preparar la hoja de servicio. Intenta nuevamente.");
    } finally {
      setExportingSheet(false);
    }
  };

  // La boleta se arma con la marca que ya trajo la consulta publica: en esta
  // pantalla el cliente no tiene sesion y el PDF no puede leer Firestore.
  const downloadReceipt = async () => {
    if (exportingReceipt) return;
    const boleta = leerBoletaPublica(servicio);
    if (!boleta) {
      setDownloadError("Esta orden todavía no tiene una boleta desglosada.");
      return;
    }
    setExportingReceipt(true);
    setDownloadError("");
    try {
      await generarPdfBoletaVenta(
        datosPdfBoleta(servicio, boleta, servicio.folio || folio),
        {
          empresaOverride: {
            nombre: servicio.negocioNombre || "CajaLibre",
            logo: servicio.negocioLogo || "",
          },
        },
      );
    } catch (error) {
      console.error("Descarga pública de boleta:", error);
      setDownloadError("No pudimos preparar la boleta. Intenta nuevamente.");
    } finally {
      setExportingReceipt(false);
    }
  };

  return <main className="status-page"><div className="status-box status-box--wide">
    <header className="status-toolbar">
      <BackButton onClick={handleGoBack} />
      <div className="status-business-brand">
        {servicio.negocioLogo ? <img src={servicio.negocioLogo} alt="" width="64" height="64" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
        <div className="status-business-copy"><span>Servicio de</span><strong>{servicio.negocioNombre || "CajaLibre"}</strong></div>
      </div>
      <div className="status-toolbar-folio"><span>Folio de servicio</span><strong>{servicio.folio}</strong></div>
    </header>

    <section className="status-hero" aria-labelledby="status-title">
      <div className="status-title-copy"><span className="status-eyebrow">Consulta de servicio</span><h1 id="status-title">Seguimiento de tu servicio</h1><p>Revisa el avance de tu equipo y los detalles del trabajo.</p></div>
      <div className="status-current-state"><span>Estado actual</span><strong className={`status-state-pill status-state-pill--${info.theme}`}><i aria-hidden="true" />{info.label}</strong></div>
    </section>
    <div className="status-sync-note" role="status" aria-live="polite">{lookupError || "Actualización automática cada 15 segundos mientras esta página esté abierta."}</div>

    <div className="status-progress-layout">
      <section className="status-section status-section--progress" aria-labelledby="status-progress-title">
        <div className="status-section-head"><div><h2 id="status-progress-title">Progreso del servicio</h2><p>La etapa resaltada indica dónde se encuentra tu equipo.</p></div></div>
        <StatusStepper info={info} createdAt={servicio.createdAt} fechaAprox={servicio.fechaAprox} />
      </section>

      <aside className="status-progress-side" aria-label="Información del servicio">
        <section className="status-section"><h2>Fechas del servicio</h2><dl className="status-dates"><div><dt>Ingreso</dt><dd>{formatFecha(servicio.createdAt)}</dd></div><div><dt>Última actualización</dt><dd>{updatedText}</dd></div></dl>
          <div className="status-delivery"><span>Entrega aproximada</span><strong>{servicio.fechaAprox || "Por confirmar"}</strong>{!servicio.fechaAprox ? <p>El negocio confirmará la fecha de entrega.</p> : null}</div>
        </section>
        <section className="status-section"><h2>Tu equipo</h2><dl className="status-equipment"><div><dt>Tipo</dt><dd>{servicio.tipoDispositivo || "Sin especificar"}</dd></div><div><dt>Marca</dt><dd>{servicio.marca || "Sin especificar"}</dd></div><div><dt>Modelo</dt><dd>{servicio.modelo || "Sin especificar"}</dd></div></dl></section>
        <section className="status-section"><h2>Trabajo solicitado</h2><p className="status-service-description">{servicio.trabajo || "Sin descripción registrada."}</p></section>
      </aside>
    </div>

    <div className="status-customer-record">
      <StatusAceptacionCliente
        referencia={acceptanceReference}
        servicio={servicio}
        evidenceGroups={evidenceGroups}
        onDownload={downloadServiceSheet}
        onDownloadBoleta={downloadReceipt}
        exportingSheet={exportingSheet}
        exportingReceipt={exportingReceipt}
        downloadError={downloadError}
        onRespondida={(aceptacion, resultado) => setServicio((actual) => ({
          ...actual,
          aceptacion,
          status: actual.status === "esperando_autorizacion"
            ? (resultado.estado === "aceptado" ? "autorizado" : "rechazado")
            : actual.status,
        }))}
      />

    </div>
    <footer className="statusd-foot"><span>¿Tienes dudas sobre tu servicio? Menciona tu folio <strong>{servicio.folio}</strong> al contactar al negocio.</span></footer>
  </div></main>;
}
