import { createElement, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiBriefcase, FiCheck, FiShoppingBag } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { obtenerEstadoAutorizacion } from "../js/services/autorizacion";
import { completarConfiguracionInicial } from "../js/services/negocios";
import { getTiposNegocioPreset } from "../js/services/tipos_negocio";
import AppFooter from "../components/AppFooter";
import abarrotesPromo from "../assets/abarrotes.png";
import automotrizPromo from "../assets/automotirz.png";
import computoPromo from "../assets/computer.png";
import movilPromo from "../assets/movil.png";
import restaurantePromo from "../assets/modal_restaurante.png";
import "../css/onboarding.css";

const STEPS = [
  { title: "Tu negocio", icon: FiShoppingBag },
  { title: "Tipo de negocio", icon: FiBriefcase },
];
const ONBOARDING_STEP_KEY = "cajalibre_onboarding_step";
const ONBOARDING_FORM_KEY = "cajalibre_onboarding_form";
const BUSINESS_PROMO_IMAGES = {
  "soporte-computo": computoPromo,
  telefonia: movilPromo,
  "tienda-abarrotes": abarrotesPromo,
  restaurante: restaurantePromo,
  automotriz: automotrizPromo,
};

const EMPTY_FORM = {
  nombre: "",
  telefono: "",
  correoTickets: "",
  correoNotas: "",
  tipoNegocioId: "",
  administradorNombre: "",
  cantidadEmpleados: "1",
  rolesIniciales: [],
};

function readStoredStep() {
  try {
    const urlStep = Number(new URLSearchParams(window.location.search).get("paso"));
    if (Number.isInteger(urlStep) && urlStep >= 1 && urlStep <= STEPS.length) {
      return urlStep - 1;
    }
    const stored = Number(window.sessionStorage.getItem(ONBOARDING_STEP_KEY));
    return Number.isInteger(stored) && stored >= 0 && stored < STEPS.length ? stored : 0;
  } catch {
    return 0;
  }
}

function readStoredForm() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(ONBOARDING_FORM_KEY) || "null");
    if (!stored || typeof stored !== "object") return EMPTY_FORM;
    return {
      ...EMPTY_FORM,
      ...stored,
      rolesIniciales: Array.isArray(stored.rolesIniciales) ? stored.rolesIniciales : [],
    };
  } catch {
    return EMPTY_FORM;
  }
}

function storeStep(nextStep) {
  try {
    window.sessionStorage.setItem(ONBOARDING_STEP_KEY, String(nextStep));
  } catch {
    // El estado en memoria permite continuar si el almacenamiento está bloqueado.
  }
}

function storeForm(nextForm) {
  try {
    window.sessionStorage.setItem(ONBOARDING_FORM_KEY, JSON.stringify(nextForm));
  } catch {
    // El estado en memoria permite continuar si el almacenamiento está bloqueado.
  }
}

function onlyDigits(value = "") {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function isEmail(value = "") {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim());
}

async function esperarAccesoConfigurado(uid, intentos = 8) {
  let ultimoEstado = null;

  for (let intento = 0; intento < intentos; intento += 1) {
    ultimoEstado = await obtenerEstadoAutorizacion(uid);
    if (ultimoEstado?.permitido) return ultimoEstado;
    if (ultimoEstado?.motivo !== "configuracion_inicial_pendiente") break;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }

  throw new Error(
    ultimoEstado?.mensaje ||
      "La configuración se guardó, pero todavía no fue posible confirmar el acceso.",
  );
}

