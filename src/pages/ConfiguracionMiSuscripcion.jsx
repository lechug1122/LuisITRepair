import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiAward,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiCreditCard,
  FiHeadphones,
  FiHome,
  FiMessageCircle,
  FiRefreshCw,
  FiSlash,
  FiStar,
  FiTool,
  FiUsers,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import PremiumBadge from "../components/PremiumBadge";
import { actualizarConteosNegocio } from "../js/services/negocios";
import {
  crearSuscripcionMercadoPago,
  consultarSuscripcionMercadoPago,
  cancelarSuscripcionMercadoPago,
  obtenerHistorialPagosPremium,
} from "../js/services/premium_payments";
import "../css/mi_plan.css";

const BENEFICIOS = [
  { icon: FiSlash, titulo: "Sin publicidad", texto: "Disfruta de CajaLibre sin anuncios." },
  { icon: FiHeadphones, titulo: "Soporte preferente", texto: "Atención prioritaria cuando la necesites." },
  { icon: FiStar, titulo: "Icono Premium", texto: "Identifica tu negocio como Premium." },
  { icon: FiTool, titulo: "Funciones adicionales", texto: "Herramientas y características exclusivas." },
  { icon: FiUsers, titulo: "Usuarios ilimitados", texto: "Agrega todos los usuarios que necesite tu negocio." },
];

const INCLUIDO_GRATUITO = [
  { activo: true, titulo: "Funciones básicas", texto: "Ventas, inventario y clientes." },
  { activo: true, titulo: "Hasta 3 usuarios", texto: "Ideal para negocios pequeños." },
  { activo: true, titulo: "Soporte estándar", texto: "Ayuda por correo y documentación." },
  { activo: false, titulo: "Con publicidad", texto: "Anuncios dentro del sistema." },
];

const COMPARATIVA = [
  { nombre: "Publicidad en el sistema", gratuito: "Sí", premium: "No" },
  { nombre: "Usuarios", gratuito: "Hasta 3", premium: "Ilimitados" },
  { nombre: "Soporte", gratuito: "Estándar", premium: "Preferente" },
  { nombre: "Funciones adicionales", gratuito: "No", premium: "Sí" },
  { nombre: "Icono Premium", gratuito: "No", premium: "Sí" },
  { nombre: "Logo propio del negocio", gratuito: "No", premium: "Sí" },
  { nombre: "Cobros automáticos", gratuito: "No", premium: "Sí" },
];

const ESTADO_INFO = {
  pending: { aviso: "Activación pendiente.", accion: "Continuar activación" },
  cancelled: { aviso: "Tu periodo Premium terminó.", accion: "Reactivar CajaLibre Premium" },
  paused: { aviso: "Tu periodo Premium terminó.", accion: "Reactivar CajaLibre Premium" },
  review: { aviso: "No pudimos completar la activación.", accion: "Intentar nuevamente" },
};

function estadoInfo(estado) {
  return ESTADO_INFO[estado] || { aviso: "", accion: "Mejorar a Premium" };
}

function formatFecha(valor) {
  if (!valor) return null;
  const fecha = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}

function formatFechaCorta(valor) {
  if (!valor) return "";
  const fecha = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "2-digit" });
}

