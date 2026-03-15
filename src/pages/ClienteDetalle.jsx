import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../css/clientes.css";
import PageLoader from "../components/PageLoader";
import useServiciosConfig from "../hooks/useServiciosConfig";

import {
  actualizarCliente,
  obtenerClientePorId,
} from "../js/services/clientes_firestore";
import { obtenerProductos } from "../js/services/POS_firebase";
import { listarServiciosPorClienteId } from "../js/services/servicios_firestore";

const METAS_PUNTOS = [
  { puntos: 100, nivel: "Bronce", premio: "Accesorio rapido o descuento base" },
  { puntos: 250, nivel: "Plata", premio: "Canjes medianos y prioridad de promo" },
  { puntos: 500, nivel: "Oro", premio: "Canjes premium y beneficios frecuentes" },
  { puntos: 1000, nivel: "Elite", premio: "Beneficios completos del programa" },
];

function fmtFecha(ts) {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleDateString("es-MX");
}

function toDate(ts) {
  if (!ts?.seconds) return null;
  return new Date(ts.seconds * 1000);
}

function phoneToWhatsapp(raw) {
  const cleaned = String(raw || "").replace(/\D/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("52") ? cleaned : `52${cleaned}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function normalizarProductoCanje(producto, puntosForzados = null) {
  const precio = Number(producto?.precioVenta ?? producto?.precio ?? 0);
  const puntosBase = Number(puntosForzados ?? producto?.puntosCanje ?? 0);
  const puntosRequeridos = puntosBase > 0
    ? Math.round(puntosBase)
    : Math.max(100, Math.ceil(precio / 10) * 10);

  return {
    id: producto?.id,
    nombre:
      producto?.nombre ||
      producto?.nombreProducto ||
      producto?.codigo ||
      "Producto sin nombre",
    categoria: producto?.categoria || "General",
    stock: Number(producto?.stock || 0),
    precio,
    puntosRequeridos,
  };
}

export default function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { catalogoCanjes, habilitarCanjes } = useServiciosConfig();
  const mostrarProgramaCanjes = !habilitarCanjes;
  const goToServicio = (folioRaw) => {
    const folioSafe = encodeURIComponent(String(folioRaw || "").trim());
    navigate(`/servicios/${folioSafe}`);
  };

  const [cliente, setCliente] = useState(null);
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pendientes");
  const [notasInternas, setNotasInternas] = useState("");
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  const [productos, setProductos] = useState([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError("");
        const [c, s, inventario] = await Promise.all([
          obtenerClientePorId(id),
          listarServiciosPorClienteId(id),
          obtenerProductos(),
        ]);

        if (!alive) return;
        setCliente(c);
        setServicios(Array.isArray(s) ? s : []);
        setProductos(Array.isArray(inventario) ? inventario : []);
        setNotasInternas(String(c?.notasInternas || ""));
      } catch (e) {
        console.error("Error cargando detalle del cliente:", e);
        if (!alive) return;
        setCliente(null);
        setServicios([]);
        setProductos([]);
        setError("No se pudo cargar la informacion del cliente.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const pendientes = useMemo(
    () =>
      servicios.filter((x) => (x.status || "").toLowerCase() !== "entregado"),
    [servicios],
  );

  const historial = useMemo(
    () =>
      servicios.filter((x) => (x.status || "").toLowerCase() === "entregado"),
    [servicios],
  );

  const totalGastado = useMemo(
    () => servicios.reduce((acc, s) => acc + Number(s.total || 0), 0),
    [servicios],
  );

  const clienteFrecuente = servicios.length >= 5;
  const puntosCliente = Number(cliente?.puntos || 0);

  // Ultimo servicio ya entregado para mostrar resumen de valor.
  const ultimoServicio = useMemo(() => {
    if (!historial.length) return null;
    return historial[0];
  }, [historial]);

  // Mini grafica: actividad de servicios de los ultimos 6 meses.
  const actividadMensual = useMemo(() => {
    const now = new Date();
    const months = [];

    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-MX", { month: "short" });
      months.push({ key, label, total: 0 });
    }

    const map = new Map(months.map((m) => [m.key, m]));

    servicios.forEach((s) => {
      const d = toDate(s.createdAt);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = map.get(key);
      if (row) row.total += 1;
    });

    const items = months.map((m) => map.get(m.key) || m);
    const max = Math.max(...items.map((m) => m.total), 1);
    return { items, max };
  }, [servicios]);

  const whatsappUrl = useMemo(() => {
    const phone = phoneToWhatsapp(cliente?.telefono);
    if (!phone) return "";
    const text = encodeURIComponent(
      `Hola ${cliente?.nombre || ""}, te compartimos el seguimiento de tus servicios.`,
    );
    return `https://wa.me/${phone}?text=${text}`;
  }, [cliente?.telefono, cliente?.nombre]);

  const correoUrl = useMemo(() => {
    const email = String(cliente?.email || "").trim();
    const subject = encodeURIComponent("Seguimiento de servicio");
    const body = encodeURIComponent(
      `Hola ${cliente?.nombre || ""}, te escribimos para dar seguimiento a tu servicio.`,
    );
    return `mailto:${email}?subject=${subject}&body=${body}`;
  }, [cliente?.email, cliente?.nombre]);

  const metasPuntos = useMemo(
    () =>
      METAS_PUNTOS.map((meta) => {
        const faltan = Math.max(meta.puntos - puntosCliente, 0);
        return {
          ...meta,
          alcanzada: faltan === 0,
          faltan,
          progreso: Math.min((puntosCliente / meta.puntos) * 100, 100),
        };
      }),
    [puntosCliente],
  );

  const siguienteMeta = useMemo(
    () => metasPuntos.find((meta) => !meta.alcanzada) || metasPuntos[metasPuntos.length - 1],
    [metasPuntos],
  );

  const metasStepper = useMemo(() => {
    const indiceActivo = metasPuntos.findIndex((meta) => !meta.alcanzada);

    return metasPuntos.map((meta, index) => {
      let estado = "pending";

      if (meta.alcanzada) {
        estado = "completed";
      } else if (index === indiceActivo) {
        estado = "active";
      }

      return {
        ...meta,
        estado,
        titulo: `${meta.nivel} - ${meta.puntos} pts`,
        estadoTexto:
          estado === "completed"
            ? "Meta alcanzada"
            : estado === "active"
              ? "Meta actual"
              : "Pendiente",
        detalle:
          estado === "completed"
            ? `Premio listo: ${meta.premio}`
            : estado === "active"
              ? `Le faltan ${meta.faltan} puntos para desbloquear ${meta.premio}`
              : `Canje futuro: ${meta.premio}`,
      };
    });
  }, [metasPuntos]);

  const productosCanjeables = useMemo(
    () => {
      const productosMap = new Map(productos.map((producto) => [producto.id, producto]));

      if (Array.isArray(catalogoCanjes) && catalogoCanjes.length > 0) {
        return catalogoCanjes
          .filter((item) => item?.activo !== false && item?.productId)
          .map((item) => {
            const producto = productosMap.get(item.productId);
            if (!producto) return null;
            return normalizarProductoCanje(
              {
                ...producto,
                nombre: item?.nombreProducto || producto?.nombre,
              },
              item?.puntos,
            );
          })
          .filter((producto) => producto && producto.stock > 0)
          .sort((a, b) => a.puntosRequeridos - b.puntosRequeridos || a.precio - b.precio)
          .slice(0, 6);
      }

      return productos
        .map((producto) => normalizarProductoCanje(producto))
        .filter((producto) => producto.stock > 0)
        .sort((a, b) => a.puntosRequeridos - b.puntosRequeridos || a.precio - b.precio)
        .slice(0, 6);
    },
    [catalogoCanjes, productos],
  );

  const canjesDisponibles = useMemo(
    () => productosCanjeables.filter((producto) => puntosCliente >= producto.puntosRequeridos),
    [productosCanjeables, puntosCliente],
  );

  const handleGuardarNotas = async () => {
    if (!cliente || guardandoNotas) return;
    try {
      setGuardandoNotas(true);
      await actualizarCliente(cliente.id, { notasInternas });
      setCliente((prev) => (prev ? { ...prev, notasInternas } : prev));
    } finally {
      setGuardandoNotas(false);
    }
  };

  const handleGenerarReporte = () => {
    const lines = [
      `Cliente: ${cliente?.nombre || "-"}`,
      `Telefono: ${cliente?.telefono || "-"}`,
      `Direccion: ${cliente?.direccion || "-"}`,
      `Alta: ${fmtFecha(cliente?.createdAt)}`,
      `Total servicios: ${servicios.length}`,
      `Servicios pendientes: ${pendientes.length}`,
      `Total gastado: $${totalGastado.toFixed(2)}`,
      "",
      "Ultimo servicio entregado:",
      `Folio: ${ultimoServicio?.folio || "-"}`,
      `Fecha: ${fmtFecha(ultimoServicio?.createdAt)}`,
      `Equipo: ${ultimoServicio?.tipoDispositivo || "-"} ${ultimoServicio?.marca || ""} ${ultimoServicio?.modelo || ""}`.trim(),
      "",
      "Notas internas:",
      notasInternas || "-",
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `reporte_cliente_${cliente?.id || "sin_id"}.txt`;
    a.click();
    URL.revokeObjectURL(href);
  };

  if (loading) return <PageLoader text="Cargando cliente..." />;
  if (error) return <div className="clientes-page">{error}</div>;
  if (!cliente) {
    return <div className="clientes-page">Cliente no encontrado</div>;
  }

  const serviciosTab = tab === "pendientes" ? pendientes : historial;

  return (
    <div className="clientes-page">
      <div className="clientes-container">
        <div className="clientes-hero">
          <div className="clientes-hero-top">
            <div className="hero-content">
              <div className="cliente-avatar big">
                {cliente.nombre?.charAt(0)?.toUpperCase() || "?"}
              </div>

              <div className="hero-text">
                <h1>{cliente.nombre}</h1>
                <p>Telefono: {cliente.telefono || "Sin telefono"}</p>
                <p>Direccion: {cliente.direccion || "Sin direccion"}</p>
                <p>Cliente desde: {fmtFecha(cliente.createdAt)}</p>

                <div className="cliente-badges">
                  {clienteFrecuente && (
                    <div className="badge-vip">Cliente frecuente</div>
                  )}

                  {mostrarProgramaCanjes && (
                    <div className="badge-puntos">
                      {puntosCliente} puntos acumulados
                    </div>
                  )}
                </div>

                <div className="hero-metricas">
                  <div>
                    <span>Total servicios</span>
                    <b>{servicios.length}</b>
                  </div>
                  <div>
                    <span>Pendientes</span>
                    <b>{pendientes.length}</b>
                  </div>
                  <div>
                    <span>Total gastado</span>
                    <b>${totalGastado.toFixed(2)}</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="hero-actions">
              <button className="btn-light" onClick={() => navigate(-1)}>
                Volver
              </button>

              <button
                className="btn-primary"
                onClick={() =>
                  navigate("/hoja_servicio", {
                    state: {
                      prefillCliente: {
                        id: cliente.id,
                        nombre: cliente.nombre || "",
                        telefono: cliente.telefono || "",
                        direccion: cliente.direccion || "",
                        numeroSeriePreferido: cliente.numeroSeriePreferido || "",
                        omitirNumeroSerie: !!cliente.omitirNumeroSerie,
                      },
                    },
                  })
                }
              >
                + Nuevo servicio
              </button>
            </div>
          </div>
        </div>

        {mostrarProgramaCanjes && (
          <>
            {/* Este bloque solo aparece cuando la vista de canjes esta habilitada para clientes. */}
            <section className="puntos-board">
              <div className="puntos-board-copy">
                <span className="puntos-board-chip">Programa de fidelidad</span>
                <h2>Puntos, metas y canjes del cliente</h2>
                <p>
                  El saldo actual define las metas alcanzadas y los productos que ya puede
                  canjear sin esperar otra visita.
                </p>

                <div className="puntos-board-stats">
                  <div className="puntos-board-stat">
                    <span>Saldo actual</span>
                    <strong>{puntosCliente} pts</strong>
                  </div>

                  <div className="puntos-board-stat">
                    <span>Siguiente meta</span>
                    <strong>{siguienteMeta?.puntos || 0} pts</strong>
                    <small>
                      {siguienteMeta?.faltan > 0
                        ? `Faltan ${siguienteMeta.faltan} puntos`
                        : "Ya alcanzo la meta mas alta"}
                    </small>
                  </div>

                  <div className="puntos-board-stat">
                    <span>Canjes listos</span>
                    <strong>{canjesDisponibles.length}</strong>
                    <small>
                      {canjesDisponibles.length
                        ? "Productos que ya puede reclamar"
                        : "Aun no llega a un canje disponible"}
                    </small>
                  </div>
                </div>
              </div>

              <div className="stepper-box">
                {metasStepper.map((meta, index) => (
                  <div
                    key={meta.puntos}
                    className={`stepper-step stepper-${meta.estado}`}
                  >
                    <div className="stepper-circle">
                      {meta.estado === "completed" ? (
                        <svg
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          height="16"
                          width="16"
                          aria-hidden="true"
                        >
                          <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div className="stepper-line"></div>
                    <div className="stepper-content">
                      <div className="stepper-title">{meta.titulo}</div>
                      <div className="stepper-status">{meta.estadoTexto}</div>
                      <div className="stepper-time">{meta.detalle}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="canje-section">
              <div className="canje-section-head">
                <div>
                  <p className="detalle-title">Productos para canjear con puntos</p>
                  <h3>Canjes sugeridos para este cliente</h3>
                </div>
                <div className="canje-section-head-actions">
                  <button
                    type="button"
                    className="btn-light"
                    onClick={() => navigate("/configuracion/servicios#canjes")}
                  >
                    Configurar canjes
                  </button>
                  <div className="canje-head-badge">
                    {canjesDisponibles.length} disponibles ahora
                  </div>
                </div>
              </div>

              <div className="canje-grid">
                {productosCanjeables.map((producto) => {
                  const desbloqueado = puntosCliente >= producto.puntosRequeridos;

                  return (
                    <article
                      key={producto.id}
                      className={`canje-card ${desbloqueado ? "is-available" : ""}`}
                    >
                      <div className="canje-card-top">
                        <span className="canje-category">{producto.categoria}</span>
                        <span className={`canje-status ${desbloqueado ? "ready" : "locked"}`}>
                          {desbloqueado ? "Canjeable" : `Faltan ${producto.puntosRequeridos - puntosCliente}`}
                        </span>
                      </div>

                      <h4>{producto.nombre}</h4>
                      <p>Valor comercial {formatMoney(producto.precio)}</p>

                      <div className="canje-card-meta">
                        <strong>{producto.puntosRequeridos} pts</strong>
                        <span>Stock {producto.stock}</span>
                      </div>
                    </article>
                  );
                })}

                {productosCanjeables.length === 0 && (
                  <article className="canje-card canje-card-empty">
                    <h4>Sin productos para canje</h4>
                    <p>Cuando haya productos con stock en inventario apareceran aqui.</p>
                  </article>
                )}
              </div>
            </section>
          </>
        )}

        <section className="detalle-grid">
          <article className="detalle-card">
            <p className="detalle-title">Ultimo servicio realizado</p>
            {ultimoServicio ? (
              <>
                <div className="detalle-main">
                  Folio #{ultimoServicio.folio || "-"} -{" "}
                  {fmtFecha(ultimoServicio.createdAt)}
                </div>
                <p className="detalle-muted">
                  {ultimoServicio.tipoDispositivo || "Equipo"} -{" "}
                  {ultimoServicio.marca || "-"} {ultimoServicio.modelo || "-"}
                </p>
              </>
            ) : (
              <p className="detalle-muted">Sin servicios entregados.</p>
            )}
          </article>

          <article className="detalle-card">
            <p className="detalle-title">Actividad (servicios por mes)</p>
            <div className="mini-chart">
              {actividadMensual.items.map((item) => (
                <div key={item.key} className="mini-bar-col">
                  <div
                    className="mini-bar"
                    style={{
                      height: `${Math.max((item.total / actividadMensual.max) * 44, item.total ? 8 : 2)}px`,
                    }}
                    title={`${item.label}: ${item.total}`}
                  />
                  <span>{item.label.replace(".", "")}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="detalle-card">
            <p className="detalle-title">Acciones rapidas</p>
            <div className="quick-actions">
              <a
                className={`quick-action ${!whatsappUrl ? "disabled" : ""}`}
                href={whatsappUrl || undefined}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => !whatsappUrl && e.preventDefault()}
              >
                WhatsApp directo
              </a>

              <a
                className={`quick-action ${!cliente?.email ? "disabled" : ""}`}
                href={correoUrl}
                onClick={(e) => !cliente?.email && e.preventDefault()}
              >
                Enviar mensaje
              </a>

              <button className="quick-action btn-quick" onClick={handleGenerarReporte}>
                Generar reporte del cliente
              </button>
            </div>
          </article>

          <article className="detalle-card detalle-card-notas">
            <div className="detalle-notas-head">
              <p className="detalle-title">Notas internas</p>
              <button
                className="btn-light"
                onClick={handleGuardarNotas}
                disabled={guardandoNotas}
              >
                {guardandoNotas ? "Guardando..." : "Guardar notas"}
              </button>
            </div>
            <textarea
              className="detalle-notas-input"
              value={notasInternas}
              onChange={(e) => setNotasInternas(e.target.value)}
              placeholder="Ejemplo: acceso por puerta trasera, horario preferente, observaciones del tecnico."
            />
          </article>
        </section>

        <div className="tabs">
          <button
            className={tab === "pendientes" ? "tab active" : "tab"}
            onClick={() => setTab("pendientes")}
          >
            Pendientes
          </button>

          <button
            className={tab === "historial" ? "tab active" : "tab"}
            onClick={() => setTab("historial")}
          >
            Historial
          </button>
        </div>

        {serviciosTab.length === 0 && (
          <p className="clientes-msg">No hay servicios en esta vista.</p>
        )}

        {serviciosTab.map((s) => (
          <div
            key={s.id}
            className="servicio-card-modern"
            onClick={() => goToServicio(s.folio)}
          >
            <div className="servicio-left">
              <div className="servicio-folio">Folio #{s.folio}</div>

              <div className="servicio-device">
                {s.tipoDispositivo} - {s.marca} {s.modelo}
              </div>

              <div className="servicio-date">{fmtFecha(s.createdAt)}</div>
            </div>

            <div className={`servicio-status ${s.status?.toLowerCase()}`}>
              {s.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
