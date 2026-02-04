export const STATUS = [
  { value: "pendiente", label: "Pendiente", color: "#f59e0b" },
  { value: "revision", label: "En revisión", color: "#3b82f6" },
  { value: "reparacion", label: "En reparación", color: "#f97316" },
  { value: "espera_refaccion", label: "En espera de refacción", color: "#a855f7" },
  { value: "listo", label: "Listo", color: "#22c55e" },
  { value: "entregado", label: "Entregado", color: "#16a34a" },
  { value: "cancelado", label: "Cancelado", color: "#ef4444" },
  { value: "no_reparable", label: "No reparable", color: "#6b7280" },
];


export function statusInfo(value) {
  return STATUS.find(s => s.value === value) || { label: value, color: "#6b7280" };
}


export const STATUS2 = [
  { key: "pendiente",   label: "Pendiente",   step: 1, color: "#9ca3af" }, // gris
  { key: "trabajando",  label: "Trabajando",  step: 2, color: "#2563eb" }, // azul
  { key: "finalizado",  label: "Finalizado",  step: 3, color: "#22c55e" }, // verde
  { key: "entregado",   label: "Entregado",   step: 4, color: "#22c55e" }, // verde
];

export const statusInfo2 = (key) =>
  STATUS2.find((s) => s.key === key) || STATUS2[0];
