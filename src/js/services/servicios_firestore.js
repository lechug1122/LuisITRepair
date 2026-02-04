import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp,
  orderBy,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../initializer/firebase";
import { generarFolio } from "../utils_folio"; // ✅ AQUI

// ✅ arma un payload LIMPIO según tipoDispositivo
function construirPayload(form) {
  const tipo = form.tipoDispositivo;

  // base (siempre)
  const payload = {
    // Cliente
    nombre: form.nombre || "",
    direccion: form.direccion || "",
    telefono: form.telefono || "",

    // Equipo general
    tipoDispositivo: tipo || "",
    marca: form.marca || "",
    modelo: form.modelo || "",

    // Otros
    trabajo: form.trabajo || "",
    precioDespues: !!form.precioDespues,
    costo: form.precioDespues ? "" : (form.costo || ""),

    // ✅ NUEVO: control booleano de entrega
    entregado: false,
    fechaEntregado: null, // opcional (útil para reportes)

    // extras útiles
    folio: generarFolio(form.marca),
    status: "pendiente",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Laptop / PC
  if (tipo === "laptop" || tipo === "pc") {
    payload.laptopPc = {
      procesador: form.procesador || "",
      ram: form.ram || "",
      disco: form.disco || "",
      estadoPantalla: form.estadoPantalla || "",
      estadoTeclado: form.estadoTeclado || "",
      estadoMouse: form.estadoMouse || "",
      funciona: form.funciona || "",
      enciendeEquipo: form.enciendeEquipo || "",
      contrasenaEquipo: form.contrasenaEquipo || "",
    };
  }

  // Impresora
  if (tipo === "impresora") {
    payload.impresora = {
      tipoImpresora: form.tipoImpresora || "",
      imprime: form.imprime || "",
      condicionesImpresora: form.condicionesImpresora || "",
    };
  }

  // Monitor
  if (tipo === "monitor") {
    payload.monitor = {
      tamanoMonitor: form.tamanoMonitor || "",
      colores: form.colores || "",
      condicionesMonitor: form.condicionesMonitor || "",
    };
  }

  return payload;
}

export async function guardarServicio(form) {
  const payload = construirPayload(form);
  const docRef = await addDoc(collection(db, "servicios"), payload);
  return { id: docRef.id, folio: payload.folio };
}

// ✅ Buscar por folio
export async function buscarServicioPorFolio(folio) {
  const folioLimpio = (folio || "").trim();
  if (!folioLimpio) return null;

  const q = query(
    collection(db, "servicios"),
    where("folio", "==", folioLimpio)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// 🔹 Pendientes
export async function listarServiciosPendientes() {
  const q = query(
    collection(db, "servicios"),
    where("status", "==", "pendiente"),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// 🔹 Historial (todo menos pendiente)
export async function listarServiciosHistorial() {
  const q = query(
    collection(db, "servicios"),
    where("status", "!=", "pendiente"),
    orderBy("status"),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ✅ Actualizar por ID
export async function actualizarServicioPorId(id, data) {
  const ref = doc(db, "servicios", id);

  // ✅ Si viene entregado:true, guardamos fechaEntregado automáticamente
  const patch = { ...data, updatedAt: serverTimestamp() };
  if (data?.entregado === true) patch.fechaEntregado = serverTimestamp();
  if (data?.entregado === false) patch.fechaEntregado = null;

  // ✅ solo actualiza campos, NO crea ni borra otros
  await updateDoc(ref, patch);

  // ✅ regresa TODO el documento para no perder campos en UI
  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}
