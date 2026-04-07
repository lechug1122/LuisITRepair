const FIELD_TYPES = new Set(["text", "textarea", "select", "number", "checkbox"]);

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function toText(value, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "si", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeUniqueId(baseId, usedIds, fallbackPrefix) {
  const base = normalizeKey(baseId) || `${fallbackPrefix}-${usedIds.size + 1}`;
  let next = base;
  let counter = 2;

  while (usedIds.has(next)) {
    next = `${base}-${counter}`;
    counter += 1;
  }

  usedIds.add(next);
  return next;
}

function toTextList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => toText(item)).filter(Boolean);
}

function normalizeSelectValue(options, value, fallback = "") {
  const text = toText(value, fallback);
  if (!text) return "";

  const exact = options.find((item) => item === text);
  if (exact) return exact;

  const loose = options.find((item) => normalizeKey(item) === normalizeKey(text));
  return loose || text;
}

function normalizeOpcionTipoDispositivo(raw, index = 0, usedValues = new Set()) {
  const label =
    toText(raw?.label) ||
    toText(raw?.nombre) ||
    toText(raw) ||
    `Opcion ${index + 1}`;
  const value = makeUniqueId(raw?.value || label, usedValues, "tipo");
  return { value, label };
}

function normalizeOpcionesTipoDispositivo(raw) {
  const source = Array.isArray(raw) && raw.length ? raw : [{ value: "general", label: "General" }];
  const usedValues = new Set();
  return source.map((item, index) => normalizeOpcionTipoDispositivo(item, index, usedValues));
}

function normalizeCampoTipo(rawType) {
  const type = toText(rawType, "text").toLowerCase();
  return FIELD_TYPES.has(type) ? type : "text";
}

function normalizeCampoValorInicial(type, rawValue, opciones = []) {
  if (type === "checkbox") return toBool(rawValue, false);
  if (type === "select") return normalizeSelectValue(opciones, rawValue, opciones[0] || "");
  return toText(rawValue);
}

export function normalizeCampoHoja(raw = {}, index = 0, deviceValues = []) {
  const tipo = normalizeCampoTipo(raw?.tipo);
  const opciones = tipo === "select" ? toTextList(raw?.opciones) : [];
  const aplicaA = Array.isArray(raw?.aplicaA)
    ? raw.aplicaA.map((item) => toText(item)).filter((item) => deviceValues.includes(item))
    : [];
  const rawId = toText(raw?.id);
  const rawEtiqueta = toText(raw?.etiqueta || raw?.label, `Campo ${index + 1}`) || `Campo ${index + 1}`;
  const shouldUseAnioLabel =
    normalizeKey(rawId) === "anio" &&
    ["", "anio", "ano"].includes(normalizeKey(rawEtiqueta));

  return {
    id: rawId || normalizeKey(raw?.etiqueta || raw?.label) || `campo-${index + 1}`,
    etiqueta: shouldUseAnioLabel ? "Año" : rawEtiqueta,
    tipo,
    placeholder: toText(raw?.placeholder),
    opciones,
    requerido: toBool(raw?.requerido, false),
    anchoCompleto: toBool(raw?.anchoCompleto || raw?.wide, false),
    aplicaA,
    valorInicial: normalizeCampoValorInicial(tipo, raw?.valorInicial, opciones),
  };
}

function normalizeCamposHoja(raw, opcionesTipoDispositivo) {
  const source = Array.isArray(raw) ? raw : [];
  const usedIds = new Set();
  const deviceValues = opcionesTipoDispositivo.map((item) => item.value);

  return source.map((item, index) => {
    const campo = normalizeCampoHoja(item, index, deviceValues);
    return {
      ...campo,
      id: makeUniqueId(campo.id || campo.etiqueta, usedIds, "campo"),
    };
  });
}

