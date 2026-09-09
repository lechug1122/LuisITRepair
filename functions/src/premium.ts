import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {randomUUID, createHmac, timingSafeEqual} from "node:crypto";
import * as logger from "firebase-functions/logger";

const accessToken = defineSecret("MERCADOPAGO_ACCESS_TOKEN");
const webhookSecret = defineSecret("MERCADOPAGO_WEBHOOK_SECRET");
const options = {region: "southamerica-east1", secrets: [accessToken]};
const returnUrl = "https://cajalibre.com.mx/configuracion/pago-premium?proveedor=mercadopago";
// Precio oficial de CajaLibre Premium. Definido y validado unicamente en el
// servidor: el frontend nunca lo envia ni lo puede alterar (ver
// crearSuscripcionMercadoPago, que ignora cualquier monto del cliente).
const PREMIUM_AMOUNT = 300;
const PREMIUM_CURRENCY = "MXN";
// Margen para considerar que un intento sin ID confirmado sigue "en curso"
// (otra pestaña, o la llamada a Mercado Pago todavia en vuelo). Una
// preapproval sin autorizar nunca cobra nada, asi que pasado este margen es
// seguro liberar el intento sin riesgo de cobro duplicado.
const STALE_ATTEMPT_MS = 30_000;

async function mp(path: string, body?: Record<string, unknown>, method?: "GET" | "POST" | "PUT") {
  const httpMethod = method || (body ? "POST" : "GET");
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: httpMethod,
    headers: {
      Authorization: `Bearer ${accessToken.value()}`,
      "Content-Type": "application/json",
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // Registra la respuesta real de Mercado Pago para poder diagnosticar
    // 400/401/403, pero nunca el Access Token.
    const responseData = await response.json().catch(() => null);
    logger.error("Mercado Pago error", {path, method: httpMethod, status: response.status, data: responseData});
    throw new HttpsError("failed-precondition",
      `Mercado Pago rechazó ${httpMethod === "GET" ? `la consulta ${path}` : "la operación"} (${response.status}). ` +
      "Revisa los registros del servidor para el detalle.");
  }
  return response.json();
}

async function owner(uid?: string) {
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  const db = getFirestore();
  const [authorization, business] = await Promise.all([
    db.doc(`autorizados/${uid}`).get(), db.doc(`negocios/${uid}`).get(),
  ]);
  const a = authorization.data();
  const b = business.data();
  if (!a || a.activo === false || !b ||
      String(a.cuentaPrincipalUid || uid) !== uid ||
      String(b.cuentaPrincipalUid || uid) !== uid ||
      ["bloqueado", "suspendido"].includes(b.estado)) {
    throw new HttpsError("permission-denied", "Solo el titular de un negocio activo puede gestionar su suscripción.");
  }
  return uid;
}

/**
 * El correo del comprador de Mercado Pago se toma del token de Firebase Auth
 * (verificado por Firebase, no lo puede falsificar el cliente). Solo si el
 * token no trae correo se admite el valor enviado desde el frontend.
 */
function resolverPayerEmail(request: {auth?: {token?: Record<string, unknown>}; data?: Record<string, unknown>}) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const authEmail = String(request.auth?.token?.email || "").trim().toLowerCase();
  if (emailRegex.test(authEmail)) return authEmail;
  const fallback = String(request.data?.payerEmail || "").trim().toLowerCase();
  if (emailRegex.test(fallback)) return fallback;
  throw new HttpsError("failed-precondition", "Tu cuenta no tiene un correo válido para Mercado Pago.");
}

function checkoutUrl(value: unknown) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" ||
      !["www.mercadopago.com.mx", "www.mercadopago.com"].includes(url.hostname)) {
    throw new HttpsError("internal", "Mercado Pago no devolvió un enlace válido.");
  }
  return url.href;
}

function attemptCreatedAtMs(data: Record<string, unknown> | undefined): number {
  const createdAt = data?.createdAt as {toMillis?: () => number} | undefined;
  return typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : 0;
}

/** Convierte un Timestamp de Firestore, Date o string a Date, o null si no hay valor valido. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  const asTimestamp = value as {toDate?: () => Date};
  if (typeof asTimestamp.toDate === "function") return asTimestamp.toDate();
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Suma un mes calendario sin desbordar a otro mes cuando el mes destino tiene
 * menos dias (ej. 31 de enero -> 28/29 de febrero, nunca 3 de marzo). Solo se
 * calcula desde el pago aprobado, independientemente de la renovacion.
 */
