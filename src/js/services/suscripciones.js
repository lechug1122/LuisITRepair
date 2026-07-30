const DEFAULT_INTERVALO_CANTIDAD = 1;
const DEFAULT_INTERVALO_UNIDAD = "mes";
export const DEFAULT_DIAS_GRACIA = 7;

export const SUSCRIPCION_INTERVALOS = [
  { value: "dia", label: "Dias" },
  { value: "semana", label: "Semanas" },
  { value: "mes", label: "Meses" },
];

export const SUSCRIPCION_METODOS_PAGO = [
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "paypal", label: "PayPal" },
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") return toDate(value.toDate());
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function atStartOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function atEndOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date, amount = 0) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addBillingInterval(dateValue, cantidad = 1, unidad = DEFAULT_INTERVALO_UNIDAD) {
  const baseDate = toDate(dateValue);
  if (!baseDate) return null;

  const steps = Math.max(1, Math.trunc(toNumber(cantidad, DEFAULT_INTERVALO_CANTIDAD)));
  const next = new Date(baseDate);

  if (unidad === "dia") {
    next.setDate(next.getDate() + steps);
    return next;
  }

  if (unidad === "semana") {
    next.setDate(next.getDate() + (steps * 7));
    return next;
  }

  next.setMonth(next.getMonth() + steps);
  return next;
}