export function normalizeTipoNegocio(raw = {}, index = 0) {
  const nombre = toText(raw?.nombre, `Tipo de negocio ${index + 1}`) || `Tipo de negocio ${index + 1}`;
  const rawId = toText(raw?.id);
  const opcionesTipoDispositivo = normalizeOpcionesTipoDispositivo(raw?.opcionesTipoDispositivo);
  const campos = normalizeCamposHoja(raw?.campos, opcionesTipoDispositivo);

  return {
    id: rawId || normalizeKey(nombre) || `tipo-negocio-${index + 1}`,
    nombre,
    descripcion: toText(raw?.descripcion),
    tituloHoja:
      toText(raw?.tituloHoja) ||
      `Registro de ${nombre.toLowerCase()}`,
    etiquetaTipoDispositivo:
      toText(raw?.etiquetaTipoDispositivo) || "Tipo de dispositivo",
    etiquetaMarca: toText(raw?.etiquetaMarca) || "Marca",
    etiquetaModelo: toText(raw?.etiquetaModelo) || "Modelo",
    etiquetaSerie: toText(raw?.etiquetaSerie) || "Numero de serie",
    etiquetaTrabajo: toText(raw?.etiquetaTrabajo) || "Trabajo a realizar",
    etiquetaCosto: toText(raw?.etiquetaCosto) || "Costo estimado",
    etiquetaCaracteristicasPendientes:
      toText(raw?.etiquetaCaracteristicasPendientes) || "Completar caracteristicas despues",
    placeholderTrabajo:
      toText(raw?.placeholderTrabajo) || "Describe el servicio o la falla reportada",
    serviciosHabilitados: raw?.serviciosHabilitados !== false,
    plantillaPdf:
      toText(raw?.plantillaPdf) ||
      (rawId === "automotriz" ? "automotriz" : "generica"),
    opcionesTipoDispositivo,
    campos,
  };
}

export function buildCampoHojaVacio(index = 0) {
  return normalizeCampoHoja(
    {
      id: `campo-${index + 1}`,
      etiqueta: `Campo ${index + 1}`,
      tipo: "text",
      placeholder: "",
      opciones: [],
      requerido: false,
      anchoCompleto: false,
      aplicaA: [],
      valorInicial: "",
    },
    index,
    ["general"],
  );
}

export function buildTipoNegocioVacio(index = 0) {
  return normalizeTipoNegocio(
    {
      id: `tipo-negocio-${index + 1}`,
      nombre: `Nuevo tipo ${index + 1}`,
      descripcion: "",
      tituloHoja: "Registro de servicio",
      etiquetaTipoDispositivo: "Tipo de dispositivo",
      etiquetaMarca: "Marca",
      etiquetaModelo: "Modelo",
      etiquetaSerie: "Numero de serie",
      etiquetaTrabajo: "Trabajo a realizar",
      etiquetaCosto: "Costo estimado",
      etiquetaCaracteristicasPendientes: "Completar caracteristicas despues",
      placeholderTrabajo: "Describe el servicio o la falla reportada",
      serviciosHabilitados: true,
      plantillaPdf: "generica",
      opcionesTipoDispositivo: [{ value: "general", label: "General" }],
      campos: [],
    },
    index,
  );
}

