import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../initializer/firebase";

const POS_MOBILE_SCANS_COL = "pos_mobile_scans";

export async function enviarScanPosMovil({
  uid,
  termino,
  actorUid = "",
  actorEmail = "",
}) {
  const uidFinal = String(uid || "").trim();
  const terminoFinal = String(termino || "").trim();

  if (!uidFinal) throw new Error("UID requerido para sincronizar.");
  if (!terminoFinal) throw new Error("Codigo vacio.");

  const payload = {
    uid: uidFinal,
    termino: terminoFinal,
    status: "pending",
    source: "mobile",
    actorUid: String(actorUid || "").trim(),
    actorEmail: String(actorEmail || "").trim(),
    attempts: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, POS_MOBILE_SCANS_COL), payload);
  return { id: ref.id };
}

export function suscribirScansPosUsuario(uid, onItems, onError) {
  const uidFinal = String(uid || "").trim();
  if (!uidFinal) return () => {};

  const q = query(
    collection(db, POS_MOBILE_SCANS_COL),
    where("uid", "==", uidFinal),
  );

  return onSnapshot(
    q,
    (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onItems?.(data);
    },
    (err) => {
      onError?.(err);
    },
  );
}

export async function reclamarScanPosPendiente(id, processorId = "") {
  const docId = String(id || "").trim();
  if (!docId) return { ok: false, reason: "id_vacio" };

  const ref = doc(db, POS_MOBILE_SCANS_COL, docId);
  const procId = String(processorId || "").trim();

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return { ok: false, reason: "no_existe" };

    const data = snap.data() || {};
    if (String(data.status || "") !== "pending") {
      return { ok: false, reason: "ya_tomado" };
    }

    tx.update(ref, {
      status: "processing",
      processingBy: procId,
      processingAt: serverTimestamp(),
      attempts: Number(data.attempts || 0) + 1,
      updatedAt: serverTimestamp(),
    });

    return { ok: true, scan: { id: docId, ...data } };
  });
}

export async function finalizarScanPos(
  id,
  { status = "processed", result = null, message = "" } = {},
) {
  const docId = String(id || "").trim();
  if (!docId) return;

  const ref = doc(db, POS_MOBILE_SCANS_COL, docId);
  await updateDoc(ref, {
    status: status === "error" ? "error" : "processed",
    result: result || null,
    message: String(message || "").trim(),
    processedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

