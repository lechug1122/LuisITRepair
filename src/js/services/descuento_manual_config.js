import { getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getTenantConfigDocRef, withTenantData } from "./tenant";

const CONFIG_DOCUMENT = "descuento_manual";
const DISCOUNT_PERCENT = 10;

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${String(password || "")}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export async function obtenerConfigDescuentoManual() {
  const snap = await getDoc(getTenantConfigDocRef(CONFIG_DOCUMENT));
  const data = snap.exists() ? snap.data() : {};
  return {
    configurado: Boolean(data?.passwordHash && data?.passwordSalt),
    porcentaje: DISCOUNT_PERCENT,
    passwordHash: String(data?.passwordHash || ""),
    passwordSalt: String(data?.passwordSalt || ""),
  };
}

export async function guardarPasswordDescuentoManual(password) {
  const limpia = String(password || "").trim();
  if (limpia.length < 4) throw new Error("La contraseña debe tener al menos 4 caracteres.");

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const passwordSalt = bytesToHex(saltBytes);
  const passwordHash = await hashPassword(limpia, passwordSalt);
  await setDoc(
    getTenantConfigDocRef(CONFIG_DOCUMENT),
    {
      ...withTenantData({ passwordHash, passwordSalt, porcentaje: DISCOUNT_PERCENT }),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { configurado: true, porcentaje: DISCOUNT_PERCENT };
}

export async function validarPasswordDescuentoManual(password, config = null) {
  const actual = config || await obtenerConfigDescuentoManual();
  if (!actual.configurado) return false;
  const candidate = await hashPassword(String(password || "").trim(), actual.passwordSalt);
  return candidate === actual.passwordHash;
}

