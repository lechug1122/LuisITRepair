// ---------------------------------------------------------------------------
// Que incluye cada plan de CajaLibre.
//
// Este es el UNICO lugar donde se decide si una funcion pertenece a Free o a
// Premium. Antes esa decision estaba repartida en condiciones sueltas por las
// pantallas, y bastaba con olvidar una para que un plan diera acceso de mas.
//
// El modulo es puro: no importa React ni Firestore, para poder probarlo con
// `node --test` y para que la misma regla sirva en la pantalla, en la
// impresion y en el guardado.
// ---------------------------------------------------------------------------

export const PLAN_LOADING = "loading";
export const PLAN_PREMIUM = "premium";
export const PLAN_FREE = "free";

// Fecha en que entra en produccion la politica nueva. Un negocio creado ANTES
// de este instante conserva temporalmente la edicion del ticket; uno creado
// despues nace ya con esa funcion en Premium.
//
// Conviene dejarla en el dia del despliegue o un poco despues: adelantarla
// marcaria como nuevos a negocios que en realidad ya existian, y eso si les
// quitaria algo. Atrasarla solo regala unos dias de un beneficio que de todos
// modos termina el 20 de septiembre.
export const TICKET_PREMIUM_NEW_BUSINESS_CUTOFF = "2026-09-13T00:00:00-06:00";

// Fin del periodo de transicion para los negocios que ya existian. El desfase
// (-06:00) es el de Mexico y forma parte de la constante: fija un instante
// absoluto, asi que el corte cae a la medianoche mexicana aunque el equipo
// este configurado en otra zona horaria. No hace falta desplegar ese dia.
export const TICKET_EDITOR_LEGACY_END_DATE = "2026-09-21T00:00:00-06:00";

// Ultimo dia con acceso, tal como se le muestra a la persona.
export const TICKET_EDITOR_LEGACY_UNTIL_LABEL = "20 de septiembre de 2026";

// Limite de usuarios del plan Gratuito. Debe coincidir con el de las reglas de
// Firestore, que son las que de verdad lo impiden.
export const LIMITE_USUARIOS_GRATUITO = 3;
export const LIMITE_HISTORIAL_CORTES_GRATUITO = 3;
export const LIMITE_PISOS_RESTAURANTE_GRATUITO = 1;
export const LIMITE_MESAS_RESTAURANTE_GRATUITO = 10;

const NEW_BUSINESS_CUTOFF_AT = new Date(TICKET_PREMIUM_NEW_BUSINESS_CUTOFF).getTime();
const LEGACY_END_AT = new Date(TICKET_EDITOR_LEGACY_END_DATE).getTime();

/** Acepta Timestamp de Firestore, Date, numero o texto. 0 si no hay fecha util. */
export function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * Premium efectivo del NEGOCIO, no del usuario: la suscripcion pertenece al
 * negocio y todos sus usuarios comparten el mismo plan.
 *
 * El derecho depende de `premiumUntil` vigente, nunca del estado de la
 * suscripcion: cancelar significa que no habra otro cobro, no que se pierda el
 * periodo ya pagado.
 */
export function isPremiumBusiness(negocio, ahoraMs = Date.now()) {
  return toMillis(negocio?.premiumUntil) > ahoraMs;
}

/**
 * Negocio anterior a esta actualizacion, con derecho al periodo de transicion.
 *
 * La condicion es del NEGOCIO y se mide con la fecha de creacion del negocio,
 * no la de ninguna cuenta: dar de alta un empleado nuevo en un negocio antiguo
 * jamas debe convertirlo en un negocio nuevo.
 *
 * Un negocio sin fecha de creacion legible se considera antiguo. Solo puede
 * faltarle si es anterior al dia en que se empezo a registrarla, y equivocarse
 * hacia este lado regala un beneficio que caduca solo; equivocarse hacia el
 * otro le quitaria hoy mismo una funcion a un cliente que ya la tenia.
 */
