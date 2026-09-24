import {getFirestore, FieldValue, Firestore, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {randomUUID} from "node:crypto";

import {borrarArchivo, guardarArchivo, leerImagenBase64} from "./storage_bucket";

// ---------------------------------------------------------------------------
// Evidencias fotograficas de un servicio (funcion Premium).
//
// POR QUE PASAN POR AQUI Y NO SUBEN DIRECTO A STORAGE
//
// El aislamiento por negocio depende de `autorizados/{uid}`: un empleado tiene
// un uid distinto del id de su negocio, asi que la regla de Storage no puede
// deducir a que negocio pertenece sin consultar Firestore. Las reglas de
// Storage de este proyecto NO pueden leer Firestore -- se comprobo con reglas
// de diagnostico: una condicion con `firestore.exists()` o `firestore.get()`
// siempre falla, incluso con el rol de IAM concedido, mientras que la misma
// regla sin Firestore pasa.
//
// Antes que debilitar el aislamiento, la subida pasa por el servidor: aqui el
// SDK de administracion SI puede leer Firestore, comprueba el negocio, el
// permiso y el plan, y escribe el archivo. Las reglas de Storage quedan
// cerradas del todo para los clientes, que es lo mas seguro que se puede
// dejar. Es el mismo camino que ya usaba la firma de aceptacion.
// ---------------------------------------------------------------------------

const REGION = "southamerica-east1";

// La imagen ya llega optimizada desde el navegador (1600 px, JPEG 0.82). Estos
// topes solo cortan lo absurdo; no son la compresion.
const MAX_IMAGEN_BYTES = 4 * 1024 * 1024;
const MAX_MINIATURA_BYTES = 512 * 1024;
const MAX_DESCRIPCION = 160;
const LIMITE_EVIDENCIAS = 60;

const TIPOS = new Set(["ingreso", "diagnostico", "reparacion", "entrega"]);

type Contexto = {
  uid: string;
  negocioId: string;
  nombre: string;
  servicioRef: FirebaseFirestore.DocumentReference;
  servicio: FirebaseFirestore.DocumentData;
};

function idSeguro(valor: unknown): string {
  const texto = String(valor ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(texto)) {
    throw new HttpsError("invalid-argument", "No se pudo identificar el servicio.");
  }
  return texto;
}

/**
 * Resuelve quien llama, a que negocio pertenece y si puede tocar ese servicio.
 *
 * Todo sale de Firestore, nunca de lo que mande el cliente: el negocio no se
 * acepta como parametro justamente para que nadie pueda escribir en otro.
 */
async function resolverContexto(
  db: Firestore,
  uid: string | undefined,
  servicioIdBruto: unknown,
): Promise<Contexto> {
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");

  const servicioId = idSeguro(servicioIdBruto);
  const autorizado = (await db.doc(`autorizados/${uid}`).get()).data();
  if (!autorizado || autorizado.activo === false) {
    throw new HttpsError("permission-denied", "Tu cuenta no tiene acceso a este negocio.");
  }

  const negocioId = String(autorizado.negocioId || autorizado.cuentaPrincipalUid || uid);
  const rol = String(autorizado.rol || "").toLowerCase();
  const permisos = (autorizado.permisos || {}) as Record<string, unknown>;
  const puede = rol === "administrador" ||
    permisos["servicios.ver"] === true ||
    permisos["servicios.crear"] === true;

  if (!puede) throw new HttpsError("permission-denied", "No tienes permiso para gestionar servicios.");

  const servicioRef = db.doc(`negocios/${negocioId}/servicios/${servicioId}`);
  const snap = await servicioRef.get();
  const servicio = snap.data();
  if (!servicio) throw new HttpsError("not-found", "Servicio no encontrado.");
  if (servicio.negocioId !== negocioId && servicio.cuentaPrincipalUid !== negocioId) {
    throw new HttpsError("permission-denied", "El servicio pertenece a otra cuenta.");
  }

  return {uid, negocioId, nombre: String(autorizado.nombre || ""), servicioRef, servicio};
}

/** Premium vigente del negocio. El derecho depende de `premiumUntil`. */
async function exigirPremium(db: Firestore, negocioId: string) {
  const negocio = (await db.doc(`negocios/${negocioId}`).get()).data();
  const hasta = negocio?.premiumUntil;
  const vigente = hasta instanceof Timestamp && hasta.toMillis() > Date.now();
  if (!vigente) {
    throw new HttpsError(
      "failed-precondition",
      "Las evidencias fotográficas están incluidas en CajaLibre Premium.",
    );
  }
}

function contarEvidencias(servicio: FirebaseFirestore.DocumentData): number {
  const crudo = servicio.evidencias;
  if (Array.isArray(crudo)) return crudo.length;
  if (crudo && typeof crudo === "object") return Object.keys(crudo).length;
  return 0;
}

/** Misma forma de clave que usa la aplicacion: ordenable y sin puntos. */
function nuevaClave(): string {
  return `e${String(Date.now()).padStart(14, "0")}${randomUUID().replace(/-/g, "").slice(0, 6)}`;
}

export const subirEvidenciaServicio = onCall({
  region: REGION,
  // `invoker: "public"` deja que Cloud Run entregue la peticion; QUIEN puede
  // usarla lo decide esta funcion, que exige sesion y permisos en
  // `resolverContexto`. Sin esto, Cloud Run intenta validar el token de
  // Firebase como si fuera una credencial de Google y responde 401 antes de
  // que el codigo llegue a ejecutarse.
  invoker: "public",
  maxInstances: 20,
  // Una imagen optimizada mas su miniatura, en base64, cabe de sobra aqui.
  memory: "512MiB",
  timeoutSeconds: 120,
}, async (request) => {
  const db = getFirestore();
  const contexto = await resolverContexto(db, request.auth?.uid, request.data?.servicioId);
  await exigirPremium(db, contexto.negocioId);

  if (contarEvidencias(contexto.servicio) >= LIMITE_EVIDENCIAS) {
    throw new HttpsError(
      "failed-precondition",
      `Este servicio ya tiene ${LIMITE_EVIDENCIAS} evidencias, el máximo permitido.`,
    );
  }

  const tipo = String(request.data?.tipo || "ingreso");
  if (!TIPOS.has(tipo)) throw new HttpsError("invalid-argument", "Categoría de evidencia no válida.");

  const mensaje = "No pudimos leer esta fotografía.";
  const imagen = leerImagenBase64(request.data?.imagen, "image/jpeg", MAX_IMAGEN_BYTES, mensaje);
  const miniatura = leerImagenBase64(request.data?.miniatura, "image/jpeg", MAX_MINIATURA_BYTES, mensaje);

  const clave = nuevaClave();
  const base = `negocios/${contexto.negocioId}/servicios/${contexto.servicioRef.id}/evidencias/${tipo}/${clave}`;
  const metadatos = {negocioId: contexto.negocioId, servicioId: contexto.servicioRef.id, tipo};

  const [completa, mini] = await Promise.all([
    guardarArchivo(`${base}.jpg`, imagen, "image/jpeg", metadatos),
    guardarArchivo(`${base}_min.jpg`, miniatura, "image/jpeg", {...metadatos, variante: "miniatura"}),
  ]);

  const evidencia = {
    url: completa.url,
    storagePath: completa.ruta,
    miniaturaUrl: mini.url,
    miniaturaPath: mini.ruta,
    tipo,
    descripcion: String(request.data?.descripcion ?? "").trim().slice(0, MAX_DESCRIPCION),
    // Hora del servidor: la del equipo de quien sube no decide cuando se
    // documento un equipo.
    fecha: FieldValue.serverTimestamp(),
    usuarioId: contexto.uid,
    usuarioNombre: String(request.data?.usuarioNombre || contexto.nombre || ""),
    ancho: Number(request.data?.ancho) || 0,
    alto: Number(request.data?.alto) || 0,
    peso: imagen.length,
  };

  await contexto.servicioRef.update({
    [`evidencias.${clave}`]: evidencia,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    id: clave,
    url: evidencia.url,
    miniaturaUrl: evidencia.miniaturaUrl,
    storagePath: evidencia.storagePath,
    miniaturaPath: evidencia.miniaturaPath,
    tipo,
    descripcion: evidencia.descripcion,
    usuarioNombre: evidencia.usuarioNombre,
  };
});

export const eliminarEvidenciaServicio = onCall({
  region: REGION,
  invoker: "public",
  maxInstances: 10,
}, async (request) => {
  const db = getFirestore();
  const contexto = await resolverContexto(db, request.auth?.uid, request.data?.servicioId);
  await exigirPremium(db, contexto.negocioId);

  const evidenciaId = idSeguro(request.data?.evidenciaId);
  const evidencias = (contexto.servicio.evidencias || {}) as Record<string, {storagePath?: string; miniaturaPath?: string}>;
  const evidencia = evidencias[evidenciaId];
  if (!evidencia) throw new HttpsError("not-found", "Esa evidencia ya no existe.");

  // Primero el registro y despues los archivos: al reves, un fallo al escribir
  // en Firestore dejaria la foto listada pero ya borrada, es decir una imagen
  // rota permanente.
  await contexto.servicioRef.update({
    [`evidencias.${evidenciaId}`]: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const rutas = [evidencia.storagePath, evidencia.miniaturaPath]
    .filter((ruta): ruta is string => typeof ruta === "string" && ruta.startsWith(`negocios/${contexto.negocioId}/`));
  await Promise.allSettled(rutas.map(borrarArchivo));

  return {ok: true};
});
