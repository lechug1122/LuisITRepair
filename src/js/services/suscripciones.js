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

// ---------------------------------------------------------------------------
// Resolucion central de la sesion del usuario.
//
// Este es el UNICO lugar donde se decide si un usuario entra al sistema, si
// todavia debe terminar su registro inicial o si hay que mostrarle un error.
// Recibe estados EXPLICITOS de existencia y de error para que una consulta que
// aun no termina -o que fallo- nunca se confunda con "usuario sin negocio".
// ---------------------------------------------------------------------------

// Motivos que solo puede resolver el titular de la cuenta; el personal los ve
// como un negocio en espera, nunca como una invitacion a crear otro negocio.
export const MOTIVOS_ONBOARDING_TITULAR = [
  "terminos_pendientes",
  "configuracion_inicial_pendiente",
];

export function mensajeDeErrorAcceso(error, respaldo = "No se pudo validar tu acceso.") {
  const code = String(error?.code || error?.name || "").trim().toLowerCase();

  if (code.includes("permission-denied") || code.includes("insufficient")) {
    return "Firestore rechazo la consulta de tu cuenta por permisos insuficientes. Avisa al administrador del sistema.";
  }

  if (code.includes("unavailable") || code.includes("deadline") || code.includes("network")) {
    return "No se pudo contactar la base de datos. Revisa tu conexion e intenta de nuevo.";
  }

  return String(error?.message || "").trim() || respaldo;
}

