import { useEffect, useMemo, useRef, useState } from "react";

import FirmaCanvas from "./FirmaCanvas";
import {
  MOTIVOS_RECHAZO,
  consultarOrdenAceptacion,
  etiquetaMotivoRechazo,
  responderOrdenAceptacion,
} from "../js/services/servicio_aceptacion";
import { formatearDinero, leerBoletaPublica } from "../js/services/servicio_boleta_publica";
import "../css/servicio_modulo.css";

function fecha(marca) {
  if (!marca?.seconds) return "";
  return new Date(marca.seconds * 1000).toLocaleString("es-MX", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function dinero(valor) {
  const numero = Number(String(valor ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numero) || numero <= 0) return "Por confirmar";
  return formatearDinero(numero);
}

const AVISO_ENLACE = {
  usado: "Esta orden ya fue respondida desde este enlace.",
  respondida: "Esta orden ya fue respondida. Si necesitas cambiar algo, contacta al negocio.",
  caducado: "El enlace para firmar ya caducó. Pídele al negocio que te envíe uno nuevo.",
};

function ResumenAceptacion({ aceptacion }) {
  const estado = aceptacion?.estado || "no_solicitada";
  if (estado === "aceptado") {
    return <div className="status-acceptance-result status-acceptance-result--accepted">
      <strong>Orden aceptada y firmada</strong>
      <span>{aceptacion.nombreCliente || "Cliente"}{aceptacion.fechaRespuesta ? ` · ${fecha(aceptacion.fechaRespuesta)}` : ""}</span>
      {aceptacion.firmaUrl || aceptacion.firmaDataUrl ? <img src={aceptacion.firmaUrl || aceptacion.firmaDataUrl} alt={`Firma de ${aceptacion.nombreCliente || "cliente"}`} /> : null}
    </div>;
  }
  if (estado === "rechazado") {
    return <div className="status-acceptance-result status-acceptance-result--rejected">
      <strong>Orden no autorizada</strong>
      <span>{etiquetaMotivoRechazo(aceptacion.motivoRechazo)}{aceptacion.comentarioRechazo ? ` · ${aceptacion.comentarioRechazo}` : ""}</span>
    </div>;
  }
  if (estado === "pendiente") {
    return <div className="status-acceptance-result status-acceptance-result--pending">
      <strong>Aceptación pendiente de firma</strong>
      <span>
        La firma se hace en esta misma página, desde el enlace personal que te
        envió el negocio. Si lo tienes a la mano, ábrelo y el recuadro para
        firmar aparecerá aquí abajo.
      </span>
    </div>;
  }
  return <div className="status-acceptance-result"><strong>Aceptación no solicitada</strong><span>El negocio todavía no ha solicitado una firma para esta orden.</span></div>;
}

/* -------------------------------------------------------------------------
   Boleta

   El cliente firma un presupuesto: tiene que poder leerlo renglon por
   renglon. Cuando el negocio no ha desglosado nada, se cae al presupuesto
   simple en vez de mostrar una tabla vacia.
------------------------------------------------------------------------- */
function BoletaOrden({ boleta, servicio, onDescargar, descargando }) {
  if (!boleta) {
    return <div className="status-order-block status-order-budget">
      <h3>Presupuesto general</h3>
      <strong>{servicio?.precioDespues ? "Por definir" : dinero(servicio?.costo)}</strong>
    </div>;
  }

  return <div className="status-order-block status-order-receipt">
    <div className="status-receipt-head">
      <div>
        <h3>{boleta.esCotizacion ? "Boleta de cotización" : "Boleta de venta"}</h3>
        <p className="status-receipt-meta">
          {[boleta.folio ? `Folio ${boleta.folio}` : "", boleta.fecha, boleta.formaPago ? `Pago: ${boleta.formaPago}` : ""]
            .filter(Boolean).join(" · ") || "Detalle de los conceptos del servicio."}
        </p>
      </div>
      <button
        type="button"
        className="status-button status-button-secondary status-receipt-pdf"
        onClick={onDescargar}
        disabled={descargando}
      >
        {descargando ? "Preparando…" : "Descargar boleta (PDF)"}
      </button>
    </div>

    <div className="status-receipt-scroll">
      <table className="status-receipt-table">
        <caption className="sr-only">
          Conceptos de la {boleta.esCotizacion ? "cotización" : "boleta"} del servicio {servicio?.folio}
        </caption>
        <thead>
          <tr>
            <th scope="col">Descripción</th>
            <th scope="col" className="status-receipt-num">Cant.</th>
            <th scope="col" className="status-receipt-num">P. unitario</th>
            <th scope="col" className="status-receipt-num">Importe</th>
          </tr>
        </thead>
        <tbody>
          {boleta.items.length ? boleta.items.map((item) => (
            <tr key={item.id}>
              <td>
                <span className="status-receipt-desc">{item.descripcion}</span>
                {item.item ? <small>{item.item}</small> : null}
              </td>
              <td className="status-receipt-num">{item.cantidad}</td>
              <td className="status-receipt-num">{formatearDinero(item.pUnitario)}</td>
              <td className="status-receipt-num">{formatearDinero(item.importe)}</td>
            </tr>
          )) : (
            <tr><td colSpan={4} className="status-receipt-vacia">Esta boleta todavía no tiene conceptos capturados.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>Total</th>
            <td className="status-receipt-num status-receipt-total">{formatearDinero(boleta.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    {boleta.truncada ? <p className="status-receipt-nota">Se muestran los primeros conceptos. Pide el documento completo al negocio.</p> : null}
    {boleta.notas ? <p className="status-receipt-nota"><strong>Notas:</strong> {boleta.notas}</p> : null}
    {boleta.esCotizacion ? <p className="status-receipt-nota">Documento informativo: los precios pueden cambiar hasta confirmar el servicio.</p> : null}
  </div>;
}

/* -------------------------------------------------------------------------
   Evidencias

   Una foto de 170 px no sirve para revisar un rayon o una pieza. Al tocarla
   se abre a pantalla completa. Si una imagen no carga (enlace caducado,
   archivo borrado) se retira del mosaico en vez de dejar un hueco roto.
------------------------------------------------------------------------- */
function EvidenciasOrden({ grupos }) {
  const [rotas, setRotas] = useState(() => new Set());
  const [ampliada, setAmpliada] = useState(null);

  const visibles = useMemo(() => grupos
    .map((grupo) => ({ ...grupo, fotos: grupo.fotos.filter((foto) => !rotas.has(foto.url)) }))
    .filter((grupo) => grupo.fotos.length), [grupos, rotas]);

  const total = visibles.reduce((suma, grupo) => suma + grupo.fotos.length, 0);

  useEffect(() => {
    if (!ampliada) return undefined;
    const cerrar = (evento) => { if (evento.key === "Escape") setAmpliada(null); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [ampliada]);

  return <div className="status-order-block" aria-labelledby="status-order-evidence-title">
    <div className="status-receipt-head">
      <div>
        <h3 id="status-order-evidence-title">Fotografías del servicio</h3>
        <p className="status-receipt-meta">
          {total ? `${total} ${total === 1 ? "fotografía" : "fotografías"} · toca una para verla completa` : "Aquí aparecerán las fotos que tome el negocio."}
        </p>
      </div>
    </div>

    {visibles.length ? <div className="status-evidence-groups">{visibles.map((grupo) => <div className="status-evidence-group" key={grupo.key}>
      <h4>{grupo.label}</h4>
      <div className="status-evidence-grid">{grupo.fotos.map((foto) => <figure key={foto.id || foto.url}>
        <button
          type="button"
          className="status-evidence-open"
          onClick={() => setAmpliada({ ...foto, grupo: grupo.label })}
          aria-label={`Ampliar ${foto.descripcion || grupo.label}`}
        >
          <img
            src={foto.miniaturaUrl || foto.url}
            alt={foto.descripcion || grupo.label}
            loading="lazy"
            decoding="async"
            onError={() => setRotas((actual) => new Set(actual).add(foto.url))}
          />
        </button>
        <figcaption>{foto.descripcion || grupo.label}{foto.fecha ? <span>{fecha(foto.fecha)}</span> : null}</figcaption>
      </figure>)}</div>
    </div>)}</div> : <p className="status-empty-inline">Todavía no hay fotografías cargadas en esta orden.</p>}

    {ampliada ? <div
      className="status-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={ampliada.descripcion || ampliada.grupo}
      onClick={() => setAmpliada(null)}
    >
      <button type="button" className="status-lightbox-close" aria-label="Cerrar">×</button>
      <figure onClick={(evento) => evento.stopPropagation()}>
        <img src={ampliada.url || ampliada.miniaturaUrl} alt={ampliada.descripcion || ampliada.grupo} />
        <figcaption>{ampliada.descripcion || ampliada.grupo}{ampliada.fecha ? ` · ${fecha(ampliada.fecha)}` : ""}</figcaption>
      </figure>
    </div> : null}
  </div>;
}

export default function StatusAceptacionCliente({
  referencia,
  servicio,
  evidenceGroups = [],
  onDownload,
  onDownloadBoleta,
  exportingSheet = false,
  exportingReceipt = false,
  downloadError = "",
  onRespondida,
}) {
  const firmaRef = useRef(null);
  const [orden, setOrden] = useState(null);
  const [cargando, setCargando] = useState(Boolean(referencia));
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState("");
  const [condiciones, setCondiciones] = useState(false);
  const [hayFirma, setHayFirma] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respondida, setRespondida] = useState(null);

  useEffect(() => {
    let vigente = true;
    if (!referencia) return undefined;
    setCargando(true);
    consultarOrdenAceptacion(referencia).then((datos) => {
      if (!vigente) return;
      setOrden(datos);
      setNombre((actual) => actual || datos?.orden?.cliente || "");
      setError("");
    }).catch((fallo) => {
      if (vigente) setError(fallo?.message || "No se pudo validar la solicitud de aceptación.");
    }).finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [referencia]);

  const enviar = async (decision) => {
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      const firma = decision === "aceptado" ? firmaRef.current?.exportar() : "";
      const resultado = await responderOrdenAceptacion({
        referencia,
        decision,
        nombreCliente: nombre.trim(),
        aceptoCondiciones: decision === "aceptado",
        firma,
        motivo: decision === "rechazado" ? motivo : "",
        comentario: decision === "rechazado" ? comentario.trim() : "",
      });
      const nueva = {
        ...servicio.aceptacion,
        estado: resultado.estado,
        nombreCliente: nombre.trim(),
        aceptoCondiciones: resultado.estado === "aceptado",
        motivoRechazo: resultado.estado === "rechazado" ? motivo : "",
        comentarioRechazo: resultado.estado === "rechazado" ? comentario.trim() : "",
        firmaDataUrl: resultado.estado === "aceptado" ? firma : "",
        fechaRespuesta: resultado.fechaRespuesta,
      };
      setRespondida(nueva);
      setRechazando(false);
      onRespondida?.(nueva, resultado);
    } catch (fallo) {
      setError(fallo?.message || "No pudimos registrar tu respuesta. Intenta nuevamente.");
    } finally {
      setEnviando(false);
    }
  };

  const detalle = orden?.orden || servicio;
  const aceptacion = respondida || servicio.aceptacion;
  const boleta = useMemo(
    () => leerBoletaPublica(orden?.orden) || leerBoletaPublica(servicio),
    [orden?.orden, servicio],
  );
  const terminos = useMemo(() => {
    const lista = detalle?.terminos || servicio?.hojaServicio?.terminos;
    return Array.isArray(lista) ? lista.filter(Boolean) : [];
  }, [detalle?.terminos, servicio?.hojaServicio?.terminos]);

  // El estado del enlace lo decide el servidor, pero su consulta es SOLO
  // informativa: `responderOrdenAceptacion` vuelve a validar token, vigencia y
  // version dentro de una transaccion. Por eso un fallo de red al consultarlo
  // no puede esconder el recuadro de firma -- antes bastaba con que esa
  // llamada fallara para que el cliente se quedara sin poder firmar.
  const pendiente = (aceptacion?.estado || "") === "pendiente";
  const estadoEnlace = orden?.enlace || (referencia ? "vigente" : "");
  const enlaceBloqueado = Boolean(referencia) && Boolean(orden?.enlace) && estadoEnlace !== "vigente";
  const puedeFirmar = Boolean(referencia) && pendiente && !respondida && !enlaceBloqueado;
  const puedeAceptar = nombre.trim().length >= 3 && condiciones && hayFirma && !enviando;
  const faltante = !nombre.trim() || nombre.trim().length < 3
    ? "Escribe tu nombre completo para continuar."
    : !condiciones
      ? "Marca la casilla de confirmación para continuar."
      : !hayFirma
        ? "Traza tu firma en el recuadro para continuar."
        : "";

  return <section id="aceptacion-cliente" className="status-section status-section--full status-order sv-modulo" aria-labelledby="status-acceptance-title">
    <div className="status-order-head">
      <div><span>Orden de servicio</span><h2 id="status-acceptance-title">#{servicio.folio}</h2></div>
      <button type="button" className="status-button status-order-pdf" onClick={onDownload} disabled={exportingSheet}>{exportingSheet ? "Preparando PDF…" : "Hoja de servicio (PDF)"}</button>
    </div>
    {downloadError ? <p className="status-inline-error status-order-alert" role="alert">{downloadError}</p> : null}

    <div className="status-order-block status-order-summary">
      <h3>Datos de la orden</h3>
      <dl>
        {detalle?.cliente || aceptacion?.nombreCliente ? <div><dt>Cliente</dt><dd>{detalle?.cliente || aceptacion.nombreCliente}</dd></div> : null}
        <div><dt>Equipo</dt><dd>{[servicio.tipoDispositivo, servicio.marca, servicio.modelo].filter(Boolean).join(" · ") || "Sin especificar"}</dd></div>
        {servicio.numeroSerie ? <div><dt>Número de serie</dt><dd>{servicio.numeroSerie}</dd></div> : null}
        <div><dt>Ingreso</dt><dd>{fecha(servicio.createdAt) || "Sin registrar"}</dd></div>
      </dl>
    </div>

    <div className="status-order-block">
      <h3>Motivo de ingreso / trabajo solicitado</h3>
      <p className="status-order-work">{servicio.trabajo || "Sin descripción registrada."}</p>
    </div>

    <EvidenciasOrden grupos={evidenceGroups} />

    <BoletaOrden
      boleta={boleta}
      servicio={detalle || servicio}
      onDescargar={onDownloadBoleta}
      descargando={exportingReceipt}
    />

    <div className="status-order-block">
      <h3>Políticas y condiciones</h3>
      {terminos.length ? <ul className="status-order-terms">{terminos.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>No se registraron condiciones adicionales para esta orden.</p>}
    </div>

    {cargando ? <p className="status-order-alert" role="status">Validando la solicitud de aceptación…</p> : null}
    {error ? <p className="status-inline-error status-order-alert" role="alert">{error}</p> : null}
    {enlaceBloqueado ? <p className="status-order-alert status-acceptance-result status-acceptance-result--pending">
      <strong>{AVISO_ENLACE[estadoEnlace] || "Este enlace ya no está disponible."}</strong>
    </p> : null}

    {puedeFirmar ? <div className="status-acceptance-form">
      <div className="status-sign-confirmation"><strong>Al firmar este documento confirmas que:</strong><ul><li>Autorizas y apruebas la orden de servicio correspondiente.</li><li>Revisaste las fotografías y el desglose de la boleta.</li><li>Has leído las condiciones y estás de acuerdo con ellas.</li></ul></div>
      <label><span>Nombre completo de quien acepta</span><input type="text" value={nombre} onChange={(event) => setNombre(event.target.value)} maxLength={120} autoComplete="name" placeholder="Escribe tu nombre" disabled={enviando} /></label>
      <label className="status-acceptance-check"><input type="checkbox" checked={condiciones} onChange={(event) => setCondiciones(event.target.checked)} disabled={enviando} /><span>Confirmo que revisé la orden, las fotografías, el presupuesto y las condiciones.</span></label>
      <FirmaCanvas ref={firmaRef} onCambio={setHayFirma} deshabilitado={enviando} />
      {faltante ? <p className="status-acceptance-hint" role="status">{faltante}</p> : null}
      <p className="status-order-question">¿Todo en orden? Presiona “Sí, autorizo” para firmar; de lo contrario presiona “No autorizo” para indicar el motivo.</p>
      <div className="status-acceptance-actions"><button type="button" className="status-button status-button-secondary" onClick={() => setRechazando((valor) => !valor)} disabled={enviando} aria-expanded={rechazando}>No autorizo</button><button type="button" className="status-button" onClick={() => enviar("aceptado")} disabled={!puedeAceptar}>{enviando ? "Registrando…" : "Sí, autorizo"}</button></div>
      {rechazando ? <div className="status-rejection-box"><strong>Motivo para no autorizar</strong>{MOTIVOS_RECHAZO.map((item) => <label key={item.key}><input type="radio" name="status-rejection" checked={motivo === item.key} onChange={() => setMotivo(item.key)} /><span>{item.label}</span></label>)}<textarea value={comentario} onChange={(event) => setComentario(event.target.value)} maxLength={400} rows={3} placeholder="Comentario opcional" /><button type="button" className="status-button status-button-danger" disabled={!motivo || enviando} onClick={() => enviar("rechazado")}>Confirmar que no autorizo</button></div> : null}
    </div> : <div className="status-order-block status-order-block--last"><ResumenAceptacion aceptacion={aceptacion} /></div>}
  </section>;
}
