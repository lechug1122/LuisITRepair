import { collection, doc, query, where } from "firebase/firestore";
import { auth, db } from "../../initializer/firebase";

const TENANT_CONTEXT_STORAGE_KEY = "tenant_context_v1";

function normalizeId(value) {
  return String(value || "").trim();
}

export function readTenantContext() {
  if (typeof window === "undefined") {
    return {
      uid: "",
      cuentaPrincipalUid: "",
      superAdmin: false,
      suscripcionControlada: false,
    };
  }

  try {
    const raw = window.localStorage.getItem(TENANT_CONTEXT_STORAGE_KEY);
    if (!raw) {
      return {
        uid: "",
        cuentaPrincipalUid: "",
        superAdmin: false,
        suscripcionControlada: false,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      uid: normalizeId(parsed?.uid),
      cuentaPrincipalUid: normalizeId(parsed?.cuentaPrincipalUid),
      superAdmin: parsed?.superAdmin === true,
      suscripcionControlada: parsed?.suscripcionControlada === true,
    };
  } catch {
    return {
      uid: "",
      cuentaPrincipalUid: "",
      superAdmin: false,
      suscripcionControlada: false,
    };
  }
}

export function saveTenantContext(context = {}) {
  if (typeof window === "undefined") return;

  const normalized = {
    uid: normalizeId(context?.uid),
    cuentaPrincipalUid: normalizeId(context?.cuentaPrincipalUid || context?.uid),
    superAdmin: context?.superAdmin === true,
    suscripcionControlada: context?.suscripcionControlada === true,
  };

  try {
    window.localStorage.setItem(TENANT_CONTEXT_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // noop
  }
}

export function clearTenantContext() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(TENANT_CONTEXT_STORAGE_KEY);
  } catch {
    // noop
  }
}

export function resolveTenantId(explicitTenantId = "") {
  const provided = normalizeId(explicitTenantId);
  if (provided) return provided;

  const cached = readTenantContext();
  if (cached.cuentaPrincipalUid) return cached.cuentaPrincipalUid;

  try {
    return normalizeId(auth?.currentUser?.uid);
  } catch {
    return "";
  }
}

export function allowLegacyTenantFallback() {
  const context = readTenantContext();
  return context.superAdmin === true || context.suscripcionControlada !== true;
}

export function dataBelongsToTenant(raw = {}, tenantId = "", options = {}) {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!resolvedTenantId) return true;

  const owner = normalizeId(raw?.cuentaPrincipalUid);
  if (owner) return owner === resolvedTenantId;

  return options.allowLegacyFallback ?? allowLegacyTenantFallback();
}

export function filterItemsByTenant(items = [], tenantId = "", getData = null, options = {}) {
  return items.filter((item) => {
    const data = typeof getData === "function" ? getData(item) : item;
    return dataBelongsToTenant(data, tenantId, options);
  });
}

export function withTenantData(raw = {}, tenantId = "") {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!resolvedTenantId) return { ...raw };
  return {
    ...raw,
    cuentaPrincipalUid: resolvedTenantId,
  };
}

export function buildTenantStorageKey(baseKey, tenantId = "") {
  const resolvedTenantId = resolveTenantId(tenantId) || "anon";
  return `${baseKey}_${resolvedTenantId}`;
}

export function getTenantConfigDocRef(name, tenantId = "") {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!resolvedTenantId) return doc(db, "configuracion", name);
  return doc(db, "configuracion", `${name}__${resolvedTenantId}`);
}

export function getLegacyConfigDocRef(name) {
  return doc(db, "configuracion", name);
}

export function getCollectionRef(name) {
  return collection(db, name);
}

export function getDocRef(collectionName, id) {
  return doc(db, collectionName, id);
}

export function getTenantCollectionQuery(name, tenantId = "") {
  const resolvedTenantId = resolveTenantId(tenantId);
  if (!resolvedTenantId) return collection(db, name);
  return query(collection(db, name), where("cuentaPrincipalUid", "==", resolvedTenantId));
}
