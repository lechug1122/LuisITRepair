// Catalogo central de permisos para UI y rutas.
export const PERMISOS_CATALOGO = [
  {
    key: "restaurante.mesero",
    label: "Acceso a Mesas (Mesero)",
    description: "Permite tomar pedidos, administrar mesas y consultar cuentas del mesero.",
    restaurantOnly: true,
  },
  {
    key: "restaurante.cocina",
    label: "Acceso a Cocina",
    description: "Permite ver comandas y marcar platillos en preparación o listos.",
    restaurantOnly: true,
  },
  {
    key: "restaurante.caja",
    label: "Acceso a Caja",
    description: "Permite crear cuentas, cobrar y consultar el historial del restaurante.",
    restaurantOnly: true,
  },
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
    key: "promociones.gestionar",
    label: "Gestionar promociones",
    description: "Permite crear, editar, activar y eliminar promociones.",
  },
  {
    key: "descuentos.gestionar",
    label: "Gestionar descuentos",
    description: "Permite crear, editar, activar y eliminar reglas de descuento.",
  },
  {
    key: "productos.ver",
    label: "Ver inventario",
    description: "Permite abrir y gestionar el inventario.",
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
  Vendedor: {
    "servicios.crear": false,
    "servicios.ver": false,
    "clientes.ver": true,
    "ventas.pos": true,
    "productos.ver": true,
    "reportes.ver": true,
    "configuracion.ver": false,
    "empleados.gestionar": false,
  },
  Mesero: {
    "restaurante.mesero": true, "clientes.ver": true, "productos.ver": true,
  },
  Cocina: {
    "restaurante.cocina": true, "productos.ver": true,
  },
  Caja: {
    "restaurante.caja": true, "clientes.ver": true, "ventas.pos": true, "productos.ver": true, "reportes.ver": true,
  },
};

function bool(v) {
  return v === true;
}

function normalizarTextoRol(raw = "") {
  return String(raw || "")
    .replace(/Ã¡|á|à|ä|â/gi, "a")
    .replace(/Ã©|é|è|ë|ê/gi, "e")
    .replace(/Ã­|í|ì|ï|î/gi, "i")
    .replace(/Ã³|ó|ò|ö|ô/gi, "o")
    .replace(/Ãº|ú|ù|ü|û/gi, "u")
    .replace(/Ã±|ñ/gi, "n")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarRol(raw = "") {
  const key = normalizarTextoRol(raw);

  if (key.includes("admin")) return "Administrador";
  if (key.includes("tecn")) return "Tecnico";
  if (key.includes("cajer")) return "Cajero";
  if (key.includes("vend")) return "Vendedor";
  if (key.includes("meser")) return "Mesero";
  if (key.includes("cocin") || key.includes("chef")) return "Cocina";
  if (key === "caja") return "Caja";
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
