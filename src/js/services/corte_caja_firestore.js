import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../../initializer/firebase";

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getDateKeyLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calcularResumenVentasDia(ventasDia = []) {
  const resumen = {
    subtotal: 0,
    iva: 0,
    total: 0,
    tickets: ventasDia.length,
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    otros: 0,
    unidades: 0,
  };

  ventasDia.forEach((v) => {
    const subtotalVenta = Number(v?.subtotal || 0);
    const ivaVenta = Number(v?.iva || 0);
    const totalVenta = Number(v?.total || 0);
    resumen.subtotal += subtotalVenta;
    resumen.iva += ivaVenta;
    resumen.total += totalVenta;

    (v?.productos || []).forEach((p) => {
      resumen.unidades += Number(p?.cantidad || 0);
    });

    const detalle = v?.pagoDetalle || {};
    const tipo = String(v?.tipoPago || "").toLowerCase().trim();

    resumen.efectivo += Number(detalle?.efectivo || (tipo === "efectivo" ? totalVenta : 0) || 0);
    resumen.tarjeta += Number(detalle?.tarjeta || (tipo === "tarjeta" ? totalVenta : 0) || 0);
    resumen.transferencia += Number(
      detalle?.transferencia || (tipo === "transferencia" ? totalVenta : 0) || 0
    );

    if (!["efectivo", "tarjeta", "transferencia"].includes(tipo)) {
      resumen.otros += totalVenta;
    }
  });

  return {
    ...resumen,
    subtotal: Number(resumen.subtotal.toFixed(2)),
    iva: Number(resumen.iva.toFixed(2)),
    total: Number(resumen.total.toFixed(2)),
    efectivo: Number(resumen.efectivo.toFixed(2)),
    tarjeta: Number(resumen.tarjeta.toFixed(2)),
    transferencia: Number(resumen.transferencia.toFixed(2)),
    otros: Number(resumen.otros.toFixed(2)),
  };
}

export async function obtenerVentasDia(fechaKey = getDateKeyLocal()) {
  const ventasSnap = await getDocs(collection(db, "ventas"));
  return ventasSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((v) => {
      const f = toDate(v.fecha);
      return f && getDateKeyLocal(f) === fechaKey;
    });
}

