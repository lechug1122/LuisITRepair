import { addDoc, doc, getDocs, onSnapshot, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../initializer/firebase";
import { getCollectionRef, getDocRef, withTenantData } from "./tenant";

const COLLECTION = "fiados";

function numero(value) {
  return Math.max(0, Number(value) || 0);
}

function fechaISO() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
}

export function escucharFiados(onData, onError = () => {}) {
  return onSnapshot(getCollectionRef(COLLECTION), (snapshot) => {
    const cuentas = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    cuentas.sort((a, b) => String(b.actualizadoISO || "").localeCompare(String(a.actualizadoISO || "")));
    onData(cuentas);
  }, onError);
}

export async function buscarFiadosPorTelefono(telefono = "") {
  const buscado = String(telefono || "").replace(/\D/g, "").slice(-10);
  if (buscado.length < 10) return [];
  const snapshot = await getDocs(getCollectionRef(COLLECTION));
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((cuenta) => String(cuenta.clienteTelefono || "").replace(/\D/g, "").slice(-10) === buscado && numero(cuenta.saldo) > 0)
    .sort((a, b) => String(a.fechaVencimiento || "").localeCompare(String(b.fechaVencimiento || "")));
}

export async function crearFiado(data = {}) {
  const monto = numero(data.monto);
  const limiteCredito = Math.max(monto, numero(data.limiteCredito));
  const diasCredito = Math.max(1, Math.floor(Number(data.diasCredito) || 30));
  if (!data.clienteId || !String(data.clienteNombre || "").trim()) throw new Error("Selecciona un cliente.");
  if (monto <= 0) throw new Error("El monto debe ser mayor que cero.");
  const ahora = fechaISO();
  const vencimiento = new Date();
  vencimiento.setDate(vencimiento.getDate() + diasCredito);
  const payload = withTenantData({
    clienteId: String(data.clienteId),
    clienteNombre: String(data.clienteNombre).trim(),
    clienteTelefono: String(data.clienteTelefono || "").trim(),
    limiteCredito,
    diasCredito,
    fechaInicio: ahora.slice(0, 10),
    fechaVencimiento: vencimiento.toISOString().slice(0, 10),
    saldo: monto,
    notas: String(data.notas || "").trim(),
    movimientos: [{ id: `cargo-${Date.now()}`, fecha: ahora, descripcion: String(data.descripcion || "Compra a crédito").trim(), cargo: monto, abono: 0, saldo: monto, metodo: "" }],
    actualizadoISO: ahora,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  const ref = await addDoc(getCollectionRef(COLLECTION), payload);
  return ref.id;
}

export async function registrarVentaFiada(venta = {}, cuenta = {}) {
  const ventaRef = doc(getCollectionRef("ventas"));
  const fiadoRef = doc(getCollectionRef(COLLECTION));
  const monto = numero(cuenta.monto);
  const limiteCredito = Math.max(monto, numero(cuenta.limiteCredito));
  const diasCredito = Math.max(1, Math.floor(Number(cuenta.diasCredito) || 30));
  if (!cuenta.clienteId || !String(cuenta.clienteNombre || "").trim()) throw new Error("Selecciona un cliente.");
  if (monto <= 0) throw new Error("El total para fiar debe ser mayor que cero.");
  const ahora = fechaISO();
  const vencimiento = new Date();
  vencimiento.setDate(vencimiento.getDate() + diasCredito);
  const descripcion = String(cuenta.descripcion || `Venta ${venta.folioTicket || ventaRef.id}`).trim();

  await runTransaction(db, async (transaction) => {
    transaction.set(ventaRef, withTenantData({ ...venta, fiadoId: fiadoRef.id }));
    transaction.set(fiadoRef, withTenantData({
      clienteId: String(cuenta.clienteId),
      clienteNombre: String(cuenta.clienteNombre).trim(),
      clienteTelefono: String(cuenta.clienteTelefono || "").trim(),
      ventaId: ventaRef.id,
      folioVenta: String(venta.folioTicket || ""),
      limiteCredito,
      diasCredito,
      fechaInicio: ahora.slice(0, 10),
      fechaVencimiento: vencimiento.toISOString().slice(0, 10),
      saldo: monto,
      notas: String(cuenta.notas || "").trim(),
      movimientos: [{ id: `cargo-${Date.now()}`, fecha: ahora, descripcion, cargo: monto, abono: 0, saldo: monto, metodo: "" }],
      actualizadoISO: ahora,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    }));
  });

  return { ventaId: ventaRef.id, fiadoId: fiadoRef.id };
}

export async function registrarPagoFiado(id, { monto, metodo = "Efectivo" } = {}) {
  const abono = numero(monto);
  if (abono <= 0) throw new Error("Ingresa un monto válido.");
  const ref = getDocRef(COLLECTION, id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("La cuenta ya no existe.");
    const actual = snapshot.data();
    const saldoActual = numero(actual.saldo);
    if (abono > saldoActual) throw new Error("El pago no puede superar el saldo actual.");
    const nuevoSaldo = Number((saldoActual - abono).toFixed(2));
    const ahora = fechaISO();
    transaction.update(ref, {
      saldo: nuevoSaldo,
      movimientos: [{ id: `pago-${Date.now()}`, fecha: ahora, descripcion: "Pago recibido", cargo: 0, abono, saldo: nuevoSaldo, metodo: String(metodo) }, ...(actual.movimientos || [])].slice(0, 300),
      actualizadoISO: ahora,
      actualizadoEn: serverTimestamp(),
    });
  });
}

export async function actualizarNotasFiado(id, notas) {
  await updateDoc(getDocRef(COLLECTION, id), {
    notas: String(notas || "").trim(),
    actualizadoISO: fechaISO(),
    actualizadoEn: serverTimestamp(),
  });
}
