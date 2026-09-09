import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../css/hoja_service.css";
import doneCsv from "../csv/mindfactory_done.csv?raw";
import updatedCsv from "../csv/mindfactory_updated.csv?raw";
import { guardarServicio } from "../js/services/servicios_firestore";
import {
  cargarCatalogoEquiposDesdeTextos,
  obtenerSpecsPorModelo,
} from "../js/models_equipos";
import { generarPdfHojaServicio } from "../js/services/pdf_hoja_servicio";
import useImpresorasConfig from "../hooks/useImpresorasConfig";
import useServiciosConfig from "../hooks/useServiciosConfig";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import {
  buildCamposPersonalizados,
  getCamposVisiblesTipoNegocio,
  getTipoNegocioActivo,
} from "../js/services/tipos_negocio";
import {
  buscarClientesSimilares,
  crearCliente,
  actualizarCliente,
} from "../js/services/clientes_firestore";

function buildInitialForm(tipoNegocio) {
  return {
    nombre: "",
    direccion: "",
    telefono: "",
    tipoDispositivo: "",
    marca: "",
    modelo: "",
    numeroSerie: "",
    omitirNumeroSerie: false,
    trabajo: "",
    costo: "",
    precioDespues: false,
    caracteristicasPendientes: false,
    camposPersonalizados: buildCamposPersonalizados(tipoNegocio),
  };
}

function hasValueByField(campo, value) {
  if (campo.tipo === "checkbox") return !!value;
  return String(value ?? "").trim().length > 0;
}

