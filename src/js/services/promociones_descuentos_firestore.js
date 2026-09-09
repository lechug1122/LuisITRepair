import {
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getCollectionRef, getDocRef, withTenantData } from "./tenant";

const COLLECTION = "promociones_descuentos";

function normalizar(raw = {}) {
  const clase = raw.clase === "descuento" ? "descuento" : "promocion";
  const tipo = ["porcentaje", "monto_fijo", "precio_especial"].includes(raw.tipo)
    ? raw.tipo
    : "porcentaje";
  const requerimientosEntrada = Array.isArray(raw.requerimientos) && raw.requerimientos.length
    ? raw.requerimientos
    : [{
      productoId: raw.productoRequeridoId,
      productoNombre: raw.productoRequeridoNombre,
      cantidad: raw.cantidadRequerida,
    }];
  const requerimientos = requerimientosEntrada.map((requisito) => ({
    productoId: String(requisito?.productoId || ""),
    productoNombre: String(requisito?.productoNombre || ""),
    cantidad: Math.max(1, Math.floor(Number(requisito?.cantidad) || 1)),
  })).filter((requisito) => requisito.productoId);
  const primerRequisito = requerimientos[0] || {};
  return {
    clase,
    nombre: String(raw.nombre || "").trim(),
    descripcion: String(raw.descripcion || "").trim(),
    tipo,
    valor: Math.max(0, Number(raw.valor) || 0),
    aplicaA: String(raw.aplicaA || "todos").trim(),
    fechaInicio: String(raw.fechaInicio || "").trim(),
    fechaFin: String(raw.fechaFin || "").trim(),
    autorizacion: String(raw.autorizacion || "sin_autorizacion").trim(),
    objetivoIds: Array.isArray(raw.objetivoIds) ? raw.objetivoIds.map(String).slice(0, 500) : [],
    objetivoNombres: Array.isArray(raw.objetivoNombres) ? raw.objetivoNombres.map(String).slice(0, 500) : [],
    promocionTipo: String(raw.promocionTipo || "compra_obten"),
    requerimientos,
    productoRequeridoId: String(primerRequisito.productoId || raw.productoRequeridoId || ""),
    productoRequeridoNombre: String(primerRequisito.productoNombre || raw.productoRequeridoNombre || ""),
    cantidadRequerida: Math.max(1, Math.floor(Number(primerRequisito.cantidad || raw.cantidadRequerida) || 1)),
    beneficioTipo: String(raw.beneficioTipo || "gratis"),
    productoBeneficiadoId: String(raw.productoBeneficiadoId || ""),
    productoBeneficiadoNombre: String(raw.productoBeneficiadoNombre || ""),
    cantidadBeneficiada: Math.max(1, Math.floor(Number(raw.cantidadBeneficiada) || 1)),
    beneficioValor: Math.max(0, Number(raw.beneficioValor) || 0),
    acumulable: raw.acumulable === true,
    activo: raw.activo !== false,
  };
}

export function escucharPromocionesDescuentos(onData, onError = () => {}) {
  return onSnapshot(
    getCollectionRef(COLLECTION),
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.creadoEn?.seconds || "").localeCompare(String(a.creadoEn?.seconds || "")));
      onData(items);
    },
    onError,
  );
}

export async function guardarPromocionDescuento(data = {}, id = "") {
  const payload = normalizar(data);
  if (!payload.nombre) throw new Error("Escribe un nombre.");
  if (!payload.fechaInicio || !payload.fechaFin) throw new Error("Selecciona las fechas de inicio y finalización.");
  if (payload.fechaFin < payload.fechaInicio) throw new Error("La fecha de finalización no puede ser anterior al inicio.");
  if (payload.clase === "descuento" && payload.valor <= 0) throw new Error("El valor debe ser mayor que cero.");
  if (payload.clase === "promocion" && payload.requerimientos.length === 0) throw new Error("Agrega al menos un producto requerido.");
  if (payload.clase === "promocion" && !payload.productoBeneficiadoId) throw new Error("Selecciona el producto beneficiado.");
  if (payload.clase === "promocion" && payload.beneficioTipo !== "gratis" && payload.beneficioValor <= 0) throw new Error("Indica el valor del beneficio.");
  if (["productos", "categoria"].includes(payload.aplicaA) && payload.objetivoIds.length === 0) {
    throw new Error("Selecciona al menos un producto o categoría.");
  }

  if (id) {
    await updateDoc(getDocRef(COLLECTION, id), withTenantData({ ...payload, actualizadoEn: serverTimestamp() }));
    return id;
  }
  const ref = await addDoc(getCollectionRef(COLLECTION), withTenantData({
    ...payload,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  }));
  return ref.id;
}

export async function cambiarEstadoPromocionDescuento(id, activo) {
  await updateDoc(getDocRef(COLLECTION, id), { activo: activo === true, actualizadoEn: serverTimestamp() });
}

export async function eliminarPromocionDescuento(id) {
  await deleteDoc(getDocRef(COLLECTION, id));
}
