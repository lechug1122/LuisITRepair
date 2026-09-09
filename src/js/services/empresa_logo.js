import { LOGO_MAX_CHARS } from "./configure_empresa";

export const LOGO_EXTENSIONES = ".png,.ico";
const MIME_PERMITIDOS = ["image/png", "image/x-icon", "image/vnd.microsoft.icon"];
const LADO_MAXIMO = 512;
// Cada reduccion se intenta en orden hasta que el data URL entra en el limite
// del documento de Firestore.
const LADOS_DE_RESPALDO = [512, 384, 256, 192, 128];

function leerComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
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

// Reescala manteniendo proporcion y exporta PNG para que el resultado sea
// siempre un formato que el navegador y los tickets puedan pintar.
function redibujar(img, lado) {
  const escala = Math.min(1, lado / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((img.naturalWidth || lado) * escala));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || lado) * escala));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function extensionValida(file) {
  const nombre = String(file?.name || "").toLowerCase();
  return nombre.endsWith(".png") || nombre.endsWith(".ico");
}

/**
 * Convierte el archivo elegido por el usuario en un data URL PNG listo para
 * guardarse en el documento de empresa. Lanza un Error con mensaje legible
 * cuando el archivo no sirve, para mostrarlo tal cual en la interfaz.
 */
export async function procesarArchivoLogo(file) {
  if (!file) throw new Error("No se selecciono ningun archivo.");

  const tipo = String(file.type || "").toLowerCase();
  if (!extensionValida(file) && !MIME_PERMITIDOS.includes(tipo)) {
    throw new Error("Solo se permiten imagenes PNG o ICO.");
  }

  const original = await leerComoDataUrl(file);
  const img = await cargarImagen(original);

  const cabeMasChico = Math.max(img.naturalWidth || 0, img.naturalHeight || 0) <= LADO_MAXIMO;
  if (cabeMasChico && tipo === "image/png" && original.length <= LOGO_MAX_CHARS) {
    return original;
  }

  for (const lado of LADOS_DE_RESPALDO) {
    const redimensionado = redibujar(img, lado);
    if (redimensionado.length <= LOGO_MAX_CHARS) return redimensionado;
  }

  throw new Error("La imagen es demasiado pesada. Usa un logo mas simple o de menor tamano.");
}
