import {getFirestore, FieldValue, Firestore, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {createHash, randomUUID, timingSafeEqual} from "node:crypto";
import * as logger from "firebase-functions/logger";

import {guardarArchivo, leerImagenBase64} from "./storage_bucket";
import {publicBoleta} from "./service_tracking";

// ---------------------------------------------------------------------------
// Aceptacion de la orden de servicio por parte del cliente.
//
// POR QUE ESTO VIVE EN EL SERVIDOR
//
// El cliente que abre el enlace no tiene sesion en CajaLibre, y no debe
// tenerla: darle permiso de escritura en Firestore para que pueda firmar
// significaria darle permiso sobre un documento que tambien contiene precios,
// costos, notas internas y el estado administrativo del servicio. Aqui el
// cliente no escribe nada: manda su decision y el servidor decide que campos
// cambian. Precios, productos, mano de obra, notas y estado administrativo son
// intocables desde este camino.
//
// LO QUE SE VALIDA ANTES DE ESCRIBIR
//   1. El token del enlace coincide (comparado en tiempo constante).
//   2. El enlace no ha caducado.
//   3. El enlace no se ha usado ya  -> no hay doble aceptacion.
//   4. La version del token es la vigente -> un enlace viejo no responde una
//      orden nueva.
//   5. Todo dentro de una transaccion, asi que dos envios simultaneos no
//      pueden registrarse los dos.
//
// Las fechas son SIEMPRE del servidor. La hora del telefono del cliente no
// decide cuando se acepto una orden.
// ---------------------------------------------------------------------------

const REGION = "southamerica-east1";

// Una firma trazada a mano pesa decenas de KB. Este tope deja margen de sobra
// y corta de raiz cualquier intento de usar el enlace para subir archivos.
const MAX_FIRMA_BYTES = 400 * 1024;
const MAX_TEXTO = 400;
const MAX_NOMBRE = 120;

const MOTIVOS_RECHAZO = new Set([
  "precio", "no_deseo", "modificar_presupuesto", "hablar_con_negocio", "otro",
]);

type Referencia = {negocioId: string; servicioId: string; token: string};

function texto(valor: unknown, maximo: number): string {
  return String(valor ?? "").trim().slice(0, maximo);
}

/**
 * Parte la referencia del enlace: `negocioId~servicioId~token`.
 *
 * Se rechaza cualquier segmento con "/" o "..": con eso se podria apuntar a un
 * documento distinto del que la ruta aparenta.
 */
function leerReferencia(raw: unknown): Referencia {
  const valor = typeof raw === "string" ? raw.trim() : "";
  const partes = valor.split("~");
  if (partes.length !== 3) throw new HttpsError("invalid-argument", "El enlace no es válido.");

  const [negocioId, servicioId, token] = partes;
  const seguro = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);
  if (!seguro(negocioId) || !seguro(servicioId) || !seguro(token) || token.length < 32) {
    throw new HttpsError("invalid-argument", "El enlace no es válido.");
  }
  return {negocioId, servicioId, token};
}

function hashDeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparacion en tiempo constante: no filtra cuantos caracteres acerto. */
function hashCoincide(esperado: unknown, recibido: string): boolean {
  if (typeof esperado !== "string" || esperado.length !== recibido.length) return false;
  return timingSafeEqual(Buffer.from(esperado), Buffer.from(recibido));
}

function aMillis(valor: unknown): number {
  return valor instanceof Timestamp ? valor.toMillis() : 0;
}

function publico(valor: unknown) {
  return valor instanceof Timestamp
    ? {seconds: valor.seconds, nanoseconds: valor.nanoseconds}
    : null;
}

/**
 * Localiza el servicio y comprueba el token. No escribe nada.
 *
 * Todos los fallos devuelven el MISMO mensaje: distinguir "no existe" de
 * "token incorrecto" le diria a quien pruebe enlaces al azar cuando acerto el
 * negocio y el servicio.
 */
async function resolverOrden(db: Firestore, referencia: Referencia) {
  const ref = db.doc(`negocios/${referencia.negocioId}/servicios/${referencia.servicioId}`);
  const snap = await ref.get();
  const servicio = snap.data();

  const invalido = () => new HttpsError(
    "permission-denied",
    "Este enlace no es válido o ya no está disponible. Contacta al negocio.",
  );

  if (!servicio) throw invalido();
  if (servicio.negocioId !== referencia.negocioId) throw invalido();
  if (!hashCoincide(servicio.aceptacionToken?.hash, hashDeToken(referencia.token))) throw invalido();

  return {ref, servicio};
}

