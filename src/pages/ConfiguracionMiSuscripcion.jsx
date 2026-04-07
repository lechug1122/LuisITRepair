import useAutorizacionActual from "../hooks/useAutorizacionActual";
import {
  SUSCRIPCION_METODOS_PAGO,
  formatDateShort,
  getMetodoPagoSuscripcionLabel,
} from "../js/services/suscripciones";

function statusClassName(codigo = "") {
  if (codigo === "al_corriente") return "status-al-corriente";
  if (codigo === "en_gracia") return "status-en-gracia";
  if (codigo === "bloqueada" || codigo === "bloqueada_manual") return "status-bloqueada";
  return "status-pendiente";
}

function buildFallbackSuscripcion() {
  return {
    codigo: "pendiente_configuracion",
    etiqueta: "Pendiente",
    detalle: "Tu suscripcion todavia no tiene informacion de cobro registrada.",
    planNombre: "Sin definir",
    metodoPago: "",
    monto: 0,
    fechaUltimoPago: null,
    proximoPago: null,
    graciaHasta: null,
    dispositivosTitularPermitidos: 1,
  };
}

export default function ConfiguracionMiSuscripcion() {
  const {
    loading,
    uid,
    cuentaPrincipalUid,
    superAdmin,
    suscripcionControlada,
    suscripcion,
  } = useAutorizacionActual();

  const esTitularSuscripcion =
    superAdmin !== true &&
    suscripcionControlada === true &&
    String(uid || "").trim() !== "" &&
    String(uid || "").trim() === String(cuentaPrincipalUid || "").trim();

  if (loading) {
    return (
      <section className="cfg-sus-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Mi Suscripcion</h2>
          <p>Cargando informacion de tu suscripcion...</p>
        </div>
      </section>
    );
  }

  if (!esTitularSuscripcion) {
    return (
      <section className="cfg-sus-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Mi Suscripcion</h2>
          <p>Esta seccion solo esta disponible para el usuario titular que paga el sistema.</p>
        </div>
      </section>
    );
  }

  const info = suscripcion || buildFallbackSuscripcion();

  return (
    <section className="cfg-sus-wrap">
      <div className="cfg-header">
        <h1>Mi Suscripcion</h1>
        <p>
          Consulta el estado de tu cuenta, tu metodo de pago registrado y los medios
          disponibles para renovar el sistema.
        </p>
      </div>

      <div className="cfg-pos-card cfg-my-sus-card">
        <div className="cfg-my-sus-head">
          <div>
            <span className="cfg-sus-model-kicker">Cuenta principal</span>
            <h2>Resumen de tu suscripcion</h2>
            <p>
              Esta informacion es solo de consulta para el titular del negocio. Tus empleados
              no ven esta seccion.
            </p>
          </div>
          <span className={`cfg-sus-status ${statusClassName(info.codigo)}`}>
            {info.etiqueta}
          </span>
        </div>

        <div className="cfg-my-sus-grid">
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Suscripcion</span>
            <strong>{info.planNombre || "Sin definir"}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Metodo de pago registrado</span>
            <strong>{getMetodoPagoSuscripcionLabel(info.metodoPago)}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Monto</span>
            <strong>${Number(info.monto || 0).toFixed(2)}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Equipos permitidos</span>
            <strong>{info.dispositivosTitularPermitidos || 1}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Ultimo pago</span>
            <strong>{formatDateShort(info.fechaUltimoPago)}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Proximo pago</span>
            <strong>{formatDateShort(info.proximoPago)}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Gracia hasta</span>
            <strong>{formatDateShort(info.graciaHasta)}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Estado actual</span>
            <strong>{info.detalle}</strong>
          </div>
        </div>
      </div>

      <div className="cfg-pos-card cfg-metodos-card">
        <div className="cfg-metodos-head">
          <div>
            <h3>Metodos de pago disponibles</h3>
            <p>
              Por ahora puedes manejar estos medios para el cobro de la suscripcion del
              sistema.
            </p>
          </div>
          <span className="cfg-metodos-pill">Solo titular pagador</span>
        </div>

        <div className="cfg-metodos-grid">
          {SUSCRIPCION_METODOS_PAGO.map((item) => (
            <article key={item.value} className="cfg-metodos-option">
              <strong>{item.label}</strong>
              <small>Disponible para registrar o consultar pagos de tu suscripcion.</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
