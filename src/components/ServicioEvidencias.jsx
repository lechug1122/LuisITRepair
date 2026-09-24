import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiCamera,
  FiImage,
  FiLock,
  FiPlus,
  FiTrash2,
  FiUploadCloud,
  FiX,
  FiZoomIn,
} from "react-icons/fi";

import {
  LIMITE_DESCRIPCION,
  LIMITE_EVIDENCIAS_POR_SERVICIO,
  TIPOS_EVIDENCIA,
  agruparEvidencias,
  eliminarEvidencia,
  leerEvidencias,
  mensajeErrorEvidencia,
  subirEvidencia,
} from "../js/services/servicio_evidencias";
import {
  EXTENSIONES_IMAGEN,
  formatoPeso,
  liberarVistaPrevia,
  prepararFotoEvidencia,
} from "../js/services/imagen_compresion";
import PremiumFeatureModal from "./PremiumFeatureModal";
import "../css/servicio_evidencias.css";

function formatoFecha(fechaMs) {
  if (!fechaMs) return "";
  return new Date(fechaMs).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Evidencias fotograficas del servicio.
 *
 * Tres situaciones distintas, no dos:
 *   Premium            -> galeria completa y carga habilitada.
 *   Gratuito CON fotos -> se ven todas; solo se bloquea agregar. Un negocio
 *                         que dejo de pagar no pierde lo que ya documento.
 *   Gratuito SIN fotos -> panel de presentacion de la funcion.
 */
export default function ServicioEvidencias({
  servicio,
  puedeGestionar = false,
  bloqueado = false,
  usuarioNombre = "",
  onActualizado,
  onExito,
  onError,
}) {
  const [cola, setCola] = useState([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState("ingreso");
  const [subiendo, setSubiendo] = useState(false);
  const [indiceSubiendo, setIndiceSubiendo] = useState(0);
  const [preparando, setPreparando] = useState(false);
  const [ampliada, setAmpliada] = useState(null);
  const [borrando, setBorrando] = useState("");
  const [mostrarPremium, setMostrarPremium] = useState(false);

  const entradaArchivos = useRef(null);
  const entradaCamara = useRef(null);
  const colaRef = useRef(cola);
  colaRef.current = cola;

  const evidencias = useMemo(() => leerEvidencias(servicio || {}), [servicio]);
  const grupos = useMemo(() => agruparEvidencias(evidencias), [evidencias]);
  const cupoRestante = Math.max(0, LIMITE_EVIDENCIAS_POR_SERVICIO - evidencias.length);

  // Las vistas previas son URLs de objeto: si no se liberan, el navegador
  // conserva cada foto en memoria hasta recargar la pagina.
  useEffect(() => () => {
    colaRef.current.forEach((item) => liberarVistaPrevia(item.vistaPrevia));
  }, []);

  useEffect(() => {
    if (!ampliada) return undefined;
    const alTeclear = (evento) => {
      if (evento.key === "Escape") setAmpliada(null);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [ampliada]);

  const agregarArchivos = async (lista) => {
    const archivos = Array.from(lista || []).slice(0, Math.max(0, cupoRestante - cola.length));
    if (!archivos.length) return;

    setPreparando(true);
    try {
      const preparadas = await Promise.all(archivos.map(async (archivo) => {
        try {
          const preparada = await prepararFotoEvidencia(archivo);
          return { ...preparada, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, descripcion: "" };
        } catch (error) {
          onError?.(error?.message || "No pudimos preparar esta fotografía.");
          return null;
        }
      }));
      setCola((actual) => [...actual, ...preparadas.filter(Boolean)]);
    } finally {
      setPreparando(false);
    }
  };

  const quitarDeLaCola = (id) => {
    setCola((actual) => {
      const objetivo = actual.find((item) => item.id === id);
      liberarVistaPrevia(objetivo?.vistaPrevia);
      return actual.filter((item) => item.id !== id);
    });
  };

  const cambiarDescripcion = (id, texto) => {
    setCola((actual) => actual.map((item) => (
      item.id === id ? { ...item, descripcion: texto.slice(0, LIMITE_DESCRIPCION) } : item
    )));
  };

  const subirTodo = async () => {
    if (!cola.length || subiendo) return;
    setSubiendo(true);

    let subidas = 0;
    const fallidas = [];

    for (let i = 0; i < cola.length; i += 1) {
      const item = cola[i];
      setIndiceSubiendo(i + 1);
      try {
        // Secuencial a proposito: en subida movil, cinco cargas en paralelo se
        // estorban entre si y la barra de avance deja de significar nada.
        await subirEvidencia({
          servicioId: servicio?.id,
          archivo: item,
          tipo: tipoSeleccionado,
          descripcion: item.descripcion,
          usuarioNombre,
        });
        subidas += 1;
        liberarVistaPrevia(item.vistaPrevia);
      } catch (error) {
        console.error("[evidencias] No se pudo subir:", error);
        fallidas.push({ ...item, motivo: mensajeErrorEvidencia(error, "subir esta fotografía") });
      }
    }

    setCola(fallidas);
    setSubiendo(false);
    setIndiceSubiendo(0);

    if (subidas) {
      onExito?.(subidas === 1 ? "Evidencia agregada correctamente." : `${subidas} evidencias agregadas correctamente.`);
      await onActualizado?.();
    }
    if (fallidas.length) {
      onError?.("No pudimos subir esta fotografía. Intenta nuevamente.", {
        detalle: `${fallidas.length} imagen${fallidas.length === 1 ? "" : "es"} sin subir.`,
      });
    }
  };

  const borrar = async (evidencia) => {
    if (borrando) return;
    if (!window.confirm("¿Eliminar esta evidencia? No se puede deshacer.")) return;

    setBorrando(evidencia.id);
    try {
      await eliminarEvidencia({ servicioId: servicio?.id, evidencia });
      onExito?.("Evidencia eliminada.");
      await onActualizado?.();
    } catch (error) {
      console.error("[evidencias] No se pudo eliminar:", error);
      onError?.(mensajeErrorEvidencia(error, "eliminar esta evidencia"));
    } finally {
      setBorrando("");
    }
  };

  // --- Plan gratuito sin evidencias: presentacion, no reclamo. -------------
  if (!puedeGestionar && !evidencias.length) {
    return (
      <div className="sv-modulo sv-evidencias sv-evidencias--bloqueada">
        <span className="sv-evidencias-candado" aria-hidden="true"><FiCamera /></span>
        <h3>Evidencias del servicio</h3>
        <p>
          Documenta visualmente el estado del equipo, vehículo o producto durante
          todo el proceso de servicio: cómo llegó, qué se encontró, qué se reparó
          y cómo se entregó.
        </p>
        <p className="sv-evidencias-incluido">Incluido en CajaLibre Premium.</p>
        <button type="button" className="sv-btn sv-btn--premium" onClick={() => setMostrarPremium(true)}>
          Ver Premium
        </button>
        <PremiumFeatureModal
          abierto={mostrarPremium}
          titulo="Evidencias fotográficas"
          mensaje="Guarda fotos de ingreso, diagnóstico, reparación y entrega dentro de cada servicio, con fecha y responsable."
          onCerrar={() => setMostrarPremium(false)}
        />
      </div>
    );
  }

  return (
    <div className="sv-modulo sv-evidencias">
      <div className="sv-bloque-encabezado">
        <div>
          <h3>Evidencias del servicio</h3>
          <p className="sv-bloque-sub">
            {puedeGestionar
              ? `Fotografías del proceso. ${evidencias.length} de ${LIMITE_EVIDENCIAS_POR_SERVICIO}.`
              : "Las evidencias existentes se conservan. Para agregar nuevas evidencias, activa CajaLibre Premium."}
          </p>
        </div>
        {!puedeGestionar ? (
          <button type="button" className="sv-btn sv-btn--premium sv-btn--chico" onClick={() => setMostrarPremium(true)}>
            <FiLock aria-hidden="true" /> Activar Premium
          </button>
        ) : null}
      </div>

      {/* ---------- Carga ---------- */}
      {puedeGestionar && !bloqueado ? (
        <div className="sv-evidencias-carga">
          <div className="sv-evidencias-tipos" role="group" aria-label="Categoría de la evidencia">
            {TIPOS_EVIDENCIA.map((tipo) => (
              <button
                key={tipo.key}
                type="button"
                className={`sv-chip ${tipoSeleccionado === tipo.key ? "es-activo" : ""}`}
                onClick={() => setTipoSeleccionado(tipo.key)}
                aria-pressed={tipoSeleccionado === tipo.key}
                title={tipo.descripcion}
                disabled={subiendo}
              >
                {tipo.corto}
              </button>
            ))}
          </div>

          <div className="sv-evidencias-acciones">
            <button
              type="button"
              className="sv-btn sv-btn--suave"
              onClick={() => entradaArchivos.current?.click()}
              disabled={subiendo || preparando || cupoRestante <= cola.length}
            >
              <FiImage aria-hidden="true" /> Elegir fotos
            </button>
            <button
              type="button"
              className="sv-btn sv-btn--suave"
              onClick={() => entradaCamara.current?.click()}
              disabled={subiendo || preparando || cupoRestante <= cola.length}
            >
              <FiCamera aria-hidden="true" /> Tomar foto
            </button>

            <input
              ref={entradaArchivos}
              type="file"
              accept={EXTENSIONES_IMAGEN}
              multiple
              hidden
              onChange={(evento) => {
                agregarArchivos(evento.target.files);
                evento.target.value = "";
              }}
            />
            <input
              ref={entradaCamara}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(evento) => {
                agregarArchivos(evento.target.files);
                evento.target.value = "";
              }}
            />
          </div>

          {preparando ? <p className="sv-evidencias-estado">Optimizando imágenes…</p> : null}

          {cola.length ? (
            <div className="sv-evidencias-cola">
              <ul className="sv-evidencias-previas">
                {cola.map((item) => (
                  <li key={item.id}>
                    <div className="sv-previa-imagen">
                      <img src={item.vistaPrevia} alt="" loading="lazy" />
                      {!subiendo ? (
                        <button
                          type="button"
                          className="sv-previa-quitar"
                          onClick={() => quitarDeLaCola(item.id)}
                          aria-label={`Quitar ${item.nombreOriginal} antes de subirla`}
                        >
                          <FiX aria-hidden="true" />
                        </button>
                      ) : null}
                      {item.motivo ? <span className="sv-previa-error">{item.motivo}</span> : null}
                    </div>
                    <input
                      type="text"
                      className="sv-previa-texto"
                      placeholder="Descripción (opcional)"
                      value={item.descripcion}
                      maxLength={LIMITE_DESCRIPCION}
                      onChange={(evento) => cambiarDescripcion(item.id, evento.target.value)}
                      disabled={subiendo}
                      aria-label="Descripción de la evidencia"
                    />
                    <small>{formatoPeso(item.peso)} · {item.ancho}×{item.alto}</small>
                  </li>
                ))}
              </ul>

              {subiendo ? (
                <div className="sv-evidencias-progreso">
                  {/* Barra indeterminada: la subida pasa por el servidor y no
                      entrega avance por bytes. Un porcentaje inventado seria
                      mentir sobre lo que esta pasando. */}
                  <div className="sv-progreso-barra sv-progreso-barra--indeterminada">
                    <span />
                  </div>
                  <small role="status">
                    Guardando {indiceSubiendo} de {cola.length}…
                  </small>
                </div>
              ) : (
                <button type="button" className="sv-btn sv-btn--principal" onClick={subirTodo}>
                  <FiUploadCloud aria-hidden="true" />
                  Guardar {cola.length} evidencia{cola.length === 1 ? "" : "s"} en {TIPOS_EVIDENCIA.find((t) => t.key === tipoSeleccionado)?.corto}
                </button>
              )}
            </div>
          ) : null}

          {cupoRestante <= 0 ? (
            <p className="sv-evidencias-estado sv-evidencias-estado--tope">
              Este servicio alcanzó el máximo de {LIMITE_EVIDENCIAS_POR_SERVICIO} evidencias.
            </p>
          ) : null}
        </div>
      ) : null}

      {puedeGestionar && bloqueado ? (
        <p className="sv-evidencias-estado">
          Este servicio está cerrado. Las evidencias pueden consultarse, pero no agregarse.
        </p>
      ) : null}

      {/* ---------- Galeria ---------- */}
      {evidencias.length ? (
        <div className="sv-evidencias-grupos">
          {grupos.filter((grupo) => grupo.fotos.length).map((grupo) => (
            <section key={grupo.key} className="sv-evidencias-grupo">
              <header>
                <h4>{grupo.label}</h4>
                <span>{grupo.fotos.length}</span>
              </header>
              <ul className="sv-evidencias-galeria">
                {grupo.fotos.map((foto) => (
                  <li key={foto.id}>
                    <button
                      type="button"
                      className="sv-evidencia-miniatura"
                      onClick={() => setAmpliada(foto)}
                      aria-label={`Ampliar ${grupo.label}${foto.descripcion ? `: ${foto.descripcion}` : ""}`}
                    >
                      {/* La cuadricula carga miniaturas (~15 KB); la imagen
                          completa solo se pide al ampliar. */}
                      <img src={foto.miniaturaUrl} alt={foto.descripcion || grupo.label} loading="lazy" decoding="async" />
                      <span className="sv-evidencia-lupa" aria-hidden="true"><FiZoomIn /></span>
                    </button>
                    <div className="sv-evidencia-pie">
                      {foto.descripcion ? <p>{foto.descripcion}</p> : null}
                      <small>
                        {formatoFecha(foto.fechaMs) || "Sin fecha"}
                        {foto.usuarioNombre ? ` · ${foto.usuarioNombre}` : ""}
                      </small>
                    </div>
                    {puedeGestionar && !bloqueado ? (
                      <button
                        type="button"
                        className="sv-evidencia-borrar"
                        onClick={() => borrar(foto)}
                        disabled={borrando === foto.id}
                        aria-label="Eliminar esta evidencia"
                      >
                        {borrando === foto.id ? "…" : <FiTrash2 aria-hidden="true" />}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        puedeGestionar ? (
          <p className="sv-evidencias-vacio">
            <FiPlus aria-hidden="true" />
            Todavía no hay evidencias. Empieza por una foto de cómo llegó el equipo.
          </p>
        ) : null
      )}

      {/* ---------- Visor ---------- */}
      {ampliada ? (
        <div
          className="sv-visor"
          role="dialog"
          aria-modal="true"
          aria-label="Evidencia ampliada"
          onClick={() => setAmpliada(null)}
        >
          <button type="button" className="sv-visor-cerrar" onClick={() => setAmpliada(null)} aria-label="Cerrar">
            <FiX aria-hidden="true" />
          </button>
          <figure onClick={(evento) => evento.stopPropagation()}>
            <img src={ampliada.url} alt={ampliada.descripcion || "Evidencia del servicio"} />
            <figcaption>
              <strong>{TIPOS_EVIDENCIA.find((t) => t.key === ampliada.tipo)?.label}</strong>
              {ampliada.descripcion ? <p>{ampliada.descripcion}</p> : null}
              <small>
                {formatoFecha(ampliada.fechaMs) || "Sin fecha"}
                {ampliada.usuarioNombre ? ` · ${ampliada.usuarioNombre}` : ""}
              </small>
            </figcaption>
          </figure>
        </div>
      ) : null}

      <PremiumFeatureModal
        abierto={mostrarPremium}
        titulo="Evidencias fotográficas"
        mensaje="Guarda fotos de ingreso, diagnóstico, reparación y entrega dentro de cada servicio. Tus evidencias actuales se conservan siempre."
        onCerrar={() => setMostrarPremium(false)}
      />
    </div>
  );
}
