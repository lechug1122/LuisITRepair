import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiAward, FiDownload, FiLock, FiSlash, FiUnlock, FiUsers, FiX,
} from "react-icons/fi";
import { formatDateShort } from "../../js/services/suscripciones";
import { etiquetaUltimoAcceso } from "../../js/services/actividad_negocio";
import { esNegocioBloqueado } from "../../js/services/plan_negocio";
import {
  obtenerHistorialAdmin,
  obtenerUsuariosNegocio,
} from "../../js/services/superadmin_negocios";
import { SOPORTE_CAJA_LIBRE } from "../../js/services/negocios";

function Campo({ etiqueta, valor, ancho = false }) {
  return (
    <div className={`sa-field ${ancho ? "sa-field-wide" : ""}`.trim()}>
      <span>{etiqueta}</span>
      <strong>{valor ?? "Sin registro"}</strong>
    </div>
  );
}

export default function BusinessDrawer({
  negocio,
  onCerrar,
  onBloquear,
  onDesbloquear,
  onPremium,
  onExportar,
  ocupado = false,
}) {
  const [usuarios, setUsuarios] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [verUsuarios, setVerUsuarios] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef(null);
  const negocioId = negocio?.negocioId || "";

  // Usuarios e historial se consultan solo al abrir un negocio concreto: la
  // tabla nunca los precarga para no multiplicar lecturas por fila.
  // El componente se remonta por negocioId (prop key), asi que el estado ya
  // llega limpio y el efecto no necesita reiniciarlo.
  useEffect(() => {
    if (!negocioId) return undefined;
    let cancelado = false;

    Promise.all([obtenerUsuariosNegocio(negocioId), obtenerHistorialAdmin(negocioId)])
      .then(([listaUsuarios, listaHistorial]) => {
        if (cancelado) return;
        setUsuarios(listaUsuarios);
        setHistorial(listaHistorial);
      })
      .catch(() => {
        if (cancelado) return;
        setUsuarios([]);
        setHistorial([]);
        setError("No se pudo cargar el detalle completo del negocio.");
      });

    return () => { cancelado = true; };
  }, [negocioId]);

  useEffect(() => {
    if (!negocio) return undefined;
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (anterior?.isConnected) anterior.focus();
    };
  }, [negocio]);

  const alTeclear = useCallback((event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCerrar();
    }
  }, [onCerrar]);

  if (!negocio) return null;

  const plan = negocio.plan;
  const bloqueado = esNegocioBloqueado(negocio);
  const conteos = negocio.conteos || {};

  return (
    <>
      <div className="sa-drawer-backdrop" role="presentation" onClick={onCerrar} />
      <aside
        ref={panel}
        className="sa-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sa-drawer-title"
        tabIndex={-1}
        onKeyDown={alTeclear}
      >
        <header className="sa-drawer-head">
          <div>
            <h2 id="sa-drawer-title">{negocio.nombre}</h2>
            <div className="sa-drawer-head-badges">
              <span className={`sa-badge sa-badge-${plan.esPremium ? "premium" : "free"}`}>
                {plan.etiqueta}
              </span>
              <span className={`sa-badge sa-badge-${negocio.actividad.tono}`}>
                {negocio.actividad.label}
              </span>
              {bloqueado ? <span className="sa-badge sa-badge-rojo">{negocio.estado}</span> : null}
            </div>
          </div>
          <button
            type="button"
            className="sa-drawer-close"
            onClick={onCerrar}
            aria-label="Cerrar detalle"
          >
            <FiX />
          </button>
        </header>

        <div className="sa-drawer-body">
          {error ? <div className="sa-error" style={{ marginBottom: 14 }}>{error}</div> : null}

          {plan.inconsistente ? (
            <div className="sa-feedback error" style={{ marginBottom: 14 }}>
              Marca Premium desincronizada: el campo <code>premium</code> dice
              {plan.marcaPremium ? " activo" : " inactivo"} pero la vigencia pagada dice
              {plan.esPremium ? " activo" : " inactivo"}. Manda la vigencia.
            </div>
          ) : null}

          <section className="sa-section">
            <h3>Información</h3>
            <div className="sa-fields">
              <Campo etiqueta="Negocio ID" valor={negocio.negocioId} ancho />
              <Campo etiqueta="Propietario" valor={negocio.correo || "Sin correo"} ancho />
              <Campo etiqueta="Registro" valor={formatDateShort(negocio.createdAt)} />
              <Campo etiqueta="Teléfono" valor={negocio.telefono || "Sin registro"} />
              <Campo
                etiqueta="Último acceso"
                valor={etiquetaUltimoAcceso(negocio.ultimoAccesoMs || negocio.ultimaActividadMs)}
              />
              <Campo
                etiqueta="Días sin actividad"
                valor={negocio.actividad.dias === null ? "Sin datos" : `${negocio.actividad.dias}`}
              />
            </div>
          </section>

          <section className="sa-section">
            <h3>Cuenta</h3>
            <div className="sa-fields">
              <Campo etiqueta="Usuarios" valor={conteos.usuariosTotal ?? 0} />
              <Campo etiqueta="Activos" valor={conteos.usuariosActivos ?? 0} />
              <Campo etiqueta="Deshabilitados" valor={conteos.usuariosDeshabilitados ?? 0} />
              <Campo etiqueta="Pendientes" valor={conteos.usuariosPendientes ?? 0} />
              <Campo etiqueta="Equipos" valor={conteos.equiposTotal ?? 0} />
            </div>
          </section>

          <section className="sa-section">
            <h3>Configuración</h3>
            <div className="sa-fields">
              <Campo
                etiqueta="Configuración inicial"
                valor={negocio.setupCompleto ? "Completa" : "Incompleta"}
              />
              <Campo
                etiqueta="Términos"
                valor={negocio.terminosAceptados ? "Aceptados" : "Pendientes"}
              />
              <Campo etiqueta="Versión términos" valor={negocio.terminosVersion || "Sin aceptar"} />
              <Campo etiqueta="Tipo de negocio" valor={negocio.tipoNegocioId || "Sin definir"} />
            </div>
          </section>

          <section className="sa-section">
            <h3>Plan</h3>
            <div className="sa-fields">
              <Campo etiqueta="Plan" valor={plan.etiqueta} />
              <Campo
                etiqueta="Estado"
                valor={plan.esPremium ? (plan.enPeriodoFinal ? "Sin renovación" : "Activo") : "Gratuito"}
              />
              <Campo etiqueta="Usuarios permitidos" valor={plan.esPremium ? "Ilimitados" : "3"} />
              <Campo
                etiqueta="Vigente hasta"
                valor={plan.premiumUntil ? formatDateShort(plan.premiumUntil) : "No aplica"}
              />
              <Campo
                etiqueta="Último pago"
                valor={plan.ultimoPago ? formatDateShort(plan.ultimoPago) : "Sin registro"}
              />
              <Campo
                etiqueta="Próximo pago"
                valor={plan.proximoPago ? formatDateShort(plan.proximoPago) : "Sin programar"}
              />
            </div>
          </section>

          <section className="sa-section">
            <h3><FiUsers aria-hidden="true" /> Usuarios</h3>
            {!verUsuarios ? (
              <button
                type="button"
                className="sa-btn"
                onClick={() => setVerUsuarios(true)}
                disabled={usuarios === null}
              >
                {usuarios === null ? "Cargando..." : `Ver usuarios (${usuarios.length})`}
              </button>
            ) : (
              <div className="sa-users">
                {usuarios.length === 0 ? (
                  <p className="sa-note">Este negocio todavía no tiene usuarios registrados.</p>
                ) : usuarios.map((usuario) => (
                  <div key={usuario.id} className="sa-user">
                    <div>
                      <strong>{usuario.nombre || "Sin nombre"}</strong>
                      <small>{usuario.correo || usuario.uid}</small>
                    </div>
                    <span className="sa-badge sa-badge-gris">{usuario.rol || "Sin rol"}</span>
                    <span className={`sa-badge sa-badge-${usuario.activo ? "verde" : "rojo"}`}>
                      {usuario.estado}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="sa-section">
            <h3>Soporte</h3>
            <div className="sa-fields">
              <Campo etiqueta="Teléfono CajaLibre" valor={SOPORTE_CAJA_LIBRE.telefono} />
              <Campo etiqueta="Correo CajaLibre" valor={SOPORTE_CAJA_LIBRE.correo} />
            </div>
            <p className="sa-note" style={{ marginTop: 10 }}>
              CajaLibre todavía no tiene sistema de tickets, así que no hay solicitudes que
              mostrar aquí. Cuando exista, esta sección lo reflejará.
            </p>
          </section>

          <section className="sa-section">
            <h3>Historial administrativo</h3>
            {historial === null ? (
              <p className="sa-note">Cargando historial...</p>
            ) : historial.length === 0 ? (
              <p className="sa-note">Sin acciones administrativas registradas.</p>
            ) : (
              <div className="sa-history">
                {historial.map((item) => (
                  <div key={item.id} className="sa-history-item">
                    <strong>{item.tipo || "Acción"}</strong>
                    <span>
                      {formatDateShort(item.createdAt)}
                      {item.detalle || item.razon ? ` · ${item.detalle || item.razon}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="sa-section">
            <h3>Acciones administrativas</h3>
            <div className="sa-actions">
              {plan.esPremium ? (
                <button
                  type="button"
                  className="sa-btn sa-btn-danger"
                  onClick={() => onPremium(negocio, false)}
                  disabled={ocupado}
                >
                  <FiSlash aria-hidden="true" /> Desactivar Premium
                </button>
              ) : (
                <button
                  type="button"
                  className="sa-btn sa-btn-gold"
                  onClick={() => onPremium(negocio, true)}
                  disabled={ocupado}
                >
                  <FiAward aria-hidden="true" /> Activar Premium
                </button>
              )}

              {bloqueado ? (
                <button
                  type="button"
                  className="sa-btn"
                  onClick={() => onDesbloquear(negocio)}
                  disabled={ocupado}
                >
                  <FiUnlock aria-hidden="true" /> Desbloquear
                </button>
              ) : (
                <button
                  type="button"
                  className="sa-btn sa-btn-danger"
                  onClick={() => onBloquear(negocio)}
                  disabled={ocupado}
                >
                  <FiLock aria-hidden="true" /> Bloquear negocio
                </button>
              )}

              <button
                type="button"
                className="sa-btn sa-btn-primary sa-actions-wide"
                onClick={() => onExportar(negocio, usuarios || [], historial || [])}
                disabled={ocupado || usuarios === null}
              >
                <FiDownload aria-hidden="true" /> Descargar información administrativa
              </button>
            </div>
            <p className="sa-note" style={{ marginTop: 11 }}>
              El expediente incluye cuenta, plan, actividad, configuración, historial
              y el catálogo de productos dado de alta. Nunca incluye ventas, ingresos,
              clientes ni fiados del negocio.
            </p>
          </section>
        </div>
      </aside>
    </>
  );
}
