import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { auth, db } from "../../initializer/firebase";

const functions = getFunctions(auth.app, "southamerica-east1");

export async function crearSuscripcionMercadoPago() {
  // El correo del comprador se toma en el servidor desde el token de Firebase
  // Auth; no se envia desde aqui para evitar depender de un valor manipulable.
  const result = await httpsCallable(functions, "crearSuscripcionMercadoPago")({});
  if (result.data?.alreadyActive) return { alreadyActive: true };
  const url = new URL(result.data.url);
  if (url.protocol !== "https:" || !["www.mercadopago.com.mx", "www.mercadopago.com"].includes(url.hostname)) {
    throw new Error("El enlace de Mercado Pago no es válido.");
  }
  return { url: url.href };
}

export async function consultarSuscripcionMercadoPago() {
  const result = await httpsCallable(functions, "consultarSuscripcionMercadoPago")();
  return { status: result.data.status, premiumActivo: result.data.premiumActivo === true };
}

export async function cancelarSuscripcionMercadoPago() {
  const result = await httpsCallable(functions, "cancelarSuscripcionMercadoPago")();
  return { status: result.data.status };
}

export async function obtenerHistorialPagosPremium(negocioId, cantidad = 12) {
  const safeId = String(negocioId || "").trim();
  if (!safeId) return [];
  const snap = await getDocs(
    query(collection(db, "negocios", safeId, "pagos_premium"), orderBy("createdAt", "desc"), limit(cantidad)),
  );
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

/**
 * Concede o retira Premium manualmente (solo superadministrador).
 *
 * Las reglas de Firestore bloquean la escritura de los campos premium* desde
 * cualquier cliente, asi que este ajuste pasa obligatoriamente por Cloud
 * Functions y queda asentado en la bitacora del negocio.
 */
export async function establecerPremiumAdmin({ negocioId, activar, meses = 1, motivo = "" } = {}) {
  const result = await httpsCallable(functions, "adminEstablecerPremium")({
    negocioId, activar: activar === true, meses, motivo,
  });
  return result.data;
}
