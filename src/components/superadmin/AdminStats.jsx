/**
 * Resumen general del panel.
 *
 * Todas las cifras describen la adopcion de CajaLibre (cuentas, planes, uso).
 * Ninguna proviene de la operacion comercial de los negocios: aqui no entran
 * ventas, ingresos ni ticket promedio.
 */
export default function AdminStats({ resumen, cargando = false }) {
  const tarjetas = [
    { key: "negocios", label: "Negocios", tono: "" },
    { key: "free", label: "Free", tono: "free" },
    { key: "premium", label: "Premium", tono: "premium" },
    { key: "usuarios", label: "Usuarios", tono: "" },
    { key: "activos7", label: "Activos 7 días", tono: "ok" },
    { key: "inactivos30", label: "Inactivos +30 días", tono: "warn" },
    { key: "bloqueados", label: "Bloqueados", tono: "danger" },
    { key: "incompletos", label: "Config. incompleta", tono: "warn" },
  ];

  return (
    <div className="sa-stats">
      {tarjetas.map((tarjeta) => (
        <article
          key={tarjeta.key}
          className={`sa-stat ${tarjeta.tono} ${cargando ? "sa-stat-skeleton" : ""}`.trim()}
        >
          <span>{tarjeta.label}</span>
          <strong>{cargando ? "" : (resumen?.[tarjeta.key] ?? 0).toLocaleString("es-MX")}</strong>
        </article>
      ))}
    </div>
  );
}
