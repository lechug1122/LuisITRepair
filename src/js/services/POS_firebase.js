import { db } from "../../initializer/firebase";
import {
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  dataBelongsToTenant,
  allowLegacyTenantFallback,
  filterItemsByTenant,
  getTenantCollectionQuery,
  getLegacyConfigDocRef,
  getTenantConfigDocRef,
  getCollectionRef,
  getDocRef,
  withTenantData,
} from "./tenant";

// OBTENER PRODUCTOS
export const obtenerProductos = async () => {
  const querySnapshot = await getDocs(getTenantCollectionQuery("productos"));

  const items = querySnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  const tenantItems = filterItemsByTenant(items);
  const now = new Date();
  const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  const expiredDailyMenus = tenantItems.filter((item) => (
    item.menuDelDia === true
    && /^\d{4}-\d{2}-\d{2}$/.test(String(item.fechaMenu || ""))
    && String(item.fechaMenu) < localToday
  ));

  if (expiredDailyMenus.length) {
    try {
      const batch = writeBatch(db);
      expiredDailyMenus.forEach((item) => batch.delete(getDocRef("productos", item.id)));
      await batch.commit();
    } catch (error) {
      console.warn("No se pudieron eliminar los menús del día vencidos:", error?.code || error);
    }
  }

  return tenantItems.filter((item) => !expiredDailyMenus.some((expired) => expired.id === item.id));
};


// CREAR PRODUCTO
export const crearProducto = async (data) => {

  // 1️⃣ Crear documento
  const docRef = await addDoc(getCollectionRef("productos"), withTenantData(data));

  // 2️⃣ Guardar el ID real dentro del documento
  await updateDoc(docRef, {
    id: docRef.id,
    ...withTenantData({})
  });

};


// ACTUALIZAR PRODUCTO
export const actualizarProducto = async (id, data) => {
  const productoRef = getDocRef("productos", id);
  await updateDoc(productoRef, withTenantData(data));
};

// ELIMINAR PRODUCTO
export const eliminarProductoDB = async (id) => {
  await deleteDoc(getDocRef("productos", id));
};

/* ================= CATEGORIAS INVENTARIO ================= */

function normalizeCategoryName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCategoryItem(item, index = 0) {
  const nombre = String(item?.nombre ?? item ?? "").trim();
  if (!nombre) return null;

  return {
    id: String(item?.id || `cat_${index}_${normalizeCategoryName(nombre).replace(/\s+/g, "_")}`),
    nombre,
  };
}

export const obtenerCategoriasInventario = async () => {
  const inventarioCategoriasRef = getTenantConfigDocRef("inventario_categorias");
  const snap = await getDoc(inventarioCategoriasRef);
  if (!snap.exists()) {
    if (allowLegacyTenantFallback()) {
      const legacySnap = await getDoc(getLegacyConfigDocRef("inventario_categorias"));
      if (legacySnap.exists()) {
        await setDoc(
          inventarioCategoriasRef,
          withTenantData({
            items: Array.isArray(legacySnap.data()?.items) ? legacySnap.data().items : [],
            updatedAt: new Date(),
          }),
          { merge: true },
        );
        return obtenerCategoriasInventario();
      }
    }
    return [];
  }

  const rawItems = Array.isArray(snap.data()?.items) ? snap.data().items : [];
  const uniques = new Map();

  rawItems.forEach((item, index) => {
    const normalized = normalizeCategoryItem(item, index);
    if (!normalized) return;
    const key = normalizeCategoryName(normalized.nombre);
    if (!key || uniques.has(key)) return;
    uniques.set(key, normalized);
  });

  return [...uniques.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
};

export const crearCategoriaInventario = async (nombre) => {
  const safeName = String(nombre ?? "").trim();
  const normalizedName = normalizeCategoryName(safeName);
  if (!safeName || !normalizedName) {
    throw new Error("Nombre de categoria invalido");
  }

  const actuales = await obtenerCategoriasInventario();
  const existe = actuales.some((item) => normalizeCategoryName(item.nombre) === normalizedName);
  if (existe) {
    const error = new Error("La categoria ya existe");
    error.code = "categoria-existente";
    throw error;
  }

  const nueva = {
    id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    nombre: safeName,
  };

  await setDoc(
    getTenantConfigDocRef("inventario_categorias"),
    withTenantData({
      items: [...actuales, nueva],
      updatedAt: new Date(),
    }),
    { merge: true },
  );

  return nueva;
};

export const eliminarCategoriaInventario = async (categoria) => {
  const categoriaNombre = String(categoria?.nombre ?? categoria ?? "").trim();
  const categoriaId = String(categoria?.id || "").trim();
  const categoriaKey = normalizeCategoryName(categoriaNombre);
  if (!categoriaKey) return;

  const actuales = await obtenerCategoriasInventario();
  const restantes = actuales.filter((item) => {
    const sameId = categoriaId && String(item.id || "").trim() === categoriaId;
    const sameName = normalizeCategoryName(item.nombre) === categoriaKey;
    return !(sameId || sameName);
  });

  await setDoc(
    getTenantConfigDocRef("inventario_categorias"),
    withTenantData({
      items: restantes,
      updatedAt: new Date(),
    }),
    { merge: true },
  );

  const productosConCategoria = await getDocs(
    getTenantCollectionQuery("productos"),
  );

  const productosFiltrados = productosConCategoria.docs.filter((docSnap) => {
    const data = docSnap.data() || {};
    return dataBelongsToTenant(data) && String(data?.categoria || "").trim() === categoriaNombre;
  });

  if (productosFiltrados.length > 0) {
    const batch = writeBatch(db);
    productosFiltrados.forEach((docSnap) => {
      batch.update(docSnap.ref, { categoria: "" });
    });
    await batch.commit();
  }
};

/* ================= CLIENTES ================= */

export const buscarClientePorTelefono = async (telefono) => {

  if (!telefono) return null;

  const snapshot = await getDocs(getTenantCollectionQuery("clientes"));
  const docSnap = snapshot.docs.find((item) => {
    const data = item.data() || {};
    return (
      dataBelongsToTenant(data) &&
      String(data?.telefono || "").trim() === telefono.trim()
    );
  });
  if (!docSnap) return null;

  return {
    id: docSnap.id,
    ...docSnap.data()
  };
};



export const sumarPuntosCliente = async (clienteId, puntosNuevos) => {

  const ref = getDocRef("clientes", clienteId);

  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    console.log("Cliente no encontrado");
    return;
  }

  const data = snapshot.data();
  if (!dataBelongsToTenant(data)) {
    console.log("Cliente fuera del alcance de la cuenta actual");
    return;
  }

  // Si no tiene puntos, iniciarlo en 0
  const puntosActuales = data.puntos ?? 0;

  await updateDoc(ref, {
    puntos: puntosActuales + puntosNuevos
  });

  console.log("Puntos actualizados:", puntosActuales + puntosNuevos);
};


/* ================= VENTAS ================= */

export const registrarVenta = async (data) => {
  const docRef = await addDoc(getCollectionRef("ventas"), withTenantData(data));
  return docRef.id;
};

export const descontarStock = async (productoId, nuevoStock) => {
  const ref = getDocRef("productos", productoId);
  await updateDoc(ref, { stock: nuevoStock });
};
