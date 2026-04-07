import { useEffect, useMemo, useState } from "react";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, createSecondaryAuthClient, db } from "../initializer/firebase";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import {
  getCreateAccountErrorMessage,
  getStoredEmailValue,
  normalizeEmailValue,
} from "../js/services/account_identity";
import { permisosBasePorRol } from "../js/services/permisos";
import {
  DEFAULT_DIAS_GRACIA,
  SUSCRIPCION_INTERVALOS,
  SUSCRIPCION_METODOS_PAGO,
  evaluarSuscripcion,
  formatDateShort,
  getMetodoPagoSuscripcionLabel,
  toDateInputValue,
} from "../js/services/suscripciones";

function createInitialForm() {
  return {
    nombre: "",
    telefono: "",
    correo: "",
    password: "",
    planNombre: "Mensual",
    metodoPago: "transferencia",
    monto: "",
    fechaUltimoPago: toDateInputValue(new Date()),
    intervaloCantidad: 1,
    intervaloUnidad: "mes",
    diasGracia: DEFAULT_DIAS_GRACIA,
    dispositivosTitularPermitidos: 1,
    notas: "",
    activa: true,
  };
}

function statusClassName(codigo = "") {
  if (codigo === "al_corriente") return "status-al-corriente";
  if (codigo === "en_gracia") return "status-en-gracia";
  if (codigo === "bloqueada" || codigo === "bloqueada_manual") return "status-bloqueada";
  return "status-pendiente";
}

