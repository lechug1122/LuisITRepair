import { useEffect, useState } from "react";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import {
  PLAN_GRATUITO,
  actualizarConteosNegocio,
  escucharNegocio,
} from "../js/services/negocios";

export default function ConfiguracionMiSuscripcion() {
  const {
    loading,
    uid,
    cuentaPrincipalUid,
    superAdmin,
    suscripcionControlada,
  } = useAutorizacionActual();
  const [negocio, setNegocio] = useState(null);
  const [actualizando, setActualizando] = useState(false);

  const esAdministradorNegocio =
    superAdmin !== true &&
    String(uid || "").trim() !== "" &&
    String(uid || "").trim() === String(cuentaPrincipalUid || "").trim();

  useEffect(() => {
    const negocioId = cuentaPrincipalUid || uid;
    if (!negocioId) return undefined;

    return escucharNegocio(
      negocioId,
      (data) => setNegocio(data),
      () => setNegocio(null),
    );
  }, [cuentaPrincipalUid, uid]);

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
      <section className="cfg-sus-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Mi Plan</h2>
          <p>Cargando informacion de tu negocio...</p>
        </div>
      </section>
    );
  }

  if (!esAdministradorNegocio && suscripcionControlada) {
    return (
      <section className="cfg-sus-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Mi Plan</h2>
          <p>Esta seccion solo esta disponible para el administrador del negocio.</p>
        </div>
      </section>
    );
  }

  const conteos = negocio?.conteos || {};

  return (
    <section className="cfg-sus-wrap">
      <div className="cfg-header">
        <h1>Mi Plan</h1>
        <p>
          CajaLibre funciona actualmente como servicio gratuito. La cantidad de usuarios y
          equipos es informativa para entender el uso del sistema.
        </p>
      </div>

      <div className="cfg-pos-card cfg-my-sus-card">
        <div className="cfg-my-sus-head">
          <div>
            <span className="cfg-sus-model-kicker">Plan actual</span>
            <h2>{negocio?.planActual || PLAN_GRATUITO}</h2>
            <p>
              Los usuarios añadidos actualmente son gratuitos. No existen cargos automaticos,
              datos bancarios ni costos internos visibles para el negocio.
            </p>
          </div>
          <span className="cfg-sus-status status-al-corriente">
            {negocio?.estado || "gratuito"}
          </span>
        </div>

        <div className="cfg-my-sus-grid">
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Usuarios registrados</span>
            <strong>{conteos.usuariosTotal || 0}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Usuarios activos</span>
            <strong>{conteos.usuariosActivos || 0}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Usuarios pendientes</span>
            <strong>{conteos.usuariosPendientes || 0}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Usuarios deshabilitados</span>
            <strong>{conteos.usuariosDeshabilitados || 0}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Equipos registrados</span>
            <strong>{conteos.equiposTotal || 0}</strong>
          </div>
          <div className="cfg-my-sus-item">
            <span className="cfg-proveedores-label">Cobros automaticos</span>
            <strong>No activos</strong>
          </div>
        </div>

        <div className="cfg-sus-card-actions">
          <button
            type="button"
            className="emp-btn emp-btn-soft"
            onClick={refrescarConteos}
            disabled={actualizando}
          >
            {actualizando ? "Actualizando..." : "Actualizar conteos"}
          </button>
        </div>
      </div>

      <div className="cfg-pos-card cfg-metodos-card">
        <div className="cfg-metodos-head">
          <div>
            <h3>Condicion gratuita</h3>
            <p>
              Cualquier cambio futuro de un plan gratuito a uno de pago requerira aviso previo
              y aceptacion expresa del usuario.
            </p>
          </div>
          <span className="cfg-metodos-pill">Sin datos bancarios</span>
        </div>
      </div>
    </section>
  );
}