export default function ConfiguracionMiSuscripcion() {
  const {
    loading,
    uid,
    cuentaPrincipalUid,
    superAdmin,
    suscripcionControlada,
    negocio,
    isPremium,
    renovacionAutomatica,
    premiumUntil,
  } = useAutorizacionActual();

  const [estado, setEstado] = useState("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actualizando, setActualizando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [historial, setHistorial] = useState([]);

  const esAdministradorNegocio =
    superAdmin !== true &&
    String(uid || "").trim() !== "" &&
    String(uid || "").trim() === String(cuentaPrincipalUid || "").trim();

  async function refrescarEstado() {
    const { status } = await consultarSuscripcionMercadoPago();
    setEstado(status);
    return status;
  }

  useEffect(() => {
    if (!esAdministradorNegocio) return;
    refrescarEstado().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdministradorNegocio]);

  useEffect(() => {
    const negocioId = negocio?.negocioId || cuentaPrincipalUid || uid;
    if (!esAdministradorNegocio || !isPremium || !negocioId) return;
    obtenerHistorialPagosPremium(negocioId)
      .then(setHistorial)
      .catch(() => setHistorial([]));
  }, [esAdministradorNegocio, isPremium, negocio?.negocioId, cuentaPrincipalUid, uid]);

  async function activarPremium() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const resultado = await crearSuscripcionMercadoPago();
      if (resultado.alreadyActive) {
        await refrescarEstado();
      } else {
        window.location.assign(resultado.url);
      }
    } catch (err) {
      setError(err.message || "No se pudo conectar con Mercado Pago.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelarPremium() {
    if (cancelando) return;
    const confirmado = window.confirm(
      "Cancelar solo desactiva los cobros autom�ticos. Conservar�s Premium hasta terminar el mes pagado. �Quieres continuar?",
    );
    if (!confirmado) return;
    setCancelando(true);
    setError("");
    try {
      await cancelarSuscripcionMercadoPago();
      await refrescarEstado();
    } catch (err) {
      setError(err.message || "No se pudo cancelar la suscripción.");
    } finally {
      setCancelando(false);
    }
  }

  const refrescarConteos = async () => {
    const negocioId = negocio?.negocioId || cuentaPrincipalUid || uid;
    if (!negocioId) return;
    setActualizando(true);
    try {
      await actualizarConteosNegocio(negocioId);
    } finally {
      setActualizando(false);
    }
  };

  if (loading) {
    return (
      <section className="miplan-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Mi Plan</h2>
          <p>Cargando información de tu negocio...</p>
        </div>
      </section>
    );
  }

  if (!esAdministradorNegocio && suscripcionControlada) {
    return (
      <section className="miplan-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Mi Plan</h2>
          <p>Esta sección solo está disponible para el administrador del negocio.</p>
        </div>
      </section>
    );
  }

  const conteos = negocio?.conteos || {};
  const info = estadoInfo(estado);
  const proximoCobro = formatFecha(negocio?.premiumProximoPago);
  const vigenteHasta = formatFecha(premiumUntil);

  return (
    <section className="miplan-wrap">
      <div className="cfg-header">
        <h1>Mi Plan</h1>
        <p>Administra tu plan de CajaLibre y consulta los beneficios disponibles para tu negocio.</p>
      </div>

      {isPremium ? (
        <>
          <div className="cfg-pos-card miplan-premium-card">
            <div className="miplan-premium-head">
              <div>
                <span className="cfg-sus-model-kicker miplan-kicker-green">Plan actual</span>
                <h2><FiStar aria-hidden="true" /> CajaLibre Premium</h2>
                <p>Tu negocio cuenta con todos los beneficios de CajaLibre Premium.</p>
              </div>
              <PremiumBadge size="lg" />
            </div>

            {!renovacionAutomatica && (
              <p className="miplan-notice miplan-notice-warning">
                ⚠ Renovación cancelada. Tu plan no volverá a cobrarse automáticamente.
                Seguirás disfrutando tus beneficios Premium {vigenteHasta ? `hasta el ${vigenteHasta}` : "hasta que termine tu periodo pagado"}.
              </p>
            )}

            <div className="miplan-premium-body">
              <div className="miplan-premium-main">
                <div className="miplan-price">$300 <span>MXN / mes</span></div>
                {renovacionAutomatica ? (
                  <>
                    <p className="miplan-status-ok"><FiCheckCircle aria-hidden="true" /> Suscripción activa</p>
                    <p className="miplan-renewal-note">Renovación automática mensual.</p>
                  </>
                ) : (
                  <p className="miplan-status-ok"><FiCheckCircle aria-hidden="true" /> Premium activo{vigenteHasta ? ` hasta el ${vigenteHasta}` : ""}</p>
                )}
                <div className="miplan-premium-actions">
                  <Link className="emp-btn emp-btn-soft" to="/configuracion/pago-premium">
                    <FiRefreshCw aria-hidden="true" /> Administrar suscripción
                  </Link>
                  {renovacionAutomatica ? (
                    <button type="button" className="miplan-cancel-btn" onClick={cancelarPremium} disabled={cancelando}>
                      <FiX aria-hidden="true" /> {cancelando ? "Cancelando…" : "Cancelar suscripción"}
                    </button>
                  ) : (
                    <button type="button" className="emp-btn emp-btn-primary" onClick={activarPremium} disabled={busy}>
                      <FiRefreshCw aria-hidden="true" /> {busy ? "Procesando…" : "Reactivar renovación"}
                    </button>
                  )}
                </div>
              </div>

              <div className="miplan-crown-illustration"><FiAward aria-hidden="true" /></div>

              <div className="miplan-billing-panel">
                {renovacionAutomatica && proximoCobro && (
                  <div className="miplan-billing-item">
                    <FiCalendar aria-hidden="true" />
                    <div><span>Próximo cobro</span><strong>{proximoCobro}</strong></div>
                  </div>
                )}
                {!renovacionAutomatica && vigenteHasta && (
                  <div className="miplan-billing-item">
                    <FiCalendar aria-hidden="true" />
                    <div><span>Premium vigente hasta</span><strong>{vigenteHasta}</strong></div>
                  </div>
                )}
                <div className="miplan-billing-item">
                  <FiCreditCard aria-hidden="true" />
                  <div><span>Método de pago</span><strong>Mercado Pago</strong></div>
                </div>
                <div className="miplan-billing-item">
                  <FiRefreshCw aria-hidden="true" />
                  <div><span>Renovación</span><strong>{renovacionAutomatica ? "Automática" : "Cancelada"}</strong></div>
                </div>
              </div>
            </div>
            {error && <p role="alert" className="miplan-error">{error}</p>}
          </div>

          <div className="cfg-pos-card miplan-benefits-card">
            <h3>Tus beneficios Premium activos</h3>
            <p>Aprovecha al máximo todas las ventajas de tu plan.</p>
            <div className="miplan-benefits-active-grid">
              {BENEFICIOS.map(({ icon: Icono, titulo, texto }) => (
                <div key={titulo} className="miplan-benefit-active-card">
                  <span className="miplan-benefit-icon"><Icono aria-hidden="true" /></span>
                  <strong>{titulo}</strong>
                  <p>{texto}</p>
                  <span className="miplan-active-tag"><FiCheck aria-hidden="true" /> Activo</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cfg-pos-card miplan-usage-card">
            <h3>Uso actual de tu negocio</h3>
            <p>Resumen de usuarios y equipos registrados.</p>
            <div className="miplan-usage-grid">
              <div className="miplan-usage-item"><span>Usuarios registrados</span><strong>{conteos.usuariosTotal || 0}</strong></div>
              <div className="miplan-usage-item"><span>Usuarios activos</span><strong>{conteos.usuariosActivos || 0}</strong></div>
              <div className="miplan-usage-item"><span>Usuarios pendientes</span><strong>{conteos.usuariosPendientes || 0}</strong></div>
              <div className="miplan-usage-item"><span>Equipos registrados</span><strong>{conteos.equiposTotal || 0}</strong></div>
            </div>
            <button type="button" className="emp-btn emp-btn-soft miplan-usage-refresh" onClick={refrescarConteos} disabled={actualizando}>
              {actualizando ? "Actualizando..." : "Actualizar conteos"}
            </button>
          </div>

          <div className="cfg-pos-card miplan-history-card">
            <h3>Historial de pagos</h3>
            <p>Tus últimos pagos realizados mediante Mercado Pago.</p>
            {historial.length === 0 ? (
              <p className="miplan-history-empty">Todavía no hay pagos registrados.</p>
            ) : (
              <div className="miplan-history-table-wrap">
                <table className="miplan-history-table">
                  <thead>
                    <tr><th>Fecha</th><th>Monto</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {historial.map((pago) => (
                      <tr key={pago.id}>
                        <td>{formatFechaCorta(pago.fecha) || "—"}</td>
                        <td>${Number(pago.monto || 0).toFixed(0)} {pago.moneda || "MXN"}</td>
                        <td><span className="miplan-pago-estado">Pagado</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="miplan-free-grid">
            <div className="cfg-pos-card miplan-free-card">
              <span className="cfg-sus-model-kicker">Plan actual</span>
              <div className="miplan-free-card-body">
                <div>
                  <h2>CajaLibre Gratuito</h2>
                  <p>Tu negocio utiliza actualmente el plan gratuito de CajaLibre.</p>
                  <div className="miplan-price">$0 <span>MXN / mes</span></div>
                  <div className="miplan-billing-row">
                    <span>Cobros automáticos</span>
                    <strong>No activos</strong>
                  </div>
                </div>
                <div className="miplan-shop-illustration"><FiHome aria-hidden="true" /></div>
              </div>
              {info.aviso && <p className="miplan-notice">{info.aviso}</p>}
              <button type="button" className="emp-btn emp-btn-primary miplan-cta-btn" onClick={activarPremium} disabled={busy}>
                <FiStar aria-hidden="true" /> {busy ? "Procesando…" : info.accion}
              </button>
              {error && <p role="alert" className="miplan-error">{error}</p>}
            </div>

            <div className="cfg-pos-card miplan-included-card">
              <h3>¿Qué incluye el plan gratuito?</h3>
              <p>Todo lo necesario para comenzar a gestionar tu negocio.</p>
              <div className="miplan-included-grid">
                {INCLUIDO_GRATUITO.map(({ activo, titulo, texto }) => (
                  <div key={titulo} className={`miplan-included-item ${activo ? "is-active" : "is-inactive"}`}>
                    {activo ? <FiCheckCircle aria-hidden="true" /> : <FiXCircle aria-hidden="true" />}
                    <strong>{titulo}</strong>
                    <p>{texto}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="miplan-upsell-banner">
            <FiStar aria-hidden="true" className="miplan-upsell-icon" />
            <div>
              <strong>Lleva tu negocio al siguiente nivel</strong>
              <p>El plan Premium te da más herramientas, control y libertad para hacer crecer tu negocio.</p>
            </div>
            <a href="#miplan-beneficios" className="emp-btn emp-btn-soft">Ver beneficios</a>
          </div>

          <div className="cfg-pos-card miplan-benefits-card" id="miplan-beneficios">
            <h3>Comparativa de planes</h3>
            <div className="miplan-history-table-wrap">
              <table className="miplan-compare-table">
                <thead>
                  <tr><th>Funcionalidad</th><th>Gratuito</th><th className="miplan-compare-premium-col">Premium</th></tr>
                </thead>
                <tbody>
                  {COMPARATIVA.map((fila) => (
                    <tr key={fila.nombre}>
                      <td>{fila.nombre}</td>
                      <td>{fila.gratuito}</td>
                      <td className="miplan-compare-premium-col"><strong>{fila.premium}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="cfg-pos-card miplan-help-card">
        <FiMessageCircle aria-hidden="true" className="miplan-help-icon" />
        <div>
          <strong>¿Tienes dudas sobre tu plan?</strong>
          <p>Estamos aquí para ayudarte. Consulta nuestras preguntas frecuentes o contáctanos.</p>
        </div>
        <Link className="emp-btn emp-btn-soft" to="/ayuda">Centro de ayuda</Link>
      </div>
    </section>
  );
}