export default function ConfiguracionInicial() {
  const navigate = useNavigate();
  const authInfo = useAutorizacionActual();
  const { loading, uid, cuentaPrincipalUid, nombre: nombreUsuario } = authInfo;
  const { empresa } = useEmpresaConfig();
  const tipos = useMemo(() => getTiposNegocioPreset(), []);
  const [step, setStep] = useState(readStoredStep);
  const [form, setForm] = useState(readStoredForm);
  const [guardando, setGuardando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      nombre: String(empresa?.nombre || prev.nombre || "").trim(),
      telefono: onlyDigits(empresa?.telefono || prev.telefono),
      correoTickets: String(empresa?.correoTickets || prev.correoTickets || "").trim(),
      correoNotas: String(empresa?.correoNotas || prev.correoNotas || "").trim(),
      tipoNegocioId: String(empresa?.tipoNegocioId || prev.tipoNegocioId || tipos[0]?.id || ""),
      administradorNombre:
        prev.administradorNombre || String(nombreUsuario || "").trim(),
    }));
  }, [empresa, nombreUsuario, tipos]);

  useEffect(() => {
    storeStep(step);
  }, [step]);

  useEffect(() => {
    storeForm(form);
  }, [form]);

  const patch = (key, value) => {
    setError("");
    setForm((prev) => {
      const nextForm = { ...prev, [key]: value };
      storeForm(nextForm);
      return nextForm;
    });
  };

  const validateStep = (currentStep) => {
    if (currentStep === 0) {
      if (form.nombre.trim().length < 3) return "Escribe el nombre de tu negocio.";
      if (form.telefono && onlyDigits(form.telefono).length < 10) {
        return "El teléfono debe tener al menos 10 dígitos.";
      }
      if (!isEmail(form.correoTickets)) return "Escribe un correo válido para tickets.";
      if (!isEmail(form.correoNotas)) return "Escribe un correo válido para notas.";
    }
    if (currentStep === 1 && !form.tipoNegocioId) {
      return "Selecciona el tipo de negocio que más se parece al tuyo.";
    }
    return "";
  };

  const next = () => {
    const validation = validateStep(step);
    if (validation) return setError(validation);
    setError("");
    const nextStep = Math.min(STEPS.length - 1, step + 1);
    storeForm(form);
    storeStep(nextStep);
    setStep(nextStep);
    navigate(`/configuracion-inicial?paso=${nextStep + 1}`, { replace: true });
  };

  const guardar = async () => {
    if (step !== STEPS.length - 1 || guardando) return;
    const validation = validateStep(STEPS.length - 1);
    if (validation) return setError(validation);

    setGuardando(true);
    setConfigurando(true);
    setError("");
    try {
      await Promise.all([
        completarConfiguracionInicial({
          uid,
          negocioId: cuentaPrincipalUid || uid,
          nombre: form.nombre.trim(),
          telefono: onlyDigits(form.telefono),
          correoTickets: form.correoTickets.trim().toLowerCase(),
          correoNotas: form.correoNotas.trim().toLowerCase(),
          tipoNegocioId: form.tipoNegocioId,
          administradorNombre:
            form.administradorNombre.trim() || String(nombreUsuario || "").trim(),
          cantidadEmpleados: form.tipoNegocioId === "restaurante" ? 4 : 1,
          rolesIniciales: form.tipoNegocioId === "restaurante"
            ? ["Administrador", "Mesero", "Cocina", "Caja"]
            : [],
        }),
        new Promise((resolve) => window.setTimeout(resolve, 2800)),
      ]);
      await esperarAccesoConfigurado(uid);
      // Conserva el ultimo paso hasta que la nueva carga confirme el acceso.
      // Así, un listener de autorización rezagado no puede devolver el asistente al paso 1.
      storeStep(STEPS.length - 1);
      storeForm(form);
      window.location.replace("/home");
    } catch (err) {
      setConfigurando(false);
      // Si la confirmación tarda o falla, conserva el avance y los datos.
      storeStep(STEPS.length - 1);
      storeForm(form);
      setStep(STEPS.length - 1);
      setError(err?.message || "No se pudo completar la configuración inicial.");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return <><main className="onboarding-page"><section className="onboarding-card"><h1>Configuración inicial</h1><p>Preparando tu espacio de trabajo…</p></section></main><AppFooter /></>;
  }

  if (configurando) {
    return (
      <main className="setup-finishing-page" aria-live="polite">
        <div className="setup-finishing-content">
          <span className="setup-finishing-brand">CajaLibre</span>
          <h1>El dinero no debe ser una excusa para organizar y hacer crecer tu negocio.</h1>
          <p>Estamos preparando un espacio sencillo, profesional y listo para trabajar contigo.</p>
          <div className="setup-finishing-loader" aria-hidden="true"><i /><i /><i /></div>
          <strong>Configurando tu sistema…</strong>
          <small>No cierres esta ventana. En unos segundos entraremos a CajaLibre.</small>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="onboarding-page onboarding-setup-page">
        <section className="onboarding-card onboarding-card-wide setup-card">
        <header className="onboarding-head setup-head">
          <span>CajaLibre · Configuración inicial</span>
          <h1>Preparemos tu negocio</h1>
          <p>Solo tomará unos minutos. Podrás cambiar estos datos después desde Configuración.</p>
        </header>

        <div className="setup-progress" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
          {STEPS.map(({ title, icon: iconComponent }, index) => (
            <div className={`setup-progress-step${index === step ? " active" : ""}${index < step ? " done" : ""}`} key={title}>
              <i>{index < step ? <FiCheck /> : createElement(iconComponent)}</i>
              <div><small>Paso {index + 1}</small><strong>{title}</strong></div>
            </div>
          ))}
        </div>

        <form
          className="onboarding-form setup-form"
          onSubmit={(event) => event.preventDefault()}
          noValidate
        >
          {step === 0 && (
            <section className="setup-panel">
              <div className="setup-panel-title"><FiShoppingBag /><div><h2>Identidad del negocio</h2><p>Estos datos aparecerán en tickets, boletas y reportes.</p></div></div>
              <div className="setup-fields-grid">
                <label className="setup-field-full" htmlFor="setup-business-name"><span>Nombre del negocio *</span><input id="setup-business-name" name="businessName" autoComplete="organization" value={form.nombre} onChange={(e) => patch("nombre", e.target.value)} placeholder="Ej. Abarrotes La Esquina" maxLength={80} autoFocus /></label>
                <label htmlFor="setup-business-phone"><span>Teléfono de contacto</span><input id="setup-business-phone" name="businessPhone" autoComplete="tel" type="tel" value={form.telefono} onChange={(e) => patch("telefono", onlyDigits(e.target.value))} placeholder="10 dígitos" inputMode="numeric" /></label>
                <label htmlFor="setup-ticket-email"><span>Correo para tickets</span><input id="setup-ticket-email" name="ticketEmail" autoComplete="email" type="email" value={form.correoTickets} onChange={(e) => patch("correoTickets", e.target.value)} placeholder="ventas@minegocio.com" /></label>
                <label className="setup-field-full" htmlFor="setup-notes-email"><span>Correo para notas y boletas</span><input id="setup-notes-email" name="notesEmail" autoComplete="email" type="email" value={form.correoNotas} onChange={(e) => patch("correoNotas", e.target.value)} placeholder="notas@minegocio.com" /></label>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="setup-panel">
              <div className="setup-panel-title"><FiBriefcase /><div><h2>¿Qué tipo de negocio administrarás?</h2><p>Adaptaremos los módulos y campos de CajaLibre a tu forma de trabajar.</p></div></div>
              <div className="setup-business-grid">
                {tipos.map((tipo) => (
                  <button type="button" key={tipo.id} className={`setup-business-option${form.tipoNegocioId === tipo.id ? " selected" : ""}`} onClick={() => patch("tipoNegocioId", tipo.id)}>
                    {BUSINESS_PROMO_IMAGES[tipo.id] && (
                      <img
                        className="setup-business-promo-image"
                        src={BUSINESS_PROMO_IMAGES[tipo.id]}
                        alt={`Vista de la versión ${tipo.nombre}`}
                      />
                    )}
                    <span className="setup-radio">{form.tipoNegocioId === tipo.id && <FiCheck />}</span>
                    <strong>{tipo.nombre}</strong>
                    <p>{tipo.descripcion || (tipo.serviciosHabilitados === false ? "Ventas, productos e inventario." : "Servicios, clientes y seguimiento técnico.")}</p>
                    <small>{tipo.serviciosHabilitados === false ? "POS e inventario" : "POS y servicios"}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          {error && <div className="onboarding-error" role="alert">{error}</div>}
          <footer className="setup-actions">
            <button type="button" className="onboarding-btn-soft" onClick={() => {
              const previousStep = Math.max(0, step - 1);
              storeStep(previousStep);
              setStep(previousStep);
              navigate(`/configuracion-inicial?paso=${previousStep + 1}`, { replace: true });
            }} disabled={step === 0 || guardando}><FiArrowLeft /> Anterior</button>
            <span>{step + 1} de {STEPS.length}</span>
            {step < STEPS.length - 1 ? <button type="button" className="onboarding-btn-primary" onClick={next}>Continuar <FiArrowRight /></button> : <button type="button" className="onboarding-btn-primary" disabled={guardando} onClick={guardar}>{guardando ? "Preparando el sistema…" : "Configurar y entrar"} <FiCheck /></button>}
          </footer>
        </form>
        </section>
      </main>
      <AppFooter />
    </>
  );
}
