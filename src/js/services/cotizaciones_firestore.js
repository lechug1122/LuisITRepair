import { addDoc, deleteDoc, getDoc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth } from "../../initializer/firebase";
import { dataBelongsToTenant, filterItemsByTenant, getCollectionRef, getDocRef, getTenantCollectionQuery, withTenantData } from "./tenant";

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export async function guardarCotizacion(data = {}) {
  const payload = withTenantData({
    ...data,
    creadoPorUid: auth.currentUser?.uid || "",
    creadoPorEmail: auth.currentUser?.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const ref = await addDoc(getCollectionRef("cotizaciones"), payload);
  return ref.id;
}

export async function listarCotizaciones() {
  const snap = await getDocs(getTenantCollectionQuery("cotizaciones"));
  return filterItemsByTenant(snap.docs.map((item) => ({ id: item.id, ...item.data() })))
    .filter((item) => !String(item?.servicioId || "").trim())
    .sort((a, b) => toMillis(b.createdAt || b.fecha) - toMillis(a.createdAt || a.fecha));
}

export async function actualizarCotizacion(id, data = {}) {
  const actual = await obtenerCotizacionPorId(id);
  if (!actual) throw new Error("Cotizacion no encontrada.");

  await updateDoc(getDocRef("cotizaciones", actual.id), withTenantData({
    ...data,
    updatedAt: serverTimestamp(),
  }));
  return actual.id;
}

export async function eliminarCotizacion(id) {
  const actual = await obtenerCotizacionPorId(id);
  if (!actual) throw new Error("Cotizacion no encontrada.");
  if (String(actual.servicioId || "").trim()) {
    throw new Error("Las cotizaciones asignadas se administran desde el servicio.");
  }
  await deleteDoc(getDocRef("cotizaciones", actual.id));
}

export async function obtenerCotizacionPorId(id) {
  const cotizacionId = String(id || "").trim();
  if (!cotizacionId) return null;

  const snap = await getDoc(getDocRef("cotizaciones", cotizacionId));
  if (!snap.exists() || !dataBelongsToTenant(snap.data())) return null;
  return { id: snap.id, ...snap.data() };
}
