export const ESTADOS = [
  // 0
  { key: "pendiente", label: "Pendiente", step: 0, color: "#f59e0b" },

  // 1
  { key: "revision", label: "En revisión", step: 1, color: "#3b82f6" },

  // 2
  { key: "diagnostico", label: "Diagnóstico", step: 2, color: "#2563eb" },

  // 3
  { key: "cotizacion", label: "Cotización", step: 3, color: "#0ea5e9" },

  // 4
  { key: "espera_refaccion", label: "Esperando refacción", step: 4, color: "#a855f7" },

  // 5
  { key: "reparacion", label: "En reparación", step: 5, color: "#8b5cf6" },

  // 6
  { key: "pruebas", label: "En pruebas", step: 6, color: "#14b8a6" },

  // 7
  { key: "listo", label: "Listo para entregar", step: 7, color: "#22c55e" },

  // 8
  { key: "finalizado", label: "Finalizado", step: 8, color: "#16a34a" },

  // 9
  { key: "entregado", label: "Entregado", step: 9, color: "#15803d" },

  // extra (no es parte del avance normal)
  { key: "cancelado", label: "Cancelado", step: 99, color: "#ef4444" },
];

// Normaliza texto a key
export function normalizarEstado(raw) {
  const s = (raw || "").toLowerCase().trim();

  // cancelado
  if (s.includes("cancel")) return "cancelado";

  // entregado
  if (s.includes("entreg")) return "entregado";

  // finalizado / terminado
  if (s.includes("finaliz") || s.includes("terminad") || s.includes("complet")) return "finalizado";

  // listo
  if (s.includes("listo") || s.includes("list")) return "listo";

  // pruebas
  if (s.includes("prueb") || s.includes("test")) return "pruebas";

  // reparación / arreglando
  if (s.includes("repara") || s.includes("arregl") || s.includes("fix")) return "reparacion";

  // esperando refacción / refacciones / piezas
  if (s.includes("refacc") || s.includes("pieza") || s.includes("espera")) return "espera_refaccion";

  // cotización / presupuesto / precio
  if (s.includes("cotiz") || s.includes("presup") || s.includes("precio")) return "cotizacion";

  // diagnóstico
  if (s.includes("diagn")) return "diagnostico";

  // revisión / revisando
  if (s.includes("revisi") || s.includes("revisando")) return "revision";

  // pendiente
  if (s.includes("pend")) return "pendiente";

  return "pendiente";
}

export function getEstadoInfo(raw) {
  const key = normalizarEstado(raw);
  return ESTADOS.find((e) => e.key === key) || ESTADOS[0];
}

// Útil para tu select (ya viene ordenado por step)
export function getEstadosOrdenados() {
  return [...ESTADOS].sort((a, b) => a.step - b.step);
}
