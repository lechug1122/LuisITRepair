import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../initializer/firebase";
import { toDate } from "./suscripciones";

const DEVICE_SESSION_COLLECTION = "sesiones_dispositivo";
const DEVICE_ID_STORAGE_KEY = "current_device_session_id_v1";
const DEVICE_CONFLICT_MESSAGE_KEY = "device_session_conflict_message_v1";
const DEVICE_SESSION_TTL_MS = 10 * 60 * 1000;
const DEVICE_HEARTBEAT_MS = 45 * 1000;

function randomSegment() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeId(value) {
  return String(value || "").trim();
}

function detectBrowserName() {
  if (typeof navigator === "undefined") return "Navegador";
  const ua = String(navigator.userAgent || "");
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/")) return "Safari";
  return "Navegador";
}

function detectOsName() {
  if (typeof navigator === "undefined") return "equipo";
  const ua = String(navigator.userAgent || "");
  const platform = String(navigator.platform || "");

  if (/Windows/i.test(platform) || /Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(platform) || /Mac OS/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return "Linux";
  return "equipo";
}

export function getCurrentDeviceId() {
  if (typeof window === "undefined") return `server-${randomSegment()}`;

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;

    const created = `dev-${Date.now()}-${randomSegment()}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return `fallback-${Date.now()}-${randomSegment()}`;
  }
}

export function getCurrentDeviceLabel() {
  return `${detectBrowserName()} en ${detectOsName()}`;
}

function getCurrentSessionDocId(uid, deviceId = getCurrentDeviceId()) {
  return `${normalizeId(uid)}__${normalizeId(deviceId)}`;
}

function getCurrentSessionDocRef(uid, deviceId = getCurrentDeviceId()) {
  return doc(db, DEVICE_SESSION_COLLECTION, getCurrentSessionDocId(uid, deviceId));
}

function isMainAccountLimited(autorizado = {}) {
  const uid = normalizeId(autorizado?.uid);
  const cuentaPrincipalUid = normalizeId(autorizado?.cuentaPrincipalUid);
  return (
    autorizado?.superAdmin !== true &&
    autorizado?.suscripcionControlada === true &&
    cuentaPrincipalUid &&
    uid &&
    cuentaPrincipalUid === uid
  );
}

export function getOwnerDeviceLimit(suscripcion = null) {
  const parsed = Number(suscripcion?.dispositivosTitularPermitidos);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

function toMillis(value) {
  const parsed = toDate(value);
  return parsed ? parsed.getTime() : 0;
}

function isSessionRecentlyActive(session = {}, nowMs = Date.now()) {
  if (session?.activa !== true) return false;
  const lastSeenMs = toMillis(session?.lastSeen || session?.updatedAt || session?.createdAt);
  if (!lastSeenMs) return true;
  return nowMs - lastSeenMs <= DEVICE_SESSION_TTL_MS;
}

export function normalizeDeviceSession(raw = {}, id = "") {
  return {
    id: normalizeId(id || raw?.id),
    uid: normalizeId(raw?.uid),
    cuentaPrincipalUid: normalizeId(raw?.cuentaPrincipalUid),
    deviceId: normalizeId(raw?.deviceId),
    deviceLabel: String(raw?.deviceLabel || "").trim() || "Equipo",
    activa: raw?.activa === true,
    createdAt: toDate(raw?.createdAt),
    updatedAt: toDate(raw?.updatedAt),
    lastSeen: toDate(raw?.lastSeen),
    closedAt: toDate(raw?.closedAt),
    closedReason: String(raw?.closedReason || "").trim(),
    esCuentaPrincipal: raw?.esCuentaPrincipal === true,
  };
}

async function fetchUserDeviceSessions(uid) {
  const safeUid = normalizeId(uid);
  if (!safeUid) return [];

  const snapshot = await getDocs(
    query(collection(db, DEVICE_SESSION_COLLECTION), where("uid", "==", safeUid)),
  );

  return snapshot.docs
    .map((item) => normalizeDeviceSession(item.data(), item.id))
    .sort((a, b) => toMillis(b.lastSeen || b.updatedAt || b.createdAt) - toMillis(a.lastSeen || a.updatedAt || a.createdAt));
}

function buildCurrentSessionPayload(uid, autorizado = {}) {
  const safeUid = normalizeId(uid);
  const cuentaPrincipalUid = normalizeId(autorizado?.cuentaPrincipalUid || safeUid);

  return {
    uid: safeUid,
    cuentaPrincipalUid,
    deviceId: getCurrentDeviceId(),
    deviceLabel: getCurrentDeviceLabel(),
    activa: true,
    esCuentaPrincipal: true,
    updatedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    closedAt: null,
    closedReason: null,
  };
}

export async function ensureCurrentDeviceSessionAccess({
  uid = "",
  autorizado = {},
  suscripcion = null,
} = {}) {
  const safeUid = normalizeId(uid);
  const safeAutorizado = { ...autorizado, uid: safeUid };

  if (!isMainAccountLimited(safeAutorizado)) {
    return {
      permitido: true,
      aplicaLimite: false,
      sesionesActivas: [],
      otrasSesionesActivas: [],
      limite: null,
    };
  }

  const limite = getOwnerDeviceLimit(suscripcion);
  const currentDeviceId = getCurrentDeviceId();
  const sessions = await fetchUserDeviceSessions(safeUid);
  const sesionesActivas = sessions.filter((item) => isSessionRecentlyActive(item));
  const currentSession = sesionesActivas.find((item) => item.deviceId === currentDeviceId) || null;
  const otrasSesionesActivas = sesionesActivas.filter((item) => item.deviceId !== currentDeviceId);
  const totalActivoConActual = currentSession ? sesionesActivas.length : sesionesActivas.length + 1;

  if (totalActivoConActual > limite) {
    return {
      permitido: false,
      aplicaLimite: true,
      requiereCerrarSesiones: true,
      limite,
      sesionesActivas,
      otrasSesionesActivas,
      mensaje:
        limite === 1
          ? "Hay mas de un equipo abierto con esta cuenta principal. Cierra las otras sesiones o sal del sistema."
          : `Ya superaste el limite de ${limite} equipos simultaneos para esta cuenta principal.`,
    };
  }

  await setDoc(
    getCurrentSessionDocRef(safeUid, currentDeviceId),
    {
      ...buildCurrentSessionPayload(safeUid, safeAutorizado),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    permitido: true,
    aplicaLimite: true,
    requiereCerrarSesiones: false,
    limite,
    sesionesActivas,
    otrasSesionesActivas,
    mensaje: "",
  };
}

export async function closeOtherSessionsAndKeepCurrent({
  uid = "",
  autorizado = {},
} = {}) {
  const safeUid = normalizeId(uid);
  const safeAutorizado = { ...autorizado, uid: safeUid };
  const currentDeviceId = getCurrentDeviceId();
  const sessions = await fetchUserDeviceSessions(safeUid);
  const batch = writeBatch(db);

  sessions.forEach((item) => {
    if (!item.id || item.deviceId === currentDeviceId) return;

    batch.set(
      doc(db, DEVICE_SESSION_COLLECTION, item.id),
      {
        activa: false,
        updatedAt: serverTimestamp(),
        closedAt: serverTimestamp(),
        closedReason: "closed_from_another_device",
      },
      { merge: true },
    );
  });

  batch.set(
    getCurrentSessionDocRef(safeUid, currentDeviceId),
    {
      ...buildCurrentSessionPayload(safeUid, safeAutorizado),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
}

export async function heartbeatCurrentDeviceSession(uid) {
  const safeUid = normalizeId(uid);
  if (!safeUid) return;

  await setDoc(
    getCurrentSessionDocRef(safeUid),
    {
      uid: safeUid,
      deviceId: getCurrentDeviceId(),
      deviceLabel: getCurrentDeviceLabel(),
      activa: true,
      updatedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      closedAt: null,
      closedReason: null,
    },
    { merge: true },
  );
}

export async function closeCurrentDeviceSession(uid, reason = "manual_logout") {
  const safeUid = normalizeId(uid);
  if (!safeUid) return;

  await setDoc(
    getCurrentSessionDocRef(safeUid),
    {
      uid: safeUid,
      deviceId: getCurrentDeviceId(),
      deviceLabel: getCurrentDeviceLabel(),
      activa: false,
      updatedAt: serverTimestamp(),
      closedAt: serverTimestamp(),
      closedReason: String(reason || "manual_logout").trim(),
    },
    { merge: true },
  );
}

export function listenToCurrentDeviceSession(uid, onValue, onError) {
  const safeUid = normalizeId(uid);
  if (!safeUid) return () => {};

  return onSnapshot(
    getCurrentSessionDocRef(safeUid),
    (snapshot) => {
      const data = snapshot.exists()
        ? normalizeDeviceSession(snapshot.data(), snapshot.id)
        : null;
      onValue?.(data);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function applyCurrentDeviceSessionHeartbeat(uid) {
  const safeUid = normalizeId(uid);
  if (!safeUid) return () => {};

  let heartbeatId = null;

  const ping = () => {
    heartbeatCurrentDeviceSession(safeUid).catch(() => {});
  };

  ping();
  heartbeatId = window.setInterval(ping, DEVICE_HEARTBEAT_MS);

  const onPageHide = () => {
    closeCurrentDeviceSession(safeUid, "page_hide").catch(() => {});
  };

  window.addEventListener("beforeunload", onPageHide);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    if (heartbeatId) {
      window.clearInterval(heartbeatId);
      heartbeatId = null;
    }
    window.removeEventListener("beforeunload", onPageHide);
    window.removeEventListener("pagehide", onPageHide);
    closeCurrentDeviceSession(safeUid, "listener_cleanup").catch(() => {});
  };
}

export function stashDeviceConflictMessage(message) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEVICE_CONFLICT_MESSAGE_KEY, String(message || "").trim());
  } catch {
    // noop
  }
}

export function consumeDeviceConflictMessage() {
  if (typeof window === "undefined") return "";
  try {
    const message = window.sessionStorage.getItem(DEVICE_CONFLICT_MESSAGE_KEY) || "";
    window.sessionStorage.removeItem(DEVICE_CONFLICT_MESSAGE_KEY);
    return String(message || "").trim();
  } catch {
    return "";
  }
}

export async function signOutCurrentSessionWithMessage(message = "") {
  if (message) stashDeviceConflictMessage(message);
  await signOut(auth).catch(() => {});
}
