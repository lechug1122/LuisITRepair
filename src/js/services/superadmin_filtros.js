// Catalogo de filtros del panel de superadmin.
//
// Vive fuera de los componentes para no romper el fast refresh de Vite (un
// archivo de componentes solo debe exportar componentes).

// Filtros que Firestore resuelve en el servidor. Se aplica una sola
// restriccion a la vez para no exigir indices compuestos.
export const FILTROS_SERVIDOR = [
  { id: "todos", label: "Todos" },
  { id: "premium", label: "Premium" },
  { id: "bloqueados", label: "Bloqueados" },
  { id: "incompletos", label: "Config. incompleta" },
];

// Filtros que se aplican sobre la pagina ya cargada: dependen de valores
// calculados en el cliente (nivel de actividad, plan efectivo) y no existen
// como campo indexable en Firestore.
export const FILTROS_PAGINA = [
  { id: "free", label: "Free" },
  { id: "frecuente", label: "Activos" },
  { id: "poco", label: "Poco activos" },
  { id: "inactivo", label: "Inactivos" },
];
