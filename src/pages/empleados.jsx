import { getCollectionRef, getDocRef } from "../js/services/tenant";
import { useEffect, useMemo, useState } from "react";
import {
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth, createSecondaryAuthClient, db } from "../initializer/firebase";
import { useLocation } from "react-router-dom";
import "../css/empleados.css";
import {
  getCreateAccountErrorMessage,
  getStoredEmailValue,
  normalizeEmailValue,
} from "../js/services/account_identity";
import {
  PERMISOS_CATALOGO,
  normalizarPermisos,
  permisosBasePorRol,
} from "../js/services/permisos";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { actualizarConteosNegocio } from "../js/services/negocios";

const LIMITE_USUARIOS_GRATUITO = 3;

const ROLE_OPTIONS = ["Administrador", "Tecnico", "Vendedor", "Cajero", "Mesero", "Cocina", "Caja"];

function esRolTecnico(raw = "") {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("tecn");
}

function esRolRestaurante(raw = "") {
  return ["mesero", "cocina", "caja"].includes(
    String(raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
  );
}

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
    accesoAnalitica: false,
    permisos: permisosBasePorRol(""),
  };
}

function Empleados() {
  const location = useLocation();
  const { serviciosHabilitados, tipoNegocioActivo } = useEmpresaConfig();
  const esRestaurante = tipoNegocioActivo?.id === "restaurante";
  const {
    cuentaPrincipalUid,
    puede,
    superAdmin: esSuperAdminActual,
    suscripcionControlada: suscripcionControladaActual,
    negocio,
    isPremium,
  } = useAutorizacionActual();
  const [empleados, setEmpleados] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showPermisosModal, setShowPermisosModal] = useState(false);
  const [form, setForm] = useState(createInitialForm());
  const [permisosDraft, setPermisosDraft] = useState(permisosBasePorRol(""));
  const [onboardingFormOpened, setOnboardingFormOpened] = useState(false);
  const currentUid = auth.currentUser?.uid || null;
  const puedeGestionarActual = puede("empleados.gestionar");
  const permisosCatalogoDisponible = useMemo(
    () => PERMISOS_CATALOGO.filter((permiso) => esRestaurante || permiso.restaurantOnly !== true),
    [esRestaurante],
  );
  const empleadoEditado = useMemo(
    () => empleados.find((e) => e.id === editingId) || null,
    [empleados, editingId],
  );
  const superAdminAsignado = useMemo(
    () => empleados.find((emp) => emp.superAdmin === true) || null,
    [empleados],
  );
  // Calcula si el usuario actual puede asignar o transferir el rol de Super Admin.
  const puedeAsignarSuperAdmin = useMemo(() => {
    if (!esSuperAdminActual || form.rol !== "Administrador") return false;
    if (!superAdminAsignado?.uid) return true;
    if (empleadoEditado?.uid && superAdminAsignado.uid === empleadoEditado.uid) return true;
    return true;
  }, [empleadoEditado?.uid, esSuperAdminActual, form.rol, superAdminAsignado?.uid]);
  const editaSuPropioCargoSuperAdmin = useMemo(
    () =>
      !!empleadoEditado?.uid &&
      empleadoEditado.uid === currentUid &&
      empleadoEditado.superAdmin === true,
    [currentUid, empleadoEditado],
  );

  const permisosActivos = useMemo(
    () => permisosCatalogoDisponible.filter((p) => !!form.permisos?.[p.key]),
    [form.permisos, permisosCatalogoDisponible],
  );

  const permisosActivosDraft = useMemo(
    () => permisosCatalogoDisponible.filter((p) => !!permisosDraft?.[p.key]),
    [permisosCatalogoDisponible, permisosDraft],
  );
  const rolesDisponibles = useMemo(
    () => tipoNegocioActivo?.id === "restaurante"
      ? ["Administrador", "Mesero", "Cocina", "Caja"]
      : ROLE_OPTIONS.filter((rol) => !esRolRestaurante(rol) && (serviciosHabilitados || rol !== "Tecnico")),
    [serviciosHabilitados, tipoNegocioActivo?.id],
  );
  const rolBloqueadoPorTipoNegocio = useMemo(
    () => (!esRestaurante && esRolRestaurante(form.rol))
      || (!serviciosHabilitados && esRolTecnico(form.rol)),
    [esRestaurante, form.rol, serviciosHabilitados],
  );

  const empleadosVisibles = useMemo(() => {
    const ownerBase = cuentaPrincipalUid || currentUid;
    if (!ownerBase) return [];

    return empleados.filter((emp) => {
      const owner = String(emp?.cuentaPrincipalUid || emp?.uid || "").trim();
      return owner === ownerBase;
    });
  }, [cuentaPrincipalUid, currentUid, empleados]);

  useEffect(() => {
    const ownerBase = cuentaPrincipalUid || currentUid;
    if (!ownerBase) {
      setEmpleados([]);
      return () => {};
    }

    const unsub = onSnapshot(
      query(getCollectionRef("empleados"), where("cuentaPrincipalUid", "==", ownerBase)),
      (snapshot) => {
        const lista = snapshot.docs.map((row) => ({ id: row.id, ...row.data() }));
        setEmpleados(lista);
      },
      (error) => {
        console.warn(
          "[empleados] No se pudo suscribir a la coleccion empleados:",
          error?.code || error,
        );
        setEmpleados([]);
      },
    );

    return () => unsub();
  }, [cuentaPrincipalUid, currentUid]);

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

  useEffect(() => {
    if (
      !location.state?.onboardingEquipo ||
      !puedeGestionarActual ||
      onboardingFormOpened
    ) return;

    const suggestedRole = Array.isArray(location.state?.onboardingRoles)
      ? location.state.onboardingRoles[0] || ""
      : "";
    const permisos = permisosBasePorRol(suggestedRole);
    setForm({ ...createInitialForm(), rol: suggestedRole, permisos });
    setPermisosDraft(permisos);
    setShowForm(true);
    setOnboardingFormOpened(true);
  }, [
    location.state,
    onboardingFormOpened,
    puedeGestionarActual,
  ]);

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
      accesoAnalitica: emp.accesoAnalitica === true,
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
    const adminSesion = auth.currentUser;
    const correoNormalizado = normalizeEmailValue(form.correo);

    try {
      if (!form.nombre || !form.correo || !form.rol || (!editingId && !form.password)) {
        alert("Completa los campos obligatorios");
        return;
      }

      if (rolBloqueadoPorTipoNegocio) {
        alert(
          !esRestaurante && esRolRestaurante(form.rol)
            ? "Los roles Mesero, Cocina y Caja solo están disponibles para negocios Restaurante."
            : esRestaurante
            ? "El rol Tecnico no esta disponible en la version Restaurante."
            : "El rol Tecnico no esta disponible cuando el negocio no utiliza el modulo de servicios.",
        );
        return;
      }

      if (!correoNormalizado) {
        alert("Debes capturar un correo valido.");
        return;
      }

      const permisosFinal = normalizarPermisos(form.rol, form.permisos || {});
      const quiereSuperAdmin =
        esSuperAdminActual && form.rol === "Administrador" && form.superAdmin === true;
      const quiereAccesoAnalitica = esSuperAdminActual
        ? form.accesoAnalitica === true
        : empleadoEditado?.accesoAnalitica === true;
      const cuentaPrincipalDestino =
        empleadoEditado?.cuentaPrincipalUid ||
        cuentaPrincipalUid ||
        empleadoEditado?.uid ||
        currentUid ||
        "";
      const negocioDestino = empleadoEditado?.negocioId || cuentaPrincipalDestino;
      const suscripcionControladaDestino =
        empleadoEditado?.suscripcionControlada === true ||
        (suscripcionControladaActual === true && !esSuperAdminActual);
      const esCuentaPrincipalDestino = empleadoEditado?.esCuentaPrincipal === true;

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
        batch.update(getDocRef("empleados", editingId), {
          nombre: form.nombre,
          telefono: form.telefono,
          correo: form.correo,
          correoNormalizado,
          rol: form.rol,
          estado: form.estado,
          permisos: permisosFinal,
          superAdmin: quiereSuperAdmin,
          accesoAnalitica: quiereAccesoAnalitica,
          cuentaPrincipalUid: cuentaPrincipalDestino || empleadoEditado.uid,
          negocioId: negocioDestino || empleadoEditado.uid,
          suscripcionControlada: suscripcionControladaDestino,
          esCuentaPrincipal: esCuentaPrincipalDestino,
        });

        batch.update(doc(db, "autorizados", empleadoEditado.uid), {
          rol: form.rol,
          activo: form.estado === "Activo",
          permisos: permisosFinal,
          superAdmin: quiereSuperAdmin,
          accesoAnalitica: quiereAccesoAnalitica,
          nombre: form.nombre,
          correo: form.correo,
          correoNormalizado,
          cuentaPrincipalUid: cuentaPrincipalDestino || empleadoEditado.uid,
          negocioId: negocioDestino || empleadoEditado.uid,
          suscripcionControlada: suscripcionControladaDestino,
          esCuentaPrincipal: esCuentaPrincipalDestino,
        });

        if (quiereSuperAdmin) {
          empleados
            .filter((emp) => emp.superAdmin === true && emp.uid !== empleadoEditado.uid)
            .forEach((emp) => {
              batch.update(getDocRef("empleados", emp.id), { superAdmin: false });
              if (emp.uid) batch.update(doc(db, "autorizados", emp.uid), { superAdmin: false });
            });
        }

        await batch.commit();
      } else {
        const existingEmployee = empleados.find(
          (emp) => getStoredEmailValue(emp) === correoNormalizado,
        );

        if (existingEmployee) {
          alert("Ese correo ya pertenece a un empleado registrado en este negocio.");
          return;
        }

        if (!isPremium && Number(negocio?.conteos?.usuariosTotal || 0) >= LIMITE_USUARIOS_GRATUITO) {
          alert(
            `El plan Gratuito permite hasta ${LIMITE_USUARIOS_GRATUITO} usuarios. Mejora a CajaLibre Premium para agregar usuarios ilimitados.`,
          );
          return;
        }

        const secondaryClient = createSecondaryAuthClient();
        let uid = "";

        try {
          const userCredential = await createUserWithEmailAndPassword(
            secondaryClient.auth,
            form.correo,
            form.password,
          );
          uid = userCredential.user.uid;
        } finally {
          await signOut(secondaryClient.auth).catch(() => {});
          await secondaryClient.dispose();
        }

        if (quiereSuperAdmin && superAdminAsignado?.uid && !esSuperAdminActual) {
          if (adminSesion) await auth.updateCurrentUser(adminSesion);
          alert("Ya existe un Super Administrador. Solo el actual puede transferir ese cargo.");
          return;
        }

        const batch = writeBatch(db);
        const empRef = doc(getCollectionRef("empleados"));

        batch.set(empRef, {
          uid,
          nombre: form.nombre,
          telefono: form.telefono,
          correo: form.correo,
          correoNormalizado,
          rol: form.rol,
          estado: form.estado,
          permisos: permisosFinal,
          superAdmin: quiereSuperAdmin,
          accesoAnalitica: quiereAccesoAnalitica,
          cuentaPrincipalUid: cuentaPrincipalUid || currentUid || uid,
          negocioId: cuentaPrincipalUid || currentUid || uid,
          suscripcionControlada: suscripcionControladaActual === true && !esSuperAdminActual,
          esCuentaPrincipal: false,
          createdAt: new Date(),
        });

        batch.set(doc(db, "autorizados", uid), {
          activo: form.estado === "Activo",
          rol: form.rol,
          permisos: permisosFinal,
          superAdmin: quiereSuperAdmin,
          accesoAnalitica: quiereAccesoAnalitica,
          nombre: form.nombre,
          correo: form.correo,
          correoNormalizado,
          cuentaPrincipalUid: cuentaPrincipalUid || currentUid || uid,
          negocioId: cuentaPrincipalUid || currentUid || uid,
          suscripcionControlada: suscripcionControladaActual === true && !esSuperAdminActual,
          esCuentaPrincipal: false,
        });

        if (quiereSuperAdmin) {
          empleados
            .filter((emp) => emp.superAdmin === true && emp.uid !== uid)
            .forEach((emp) => {
              batch.update(getDocRef("empleados", emp.id), { superAdmin: false });
              if (emp.uid) batch.update(doc(db, "autorizados", emp.uid), { superAdmin: false });
            });
        }

        await batch.commit();
        actualizarConteosNegocio(cuentaPrincipalUid || currentUid || uid).catch(() => {});
      }

      cerrarFormulario();
    } catch (error) {
      alert(getCreateAccountErrorMessage(error, "empleado"));
    } finally {
      if (adminSesion && auth.currentUser?.uid !== adminSesion.uid) {
        await auth.updateCurrentUser(adminSesion).catch(() => {});
      }
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

    if (emp.esCuentaPrincipal === true) {
      alert("La cuenta principal no se elimina desde empleados. Administrala desde Suscripciones.");
      return;
    }

    await deleteDoc(getDocRef("empleados", emp.id));
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
      await updateDoc(getDocRef("empleados", emp.id), {
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
      {location.state?.onboardingEquipo ? (
        <div className="emp-onboarding-note">
          <strong>Último paso: agrega a tu equipo</strong>
          <p>
            Crea {Number(location.state?.onboardingCantidad || 1)} cuenta(s) con su
            correo, contraseña temporal y rol. Después podrás entrar al resto del sistema.
          </p>
        </div>
      ) : null}
      <div className="emp-header">
        <div>
          <h1>Gestion de Empleados</h1>
          <p className="emp-subtitle">
            {esSuperAdminActual
              ? "Administra usuarios, roles y accesos del sistema."
              : "Administra los usuarios y accesos de tu cuenta principal."}
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
                {rolBloqueadoPorTipoNegocio && (
                  <option value={form.rol} disabled>
                    {form.rol} (no disponible en abarrotes)
                  </option>
                )}
                {rolesDisponibles.map((rol) => (
                  <option key={rol} value={rol}>
                    {rol}
                  </option>
                ))}
              </select>
              {!serviciosHabilitados && (
                <small className="emp-field-help">
                  {esRestaurante
                    ? "En Restaurante se utilizan los roles Administrador, Mesero, Cocina y Caja."
                    : "El rol Tecnico solo esta disponible para negocios con el modulo de servicios habilitado."}
                </small>
              )}
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

            {esSuperAdminActual && (
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
            )}

            {esSuperAdminActual && (
              <label className="emp-field">
                <span>Analítica</span>
                <div className="emp-super-admin-box">
                  <input
                    type="checkbox"
                    checked={form.accesoAnalitica === true}
                    onChange={(e) => setForm({ ...form, accesoAnalitica: e.target.checked })}
                  />
                  <div>
                    <strong>Permitir acceso al panel de Analítica</strong>
                    <small>
                      Podrá consultar métricas globales, errores y exportaciones, sin modificar la administración.
                    </small>
                  </div>
                </div>
              </label>
            )}
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
              {permisosCatalogoDisponible.map((perm) => (
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
              {empleadosVisibles.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.nombre}</td>
                  <td>
                    <div className="emp-rol-stack">
                      <span>{emp.rol}</span>
                      {emp.superAdmin ? <span className="emp-super-chip">Super Admin</span> : null}
                      {emp.esCuentaPrincipal ? <span className="emp-super-chip">Cuenta principal</span> : null}
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

              {empleadosVisibles.length === 0 && (
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
