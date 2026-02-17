import { db } from "../../initializer/firebase";
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where
} from "firebase/firestore";

// OBTENER PRODUCTOS
export const obtenerProductos = async () => {
  const querySnapshot = await getDocs(collection(db, "productos"));

  return querySnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
};


// CREAR PRODUCTO
export const crearProducto = async (data) => {

  // 1️⃣ Crear documento
  const docRef = await addDoc(collection(db, "productos"), data);

  // 2️⃣ Guardar el ID real dentro del documento
  await updateDoc(docRef, {
    id: docRef.id
  });

};


// ACTUALIZAR PRODUCTO
export const actualizarProducto = async (id, data) => {
  const productoRef = doc(db, "productos", id);
  await updateDoc(productoRef, data);
};

// ELIMINAR PRODUCTO
export const eliminarProductoDB = async (id) => {
  await deleteDoc(doc(db, "productos", id));
};

/* ================= CLIENTES ================= */

export const buscarClientePorTelefono = async (telefono) => {

  if (!telefono) return null;

  const q = query(
    collection(db, "clientes"),
    where("telefono", "==", telefono.trim())
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];

  return {
    id: docSnap.id,
    ...docSnap.data()
  };
};



export const sumarPuntosCliente = async (clienteId, puntosNuevos) => {

  const ref = doc(db, "clientes", clienteId);

  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    console.log("Cliente no encontrado");
    return;
  }

  const data = snapshot.data();

  // Si no tiene puntos, iniciarlo en 0
  const puntosActuales = data.puntos ?? 0;

  await updateDoc(ref, {
    puntos: puntosActuales + puntosNuevos
  });

  console.log("Puntos actualizados:", puntosActuales + puntosNuevos);
};


/* ================= VENTAS ================= */

export const registrarVenta = async (data) => {
  const docRef = await addDoc(collection(db, "ventas"), data);
  return docRef.id;
};

export const descontarStock = async (productoId, nuevoStock) => {
  const ref = doc(db, "productos", productoId);
  await updateDoc(ref, { stock: nuevoStock });
};
