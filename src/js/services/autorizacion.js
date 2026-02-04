import { doc, getDoc } from "firebase/firestore";
import { db } from "../../initializer/firebase.js";

export async function esUsuarioAutorizado(uid) {
  if (!uid) return false;

  const ref = doc(db, "autorizados", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return false;

  const data = snap.data();
  return data?.activo === true;
}