export function esNegocioLegacy(negocio) {
  if (!negocio) return false;
  const creado = toMillis(negocio.createdAt || negocio.fechaCreacion || negocio.creadoEn);
  if (!creado) return true;
  return creado < NEW_BUSINESS_CUTOFF_AT;
}

/** true cuando el periodo de transicion ya termino para todos. */
export function isTicketEditorLegacyPeriodOver(ahoraMs = Date.now()) {
  return ahoraMs >= LEGACY_END_AT;
}

/**
 * Unica regla de la edicion y personalizacion del ticket.
 *
 * Premium siempre puede. Un negocio antiguo puede hasta la fecha de migracion.
 * Un negocio nuevo nunca, ni siquiera durante la transicion. Un plan todavia
 * sin confirmar ("loading") no habilita nada: ante la duda se usa el diseño
 * predeterminado, jamas al reves.
 */
export function canUseTicketEditor({
  premiumState = PLAN_LOADING,
  negocioLegacy = false,
  ahoraMs = Date.now(),
} = {}) {
  if (premiumState === PLAN_PREMIUM) return true;
  if (premiumState !== PLAN_FREE) return false;
  if (!negocioLegacy) return false;
  return !isTicketEditorLegacyPeriodOver(ahoraMs);
}

/**
 * Aviso de transicion: solo para el negocio antiguo y gratuito que todavia
 * conserva la funcion. Nunca para Premium ni para un negocio nuevo.
 */
export function showTicketEditorMigrationNotice({
  premiumState = PLAN_LOADING,
  negocioLegacy = false,
  ahoraMs = Date.now(),
} = {}) {
  return premiumState === PLAN_FREE
    && negocioLegacy
    && !isTicketEditorLegacyPeriodOver(ahoraMs);
}

/**
 * Conteo de inventario. Sin periodo de transicion: es Premium desde ya, tanto
 * para negocios nuevos como para los que ya existian.
 */
