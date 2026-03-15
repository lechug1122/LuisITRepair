import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "../initializer/firebase";
import "../css/empleados.css";
import {
  PERMISOS_CATALOGO,
  normalizarPermisos,
  permisosBasePorRol,
  tienePermiso,
} from "../js/services/permisos";

// Crea la estructura base del formulario para altas y ediciones.
function createInitialForm() {
  return {
    nombre: "",
    telefono: "",
    correo: "",
    rol: "",
    estado: "Activo",
    password: "",
    superAdmin: false,
    permisos: permisosBasePorRol(""),
  };
}

function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [puedeGestionarActual, setPuedeGestionarActual] = useState(false);
  const [esSuperAdminActual, setEsSuperAdminActual] = useState(false);
  const [showPermisosModal, setShowPermisosModal] = useState(false);
  const [form, setForm] = useState(createInitialForm());
  const [permisosDraft, setPermisosDraft] = useState(permisosBasePorRol(""));
  const currentUid = auth.currentUser?.uid || null;
  const empleadoEditado = useMemo(
    () => empleados.find((e) => e.id === editingId) || null,
    [empleados, editingId],
  );
  const superAdminAsignado = useMemo(
    () => empleados.find((emp) => emp.superAdmin === true) || null,
    [empleados],
  );
  // Calcula si el usuario actual puede asignar o transferir el rol de Super Admin.
  const puedeAsignarSuperAdmin = (() => {
    if (form.rol !== "Administrador") return false;
    if (!superAdminAsignado?.uid) return true;
    if (empleadoEditado?.uid && superAdminAsignado.uid === empleadoEditado.uid) return true;
    return esSuperAdminActual;
  })();
  const editaSuPropioCargoSuperAdmin = useMemo(
    () =>
      !!empleadoEditado?.uid &&
      empleadoEditado.uid === currentUid &&
      empleadoEditado.superAdmin === true,
    [currentUid, empleadoEditado],
  );

  const permisosActivos = useMemo(
    () => PERMISOS_CATALOGO.filter((p) => !!form.permisos?.[p.key]),
    [form.permisos],
  );

  const permisosActivosDraft = useMemo(
    () => PERMISOS_CATALOGO.filter((p) => !!permisosDraft?.[p.key]),
    [permisosDraft],
  );

  useEffect(() => {
    const obtenerRol = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "autorizados", uid));
      if (!snap.exists()) return;

      const data = snap.data();
      setPuedeGestionarActual(
        tienePermiso(data.rol || "", data.permisos || {}, "empleados.gestionar"),
      );
      setEsSuperAdminActual(data?.superAdmin === true);
    };

    obtenerRol();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "empleados"), (snapshot) => {
      const lista = snapshot.docs.map((row) => ({ id: row.id, ...row.data() }));
      setEmpleados(lista);
    }, (error) => {
      console.warn(
        "[empleados] No se pudo suscribir a la coleccion empleados:",
        error?.code || error,
      );
      setEmpleados([]);
    });

    return () => unsub();
  }, []);

  // Restablece el formulario y cierra el modal principal.
  const cerrarFormulario = () => {
    setShowPermisosModal(false);
    setEditingId(null);
    setForm(createInitialForm());
    setPermisosDraft(permisosBasePorRol(""));
    setShowForm(false);
  };

  const handleRolChange = (nextRol) => {
    setForm((prev) => {
      const permisos = normalizarPermisos(nextRol, prev.permisos);
      return {
        ...prev,
        rol: nextRol,
        permisos,
        superAdmin: nextRol === "Administrador" ? prev.superAdmin : false,
      };
    });
  };

  const handleNew = () => {
    setEditingId(null);
    setForm(createInitialForm());
    setPermisosDraft(permisosBasePorRol(""));
    setShowPermisosModal(false);
    setShowForm(true);
  };

  const handleEdit = (emp) => {
    const permisos = normalizarPermisos(emp.rol || "", emp.permisos || {});
    setForm({
      nombre: emp.nombre || "",
      telefono: emp.telefono || "",
      correo: emp.correo || "",
      rol: emp.rol || "",
      estado: emp.estado || "Activo",
      password: "",
      superAdmin: emp.superAdmin === true,
      permisos,
    });
    setPermisosDraft(permisos);
    setEditingId(emp.id);
    setShowPermisosModal(false);
    setShowForm(true);
  };

  const abrirPermisosModal = () => {
    setPermisosDraft(normalizarPermisos(form.rol, form.permisos || {}));
    setShowPermisosModal(true);
  };

  const cerrarPermisosModal = () => {
    setShowPermisosModal(false);
  };

  const togglePermisoDraft = (key) => {
    setPermisosDraft((prev) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
  };

  const aplicarPermisos = () => {
    setForm((prev) => ({
      ...prev,
      permisos: normalizarPermisos(prev.rol, permisosDraft),
    }));
    setShowPermisosModal(false);
  };

  const cargarBasePorRolEnModal = () => {
    setPermisosDraft(permisosBasePorRol(form.rol));
  };

  // Guarda un empleado nuevo o actualiza uno existente con sus permisos.
  const handleSubmit = async () => {
    try {
      if (!form.nombre || !form.correo || !form.rol || (!editingId && !form.password)) {
        alert("Completa los campos obligatorios");
        return;
      }

      const permisosFinal = normalizarPermisos(form.rol, form.permisos || {});
      const quiereSuperAdmin = form.rol === "Administrador" && form.superAdmin === true;

      if (editingId) {
        if (!empleadoEditado?.uid) {
          alert("No se encontro el usuario a editar.");
          return;
        }

        if (editaSuPropioCargoSuperAdmin && !quiereSuperAdmin) {
          alert(
            "El Super Administrador actual no puede quitarse el cargo a si mismo. Primero debe asignarlo a otro administrador.",
          );
          return;
        }

        if (
          quiereSuperAdmin &&
          superAdminAsignado?.uid &&
          superAdminAsignado.uid !== empleadoEditado.uid &&
          !esSuperAdminActual
        ) {
          alert("Solo el Super Administrador actual puede transferir ese cargo.");
          return;
        }

        const batch = writeBatch(db);
        batch.update(doc(db, "empleados", editingId), {
          nombre: form.nombre,
          telefono: form.telefono,
          rol: form.rol,
          estado: form.estado,
          permisos: permisosFinal,
          superAdmin: quiereSuperAdmin,
        });

        batch.update(doc(db, "autorizados", empleadoEditado.uid), {
          rol: form.rol,
          activo: form.estado === "Activo",
          permisos: permisosFinal,
          superAdmin: quiereSuperAdmin,
          nombre: form.nombre,
        });

        if (quiereSuperAdmin) {
          empleados
            .filter((emp) => emp.superAdmin === true && emp.uid !== empleadoEditado.uid)
            .forEach((emp) => {
              batch.update(doc(db, "empleados", emp.id), { superAdmin: false });
              if (emp.uid) batch.update(doc(db, "autorizados", emp.uid), { superAdmin: false });
            });
        }

        await batch.commit();
      } else {
        const adminActual = auth.currentUser;
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          form.correo,
          form.password,
        );
        const uid = userCredential.user.uid;

        if (quiereSuperAdmin && superAdminAsignado?.uid && !esSuperAdminActual) {
          await auth.updateCurrentUser(adminActual);
          alert("Ya existe un Super Administrador. Solo el actual puede transferir ese cargo.");
          return;
        }

        const batch = writeBatch(db);
        const empRef = doc(collection(db, "empleados"));

        batch.set(empRef, {
          uid,
          nombre: form.nombre,
          telefono: form.telefono,
          correo: form.correo,
          rol: form.rol,
          estado: form.estado,
          permisos: permisosFinal,
          superAdmin: quiereSuperAdmin,
          createdAt: new Date(),
        });

        batch.set(doc(db, "autorizados", uid), {
          activo: form.estado === "Activo",
          rol: form.rol,
          permisos: permisosFinal,
          superAdmin: quiereSuperAdmin,
          nombre: form.nombre,
        });

        if (quiereSuperAdmin) {
          empleados
            .filter((emp) => emp.superAdmin === true && emp.uid !== uid)
            .forEach((emp) => {
              batch.update(doc(db, "empleados", emp.id), { superAdmin: false });
              if (emp.uid) batch.update(doc(db, "autorizados", emp.uid), { superAdmin: false });
            });
        }

        await batch.commit();

        await auth.updateCurrentUser(adminActual);
      }

      cerrarFormulario();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDelete = async (emp) => {
    if (!window.confirm("Eliminar empleado?")) return;

    const currentUid = auth.currentUser?.uid;
    if (emp.uid === currentUid) {
      alert("No puedes eliminar tu propia cuenta.");
      return;
    }

    if (emp.superAdmin) {
      alert("No puedes eliminar al Super Administrador. Transfiere el cargo primero.");
      return;
    }

    await deleteDoc(doc(db, "empleados", emp.id));
    await deleteDoc(doc(db, "autorizados", emp.uid));
  };

  // Envia un correo de restablecimiento de contrasena al empleado seleccionado.
  const handleResetPassword = async (emp) => {
    if (!emp?.correo) {
      alert("Este empleado no tiene correo registrado.");
      return;
    }

    if (!window.confirm(`Enviar enlace para restablecer contrasena a ${emp.correo}?`)) return;

    try {
      await sendPasswordResetEmail(auth, emp.correo);
      await updateDoc(doc(db, "empleados", emp.id), {
        passwordResetRequestedAt: new Date(),
        passwordResetRequestedBy: auth.currentUser?.uid || null,
      });
      alert("Se envio el correo para restablecer la contrasena.");
    } catch (error) {
      alert(error?.message || "No se pudo enviar el correo.");
    }
  };

  return (
    <div className="emp-container">
      <div className="emp-header">
        <div>
          <h1>Gestion de Empleados</h1>
          <p className="emp-subtitle">
            Administra usuarios, roles y accesos del sistema.
          </p>
        </div>

        {puedeGestionarActual && (
          <button className="emp-btn emp-btn-primary" onClick={handleNew}>
            + Nuevo Empleado
          </button>
        )}
      </div>

      {showForm && puedeGestionarActual && (
        <div className="emp-form-card">
          <div className="emp-form-head">
            <h2>{editingId ? "Editar Empleado" : "Registrar Empleado"}</h2>
            <button className="emp-btn emp-btn-soft" type="button" onClick={abrirPermisosModal}>
              Checks de acceso ({permisosActivos.length})
            </button>
          </div>

          <div className="emp-form-grid">
            <label className="emp-field">
              <span>Nombre</span>
              <input
                placeholder="Nombre completo"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>

            <label className="emp-field">
              <span>Telefono</span>
              <input
                type="tel"
                placeholder="10 digitos"
                value={form.telefono}
                maxLength={10}
                onChange={(e) => {
                  const soloNumeros = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setForm({ ...form, telefono: soloNumeros });
                }}
              />
            </label>

            <label className="emp-field">
              <span>Correo</span>
              <input
                placeholder="correo@dominio.com"
                value={form.correo}
                disabled={!!editingId}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
              />
            </label>

            {!editingId && (
              <label className="emp-field">
                <span>Contrasena</span>
                <input
                  type="password"
                  placeholder="Minimo 6 caracteres"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </label>
            )}

            <label className="emp-field">
              <span>Rol</span>
              <select value={form.rol} onChange={(e) => handleRolChange(e.target.value)}>
                <option value="">Seleccionar rol</option>
                <option>Administrador</option>
                <option>Tecnico</option>
                <option>Vendedor</option>
                <option>Cajero</option>
              </select>
            </label>

            <label className="emp-field">
              <span>Estado</span>
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
              >
                <option>Activo</option>
                <option>Inactivo</option>
              </select>
            </label>

            <label className="emp-field">
              <span>Super Administrador</span>
              <div className="emp-super-admin-box">
                <input
                  type="checkbox"
                  checked={form.superAdmin === true}
                  disabled={!puedeAsignarSuperAdmin || editaSuPropioCargoSuperAdmin}
                  onChange={(e) => setForm({ ...form, superAdmin: e.target.checked })}
                />
                <div>
                  <strong>Asignar como jefe del sistema</strong>
                  <small>
                    Solo puede existir uno a la vez.
                    {superAdminAsignado?.nombre ? ` Actual: ${superAdminAsignado.nombre}.` : ""}
                    {editaSuPropioCargoSuperAdmin
                      ? " Para cambiarlo debes transferir el cargo editando a otro administrador."
                      : ""}
                  </small>
                </div>
              </div>
            </label>
          </div>

          <div className="emp-permisos-summary">
            {permisosActivos.length === 0 && <span>Sin permisos personalizados.</span>}
            {permisosActivos.slice(0, 5).map((perm) => (
              <span key={perm.key} className="emp-perm-chip">
                {perm.label}
              </span>
            ))}
            {permisosActivos.length > 5 && (
              <span className="emp-perm-chip">+{permisosActivos.length - 5} mas</span>
            )}
          </div>

          <div className="emp-form-actions">
            <button className="emp-btn emp-btn-soft" onClick={cerrarFormulario}>
              Cancelar
            </button>

            <button className="emp-btn emp-btn-primary" onClick={handleSubmit}>
              Guardar
            </button>
          </div>
        </div>
      )}

      {showPermisosModal && (
        <div className="emp-modal-overlay" onClick={cerrarPermisosModal}>
          <div className="emp-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="emp-modal-head">
              <div>
                <h3>Checks de acceso</h3>
                <p>Define lo que este empleado puede hacer en el sistema.</p>
              </div>
              <div className="emp-modal-head-actions">
                <button
                  className="emp-btn emp-btn-soft"
                  type="button"
                  onClick={cargarBasePorRolEnModal}
                >
                  Cargar base por rol
                </button>
                <button
                  className="emp-btn emp-btn-icon"
                  type="button"
                  onClick={cerrarPermisosModal}
                >
                  X
                </button>
              </div>
            </div>

            <div className="emp-permisos-grid">
              {PERMISOS_CATALOGO.map((perm) => (
                <label key={perm.key} className="emp-perm-item">
                  <input
                    type="checkbox"
                    checked={!!permisosDraft?.[perm.key]}
                    onChange={() => togglePermisoDraft(perm.key)}
                  />
                  <div>
                    <strong>{perm.label}</strong>
                    <small>{perm.description}</small>
                  </div>
                </label>
              ))}
            </div>

            <div className="emp-modal-actions">
              <span>{permisosActivosDraft.length} permisos activos</span>
              <div className="emp-modal-buttons">
                <button className="emp-btn emp-btn-soft" type="button" onClick={cerrarPermisosModal}>
                  Cancelar
                </button>
                <button className="emp-btn emp-btn-primary" type="button" onClick={aplicarPermisos}>
                  Aplicar accesos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="emp-table-card">
        <div className="emp-table">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Correo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {empleados.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.nombre}</td>
                  <td>
                    <div className="emp-rol-stack">
                      <span>{emp.rol}</span>
                      {emp.superAdmin ? <span className="emp-super-chip">Super Admin</span> : null}
                    </div>
                  </td>
                  <td>{emp.correo}</td>
                  <td>
                    <span className={emp.estado === "Activo" ? "estado-activo" : "estado-inactivo"}>
                      {emp.estado}
                    </span>
                  </td>
                  <td className="emp-actions-cell">
                    {puedeGestionarActual && (
                      <div className="emp-actions-group">
                        <button className="emp-btn emp-btn-soft" onClick={() => handleEdit(emp)}>
                          Editar
                        </button>
                        <button className="emp-btn emp-btn-soft emp-btn-reset" onClick={() => handleResetPassword(emp)}>
                          Restablecer
                        </button>
                        <button className="emp-btn emp-btn-danger" onClick={() => handleDelete(emp)}>
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {empleados.length === 0 && (
                <tr>
                  <td colSpan={5} className="emp-empty-row">
                    No hay empleados registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Empleados;
