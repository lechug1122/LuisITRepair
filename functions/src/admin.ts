import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const options = {region: "southamerica-east1"};

// Mismo superadministrador que declaran las reglas de Firestore
// (isSuperAdmin). Se valida aqui de nuevo porque esta funcion escribe con
// Admin SDK y por tanto ignora por completo las reglas.
const SUPERADMIN_EMAIL = "lechugapapayero@gmail.com";

const MAX_MESES = 24;

function exigirSuperAdmin(request: {auth?: {token?: {email?: string}}}) {
  const email = String(request.auth?.token?.email || "").trim().toLowerCase();
  if (!request.auth || email !== SUPERADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "Solo el superadministrador puede realizar esta acción.");
  }
  return email;
}

function addMonthsClamped(base: Date, months: number) {
  const next = new Date(base);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  // Evita que "31 de enero + 1 mes" se desborde a marzo.
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/**
 * Concede o retira Premium manualmente desde el panel de superadmin.
 *
 * Es el unico camino permitido: las reglas de Firestore bloquean la escritura
 * de los campos premium* desde cualquier cliente, de modo que conceder Premium
 * exige pasar por aqui y queda registrado en la bitacora del negocio.
 *
 * No toca `premiumSubscriptionId` ni `premiumProveedor` de Mercado Pago: una
 * concesion manual no debe hacerse pasar por una suscripcion cobrada.
 */
export const adminEstablecerPremium = onCall(options, async (request) => {
  const actorEmail = exigirSuperAdmin(request);
  const negocioId = String(request.data?.negocioId || "").trim();
  const activar = request.data?.activar === true;
  const meses = Math.min(MAX_MESES, Math.max(1, Math.trunc(Number(request.data?.meses) || 1)));
  const motivo = String(request.data?.motivo || "").trim().slice(0, 500);

  if (!negocioId) throw new HttpsError("invalid-argument", "Falta negocioId.");

  const db = getFirestore();
  const negocioRef = db.doc(`negocios/${negocioId}`);
  const snapshot = await negocioRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "El negocio no existe.");

  const ahora = new Date();
  const actual = snapshot.data()?.premiumUntil?.toDate?.() as Date | undefined;
  // Extender sobre la vigencia viva, no sobre hoy, para no regalar ni quitar dias.
  const desde = activar && actual && actual > ahora ? actual : ahora;
  const premiumUntil = activar ? addMonthsClamped(desde, meses) : ahora;

  await negocioRef.set({
    premium: activar,
    planActual: activar ? "Premium" : "Gratuito",
    gratuito: !activar,
    premiumUntil: activar ? premiumUntil : null,
    // Una concesion manual nunca renueva sola: no hay cobro detras.
    renovacionAutomatica: false,
    cobrosAutomaticos: false,
    premiumOtorgadoManualmente: activar,
    ...(activar ? {} : {premiumCanceladoAt: FieldValue.serverTimestamp()}),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: request.auth?.uid || null,
  }, {merge: true});

  const tipo = activar ? "premium_activado_manual" : "premium_desactivado_manual";
  await db.doc(`negocios/${negocioId}/admin_bitacora/${tipo}__${negocioId}__${Date.now()}`).set({
    tipo,
    negocioId,
    actorUid: request.auth?.uid || "",
    actorEmail,
    detalle: motivo,
    origen: "superadmin",
    ...(activar ? {meses, premiumUntilResultante: premiumUntil} : {}),
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info("Premium ajustado manualmente por superadmin", {negocioId, activar, meses});
  return {ok: true, premiumUntil: activar ? premiumUntil.toISOString() : null};
});
