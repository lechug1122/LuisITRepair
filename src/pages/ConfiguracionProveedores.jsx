import { useEffect, useMemo, useState } from "react";
import PageLoader from "../components/PageLoader";
import useProveedores from "../hooks/useProveedores";
import {
  DEFAULT_COMPRA_PROVEEDOR,
  DEFAULT_PROVEEDOR,
  PROVEEDOR_COMPRA_ESTADO_OPTIONS,
  PROVEEDOR_ESTADO_OPTIONS,
  PROVEEDOR_MONEDA_OPTIONS,
  PROVEEDOR_TIPO_SUGERIDO,
  eliminarProveedor,
  guardarProveedor,
  registrarCompraProveedor,
} from "../js/services/proveedores_firestore";

const LIST_FIELDS = new Set(["categorias", "marcas", "productosServicios"]);

const SECTIONS = [
  {
    title: "Datos generales",
    text: "Identidad comercial, categorias, marcas y alcance del proveedor.",
    fields: [
      { key: "nombre", label: "Nombre del proveedor", maxLength: 120 },
      { key: "nombreComercial", label: "Nombre comercial", maxLength: 120 },
      { key: "tipoProveedor", label: "Tipo de proveedor", list: "proveedor-tipos", maxLength: 80 },
      { key: "estado", label: "Estado", type: "select", options: PROVEEDOR_ESTADO_OPTIONS },
      { key: "moneda", label: "Moneda principal", type: "select", options: PROVEEDOR_MONEDA_OPTIONS },
      { key: "tiempoEntrega", label: "Tiempo de entrega", maxLength: 80 },
      { key: "categorias", label: "Categorias que maneja", type: "textarea", full: true, preview: true },
      { key: "marcas", label: "Marcas que distribuye", type: "textarea", full: true, preview: true },
      {
        key: "productosServicios",
        label: "Productos o servicios que vende",
        type: "textarea",
        full: true,
        preview: true,
      },
      {
        key: "listaPrecios",
        label: "Lista de precios o referencia",
        type: "textarea",
        full: true,
      },
    ],
  },
  {
    title: "Contacto y ubicacion",
    text: "Responsable, medios de contacto y referencias fiscales.",
    fields: [
      { key: "contactoPrincipal", label: "Contacto principal", maxLength: 120 },
      { key: "telefono", label: "Telefono", maxLength: 30 },
      { key: "whatsapp", label: "WhatsApp", maxLength: 30 },
      { key: "correo", label: "Correo electronico", type: "email", maxLength: 140 },
      { key: "sitioWeb", label: "Sitio web", type: "url", maxLength: 200 },
      { key: "rfc", label: "RFC o datos fiscales", maxLength: 30, upper: true },
      { key: "direccion", label: "Direccion", type: "textarea", full: true },
      { key: "ciudadEstado", label: "Ciudad / estado", full: true, maxLength: 120 },
    ],
  },
  {
    title: "Compra y pago",
    text: "Credito, montos, bancos, descuentos y condiciones comerciales.",
    fields: [
      { key: "costoEnvio", label: "Costo de envio", inputMode: "decimal", maxLength: 12 },
      { key: "pedidoMinimo", label: "Pedido minimo", inputMode: "decimal", maxLength: 12 },
      { key: "diasCredito", label: "Dias de credito", inputMode: "numeric", maxLength: 4 },
      { key: "descuentoHabitual", label: "Descuento habitual %", inputMode: "decimal", maxLength: 6 },
      { key: "condicionesPago", label: "Condiciones de pago", type: "textarea", full: true },
      { key: "banco", label: "Banco", maxLength: 80 },
      { key: "cuenta", label: "Cuenta", maxLength: 40 },
      { key: "clabe", label: "CLABE", inputMode: "numeric", maxLength: 18 },
    ],
  },
  {
    title: "Garantias e historial",
    text: "Politicas internas, compras y evaluacion del proveedor.",
    fields: [
      { key: "garantia", label: "Garantia que ofrece", type: "textarea", full: true },
      { key: "politicaDevoluciones", label: "Politica de devoluciones", type: "textarea", full: true },
      { key: "ultimaCompraFecha", label: "Ultima compra", type: "date" },
      { key: "montoTotalComprado", label: "Monto total comprado", inputMode: "decimal", maxLength: 14 },
      { key: "calificacion", label: "Calificacion interna", inputMode: "decimal", maxLength: 4 },
      { key: "notasInternas", label: "Notas internas", type: "textarea", full: true },
    ],
  },
];

