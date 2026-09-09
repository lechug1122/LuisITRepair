import { getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { buildTenantStorageKey, getTenantConfigDocRef, withTenantData } from "./tenant";

const IVA_STORAGE_KEY = "pos_aplicar_iva";
const PRECIOS_INCLUYEN_IVA_STORAGE_KEY = "pos_precios_incluyen_impuestos";
const IVA_CONFIG_DOC = "iva_pos";

function readBoolean(key, fallback) {
  try {
    const value = localStorage.getItem(buildTenantStorageKey(key));
    if (value === null) {
      const legacy = localStorage.getItem(key);
      return legacy === null ? fallback : legacy === "1";
    }
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

export function readIVAConfigStorage() {
  return {
    aplicarIVA: readBoolean(IVA_STORAGE_KEY, true),
    preciosIncluyenImpuestos: readBoolean(PRECIOS_INCLUYEN_IVA_STORAGE_KEY, false),
  };
}

export function saveIVAConfigStorage({ aplicarIVA, preciosIncluyenImpuestos }) {
  try {
    localStorage.setItem(buildTenantStorageKey(IVA_STORAGE_KEY), aplicarIVA ? "1" : "0");
    localStorage.setItem(
      buildTenantStorageKey(PRECIOS_INCLUYEN_IVA_STORAGE_KEY),
      preciosIncluyenImpuestos ? "1" : "0",
    );
    return true;
  } catch {
    return false;
  }
}

export async function obtenerIVAConfig() {
  const local = readIVAConfigStorage();
  try {
    const snapshot = await getDoc(getTenantConfigDocRef(IVA_CONFIG_DOC));
    if (!snapshot.exists()) return local;
    const remoto = {
      aplicarIVA: snapshot.data()?.aplicarIVA !== false,
      preciosIncluyenImpuestos: snapshot.data()?.preciosIncluyenImpuestos === true,
    };
    saveIVAConfigStorage(remoto);
    return remoto;
  } catch {
    return local;
  }
}

export async function guardarIVAConfig(config) {
  const normalizada = {
    aplicarIVA: config?.aplicarIVA !== false,
    preciosIncluyenImpuestos: config?.preciosIncluyenImpuestos === true,
  };
  saveIVAConfigStorage(normalizada);
  await setDoc(getTenantConfigDocRef(IVA_CONFIG_DOC), {
    ...withTenantData(normalizada),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return normalizada;
}

export function calcularIVA(precio, tasa = 0.16, preciosIncluyenImpuestos = false) {
  const importe = Math.max(0, Number(precio) || 0);
  const rate = Math.max(0, Number(tasa) || 0);
  const redondear = (value) => Number(value.toFixed(2));
  if (rate === 0) {
    const total = redondear(importe);
    return { subtotalSinIVA: total, iva: 0, total };
  }

  const subtotalSinIVA = redondear(preciosIncluyenImpuestos ? importe / (1 + rate) : importe);
  const total = preciosIncluyenImpuestos
    ? redondear(importe)
    : redondear(subtotalSinIVA + subtotalSinIVA * rate);
  const iva = redondear(total - subtotalSinIVA);

  return { subtotalSinIVA, iva, total };
}

export function calcularImpuestosProducto({
  importe,
  cantidad = 1,
  tasaIVA = 0,
  iepsTipo = "ninguno",
  iepsValor = 0,
  preciosIncluyenImpuestos = false,
} = {}) {
  const redondear = (value) => Number(Math.max(0, value).toFixed(2));
  const bruto = Math.max(0, Number(importe) || 0);
  const ivaRate = Math.max(0, Number(tasaIVA) || 0);
  const iepsRate = iepsTipo === "porcentaje" ? Math.max(0, Number(iepsValor) || 0) / 100 : 0;
  const cuotaIEPS = iepsTipo === "cuota"
    ? Math.max(0, Number(iepsValor) || 0) * Math.max(0, Number(cantidad) || 0)
    : 0;

  if (preciosIncluyenImpuestos) {
    const antesIVA = bruto / (1 + ivaRate);
    const base = Math.max(0, (antesIVA - cuotaIEPS) / (1 + iepsRate));
    const ieps = base * iepsRate + cuotaIEPS;
    return {
      subtotalSinImpuestos: redondear(base),
      ieps: redondear(ieps),
      iva: redondear(bruto - antesIVA),
      total: redondear(bruto),
    };
  }

  const ieps = bruto * iepsRate + cuotaIEPS;
  const iva = (bruto + ieps) * ivaRate;
  return {
    subtotalSinImpuestos: redondear(bruto),
    ieps: redondear(ieps),
    iva: redondear(iva),
    total: redondear(bruto + ieps + iva),
  };
}
