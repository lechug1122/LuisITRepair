import {Firestore, getFirestore, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {createHash, timingSafeEqual} from "node:crypto";

function publicTimestamp(value: unknown) {
  return value instanceof Timestamp ? {
    seconds: value.seconds,
    nanoseconds: value.nanoseconds,
  } : null;
}

function publicAcceptance(servicio: FirebaseFirestore.DocumentData) {
  const acceptance = servicio.aceptacion;
  if (!acceptance || typeof acceptance !== "object") {
    return {estado: "no_solicitada", version: 0};
  }

  return {
    estado: String(acceptance.estado || "no_solicitada"),
    version: Number(acceptance.version) || 1,
    nombreCliente: String(acceptance.nombreCliente || ""),
    aceptoCondiciones: acceptance.aceptoCondiciones === true,
    motivoRechazo: String(acceptance.motivoRechazo || ""),
    comentarioRechazo: String(acceptance.comentarioRechazo || ""),
    fechaSolicitud: publicTimestamp(acceptance.fechaSolicitud),
    fechaRespuesta: publicTimestamp(acceptance.fechaRespuesta),
    firmaUrl: acceptance.estado === "aceptado" ? String(acceptance.firmaUrl || "") : "",
    firmaDataUrl: acceptance.estado === "aceptado" ? String(acceptance.firmaDataUrl || "") : "",
  };
}

// Tope de renglones que viaja al cliente. Una boleta real no pasa de unas
// decenas; el limite existe para que un documento corrupto no infle la
// respuesta de una funcion publica.
const MAX_RENGLONES_BOLETA = 60;

function numeroPublico(valor: unknown): number {
  const limpio = Number(String(valor ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(limpio) ? limpio : 0;
}

/**
 * Boleta del servicio tal y como la ve el cliente.
 *
 * Solo viajan los renglones y los totales: lo que el cliente paga es suyo y
 * tiene derecho a revisarlo antes de firmar. NO viaja nada de la trastienda
 * (costo de compra, proveedor, margen, ids de inventario ni el empleado que
 * la capturo), porque de la boleta guardada se copian campos por lista
 * explicita, nunca el objeto completo.
 */
type RenglonBoleta = {
  item: string;
  descripcion: string;
  cantidad: number;
  pUnitario: number;
  importe: number;
};

export function publicBoleta(servicio: FirebaseFirestore.DocumentData) {
  const boleta = servicio.boleta;
  if (!boleta || typeof boleta !== "object") return null;

  const crudos = Array.isArray(boleta.items) ? boleta.items : [];
  const items: RenglonBoleta[] = crudos.slice(0, MAX_RENGLONES_BOLETA)
    .flatMap((raw: unknown, indice: number): RenglonBoleta[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const descripcion = String(item.descripcion || "").trim();
    const cantidad = numeroPublico(item.cantidad);
    const pUnitario = numeroPublico(item.pUnitario ?? item.precio);
    if (!descripcion && !pUnitario) return [];
    return [{
      item: String(item.item || `P-${String(indice + 1).padStart(3, "0")}`).slice(0, 40),
      descripcion: (descripcion || "Artículo").slice(0, 200),
      cantidad,
      pUnitario,
      importe: Number((cantidad * pUnitario).toFixed(2)),
    }];
  });

  const total = numeroPublico(boleta.total) ||
    items.reduce((suma: number, item: RenglonBoleta) => suma + item.importe, 0);

  // Una boleta vacia y sin total no es un documento: es un campo a medio
  // llenar. Devolver null deja que la pantalla muestre el presupuesto simple.
  if (!items.length && !total) return null;

  return {
    tipoDocumento: String(boleta.tipoDocumento || "venta"),
    folio: String(boleta.folio || ""),
    fecha: String(boleta.fecha || ""),
    formaPago: String(boleta.formaPago || ""),
    notas: String(boleta.notas || "").slice(0, 600),
    items,
    total: Number(total.toFixed(2)),
    // Solo es "truncada" si el tope dejo renglones fuera. Un renglon vacio
    // descartado no es un documento incompleto, es basura que no se muestra.
    truncada: crudos.length > MAX_RENGLONES_BOLETA,
  };
}

function publicEvidence(servicio: FirebaseFirestore.DocumentData) {
  const raw = servicio.evidencias;
  const entries = Array.isArray(raw)
    ? raw.map((item, index) => [`legacy_${index}`, item] as const)
    : (raw && typeof raw === "object" ? Object.entries(raw) : []);

  return entries.flatMap(([id, item]) => {
    if (!item || typeof item !== "object") return [];
    const evidence = item as Record<string, unknown>;
    const url = String(evidence.url || "");
    if (!url) return [];
    return [{
      id: String(evidence.id || id),
      url,
      miniaturaUrl: String(evidence.miniaturaUrl || url),
      tipo: String(evidence.tipo || "ingreso"),
      descripcion: String(evidence.descripcion || ""),
      fecha: publicTimestamp(evidence.fecha),
    }];
  });
}

function validAcceptanceReference(
  raw: unknown,
  negocioId: string,
  servicioId: string,
  servicio: FirebaseFirestore.DocumentData,
) {
  if (typeof raw !== "string") return false;
  const [referenceBusiness, referenceService, token, ...rest] = raw.trim().split("~");
  if (rest.length || referenceBusiness !== negocioId || referenceService !== servicioId ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(token || "")) return false;
  const received = createHash("sha256").update(token).digest("hex");
  const expected = servicio.aceptacionToken?.hash;
  return typeof expected === "string" && expected.length === received.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

// Admin SDK consulta el servicio vigente. No depende de una copia pública
// que puede faltar en servicios históricos o tras fallos de sincronización.
export async function buscarRastreoPublico(
  db: Firestore,
  rawFolio: unknown,
  rawAcceptanceReference: unknown = "",
) {
  if (typeof rawFolio !== "string" || !rawFolio.trim() || rawFolio.trim().length > 120) {
    throw new HttpsError("invalid-argument", "El folio no es válido.");
  }
  const folio = rawFolio.trim();
  const snapshot = await db.collectionGroup("servicios")
    .where("folio", "==", folio)
    .limit(10)
    .get();

  for (const item of snapshot.docs) {
    const servicio = item.data();
    const negocioId = servicio.negocioId;
    if (typeof negocioId !== "string" || !negocioId || negocioId.includes("/") ||
      item.ref.path !== `negocios/${negocioId}/servicios/${item.id}` ||
      servicio.folio !== folio) continue;

    const [config, marca] = await db.getAll(
      db.doc(`negocios/${negocioId}/configuracion/servicios`),
      db.doc(`negocios/${negocioId}/configuracion/empresa`),
    );
    const marcaPublica = marca.data();
    // Un enlace de aceptacion valido abre esta misma ficha aunque el rastreo
    // general este apagado. Sin token, se conserva la configuracion del QR.
    const authorizedByAcceptance = validAcceptanceReference(
      rawAcceptanceReference, negocioId, item.id, servicio,
    );
    if (config.data()?.trackingEnabled !== true && !authorizedByAcceptance) continue;

    // Lista explícita: nunca devolver datos personales ni el documento privado.
    return {
      id: item.id,
      folio,
      tipoDispositivo: String(servicio.tipoDispositivo || ""),
      marca: String(servicio.marca || ""),
      modelo: String(servicio.modelo || ""),
      trabajo: String(servicio.trabajo || ""),
      status: String(servicio.status || ""),
      createdAt: publicTimestamp(servicio.createdAt),
      updatedAt: publicTimestamp(servicio.updatedAt),
      fechaAprox: String(servicio.fechaAprox || ""),
      numeroSerie: String(servicio.numeroSerie || ""),
      costo: String(servicio.costo ?? ""),
      precioDespues: servicio.precioDespues === true,
      hojaServicio: {
        terminos: Array.isArray(servicio.hojaServicio?.terminos)
          ? servicio.hojaServicio.terminos.map((item: unknown) => String(item || "")).slice(0, 40)
          : [],
      },
      boleta: publicBoleta(servicio),
      aceptacion: publicAcceptance(servicio),
      evidencias: publicEvidence(servicio),
      negocioNombre: String(marcaPublica?.nombre || ""),
      negocioLogo: String(marcaPublica?.logo || ""),
    };
  }
  return null;
}

// Consulta anónima para los enlaces y QR que recibe el cliente.
export const consultarServicioPublico = onCall({
  region: "southamerica-east1",
  invoker: "public",
  maxInstances: 5,
}, (request) => buscarRastreoPublico(
  getFirestore(),
  request.data?.folio,
  request.data?.aceptacion,
));