export function resolverAccesoSuscripcion({
  uid = "",
  autorizado = null,
  suscripcion = null,
  negocio = null,
  now = new Date(),
  // Estados explicitos de carga. `perfilExiste` en null significa "deducelo del
  // objeto recibido" para no romper a quien ya llamaba esta funcion.
  perfilExiste = null,
  perfilError = null,
  negocioError = null,
} = {}) {
  const datos = autorizado || {};
  const hayPerfil = perfilExiste === null ? Boolean(autorizado) : perfilExiste === true;
  const cuentaPrincipalUid = String(datos?.cuentaPrincipalUid || uid || "").trim();
  // Sin perfil no hay negocio ni titularidad que suponer: se deja vacio para
  // que ningun consumidor crea que la relacion ya existe.
  const negocioId = hayPerfil
    ? String(datos?.negocioId || cuentaPrincipalUid || uid || "").trim()
    : "";
  const esTitular = hayPerfil && Boolean(uid) && uid === cuentaPrincipalUid;
  const activo = datos?.activo !== false;
  const superAdmin = datos?.superAdmin === true;
  const suscripcionControlada = datos?.suscripcionControlada === true;
  const rol = String(datos?.rol || "").trim();
  const permisos = datos?.permisos && typeof datos.permisos === "object" ? datos.permisos : null;
  const suscripcionEvaluada = suscripcion ? evaluarSuscripcion({
    ...suscripcion,
    cuentaPrincipalUid,
  }, now) : null;

  // Todo resultado comparte la misma forma: quien es, a que negocio pertenece y
  // si el sistema todavia debe pedirle que cree uno.
  const base = {
    cuentaPrincipalUid,
    negocioId,
    esTitular,
    rol,
    permisos,
    negocio,
    suscripcion: suscripcionEvaluada,
    perfilExiste: hayPerfil,
    perteneceANegocio: false,
    requiereCrearNegocio: false,
    esError: false,
  };

  const perteneceANegocio = hayPerfil && Boolean(negocioId) && (superAdmin || Boolean(negocio));

  if (!uid) {
    return {
      ...base,
      permitido: false,
      motivo: "sin_uid",
      mensaje: "No se encontro el usuario.",
    };
  }

  // Un fallo de lectura NO es un usuario sin negocio: se reporta como error.
  if (perfilError) {
    return {
      ...base,
      permitido: false,
      esError: true,
      motivo: "error_carga",
      mensaje: mensajeDeErrorAcceso(perfilError, "No se pudo leer tu perfil de usuario."),
      error: perfilError,
    };
  }

  // Sin documento en `autorizados` no existe ninguna relacion con un negocio:
  // este es el unico usuario realmente nuevo.
  if (!hayPerfil) {
    return {
      ...base,
      permitido: false,
      motivo: "sin_autorizacion",
      mensaje: "Tu cuenta todavia no esta vinculada a un negocio.",
      requiereCrearNegocio: true,
    };
  }

  if (!activo) {
    return {
      ...base,
      perteneceANegocio,
      permitido: false,
      motivo: "usuario_inactivo",
      mensaje: "Usuario inactivo. Contacta al administrador.",
    };
  }

  if (!superAdmin) {
    // El negocio no se pudo leer: error real, jamas onboarding.
    if (negocioError) {
      return {
        ...base,
        permitido: false,
        esError: true,
        motivo: "error_carga",
        mensaje: mensajeDeErrorAcceso(negocioError, "No se pudo cargar la informacion de tu negocio."),
        error: negocioError,
      };
    }

    if (!negocio) {
      // Solo el titular puede quedarse sin documento de negocio (registro
      // interrumpido). El personal depende de un negocio que ya deberia existir.
      if (esTitular) {
        return {
          ...base,
          permitido: false,
          motivo: "sin_negocio",
          mensaje: "Todavia no encontramos tu negocio. Vuelve a iniciar sesion para terminar de crearlo.",
          requiereCrearNegocio: true,
        };
      }

      return {
        ...base,
        permitido: false,
        motivo: "negocio_bloqueado",
        mensaje: "El negocio al que perteneces ya no esta disponible. Contacta al administrador.",
      };
    }

    // El onboarding lo define UNICAMENTE el documento del negocio. Las marcas
    // personales (`autorizados/{uid}`) se siguen escribiendo para la bitacora,
    // pero no pueden bloquear a nadie: un titular cuyo negocio ya esta
    // configurado quedaba atrapado en el asistente si su marca personal se
    // habia perdido, y el personal nunca llega a tener esas marcas.
    if (negocio.terminosAceptados !== true) {
      return {
        ...base,
        perteneceANegocio,
        permitido: false,
        motivo: esTitular ? "terminos_pendientes" : "negocio_bloqueado",
        mensaje: esTitular
          ? "Debes aceptar los Terminos y Condiciones de CajaLibre para continuar."
          : "El titular del negocio debe aceptar los Terminos y Condiciones. Contacta al administrador.",
      };
    }

    if (negocio.setupCompleto !== true) {
      return {
        ...base,
        perteneceANegocio,
        permitido: false,
        motivo: esTitular ? "configuracion_inicial_pendiente" : "negocio_bloqueado",
        mensaje: esTitular
          ? "Completa la configuracion inicial de tu negocio para continuar."
          : "El titular del negocio debe completar la configuracion inicial. Contacta al administrador.",
      };
    }

    if (negocio.estado === "bloqueado" || negocio.estado === "suspendido") {
      return {
        ...base,
        perteneceANegocio,
        permitido: false,
        motivo: "negocio_bloqueado",
        mensaje: negocio.bloqueoRazon || "Tu negocio no tiene acceso operativo actualmente.",
      };
    }
  }

  if (superAdmin || !suscripcionControlada) {
    return {
      ...base,
      perteneceANegocio,
      permitido: true,
      motivo: "sin_control_suscripcion",
      mensaje: "",
    };
  }

  if (!suscripcionEvaluada) {
    return {
      ...base,
      perteneceANegocio,
      permitido: true,
      motivo: "suscripcion_no_configurada",
      mensaje: "",
    };
  }

  if (!suscripcionEvaluada.accesoPermitido) {
    return {
      ...base,
      perteneceANegocio,
      permitido: false,
      motivo: "suscripcion_bloqueada",
      mensaje:
        "Tu suscripcion esta vencida y ya supero el lapso de gracia de 7 dias. Contacta al administrador del sistema.",
    };
  }

  return {
    ...base,
    perteneceANegocio,
    permitido: true,
    motivo: suscripcionEvaluada.codigo,
    mensaje: "",
  };
}
