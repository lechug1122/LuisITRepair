// ✅ Folio simple (puedes cambiarlo luego)

export function generarFolio(marca = "") {
  const letras = (marca || "").trim().toLowerCase().slice(0, 3) || "srv";
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${letras}${dd}${mm}${yy}`;
}