export function toDateInputValue(value) {
  const parsed = toDate(value);
  if (!parsed) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateShort(value) {
  const parsed = toDate(value);
  if (!parsed) return "Sin fecha";

  return parsed.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function diffInDays(futureDate, nowDate) {
  const diffMs = atStartOfDay(futureDate).getTime() - atStartOfDay(nowDate).getTime();
  return Math.ceil(diffMs / 86400000);
}

export function normalizeSuscripcion(raw = {}, cuentaPrincipalUidFallback = "") {
  const intervaloUnidad = SUSCRIPCION_INTERVALOS.some((item) => item.value === raw?.intervaloUnidad)
    ? raw.intervaloUnidad
    : DEFAULT_INTERVALO_UNIDAD;
  const metodoPago = SUSCRIPCION_METODOS_PAGO.some((item) => item.value === raw?.metodoPago)
    ? raw.metodoPago
    : "";
  const dispositivosTitularPermitidos = Math.max(
    1,
    Math.trunc(toNumber(raw?.dispositivosTitularPermitidos, 1)),
  );

  return {
    cuentaPrincipalUid: String(
      raw?.cuentaPrincipalUid || cuentaPrincipalUidFallback || "",
    ).trim(),
    titularNombre: String(raw?.titularNombre || raw?.nombre || "").trim(),
    telefono: String(raw?.telefono || "").trim(),
    correo: String(raw?.correo || "").trim(),
    planNombre: String(raw?.planNombre || "").trim(),
    metodoPago,
    notas: String(raw?.notas || "").trim(),
    activa: raw?.activa !== false,
    monto: Math.max(0, toNumber(raw?.monto, 0)),
    diasGracia: Math.max(0, Math.trunc(toNumber(raw?.diasGracia, DEFAULT_DIAS_GRACIA))),
    intervaloCantidad: Math.max(
      1,
      Math.trunc(toNumber(raw?.intervaloCantidad, DEFAULT_INTERVALO_CANTIDAD)),
    ),
    dispositivosTitularPermitidos,
    intervaloUnidad,
    fechaUltimoPago: toDate(raw?.fechaUltimoPago),
    createdAt: toDate(raw?.createdAt),
    updatedAt: toDate(raw?.updatedAt),
  };
}

export function getMetodoPagoSuscripcionLabel(value = "") {
  const found = SUSCRIPCION_METODOS_PAGO.find((item) => item.value === String(value || "").trim());
  return found?.label || "Sin definir";
}

export function evaluarSuscripcion(raw = {}, now = new Date()) {
  const suscripcion = normalizeSuscripcion(raw);

  if (!suscripcion.cuentaPrincipalUid) {
    return {
      ...suscripcion,
      codigo: "sin_cuenta",
      etiqueta: "Sin vincular",
      accesoPermitido: true,
      proximoPago: null,
      graciaHasta: null,
      diasRestantes: null,
      diasRetraso: null,
      detalle: "La suscripcion no esta vinculada a una cuenta principal.",
    };
  }

  if (suscripcion.activa === false) {
    return {
      ...suscripcion,
      codigo: "bloqueada_manual",
      etiqueta: "Bloqueada",
      accesoPermitido: false,
      proximoPago: null,
      graciaHasta: null,
      diasRestantes: null,
      diasRetraso: null,
      detalle: "La cuenta fue desactivada manualmente.",
    };
  }

  if (!suscripcion.fechaUltimoPago) {
    return {
      ...suscripcion,
      codigo: "pendiente_configuracion",
      etiqueta: "Pendiente",
      accesoPermitido: true,
      proximoPago: null,
      graciaHasta: null,
      diasRestantes: null,
      diasRetraso: null,
      detalle: "Falta registrar la fecha del ultimo pago.",
    };
  }

  const ahora = toDate(now) || new Date();
  const proximoPago = addBillingInterval(
    suscripcion.fechaUltimoPago,
    suscripcion.intervaloCantidad,
    suscripcion.intervaloUnidad,
  );
  const graciaHasta = atEndOfDay(addDays(proximoPago, suscripcion.diasGracia));

  if (ahora < atStartOfDay(proximoPago)) {
    return {
      ...suscripcion,
      codigo: "al_corriente",
      etiqueta: "Al corriente",
      accesoPermitido: true,
      proximoPago,
      graciaHasta,
      diasRestantes: diffInDays(proximoPago, ahora),
      diasRetraso: 0,
      detalle: "La cuenta esta al corriente en pagos.",
    };
  }

  if (ahora <= graciaHasta) {
    return {
      ...suscripcion,
      codigo: "en_gracia",
      etiqueta: "En gracia",
      accesoPermitido: true,
      proximoPago,
      graciaHasta,
      diasRestantes: diffInDays(graciaHasta, ahora),
      diasRetraso: Math.max(0, diffInDays(ahora, proximoPago) * -1),
      detalle: "La cuenta ya vencio, pero sigue dentro del lapso de gracia.",
    };
  }

  return {
    ...suscripcion,
    codigo: "bloqueada",
    etiqueta: "Bloqueada",
    accesoPermitido: false,
    proximoPago,
    graciaHasta,
    diasRestantes: 0,
    diasRetraso: Math.max(1, diffInDays(ahora, graciaHasta) * -1),
    detalle: "La cuenta supero el lapso de gracia y debe bloquearse.",
  };
}

export function resolverAccesoSuscripcion({
  uid = "",
  autorizado = {},
  suscripcion = null,
  negocio = null,
  now = new Date(),
} = {}) {
  const cuentaPrincipalUid = String(autorizado?.cuentaPrincipalUid || uid || "").trim();
  const negocioId = String(autorizado?.negocioId || cuentaPrincipalUid || uid || "").trim();
  const activo = autorizado?.activo !== false;
  const superAdmin = autorizado?.superAdmin === true;
  const suscripcionControlada = autorizado?.suscripcionControlada === true;
  const suscripcionEvaluada = suscripcion ? evaluarSuscripcion({
    ...suscripcion,
    cuentaPrincipalUid,
  }, now) : null;

  if (!activo) {
    return {
      permitido: false,
      motivo: "usuario_inactivo",
      mensaje: "Usuario inactivo. Contacta al administrador.",
      cuentaPrincipalUid,
      negocioId,
      suscripcion: suscripcionEvaluada,
    };
  }

  if (!superAdmin && negocio) {
    if (negocio.terminosAceptados !== true || autorizado.terminosAceptados !== true) {
      return {
        permitido: false,
        motivo: "terminos_pendientes",
        mensaje: "Debes aceptar los Terminos y Condiciones de CajaLibre para continuar.",
        cuentaPrincipalUid,
        negocioId,
        negocio,
        suscripcion: suscripcionEvaluada,
      };
    }

    if (negocio.setupCompleto !== true || autorizado.setupCompleto !== true) {
      return {
        permitido: false,
        motivo: "configuracion_inicial_pendiente",
        mensaje: "Completa la configuracion inicial de tu negocio para continuar.",
        cuentaPrincipalUid,
        negocioId,
        negocio,
        suscripcion: suscripcionEvaluada,
      };
    }

    if (negocio.estado === "bloqueado" || negocio.estado === "suspendido") {
      return {
        permitido: false,
        motivo: "negocio_bloqueado",
        mensaje: negocio.bloqueoRazon || "Tu negocio no tiene acceso operativo actualmente.",
        cuentaPrincipalUid,
        negocioId,
        negocio,
        suscripcion: suscripcionEvaluada,
      };
    }
  }

  if (superAdmin || !suscripcionControlada) {
    return {
      permitido: true,
      motivo: "sin_control_suscripcion",
      mensaje: "",
      cuentaPrincipalUid,
      negocioId,
      negocio,
      suscripcion: suscripcionEvaluada,
    };
  }

  if (!suscripcionEvaluada) {
    return {
      permitido: true,
      motivo: "suscripcion_no_configurada",
      mensaje: "",
      cuentaPrincipalUid,
      negocioId,
      negocio,
      suscripcion: null,
    };
  }

  if (!suscripcionEvaluada.accesoPermitido) {
    return {
      permitido: false,
      motivo: "suscripcion_bloqueada",
      mensaje:
        "Tu suscripcion esta vencida y ya supero el lapso de gracia de 7 dias. Contacta al administrador del sistema.",
      cuentaPrincipalUid,
      negocioId,
      negocio,
      suscripcion: suscripcionEvaluada,
    };
  }

  return {
    permitido: true,
    motivo: suscripcionEvaluada.codigo,
    mensaje: "",
    cuentaPrincipalUid,
    negocioId,
    negocio,
    suscripcion: suscripcionEvaluada,
  };
}
