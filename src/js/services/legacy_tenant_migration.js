import { getDocRef } from "./tenant";
import { collection, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../../initializer/firebase";

const MIGRATION_KEY_PREFIX = "tenant_legacy_migrated_v1";
const MIGRATION_COLLECTIONS = [
  "clientes",
  "productos",
  "ventas",
  "servicios",
  "proveedores",
  "empleados",
  "autorizados",
];

function getMigrationKey(tenantId = "") {
  return `${MIGRATION_KEY_PREFIX}_${String(tenantId || "").trim()}`;
}

function wasMigrated(tenantId = "") {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(getMigrationKey(tenantId)) === "1";
  } catch {
    return false;
  }
}

function markMigrated(tenantId = "") {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getMigrationKey(tenantId), "1");
  } catch {
    // noop
  }
}

async function backfillCollectionTenant(collectionName, tenantId) {
  const snapshot = await getDocs(collection(db, collectionName));
  const docsToPatch = snapshot.docs.filter((item) => {
    const data = item.data() || {};
    return !String(data?.cuentaPrincipalUid || "").trim();
  });

  for (let index = 0; index < docsToPatch.length; index += 400) {
    const batch = writeBatch(db);
    docsToPatch.slice(index, index + 400).forEach((item) => {
      batch.set(item.ref, { cuentaPrincipalUid: tenantId }, { merge: true });
    });
    await batch.commit();
  }
}

async function ensureConfigTenantCopies(tenantId) {
  const configNames = [
    "empresa",
    "notificaciones",
    "servicios",
    "impresoras",
    "moneda",
    "inventario_categorias",
  ];

  for (const name of configNames) {
    const scopedRef = getDocRef("configuracion", `${name}__${tenantId}`);
    const scopedSnap = await getDoc(scopedRef);
    if (scopedSnap.exists()) continue;

    const legacyRef = getDocRef("configuracion", name);
    const legacySnap = await getDoc(legacyRef);
    if (!legacySnap.exists()) continue;

    const data = legacySnap.data() || {};
    const batch = writeBatch(db);
    batch.set(scopedRef, { ...data, cuentaPrincipalUid: tenantId }, { merge: true });
    await batch.commit();
  }
}

export async function migrateLegacyTenantDataOnce(tenantId = "") {
  const safeTenantId = String(tenantId || "").trim();
  if (!safeTenantId || wasMigrated(safeTenantId)) return false;

  for (const collectionName of MIGRATION_COLLECTIONS) {
    await backfillCollectionTenant(collectionName, safeTenantId);
  }

  await ensureConfigTenantCopies(safeTenantId);
  markMigrated(safeTenantId);
  return true;
}