function moneyInput(value) {
  const clean = String(value ?? "").replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole = "", decimals = ""] = clean.split(".");
  return decimals ? `${whole}.${decimals.slice(0, 2)}` : whole;
}

function integerInput(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function decimalInput(value, maxDecimals = 1) {
  const clean = String(value ?? "").replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole = "", decimals = ""] = clean.split(".");
  return decimals ? `${whole}.${decimals.slice(0, maxDecimals)}` : whole;
}

function splitList(value) {
  return String(value ?? "")
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toFormState(proveedor = DEFAULT_PROVEEDOR) {
  return {
    ...DEFAULT_PROVEEDOR,
    ...proveedor,
    categorias: Array.isArray(proveedor.categorias) ? proveedor.categorias.join(", ") : "",
    marcas: Array.isArray(proveedor.marcas) ? proveedor.marcas.join(", ") : "",
    productosServicios: Array.isArray(proveedor.productosServicios)
      ? proveedor.productosServicios.join(", ")
      : "",
    costoEnvio: proveedor.costoEnvio ? String(proveedor.costoEnvio) : "",
    pedidoMinimo: proveedor.pedidoMinimo ? String(proveedor.pedidoMinimo) : "",
    diasCredito: proveedor.diasCredito ? String(proveedor.diasCredito) : "",
    descuentoHabitual:
      proveedor.descuentoHabitual || proveedor.descuentoHabitual === 0
        ? String(proveedor.descuentoHabitual)
        : "",
    calificacion: proveedor.calificacion || proveedor.calificacion === 0 ? String(proveedor.calificacion) : "",
    montoTotalComprado: proveedor.montoTotalComprado ? String(proveedor.montoTotalComprado) : "",
  };
}

function todayInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function toCompraFormState(compra = DEFAULT_COMPRA_PROVEEDOR) {
  return {
    ...DEFAULT_COMPRA_PROVEEDOR,
    ...compra,
    fecha: compra.fecha || todayInputValue(),
    monto: compra.monto ? String(compra.monto) : "",
  };
}

function formatMoney(value, currency = "MXN") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDate(value) {
  if (!value) return "Sin registro";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

function estadoClassName(estado) {
  return `state-${String(estado || "activo").toLowerCase().replace(/\s+/g, "-")}`;
}

function formatDateTime(value) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function buildWhatsAppHref(proveedor) {
  const raw = proveedor?.whatsapp || proveedor?.telefono || "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.length === 10 ? `52${digits}` : digits;
  const proveedorNombre = proveedor?.nombreComercial || proveedor?.nombre || "tu negocio";
  const text = encodeURIComponent(`Hola, quiero solicitar una cotizacion para ${proveedorNombre}.`);
  return `https://wa.me/${normalized}?text=${text}`;
}

export default function ConfiguracionProveedores() {
  const { proveedores, loading, recargar } = useProveedores();
  const [form, setForm] = useState(() => toFormState());
  const [editingId, setEditingId] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [historialProveedor, setHistorialProveedor] = useState(null);
  const [compraForm, setCompraForm] = useState(() => toCompraFormState());
  const [currentStep, setCurrentStep] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [guardando, setGuardando] = useState(false);
  const [guardandoCompra, setGuardandoCompra] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");
  const hasOpenModal = showModal || !!historialProveedor;

  useEffect(() => {
    if (!mensaje && !errorDetalle) return undefined;
    const timer = window.setTimeout(() => {
      setMensaje("");
      setErrorDetalle("");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [mensaje, errorDetalle]);

  useEffect(() => {
    if (!hasOpenModal) return undefined;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (showModal) {
          setShowModal(false);
          setEditingId("");
          setForm(toFormState());
          setCurrentStep(0);
        } else {
          setHistorialProveedor(null);
          setCompraForm(toCompraFormState());
        }
        setErrorDetalle("");
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hasOpenModal, showModal]);

  useEffect(() => {
    if (!historialProveedor?.id) return;
    const actualizado =
      proveedores.find((item) => item.id === historialProveedor.id) || historialProveedor;
    if (actualizado !== historialProveedor) {
      setHistorialProveedor(actualizado);
    }
  }, [proveedores, historialProveedor]);

  const resumen = useMemo(
    () => ({
      total: proveedores.length,
      activos: proveedores.filter((item) => item.estado === "Activo").length,
      conCredito: proveedores.filter((item) => Number(item.diasCredito || 0) > 0).length,
      promedio: proveedores.length
        ? (
            proveedores.reduce((acc, item) => acc + Number(item.calificacion || 0), 0) /
            proveedores.length
          ).toFixed(1)
        : "0.0",
    }),
    [proveedores],
  );

  const proveedoresFiltrados = useMemo(() => {
    const search = busqueda.trim().toLowerCase();
    return proveedores.filter((item) => {
      if (filtroEstado !== "Todos" && item.estado !== filtroEstado) return false;
      return !search || String(item.searchText || "").includes(search);
    });
  }, [proveedores, busqueda, filtroEstado]);

  const onFieldChange = (field, rawValue, fieldMeta = {}) => {
    let value = rawValue;
    if (fieldMeta.upper) value = String(value).toUpperCase();
    if (field === "costoEnvio" || field === "pedidoMinimo" || field === "montoTotalComprado") value = moneyInput(value);
    if (field === "diasCredito" || field === "clabe") value = integerInput(value);
    if (field === "descuentoHabitual") value = decimalInput(value, 2);
    if (field === "calificacion") value = decimalInput(value, 1);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const currentSection = SECTIONS[currentStep] || SECTIONS[0];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === SECTIONS.length - 1;

  const resetForm = () => {
    setEditingId("");
    setForm(toFormState());
    setCurrentStep(0);
    setErrorDetalle("");
  };

  const abrirNuevoProveedor = () => {
    resetForm();
    setShowModal(true);
  };

  const cerrarModal = () => {
    resetForm();
    setShowModal(false);
  };

  const abrirComprasProveedor = (proveedor) => {
    setHistorialProveedor(proveedor);
    setCompraForm(toCompraFormState());
    setErrorDetalle("");
  };

  const cerrarHistorial = () => {
    setHistorialProveedor(null);
    setCompraForm(toCompraFormState());
    setErrorDetalle("");
  };

  const editarProveedor = (proveedor) => {
    setEditingId(proveedor.id);
    setForm(toFormState(proveedor));
    setCurrentStep(0);
    setErrorDetalle("");
    setShowModal(true);
  };

  const irAStep = (nextStep) => {
    setCurrentStep(Math.max(0, Math.min(SECTIONS.length - 1, nextStep)));
  };

  const borrarProveedor = async (proveedor) => {
    if (!window.confirm(`Se eliminara el proveedor "${proveedor.nombre || "sin nombre"}".`)) return;
    try {
      await eliminarProveedor(proveedor.id);
      await recargar({ silent: true });
      if (editingId === proveedor.id) resetForm();
      if (historialProveedor?.id === proveedor.id) cerrarHistorial();
      setMensaje("Proveedor eliminado.");
    } catch (error) {
      console.error("No se pudo eliminar proveedor:", error);
      setMensaje("No se pudo eliminar el proveedor.");
      setErrorDetalle(String(error?.code || error?.message || "Error desconocido"));
    }
  };

  const guardar = async (event) => {
    event.preventDefault();
    if (guardando) return;
    if (!String(form.nombre || "").trim()) {
      setMensaje("Captura al menos el nombre del proveedor.");
      setErrorDetalle("Falta el nombre principal.");
      return;
    }
    try {
      const isEditing = !!editingId;
      setGuardando(true);
      setErrorDetalle("");
      await guardarProveedor(form, editingId);
      await recargar({ silent: true });
      resetForm();
      setShowModal(false);
      setMensaje(isEditing ? "Proveedor actualizado." : "Proveedor guardado.");
    } catch (error) {
      console.error("No se pudo guardar proveedor:", error);
      setMensaje("No se pudo guardar el proveedor.");
      setErrorDetalle(String(error?.code || error?.message || "Error desconocido"));
    } finally {
      setGuardando(false);
    }
  };

  const guardarCompra = async (event) => {
    event.preventDefault();
    if (guardandoCompra || !historialProveedor?.id) return;

    try {
      setGuardandoCompra(true);
      setErrorDetalle("");
      const proveedorActualizado = await registrarCompraProveedor(historialProveedor.id, compraForm);
      setHistorialProveedor(proveedorActualizado);
      setCompraForm(toCompraFormState());
      await recargar({ silent: true });
      setMensaje("Compra registrada en el historial del proveedor.");
    } catch (error) {
      console.error("No se pudo registrar compra del proveedor:", error);
      setMensaje("No se pudo registrar la compra.");
      setErrorDetalle(String(error?.code || error?.message || "Error desconocido"));
    } finally {
      setGuardandoCompra(false);
    }
  };

  if (loading) return <PageLoader text="Cargando proveedores..." />;

  return (
    <section className="cfg-pos-wrap cfg-proveedores-wrap">
      <div className="cfg-pos-page-head">
        <h2>Proveedores</h2>
        <p>Registra contactos, credito, garantias, catalogos e historial para comparar a quien le compras.</p>
      </div>

      <div className="cfg-proveedores-summary-grid">
        <div className="cfg-proveedores-summary-card"><span>Total</span><strong>{resumen.total}</strong><small>Registros disponibles para compras.</small></div>
        <div className="cfg-proveedores-summary-card"><span>Activos</span><strong>{resumen.activos}</strong><small>Listos para cotizar o surtir.</small></div>
        <div className="cfg-proveedores-summary-card"><span>Con credito</span><strong>{resumen.conCredito}</strong><small>Proveedores con dias de credito capturados.</small></div>
        <div className="cfg-proveedores-summary-card"><span>Calificacion</span><strong>{resumen.promedio}/5</strong><small>Promedio interno del catalogo.</small></div>
      </div>

      <div className="cfg-proveedores-layout">
        <div className="cfg-pos-card cfg-empresa-editor-card cfg-proveedores-list-card">
          <div className="cfg-servicios-head">
            <div>
              <h3>Base de proveedores</h3>
              <p>Busca por nombre, contacto, categoria, marca o RFC.</p>
            </div>
            <div className="cfg-proveedores-list-head-actions">
              <div className="cfg-proveedores-list-meta"><span>{proveedoresFiltrados.length} visibles</span></div>
              <button
                type="button"
                className="cfg-empresa-preset-btn"
                onClick={abrirNuevoProveedor}
              >
                + Nuevo proveedor
              </button>
            </div>
          </div>

          {mensaje ? (
            <div className="cfg-proveedores-inline-feedback">
              <span className={errorDetalle ? "cfg-proveedores-error" : "cfg-pos-saved"}>
                {mensaje}
              </span>
              {errorDetalle ? <small className="cfg-proveedores-error">{errorDetalle}</small> : null}
            </div>
          ) : null}

          <div className="cfg-proveedores-toolbar">
            <label className="cfg-empresa-field"><span>Buscar</span><input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} maxLength={120} placeholder="Nombre, contacto, categoria..." /></label>
            <label className="cfg-empresa-field"><span>Estado</span><select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}><option value="Todos">Todos</option>{PROVEEDOR_ESTADO_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>

          {proveedoresFiltrados.length ? (
            <div className="cfg-proveedores-list-grid">
              {proveedoresFiltrados.map((proveedor) => (
                <article
                  key={proveedor.id}
                  className={`cfg-proveedores-card ${((showModal && editingId === proveedor.id) || historialProveedor?.id === proveedor.id) ? "active" : ""}`}
                >
                  <div className="cfg-proveedores-card-head">
                    <div><strong>{proveedor.nombre || "Proveedor sin nombre"}</strong><p>{proveedor.nombreComercial || "Sin nombre comercial"}</p></div>
                    <span className={`cfg-proveedores-state ${estadoClassName(proveedor.estado)}`}>{proveedor.estado}</span>
                  </div>
                  <div className="cfg-proveedores-card-summary">
                    <span>{proveedor.contactoPrincipal || proveedor.telefono || "Sin contacto"}</span>
                    <span>{proveedor.moneda || "MXN"}</span>
                    <span>{proveedor.tiempoEntrega || "Sin tiempo de entrega"}</span>
                    <span>{Number(proveedor.diasCredito || 0) > 0 ? `${proveedor.diasCredito} dias de credito` : "Sin credito"}</span>
                  </div>
                  <div className="cfg-proveedores-card-grid">
                    <div><span className="cfg-proveedores-label">Correo</span><p>{proveedor.correo || "Sin correo"}</p></div>
                    <div><span className="cfg-proveedores-label">WhatsApp</span><p>{proveedor.whatsapp || proveedor.telefono || "Sin numero"}</p></div>
                    <div><span className="cfg-proveedores-label">Ultima compra</span><p>{formatDate(proveedor.ultimaCompraFecha)}</p></div>
                    <div><span className="cfg-proveedores-label">Monto</span><p>{formatMoney(proveedor.montoTotalComprado, proveedor.moneda)}</p></div>
                  </div>
                  {[...LIST_FIELDS].some((key) => splitList(proveedor[key] || proveedor[key]?.join?.(", ")).length) ? (
                    <div className="cfg-empresa-chip-row cfg-proveedores-card-chips">
                      {[...(proveedor.categorias || []), ...(proveedor.marcas || [])].slice(0, 5).map((item) => <span key={`${proveedor.id}_${item}`} className="cfg-empresa-chip">{item}</span>)}
                    </div>
                  ) : null}
                  {proveedor.notasInternas ? <div className="cfg-proveedores-card-note"><strong>Notas:</strong> {proveedor.notasInternas}</div> : null}
                  <div className="cfg-proveedores-card-actions">
                    {buildWhatsAppHref(proveedor) ? (
                      <a
                        className="cfg-empresa-preset-btn cfg-proveedores-link-btn cfg-proveedores-whatsapp-btn"
                        href={buildWhatsAppHref(proveedor)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    ) : null}
                    <button type="button" className="cfg-empresa-secondary-btn cfg-proveedores-history-btn" onClick={() => abrirComprasProveedor(proveedor)}>Compras</button>
                    <button type="button" className="cfg-empresa-secondary-btn" onClick={() => editarProveedor(proveedor)}>Editar</button>
                    {proveedor.sitioWeb ? <a className="cfg-empresa-preset-btn cfg-proveedores-link-btn" href={proveedor.sitioWeb} target="_blank" rel="noreferrer">Abrir web</a> : null}
                    <button type="button" className="cfg-servicios-remove-btn" onClick={() => borrarProveedor(proveedor)}>Eliminar</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="cfg-grid-empty cfg-proveedores-empty"><strong>No hay proveedores para mostrar.</strong><p>Ajusta el filtro o registra el primero desde el formulario.</p></div>
          )}
        </div>
      </div>

      {showModal ? (
        <div className="cfg-proveedores-modal-overlay" onClick={cerrarModal}>
          <div
            className="cfg-proveedores-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cfg-proveedores-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cfg-proveedores-modal-head">
              <div>
                <h3 id="cfg-proveedores-modal-title">
                  {editingId ? "Editar proveedor" : "Nuevo proveedor"}
                </h3>
                <p>
                  {editingId
                    ? "Actualiza condiciones y datos comerciales desde un modal comodo y adaptable."
                    : "Captura un proveedor completo sin salir del listado principal."}
                </p>
              </div>
              <div className="cfg-proveedores-modal-head-actions">
                {editingId ? (
                  <button
                    type="button"
                    className="cfg-empresa-secondary-btn"
                    onClick={abrirNuevoProveedor}
                  >
                    Nuevo proveedor
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cfg-empresa-secondary-btn"
                    onClick={resetForm}
                  >
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  className="cfg-empresa-secondary-btn"
                  onClick={cerrarModal}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <form className="cfg-proveedores-form" onSubmit={guardar}>
              <div className="cfg-proveedores-stepper" aria-label="Pasos del proveedor">
                {SECTIONS.map((section, index) => (
                  <button
                    key={section.title}
                    type="button"
                    className={`cfg-proveedores-step ${index === currentStep ? "active" : ""} ${index < currentStep ? "done" : ""}`}
                    onClick={() => irAStep(index)}
                  >
                    <span className="cfg-proveedores-step-index">{index + 1}</span>
                    <span className="cfg-proveedores-step-copy">
                      <strong>{section.title}</strong>
                      <small>{section.text}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="cfg-ticket-block cfg-ticket-block-wide cfg-proveedores-modal-page">
                <div className="cfg-proveedores-section-head cfg-proveedores-modal-page-head">
                  <div>
                    <span className="cfg-proveedores-step-kicker">
                      Paso {currentStep + 1} de {SECTIONS.length}
                    </span>
                    <h4>{currentSection.title}</h4>
                    <p>{currentSection.text}</p>
                  </div>
                  {currentSection.title === "Datos generales" ? (
                    <span className={`cfg-proveedores-state ${estadoClassName(form.estado)}`}>{form.estado || "Activo"}</span>
                  ) : null}
                </div>
                <div className="cfg-proveedores-section-grid">
                  {currentSection.fields.map((field) => (
                    <label key={field.key} className={`cfg-empresa-field ${field.full ? "cfg-empresa-field-full" : ""}`}>
                      {field.label}
                      {field.type === "textarea" ? (
                        <textarea value={form[field.key] || ""} onChange={(e) => onFieldChange(field.key, e.target.value, field)} />
                      ) : field.type === "select" ? (
                        <select value={form[field.key] || ""} onChange={(e) => onFieldChange(field.key, e.target.value, field)}>
                          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input
                          type={field.type || "text"}
                          inputMode={field.inputMode}
                          list={field.list}
                          maxLength={field.maxLength}
                          value={form[field.key] || ""}
                          onChange={(e) => onFieldChange(field.key, e.target.value, field)}
                        />
                      )}
                      {field.preview ? (
                        <div className="cfg-empresa-chip-row cfg-proveedores-chip-row">
                          {splitList(form[field.key]).map((item) => <span key={`${field.key}_${item}`} className="cfg-empresa-chip">{item}</span>)}
                          {!splitList(form[field.key]).length ? <small className="cfg-pos-help">Separa con comas para generar etiquetas.</small> : null}
                        </div>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>

              <div className="cfg-servicios-savebar cfg-proveedores-savebar">
                <div className="cfg-proveedores-modal-progress">
                  <strong>{currentSection.title}</strong>
                  <small>Puedes moverte entre paginas sin perder lo que ya capturaste.</small>
                </div>
                <div className="cfg-proveedores-save-actions">
                  <button type="button" className="cfg-empresa-secondary-btn" onClick={cerrarModal}>Cancelar</button>
                  <button type="button" className="cfg-empresa-secondary-btn" onClick={() => irAStep(currentStep - 1)} disabled={isFirstStep}>Anterior</button>
                  {!isLastStep ? (
                    <button type="button" className="cfg-empresa-preset-btn" onClick={() => irAStep(currentStep + 1)}>Siguiente</button>
                  ) : (
                    <button type="submit" className="cfg-empresa-preset-btn" disabled={guardando}>{guardando ? "Guardando..." : editingId ? "Guardar cambios" : "Guardar proveedor"}</button>
                  )}
                </div>
                {errorDetalle ? <small className="cfg-proveedores-error">{errorDetalle}</small> : <small className="cfg-pos-help">Al guardar, el proveedor se agregara al catalogo y el modal se cerrara automaticamente.</small>}
              </div>
              <datalist id="proveedor-tipos">{PROVEEDOR_TIPO_SUGERIDO.map((item) => <option key={item} value={item} />)}</datalist>
            </form>
          </div>
        </div>
      ) : null}

      {historialProveedor ? (
        <div className="cfg-proveedores-modal-overlay" onClick={cerrarHistorial}>
          <div
            className="cfg-proveedores-modal-card cfg-proveedores-history-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cfg-proveedores-history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cfg-proveedores-modal-head">
              <div>
                <h3 id="cfg-proveedores-history-title">Compras del proveedor</h3>
                <p>
                  {historialProveedor.nombre || "Proveedor sin nombre"}.
                  {" "}
                  Registra compras rapidas y consulta el historial sin salir del catalogo.
                </p>
              </div>
              <div className="cfg-proveedores-modal-head-actions">
                <button
                  type="button"
                  className="cfg-empresa-secondary-btn"
                  onClick={() => {
                    cerrarHistorial();
                    editarProveedor(historialProveedor);
                  }}
                >
                  Editar proveedor
                </button>
                <button
                  type="button"
                  className="cfg-empresa-secondary-btn"
                  onClick={cerrarHistorial}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="cfg-proveedores-history-summary">
              <div className="cfg-proveedores-history-summary-card">
                <span>Compras registradas</span>
                <strong>{historialProveedor.historialCompras?.length || 0}</strong>
                <small>Movimientos guardados en este proveedor.</small>
              </div>
              <div className="cfg-proveedores-history-summary-card">
                <span>Ultima compra</span>
                <strong>{formatDate(historialProveedor.ultimaCompraFecha)}</strong>
                <small>Fecha mas reciente capturada.</small>
              </div>
              <div className="cfg-proveedores-history-summary-card">
                <span>Total acumulado</span>
                <strong>{formatMoney(historialProveedor.montoTotalComprado, historialProveedor.moneda)}</strong>
                <small>Monto general asociado al proveedor.</small>
              </div>
              <div className="cfg-proveedores-history-summary-card">
                <span>En historial</span>
                <strong>{formatMoney((historialProveedor.historialCompras || []).reduce((acc, item) => acc + Number(item.monto || 0), 0), historialProveedor.moneda)}</strong>
                <small>Suma de compras capturadas en esta bitacora.</small>
              </div>
            </div>

            {mensaje ? (
              <div className="cfg-proveedores-inline-feedback">
                <span className={errorDetalle ? "cfg-proveedores-error" : "cfg-pos-saved"}>
                  {mensaje}
                </span>
                {errorDetalle ? <small className="cfg-proveedores-error">{errorDetalle}</small> : null}
              </div>
            ) : null}

            <div className="cfg-proveedores-history-layout">
              <form className="cfg-ticket-block cfg-ticket-block-wide cfg-proveedores-history-form" onSubmit={guardarCompra}>
                <div className="cfg-proveedores-section-head">
                  <div>
                    <h4>Registrar compra</h4>
                    <p>Agrega una compra rapida para actualizar el acumulado y dejar evidencia del movimiento.</p>
                  </div>
                  <span className={`cfg-proveedores-state ${estadoClassName(historialProveedor.estado)}`}>
                    {historialProveedor.estado}
                  </span>
                </div>
                <div className="cfg-proveedores-history-form-grid">
                  <label className="cfg-empresa-field">
                    Fecha
                    <input
                      type="date"
                      value={compraForm.fecha}
                      onChange={(event) => setCompraForm((prev) => ({ ...prev, fecha: event.target.value }))}
                    />
                  </label>
                  <label className="cfg-empresa-field">
                    Folio
                    <input
                      type="text"
                      maxLength={60}
                      value={compraForm.folio}
                      onChange={(event) => setCompraForm((prev) => ({ ...prev, folio: event.target.value }))}
                      placeholder="Factura, ticket o referencia"
                    />
                  </label>
                  <label className="cfg-empresa-field cfg-empresa-field-full">
                    Concepto
                    <input
                      type="text"
                      maxLength={140}
                      value={compraForm.concepto}
                      onChange={(event) => setCompraForm((prev) => ({ ...prev, concepto: event.target.value }))}
                      placeholder="Pantallas, baterias, herramientas..."
                    />
                  </label>
                  <label className="cfg-empresa-field">
                    Monto
                    <input
                      type="text"
                      inputMode="decimal"
                      maxLength={14}
                      value={compraForm.monto}
                      onChange={(event) => setCompraForm((prev) => ({ ...prev, monto: moneyInput(event.target.value) }))}
                      placeholder="0.00"
                    />
                  </label>
                  <label className="cfg-empresa-field">
                    Estado
                    <select
                      value={compraForm.estado}
                      onChange={(event) => setCompraForm((prev) => ({ ...prev, estado: event.target.value }))}
                    >
                      {PROVEEDOR_COMPRA_ESTADO_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cfg-empresa-field cfg-empresa-field-full">
                    Notas
                    <textarea
                      value={compraForm.notas}
                      onChange={(event) => setCompraForm((prev) => ({ ...prev, notas: event.target.value }))}
                      placeholder="Observaciones, condiciones o detalles de entrega"
                    />
                  </label>
                </div>
                <div className="cfg-servicios-savebar cfg-proveedores-savebar cfg-proveedores-history-savebar">
                  <div className="cfg-proveedores-modal-progress">
                    <strong>{historialProveedor.nombreComercial || historialProveedor.nombre || "Proveedor"}</strong>
                    <small>La compra se agregara al historial y actualizara la fecha y el monto acumulado.</small>
                  </div>
                  <div className="cfg-proveedores-save-actions">
                    <button type="button" className="cfg-empresa-secondary-btn" onClick={() => setCompraForm(toCompraFormState())}>Limpiar</button>
                    <button type="submit" className="cfg-empresa-preset-btn" disabled={guardandoCompra}>
                      {guardandoCompra ? "Guardando..." : "Guardar compra"}
                    </button>
                  </div>
                </div>
              </form>

              <div className="cfg-ticket-block cfg-ticket-block-wide cfg-proveedores-history-panel">
                <div className="cfg-proveedores-section-head">
                  <div>
                    <h4>Historial del proveedor</h4>
                    <p>
                      Consulta compras anteriores, folios y notas asociadas a
                      {" "}
                      {historialProveedor.nombreComercial || historialProveedor.nombre || "este proveedor"}.
                    </p>
                  </div>
                </div>

                {historialProveedor.historialCompras?.length ? (
                  <div className="cfg-proveedores-history-list">
                    {historialProveedor.historialCompras.map((compra) => (
                      <article key={compra.id} className="cfg-proveedores-history-item">
                        <div className="cfg-proveedores-history-item-head">
                          <div>
                            <strong>{compra.concepto || "Compra sin concepto"}</strong>
                            <p>{compra.folio ? `Folio: ${compra.folio}` : "Sin folio capturado"}</p>
                          </div>
                          <span className="cfg-proveedores-history-item-state">{compra.estado || "Pagada"}</span>
                        </div>
                        <div className="cfg-proveedores-history-item-meta">
                          <span>{formatDate(compra.fecha)}</span>
                          <span>{formatMoney(compra.monto, historialProveedor.moneda)}</span>
                        </div>
                        {compra.notas ? (
                          <p className="cfg-proveedores-history-item-note">{compra.notas}</p>
                        ) : null}
                        {compra.createdAt ? (
                          <small className="cfg-pos-help">
                            Registrada {formatDateTime(compra.createdAt)}
                          </small>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="cfg-grid-empty cfg-proveedores-empty">
                    <strong>Aun no hay compras registradas.</strong>
                    <p>Usa el formulario lateral para crear el primer movimiento de este proveedor.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
