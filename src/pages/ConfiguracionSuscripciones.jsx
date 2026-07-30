import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../initializer/firebase";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import {
  NEGOCIO_ESTADOS,
  PLAN_GRATUITO,
  actualizarConteosNegocio,
  actualizarEstadoNegocio,
  eliminarNegocioConDatos,
  normalizeNegocio,
} from "../js/services/negocios";

function statusClassName(estado = "") {
  if (estado === "activo" || estado === "gratuito") return "status-al-corriente";
  if (estado === "bloqueado" || estado === "suspendido") return "status-bloqueada";
  return "status-pendiente";
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ConfiguracionSuscripciones() {
  const { loading, uid: currentUid, superAdmin } = useAutorizacionActual();
  const [negocios, setNegocios] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [configuraciones, setConfiguraciones] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [savingId, setSavingId] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [drafts, setDrafts] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const unsubNegocios = onSnapshot(
      collection(db, "negocios"),
      (snapshot) => {
        setNegocios(snapshot.docs.map((item) => normalizeNegocio(item.data(), item.id)));
      },
      () => setNegocios([]),
    );

    const unsubEmpleados = onSnapshot(
      collection(db, "autorizados"),
      (snapshot) => setEmpleados(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setEmpleados([]),
    );

    const unsubConfiguraciones = onSnapshot(
      collection(db, "configuracion"),
      (snapshot) =>
        setConfiguraciones(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setConfiguraciones([]),
    );

    const unsubSesiones = onSnapshot(
      collection(db, "sesiones_dispositivo"),
      (snapshot) => setSesiones(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setSesiones([]),
    );

    return () => {
      unsubNegocios();
      unsubEmpleados();
      unsubConfiguraciones();
      unsubSesiones();
    };
  }, []);

  const conteosPorNegocio = useMemo(() => {
    const map = {};

    empleados.forEach((user) => {
      const negocioId = String(user?.negocioId || user?.cuentaPrincipalUid || user?.uid || "").trim();
      if (!negocioId) return;
      if (!map[negocioId]) {
        map[negocioId] = {
          usuariosTotal: 0,
          usuariosActivos: 0,
          usuariosPendientes: 0,
          usuariosDeshabilitados: 0,
          equiposTotal: 0,
        };
      }

      map[negocioId].usuariosTotal += 1;
      if (user.activo === false || user.estado === "Deshabilitado") {
        map[negocioId].usuariosDeshabilitados += 1;
      } else if (user.estado === "Pendiente" || user.activo === null) {
        map[negocioId].usuariosPendientes += 1;
      } else {
        map[negocioId].usuariosActivos += 1;
      }
    });

    sesiones.forEach((session) => {
      const negocioId = String(session?.negocioId || session?.cuentaPrincipalUid || "").trim();
      if (!negocioId) return;
      if (!map[negocioId]) {
        map[negocioId] = {
          usuariosTotal: 0,
          usuariosActivos: 0,
          usuariosPendientes: 0,
          usuariosDeshabilitados: 0,
          equiposTotal: 0,
        };
      }
      map[negocioId].equiposTotal += 1;
    });

    return map;
  }, [empleados, sesiones]);

  const empresasPorNegocio = useMemo(() => {
    const map = {};
    configuraciones.forEach((config) => {
      const id = String(config?.id || "").trim();
      if (!id.startsWith("empresa__")) return;
      const negocioId = String(config?.negocioId || config?.cuentaPrincipalUid || id.replace("empresa__", "")).trim();
      if (!negocioId) return;
      map[negocioId] = config;
    });
    return map;
  }, [configuraciones]);

  const negociosBase = useMemo(() => {
    const map = new Map();

    negocios.forEach((negocio) => {
      if (!negocio.negocioId) return;
      map.set(negocio.negocioId, negocio);
    });

    empleados.forEach((user) => {
      const negocioId = String(user?.negocioId || user?.cuentaPrincipalUid || user?.uid || user?.id || "").trim();
      if (!negocioId || map.has(negocioId)) return;

      const esPrincipal =
        user?.esCuentaPrincipal === true ||
        String(user?.uid || user?.id || "").trim() === negocioId;
      if (!esPrincipal) return;

      const empresa = empresasPorNegocio[negocioId] || {};
      map.set(
        negocioId,
        normalizeNegocio(
          {
            negocioId,
            cuentaPrincipalUid: negocioId,
            administradorUid: String(user?.uid || user?.id || negocioId).trim(),
            nombre: empresa.nombre || user?.nombre || user?.correo || "Negocio sin nombre",
            telefono: empresa.telefono || user?.telefono || "",
            correo: user?.correo || empresa.correo || "",
            estado: user?.setupCompleto === false ? "pendiente" : "gratuito",
            planActual: PLAN_GRATUITO,
            modalidad: "gratuito",
            gratuito: true,
            usuariosGratis: true,
            cobrosAutomaticos: false,
            setupCompleto: user?.setupCompleto === true,
            terminosAceptados: user?.terminosAceptados === true,
            terminosVersion: user?.terminosVersion || "",
            sintetizado: true,
          },
          negocioId,
        ),
      );
    });

    Object.entries(empresasPorNegocio).forEach(([negocioId, empresa]) => {
      if (!negocioId || map.has(negocioId)) return;
      map.set(
        negocioId,
        normalizeNegocio(
          {
            negocioId,
            cuentaPrincipalUid: negocioId,
            nombre: empresa.nombre || "Negocio sin nombre",
            telefono: empresa.telefono || "",
            estado: "gratuito",
            planActual: PLAN_GRATUITO,
            modalidad: "gratuito",
            gratuito: true,
            usuariosGratis: true,
            cobrosAutomaticos: false,
            setupCompleto: true,
            sintetizado: true,
          },
          negocioId,
        ),
      );
    });

    return [...map.values()];
  }, [empleados, empresasPorNegocio, negocios]);

  const negociosConConteos = useMemo(() => {
    return negociosBase
      .map((negocio) => ({
        ...negocio,
        conteos: {
          ...negocio.conteos,
          ...(conteosPorNegocio[negocio.negocioId] || {}),
        },
      }))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  }, [conteosPorNegocio, negociosBase]);

  const resumen = useMemo(() => {
    return negociosConConteos.reduce(
      (acc, item) => {
        acc.negocios += 1;
        acc.usuarios += item.conteos.usuariosTotal || 0;
        acc.equipos += item.conteos.equiposTotal || 0;
        if (item.estado === "bloqueado" || item.estado === "suspendido") acc.bloqueados += 1;
        return acc;
      },
      { negocios: 0, usuarios: 0, equipos: 0, bloqueados: 0 },
    );
  }, [negociosConConteos]);

  const getDraft = (negocio) => {
    const current = drafts[negocio.negocioId];
    return {
      estado: current?.estado || negocio.estado || "gratuito",
      razon: current?.razon ?? negocio.bloqueoRazon ?? "",
    };
  };

  const updateDraft = (negocioId, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [negocioId]: {
        ...(prev[negocioId] || {}),
        ...patch,
      },
    }));
  };

  const guardarEstado = async (negocio) => {
    const draft = getDraft(negocio);
    setSavingId(negocio.negocioId);
    setFeedback({ type: "", message: "" });

    try {
      await actualizarEstadoNegocio({
        negocioId: negocio.negocioId,
        estado: draft.estado,
        razon: draft.razon,
        actorUid: currentUid,
      });
      await actualizarConteosNegocio(negocio.negocioId).catch(() => null);
      setFeedback({ type: "success", message: "Estado del negocio actualizado." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo actualizar el negocio.",
      });
    } finally {
      setSavingId("");
    }
  };

  const crearRegistroNegocio = async (negocio) => {
    setSavingId(negocio.negocioId);
    setFeedback({ type: "", message: "" });

    try {
      await setDoc(
        doc(db, "negocios", negocio.negocioId),
        {
          negocioId: negocio.negocioId,
          cuentaPrincipalUid: negocio.cuentaPrincipalUid || negocio.negocioId,
          administradorUid: negocio.administradorUid || negocio.negocioId,
          nombre: negocio.nombre || "Negocio sin nombre",
          telefono: negocio.telefono || "",
          correo: negocio.correo || "",
          estado: negocio.estado || "gratuito",
          planActual: PLAN_GRATUITO,
          modalidad: "gratuito",
          gratuito: true,
          usuariosGratis: true,
          cobrosAutomaticos: false,
          setupCompleto: negocio.setupCompleto === true,
          terminosAceptados: negocio.terminosAceptados === true,
          terminosVersion: negocio.terminosVersion || "",
          conteos: negocio.conteos || {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedByUid: currentUid || null,
        },
        { merge: true },
      );
      await actualizarConteosNegocio(negocio.negocioId).catch(() => null);
      setFeedback({ type: "success", message: "Registro de negocio creado correctamente." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo crear el registro del negocio.",
      });
    } finally {
      setSavingId("");
    }
  };

  const abrirEliminarNegocio = (negocio) => {
    setDeleteTarget(negocio);
    setDeleteConfirmText("");
    setDeleteReason("");
    setDeleteError("");
  };

  const cerrarEliminarNegocio = () => {
    if (savingId) return;
    setDeleteTarget(null);
    setDeleteConfirmText("");
    setDeleteReason("");
    setDeleteError("");
  };

  const confirmarEliminarNegocio = async () => {
    if (!deleteTarget?.negocioId || savingId) return;
    const expected = String(deleteTarget.nombre || deleteTarget.negocioId).trim();
    if (deleteConfirmText.trim() !== expected) {
      setDeleteError(`Escribe exactamente "${expected}" para confirmar.`);
      return;
    }

    setSavingId(deleteTarget.negocioId);
    setDeleteError("");
    setFeedback({ type: "", message: "" });

    try {
      const result = await eliminarNegocioConDatos({
        negocioId: deleteTarget.negocioId,
        actorUid: currentUid,
        razon: deleteReason,
      });
      setFeedback({
        type: "success",
        message: `Negocio eliminado. Documentos Firestore procesados: ${result.totalDeleted}.`,
      });
      setDeleteTarget(null);
      setDeleteConfirmText("");
      setDeleteReason("");
      setDeleteError("");
    } catch (error) {
      setDeleteError(error?.message || "No se pudo eliminar el negocio.");
    } finally {
      setSavingId("");
    }
  };

  if (loading) {
    return (
      <div className="cfg-sus-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Superadministracion</h2>
          <p>Cargando permisos del usuario...</p>
        </div>
      </div>
    );
  }

  if (!superAdmin) {
    return (
      <div className="cfg-sus-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Superadministracion</h2>
          <p>Solo el superadministrador de CajaLibre puede consultar negocios globales.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cfg-sus-wrap">
      <div className="cfg-header">
        <h1>Panel de Superadministrador</h1>
        <p>
          Control informativo de negocios registrados. CajaLibre permanece en plan gratuito:
          no hay cobros automaticos ni datos bancarios.
        </p>
      </div>

      <div className="cfg-pos-card cfg-sus-model-card">
        <div className="cfg-sus-model-head">
          <div>
            <span className="cfg-sus-model-kicker">Servicio gratuito</span>
            <h2>Negocios separados por negocioId</h2>
            <p>
              Este panel muestra conteos y estados por negocio. Los administradores de negocio
              solo administran su propio espacio; los estados globales se cambian aqui.
            </p>
          </div>
        </div>
        <div className="cfg-sus-model-points">
          <span>Sin cobros automaticos</span>
          <span>Usuarios añadidos gratuitos</span>
          <span>Conteos informativos</span>
          <span>Bitacora administrativa</span>
        </div>
      </div>

      <div className="cfg-sus-summary-grid">
        <div className="cfg-sus-summary-card">
          <span>Negocios</span>
          <strong>{resumen.negocios}</strong>
          <small>Total de negocios registrados.</small>
        </div>
        <div className="cfg-sus-summary-card">
          <span>Usuarios</span>
          <strong>{resumen.usuarios}</strong>
          <small>Usuarios registrados gratuitamente.</small>
        </div>
        <div className="cfg-sus-summary-card">
          <span>Equipos</span>
          <strong>{resumen.equipos}</strong>
          <small>Equipos detectados de forma informativa.</small>
        </div>
        <div className="cfg-sus-summary-card">
          <span>Bloqueados</span>
          <strong>{resumen.bloqueados}</strong>
          <small>Negocios sin acceso operativo.</small>
        </div>
      </div>

      {feedback.message ? (
        <div className={`cfg-sus-feedback ${feedback.type || ""}`}>
          {feedback.message}
        </div>
      ) : null}

      <div className="cfg-sus-list-grid cfg-business-list-grid">
        {negociosConConteos.map((negocio) => {
          const draft = getDraft(negocio);
          return (
            <article key={negocio.negocioId} className="cfg-sus-card cfg-business-card">
              <div className="cfg-sus-card-head">
                <div>
                  <h3>{negocio.nombre}</h3>
                  <p>{negocio.correo || negocio.negocioId}</p>
                  {negocio.sintetizado ? (
                    <small className="cfg-business-synth-label">
                      Detectado desde registros existentes
                    </small>
                  ) : null}
                </div>
                <span className={`cfg-sus-status ${statusClassName(negocio.estado)}`}>
                  {negocio.estado}
                </span>
              </div>

              <div className="cfg-sus-card-grid">
                <div>
                  <span className="cfg-proveedores-label">Plan actual</span>
                  <p>{negocio.planActual || PLAN_GRATUITO}</p>
                </div>
                <div>
                  <span className="cfg-proveedores-label">Terminos</span>
                  <p>{negocio.terminosAceptados ? "Aceptados" : "Pendientes"}</p>
                </div>
                <div>
                  <span className="cfg-proveedores-label">Version terminos</span>
                  <p>{negocio.terminosVersion || "Sin aceptar"}</p>
                </div>
                <div>
                  <span className="cfg-proveedores-label">Configuracion</span>
                  <p>{negocio.setupCompleto ? "Completa" : "Pendiente"}</p>
                </div>
                <div>
                  <span className="cfg-proveedores-label">Usuarios</span>
                  <p>{negocio.conteos.usuariosTotal}</p>
                </div>
                <div>
                  <span className="cfg-proveedores-label">Activos</span>
                  <p>{negocio.conteos.usuariosActivos}</p>
                </div>
                <div>
                  <span className="cfg-proveedores-label">Pendientes</span>
                  <p>{negocio.conteos.usuariosPendientes}</p>
                </div>
                <div>
                  <span className="cfg-proveedores-label">Deshabilitados</span>
                  <p>{negocio.conteos.usuariosDeshabilitados}</p>
                </div>
                <div>
                  <span className="cfg-proveedores-label">Equipos</span>
                  <p>{negocio.conteos.equiposTotal}</p>
                </div>
                <div>
                  <span className="cfg-proveedores-label">Bloqueo fecha</span>
                  <p>{formatDate(negocio.bloqueoFecha)}</p>
                </div>
              </div>

              <div className="cfg-business-state-box">
                <label className="emp-field">
                  <span>Estado del negocio</span>
                  <select
                    value={draft.estado}
                    onChange={(e) => updateDraft(negocio.negocioId, { estado: e.target.value })}
                  >
                    {NEGOCIO_ESTADOS.map((estado) => (
                      <option key={estado} value={estado}>
                        {estado}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="emp-field">
                  <span>Razon de bloqueo o nota interna</span>
                  <textarea
                    rows={3}
                    value={draft.razon}
                    onChange={(e) => updateDraft(negocio.negocioId, { razon: e.target.value })}
                    placeholder="Motivo visible para soporte interno"
                  />
                </label>
              </div>

              <p className="cfg-sus-card-note">
                Los cambios de estado solo los puede guardar el superadministrador. Un negocio
                bloqueado o suspendido no entra a modulos operativos.
              </p>

              <div className="cfg-sus-card-actions">
                <button
                  type="button"
                  className="emp-btn emp-btn-soft"
                  onClick={() => actualizarConteosNegocio(negocio.negocioId)}
                  disabled={savingId === negocio.negocioId}
                >
                  Actualizar conteos
                </button>
                {negocio.sintetizado ? (
                  <button
                    type="button"
                    className="emp-btn emp-btn-soft"
                    onClick={() => crearRegistroNegocio(negocio)}
                    disabled={savingId === negocio.negocioId}
                  >
                    Crear registro
                  </button>
                ) : null}
                <button
                  type="button"
                  className="emp-btn emp-btn-primary"
                  onClick={() => guardarEstado(negocio)}
                  disabled={savingId === negocio.negocioId}
                >
                  {savingId === negocio.negocioId ? "Guardando..." : "Guardar estado"}
                </button>
                <button
                  type="button"
                  className="emp-btn emp-btn-danger"
                  onClick={() => abrirEliminarNegocio(negocio)}
                  disabled={savingId === negocio.negocioId}
                >
                  Eliminar negocio
                </button>
              </div>
            </article>
          );
        })}

        {negociosConConteos.length === 0 && (
          <div className="cfg-grid-empty">
            Todavia no hay negocios registrados en la coleccion negocios.
          </div>
        )}
      </div>

      {deleteTarget ? (
        <div className="cfg-business-delete-backdrop" role="dialog" aria-modal="true">
          <div className="cfg-business-delete-modal">
            <span className="cfg-sus-model-kicker">Aviso importante</span>
            <h2>Eliminar negocio y sus datos</h2>
            <p>
              Esta accion eliminara documentos de Firestore relacionados con este negocio:
              usuarios autorizados, empleados, clientes, productos, proveedores, ventas,
              cortes, egresos, servicios, sesiones, configuracion y terminos aceptados.
            </p>
            <p>
              No elimina automaticamente usuarios de Firebase Authentication. Si necesitas
              limpiar esas cuentas de acceso, hazlo despues desde Firebase Console o Admin SDK.
            </p>

            <div className="cfg-business-delete-summary">
              <strong>{deleteTarget.nombre}</strong>
              <span>{deleteTarget.negocioId}</span>
            </div>

            <label className="emp-field">
              <span>Razon o nota de eliminacion</span>
              <textarea
                rows={3}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Ej. negocio duplicado, prueba interna, solicitud del titular..."
              />
            </label>

            <label className="emp-field">
              <span>Para confirmar escribe: {deleteTarget.nombre || deleteTarget.negocioId}</span>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget.nombre || deleteTarget.negocioId}
              />
            </label>

            {deleteError ? <div className="cfg-sus-feedback error">{deleteError}</div> : null}

            <div className="cfg-sus-card-actions cfg-business-delete-actions">
              <button type="button" className="emp-btn emp-btn-soft" onClick={cerrarEliminarNegocio}>
                Cancelar
              </button>
              <button
                type="button"
                className="emp-btn emp-btn-danger"
                onClick={confirmarEliminarNegocio}
                disabled={savingId === deleteTarget.negocioId}
              >
                {savingId === deleteTarget.negocioId ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