function estadoDelEnlace(servicio: FirebaseFirestore.DocumentData) {
  const expiraMs = aMillis(servicio.aceptacionToken?.expiraEn);
  if (servicio.aceptacionToken?.usado === true) return "usado";
  if (expiraMs && expiraMs < Date.now()) return "caducado";
  if (servicio.aceptacion?.estado !== "pendiente") return "respondida";
  return "vigente";
}

/**
 * Proyeccion que ve el cliente.
 *
 * Lista explicita, nunca el documento completo: quedan fuera el telefono y la
 * direccion de otros, los costos internos, la nota privada del administrador,
 * el empleado que atendio y cualquier campo tecnico.
 *
 * La boleta SI viaja, pero desglosada por `publicBoleta`: nadie puede firmar
 * a ciegas un presupuesto que no ha podido leer renglon por renglon. De la
 * boleta guardada solo se copian concepto, cantidad, precio e importe.
 */
function proyeccionParaCliente(
  servicio: FirebaseFirestore.DocumentData,
  empresa: FirebaseFirestore.DocumentData | undefined,
  configServicios: FirebaseFirestore.DocumentData | undefined,
) {
  const hoja = servicio.hojaServicio || {};
  const terminos: string[] = Array.isArray(hoja.terminos) && hoja.terminos.length
    ? hoja.terminos
    : (Array.isArray(configServicios?.hojaServicio?.terminos) ? configServicios!.hojaServicio.terminos : []);

  return {
    folio: String(servicio.folio || ""),
    cliente: String(servicio.nombre || ""),
    tipoDispositivo: String(servicio.tipoDispositivo || ""),
    marca: String(servicio.marca || ""),
    modelo: String(servicio.modelo || ""),
    numeroSerie: String(servicio.numeroSerie || ""),
    trabajo: String(servicio.trabajo || ""),
    observaciones: String(servicio.observaciones || ""),
    costo: String(servicio.costo ?? ""),
    precioDespues: servicio.precioDespues === true,
    boleta: publicBoleta(servicio),
    fechaAprox: String(servicio.fechaAprox || ""),
    createdAt: publico(servicio.createdAt),
    terminos: terminos.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 40),
    negocioNombre: String(empresa?.nombre || ""),
    negocioLogo: String(empresa?.logo || ""),
    negocioTelefono: String(empresa?.telefono || ""),
    aceptacion: {
      estado: String(servicio.aceptacion?.estado || "pendiente"),
      version: Number(servicio.aceptacion?.version) || 1,
      nombreCliente: String(servicio.aceptacion?.nombreCliente || ""),
      fechaRespuesta: publico(servicio.aceptacion?.fechaRespuesta),
      motivoRechazo: String(servicio.aceptacion?.motivoRechazo || ""),
    },
  };
}

/** Consulta anonima de la orden que el cliente debe aceptar. */
export const consultarOrdenAceptacion = onCall({
  region: REGION,
  invoker: "public",
  maxInstances: 10,
}, async (request) => {
  const db = getFirestore();
  const referencia = leerReferencia(request.data?.referencia);
  const {servicio} = await resolverOrden(db, referencia);

  const [empresa, configServicios] = await db.getAll(
    db.doc(`negocios/${referencia.negocioId}/configuracion/empresa`),
    db.doc(`negocios/${referencia.negocioId}/configuracion/servicios`),
  );

  return {
    enlace: estadoDelEnlace(servicio),
    orden: proyeccionParaCliente(servicio, empresa.data(), configServicios.data()),
  };
});

/** Guarda el PNG de la firma con el SDK de administracion. */
async function guardarFirma(negocioId: string, servicioId: string, firmaBase64: string) {
  const buffer = leerImagenBase64(
    firmaBase64, "image/png", MAX_FIRMA_BYTES, "La firma no se pudo leer.",
  );

  // La ruta refleja a que servicio pertenece la firma; nada de nombres
  // aleatorios sueltos en la raiz del bucket.
  const guardado = await guardarArchivo(
    `negocios/${negocioId}/servicios/${servicioId}/firmas/${randomUUID()}.png`,
    buffer,
    "image/png",
    {servicioId, negocioId},
  );

  return {
    url: guardado.url,
    ruta: guardado.ruta,
    dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
  };
}

/**
 * Registra la respuesta del cliente.
 *
 * La transaccion vuelve a leer y validar el token DENTRO de la escritura: sin
 * eso, dos toques rapidos en el boton podrian pasar la validacion los dos y
 * registrar la aceptacion dos veces.
 */