function addOneMonthClamped(date: Date): Date {
  const targetMonthIndex = date.getMonth() + 1;
  const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const result = new Date(date);
  result.setFullYear(targetYear, targetMonth, Math.min(date.getDate(), lastDayOfTargetMonth));
  return result;
}

/**
 * Un intento sin `mercadoPagoSubscriptionId` confirmado es una creacion en
 * curso (otra pestaña) o un intento previo que fallo/se abandono. Como una
 * preapproval sin autorizar nunca cobra nada, pasado STALE_ATTEMPT_MS es
 * seguro liberarlo sin riesgo de cobro duplicado. Se usa desde ambas
 * functions para no dejar nunca al usuario bloqueado indefinidamente.
 */
async function liberarIntentoObsoleto(
  ref: FirebaseFirestore.DocumentReference,
  data: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!data?.attempt || data?.mercadoPagoSubscriptionId) return data;
  if (Date.now() - attemptCreatedAtMs(data) < STALE_ATTEMPT_MS) return data;
  logger.info("Intento de suscripcion obsoleto liberado", {path: ref.path, attempt: data.attempt});
  await ref.delete();
  return undefined;
}

/** Conserva un historial de la suscripcion reemplazada antes de liberar el registro actual. */
async function archivarSuscripcionAnterior(data: Record<string, unknown>, estadoFinal: string) {
  const subscriptionId = String(data.mercadoPagoSubscriptionId || "");
  if (!subscriptionId) return;
  await getFirestore().doc(`suscripcionesMercadoPago/${subscriptionId}`).set({
    negocioId: data.negocioId, usuarioId: data.usuarioId, status: estadoFinal,
    amount: data.amount, currency: data.currency, payerEmail: data.payerEmail,
    createdAt: data.createdAt || null,
    cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

export const crearSuscripcionMercadoPago = onCall(options, async (request) => {
  const uid = await owner(request.auth?.uid);
  const email = resolverPayerEmail(request);
  const seller = await mp("/users/me");
  const ref = getFirestore().doc(`premium_subscriptions/${uid}`);

  let current = await liberarIntentoObsoleto(ref, (await ref.get()).data());
  if (current?.attempt && !current?.mercadoPagoSubscriptionId) {
    throw new HttpsError("failed-precondition", "Ya hay una solicitud en proceso. Espera unos segundos e intenta de nuevo.");
  }

  if (current?.mercadoPagoSubscriptionId) {
    const subscription = await mp(`/preapproval/${encodeURIComponent(String(current.mercadoPagoSubscriptionId))}`);
    if (subscription.status === "authorized") {
      return {alreadyActive: true};
    }
    const montoVigente = Number(subscription.auto_recurring?.transaction_amount) === PREMIUM_AMOUNT;
    if (subscription.status === "pending" && montoVigente) {
      return {url: checkoutUrl(subscription.init_point)};
    }
    // cancelled/paused, o un pending con un precio ya desactualizado (ej. el
    // importe de pruebas): se cancela en Mercado Pago (si no lo estaba ya)
    // para que ese checkout viejo no se pueda autorizar despues, se archiva
    // como historial y se libera el registro para poder crear una nueva al
    // precio vigente.
    if (subscription.status !== "cancelled") {
      await mp(`/preapproval/${encodeURIComponent(String(current.mercadoPagoSubscriptionId))}`, {status: "cancelled"}, "PUT")
        .catch((err) => logger.error("No se pudo cancelar la suscripcion obsoleta en Mercado Pago", {
          uid, subscriptionId: current?.mercadoPagoSubscriptionId, message: err instanceof Error ? err.message : String(err),
        }));
    }
    await archivarSuscripcionAnterior(current, "cancelled");
    await ref.delete();
    logger.info("Suscripcion Mercado Pago anterior liberada para reactivar", {
      uid, subscriptionId: current.mercadoPagoSubscriptionId, status: subscription.status, montoVigente,
    });
  }

  const attempt = randomUUID();
  await getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data();
    if (data?.mercadoPagoSubscriptionId || data?.attempt) {
      throw new HttpsError("failed-precondition", "Ya hay una solicitud en proceso. Espera unos segundos e intenta de nuevo.");
    }
    tx.set(ref, {attempt, negocioId: uid, usuarioId: uid, payerEmail: email, sellerId: String(seller.id),
      amount: PREMIUM_AMOUNT, currency: PREMIUM_CURRENCY,
      status: "creating", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  });
  try {
    const subscription = await mp("/preapproval", {
      reason: "CajaLibre Premium",
      external_reference: attempt,
      payer_email: email,
      auto_recurring: {frequency: 1, frequency_type: "months", transaction_amount: PREMIUM_AMOUNT, currency_id: PREMIUM_CURRENCY},
      back_url: returnUrl,
      status: "pending",
    });
    if (!subscription.id) throw new Error("Missing subscription ID");
    // Save the ID before parsing the URL, so a bad response cannot cause a duplicate.
    await ref.update({mercadoPagoSubscriptionId: String(subscription.id), status: subscription.status,
      updatedAt: FieldValue.serverTimestamp()});
    logger.info("Suscripcion Mercado Pago creada", {uid, subscriptionId: subscription.id, status: subscription.status});
    return {url: checkoutUrl(subscription.init_point)};
  } catch (error) {
    // No se deja ningun flag permanente: la siguiente llamada libera este
    // intento automaticamente pasado STALE_ATTEMPT_MS (ver liberarIntentoObsoleto).
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", "No se pudo completar la solicitud. Vuelve a intentarlo en un momento.");
  }
});

async function buscarPagoAprobado(externalReference: string, subscriptionId: string, sellerId: string) {
  // Los cobros recurrentes no siempre conservan external_reference en Payment.
  // La factura vincula de forma explicita el pago con la suscripcion.
  const invoices = await mp(`/authorized_payments/search?preapproval_id=${encodeURIComponent(subscriptionId)}`);
  const candidates = (Array.isArray(invoices.results) ? invoices.results : [])
    .sort((a: {date_created?: string}, b: {date_created?: string}) =>
      String(b.date_created || "").localeCompare(String(a.date_created || "")));
  for (const invoice of candidates) {
    if (String(invoice.preapproval_id) !== subscriptionId || invoice.payment?.status !== "approved") continue;
    const pago = await mp(`/v1/payments/${encodeURIComponent(String(invoice.payment.id))}`);
    if (pago.status === "approved" && String(pago.collector_id) === sellerId) return pago;
  }
  const result = await mp(`/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`);
  const pagos = Array.isArray(result.results) ? result.results : [];
  return pagos.find((pago: Record<string, unknown>) => pago?.status === "approved" &&
    String(pago.collector_id) === sellerId && pago.external_reference === externalReference) || null;
}

async function recuperarPagosArchivados(uid: string) {
  const archive = await getFirestore().collection("suscripcionesMercadoPago").where("negocioId", "==", uid).get();
  for (const document of archive.docs) {
    if (document.data().pagosReconciliados === true) continue;
    const subscription = await mp(`/preapproval/${encodeURIComponent(document.id)}`);
    const pago = await buscarPagoAprobado(String(subscription.external_reference || ""), document.id, String(subscription.collector_id));
    if (pago) {
      await activarPremium(uid, pago, document.id, subscription);
      await document.ref.set({pagosReconciliados: true}, {merge: true});
    }
  }
}

/**
 * Activa o EXTIENDE el acceso Premium tras confirmar un pago aprobado real.
 * El acceso (premiumUntil) es independiente del estado de la suscripcion:
 * esta funcion es el unico lugar que escribe premiumUntil, y es idempotente
 * por pago (usa el id de Mercado Pago como doc id dentro de una transaccion,
 * asi que reprocesar el mismo pago 2+ veces nunca extiende dos veces).
 */
async function activarPremium(
  uid: string,
  pago: Record<string, unknown>,
  subscriptionId: string,
  subscription?: Record<string, unknown>,
) {
  const paymentId = String(pago.id);
  const negocioRef = getFirestore().doc(`negocios/${uid}`);
  const pagoRef = getFirestore().doc(`negocios/${uid}/pagos_premium/${paymentId}`);

  await getFirestore().runTransaction(async (tx) => {
    const [negocioSnap, pagoSnap] = await Promise.all([tx.get(negocioRef), tx.get(pagoRef)]);
    const negocioData = negocioSnap.data() || {};
    const vigenciaActual = toDate(negocioData.premiumUntil);
    const registrado = pagoSnap.data();
    // Reconciliar un pago antiguo usa su fecha original, nunca la fecha de
    // consulta. Un webhook repetido no compra otro mes.
    const fechaPago = toDate(pago.date_approved) || toDate(registrado?.fecha);
    if (!fechaPago) throw new HttpsError("failed-precondition", "El pago aprobado no tiene fecha valida.");
    const vencimientoRegistrado = toDate(registrado?.premiumUntilResultante);
    const premiumUntil = vencimientoRegistrado || addOneMonthClamped(fechaPago);
    const vigenciaFinal = vigenciaActual && vigenciaActual > premiumUntil ? vigenciaActual : premiumUntil;
    const vigente = vigenciaFinal.getTime() > Date.now();
    const renueva = subscription?.status === "authorized";

    tx.set(negocioRef, {
      premium: vigente,
      planActual: vigente ? "Premium" : "Gratuito",
      gratuito: !vigente,
      ...(!vigenciaActual || premiumUntil >= vigenciaActual ? {
        ...(subscription ? {cobrosAutomaticos: renueva, renovacionAutomatica: renueva} : {}),
      } : {}),
      premiumProveedor: "mercadopago",
      premiumSubscriptionId: subscriptionId,
      premiumUltimoPagoId: paymentId,
      premiumUltimoPago: FieldValue.serverTimestamp(),
      premiumUntil: vigenciaFinal,
      premiumProximoPago: renueva ? vigenciaFinal : null,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    if (pagoSnap.exists) return;
    tx.set(pagoRef, {
      monto: Number(pago.transaction_amount) || PREMIUM_AMOUNT,
      moneda: String(pago.currency_id || PREMIUM_CURRENCY),
      estado: "approved",
      metodoPago: String(pago.payment_method_id || "mercadopago"),
      subscriptionId,
      fecha: toDate(pago.date_approved) || FieldValue.serverTimestamp(),
      premiumUntilResultante: premiumUntil,
      usoRespaldoFechaCalculada: true,
      createdAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
}

/** Revoca Premium de inmediato. Solo debe llamarse cuando ya vencio premiumUntil. */
async function desactivarPremium(uid: string) {
  await getFirestore().doc(`negocios/${uid}`).set({
    premium: false,
    planActual: "Gratuito",
    gratuito: true,
    cobrosAutomaticos: false,
    renovacionAutomatica: false,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

/**
 * Detiene solo la renovacion automatica (lo que hace "cancelar" en Mercado
 * Pago). NUNCA apaga Premium aqui: el acceso ya pagado se respeta hasta
 * premiumUntil, ver expirarSiVencido.
 */
async function detenerRenovacionAutomatica(uid: string) {
  await getFirestore().doc(`negocios/${uid}`).set({
    renovacionAutomatica: false,
    cobrosAutomaticos: false,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

/** Si el periodo ya pagado vencio y sigue marcado Premium, lo revoca. Es seguro llamarla siempre. */
async function expirarSiVencido(uid: string): Promise<void> {
  const negocio = (await getFirestore().doc(`negocios/${uid}`).get()).data();
  if (!negocio || negocio.premium !== true) return;
  const vigencia = toDate(negocio.premiumUntil);
  if (vigencia && vigencia.getTime() > Date.now()) return;
  await desactivarPremium(uid);
  logger.info("Premium vencido: acceso revocado", {uid});
}

/** Estado efectivo de Premium (fuente de verdad para el frontend): premiumUntil vigente. */
async function premiumVigente(uid: string): Promise<boolean> {
  const negocio = (await getFirestore().doc(`negocios/${uid}`).get()).data();
  const vigencia = toDate(negocio?.premiumUntil);
  return Boolean(vigencia && vigencia.getTime() > Date.now());
}

export const consultarSuscripcionMercadoPago = onCall(options, async (request) => {
  const uid = await owner(request.auth?.uid);
  const ref = getFirestore().doc(`premium_subscriptions/${uid}`);
  const data = await liberarIntentoObsoleto(ref, (await ref.get()).data());
  await recuperarPagosArchivados(uid);
  if (!data?.mercadoPagoSubscriptionId) {
    await expirarSiVencido(uid);
    return {status: data?.attempt ? "review" : "none", premiumActivo: await premiumVigente(uid)};
  }
  const subscription = await mp(`/preapproval/${encodeURIComponent(String(data.mercadoPagoSubscriptionId))}`);
  if (subscription.external_reference !== data.attempt ||
      String(subscription.collector_id) !== data.sellerId) {
    throw new HttpsError("failed-precondition", "La suscripción no corresponde a este negocio.");
  }
  const updates: Record<string, unknown> = {status: subscription.status, updatedAt: FieldValue.serverTimestamp()};
  if (["authorized", "cancelled", "paused"].includes(subscription.status)) {
    const pago = await buscarPagoAprobado(String(data.attempt), String(data.mercadoPagoSubscriptionId), String(data.sellerId));
    if (pago) {
      await activarPremium(uid, pago, String(data.mercadoPagoSubscriptionId), subscription);
      updates.premiumGranted = true;
      updates.premiumPaymentId = String(pago.id);
    }
  }
  if (["cancelled", "paused"].includes(subscription.status)) {
    // Cancelar/pausar solo detiene la renovacion automatica. El acceso ya
    // pagado (premiumUntil) se respeta; expirarSiVencido decide mas abajo si
    // ya toca revocarlo.
    await detenerRenovacionAutomatica(uid);
  }
  await ref.update(updates);
  await expirarSiVencido(uid);
  const premiumActivo = await premiumVigente(uid);
  logger.info("Suscripcion Mercado Pago consultada", {uid, subscriptionId: data.mercadoPagoSubscriptionId, status: subscription.status, premiumActivo});
  return {status: String(subscription.status), premiumActivo};
});

export const cancelarSuscripcionMercadoPago = onCall(options, async (request) => {
  const uid = await owner(request.auth?.uid);
  const ref = getFirestore().doc(`premium_subscriptions/${uid}`);
  const data = (await ref.get()).data();
  if (!data?.mercadoPagoSubscriptionId) {
    throw new HttpsError("failed-precondition", "No hay una suscripción activa para cancelar.");
  }
  const subscription = await mp(
    `/preapproval/${encodeURIComponent(String(data.mercadoPagoSubscriptionId))}`,
    {status: "cancelled"},
    "PUT",
  );
  await ref.update({status: String(subscription.status || "cancelled"), updatedAt: FieldValue.serverTimestamp()});
  // Cancelar solo detiene el proximo cobro: el periodo ya pagado
  // (premiumUntil) se respeta y Premium sigue activo hasta esa fecha.
  const pago = await buscarPagoAprobado(String(data.attempt), String(data.mercadoPagoSubscriptionId), String(data.sellerId));
  if (pago) await activarPremium(uid, pago, String(data.mercadoPagoSubscriptionId), subscription);
  await detenerRenovacionAutomatica(uid);
  logger.info("Suscripcion Mercado Pago cancelada por el titular (Premium vigente hasta premiumUntil)",
    {uid, subscriptionId: data.mercadoPagoSubscriptionId});
  return {status: String(subscription.status || "cancelled")};
});

async function resolverPruebaPorReferencia(externalReference: string) {
  if (!externalReference) return null;
  const snap = await getFirestore().collection("premium_subscriptions")
    .where("attempt", "==", externalReference).limit(1).get();
  if (snap.empty) return null;
  return {uid: snap.docs[0].id, ref: snap.docs[0].ref, data: snap.docs[0].data() as Record<string, unknown>};
}

/**
 * Valida la firma HMAC de Mercado Pago (algoritmo documentado de webhooks v2).
 * Devuelve el data.id del recurso notificado, o null si la firma no es válida.
 */
function verificarFirmaWebhook(headers: Record<string, unknown>, query: Record<string, unknown>): string | null {
  const signatureHeader = String(headers["x-signature"] || "");
  const requestId = String(headers["x-request-id"] || "");
  const dataId = String(query["data.id"] || query["id"] || "").trim();
  if (!signatureHeader || !requestId || !dataId) return null;

  let ts = "";
  let hash = "";
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=").map((s) => s.trim());
    if (key === "ts") ts = value || "";
    if (key === "v1") hash = value || "";
  }
  if (!ts || !hash) return null;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", webhookSecret.value()).update(manifest).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(hash, "hex");
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) return null;
  return dataId;
}

/**
 * Recibe notificaciones de Mercado Pago (pagos y cambios de suscripción) para
 * activar o revocar Premium sin depender de que el titular vuelva a la app.
 * Nunca confía en el cuerpo de la notificación: siempre vuelve a consultar el
 * recurso por su ID contra la API antes de tomar una acción.
 */
export const mercadoPagoWebhook = onRequest(
  {region: "southamerica-east1", secrets: [accessToken, webhookSecret], invoker: "public"},
  async (request, response) => {
    try {
      const dataId = verificarFirmaWebhook(
        request.headers as Record<string, unknown>,
        request.query as Record<string, unknown>,
      );
      if (!dataId) {
        response.status(401).send("firma invalida");
        return;
      }

      const tipo = String((request.query.type as string) || (request.query.topic as string) || "");

      if (tipo === "payment") {
        const pago = await mp(`/v1/payments/${encodeURIComponent(dataId)}`);
        const prueba = await resolverPruebaPorReferencia(String(pago.external_reference || ""));
        if (prueba && String(pago.collector_id) === String(prueba.data.sellerId)) {
          if (pago.status === "approved") {
            // Se busca la preapproval para usar next_payment_date (fuente
            // mas confiable); si falla, activarPremium usa su respaldo.
            const subscriptionId = String(prueba.data.mercadoPagoSubscriptionId || "");
            const subscription = subscriptionId
              ? await mp(`/preapproval/${encodeURIComponent(subscriptionId)}`).catch(() => undefined)
              : undefined;
            await activarPremium(prueba.uid, pago, subscriptionId, subscription);
            await prueba.ref.update({
              premiumGranted: true, premiumPaymentId: String(pago.id),
              ...(subscription ? {status: subscription.status} : {}), updatedAt: FieldValue.serverTimestamp(),
            });
            logger.info("Pago Mercado Pago aprobado", {uid: prueba.uid, paymentId: pago.id});
          } else {
            // Registra el problema de cobro sin desactivar Premium: el
            // titular puede tener un periodo de gracia hasta que vence
            // premiumUntil (ver expirarSiVencido).
            logger.info("Pago Mercado Pago no aprobado", {uid: prueba.uid, paymentId: pago.id, status: pago.status});
            await prueba.ref.update({
              ultimoPagoProblemaId: String(pago.id), ultimoPagoProblemaEstado: String(pago.status),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          await expirarSiVencido(prueba.uid);
        }
      } else if (tipo === "subscription_preapproval" || tipo === "preapproval") {
        const subscription = await mp(`/preapproval/${encodeURIComponent(dataId)}`);
        const prueba = await resolverPruebaPorReferencia(String(subscription.external_reference || ""));
        if (prueba && String(subscription.collector_id) === String(prueba.data.sellerId)) {
          if (["authorized", "cancelled", "paused"].includes(subscription.status)) {
            const pago = await buscarPagoAprobado(String(subscription.external_reference || ""), String(subscription.id || dataId), String(prueba.data.sellerId));
            if (pago) {
              await activarPremium(prueba.uid, pago, String(subscription.id || dataId), subscription);
              await prueba.ref.update({
                premiumGranted: true, premiumPaymentId: String(pago.id),
                status: subscription.status, updatedAt: FieldValue.serverTimestamp(),
              });
              logger.info("Premium activado/extendido por webhook", {uid: prueba.uid, subscriptionId: subscription.id});
            } else {
              await prueba.ref.update({status: subscription.status, updatedAt: FieldValue.serverTimestamp()});
            }
          }
          if (["cancelled", "paused"].includes(subscription.status)) {
            // Cancelar/pausar solo detiene la renovacion automatica. El
            // acceso ya pagado (premiumUntil) se respeta hasta que venza.
            await detenerRenovacionAutomatica(prueba.uid);
            await prueba.ref.update({status: subscription.status, updatedAt: FieldValue.serverTimestamp()});
            logger.info("Renovacion automatica detenida por webhook (Premium vigente hasta premiumUntil)",
              {uid: prueba.uid, subscriptionId: subscription.id, status: subscription.status});
          } else {
            await prueba.ref.update({status: subscription.status, updatedAt: FieldValue.serverTimestamp()});
          }
          await expirarSiVencido(prueba.uid);
        }
      }

      response.status(200).send("ok");
    } catch (error) {
      // Nunca registrar credenciales ni el cuerpo completo de la notificacion.
      logger.error("mercadoPagoWebhook error", {message: error instanceof Error ? error.message : String(error)});
      // Respond 500 so Mercado Pago retries the notification later.
      response.status(500).send("error temporal");
    }
  },
);
