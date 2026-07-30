import { useEffect, useMemo, useRef, useState } from "react";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { actualizarEmpresaConfig } from "../js/services/configure_empresa";
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
    tipoNegocioId: String(config?.tipoNegocioId || ""),
    tiposNegocio,
    restaurante: {
      pisos: Array.isArray(config?.restaurante?.pisos) && config.restaurante.pisos.length
        ? config.restaurante.pisos.map((piso, index) => ({
            id: String(piso?.id || `piso-${index + 1}`),
            nombre: String(piso?.nombre || `Piso ${index + 1}`),
            cantidadMesas: Math.max(1, Number(piso?.cantidadMesas) || 1),
          }))
        : [{ id: "piso-1", nombre: "Piso 1", cantidadMesas: 12 }],
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
  const { empresa } = useEmpresaConfig();
  const [draft, setDraft] = useState(() => cloneEmpresaConfig(empresa));
  const [tipoEditorId, setTipoEditorId] = useState(() => String(empresa?.tipoNegocioId || ""));
  const [mostrarEditorTipo, setMostrarEditorTipo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");
  const editorRef = useRef(null);
  const didMountEditorRef = useRef(false);

  useEffect(() => {
    const nextDraft = cloneEmpresaConfig(empresa);
    setDraft(nextDraft);
    setTipoEditorId(nextDraft.tipoNegocioId || nextDraft.tiposNegocio[0]?.id || "");
    setMostrarEditorTipo(false);
  }, [empresa]);

  useEffect(() => {
    if (!didMountEditorRef.current) {
      didMountEditorRef.current = true;
      return;
    }
    if (!mostrarEditorTipo || !tipoEditorId || !editorRef.current) return;
    editorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mostrarEditorTipo, tipoEditorId]);

  const tiposNegocio = draft.tiposNegocio || [];
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
    const cantidad = Math.min(20, Math.max(1, Number(rawValue) || 1));
    setDraft((prev) => {
      const actuales = prev.restaurante?.pisos || [];
      const pisos = Array.from({ length: cantidad }, (_, index) => (
        actuales[index] || {
          id: `piso-${index + 1}`,
          nombre: `Piso ${index + 1}`,
          cantidadMesas: 12,
        }
      ));
      return { ...prev, restaurante: { ...prev.restaurante, pisos } };
    });
  }

  function handlePisoChange(index, key, value) {
    setDraft((prev) => ({
      ...prev,
      restaurante: {
        ...prev.restaurante,
        pisos: prev.restaurante.pisos.map((piso, pisoIndex) => (
          pisoIndex === index
            ? { ...piso, [key]: key === "cantidadMesas" ? Math.min(200, Math.max(1, Number(value) || 1)) : value }
            : piso
        )),
      },
    }));
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
      setTipoEditorId(preset.id);
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
              max="20"
              value={draft.restaurante.pisos.length}
              onChange={(event) => handleCantidadPisosChange(event.target.value)}
            />
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
                      onChange={(event) => handlePisoChange(index, "nombre", event.target.value)}
                    />
                  </label>
                  <label>
                    Cantidad de mesas
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={piso.cantidadMesas}
                      onChange={(event) => handlePisoChange(index, "cantidadMesas", event.target.value)}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="cfg-pos-card cfg-empresa-card cfg-empresa-editor-card">
        <div className="cfg-ticket-block cfg-ticket-block-wide">
          <h4>Identidad del negocio</h4>
          <label htmlFor="empresa-nombre">Nombre visible del sistema</label>
          <input
            id="empresa-nombre"
            type="text"
            value={draft.nombre}
            onChange={(e) => setDraft((prev) => ({ ...prev, nombre: e.target.value }))}
            placeholder="Ej. LuisITRepair"
            maxLength={80}
          />

          <label htmlFor="empresa-subtitulo">Subtitulo interno</label>
          <input
            id="empresa-subtitulo"
            type="text"
            value={draft.subtitulo}
            onChange={(e) => setDraft((prev) => ({ ...prev, subtitulo: e.target.value }))}
            placeholder="Ej. Servicio tecnico y punto de venta"
            maxLength={120}
          />

          <label htmlFor="empresa-telefono">Número telefónico</label>
          <input
            id="empresa-telefono"
            type="tel"
            value={draft.telefono}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, telefono: e.target.value }))
            }
            placeholder="Ej. 273 143 0147"
            maxLength={25}
            autoComplete="tel"
          />
          <small className="cfg-pos-help">
            Este número aparecerá en los tickets y en las boletas del negocio.
          </small>

          <label htmlFor="empresa-correo-tickets">Correo para tickets</label>
          <input
            id="empresa-correo-tickets"
            type="email"
            value={draft.correoTickets}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, correoTickets: e.target.value }))
            }
            placeholder="Ej. ventas@minegocio.com"
            maxLength={160}
            autoComplete="email"
          />
          <small className="cfg-pos-help">
            Este correo aparecerá en los tickets de venta.
          </small>

          <label htmlFor="empresa-correo-notas">Correo para notas y boletas</label>
          <input
            id="empresa-correo-notas"
            type="email"
            value={draft.correoNotas}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, correoNotas: e.target.value }))
            }
            placeholder="Ej. notas@minegocio.com"
            maxLength={160}
            autoComplete="email"
          />
          <small className="cfg-pos-help">
            Este correo aparecerá en las notas y boletas PDF generadas por el sistema.
          </small>

          <label htmlFor="empresa-tipo-activo">Tipo de negocio activo</label>
          <select
            id="empresa-tipo-activo"
            value={draft.tipoNegocioId}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                tipoNegocioId: e.target.value,
              }))
            }
          >
            {tiposNegocio.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </option>
            ))}
          </select>

          <div className="cfg-empresa-preview">
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
