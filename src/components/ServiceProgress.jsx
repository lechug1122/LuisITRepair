import { getServiceTrackingState, getServiceTrackingSteps } from "../js/utils/service_tracking_status.js";
import "../css/service_progress.css";

export default function ServiceProgress({ status }) {
  const info = getServiceTrackingState(status);
  const steps = getServiceTrackingSteps(status);

  return <div className={`service-progress service-progress--${info.theme}`}>
    <div className="service-progress-summary">
      <div className="service-progress-current" aria-live="polite"><span aria-hidden="true" />{info.label}</div>
      <span className="service-progress-count">Etapa <strong>{info.step + 1}</strong> de {steps.length}</span>
    </div>
    <ol className="service-progress-stages" aria-label="Etapas del servicio">
      {steps.map((step, index) => {
        const state = info.key === "entregado" || index < info.step ? "complete" : index === info.step ? "current" : "pending";
        return <li key={step.key} className={`service-progress-stage service-progress-stage--${state}`} aria-current={state === "current" ? "step" : undefined}>
          <span className="service-progress-number" aria-hidden="true">{state === "complete" ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg> : String(index + 1).padStart(2, "0")}</span>
          <div className="service-progress-copy"><strong>{step.title}</strong><span>{state === "current" ? "Etapa actual" : state === "complete" ? "Completado" : "Pendiente"}</span></div>
          {state === "current" ? <span className="service-progress-active-mark" aria-hidden="true" /> : null}
        </li>;
      })}
    </ol>
  </div>;
}