export default function HojaServicio() {
  const navigate = useNavigate();
  const location = useLocation();
  const { empresa } = useEmpresaConfig();
  const {
    imprimirAlIniciarServicio,
    documentoAlIniciarServicio,
    modoImpresion,
    nombreImpresoraHojaServicio,
    tamanoHojaServicio,
  } = useImpresorasConfig();
  const tipoNegocioActivo = useMemo(() => getTipoNegocioActivo(empresa), [empresa]);
  const {
    hojaServicioHabilitada,
    terminosServicio,
    politicaRetardo,
  } = useServiciosConfig();
  const [form, setForm] = useState(() => buildInitialForm(tipoNegocioActivo));
  const [pasoRegistro, setPasoRegistro] = useState(1);
  const formRegistroRef = useRef(null);

  const [marcasModelos, setMarcasModelos] = useState({});
  const [modelosData, setModelosData] = useState({});
  const [sugerencias, setSugerencias] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [highlightedSugIndex, setHighlightedSugIndex] = useState(-1);
  const [selectedCliente, setSelectedCliente] = useState(null);

  const lastQueryRef = useRef("");
  const nombreWrapRef = useRef(null);
  const sugerenciaRefs = useRef([]);
  const prevTipoNegocioIdRef = useRef(tipoNegocioActivo?.id || "");

  const marcas = useMemo(
    () => ["Apple", "MSI", "Lenovo", "Acer", "Dell", "Ateck", "Asus", "HP"],
    [],
  );

  const deviceOptions = tipoNegocioActivo?.opcionesTipoDispositivo || [];
  const camposVisibles = useMemo(
    () => getCamposVisiblesTipoNegocio(tipoNegocioActivo, form.tipoDispositivo),
    [tipoNegocioActivo, form.tipoDispositivo],
  );
  const usaCatalogoComputo =
    tipoNegocioActivo?.id === "soporte-computo" &&
    (form.tipoDispositivo === "laptop" || form.tipoDispositivo === "pc");
  const modelos = useMemo(() => {
    if (!usaCatalogoComputo) return [];
    return marcasModelos[form.marca] || [];
  }, [usaCatalogoComputo, marcasModelos, form.marca]);
  const terminosHoja = useMemo(
    () => (Array.isArray(terminosServicio) ? terminosServicio.filter(Boolean) : []),
    [terminosServicio],
  );

  useEffect(() => {
    setForm((prev) => {
      const prevTipoNegocioId = prevTipoNegocioIdRef.current;
      const currentTipoNegocioId = tipoNegocioActivo?.id || "";
      const currentDeviceStillExists = deviceOptions.some(
        (option) => option.value === prev.tipoDispositivo,
      );

      if (prevTipoNegocioId && currentTipoNegocioId && prevTipoNegocioId !== currentTipoNegocioId) {
        prevTipoNegocioIdRef.current = currentTipoNegocioId;
        return {
          ...buildInitialForm(tipoNegocioActivo),
          nombre: prev.nombre,
          direccion: prev.direccion,
          telefono: prev.telefono,
        };
      }

      prevTipoNegocioIdRef.current = currentTipoNegocioId;

      return {
        ...prev,
        tipoDispositivo: currentDeviceStillExists ? prev.tipoDispositivo : "",
        camposPersonalizados: buildCamposPersonalizados(
          tipoNegocioActivo,
          prev.camposPersonalizados,
        ),
      };
    });
  }, [tipoNegocioActivo, deviceOptions]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const catalogo = await cargarCatalogoEquiposDesdeTextos({
          marcas,
          csvTexts: [doneCsv, updatedCsv],
        });

        if (!alive) return;
        setMarcasModelos(catalogo.marcasModelos);
        setModelosData(catalogo.modelosData);
      } catch (err) {
        console.error("Error cargando catalogo:", err);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [marcas]);

  useEffect(() => {
    const cli = location.state?.prefillCliente;
    if (!cli?.id) return;

    const normalized = {
      id: cli.id,
      nombre: cli.nombre || "",
      telefono: cli.telefono || "",
      direccion: cli.direccion || "",
      numeroSeriePreferido: cli.numeroSeriePreferido || "",
      omitirNumeroSerie: !!cli.omitirNumeroSerie,
    };

    setSelectedCliente(normalized);
    setForm((prev) => ({
      ...prev,
      nombre: normalized.nombre,
      telefono: normalized.telefono,
      direccion: normalized.direccion,
      numeroSerie: normalized.numeroSeriePreferido,
      omitirNumeroSerie: normalized.omitirNumeroSerie,
    }));
    setSugerencias([]);
    setShowSug(false);
    setHighlightedSugIndex(-1);
    lastQueryRef.current = "";
  }, [location.state]);

  useEffect(() => {
    const nombre = String(form.nombre || "").trim();

    if (selectedCliente && nombre !== selectedCliente.nombre) {
      setSelectedCliente(null);
    }

    if (nombre.length < 3) {
      setSugerencias([]);
      setShowSug(false);
      setHighlightedSugIndex(-1);
      lastQueryRef.current = "";
      return;
    }

    const qKey = nombre.toLowerCase();
    if (qKey === lastQueryRef.current) return;

    const timer = setTimeout(async () => {
      try {
        lastQueryRef.current = qKey;
        const res = await buscarClientesSimilares(nombre, {
          maxFetch: 50,
          maxReturn: 8,
        });
        setSugerencias(res);
        setShowSug(res.length > 0);
        setHighlightedSugIndex(res.length > 0 ? 0 : -1);
      } catch (error) {
        console.error("Error buscando sugerencias:", error);
        setSugerencias([]);
        setShowSug(false);
        setHighlightedSugIndex(-1);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [form.nombre, selectedCliente]);

  useEffect(() => {
    function onDocClick(ev) {
      if (!nombreWrapRef.current) return;
      if (!nombreWrapRef.current.contains(ev.target)) setShowSug(false);
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!showSug || highlightedSugIndex < 0) return;

    const activeItem = sugerenciaRefs.current[highlightedSugIndex];
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [highlightedSugIndex, showSug]);

  useEffect(() => {
    const areas = document.querySelectorAll(".hoja-page textarea");
    areas.forEach((el) => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [form.trabajo, form.camposPersonalizados]);

  function autoGrowTextarea(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleTextareaChange(e) {
    handleChange(e);
    autoGrowTextarea(e.target);
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };

      if (name === "omitirNumeroSerie" && checked) {
        next.numeroSerie = "";
      }

      if (name === "marca" && usaCatalogoComputo) {
        next.modelo = "";
        return next;
      }

      if (name === "modelo" && usaCatalogoComputo) {
        const specs = obtenerSpecsPorModelo(modelosData, next.marca, value);

        if (specs) {
          next.camposPersonalizados = {
            ...prev.camposPersonalizados,
            procesador: specs.procesador || prev.camposPersonalizados?.procesador || "",
            ram: specs.ram || prev.camposPersonalizados?.ram || "",
            disco: specs.disco || prev.camposPersonalizados?.disco || "",
          };
        }
      }

      return next;
    });
  }

  function handleCampoPersonalizadoChange(campoId, value) {
    setForm((prev) => ({
      ...prev,
      camposPersonalizados: {
        ...prev.camposPersonalizados,
        [campoId]: value,
      },
    }));
  }

  function avanzarPasoRegistro() {
    const contenedor = formRegistroRef.current;
    if (!contenedor) return;
    const campos = [...contenedor.querySelectorAll(`.hoja-step-${pasoRegistro} input, .hoja-step-${pasoRegistro} select, .hoja-step-${pasoRegistro} textarea`)];
    const invalido = campos.find((campo) => !campo.disabled && !campo.checkValidity());
    if (invalido) {
      invalido.reportValidity();
      invalido.focus();
      return;
    }
    setPasoRegistro((actual) => Math.min(3, actual + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function regresarPasoRegistro() {
    setPasoRegistro((actual) => Math.max(1, actual - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function seleccionarCliente(cli) {
    setSelectedCliente(cli);
    setForm((prev) => ({
      ...prev,
      nombre: cli.nombre || prev.nombre,
      telefono: cli.telefono || "",
      direccion: cli.direccion || "",
      numeroSerie: cli.numeroSeriePreferido || "",
      omitirNumeroSerie: !!cli.omitirNumeroSerie,
    }));
    setShowSug(false);
    setHighlightedSugIndex(-1);
  }

  function handleNombreKeyDown(e) {
    if (!sugerencias.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowSug(true);
      setHighlightedSugIndex((prev) => {
        if (prev < 0) return 0;
        return Math.min(prev + 1, sugerencias.length - 1);
      });
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setShowSug(true);
      setHighlightedSugIndex((prev) => {
        if (prev < 0) return sugerencias.length - 1;
        return Math.max(prev - 1, 0);
      });
      return;
    }

    if (e.key === "Enter" && showSug && highlightedSugIndex >= 0) {
      e.preventDefault();
      seleccionarCliente(sugerencias[highlightedSugIndex]);
      return;
    }

    if (e.key === "Escape" && showSug) {
      e.preventDefault();
      setShowSug(false);
      setHighlightedSugIndex(-1);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    let hojaPrintWindow = null;

    try {
      const trabajoLimpio = String(form.trabajo || "").trim();
      if (trabajoLimpio.length < 5) {
        setPasoRegistro(3);
        alert("Describe el trabajo o la falla reportada antes de guardar el servicio.");
        return;
      }

      const costoCapturado = Number(form.costo);
      if (!form.precioDespues && (!Number.isFinite(costoCapturado) || costoCapturado <= 0)) {
        setPasoRegistro(3);
        alert("Captura un costo mayor que cero o marca Precio después del diagnóstico.");
        return;
      }

      if (!form.omitirNumeroSerie && !String(form.numeroSerie || "").trim()) {
        alert("Captura el numero de serie o activa la opcion para omitirlo.");
        return;
      }

      const campoFaltante = form.caracteristicasPendientes
        ? null
        : camposVisibles.find(
            (campo) =>
              campo.requerido &&
              !hasValueByField(campo, form.camposPersonalizados?.[campo.id]),
          );

      if (campoFaltante) {
        alert(`Completa el campo obligatorio: ${campoFaltante.etiqueta}.`);
        return;
      }

      const shouldAutoPrintTicket =
        imprimirAlIniciarServicio &&
        (documentoAlIniciarServicio === "ticket" || documentoAlIniciarServicio === "ambos");
      const shouldAutoPrintHoja =
        hojaServicioHabilitada &&
        imprimirAlIniciarServicio &&
        (documentoAlIniciarServicio === "hoja" || documentoAlIniciarServicio === "ambos");
      const shouldSilentPrintHoja = shouldAutoPrintHoja && modoImpresion === "silenciosa";
      const shouldDialogPrintHoja = shouldAutoPrintHoja && !shouldSilentPrintHoja;

      if (shouldDialogPrintHoja) {
        hojaPrintWindow = window.open("", "_blank", "width=960,height=720");

        if (hojaPrintWindow) {
          hojaPrintWindow.document.write(`
            <!DOCTYPE html>
            <html lang="es">
              <head>
                <meta charset="UTF-8" />
                <title>Preparando hoja de servicio</title>
                <style>
                  body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    min-height: 100vh;
                    display: grid;
                    place-items: center;
                    background: #f8fafc;
                    color: #0f172a;
                  }
                  .print-loading {
                    text-align: center;
                    padding: 24px;
                  }
                </style>
              </head>
              <body>
                <div class="print-loading">
                  Preparando hoja de servicio para impresion...
                </div>
              </body>
            </html>
          `);
          hojaPrintWindow.document.close();
        } else {
          alert("El navegador bloqueo la impresion automatica de la hoja. Permite popups para este sitio.");
        }
      }

      let clienteIdFinal = selectedCliente?.id;

      if (selectedCliente?.id) {
        await actualizarCliente(selectedCliente.id, {
          nombre: form.nombre,
          telefono: form.telefono,
          direccion: form.direccion,
          numeroSeriePreferido: form.omitirNumeroSerie
            ? ""
            : String(form.numeroSerie || "").trim(),
          omitirNumeroSerie: !!form.omitirNumeroSerie,
        });
      } else {
        const nuevo = await crearCliente({
          nombre: form.nombre,
          telefono: form.telefono,
          direccion: form.direccion,
          numeroSeriePreferido: form.omitirNumeroSerie
            ? ""
            : String(form.numeroSerie || "").trim(),
          omitirNumeroSerie: !!form.omitirNumeroSerie,
        });

        clienteIdFinal = nuevo.id;
      }

      if (!clienteIdFinal) {
        alert("No se pudo determinar el cliente.");
        return;
      }

      const hojaServicioSnapshot = {
        habilitada: hojaServicioHabilitada,
        terminos: terminosHoja,
        retardo: politicaRetardo || {},
      };

      const payload = {
        ...form,
        clienteId: clienteIdFinal,
        tipoNegocioId: tipoNegocioActivo?.id || "",
        tipoNegocioNombre: tipoNegocioActivo?.nombre || "",
        tipoNegocioSnapshot: tipoNegocioActivo,
        hojaServicio: hojaServicioSnapshot,
      };

      const res = await guardarServicio(payload);

      if (hojaServicioHabilitada) {
        await generarPdfHojaServicio(payload, res.folio, {
          download: true,
          silentPrint: shouldSilentPrintHoja,
          printerName: nombreImpresoraHojaServicio || "",
          paperSize: tamanoHojaServicio || "a4",
          openPrint: shouldDialogPrintHoja && !!hojaPrintWindow,
          printWindow: hojaPrintWindow,
        });
      }

      navigate(`/ticket/${encodeURIComponent(String(res.folio || "").trim())}`, {
        state: {
          autoPrint: shouldAutoPrintTicket,
          autoPrintSource: "service-start",
        },
      });

      setForm(buildInitialForm(tipoNegocioActivo));
      setPasoRegistro(1);
      setSelectedCliente(null);
      setSugerencias([]);
      setShowSug(false);
      lastQueryRef.current = "";
    } catch (err) {
      if (hojaPrintWindow && !hojaPrintWindow.closed) {
        hojaPrintWindow.close();
      }
      console.error("Error guardando:", err);
      if (err?.code === "DUPLICATE_SERVICE" && err?.duplicado?.folio) {
        const abrir = confirm(
          `${err.message}\n\nQuieres abrir ese servicio ahora?`,
        );
        if (abrir) {
          navigate(
            `/servicios/${encodeURIComponent(String(err.duplicado.folio || "").trim())}`,
          );
        }
        return;
      }
      alert(String(err?.message || "No se pudo guardar."));
    }
  }

  function renderCampoPersonalizado(campo) {
    const value = form.camposPersonalizados?.[campo.id];

    if (campo.tipo === "textarea") {
      return (
        <div key={campo.id} className={campo.anchoCompleto ? "full" : ""}>
          <label>{campo.etiqueta}:</label>
          <textarea
            value={String(value ?? "")}
            placeholder={campo.placeholder || ""}
            required={campo.requerido}
            onChange={(e) => {
              handleCampoPersonalizadoChange(campo.id, e.target.value);
              autoGrowTextarea(e.target);
            }}
          />
        </div>
      );
    }

    if (campo.tipo === "select") {
      return (
        <div key={campo.id} className={campo.anchoCompleto ? "full" : ""}>
          <label>{campo.etiqueta}:</label>
          <select
            value={String(value ?? "")}
            required={campo.requerido}
            onChange={(e) => handleCampoPersonalizadoChange(campo.id, e.target.value)}
          >
            <option value="">-- Selecciona --</option>
            {(campo.opciones || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (campo.tipo === "checkbox") {
      return (
        <div key={campo.id} className={`form-check ms-2${campo.anchoCompleto ? " full" : ""}`}>
          <input
            className="form-check-input"
            type="checkbox"
            id={`campo-${campo.id}`}
            checked={!!value}
            onChange={(e) => handleCampoPersonalizadoChange(campo.id, e.target.checked)}
          />
          <label className="form-check-label" htmlFor={`campo-${campo.id}`}>
            {campo.etiqueta}
          </label>
        </div>
      );
    }

    return (
      <div key={campo.id} className={campo.anchoCompleto ? "full" : ""}>
        <label>{campo.etiqueta}:</label>
        <input
          type={campo.tipo === "number" ? "number" : "text"}
          value={String(value ?? "")}
          placeholder={campo.placeholder || ""}
          required={campo.requerido}
          onChange={(e) => handleCampoPersonalizadoChange(campo.id, e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="hoja-page">
      <div className="hoja-service-bubbles" aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
      </div>
      <div className="hoja-form-shell">
        <div className="card shadow-lg border-0">
          <div className="card-body">
            <header className="hoja-form-header">
              <div className="hoja-form-header-icon" aria-hidden="true">＋</div>
              <div>
                <span className="hoja-form-eyebrow">Nuevo ingreso</span>
                <h2>{tipoNegocioActivo?.tituloHoja || "Registro de servicio"}</h2>
                <p>Captura los datos del cliente y del equipo para generar la orden de servicio.</p>
              </div>
              <span className="hoja-form-required"><b>*</b> Datos obligatorios</span>
            </header>

            <nav className="hoja-form-steps" aria-label="Secciones del registro">
              <span className={pasoRegistro === 1 ? "active" : pasoRegistro > 1 ? "complete" : ""}><b>1</b> Cliente</span>
              <span className={pasoRegistro === 2 ? "active" : pasoRegistro > 2 ? "complete" : ""}><b>2</b> Equipo</span>
              <span className={pasoRegistro === 3 ? "active" : ""}><b>3</b> Servicio</span>
            </nav>

            <form id="formRegistro" ref={formRegistroRef} data-step={pasoRegistro} onSubmit={handleSubmit}>
              <div className="full hoja-section-heading hoja-step-1">
                <span className="hoja-section-icon" aria-hidden="true">👤</span>
                <div><small>Paso 1</small><h3>Datos del cliente</h3><p>Busca un cliente existente o registra uno nuevo.</p></div>
              </div>
              <div className={`hoja-step-1 cliente-name-field${showSug ? " suggestions-open" : ""}`} ref={nombreWrapRef}>
                <label>Nombre del cliente <b className="required-mark">*</b></label>
                <input
                  type="text"
                  name="nombre"
                  value={form.nombre}
                  onChange={(e) => {
                    handleChange(e);
                    setShowSug(true);
                  }}
                  onFocus={() => sugerencias.length > 0 && setShowSug(true)}
                  onKeyDown={handleNombreKeyDown}
                  autoComplete="off"
                  required
                />

                {showSug && sugerencias.length > 0 && (
                  <div className="cliente-sugerencias">
                    {sugerencias.map((c, index) => (
                      <button
                        type="button"
                        key={c.id}
                        ref={(el) => {
                          sugerenciaRefs.current[index] = el;
                        }}
                        className={`cliente-sug-item${highlightedSugIndex === index ? " active" : ""}`}
                        onMouseDown={() => seleccionarCliente(c)}
                        onMouseEnter={() => setHighlightedSugIndex(index)}
                      >
                        <div className="cliente-sug-nombre">{c.nombre}</div>
                        <div className="cliente-sug-sub">
                          {c.telefono ? `Tel. ${c.telefono}` : "Sin telefono"}
                          {c.direccion ? ` • ${c.direccion}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedCliente?.id && (
                  <div className="cliente-selected-hint">
                    Cliente seleccionado: <b>{selectedCliente.nombre}</b>
                    <button
                      type="button"
                      className="cliente-clear"
                      onClick={() => {
                        setSelectedCliente(null);
                        setSugerencias([]);
                        setShowSug(false);
                        setForm((prev) => ({
                          ...prev,
                          nombre: "",
                          telefono: "",
                          direccion: "",
                          numeroSerie: "",
                          omitirNumeroSerie: false,
                        }));
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>

              <div className="hoja-step-1">
                <label>Direccion:</label>
                <input
                  type="text"
                  name="direccion"
                  value={form.direccion}
                  onChange={handleChange}
                />
              </div>

              <div className="hoja-step-1">
                <label>Teléfono:</label>
                <input
                  type="tel"
                  name="telefono"
                  value={form.telefono}
                  maxLength={10}
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  placeholder="10 digitos"
                  onChange={(e) => {
                    const soloNumeros = e.target.value.replace(/\D/g, "");
                    setForm((prev) => ({
                      ...prev,
                      telefono: soloNumeros.slice(0, 10),
                    }));
                  }}
                />
              </div>

              <div className="full hoja-section-heading hoja-step-2">
                <span className="hoja-section-icon equipment" aria-hidden="true">▣</span>
                <div><small>Paso 2</small><h3>Datos del equipo</h3><p>Identifica el equipo y sus características principales.</p></div>
              </div>

              <div className="full hoja-step-2">
                <label>{tipoNegocioActivo?.etiquetaTipoDispositivo || "Tipo de dispositivo"} <b className="required-mark">*</b></label>
                <select
                  name="tipoDispositivo"
                  value={form.tipoDispositivo}
                  onChange={handleChange}
                  required
                >
                  <option value="">-- Selecciona --</option>
                  {deviceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hoja-step-2">
                <label>{tipoNegocioActivo?.etiquetaMarca || "Marca"}:</label>
                <input
                  list={usaCatalogoComputo ? "listaMarcas" : undefined}
                  name="marca"
                  placeholder="Escribe o selecciona"
                  value={form.marca}
                  onChange={handleChange}
                />
                {usaCatalogoComputo && (
                  <datalist id="listaMarcas">
                    {marcas.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
              </div>

              <div className="hoja-step-2">
                <label>{tipoNegocioActivo?.etiquetaModelo || "Modelo"}:</label>
                <input
                  list={usaCatalogoComputo ? "listaModelos" : undefined}
                  name="modelo"
                  placeholder={usaCatalogoComputo ? "Selecciona un modelo" : "Modelo"}
                  value={form.modelo}
                  onChange={handleChange}
                />
                {usaCatalogoComputo && (
                  <datalist id="listaModelos">
                    {modelos.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
              </div>

              <div className="full hoja-step-2">
                <label>{tipoNegocioActivo?.etiquetaSerie || "Número de serie"} {!form.omitirNumeroSerie && <b className="required-mark">*</b>}</label>
                <input
                  type="text"
                  name="numeroSerie"
                  placeholder="Dato identificador del equipo"
                  value={form.numeroSerie}
                  onChange={handleChange}
                  disabled={form.omitirNumeroSerie}
                  required={!form.omitirNumeroSerie}
                />

                <div className="form-check ms-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="omitirNumeroSerie"
                    name="omitirNumeroSerie"
                    checked={!!form.omitirNumeroSerie}
                    onChange={handleChange}
                  />
                  <label className="form-check-label" htmlFor="omitirNumeroSerie">
                    No quiero poner este dato
                  </label>
                </div>
              </div>

              {camposVisibles.length > 0 && (
                <div className="full hoja-custom-block hoja-step-2">
                  <fieldset className="fieldset-equipo">
                    <legend>Campos del servicio</legend>
                    <div className="hoja-custom-grid">
                      {camposVisibles.map((campo) => renderCampoPersonalizado(campo))}
                    </div>
                  </fieldset>
                </div>
              )}

              <div className="full form-check ms-2 hoja-step-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="caracteristicasPendientes"
                  name="caracteristicasPendientes"
                  checked={!!form.caracteristicasPendientes}
                  onChange={handleChange}
                />
                <label className="form-check-label" htmlFor="caracteristicasPendientes">
                  {tipoNegocioActivo?.etiquetaCaracteristicasPendientes ||
                    "Completar caracteristicas despues"}
                </label>
              </div>

              <div className="full hoja-section-heading hoja-step-3">
                <span className="hoja-section-icon service" aria-hidden="true">✓</span>
                <div><small>Paso 3</small><h3>Servicio y presupuesto</h3><p>Describe el trabajo solicitado y define el costo inicial.</p></div>
              </div>

              <div className="full hoja-step-3">
                <label>{tipoNegocioActivo?.etiquetaTrabajo || "Trabajo a realizar"} <b className="required-mark">*</b></label>
                <textarea
                  name="trabajo"
                  value={form.trabajo}
                  placeholder={tipoNegocioActivo?.placeholderTrabajo || ""}
                  onChange={handleTextareaChange}
                  required
                  minLength={5}
                />
              </div>

              <div className="full costo-row hoja-step-3">
                <label htmlFor="costo" className="me-3">
                  {tipoNegocioActivo?.etiquetaCosto || "Costo estimado"}:
                </label>

                <input
                  type="number"
                  name="costo"
                  id="costo"
                  min="0.01"
                  step="0.01"
                  value={form.costo}
                  onChange={handleChange}
                  className="me-3"
                  style={{ width: 140 }}
                  disabled={form.precioDespues}
                  required={!form.precioDespues}
                />

                <div className="form-check ms-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="precioDespues"
                    name="precioDespues"
                    checked={form.precioDespues}
                    onChange={handleChange}
                  />
                  <label className="form-check-label" htmlFor="precioDespues">
                    Precio se define despues del diagnostico
                  </label>
                </div>
              </div>

              <div className="full hoja-submit-area hoja-wizard-actions">
                <div><strong>Paso {pasoRegistro} de 3</strong><span>{pasoRegistro === 1 ? "Ingresa los datos principales del cliente." : pasoRegistro === 2 ? "Identifica el equipo que recibes." : "Revisa el servicio y guarda la orden."}</span></div>
                <div className="hoja-wizard-buttons">
                  {pasoRegistro > 1 && <button type="button" className="hoja-back-button" onClick={regresarPasoRegistro}>Anterior</button>}
                  {pasoRegistro < 3 ? (
                    <button type="button" className="hoja-next-button" onClick={avanzarPasoRegistro}>Siguiente</button>
                  ) : (
                    <button type="submit">
                      {hojaServicioHabilitada ? "Guardar y generar orden" : "Guardar registro"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