export const TIPOS_NEGOCIO_PRESET = [
  normalizeTipoNegocio({
    id: "soporte-computo",
    nombre: "Tecnico de equipos de computo",
    descripcion: "Laptop, PC, impresora y monitor",
    tituloHoja: "Registro de servicio tecnico",
    etiquetaTipoDispositivo: "Tipo de equipo",
    etiquetaSerie: "Numero de serie",
    etiquetaTrabajo: "Trabajo a realizar",
    opcionesTipoDispositivo: [
      { value: "laptop", label: "Laptop" },
      { value: "pc", label: "Computadora de escritorio" },
      { value: "impresora", label: "Impresora" },
      { value: "monitor", label: "Monitor" },
    ],
    campos: [
      { id: "procesador", etiqueta: "Procesador", tipo: "text", placeholder: "Ej. Intel Core i5", aplicaA: ["laptop", "pc"] },
      { id: "ram", etiqueta: "Memoria RAM", tipo: "text", placeholder: "Ej. 8 GB", aplicaA: ["laptop", "pc"] },
      { id: "disco", etiqueta: "Disco duro", tipo: "text", placeholder: "Ej. SSD 256 GB", aplicaA: ["laptop", "pc"] },
      {
        id: "estadoPantalla",
        etiqueta: "Pantalla",
        tipo: "select",
        opciones: ["Funciona bien", "Con detalles", "Danada / No funciona"],
        valorInicial: "Funciona bien",
        aplicaA: ["laptop", "pc"],
      },
      {
        id: "estadoTeclado",
        etiqueta: "Teclado",
        tipo: "select",
        opciones: ["Funciona bien", "Algunas teclas no funcionan", "La mayoria no funciona", "No funciona"],
        valorInicial: "Funciona bien",
        aplicaA: ["laptop", "pc"],
      },
      {
        id: "estadoMouse",
        etiqueta: "Mouse / touchpad",
        tipo: "select",
        opciones: ["Funciona bien", "A veces falla", "No funciona"],
        valorInicial: "Funciona bien",
        aplicaA: ["laptop", "pc"],
      },
      {
        id: "funciona",
        etiqueta: "Funciona correctamente",
        tipo: "select",
        opciones: ["Si", "No"],
        valorInicial: "Si",
        aplicaA: ["laptop", "pc"],
      },
      {
        id: "enciendeEquipo",
        etiqueta: "Enciende el equipo",
        tipo: "select",
        opciones: ["Si", "No"],
        valorInicial: "Si",
        aplicaA: ["laptop", "pc"],
      },
      {
        id: "contrasenaEquipo",
        etiqueta: "Contrasena del equipo",
        tipo: "text",
        placeholder: "Deja vacio si no aplica",
        aplicaA: ["laptop", "pc"],
      },
      {
        id: "tipoImpresora",
        etiqueta: "Tipo de impresora",
        tipo: "select",
        opciones: ["Inyeccion de tinta", "Laser", "Multifuncional"],
        valorInicial: "Inyeccion de tinta",
        aplicaA: ["impresora"],
      },
      {
        id: "imprime",
        etiqueta: "Imprime correctamente",
        tipo: "select",
        opciones: ["Si", "No"],
        valorInicial: "Si",
        aplicaA: ["impresora"],
      },
      {
        id: "condicionesImpresora",
        etiqueta: "Condiciones fisicas",
        tipo: "textarea",
        anchoCompleto: true,
        aplicaA: ["impresora"],
      },
      {
        id: "tamanoMonitor",
        etiqueta: "Tamano",
        tipo: "text",
        placeholder: "Ej. 24 pulgadas",
        aplicaA: ["monitor"],
      },
      {
        id: "colores",
        etiqueta: "Colores correctos",
        tipo: "select",
        opciones: ["Si", "No"],
        valorInicial: "Si",
        aplicaA: ["monitor"],
      },
      {
        id: "condicionesMonitor",
        etiqueta: "Condiciones fisicas",
        tipo: "textarea",
        anchoCompleto: true,
        aplicaA: ["monitor"],
      },
    ],
  }),
  normalizeTipoNegocio({
    id: "telefonia",
    nombre: "Tecnico de telefonos",
    descripcion: "Celulares, tablets y wearables",
    tituloHoja: "Registro de servicio de telefonia",
    etiquetaTipoDispositivo: "Tipo de dispositivo",
    etiquetaSerie: "IMEI / numero de serie",
    etiquetaTrabajo: "Falla reportada",
    opcionesTipoDispositivo: [
      { value: "telefono", label: "Telefono" },
      { value: "tablet", label: "Tablet" },
      { value: "smartwatch", label: "Smartwatch" },
    ],
    campos: [
      { id: "capacidad", etiqueta: "Capacidad", tipo: "text", placeholder: "Ej. 128 GB" },
      { id: "colorEquipo", etiqueta: "Color", tipo: "text" },
      {
        id: "estadoPantallaTelefono",
        etiqueta: "Estado de pantalla",
        tipo: "select",
        opciones: ["Funcional", "Con rayones", "Estrellada", "Sin imagen"],
        valorInicial: "Funcional",
      },
      {
        id: "estadoBateria",
        etiqueta: "Estado de bateria",
        tipo: "select",
        opciones: ["Normal", "Descarga rapida", "Inflada", "No carga"],
        valorInicial: "Normal",
      },
      {
        id: "codigoDesbloqueo",
        etiqueta: "Codigo de desbloqueo",
        tipo: "text",
        placeholder: "PIN, patron o dejar vacio",
      },
      {
        id: "faceIdHuella",
        etiqueta: "Face ID / huella",
        tipo: "select",
        opciones: ["Funciona", "No funciona", "No aplica"],
        valorInicial: "Funciona",
      },
      {
        id: "accesoriosRecibidos",
        etiqueta: "Accesorios recibidos",
        tipo: "textarea",
        anchoCompleto: true,
        placeholder: "Ej. funda, cargador, mica",
      },
      {
        id: "detalleFisicoTelefono",
        etiqueta: "Detalle fisico",
        tipo: "textarea",
        anchoCompleto: true,
      },
    ],
  }),
  normalizeTipoNegocio({
    id: "tienda-abarrotes",
    nombre: "Tienda de abarrotes",
    descripcion: "Solo punto de venta, inventario y clientes",
    tituloHoja: "Operacion comercial",
    etiquetaTipoDispositivo: "Categoria",
    etiquetaMarca: "Marca",
    etiquetaSerie: "Codigo",
    etiquetaTrabajo: "Concepto",
    etiquetaCosto: "Precio",
    etiquetaCaracteristicasPendientes: "Pendiente por definir",
    placeholderTrabajo: "Describe el concepto o la venta",
    serviciosHabilitados: false,
    opcionesTipoDispositivo: [{ value: "general", label: "General" }],
    campos: [],
  }),
  normalizeTipoNegocio({
    id: "automotriz",
    nombre: "Taller automotriz",
    descripcion: "Servicios para autos, motos y camionetas",
    tituloHoja: "Orden de servicio automotriz",
    plantillaPdf: "automotriz",
    etiquetaTipoDispositivo: "Tipo de vehiculo",
    etiquetaMarca: "Marca / fabricante",
    etiquetaSerie: "VIN / serie",
    etiquetaTrabajo: "Servicio solicitado",
    etiquetaCosto: "Costo estimado de mano de obra",
    opcionesTipoDispositivo: [
      { value: "auto", label: "Auto" },
      { value: "moto", label: "Motocicleta" },
      { value: "camioneta", label: "Camioneta" },
    ],
    campos: [
      { id: "numeroEconomico", etiqueta: "# Economico", tipo: "text", placeholder: "Unidad interna o flotilla" },
      { id: "anio", etiqueta: "Año", tipo: "number", placeholder: "Ej. 2020" },
      { id: "motor", etiqueta: "Motor", tipo: "text", placeholder: "Ej. 2.0L, V6, 1.6 Turbo" },
      { id: "placas", etiqueta: "Placas", tipo: "text" },
      { id: "colorVehiculo", etiqueta: "Color", tipo: "text" },
      { id: "kilometraje", etiqueta: "KMS / Millas", tipo: "number", placeholder: "Ej. 125000" },
      {
        id: "nivelCombustible",
        etiqueta: "Nivel de combustible",
        tipo: "select",
        opciones: ["Vacio", "1/4", "1/2", "3/4", "Lleno"],
        valorInicial: "1/4",
      },
      {
        id: "enciendeVehiculo",
        etiqueta: "Enciende",
        tipo: "select",
        opciones: ["Si", "No"],
        valorInicial: "Si",
      },
      {
        id: "transmision",
        etiqueta: "Transmision",
        tipo: "select",
        opciones: ["Manual", "Automatica", "CVT"],
        valorInicial: "Manual",
      },
      { id: "tapetes", etiqueta: "Tapetes", tipo: "checkbox" },
      { id: "espejos", etiqueta: "Espejos", tipo: "checkbox" },
      { id: "radioCaratula", etiqueta: "Radio / caratula", tipo: "checkbox" },
      { id: "encendedor", etiqueta: "Encendedor", tipo: "checkbox" },
      { id: "bateriaRadiador", etiqueta: "Bateria / radiador", tipo: "checkbox" },
      { id: "retrovisor", etiqueta: "Retrovisor", tipo: "checkbox" },
      { id: "checkEngine", etiqueta: "Check engine", tipo: "checkbox" },
      { id: "objetosValor", etiqueta: "Objetos de valor", tipo: "checkbox" },
      { id: "gato", etiqueta: "Gato", tipo: "checkbox" },
      { id: "herramientas", etiqueta: "Herramientas", tipo: "checkbox" },
      { id: "llantas", etiqueta: "Llantas", tipo: "checkbox" },
      { id: "antenas", etiqueta: "Antenas", tipo: "checkbox" },
      { id: "tapones", etiqueta: "Tapones", tipo: "checkbox" },
      {
        id: "accesoriosVehiculo",
        etiqueta: "Objetos o accesorios dentro del vehiculo",
        tipo: "textarea",
        anchoCompleto: true,
      },
      {
        id: "detalleFisicoVehiculo",
        etiqueta: "Condiciones fisicas / danos visibles",
        tipo: "textarea",
        anchoCompleto: true,
      },
      {
        id: "comentariosRecepcion",
        etiqueta: "Comentarios de recepcion",
        tipo: "textarea",
        anchoCompleto: true,
      },
    ],
  }),
];

