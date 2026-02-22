import React, { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  setDoc,
  getDoc
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";

import { db, auth } from "../initializer/firebase";
import "../css/empleados.css";

function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [rolActual, setRolActual] = useState(null);

  const initialForm = {
    nombre: "",
    telefono: "",
    correo: "",
    rol: "",
    estado: "Activo",
    password: "",
  };

  const [form, setForm] = useState(initialForm);

  // 🔥 Obtener rol del usuario actual
  useEffect(() => {
    const obtenerRol = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const docRef = doc(db, "autorizados", uid);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        setRolActual(snap.data().rol);
      }
    };

    obtenerRol();
  }, []);

  // 🔥 LISTAR EMPLEADOS EN TIEMPO REAL
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "empleados"), (snapshot) => {
      const lista = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setEmpleados(lista);
    });

    return () => unsub();
  }, []);

  const handleNew = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(true);
  };

  const handleEdit = (emp) => {
    setForm({
      nombre: emp.nombre || "",
      telefono: emp.telefono || "",
      correo: emp.correo || "",
      rol: emp.rol || "",
      estado: emp.estado || "Activo",
      password: "",
    });

    setEditingId(emp.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    try {
      if (!form.nombre || !form.correo || (!editingId && !form.password)) {
        alert("Completa los campos obligatorios");
        return;
      }

      // 🔥 EDITAR
      if (editingId) {
        const empleadoEditado = empleados.find(e => e.id === editingId);

        await updateDoc(doc(db, "empleados", editingId), {
          nombre: form.nombre,
          telefono: form.telefono,
          rol: form.rol,
          estado: form.estado,
        });

        // 🔥 actualizar autorizados
        await updateDoc(doc(db, "autorizados", empleadoEditado.uid), {
          rol: form.rol,
          activo: form.estado === "Activo",
        });

      } else {
        // 🔥 CREAR NUEVO
        const adminActual = auth.currentUser;

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          form.correo,
          form.password
        );

        const uid = userCredential.user.uid;

        // Guardar en empleados
        await addDoc(collection(db, "empleados"), {
          uid: uid,
          nombre: form.nombre,
          telefono: form.telefono,
          correo: form.correo,
          rol: form.rol,
          estado: form.estado,
          createdAt: new Date(),
        });

        // Guardar en autorizados
        await setDoc(doc(db, "autorizados", uid), {
          activo: form.estado === "Activo",
          rol: form.rol,
        });

        // 🔥 Mantener admin logueado
        await auth.updateCurrentUser(adminActual);
      }

      setShowForm(false);
      setForm(initialForm);
      setEditingId(null);

    } catch (error) {
      alert(error.message);
    }
  };

  // 🔥 ELIMINAR (con protección)
  const handleDelete = async (emp) => {
    if (!window.confirm("¿Eliminar empleado?")) return;

    const currentUid = auth.currentUser.uid;

    // ❌ No permitir eliminarse a sí mismo
    if (emp.uid === currentUid) {
      alert("No puedes eliminar tu propia cuenta.");
      return;
    }

    await deleteDoc(doc(db, "empleados", emp.id));
    await deleteDoc(doc(db, "autorizados", emp.uid));
  };

  return (
    <div className="emp-container">
      <div className="emp-header">
        <h1>Gestión de Empleados</h1>

        {rolActual === "Administrador" && (
          <button className="btn-primary" onClick={handleNew}>
            + Nuevo Empleado
          </button>
        )}
      </div>

      {showForm && rolActual === "Administrador" && (
        <div className="emp-form-card">
          <h2>{editingId ? "Editar Empleado" : "Registrar Empleado"}</h2>

          <div className="emp-form-grid">
            <input
              placeholder="Nombre"
              value={form.nombre}
              onChange={(e) =>
                setForm({ ...form, nombre: e.target.value })
              }
            />

            <input
              type="tel"
              placeholder="Teléfono"
              value={form.telefono}
              maxLength={10}
              onChange={(e) => {
                const soloNumeros = e.target.value
                  .replace(/\D/g, "")
                  .slice(0, 10);
                setForm({ ...form, telefono: soloNumeros });
              }}
            />

            <input
              placeholder="Correo"
              value={form.correo}
              onChange={(e) =>
                setForm({ ...form, correo: e.target.value })
              }
            />

            {!editingId && (
              <input
                type="password"
                placeholder="Contraseña"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
              />
            )}

            <select
              value={form.rol}
              onChange={(e) =>
                setForm({ ...form, rol: e.target.value })
              }
            >
              <option value="">Seleccionar Rol</option>
              <option>Administrador</option>
              <option>Técnico</option>
              <option>Cajero</option>
            </select>

            <select
              value={form.estado}
              onChange={(e) =>
                setForm({ ...form, estado: e.target.value })
              }
            >
              <option>Activo</option>
              <option>Inactivo</option>
            </select>
          </div>

          <div className="emp-form-actions">
            <button
              className="btn-cancel"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>

            <button className="btn-primary" onClick={handleSubmit}>
              Guardar
            </button>
          </div>
        </div>
      )}

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
                <td>{emp.rol}</td>
                <td>{emp.correo}</td>
                <td>
                  <span
                    className={
                      emp.estado === "Activo"
                        ? "estado-activo"
                        : "estado-inactivo"
                    }
                  >
                    {emp.estado}
                  </span>
                </td>
                <td>
                  {rolActual === "Administrador" && (
                    <>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(emp)}
                      >
                        Editar
                      </button>

                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(emp)}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Empleados;