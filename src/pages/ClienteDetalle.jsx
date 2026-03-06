import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../css/clientes.css";

import {
  actualizarCliente,
  obtenerClientePorId,
} from "../js/services/clientes_firestore";
import { listarServiciosPorClienteId } from "../js/services/servicios_firestore";

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

export default function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError("");
        const c = await obtenerClientePorId(id);
        const s = await listarServiciosPorClienteId(id);

        if (!alive) return;
        setCliente(c);
        setServicios(Array.isArray(s) ? s : []);
        setNotasInternas(String(c?.notasInternas || ""));
      } catch (e) {
        console.error("Error cargando detalle del cliente:", e);
        if (!alive) return;
        setCliente(null);
        setServicios([]);
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

  if (loading) return <div className="clientes-page">Cargando...</div>;
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

                  <div className="badge-puntos">
                    {cliente.puntos || 0} puntos acumulados
                  </div>
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