export function getTiposNegocioPreset() {
  return cloneData(TIPOS_NEGOCIO_PRESET);
}

export function findTipoNegocioPreset(id) {
  return getTiposNegocioPreset().find((item) => item.id === id) || null;
}

export function normalizeTiposNegocio(raw) {
  const source = Array.isArray(raw) && raw.length ? raw : getTiposNegocioPreset();
  const usedIds = new Set();

  return source.map((item, index) => {
    const tipo = normalizeTipoNegocio(item, index);
    return {
      ...tipo,
      id: makeUniqueId(tipo.id || tipo.nombre, usedIds, "tipo-negocio"),
    };
  });
}

export function getTipoNegocioById(source, tipoId) {
  const tipos = Array.isArray(source) ? normalizeTiposNegocio(source) : normalizeTiposNegocio(source?.tiposNegocio);
  const normalizedId = toText(tipoId);
  return tipos.find((item) => item.id === normalizedId) || tipos[0] || null;
}

export function getTipoNegocioActivo(config = {}) {
  const tipos = normalizeTiposNegocio(config?.tiposNegocio);
  const tipoId = toText(config?.tipoNegocioId);
  return getTipoNegocioById(tipos, tipoId);
}

export function tipoNegocioTieneServicios(tipoNegocio) {
  return normalizeTipoNegocio(tipoNegocio).serviciosHabilitados !== false;
}

