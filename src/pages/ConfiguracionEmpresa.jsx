import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight, FiStar } from "react-icons/fi";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import useServiciosConfig from "../hooks/useServiciosConfig";
import PremiumFeatureModal from "../components/PremiumFeatureModal";
import { actualizarEmpresaConfig } from "../js/services/configure_empresa";
import { actualizarServiciosConfig } from "../js/services/configure_servicios";
import { getRestaurantPlanLimits } from "../js/services/plan_features";
import { LOGO_EXTENSIONES, procesarArchivoLogo } from "../js/services/empresa_logo";
import {
  buildCampoHojaVacio,
  buildTipoNegocioVacio,
  findTipoNegocioPreset,
  getTiposNegocioPreset,
  normalizeTiposNegocio,
} from "../js/services/tipos_negocio";

function cloneEmpresaConfig(config) {
  const tiposGuardados = normalizeTiposNegocio(config?.tiposNegocio);
  const restaurantePreset = findTipoNegocioPreset("restaurante");
  const tiposNegocio =
    restaurantePreset && !tiposGuardados.some((tipo) => tipo.id === "restaurante")
      ? [...tiposGuardados, restaurantePreset]
      : tiposGuardados;

  return {
    nombre: String(config?.nombre || ""),
    subtitulo: String(config?.subtitulo || ""),
    telefono: String(config?.telefono || ""),
    correoTickets: String(config?.correoTickets || ""),
    correoNotas: String(config?.correoNotas || ""),
    logo: String(config?.logo || ""),
    tipoNegocioId: String(config?.tipoNegocioId || ""),
    tiposNegocio,
    restaurante: {
      pisos: Array.isArray(config?.restaurante?.pisos) && config.restaurante.pisos.length
        ? config.restaurante.pisos.map((piso, index) => ({
            id: String(piso?.id || `piso-${index + 1}`),
            nombre: String(piso?.nombre || `Piso ${index + 1}`),
            cantidadMesas: Math.max(1, Number(piso?.cantidadMesas) || 1),
          }))
        : [{ id: "piso-1", nombre: "Piso 1", cantidadMesas: 10 }],
    },
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createCustomType(existingTypes) {
  const draft = buildTipoNegocioVacio(existingTypes.length);
  return {
    ...draft,
    id: makeId("tipo-negocio"),
    nombre: `Nuevo tipo ${existingTypes.length + 1}`,
    tituloHoja: "Registro de servicio",
  };
}

function createFieldDraft(tipo) {
  const base = buildCampoHojaVacio(tipo?.campos?.length || 0);
  return {
    ...base,
    id: makeId("campo"),
    etiqueta: `Campo ${String((tipo?.campos?.length || 0) + 1)}`,
  };
}

export default function ConfiguracionEmpresa() {
  const navigate = useNavigate();
  const { empresa } = useEmpresaConfig();
  // isPremium solo es true cuando el plan esta confirmado, asi que mientras
  // carga el logo queda bloqueado (falla del lado seguro).
  const { isPremium, premiumState } = useAutorizacionActual();
  // El rastreo QR vive en config/servicios; aqui solo se expone el interruptor
  // para el tipo de negocio activo, sin duplicar el resto de esa configuracion.
  const {
    config: serviciosConfig,
    trackingEnabled: rastreoQrGuardado,
    loading: serviciosConfigLoading,
  } = useServiciosConfig();
  const limitesRestaurante = getRestaurantPlanLimits({ premiumState });
  const [draft, setDraft] = useState(() => cloneEmpresaConfig(empresa));
  const [tipoEditorId, setTipoEditorId] = useState(() => String(empresa?.tipoNegocioId || ""));
  const [mostrarEditorTipo, setMostrarEditorTipo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");
  const [errorLogo, setErrorLogo] = useState("");
  const [procesandoLogo, setProcesandoLogo] = useState(false);
  const [modalRestaurantePremium, setModalRestaurantePremium] = useState(false);
  const [modalRastreoPremium, setModalRastreoPremium] = useState(false);
  const [rastreoQr, setRastreoQr] = useState(rastreoQrGuardado);
  const [guardandoRastreo, setGuardandoRastreo] = useState(false);
  const [mensajeRastreo, setMensajeRastreo] = useState("");
  const editorRef = useRef(null);
  const logoInputRef = useRef(null);
  const didMountEditorRef = useRef(false);

  useEffect(() => {
    const nextDraft = cloneEmpresaConfig(empresa);
    setDraft(nextDraft);
    setTipoEditorId(nextDraft.tipoNegocioId || nextDraft.tiposNegocio[0]?.id || "");
    setMostrarEditorTipo(false);
  }, [empresa]);

  useEffect(() => {
    setRastreoQr(rastreoQrGuardado);
  }, [rastreoQrGuardado]);

  useEffect(() => {
    if (!didMountEditorRef.current) {
      didMountEditorRef.current = true;
      return;
    }
    if (!mostrarEditorTipo || !tipoEditorId || !editorRef.current) return;
    editorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mostrarEditorTipo, tipoEditorId]);

  const tiposNegocio = useMemo(() => draft.tiposNegocio || [], [draft.tiposNegocio]);
  const tipoActivo =
    tiposNegocio.find((item) => item.id === draft.tipoNegocioId) || tiposNegocio[0] || null;
  const tipoEnEdicion =
    tiposNegocio.find((item) => item.id === tipoEditorId) || null;
  const serviciosActivosEnEmpresa = tipoActivo?.serviciosHabilitados !== false;
  const serviciosActivosEnEdicion = tipoEnEdicion?.serviciosHabilitados !== false;
  const presetsDisponibles = useMemo(() => getTiposNegocioPreset(), []);
  const presetFaltantes = useMemo(
    () => presetsDisponibles.filter((preset) => !tiposNegocio.some((item) => item.id === preset.id)),
    [presetsDisponibles, tiposNegocio],
  );

  function updateTipo(tipoId, updater) {
    setDraft((prev) => ({
      ...prev,
      tiposNegocio: prev.tiposNegocio.map((tipo) =>
        tipo.id === tipoId ? updater(tipo) : tipo,
      ),
    }));
  }

  function handleTipoFieldChange(tipoId, key, value) {
    updateTipo(tipoId, (tipo) => ({ ...tipo, [key]: value }));
  }

  function handleAddCustomType() {
    setDraft((prev) => {
      const nuevoTipo = createCustomType(prev.tiposNegocio || []);
      const nextTypes = [...prev.tiposNegocio, nuevoTipo];
      setTipoEditorId(nuevoTipo.id);
      setMostrarEditorTipo(true);

      return {
        ...prev,
        tipoNegocioId: prev.tipoNegocioId || nuevoTipo.id,
        tiposNegocio: nextTypes,
      };
    });
  }

  function handleCantidadPisosChange(rawValue) {
    if (!isPremium) {
      setModalRestaurantePremium(true);
      return;
    }
    const cantidad = Math.min(limitesRestaurante.maxPisos, Math.max(1, Number(rawValue) || 1));
    setDraft((prev) => {
      const actuales = prev.restaurante?.pisos || [];
      const pisos = Array.from({ length: cantidad }, (_, index) => (
        actuales[index] || {
          id: `piso-${index + 1}`,
          nombre: `Piso ${index + 1}`,
          cantidadMesas: 10,
        }
      ));
      return { ...prev, restaurante: { ...prev.restaurante, pisos } };
    });
  }

  async function handleRastreoQrChange(valor) {
    // Free nunca escribe la preferencia: el servicio la conserva, pero el
    // permiso efectivo sigue apagado, asi que aqui ni siquiera se intenta.
    if (!isPremium || guardandoRastreo || serviciosConfigLoading) return;

    const anterior = rastreoQr;
    setRastreoQr(valor);
    setGuardandoRastreo(true);
    setMensajeRastreo("");

    try {
      await actualizarServiciosConfig({ ...serviciosConfig, trackingEnabled: valor });
      setMensajeRastreo(valor ? "Rastreo mediante QR activado." : "Rastreo mediante QR desactivado.");
      window.setTimeout(() => setMensajeRastreo(""), 2500);
    } catch (error) {
      console.error("No se pudo actualizar el rastreo QR:", error);
      setRastreoQr(anterior);
      setMensajeRastreo("No se pudo guardar el cambio. Intenta de nuevo.");
    } finally {
      setGuardandoRastreo(false);
    }
  }

  function handlePisoChange(index, key, value) {
    setDraft((prev) => {
      const pisoActual = prev.restaurante.pisos[index];
      const cantidadSolicitada = Math.max(1, Number(value) || 1);
      const mesasActuales = prev.restaurante.pisos.reduce(
        (total, piso) => total + Number(piso?.cantidadMesas || 0),
        0,
      );
      const mesasPropuestas = mesasActuales
        - Number(pisoActual?.cantidadMesas || 0)
        + cantidadSolicitada;
      const intentaIncrementarFueraDeLimite = key === "cantidadMesas"
        && !isPremium
        && mesasPropuestas > limitesRestaurante.maxMesasTotal
        && mesasPropuestas > mesasActuales;

      if (intentaIncrementarFueraDeLimite) {
        setModalRestaurantePremium(true);
        return prev;
      }

      return {
        ...prev,
        restaurante: {
          ...prev.restaurante,
          pisos: prev.restaurante.pisos.map((piso, pisoIndex) => (
            pisoIndex === index
              ? {
                  ...piso,
                  [key]: key === "cantidadMesas"
                    ? (isPremium
                        ? Math.min(limitesRestaurante.maxMesasPorPiso, cantidadSolicitada)
                        : cantidadSolicitada)
                    : value,
                }
              : piso
          )),
        },
      };
    });
  }

  function handleImportPreset(presetId) {
    const preset = findTipoNegocioPreset(presetId);
    if (!preset) return;
    setDraft((prev) => {
      if (prev.tiposNegocio.some((item) => item.id === preset.id)) {
        setTipoEditorId(preset.id);
        setMostrarEditorTipo(true);
        return prev;
      }

      const nextTypes = [...prev.tiposNegocio, preset];
      setMostrarEditorTipo(true);
      return {
        ...prev,
        tiposNegocio: nextTypes,
      };
    });
  }

  function handleDeleteType(tipoId) {
    if (tiposNegocio.length <= 1) {
      alert("Debe quedar al menos un tipo de negocio.");
      return;
    }

    setDraft((prev) => {
      const nextTypes = prev.tiposNegocio.filter((item) => item.id !== tipoId);
      const nextActiveId =
        prev.tipoNegocioId === tipoId
          ? nextTypes[0]?.id || ""
          : prev.tipoNegocioId;
      const nextEditorId =
        tipoEditorId === tipoId
          ? nextActiveId || nextTypes[0]?.id || ""
          : tipoEditorId;

      setTipoEditorId(nextEditorId);
      if (tipoEditorId === tipoId) {
        setMostrarEditorTipo(false);
      }
      return {
        ...prev,
        tipoNegocioId: nextActiveId,
        tiposNegocio: nextTypes,
      };
    });
  }

  function handleAddDeviceOption(tipoId) {
    updateTipo(tipoId, (tipo) => {
      const nextOption = {
        value: makeId("tipo"),
        label: `Opcion ${tipo.opcionesTipoDispositivo.length + 1}`,
      };

      return {
        ...tipo,
        opcionesTipoDispositivo: [...tipo.opcionesTipoDispositivo, nextOption],
      };
    });
  }

  function handleDeviceOptionLabelChange(tipoId, optionValue, label) {
    updateTipo(tipoId, (tipo) => ({
      ...tipo,
      opcionesTipoDispositivo: tipo.opcionesTipoDispositivo.map((option) =>
        option.value === optionValue
          ? {
              ...option,
              label,
            }
          : option,
      ),
    }));
  }

  function handleDeleteDeviceOption(tipoId, optionValue) {
    updateTipo(tipoId, (tipo) => {
      if (tipo.opcionesTipoDispositivo.length <= 1) {
        alert("Debe quedar al menos una opcion de tipo.");
        return tipo;
      }

      return {
        ...tipo,
        opcionesTipoDispositivo: tipo.opcionesTipoDispositivo.filter(
          (option) => option.value !== optionValue,
        ),
        campos: tipo.campos.map((campo) => ({
          ...campo,
          aplicaA: (campo.aplicaA || []).filter((value) => value !== optionValue),
        })),
      };
    });
  }

  function handleAddField(tipoId) {
    updateTipo(tipoId, (tipo) => ({
      ...tipo,
      campos: [...tipo.campos, createFieldDraft(tipo)],
    }));
  }

  function handleFieldChange(tipoId, campoId, key, value) {
    updateTipo(tipoId, (tipo) => ({
      ...tipo,
      campos: tipo.campos.map((campo) =>
        campo.id === campoId
          ? key === "tipo"
            ? {
                ...campo,
                tipo: value,
                opciones: value === "select" ? campo.opciones || [] : [],
                valorInicial: value === "checkbox" ? false : "",
              }
            : {
                ...campo,
                [key]: value,
              }
          : campo,
      ),
    }));
  }

  function handleDeleteField(tipoId, campoId) {
    updateTipo(tipoId, (tipo) => ({
      ...tipo,
      campos: tipo.campos.filter((campo) => campo.id !== campoId),
    }));
  }

  function handleFieldOptionText(tipoId, campoId, text) {
    const opciones = text
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    updateTipo(tipoId, (tipo) => ({
      ...tipo,
      campos: tipo.campos.map((campo) =>
        campo.id === campoId
          ? {
              ...campo,
              opciones,
              valorInicial:
                campo.valorInicial && opciones.some((item) => item === campo.valorInicial)
                  ? campo.valorInicial
                  : opciones[0] || "",
            }
          : campo,
      ),
    }));
  }

  function handleToggleFieldScope(tipoId, campoId, optionValue) {
    updateTipo(tipoId, (tipo) => ({
      ...tipo,
      campos: tipo.campos.map((campo) => {
        if (campo.id !== campoId) return campo;

        const current = new Set(campo.aplicaA || []);
        if (current.has(optionValue)) {
          current.delete(optionValue);
        } else {
          current.add(optionValue);
        }

        return {
          ...campo,
          aplicaA: [...current],
        };
      }),
    }));
  }

  async function handleLogoSeleccionado(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isPremium) {
      setErrorLogo("El logo del negocio esta disponible solo en el plan Premium.");
      return;
    }

    setErrorLogo("");
    setProcesandoLogo(true);
    try {
      const dataUrl = await procesarArchivoLogo(file);
      setDraft((prev) => ({ ...prev, logo: dataUrl }));
    } catch (error) {
      setErrorLogo(String(error?.message || "No se pudo procesar la imagen."));
    } finally {
      setProcesandoLogo(false);
    }
  }

  function handleQuitarLogo() {
    if (!isPremium) return;
    setErrorLogo("");
    setDraft((prev) => ({ ...prev, logo: "" }));
  }

  async function handleGuardar() {
    if (guardando) return;

    try {
      setGuardando(true);
      setErrorDetalle("");
      await actualizarEmpresaConfig({
        ...draft,
        nombre: String(draft.nombre || "").trim(),
        subtitulo: String(draft.subtitulo || "").trim(),
        telefono: String(draft.telefono || "").trim(),
        correoTickets: String(draft.correoTickets || "").trim().toLowerCase(),
        correoNotas: String(draft.correoNotas || "").trim().toLowerCase(),
      });
      setMensaje("Configuracion de empresa guardada.");
      window.setTimeout(() => setMensaje(""), 2500);
    } catch (error) {
      console.error("No se pudo guardar la configuracion de empresa:", error);
      setMensaje("No se pudo guardar la configuracion.");
      setErrorDetalle(String(error?.code || error?.message || "Error desconocido"));
      window.setTimeout(() => setMensaje(""), 2500);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="cfg-pos-wrap">
      <div className="cfg-pos-page-head">
        <h2>Empresa</h2>
        <p>
          {serviciosActivosEnEmpresa
            ? "Aqui puedes definir el nombre del negocio, el tipo de trabajo activo y los campos que apareceran en la hoja de servicio."
            : "Aqui puedes definir el nombre del negocio y activar un modo comercial como tienda de abarrotes para ocultar el modulo de servicios."}
        </p>
      </div>

      {tipoActivo?.id === "restaurante" && (
        <div className="cfg-pos-card cfg-empresa-card cfg-empresa-editor-card cfg-restaurant-card">
          <div className="cfg-ticket-block cfg-ticket-block-wide">
            <div className="cfg-empresa-section-head">
              <div>
                <h4>Distribución del restaurante</h4>
                <p>Configura los pisos y la cantidad de mesas que verá el personal de Mesero.</p>
              </div>
            </div>
            <label htmlFor="restaurante-cantidad-pisos">Cantidad de pisos</label>
            <input
              id="restaurante-cantidad-pisos"
              type="number"
              min="1"
              max={limitesRestaurante.maxPisos}
              value={draft.restaurante.pisos.length}
              onChange={(event) => handleCantidadPisosChange(event.target.value)}
              disabled={!isPremium}
            />
            {!isPremium && (
              <button
                type="button"
                className="cfg-premium-inline"
                onClick={() => setModalRestaurantePremium(true)}
              >
                <span className="cfg-premium-inline-badge">
                  <FiStar aria-hidden="true" />
                  Free
                </span>
                <span className="cfg-premium-inline-text">Incluye 1 piso y hasta 10 mesas</span>
                <span className="cfg-premium-inline-cta">
                  Conocer Premium
                  <FiArrowRight aria-hidden="true" />
                </span>
              </button>
            )}
            <div className="cfg-restaurant-floors">
              {draft.restaurante.pisos.map((piso, index) => (
                <div className="cfg-restaurant-floor" key={piso.id}>
                  <strong>Piso {index + 1}</strong>
                  <label>
                    Nombre
                    <input
                      type="text"
                      value={piso.nombre}
                      maxLength={40}
                      disabled={!isPremium && index >= limitesRestaurante.maxPisos}
                      onChange={(event) => handlePisoChange(index, "nombre", event.target.value)}
                    />
                  </label>
                  <label>
                    Cantidad de mesas
                    <input
                      type="number"
                      min="1"
                      max={limitesRestaurante.maxMesasPorPiso}
                      value={piso.cantidadMesas}
                      disabled={!isPremium && index >= limitesRestaurante.maxPisos}
                      onChange={(event) => handlePisoChange(index, "cantidadMesas", event.target.value)}
                    />
                  </label>
                  {!isPremium && index >= limitesRestaurante.maxPisos && (
                    <small className="cfg-pos-help">Piso heredado: no se pueden crear pisos adicionales en Free.</small>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {serviciosActivosEnEmpresa && (
        <div className="cfg-pos-card cfg-empresa-card cfg-empresa-editor-card cfg-qr-card" id="rastreo-servicios-empresa">
          <div className="cfg-ticket-block cfg-ticket-block-wide">
            <div className="cfg-empresa-section-head">
              <div>
                <h4>Rastreo de servicios mediante QR</h4>
                <p>
                  Permite que tus clientes consulten el estado de su servicio con un codigo QR y su
                  folio, sin exponer datos internos del negocio.
                </p>
              </div>
            </div>
            <label className="cfg-check-row cfg-qr-toggle">
              <input
                type="checkbox"
                checked={isPremium && rastreoQr}
                disabled={!isPremium || serviciosConfigLoading || guardandoRastreo}
                onChange={(event) => handleRastreoQrChange(event.target.checked)}
              />
              <span>{isPremium ? "Activar rastreo mediante QR" : "Rastreo mediante QR · Premium"}</span>
            </label>
            {isPremium && mensajeRastreo ? (
              <small className="cfg-pos-saved cfg-qr-flash">{mensajeRastreo}</small>
            ) : null}
            {!isPremium && (
              <button
                type="button"
                className="cfg-premium-inline"
                onClick={() => setModalRastreoPremium(true)}
              >
                <span className="cfg-premium-inline-badge">
                  <FiStar aria-hidden="true" />
                  Free
                </span>
                <span className="cfg-premium-inline-text">El rastreo QR esta disponible en Premium</span>
                <span className="cfg-premium-inline-cta">
                  Conocer Premium
                  <FiArrowRight aria-hidden="true" />
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      <PremiumFeatureModal
        abierto={modalRastreoPremium}
        titulo="Rastreo de Servicios"
        mensaje="Permite que tus clientes consulten el estado de sus servicios mediante QR, folio y una pagina personalizada."
        textoSecundario="Ahora no"
        onCerrar={() => setModalRastreoPremium(false)}
      />

      <PremiumFeatureModal
        abierto={modalRestaurantePremium}
        titulo="Amplía la distribución de tu restaurante"
        mensaje="CajaLibre Free incluye un piso y hasta 10 mesas. Con Premium puedes configurar más pisos y ampliar el mapa de mesas."
        textoSecundario="Ahora no"
        onCerrar={() => setModalRestaurantePremium(false)}
      />

      <div className="cfg-pos-card cfg-empresa-card cfg-empresa-editor-card">
        <div className="cfg-ticket-block cfg-ticket-block-wide">
          <div className="cfg-empresa-section-head">
            <div>
              <h4>Identidad del negocio</h4>
              <p>Estos datos se muestran en el sistema, en los tickets y en las boletas.</p>
            </div>
          </div>

          <div className="cfg-logo-block">
            <div className="cfg-logo-preview" aria-live="polite">
              {draft.logo ? (
                <img src={draft.logo} alt="Logo del negocio" />
              ) : (
                <span className="cfg-logo-empty">Sin logo</span>
              )}
            </div>

            <div className="cfg-logo-info">
              <div className="cfg-logo-title">
                <strong>Logo del negocio</strong>
                <span className="cfg-logo-premium-tag">Premium</span>
              </div>
              <p>
                Se usará en el encabezado, el pie de página, los tickets y como marca de agua del
                punto de venta. Lo verán también tus trabajadores.
              </p>

              <div className="cfg-logo-actions">
                <input
                  ref={logoInputRef}
                  id="empresa-logo"
                  type="file"
                  accept={LOGO_EXTENSIONES}
                  onChange={handleLogoSeleccionado}
                  hidden
                />
                <button
                  type="button"
                  className="cfg-ticket-test-btn"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={procesandoLogo || !isPremium}
                >
                  {procesandoLogo ? "Procesando..." : draft.logo ? "Cambiar logo" : "Subir logo"}
                </button>
                {draft.logo && (
                  <button
                    type="button"
                    className="cfg-empresa-secondary-btn"
                    onClick={handleQuitarLogo}
                    disabled={procesandoLogo || !isPremium}
                  >
                    Quitar
                  </button>
                )}
              </div>

              {isPremium ? (
                <small className="cfg-pos-help">
                  Formatos permitidos: PNG o ICO. La imagen se ajusta automáticamente.
                </small>
              ) : (
                <small className="cfg-logo-bloqueado">
                  Subir un logo propio está disponible solo en el plan Premium.{" "}
                  <button
                    type="button"
                    className="cfg-logo-link"
                    onClick={() => navigate("/configuracion/pago-premium")}
                  >
                    Mejorar a Premium
                  </button>
                </small>
              )}
              {errorLogo && <small className="cfg-logo-error">{errorLogo}</small>}
            </div>
          </div>

          <div className="cfg-empresa-form-grid">
            <label className="cfg-empresa-field">
              <span>Nombre visible del sistema</span>
              <input
                id="empresa-nombre"
                type="text"
                value={draft.nombre}
                onChange={(e) => setDraft((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Ej. LuisITRepair"
                maxLength={80}
              />
            </label>

            <label className="cfg-empresa-field">
              <span>Subtítulo interno</span>
              <input
                id="empresa-subtitulo"
                type="text"
                value={draft.subtitulo}
                onChange={(e) => setDraft((prev) => ({ ...prev, subtitulo: e.target.value }))}
                placeholder="Ej. Servicio tecnico y punto de venta"
                maxLength={120}
              />
            </label>

            <label className="cfg-empresa-field">
              <span>Número telefónico</span>
              <input
                id="empresa-telefono"
                type="tel"
                value={draft.telefono}
                onChange={(e) => setDraft((prev) => ({ ...prev, telefono: e.target.value }))}
                placeholder="Ej. 273 143 0147"
                maxLength={25}
                autoComplete="tel"
              />
              <small className="cfg-pos-help">Aparece en tickets y boletas.</small>
            </label>

            <label className="cfg-empresa-field">
              <span>Tipo de negocio activo</span>
              <select
                id="empresa-tipo-activo"
                value={draft.tipoNegocioId}
                onChange={(e) => setDraft((prev) => ({ ...prev, tipoNegocioId: e.target.value }))}
              >
                {tiposNegocio.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="cfg-empresa-field">
              <span>Correo para tickets</span>
              <input
                id="empresa-correo-tickets"
                type="email"
                value={draft.correoTickets}
                onChange={(e) => setDraft((prev) => ({ ...prev, correoTickets: e.target.value }))}
                placeholder="Ej. ventas@minegocio.com"
                maxLength={160}
                autoComplete="email"
              />
              <small className="cfg-pos-help">Aparece en los tickets de venta.</small>
            </label>

            <label className="cfg-empresa-field">
              <span>Correo para notas y boletas</span>
              <input
                id="empresa-correo-notas"
                type="email"
                value={draft.correoNotas}
                onChange={(e) => setDraft((prev) => ({ ...prev, correoNotas: e.target.value }))}
                placeholder="Ej. notas@minegocio.com"
                maxLength={160}
                autoComplete="email"
              />
              <small className="cfg-pos-help">Aparece en las notas y boletas PDF.</small>
            </label>
          </div>

          <div className="cfg-empresa-preview">
            {draft.logo && <img className="cfg-empresa-preview-logo" src={draft.logo} alt="" />}
            <strong>Vista previa:</strong>{" "}
            {String(draft.nombre || "").trim() || "Tu negocio"}{" "}
            <span className="cfg-empresa-preview-pill">
              {tipoActivo?.nombre || "Sin tipo"}
            </span>
          </div>
          <small className="cfg-pos-help">
            {serviciosActivosEnEmpresa
              ? "Este tipo mantiene visible la hoja de servicio, el listado de servicios y su configuracion."
              : "Este tipo oculta hoja de servicio, seguimiento tecnico y accesos relacionados con servicios."}
          </small>
        </div>
      </div>

      <div className="cfg-pos-card cfg-empresa-card cfg-empresa-editor-card">
        <div className="cfg-ticket-block cfg-ticket-block-wide">
          <div className="cfg-empresa-section-head">
            <div>
              <h4>Tipos de negocio</h4>
              <p>
                {serviciosActivosEnEmpresa
                  ? "Cada tipo puede tener opciones de equipo/vehiculo distintas y campos propios para la hoja de servicio."
                  : "Cada tipo define como se comporta el sistema. Usa tienda de abarrotes para trabajar sin modulo de servicios."}
              </p>
            </div>
            <div className="cfg-empresa-actions-inline">
              <button type="button" className="cfg-ticket-test-btn" onClick={handleAddCustomType}>
                Nuevo tipo personalizado
              </button>
            </div>
          </div>

          {presetFaltantes.length > 0 && (
            <div className="cfg-empresa-preset-row">
              {presetFaltantes.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="cfg-empresa-preset-btn"
                  onClick={() => handleImportPreset(preset.id)}
                >
                  Agregar {preset.nombre}
                </button>
              ))}
            </div>
          )}

          <div className="cfg-empresa-type-list">
            {tiposNegocio.map((tipo) => {
              const isActive = tipo.id === draft.tipoNegocioId;
              const isEditing = tipo.id === tipoEnEdicion?.id;

              return (
                <div
                  key={tipo.id}
                  className={`cfg-empresa-type-card${isActive ? " active" : ""}${isEditing ? " editing" : ""}`}
                >
                  <div className="cfg-empresa-type-head">
                    <div>
                      <strong>{tipo.nombre}</strong>
                      <p>{tipo.descripcion || "Sin descripcion."}</p>
                    </div>
                    <div className="cfg-empresa-type-badges">
                      {isActive ? <span>Activo</span> : null}
                      {isEditing ? <span>Editando</span> : null}
                      {tipo.serviciosHabilitados === false ? <span>Sin servicios</span> : null}
                    </div>
                  </div>

                  <div className="cfg-empresa-type-meta">
                    <span>{tipo.opcionesTipoDispositivo.length} tipos</span>
                    <span>{tipo.campos.length} campos extra</span>
                    <span>
                      {tipo.serviciosHabilitados === false ? "POS e inventario" : tipo.tituloHoja}
                    </span>
                  </div>

                  <div className="cfg-empresa-chip-row">
                    {tipo.opcionesTipoDispositivo.map((option) => (
                      <span key={option.value} className="cfg-empresa-chip">
                        {option.label}
                      </span>
                    ))}
                  </div>

                  <div className="cfg-empresa-actions-inline">
                    <button
                      type="button"
                      className="cfg-ticket-test-btn"
                      onClick={() => {
                        setTipoEditorId(tipo.id);
                        setMostrarEditorTipo(true);
                      }}
                    >
                      Editar
                    </button>
                    {!isActive && (
                      <button
                        type="button"
                        className="cfg-empresa-secondary-btn"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            tipoNegocioId: tipo.id,
                          }))
                        }
                      >
                        {tipo.serviciosHabilitados === false ? "Usar en sistema" : "Usar en hoja"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="cfg-servicios-remove-btn"
                      onClick={() => handleDeleteType(tipo.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {mostrarEditorTipo && tipoEnEdicion && (
        <div ref={editorRef} className="cfg-pos-card cfg-empresa-card cfg-empresa-editor-card">
          <div className="cfg-ticket-block cfg-ticket-block-wide">
            <div className="cfg-empresa-section-head">
              <div>
                <h4>Editor del tipo de negocio</h4>
                <p>
                  {serviciosActivosEnEdicion
                    ? "Ajusta nombre, labels base, tipos de dispositivo y los campos adicionales que apareceran al capturar el servicio."
                    : "Este tipo funciona como modo comercial. Mantendra ocultos hoja de servicio, listado de servicios y accesos tecnicos."}
                </p>
              </div>
              <div className="cfg-empresa-actions-inline">
                <small className="cfg-pos-help">
                  ID interno: {tipoEnEdicion.id}
                </small>
                <button
                  type="button"
                  className="cfg-empresa-secondary-btn"
                  onClick={() => setMostrarEditorTipo(false)}
                >
                  Ocultar editor
                </button>
              </div>
            </div>

            <div className="cfg-empresa-form-grid">
              <label className="cfg-empresa-field">
                <span>Nombre del tipo</span>
                <input
                  value={tipoEnEdicion.nombre}
                  onChange={(e) =>
                    handleTipoFieldChange(tipoEnEdicion.id, "nombre", e.target.value)
                  }
                />
              </label>

              <label className="cfg-empresa-field cfg-empresa-field-full">
                <span>Descripcion</span>
                <input
                  value={tipoEnEdicion.descripcion}
                  onChange={(e) =>
                    handleTipoFieldChange(tipoEnEdicion.id, "descripcion", e.target.value)
                  }
                />
              </label>

              <label className="cfg-check-row cfg-empresa-field cfg-empresa-field-full">
                <input
                  type="checkbox"
                  checked={serviciosActivosEnEdicion}
                  onChange={(e) =>
                    handleTipoFieldChange(
                      tipoEnEdicion.id,
                      "serviciosHabilitados",
                      e.target.checked,
                    )
                  }
                />
                <span>Habilitar modulo de servicios y hoja de servicio para este tipo</span>
              </label>

              {serviciosActivosEnEdicion && (
                <>
                  <label className="cfg-empresa-field">
                    <span>Titulo de la hoja</span>
                    <input
                      value={tipoEnEdicion.tituloHoja}
                      onChange={(e) =>
                        handleTipoFieldChange(tipoEnEdicion.id, "tituloHoja", e.target.value)
                      }
                    />
                  </label>

                  <label className="cfg-empresa-field">
                    <span>Label tipo</span>
                    <input
                      value={tipoEnEdicion.etiquetaTipoDispositivo}
                      onChange={(e) =>
                        handleTipoFieldChange(
                          tipoEnEdicion.id,
                          "etiquetaTipoDispositivo",
                          e.target.value,
                        )
                      }
                    />
                  </label>

                  <label className="cfg-empresa-field">
                    <span>Label marca</span>
                    <input
                      value={tipoEnEdicion.etiquetaMarca}
                      onChange={(e) =>
                        handleTipoFieldChange(tipoEnEdicion.id, "etiquetaMarca", e.target.value)
                      }
                    />
                  </label>

                  <label className="cfg-empresa-field">
                    <span>Label modelo</span>
                    <input
                      value={tipoEnEdicion.etiquetaModelo}
                      onChange={(e) =>
                        handleTipoFieldChange(tipoEnEdicion.id, "etiquetaModelo", e.target.value)
                      }
                    />
                  </label>

                  <label className="cfg-empresa-field">
                    <span>Label serie</span>
                    <input
                      value={tipoEnEdicion.etiquetaSerie}
                      onChange={(e) =>
                        handleTipoFieldChange(tipoEnEdicion.id, "etiquetaSerie", e.target.value)
                      }
                    />
                  </label>

                  <label className="cfg-empresa-field">
                    <span>Label trabajo</span>
                    <input
                      value={tipoEnEdicion.etiquetaTrabajo}
                      onChange={(e) =>
                        handleTipoFieldChange(tipoEnEdicion.id, "etiquetaTrabajo", e.target.value)
                      }
                    />
                  </label>

                  <label className="cfg-empresa-field">
                    <span>Label costo</span>
                    <input
                      value={tipoEnEdicion.etiquetaCosto}
                      onChange={(e) =>
                        handleTipoFieldChange(tipoEnEdicion.id, "etiquetaCosto", e.target.value)
                      }
                    />
                  </label>

                  <label className="cfg-empresa-field cfg-empresa-field-full">
                    <span>Texto de caracteristicas pendientes</span>
                    <input
                      value={tipoEnEdicion.etiquetaCaracteristicasPendientes}
                      onChange={(e) =>
                        handleTipoFieldChange(
                          tipoEnEdicion.id,
                          "etiquetaCaracteristicasPendientes",
                          e.target.value,
                        )
                      }
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {serviciosActivosEnEdicion ? (
            <>
              <div className="cfg-ticket-block cfg-ticket-block-wide">
                <div className="cfg-empresa-section-head">
                  <div>
                    <h4>Tipos de dispositivo</h4>
                    <p>
                      Estas opciones alimentan el selector principal de la hoja de servicio.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cfg-ticket-test-btn"
                    onClick={() => handleAddDeviceOption(tipoEnEdicion.id)}
                  >
                    Agregar opcion
                  </button>
                </div>

                <div className="cfg-empresa-device-list">
                  {tipoEnEdicion.opcionesTipoDispositivo.map((option) => (
                    <div key={option.value} className="cfg-empresa-device-row">
                      <label className="cfg-empresa-field">
                        <span>Nombre visible</span>
                        <input
                          value={option.label}
                          onChange={(e) =>
                            handleDeviceOptionLabelChange(
                              tipoEnEdicion.id,
                              option.value,
                              e.target.value,
                            )
                          }
                        />
                      </label>
                      <div className="cfg-company-managed">
                        <strong>Valor interno</strong>
                        <span>{option.value || slugify(option.label) || "sin valor"}</span>
                      </div>
                      <button
                        type="button"
                        className="cfg-servicios-remove-btn"
                        onClick={() => handleDeleteDeviceOption(tipoEnEdicion.id, option.value)}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="cfg-ticket-block cfg-ticket-block-wide">
                <div className="cfg-empresa-section-head">
                  <div>
                    <h4>Campos adicionales de la hoja</h4>
                    <p>
                      Puedes agregar, quitar y limitar campos por tipo de dispositivo.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cfg-ticket-test-btn"
                    onClick={() => handleAddField(tipoEnEdicion.id)}
                  >
                    Agregar campo
                  </button>
                </div>

                <div className="cfg-empresa-field-list">
                  {tipoEnEdicion.campos.length === 0 && (
                    <div className="cfg-grid-empty">
                      Este tipo aun no tiene campos extra. Agrega los que necesite tu hoja.
                    </div>
                  )}

                  {tipoEnEdicion.campos.map((campo) => (
                    <div key={campo.id} className="cfg-empresa-field-card">
                      <div className="cfg-empresa-field-card-head">
                        <strong>{campo.etiqueta || "Campo sin nombre"}</strong>
                        <small className="cfg-pos-help">ID: {campo.id}</small>
                      </div>

                      <div className="cfg-empresa-form-grid">
                        <label className="cfg-empresa-field">
                          <span>Etiqueta</span>
                          <input
                            value={campo.etiqueta}
                            onChange={(e) =>
                              handleFieldChange(tipoEnEdicion.id, campo.id, "etiqueta", e.target.value)
                            }
                          />
                        </label>

                        <label className="cfg-empresa-field">
                          <span>Tipo</span>
                          <select
                            value={campo.tipo}
                            onChange={(e) =>
                              handleFieldChange(tipoEnEdicion.id, campo.id, "tipo", e.target.value)
                            }
                          >
                            <option value="text">Texto</option>
                            <option value="textarea">Texto largo</option>
                            <option value="select">Lista</option>
                            <option value="number">Numero</option>
                            <option value="checkbox">Checkbox</option>
                          </select>
                        </label>

                        <label className="cfg-empresa-field">
                          <span>Placeholder</span>
                          <input
                            value={campo.placeholder || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                tipoEnEdicion.id,
                                campo.id,
                                "placeholder",
                                e.target.value,
                              )
                            }
                          />
                        </label>

                        {campo.tipo !== "checkbox" && (
                          <label className="cfg-empresa-field">
                            <span>Valor inicial</span>
                            <input
                              value={String(campo.valorInicial ?? "")}
                              onChange={(e) =>
                                handleFieldChange(
                                  tipoEnEdicion.id,
                                  campo.id,
                                  "valorInicial",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                        )}

                        {campo.tipo === "select" && (
                          <label className="cfg-empresa-field cfg-empresa-field-full">
                            <span>Opciones (una por linea)</span>
                            <textarea
                              value={(campo.opciones || []).join("\n")}
                              onChange={(e) =>
                                handleFieldOptionText(tipoEnEdicion.id, campo.id, e.target.value)
                              }
                            />
                          </label>
                        )}

                        <div className="cfg-empresa-switch-row cfg-empresa-field-full">
                          <label className="cfg-check-row">
                            <input
                              type="checkbox"
                              checked={!!campo.requerido}
                              onChange={(e) =>
                                handleFieldChange(
                                  tipoEnEdicion.id,
                                  campo.id,
                                  "requerido",
                                  e.target.checked,
                                )
                              }
                            />
                            <span>Campo obligatorio</span>
                          </label>

                          <label className="cfg-check-row">
                            <input
                              type="checkbox"
                              checked={!!campo.anchoCompleto}
                              onChange={(e) =>
                                handleFieldChange(
                                  tipoEnEdicion.id,
                                  campo.id,
                                  "anchoCompleto",
                                  e.target.checked,
                                )
                              }
                            />
                            <span>Usar ancho completo</span>
                          </label>
                        </div>

                        <div className="cfg-empresa-field cfg-empresa-field-full">
                          <span>Visible para</span>
                          <div className="cfg-empresa-scope-grid">
                            {tipoEnEdicion.opcionesTipoDispositivo.map((option) => {
                              const checked = (campo.aplicaA || []).includes(option.value);
                              return (
                                <label key={option.value} className="cfg-check-row">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      handleToggleFieldScope(
                                        tipoEnEdicion.id,
                                        campo.id,
                                        option.value,
                                      )
                                    }
                                  />
                                  <span>{option.label}</span>
                                </label>
                              );
                            })}
                            <small className="cfg-pos-help">
                              Si no marcas ninguna opcion, el campo se mostrara para todos.
                            </small>
                          </div>
                        </div>
                      </div>

                      <div className="cfg-empresa-actions-inline">
                        <button
                          type="button"
                          className="cfg-servicios-remove-btn"
                          onClick={() => handleDeleteField(tipoEnEdicion.id, campo.id)}
                        >
                          Eliminar campo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="cfg-ticket-block cfg-ticket-block-wide">
              <div className="cfg-grid-empty">
                Este tipo esta configurado como modo comercial. La hoja de servicio y sus campos
                adicionales permaneceran ocultos mientras este modo siga activo.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="cfg-servicios-savebar">
        <button
          type="button"
          className="cfg-ticket-test-btn"
          onClick={handleGuardar}
          disabled={guardando}
        >
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>

        {mensaje ? <small className="cfg-pos-saved">{mensaje}</small> : null}
        {errorDetalle ? <small className="cfg-pos-help">Detalle: {errorDetalle}</small> : null}
      </div>
    </section>
  );
}