export default function ConfiguracionSuscripciones() {
  const { loading, uid: currentUid, superAdmin } = useAutorizacionActual();
  const [suscripciones, setSuscripciones] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUid, setEditingUid] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [form, setForm] = useState(createInitialForm());

  useEffect(() => {
    const unsubSuscripciones = onSnapshot(
      collection(db, "suscripciones"),
      (snapshot) => {
        const lista = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setSuscripciones(lista);
      },
      () => setSuscripciones([]),
    );

    const unsubEmpleados = onSnapshot(
      collection(db, "empleados"),
      (snapshot) => {
        const lista = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setEmpleados(lista);
      },
      () => setEmpleados([]),
    );

    return () => {
      unsubSuscripciones();
      unsubEmpleados();
    };
  }, []);

  const empleadosPorCuenta = useMemo(() => {
    const map = {};
    empleados.forEach((emp) => {
      const owner = String(emp?.cuentaPrincipalUid || emp?.uid || "").trim();
      if (!owner) return;
      if (emp?.esCuentaPrincipal === true) {
        if (!map[owner]) map[owner] = 0;
        return;
      }
      map[owner] = (map[owner] || 0) + 1;
    });
    return map;
  }, [empleados]);

  const cuentas = useMemo(() => {
    return suscripciones
      .map((item) => {
        const estado = evaluarSuscripcion(item);
        return {
          ...item,
          estado,
          empleadosCount: empleadosPorCuenta[item.id] || 0,
        };
      })
      .sort((a, b) => {
        const rank = {
          bloqueada: 0,
          bloqueada_manual: 0,
          en_gracia: 1,
          pendiente_configuracion: 2,
          al_corriente: 3,
        };
        return (rank[a.estado.codigo] ?? 99) - (rank[b.estado.codigo] ?? 99);
      });
  }, [empleadosPorCuenta, suscripciones]);

  const resumen = useMemo(() => {
    return cuentas.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.empleados += item.empleadosCount;

        if (item.estado.codigo === "al_corriente") acc.alCorriente += 1;
        else if (item.estado.codigo === "en_gracia") acc.enGracia += 1;
        else if (["bloqueada", "bloqueada_manual"].includes(item.estado.codigo)) acc.bloqueadas += 1;
        else acc.pendientes += 1;

        return acc;
      },
      {
        total: 0,
        alCorriente: 0,
        enGracia: 0,
        bloqueadas: 0,
        pendientes: 0,
        empleados: 0,
      },
    );
  }, [cuentas]);

  const showEmptyState = cuentas.length === 0 && !showForm;

  const cerrarFormulario = () => {
    setEditingUid("");
    setForm(createInitialForm());
    setShowForm(false);
  };

  const handleNew = () => {
    setFeedback({ type: "", message: "" });
    setEditingUid("");
    setForm(createInitialForm());
    setShowForm(true);
  };

  const handleEdit = (item) => {
    setFeedback({ type: "", message: "" });
    setEditingUid(item.id);
    setForm({
      nombre: item.titularNombre || "",
      telefono: item.telefono || "",
      correo: item.correo || "",
      password: "",
      planNombre: item.planNombre || "Mensual",
      metodoPago: item.metodoPago || "transferencia",
      monto: item.monto ?? "",
      fechaUltimoPago: toDateInputValue(item.fechaUltimoPago),
      intervaloCantidad: item.intervaloCantidad || 1,
      intervaloUnidad: item.intervaloUnidad || "mes",
      diasGracia: item.diasGracia ?? DEFAULT_DIAS_GRACIA,
      dispositivosTitularPermitidos: item.dispositivosTitularPermitidos || 1,
      notas: item.notas || "",
      activa: item.activa !== false,
    });
    setShowForm(true);
  };

  const saveSubscriptionDocument = (targetUid) => {
    const correoNormalizado = normalizeEmailValue(form.correo);
    return setDoc(
      doc(db, "suscripciones", targetUid),
      {
        cuentaPrincipalUid: targetUid,
        titularNombre: String(form.nombre || "").trim(),
        telefono: String(form.telefono || "").trim(),
        correo: String(form.correo || "").trim(),
        correoNormalizado,
        planNombre: String(form.planNombre || "").trim(),
        metodoPago: String(form.metodoPago || "").trim(),
        monto: Number(form.monto || 0),
        fechaUltimoPago: form.fechaUltimoPago ? new Date(`${form.fechaUltimoPago}T12:00:00`) : null,
        intervaloCantidad: Number(form.intervaloCantidad || 1),
        intervaloUnidad: form.intervaloUnidad || "mes",
        diasGracia: Number(form.diasGracia || DEFAULT_DIAS_GRACIA),
        dispositivosTitularPermitidos: Math.max(
          1,
          Number(form.dispositivosTitularPermitidos || 1) || 1,
        ),
        notas: String(form.notas || "").trim(),
        activa: form.activa !== false,
        updatedAt: new Date(),
        updatedByUid: currentUid || null,
      },
      { merge: true },
    );
  };

  const handleSubmit = async () => {
    if (saving) return;
    const correoNormalizado = normalizeEmailValue(form.correo);

    if (!form.nombre || !form.correo || !form.fechaUltimoPago) {
      setFeedback({
        type: "error",
        message: "Nombre, correo y fecha del ultimo pago son obligatorios.",
      });
      return;
    }

    if (!correoNormalizado) {
      setFeedback({
        type: "error",
        message: "Debes capturar un correo valido para la cuenta principal.",
      });
      return;
    }

    if (!editingUid && !form.password) {
      setFeedback({
        type: "error",
        message: "Debes definir una contrasena para la cuenta principal.",
      });
      return;
    }

    setSaving(true);
    setFeedback({ type: "", message: "" });
    const adminSesion = auth.currentUser;

    try {
      const permisosAdmin = permisosBasePorRol("Administrador");

      if (editingUid) {
        const batch = writeBatch(db);
        const principalEmpleado = empleados.find((emp) => emp?.uid === editingUid);

        batch.set(
          doc(db, "autorizados", editingUid),
          {
            activo: true,
            rol: "Administrador",
            nombre: String(form.nombre || "").trim(),
            correo: String(form.correo || "").trim(),
            correoNormalizado,
            permisos: permisosAdmin,
            cuentaPrincipalUid: editingUid,
            suscripcionControlada: true,
            esCuentaPrincipal: true,
          },
          { merge: true },
        );

        if (principalEmpleado?.id) {
          batch.update(doc(db, "empleados", principalEmpleado.id), {
            nombre: String(form.nombre || "").trim(),
            telefono: String(form.telefono || "").trim(),
            estado: "Activo",
            permisos: permisosAdmin,
          });
        }

        await batch.commit();
        await saveSubscriptionDocument(editingUid);
        setFeedback({ type: "success", message: "Suscripcion actualizada correctamente." });
      } else {
        const existingSubscription = suscripciones.find(
          (item) => getStoredEmailValue(item) === correoNormalizado,
        );
        const existingEmployee = empleados.find(
          (emp) => getStoredEmailValue(emp) === correoNormalizado,
        );

        if (existingSubscription || existingEmployee) {
          setFeedback({
            type: "error",
            message:
              "Ese correo ya pertenece a una cuenta registrada. Usa otro correo o edita la cuenta existente.",
          });
          return;
        }

        const secondaryClient = createSecondaryAuthClient();
        let uid = "";

        try {
          const userCredential = await createUserWithEmailAndPassword(
            secondaryClient.auth,
            String(form.correo || "").trim(),
            form.password,
          );
          uid = userCredential.user.uid;
        } finally {
          await signOut(secondaryClient.auth).catch(() => {});
          await secondaryClient.dispose();
        }

        const batch = writeBatch(db);
        const empleadoRef = doc(collection(db, "empleados"));

        batch.set(empleadoRef, {
          uid,
          nombre: String(form.nombre || "").trim(),
          telefono: String(form.telefono || "").trim(),
          correo: String(form.correo || "").trim(),
          correoNormalizado,
          rol: "Administrador",
          estado: "Activo",
          permisos: permisosAdmin,
          superAdmin: false,
          esCuentaPrincipal: true,
          cuentaPrincipalUid: uid,
          suscripcionControlada: true,
          createdAt: new Date(),
          createdByUid: currentUid || null,
        });

        batch.set(doc(db, "autorizados", uid), {
          activo: true,
          rol: "Administrador",
          permisos: permisosAdmin,
          superAdmin: false,
          nombre: String(form.nombre || "").trim(),
          correo: String(form.correo || "").trim(),
          correoNormalizado,
          cuentaPrincipalUid: uid,
          suscripcionControlada: true,
          esCuentaPrincipal: true,
          createdByUid: currentUid || null,
        });

        await batch.commit();
        await saveSubscriptionDocument(uid);

        setFeedback({ type: "success", message: "Cuenta principal registrada correctamente." });
      }

      cerrarFormulario();
    } catch (error) {
      setFeedback({
        type: "error",
        message: getCreateAccountErrorMessage(error, "cuenta"),
      });
    } finally {
      if (adminSesion && auth.currentUser?.uid !== adminSesion.uid) {
        await auth.updateCurrentUser(adminSesion).catch(() => {});
      }
      setSaving(false);
    }
  };

  const handleRegistrarPago = async (item) => {
    try {
      await updateDoc(doc(db, "suscripciones", item.id), {
        fechaUltimoPago: new Date(),
        activa: true,
        updatedAt: new Date(),
        updatedByUid: currentUid || null,
      });
      setFeedback({
        type: "success",
        message: `Pago registrado para ${item.titularNombre || item.correo || "la cuenta"}.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo registrar el pago.",
      });
    }
  };

  const handleToggleBloqueo = async (item) => {
    try {
      await updateDoc(doc(db, "suscripciones", item.id), {
        activa: item.activa === false,
        updatedAt: new Date(),
        updatedByUid: currentUid || null,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo actualizar el estado de la cuenta.",
      });
    }
  };

  if (loading) {
    return (
      <div className="cfg-sus-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Suscripciones</h2>
          <p>Cargando permisos del usuario...</p>
        </div>
      </div>
    );
  }

  if (!superAdmin) {
    return (
      <div className="cfg-sus-wrap">
        <div className="cfg-pos-card cfg-sus-guard-card">
          <h2>Suscripciones</h2>
          <p>Solo el Super Administrador puede administrar las cuentas principales del sistema.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cfg-sus-wrap">
      <div className="cfg-header">
        <h1>Suscripciones</h1>
        <p>
          Registra cuentas principales, define cada cuanto pagan y bloquea el acceso
          automaticamente despues del lapso de gracia.
        </p>
      </div>

      <div className="cfg-pos-card cfg-sus-model-card">
        <div className="cfg-sus-model-head">
          <div>
            <span className="cfg-sus-model-kicker">Como funciona</span>
            <h2>Una cuenta pagadora = un negocio aislado</h2>
            <p>
              Cada cuenta principal entra a su propio espacio. Solo ve sus clientes, servicios,
              ventas, configuracion y empleados. Si crea empleados, ellos comparten unicamente la
              informacion de ese mismo negocio.
            </p>
          </div>
        </div>
        <div className="cfg-sus-model-points">
          <span>Datos separados por cuenta principal</span>
          <span>Empleados ligados solo a su negocio</span>
          <span>Bloqueo automatico cuando vence el pago</span>
          <span>Control de equipos simultaneos del titular</span>
        </div>
      </div>

      <div className="cfg-sus-summary-grid">
        <div className="cfg-sus-summary-card">
          <span>Cuentas</span>
          <strong>{resumen.total}</strong>
          <small>Total de clientes administrados desde este panel.</small>
        </div>
        <div className="cfg-sus-summary-card">
          <span>Al corriente</span>
          <strong>{resumen.alCorriente}</strong>
          <small>Cuentas sin atraso al dia de hoy.</small>
        </div>
        <div className="cfg-sus-summary-card">
          <span>En gracia</span>
          <strong>{resumen.enGracia}</strong>
          <small>Cuentas vencidas pero todavia con acceso.</small>
        </div>
        <div className="cfg-sus-summary-card">
          <span>Bloqueadas</span>
          <strong>{resumen.bloqueadas}</strong>
          <small>Cuentas sin acceso por falta de pago o bloqueo manual.</small>
        </div>
      </div>

      <div className="cfg-pos-card cfg-sus-toolbar-card">
        <div className="cfg-sus-toolbar">
          <div className="cfg-sus-toolbar-copy">
            <h2>Control de cobro</h2>
            <p>
              Cada cuenta principal puede crear empleados. Si la suscripcion vence y supera
              la gracia, el acceso del titular y sus empleados se niega en la app.
            </p>
          </div>
          <button
            type="button"
            className="emp-btn emp-btn-primary cfg-sus-cta-btn"
            onClick={handleNew}
          >
            + Nueva suscripcion
          </button>
        </div>

        {feedback.message ? (
          <div className={`cfg-sus-feedback ${feedback.type || ""}`}>
            {feedback.message}
          </div>
        ) : null}
      </div>

      {showForm && (
        <div className="cfg-pos-card cfg-sus-form-card">
          <div className="cfg-sus-form-head">
            <div>
              <h2>{editingUid ? "Editar suscripcion" : "Registrar cuenta principal"}</h2>
              <p>
                La cuenta principal entra como Administrador del sistema de su negocio y
                despues podra dar de alta a sus propios empleados.
              </p>
            </div>
          </div>

          <div className="cfg-sus-form-grid">
            <label className="emp-field">
              <span>Nombre del titular</span>
              <input
                value={form.nombre}
                onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre completo"
              />
            </label>

            <label className="emp-field">
              <span>Telefono</span>
              <input
                value={form.telefono}
                onChange={(e) => {
                  const soloNumeros = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setForm((prev) => ({ ...prev, telefono: soloNumeros }));
                }}
                placeholder="10 digitos"
              />
            </label>

            <label className="emp-field">
              <span>Correo de acceso</span>
              <input
                value={form.correo}
                disabled={!!editingUid}
                onChange={(e) => setForm((prev) => ({ ...prev, correo: e.target.value }))}
                placeholder="correo@dominio.com"
              />
            </label>

            {!editingUid && (
              <label className="emp-field">
                <span>Contrasena inicial</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Minimo 6 caracteres"
                />
              </label>
            )}

            <label className="emp-field">
              <span>Suscripcion</span>
              <input
                value={form.planNombre}
                onChange={(e) => setForm((prev) => ({ ...prev, planNombre: e.target.value }))}
                placeholder="Mensual, Premium, Basico..."
              />
            </label>

            <label className="emp-field">
              <span>Metodo de pago</span>
              <select
                value={form.metodoPago}
                onChange={(e) => setForm((prev) => ({ ...prev, metodoPago: e.target.value }))}
              >
                {SUSCRIPCION_METODOS_PAGO.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="emp-field">
              <span>Monto</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm((prev) => ({ ...prev, monto: e.target.value }))}
                placeholder="400"
              />
            </label>

            <label className="emp-field">
              <span>Ultimo pago</span>
              <input
                type="date"
                value={form.fechaUltimoPago}
                onChange={(e) => setForm((prev) => ({ ...prev, fechaUltimoPago: e.target.value }))}
              />
            </label>

            <label className="emp-field">
              <span>Cada cuanto paga</span>
              <input
                type="number"
                min="1"
                value={form.intervaloCantidad}
                onChange={(e) => setForm((prev) => ({ ...prev, intervaloCantidad: e.target.value }))}
              />
            </label>

            <label className="emp-field">
              <span>Unidad</span>
              <select
                value={form.intervaloUnidad}
                onChange={(e) => setForm((prev) => ({ ...prev, intervaloUnidad: e.target.value }))}
              >
                {SUSCRIPCION_INTERVALOS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="emp-field">
              <span>Dias de gracia</span>
              <input
                type="number"
                min="0"
                value={form.diasGracia}
                onChange={(e) => setForm((prev) => ({ ...prev, diasGracia: e.target.value }))}
              />
            </label>

            <label className="emp-field">
              <span>Equipos simultaneos del titular</span>
              <input
                type="number"
                min="1"
                value={form.dispositivosTitularPermitidos}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    dispositivosTitularPermitidos: e.target.value,
                  }))
                }
              />
              <small className="cfg-sus-field-help">
                Por defecto se incluye 1 equipo. Si te paga extra, aqui le autorizas abrir otro dispositivo.
              </small>
            </label>

            <label className="emp-field cfg-sus-checkbox-field">
              <span>Estado manual</span>
              <div className="emp-super-admin-box">
                <input
                  type="checkbox"
                  checked={form.activa === true}
                  onChange={(e) => setForm((prev) => ({ ...prev, activa: e.target.checked }))}
                />
                <div>
                  <strong>{form.activa ? "Cuenta habilitada" : "Cuenta bloqueada manualmente"}</strong>
                  <small>
                    Si la desactivas aqui, el titular y sus empleados ya no podran entrar aunque
                    esten dentro del periodo de gracia.
                  </small>
                </div>
              </div>
            </label>

            <label className="emp-field cfg-sus-form-wide">
              <span>Notas</span>
              <textarea
                rows={3}
                value={form.notas}
                onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))}
                placeholder="Observaciones del cobro o del cliente"
              />
            </label>
          </div>

          <div className="emp-form-actions">
            <button className="emp-btn emp-btn-soft" type="button" onClick={cerrarFormulario}>
              Cancelar
            </button>
            <button
              className="emp-btn emp-btn-primary"
              type="button"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {showEmptyState && (
        <div className="cfg-pos-card cfg-sus-empty-card">
          <span className="cfg-sus-empty-kicker">Sin cuentas registradas</span>
          <h2>Da de alta tu primera cuenta principal</h2>
          <p>
            Desde aqui registras al usuario que paga. Ese cliente tendra su propia
            configuracion, sus empleados y todos sus datos separados del resto.
          </p>
          <div className="cfg-sus-empty-points">
            <span>Clientes y ventas separados</span>
            <span>Servicios y configuracion propios</span>
            <span>Empleados heredando la misma cuenta</span>
          </div>
          <div className="cfg-sus-empty-actions">
            <button
              type="button"
              className="emp-btn emp-btn-primary cfg-sus-empty-btn"
              onClick={handleNew}
            >
              Registrar primera suscripcion
            </button>
          </div>
        </div>
      )}

      <div className="cfg-sus-list-grid">
        {cuentas.map((item) => (
          <article key={item.id} className="cfg-sus-card">
            <div className="cfg-sus-card-head">
              <div>
                <h3>{item.titularNombre || "Sin nombre"}</h3>
                <p>{item.correo || "Sin correo registrado"}</p>
              </div>
              <span className={`cfg-sus-status ${statusClassName(item.estado.codigo)}`}>
                {item.estado.etiqueta}
              </span>
            </div>

            <div className="cfg-sus-card-grid">
              <div>
                <span className="cfg-proveedores-label">Suscripcion</span>
                <p>{item.planNombre || "Sin definir"}</p>
              </div>
              <div>
                <span className="cfg-proveedores-label">Metodo de pago</span>
                <p>{getMetodoPagoSuscripcionLabel(item.metodoPago)}</p>
              </div>
              <div>
                <span className="cfg-proveedores-label">Monto</span>
                <p>${Number(item.monto || 0).toFixed(2)}</p>
              </div>
              <div>
                <span className="cfg-proveedores-label">Ultimo pago</span>
                <p>{formatDateShort(item.fechaUltimoPago)}</p>
              </div>
              <div>
                <span className="cfg-proveedores-label">Proximo pago</span>
                <p>{formatDateShort(item.estado.proximoPago)}</p>
              </div>
              <div>
                <span className="cfg-proveedores-label">Gracia hasta</span>
                <p>{formatDateShort(item.estado.graciaHasta)}</p>
              </div>
              <div>
                <span className="cfg-proveedores-label">Equipos titular</span>
                <p>{item.dispositivosTitularPermitidos || 1}</p>
              </div>
              <div>
                <span className="cfg-proveedores-label">Empleados</span>
                <p>{item.empleadosCount}</p>
              </div>
            </div>

            <p className="cfg-sus-card-note">{item.estado.detalle}</p>

            <div className="cfg-sus-card-actions">
              <button type="button" className="emp-btn emp-btn-soft" onClick={() => handleEdit(item)}>
                Editar
              </button>
              <button
                type="button"
                className="emp-btn emp-btn-primary"
                onClick={() => handleRegistrarPago(item)}
              >
                Registrar pago
              </button>
              <button
                type="button"
                className={`emp-btn ${item.activa === false ? "emp-btn-primary" : "emp-btn-danger"}`}
                onClick={() => handleToggleBloqueo(item)}
              >
                {item.activa === false ? "Reactivar" : "Bloquear"}
              </button>
            </div>
          </article>
        ))}

        {cuentas.length === 0 && showForm && (
          <div className="cfg-grid-empty">
            Cuando registres una cuenta principal, aparecera aqui su estado de cobro.
          </div>
        )}
      </div>
    </div>
  );
}