export function empresaTieneServicios(config = {}) {
  return tipoNegocioTieneServicios(getTipoNegocioActivo(config));
}

export function getEtiquetaOpcionTipo(tipoNegocio, value) {
  const tipo = normalizeTipoNegocio(tipoNegocio);
  const normalizedValue = toText(value);
  const option = tipo.opcionesTipoDispositivo.find((item) => item.value === normalizedValue);
  return option?.label || normalizedValue || "-";
}

export function getCamposVisiblesTipoNegocio(tipoNegocio, tipoDispositivo = "") {
  const tipo = normalizeTipoNegocio(tipoNegocio);
  const normalizedDevice = toText(tipoDispositivo);
  return tipo.campos.filter(
    (campo) => !campo.aplicaA.length || campo.aplicaA.includes(normalizedDevice),
  );
}

export function normalizeValorCampo(campo, value) {
  const normalizedField = normalizeCampoHoja(campo);

  if (normalizedField.tipo === "checkbox") {
    return toBool(value, normalizedField.valorInicial || false);
  }

  if (normalizedField.tipo === "select") {
    return normalizeSelectValue(
      normalizedField.opciones,
      value,
      normalizedField.valorInicial || normalizedField.opciones[0] || "",
    );
  }

  if (value === null || value === undefined || value === "") {
    return normalizedField.valorInicial || "";
  }

  return toText(value);
}

function getLegacyCampoValue(servicio, campoId) {
  const readers = {
    procesador: (item) => item?.laptopPc?.procesador,
    ram: (item) => item?.laptopPc?.ram,
    disco: (item) => item?.laptopPc?.disco,
    estadoPantalla: (item) => item?.laptopPc?.estadoPantalla,
    estadoTeclado: (item) => item?.laptopPc?.estadoTeclado,
    estadoMouse: (item) => item?.laptopPc?.estadoMouse,
    funciona: (item) => item?.laptopPc?.funciona,
    enciendeEquipo: (item) => item?.laptopPc?.enciendeEquipo,
    contrasenaEquipo: (item) => item?.laptopPc?.contrasenaEquipo,
    tipoImpresora: (item) => item?.impresora?.tipoImpresora,
    imprime: (item) => item?.impresora?.imprime,
    condicionesImpresora: (item) => item?.impresora?.condicionesImpresora,
    tamanoMonitor: (item) => item?.monitor?.tamanoMonitor,
    colores: (item) => item?.monitor?.colores,
    condicionesMonitor: (item) => item?.monitor?.condicionesMonitor,
  };

  const reader = readers[campoId];
  return typeof reader === "function" ? reader(servicio) : "";
}

