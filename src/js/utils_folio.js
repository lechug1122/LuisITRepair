import { getDocRef } from "./services/tenant";
import { runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../initializer/firebase";

// helper
function pad2(n) {
  return n.toString().padStart(2, "0");
}

export async function generarFolio(marca = "") {
  // 🔹 tu lógica original (conservada)
  const letras =
    (marca || "").trim().toLowerCase().slice(0, 3) || "srv";

  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);

  const baseFolio = `${letras}${dd}${mm}${yy}`;

  // 🔹 clave única por DÍA + MARCA
  const contadorId = `${baseFolio}_${letras}`;
  const contadorRef = getDocRef("contadores_folio", contadorId);

  // 🔥 contador seguro
  const secuencia = await runTransaction(db, async (tx) => {
    const snap = await tx.get(contadorRef);

    let next = 1;

    if (snap.exists()) {
      next = (snap.data().contador || 0) + 1;
      tx.update(contadorRef, {
        contador: next,
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(contadorRef, {
        baseFolio,
        marca: letras,
        contador: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return next;
  });

  // ✅ folio final con los 2 dígitos extra
  return `${baseFolio}${pad2(secuencia)}`;
}