export async function obtenerCorteCajaDia(fechaKey = getDateKeyLocal()) {
  const ref = doc(db, "cortes_caja", fechaKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function registrarAperturaCaja(fondoInicialCaja = 0, cajero = {}) {
  const fechaKey = getDateKeyLocal();
  const payload = {
    fechaKey,
    fondoInicialCaja: Number.isFinite(Number(fondoInicialCaja)) ? Number(Number(fondoInicialCaja).toFixed(2)) : 0,
    cajero: {
      uid: String(cajero?.uid || "").trim() || null,
      email: String(cajero?.email || "").trim() || null,
      nombre: String(cajero?.nombre || "").trim() || null,
    },
    aperturaEn: serverTimestamp(),
  };

  await setDoc(doc(db, "cortes_caja", fechaKey), payload, { merge: true });
  return obtenerCorteCajaDia(fechaKey);
}

export async function estaCajaCerradaHoy() {
  const corte = await obtenerCorteCajaDia(getDateKeyLocal());
  return !!(corte && corte.cerrado === true);
}

export async function cerrarCajaHoy(ventasFuente = null, meta = {}) {
  const fechaKey = getDateKeyLocal();
  const yaExiste = await obtenerCorteCajaDia(fechaKey);
  if (yaExiste?.cerrado) {
    return { yaCerrado: true, corte: yaExiste };
  }

  const ventasDia = Array.isArray(ventasFuente)
    ? ventasFuente.filter((v) => {
        const f = toDate(v.fecha);
        return f && getDateKeyLocal(f) === fechaKey;
      })
    : await obtenerVentasDia(fechaKey);

  const resumen = calcularResumenVentasDia(ventasDia);
  const aperturaRaw = Number(meta?.fondoInicialCaja);
  const fondoInicialCaja = Number.isFinite(aperturaRaw) ? Number(aperturaRaw.toFixed(2)) : 0;

  const denominaciones = Array.isArray(meta?.denominaciones)
    ? meta.denominaciones
        .map((d) => ({
          valor: Number(d?.valor || 0),
          cantidad: Number(d?.cantidad || 0),
        }))
        .filter((d) => d.valor > 0 && d.cantidad > 0)
    : [];

  const efectivoDenominaciones = denominaciones.reduce(
    (acc, d) => acc + Number(d.valor) * Number(d.cantidad),
    0
  );

  const retiros = Array.isArray(meta?.retiros)
    ? meta.retiros
        .map((r) => ({
          tipo: String(r?.tipo || "retiro"),
          monto: Number(r?.monto || 0),
          motivo: String(r?.motivo || "").trim(),
          usuario: String(r?.usuario || "").trim(),
        }))
        .filter((r) => r.monto > 0)
    : [];

  const totalRetiros = Number(
    retiros.reduce((acc, r) => acc + Number(r.monto || 0), 0).toFixed(2)
  );

  const contadoRaw = Number(meta?.efectivoContado);
  const contadoMeta = Number.isFinite(contadoRaw) ? Number(contadoRaw.toFixed(2)) : null;
  const efectivoContado =
    Number(efectivoDenominaciones || 0) > 0
      ? Number(efectivoDenominaciones.toFixed(2))
      : contadoMeta;
  const diferencia = efectivoContado === null
    ? null
    : Number((efectivoContado - Number(resumen.efectivo || 0)).toFixed(2));
  const cajaFinalEsperada = Number(
    (fondoInicialCaja + Number(resumen.efectivo || 0) - totalRetiros).toFixed(2)
  );

  const payload = {
    fechaKey,
    cerrado: true,
    cerradoEn: serverTimestamp(),
    cajero: {
      uid: String(meta?.cajero?.uid || "").trim() || null,
      email: String(meta?.cajero?.email || "").trim() || null,
      nombre: String(meta?.cajero?.nombre || "").trim() || null,
    },
    resumen,
    fondoInicialCaja,
    cajaFinalEsperada,
    denominaciones,
    retiros,
    totalRetiros,
    conteoEfectivo: {
      esperado: Number(resumen.efectivo || 0),
      contado: efectivoContado,
      diferencia,
    },
    notasCorte: String(meta?.notasCorte || "").trim(),
    ventasIds: ventasDia.map((v) => v.id),
  };

  await setDoc(doc(db, "cortes_caja", fechaKey), payload, { merge: true });
  return { yaCerrado: false, corte: payload };
}

export async function listarCortesCaja() {
  const snap = await getDocs(collection(db, "cortes_caja"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.fechaKey || "").localeCompare(String(a.fechaKey || "")));
}

export async function autoCerrarCortesPendientes() {
  const hoyKey = getDateKeyLocal();
  const [ventasSnap, cortesSnap] = await Promise.all([
    getDocs(collection(db, "ventas")),
    getDocs(collection(db, "cortes_caja")),
  ]);

  const ventas = ventasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cortesMap = new Map(
    cortesSnap.docs.map((d) => [String(d.id), { id: d.id, ...d.data() }])
  );

  const ventasPorFecha = new Map();
  ventas.forEach((v) => {
    const f = toDate(v.fecha);
    if (!f) return;
    const key = getDateKeyLocal(f);
    if (!ventasPorFecha.has(key)) ventasPorFecha.set(key, []);
    ventasPorFecha.get(key).push(v);
  });

  const tareas = [];
  for (const [fechaKey, ventasDia] of ventasPorFecha.entries()) {
    if (fechaKey >= hoyKey) continue;
    const corte = cortesMap.get(fechaKey);
    if (corte?.cerrado) continue;

    const resumen = calcularResumenVentasDia(ventasDia);
    const payload = {
      fechaKey,
      cerrado: true,
      cerradoEn: serverTimestamp(),
      cerradoPorSistema: true,
      resumen,
      fondoInicialCaja: Number(corte?.fondoInicialCaja || 0),
      cajaFinalEsperada: Number(
        (Number(corte?.fondoInicialCaja || 0) + Number(resumen.efectivo || 0) - Number(corte?.totalRetiros || 0)).toFixed(2)
      ),
      denominaciones: Array.isArray(corte?.denominaciones) ? corte.denominaciones : [],
      retiros: Array.isArray(corte?.retiros) ? corte.retiros : [],
      totalRetiros: Number(corte?.totalRetiros || 0),
      conteoEfectivo: corte?.conteoEfectivo || {
        esperado: Number(resumen.efectivo || 0),
        contado: null,
        diferencia: null,
      },
      notasCorte: String(corte?.notasCorte || "").trim(),
      ventasIds: ventasDia.map((v) => v.id),
    };

    tareas.push(setDoc(doc(db, "cortes_caja", fechaKey), payload, { merge: true }));
  }

  if (tareas.length > 0) {
    await Promise.all(tareas);
  }

  return { cerradosAutomaticamente: tareas.length };
}

export async function obtenerResumenCajaHoy() {
  const fechaKey = getDateKeyLocal();
  const [ventasHoy, corte] = await Promise.all([
    obtenerVentasDia(fechaKey),
    obtenerCorteCajaDia(fechaKey),
  ]);

  return {
    fechaKey,
    cerrado: !!(corte && corte.cerrado === true),
    corte,
    ventasHoy,
    resumenHoy: calcularResumenVentasDia(ventasHoy),
  };
}