export const responderOrdenAceptacion = onCall({
  region: REGION,
  invoker: "public",
  maxInstances: 10,
}, async (request) => {
  const db = getFirestore();
  const referencia = leerReferencia(request.data?.referencia);
  const decision = String(request.data?.decision || "");

  if (decision !== "aceptado" && decision !== "rechazado") {
    throw new HttpsError("invalid-argument", "Respuesta no válida.");
  }

  const nombreCliente = texto(request.data?.nombreCliente, MAX_NOMBRE);
  const comentario = texto(request.data?.comentario, MAX_TEXTO);
  const motivo = texto(request.data?.motivo, 40);

  if (decision === "aceptado") {
    if (request.data?.aceptoCondiciones !== true) {
      throw new HttpsError("failed-precondition", "Debes aceptar las condiciones para continuar.");
    }
    if (!nombreCliente) {
      throw new HttpsError("failed-precondition", "Escribe tu nombre para registrar la aceptación.");
    }
    if (typeof request.data?.firma !== "string" || !request.data.firma) {
      throw new HttpsError("failed-precondition", "Falta la firma.");
    }
  } else if (!MOTIVOS_RECHAZO.has(motivo)) {
    throw new HttpsError("invalid-argument", "Selecciona un motivo válido.");
  }

  // Se comprueba el enlace ANTES de tocar Storage, para no dejar una firma
  // guardada de un intento que la transaccion va a rechazar igualmente.
  const previo = await resolverOrden(db, referencia);
  const estadoPrevio = estadoDelEnlace(previo.servicio);
  if (estadoPrevio !== "vigente") {
    throw new HttpsError("failed-precondition", estadoPrevio === "usado" || estadoPrevio === "respondida"
      ? "Esta orden ya fue respondida."
      : "Este enlace ya caducó. Pídele al negocio uno nuevo.");
  }

  const firma = decision === "aceptado"
    ? await guardarFirma(referencia.negocioId, referencia.servicioId, String(request.data.firma))
    : null;

  const ahora = Timestamp.now();
  const hashEsperado = hashDeToken(referencia.token);

  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(previo.ref);
    const servicio = snap.data();

    if (!servicio || !hashCoincide(servicio.aceptacionToken?.hash, hashEsperado)) {
      throw new HttpsError("permission-denied", "Este enlace no es válido o ya no está disponible.");
    }
    if (estadoDelEnlace(servicio) !== "vigente") {
      throw new HttpsError("failed-precondition", "Esta orden ya fue respondida.");
    }
    // El enlace pertenece a la version que se pidio; si el negocio genero una
    // nueva solicitud mientras tanto, este enlace ya no responde por ella.
    if (Number(servicio.aceptacionToken?.version) !== Number(servicio.aceptacion?.version)) {
      throw new HttpsError("failed-precondition", "El negocio actualizó esta orden. Pídele el enlace nuevo.");
    }

    const aceptacion = {
      ...(servicio.aceptacion || {}),
      estado: decision,
      fechaRespuesta: ahora,
      nombreCliente,
      aceptoCondiciones: decision === "aceptado",
      motivoRechazo: decision === "rechazado" ? motivo : "",
      comentarioRechazo: decision === "rechazado" ? comentario : "",
      firmaUrl: firma?.url || "",
      firmaStoragePath: firma?.ruta || "",
      firmaDataUrl: firma?.dataUrl || "",
      metodo: "firma_digital",
    };

    // Lista BLANCA de campos. El cliente no puede tocar nada mas del servicio:
    // ni costo, ni boleta, ni notaAdmin, ni los datos del negocio.
    const patch: Record<string, unknown> = {
      aceptacion,
      "aceptacionToken.usado": true,
      "aceptacionToken.usadoEn": ahora,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // El estado del SERVICIO solo se mueve si estaba esperando esta respuesta.
    // Si el negocio ya avanzo, la firma se registra y el trabajo sigue donde
    // estaba: la decision operativa es del negocio, no del enlace.
    const estadoActual = String(servicio.status || "");
    if (estadoActual === "esperando_autorizacion") {
      patch.status = decision === "aceptado" ? "autorizado" : "rechazado";
      // La clave lleva el instante al frente, igual que en la app, para que el
      // orden alfabetico del mapa sea el cronologico.
      patch[`historialEstados.h${String(Date.now()).padStart(14, "0")}${randomUUID().slice(0, 6)}`] = {
        estado: patch.status,
        fecha: ahora,
        usuarioId: "",
        usuarioNombre: nombreCliente,
        origen: "cliente",
        nota: decision === "aceptado"
          ? "El cliente aceptó y firmó la orden"
          : `El cliente rechazó la orden: ${motivo}`,
      };
      patch.ultimoCambioEstadoEn = ahora;
    }

    tx.update(previo.ref, patch);
    return {estado: decision, fechaRespuesta: publico(ahora), folio: String(servicio.folio || "")};
  }).catch((error) => {
    logger.error("responderOrdenAceptacion", {
      negocioId: referencia.negocioId,
      servicioId: referencia.servicioId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  });

  return resultado;
});
