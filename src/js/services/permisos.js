// Catalogo central de permisos para UI y rutas.
export const PERMISOS_CATALOGO = [
  {
    key: "servicios.crear",
    label: "Dar de alta servicios",
    description: "Permite abrir y usar la pantalla de hoja de servicio.",
  },
  {
    key: "servicios.ver",
    label: "Ver servicios",
    description: "Permite acceder al listado y detalle de servicios.",
  },
  {
    key: "clientes.ver",
    label: "Ver clientes",
    description: "Permite entrar a clientes y su detalle.",
  },
  {
    key: "ventas.pos",
    label: "Usar POS",
    description: "Permite entrar a Punto de Venta y cobrar.",
  },
  {
    key: "productos.ver",
    label: "Ver productos",
    description: "Permite abrir y gestionar productos.",
  },
  {
    key: "reportes.ver",
    label: "Ver reportes",
    description: "Permite acceder al apartado de reportes.",
  },
  {
    key: "configuracion.ver",
    label: "Entrar a configuracion",
    description: "Permite entrar al modulo de configuracion.",
  },
  {
    key: "empleados.gestionar",
    label: "Gestionar empleados",
    description: "Permite crear, editar y eliminar empleados.",
  },
];

const ROL_BASE = {
  Administrador: PERMISOS_CATALOGO.reduce((acc, p) => {
    acc[p.key] = true;
    return acc;
  }, {}),
  Tecnico: {
    "servicios.crear": true,
    "servicios.ver": true,
    "clientes.ver": true,
    "ventas.pos": false,
    "productos.ver": false,
    "reportes.ver": false,
    "configuracion.ver": false,
    "empleados.gestionar": false,
  },
  "Técnico": {
    "servicios.crear": true,
    "servicios.ver": true,
    "clientes.ver": true,
    "ventas.pos": false,
    "productos.ver": false,
    "reportes.ver": false,
    "configuracion.ver": false,
    "empleados.gestionar": false,
  },
  Cajero: {
    "servicios.crear": false,
    "servicios.ver": false,
    "clientes.ver": true,
    "ventas.pos": true,
    "productos.ver": true,
    "reportes.ver": true,
    "configuracion.ver": false,
    "empleados.gestionar": false,
  },
};

function bool(v) {
  return v === true;
}

function normalizarRol(raw = "") {
  const key = String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (key === "administrador") return "Administrador";
  if (key === "tecnico") return "Tecnico";
  if (key === "cajero") return "Cajero";
  return "";
}

export function permisosBasePorRol(rol = "") {
  const base = ROL_BASE[normalizarRol(rol)] || {};
  const result = {};
  PERMISOS_CATALOGO.forEach((p) => {
    result[p.key] = bool(base[p.key]);
  });
  return result;
}

export function normalizarPermisos(rol = "", raw = {}) {
  const base = permisosBasePorRol(rol);
  const result = { ...base };

  PERMISOS_CATALOGO.forEach((p) => {
    if (Object.prototype.hasOwnProperty.call(raw || {}, p.key)) {
      result[p.key] = bool(raw[p.key]);
    }
  });

  return result;
}

export function tienePermiso(rol = "", permisos = {}, key = "") {
  if (normalizarRol(rol) === "Administrador") return true;
  const normalized = normalizarPermisos(rol, permisos);
  return bool(normalized[key]);
}