export function canUseInventoryCount({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM;
}

/** Cerrar la caja es una operacion basica disponible en ambos planes. */
export function canUseCashClosing({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM || premiumState === PLAN_FREE;
}

// ---------------------------------------------------------------------------
// Plan de cada reporte exportable a Excel.
//
// Vive aqui, con el resto de las reglas de plan, y no junto a la pantalla de
// reportes: esconder un boton no es un control de acceso. El generador
// consulta esta misma tabla antes de leer un solo dato, asi que manipular el
// frontend no alcanza para obtener un reporte Premium.
//
// El criterio no es "lo bueno se paga": los reportes gratuitos entregan la
// operacion del negocio, que es informacion suya. Premium agrega el analisis
// -- comparativas, costos, utilidad, historico y desglose por persona.
//
// Free = que paso.  Premium = que paso, cuando, como, quien y cuanto dejo.
// ---------------------------------------------------------------------------

export const REPORTES_PLAN = {
  // --- Free: la operacion del negocio, con buen aspecto y utilizable. ---
  resumen_ventas: PLAN_FREE,
  ejecutivo_basico: PLAN_FREE,
  historial_ventas: PLAN_FREE,
  catalogo_productos: PLAN_FREE,
  inventario_actual: PLAN_FREE,
  stock_bajo: PLAN_FREE,
  directorio_clientes: PLAN_FREE,
  egresos_basico: PLAN_FREE,
  saldos_pendientes: PLAN_FREE,
  empleados_basico: PLAN_FREE,
  metodos_pago_basico: PLAN_FREE,
  restaurante_resumen: PLAN_FREE,
  // El corte gratuito ya esta limitado en el sistema (sin arqueo y con solo
  // los cortes recientes); su reporte respeta exactamente ese alcance.
  corte_caja_basico: PLAN_FREE,

  // --- Premium: analisis, costos, comparativas e historico completo. ---
  ejecutivo_completo: PLAN_PREMIUM,
  factura_global: PLAN_PREMIUM,
  historial_ventas_completo: PLAN_PREMIUM,
  analisis_productos: PLAN_PREMIUM,
  inventario_completo: PLAN_PREMIUM,
  corte_caja_completo: PLAN_PREMIUM,
  historial_cortes: PLAN_PREMIUM,
  egresos_avanzado: PLAN_PREMIUM,
  analisis_clientes: PLAN_PREMIUM,
  estado_cuenta_cliente: PLAN_PREMIUM,
  cuentas_por_cobrar: PLAN_PREMIUM,
  rendimiento_empleados: PLAN_PREMIUM,
  metodos_pago_avanzado: PLAN_PREMIUM,
  rentabilidad: PLAN_PREMIUM,
  descuentos: PLAN_PREMIUM,
  restaurante_meseros: PLAN_PREMIUM,
  restaurante_platillos: PLAN_PREMIUM,
  restaurante_mesas: PLAN_PREMIUM,
  restaurante_comandas: PLAN_PREMIUM,
  paquete_administrativo: PLAN_PREMIUM,

  // Reportes que el sistema todavia no puede construir con datos reales
  // (falta empezar a registrar la informacion que necesitan). Su plan se
  // declara desde ahora para que la pantalla los muestre con la etiqueta
  // correcta y para que nunca queden accesibles por omision.
  cancelaciones: PLAN_PREMIUM,
  devoluciones: PLAN_PREMIUM,
  inventario_kardex: PLAN_PREMIUM,
  inventario_conteo: PLAN_PREMIUM,
  auditoria: PLAN_PREMIUM,
};

// Un id de reporte llega desde la pantalla, asi que se trata como entrada no
// confiable: se comprueba que la clave sea PROPIA de la tabla y que su valor
// sea uno de los dos planes reales. Sin esto, un id como "__proto__" o
// "constructor" devuelve un objeto heredado -- que es "verdadero" -- y pasaria
// la comprobacion de acceso.
function planDelReporte(reporteId) {
  const clave = String(reporteId || "");
  if (!Object.prototype.hasOwnProperty.call(REPORTES_PLAN, clave)) return null;
  const plan = REPORTES_PLAN[clave];
  return plan === PLAN_FREE || plan === PLAN_PREMIUM ? plan : null;
}

/**
 * Unica regla de acceso a un reporte.
 *
 * Un reporte desconocido se niega: agregar una exportacion nueva obliga a
 * declarar su plan aqui, y mientras no se declare nadie puede descargarla.
 *
 * Un plan sin confirmar ("loading") nunca concede acceso provisional, ni
 * siquiera a un reporte gratuito: la pantalla espera a saber el plan real.
 */
export function canUseReport(reporteId, { premiumState = PLAN_LOADING } = {}) {
  const plan = planDelReporte(reporteId);
  if (!plan) return false;
  if (premiumState === PLAN_PREMIUM) return true;
  if (premiumState !== PLAN_FREE) return false;
  return plan === PLAN_FREE;
}

/** true cuando el reporte pertenece a Premium, para marcarlo en la pantalla. */
export function esReportePremium(reporteId) {
  return planDelReporte(reporteId) === PLAN_PREMIUM;
}

/**
 * El arqueo detallado (denominaciones, contado, diferencia y su hoja del PDF)
 * es Premium. Un plan sin confirmar nunca obtiene acceso provisional.
 */
export function canUseCashReconciliation({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM;
}

/** Funciones operativas de restaurante que forman parte de Premium. */
export function canUseRestaurantCookLimit({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM;
}

export function canUseRestaurantActivityPayments({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM;
}

export function canUseRestaurantReservations({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM;
}

export function canUseAutomaticPaymentPdf({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM;
}

export function canUseServiceTracker({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM;
}

/**
 * Evidencias fotograficas del servicio: subir, describir y eliminar fotos.
 *
 * Es Premium. Un plan sin confirmar ("loading") no habilita nada: ante la duda
 * la pantalla espera, jamas concede acceso provisional.
 */
export function canUseServiceEvidence({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM;
}

/**
 * Ver las evidencias que ya existen NO es Premium.
 *
 * Un negocio que dejo de pagar no pierde lo que documento cuando pagaba: sus
 * fotos siguen ahi y las puede consultar. Lo que Premium habilita es agregar
 * y modificar. Esta regla y la de Firestore dicen lo mismo -- alla las
 * evidencias quedan congeladas para un negocio gratuito, no borradas.
 */
export function canViewServiceEvidence({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM || premiumState === PLAN_FREE;
}

/**
 * Firma digital y aceptacion de la orden por parte del cliente.
 *
 * Disponible en AMBOS planes a proposito: es el respaldo del negocio frente a
 * una reclamacion, no un lujo. Cobrar por poder demostrar que el cliente
 * autorizo el trabajo dejaria sin defensa justo a quien menos puede pagarla.
 */
export function canUseServiceSignature({ premiumState = PLAN_LOADING } = {}) {
  return premiumState === PLAN_PREMIUM || premiumState === PLAN_FREE;
}

export const PREMIUM_SALES_FEATURES = [
  "canjes", "terminosPersonalizados", "promocionesDescuentos", "fiado", "descuentoAutorizado", "abonarServicio", "consultaPrecios",
];

export function canUseSalesFeature(feature, { premiumState = PLAN_LOADING, enabled = true } = {}) {
  return PREMIUM_SALES_FEATURES.includes(feature)
    && premiumState === PLAN_PREMIUM && enabled === true;
}

export function canUseServiceDeposits({ premiumState = PLAN_LOADING } = {}) {
  return canUseSalesFeature("abonarServicio", { premiumState });
}

export function canUsePriceChecker({ premiumState = PLAN_LOADING, enabled = true } = {}) {
  return canUseSalesFeature("consultaPrecios", { premiumState, enabled });
}

export function resolvePOSFeatures(config = {}, premiumState = PLAN_LOADING) {
  return Object.fromEntries(["promocionesDescuentos", "fiado", "descuentoAutorizado", "consultaPrecios"].map(
    (feature) => [feature, canUseSalesFeature(feature, { premiumState, enabled: config[feature] !== false })],
  ));
}

export function canUseServiceTrackingQr({ premiumState = PLAN_LOADING, trackingEnabled = false } = {}) {
  return canUseServiceTracker({ premiumState }) && trackingEnabled === true;
}

/** Limites efectivos. Loading usa los limites Free para no conceder acceso provisional. */
export function getRestaurantPlanLimits({ premiumState = PLAN_LOADING } = {}) {
  if (premiumState === PLAN_PREMIUM) {
    return { maxPisos: 20, maxMesasPorPiso: 200, maxMesasTotal: 4000 };
  }
  return {
    maxPisos: LIMITE_PISOS_RESTAURANTE_GRATUITO,
    maxMesasPorPiso: LIMITE_MESAS_RESTAURANTE_GRATUITO,
    maxMesasTotal: LIMITE_MESAS_RESTAURANTE_GRATUITO,
  };
}

// ---------------------------------------------------------------------------
// Comparacion comercial de los planes.
//
// Vive junto a las reglas para que lo que se le promete a la gente no pueda
// separarse de lo que el sistema hace de verdad. Cada linea corresponde a algo
// que el codigo comprueba; el soporte preferente se marca aparte porque es un
// compromiso de servicio, no una funcion que el sistema pueda medir.
// ---------------------------------------------------------------------------

export const PLAN_FREE_RESUMEN = {
  nombre: "CajaLibre Free",
  precio: "$0",
  periodo: "MXN",
  descripcion: "Lo necesario para comenzar y administrar tu negocio.",
  incluye: [
    "Punto de venta y cobro",
    "Inventario y productos",
    "Clientes",
    "Impresion y reimpresion de tickets",
    "Servicios y cotizaciones",
    "Firma digital y aceptacion del cliente",
    "Reportes del negocio",
    `Cierre de caja y ${LIMITE_HISTORIAL_CORTES_GRATUITO} cortes recientes`,
    "Centro de ayuda y tickets de soporte",
    `Hasta ${LIMITE_USUARIOS_GRATUITO} usuarios`,
  ],
};

export const PLAN_PREMIUM_RESUMEN = {
  nombre: "CajaLibre Premium",
  precio: "$300",
  periodo: "MXN / mes",
  descripcion: "Una suscripcion por negocio.",
  incluye: [
    "Todo lo del plan gratuito",
    "Edicion y personalizacion de tickets",
    "Conteo de inventario",
    "Arqueo de caja y PDF detallado",
    "Historial completo de cortes de caja",
    "Limite de platillos activos por cocinero",
    "Pago automatico por actividad en restaurante",
    "Pisos y mesas de restaurante sin limite Free",
    "Reservaciones de restaurante",
    "Rastreo de servicios con codigo QR",
    "Evidencias fotograficas del servicio",
    "Canjes y programa de puntos",
    "Terminos y condiciones personalizados",
    "Descuentos y promociones",
    "Ventas fiadas",
    "Descuento autorizado con contraseña",
    "Abonos a servicios desde el punto de venta",
    "Consulta de precios con lector de código de barras",
    "Sin publicidad",
    "Logo de tu negocio",
    "Usuarios ilimitados",
    "Insignia Premium",
    "Soporte preferente",
  ],
};

// Comparacion funcion por funcion. `free: true` significa que el sistema hoy
// permite usarla sin pagar.
export const COMPARATIVA_PLANES = [
  { funcion: "Ventas y punto de venta", free: true },
  { funcion: "Productos e inventario", free: true },
  { funcion: "Consulta de precios", free: false },
  { funcion: "Clientes", free: true },
  { funcion: "Canjes y programa de puntos", free: false },
  { funcion: "Modificar y agregar terminos y condiciones", free: false },
  { funcion: "Descuentos y promociones", free: false },
  { funcion: "Ventas fiadas", free: false },
  { funcion: "Descuento autorizado con contraseña", free: false },
  { funcion: "Impresion de tickets", free: true },
  { funcion: "Reportes del negocio", free: true },
  { funcion: "Centro de ayuda", free: true },
  { funcion: "Tickets de soporte", free: true, premium: "Preferente" },
  {
    funcion: "Asesoria personalizada",
    free: "Con costo por hora",
    premium: "Soporte preferente",
  },
  { funcion: "Usuarios", free: `Hasta ${LIMITE_USUARIOS_GRATUITO}`, premium: "Ilimitados" },
  { funcion: "Edicion y personalizacion de tickets", free: false },
  { funcion: "Conteo de inventario", free: false },
  { funcion: "Cierre de caja", free: true },
  {
    funcion: "Historial de cortes de caja",
    free: `${LIMITE_HISTORIAL_CORTES_GRATUITO} mas recientes`,
    premium: "Completo",
  },
  { funcion: "Arqueo de caja y PDF detallado", free: false },
  { funcion: "Pisos / areas", free: `${LIMITE_PISOS_RESTAURANTE_GRATUITO}`, premium: "Multiples" },
  { funcion: "Mesas", free: `Maximo ${LIMITE_MESAS_RESTAURANTE_GRATUITO}`, premium: "Ampliado" },
  { funcion: "Administracion basica de restaurante", free: "Limitada", premium: "Completa" },
  { funcion: "Pago automatico por actividad en restaurante", free: false },
  { funcion: "PDFs de pago automatico", free: false },
  { funcion: "Reservaciones de restaurante", free: false },
  { funcion: "Gestion de servicios", free: true, premium: true },
  { funcion: "Firma digital y aceptacion del cliente", free: true, premium: true },
  { funcion: "Historial de estados del servicio", free: true, premium: true },
  { funcion: "Evidencias fotograficas del servicio", free: false },
  { funcion: "Abonar servicio", free: false },
  { funcion: "Registro y cambio de estado de servicios", free: true, premium: true },
  { funcion: "Rastreador publico de servicios", free: false },
  { funcion: "Codigo QR de seguimiento", free: false },
  { funcion: "Seguimiento por folio", free: false },
  { funcion: "Logo del negocio en el rastreador", free: false },
  { funcion: "Pagina personalizada de seguimiento", free: false },
  { funcion: "Logo de tu negocio", free: false },
  { funcion: "Sin publicidad", free: false },
];
