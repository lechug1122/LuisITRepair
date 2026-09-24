// ---------------------------------------------------------------------------
// Preparacion de fotografias antes de subirlas.
//
// La camara de un telefono actual entrega entre 3 y 12 MB por foto. Subir eso
// tal cual significa que el negocio paga almacenamiento y trafico por una
// resolucion que nadie va a mirar, y que abrir un servicio con diez evidencias
// tarde una eternidad con datos moviles.
//
// El objetivo NO es comprimir al maximo: una evidencia tiene que servir para
// demostrar el estado de un equipo, asi que debe poder ampliarse y leerse un
// numero de serie o un rayon. Por eso el lado largo se conserva en 1600 px con
// calidad alta, que es mas que suficiente para pantalla e impresion en PDF.
//
// Ademas se genera una miniatura muy ligera para la galeria: la cuadricula
// carga miniaturas y solo pide la imagen completa cuando alguien la amplia.
// ---------------------------------------------------------------------------

export const TIPOS_IMAGEN_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const EXTENSIONES_IMAGEN = "image/jpeg,image/png,image/webp";

/** Tope de entrada. Por encima casi siempre es un archivo equivocado. */
export const PESO_MAXIMO_ENTRADA = 25 * 1024 * 1024;

const LADO_MAXIMO = 1600;
const LADO_MINIATURA = 360;
const CALIDAD = 0.82;
const CALIDAD_MINIATURA = 0.7;

function esImagen(file) {
  const tipo = String(file?.type || "").toLowerCase();
  if (tipo.startsWith("image/")) return true;
  // Algunos navegadores entregan HEIC sin tipo MIME.
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(String(file?.name || ""));
}

function leerComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result || ""));
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(file);
  });
}

function cargarImagen(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("El archivo no es una imagen valida."));
    img.src = dataUrl;
  });
}

function dibujar(img, ladoMaximo, calidad) {
  const ladoOriginal = Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
  // Nunca se agranda: una foto pequeña se sube tal cual, sin inventar pixeles.
  const escala = Math.min(1, ladoMaximo / ladoOriginal);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((img.naturalWidth || ladoMaximo) * escala));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || ladoMaximo) * escala));

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Fondo blanco: un PNG con transparencia terminaria en negro al pasar a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, ancho: canvas.width, alto: canvas.height }) : reject(new Error("No se pudo procesar la imagen."))),
      "image/jpeg",
      calidad,
    );
  });
}

/**
 * Deja una foto lista para subir: version completa optimizada + miniatura.
 *
 * Lanza un Error con mensaje legible cuando el archivo no sirve, para poder
 * mostrarlo tal cual en la interfaz.
 */
export async function prepararFotoEvidencia(file) {
  if (!file) throw new Error("No se seleccionó ningún archivo.");
  if (!esImagen(file)) throw new Error("Solo se pueden subir imágenes.");
  if (file.size > PESO_MAXIMO_ENTRADA) {
    throw new Error("La imagen pesa demasiado. Intenta con una fotografía más ligera.");
  }

  const original = await leerComoDataUrl(file);
  const img = await cargarImagen(original);

  const [completa, miniatura] = await Promise.all([
    dibujar(img, LADO_MAXIMO, CALIDAD),
    dibujar(img, LADO_MINIATURA, CALIDAD_MINIATURA),
  ]);

  return {
    blob: completa.blob,
    miniatura: miniatura.blob,
    ancho: completa.ancho,
    alto: completa.alto,
    peso: completa.blob.size,
    pesoOriginal: file.size,
    // Se usa para la vista previa antes de subir, sin tocar la red.
    vistaPrevia: URL.createObjectURL(completa.blob),
    nombreOriginal: String(file.name || "foto"),
  };
}

/** Libera la URL temporal de una vista previa. Evita fugas de memoria. */
export function liberarVistaPrevia(vistaPrevia) {
  if (vistaPrevia && typeof vistaPrevia === "string" && vistaPrevia.startsWith("blob:")) {
    URL.revokeObjectURL(vistaPrevia);
  }
}

/** Texto corto de peso, para mostrarlo junto a la evidencia. */
export function formatoPeso(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
