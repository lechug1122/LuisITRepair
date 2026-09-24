import {getStorage} from "firebase-admin/storage";
import {HttpsError} from "firebase-functions/v2/https";
import {randomUUID} from "node:crypto";

/**
 * Bucket de Storage del proyecto, nombrado explicitamente.
 *
 * `getStorage().bucket()` sin argumento depende de que `FIREBASE_CONFIG` traiga
 * `storageBucket`, y ese valor se fija cuando la funcion se despliega. Una
 * funcion desplegada ANTES de que existiera el bucket se queda sin el y falla
 * con un error que no dice nada util. Resolverlo aqui lo deja sin depender del
 * momento del despliegue.
 */
export function bucketDelProyecto() {
  let configurado = "";
  try {
    configurado = String(JSON.parse(process.env.FIREBASE_CONFIG || "{}").storageBucket || "");
  } catch {
    configurado = "";
  }

  const proyecto = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
  const nombre = configurado || (proyecto ? `${proyecto}.firebasestorage.app` : "");
  if (!nombre) throw new HttpsError("internal", "No se pudo resolver el almacenamiento del proyecto.");
  return getStorage().bucket(nombre);
}

/** Firmas de las imagenes que el sistema acepta. */
const FIRMAS: Record<string, string> = {
  "image/png": "89504e470d0a1a0a",
  "image/jpeg": "ffd8ff",
};

/**
 * Decodifica un data URL o base64 y comprueba que sea DE VERDAD el formato que
 * dice ser. Sin esto, cualquier archivo podria colarse renombrando el tipo.
 */
export function leerImagenBase64(
  valor: unknown,
  contentType: "image/png" | "image/jpeg",
  maximoBytes: number,
  mensaje: string,
): Buffer {
  const texto = typeof valor === "string" ? valor.replace(/^data:image\/[a-z]+;base64,/, "") : "";
  if (!texto || !/^[A-Za-z0-9+/=]+$/.test(texto)) throw new HttpsError("invalid-argument", mensaje);

  const buffer = Buffer.from(texto, "base64");
  if (!buffer.length || buffer.length > maximoBytes) throw new HttpsError("invalid-argument", mensaje);

  const firma = FIRMAS[contentType];
  if (buffer.subarray(0, firma.length / 2).toString("hex") !== firma) {
    throw new HttpsError("invalid-argument", mensaje);
  }
  return buffer;
}

/**
 * Guarda un archivo y devuelve su URL de descarga.
 *
 * El token de descarga es lo que permite que la imagen se vea desde la
 * aplicacion y desde el PDF sin abrir el bucket a nadie: quien no tenga la URL
 * completa no puede leer el archivo.
 */
export async function guardarArchivo(
  ruta: string,
  contenido: Buffer,
  contentType: string,
  metadatos: Record<string, string> = {},
) {
  const archivo = bucketDelProyecto().file(ruta);
  const token = randomUUID();

  await archivo.save(contenido, {
    contentType,
    metadata: {
      cacheControl: "private,max-age=31536000",
      metadata: {firebaseStorageDownloadTokens: token, ...metadatos},
    },
  });

  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${archivo.bucket.name}` +
      `/o/${encodeURIComponent(ruta)}?alt=media&token=${token}`,
    ruta,
  };
}

/** Borra un archivo. Que ya no exista no es un error. */
export async function borrarArchivo(ruta: string) {
  try {
    await bucketDelProyecto().file(ruta).delete();
    return true;
  } catch {
    return false;
  }
}