export function buildCamposPersonalizados(tipoNegocio, rawValues = {}, servicioBase = null) {
  const tipo = normalizeTipoNegocio(tipoNegocio);
  const source = rawValues && typeof rawValues === "object" ? rawValues : {};

  return tipo.campos.reduce((acc, campo) => {
    const currentValue =
      Object.prototype.hasOwnProperty.call(source, campo.id)
        ? source[campo.id]
        : servicioBase
          ? getLegacyCampoValue(servicioBase, campo.id)
          : undefined;
    acc[campo.id] = normalizeValorCampo(campo, currentValue);
    return acc;
  }, {});
}

export function getValorCampoServicio(servicio, campo) {
  const campoId = typeof campo === "string" ? campo : campo?.id;
  if (!campoId) return "";

  if (Object.prototype.hasOwnProperty.call(servicio?.camposPersonalizados || {}, campoId)) {
    return servicio.camposPersonalizados[campoId];
  }

  return getLegacyCampoValue(servicio, campoId);
}

export function formatCampoServicio(campo, value) {
  const normalizedField = normalizeCampoHoja(campo);
  const normalizedValue = normalizeValorCampo(normalizedField, value);

  if (normalizedField.tipo === "checkbox") {
    return normalizedValue ? "Si" : "No";
  }

  return toText(normalizedValue) || "-";
}

export function buildLegacyBlocksFromCampos(tipoDispositivo, camposPersonalizados = {}) {
  const tipo = normalizeKey(tipoDispositivo);
  const campos = camposPersonalizados || {};

  const legacy = {
    laptopPc: null,
    impresora: null,
    monitor: null,
  };

  if (tipo === "laptop" || tipo === "pc") {
    legacy.laptopPc = {
      procesador: toText(campos.procesador),
      ram: toText(campos.ram),
      disco: toText(campos.disco),
      estadoPantalla: normalizeSelectValue(["Funciona bien", "Con detalles", "Danada / No funciona"], campos.estadoPantalla, "Funciona bien"),
      estadoTeclado: normalizeSelectValue(["Funciona bien", "Algunas teclas no funcionan", "La mayoria no funciona", "No funciona"], campos.estadoTeclado, "Funciona bien"),
      estadoMouse: normalizeSelectValue(["Funciona bien", "A veces falla", "No funciona"], campos.estadoMouse, "Funciona bien"),
      funciona: normalizeSelectValue(["Si", "No"], campos.funciona, "Si"),
      enciendeEquipo: normalizeSelectValue(["Si", "No"], campos.enciendeEquipo, "Si"),
      contrasenaEquipo: toText(campos.contrasenaEquipo),
    };
  }

  if (tipo === "impresora") {
    legacy.impresora = {
      tipoImpresora: normalizeSelectValue(["Inyeccion de tinta", "Laser", "Multifuncional"], campos.tipoImpresora, "Inyeccion de tinta"),
      imprime: normalizeSelectValue(["Si", "No"], campos.imprime, "Si"),
      condicionesImpresora: toText(campos.condicionesImpresora),
    };
  }

  if (tipo === "monitor") {
    legacy.monitor = {
      tamanoMonitor: toText(campos.tamanoMonitor),
      colores: normalizeSelectValue(["Si", "No"], campos.colores, "Si"),
      condicionesMonitor: toText(campos.condicionesMonitor),
    };
  }

  return legacy;
}

export function inferTipoNegocioServicio(servicio, empresaConfig = null) {
  if (servicio?.tipoNegocioSnapshot) {
    return normalizeTipoNegocio(servicio.tipoNegocioSnapshot);
  }

  if (servicio?.tipoNegocioId) {
    const fromConfig = getTipoNegocioById(empresaConfig || {}, servicio.tipoNegocioId);
    if (fromConfig) return fromConfig;
  }

  const tipoDispositivo = normalizeKey(servicio?.tipoDispositivo);
  if (
    servicio?.laptopPc ||
    servicio?.impresora ||
    servicio?.monitor ||
    ["laptop", "pc", "impresora", "monitor"].includes(tipoDispositivo)
  ) {
    return findTipoNegocioPreset("soporte-computo") || getTipoNegocioActivo(empresaConfig || {});
  }

  if (
    ["auto", "moto", "camioneta"].includes(tipoDispositivo) ||
    servicio?.camposPersonalizados?.placas ||
    servicio?.camposPersonalizados?.kilometraje ||
    servicio?.camposPersonalizados?.numeroEconomico
  ) {
    return findTipoNegocioPreset("automotriz") || getTipoNegocioActivo(empresaConfig || {});
  }

  return getTipoNegocioActivo(empresaConfig || {});
}
