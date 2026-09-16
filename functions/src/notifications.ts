import {getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

const options = {region: "southamerica-east1"};
const SUPERADMIN_EMAIL = "lechugapapayero@gmail.com";

// Tope de avisos que se devuelven. La consulta ya viene filtrada por audiencia,
// asi que estos son avisos que a este negocio le tocan de verdad: 30 es mas
// historial del que la campana llega a mostrar, porque los vencidos se
// descartan despues por su ventana de vigencia.
const MAX_NOTIFICATIONS = 30;

function clean(value: unknown) {
  return String(value || "").trim();
}

function audienceForBusiness(negocioId: string, premiumState: string) {
  return [
    "todos",
    premiumState === "premium" ? "plan:premium" : "plan:free",
    `negocio:${negocioId}`,
  ];
}

export const listarNotificacionesNegocio = onCall(options, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const requestedBusinessId = clean(request.data?.negocioId);
  const premiumState = request.data?.premiumState === "premium" ? "premium" : "free";
  if (!requestedBusinessId) {
    throw new HttpsError("invalid-argument", "Falta negocioId.");
  }

  const db = getFirestore();
  const email = clean(request.auth.token?.email).toLowerCase();
  const isSuperAdmin = email === SUPERADMIN_EMAIL;
  if (!isSuperAdmin) {
    const profile = await db.doc(`autorizados/${request.auth.uid}`).get();
    const profileData = profile.data() || {};
    const allowedBusinessId = clean(profileData.negocioId || profileData.cuentaPrincipalUid);
    if (allowedBusinessId !== requestedBusinessId) {
      throw new HttpsError("permission-denied", "No puedes consultar avisos de otro negocio.");
    }
  }

  // El filtro de audiencia lo resuelve Firestore, no la memoria de la funcion.
  // Antes se leian los 60 avisos mas recientes del sistema y se descartaban
  // aqui los que no tocaban: un negocio pagaba la lectura de los avisos de
  // todos los demas. `array-contains-any` sobre las tres etiquetas devuelve
  // exactamente lo que le corresponde.
  //
  // Requiere el indice compuesto: audiencia (CONTAINS) + createdAt (DESC).
  const snapshot = await db
    .collection("notificaciones_globales")
    .where("audiencia", "array-contains-any", audienceForBusiness(requestedBusinessId, premiumState))
    .orderBy("createdAt", "desc")
    .limit(MAX_NOTIFICATIONS)
    .get();

  return snapshot.docs.map((item) => ({id: item.id, ...item.data()}));
});
