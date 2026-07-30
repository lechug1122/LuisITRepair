import { useEffect, useState } from "react";
import "../css/modal-recomendacion.css";

const motivosDisponibles = [
  "Es fácil de usar",
  "Es gratuito",
  "Me ayuda a controlar mi negocio",
  "Tiene buenas funciones",
];

export default function ModalRecomendacion({ abierto, onCerrar, onEnviar }) {
  const [calificacion, setCalificacion] = useState(null);
  const [motivos, setMotivos] = useState([]);
  const [comentario, setComentario] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return undefined;
    const onKeyDown = (event) => event.key === "Escape" && onCerrar?.();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const seleccionarMotivo = (motivo) => {
    setMotivos((actuales) => actuales.includes(motivo)
      ? actuales.filter((item) => item !== motivo)
      : [...actuales, motivo]);
  };

  const manejarEnvio = async () => {
    if (calificacion === null || enviando) return;
    setEnviando(true);
    try {
      await onEnviar?.({
        calificacion,
        motivos,
        comentario: comentario.trim(),
        fecha: new Date().toISOString(),
      });
      setEnviado(true);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="recomendacion-overlay" onClick={onCerrar}>
      <div className="recomendacion-modal" role="dialog" aria-modal="true" aria-labelledby="recomendacion-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="recomendacion-cerrar" onClick={onCerrar} aria-label="Cerrar modal">×</button>
        {!enviado ? (
          <>
            <div className="recomendacion-icono">💙</div>
            <span className="recomendacion-etiqueta">Tu opinión nos ayuda</span>
            <h2 id="recomendacion-title">¿Qué tan probable es que recomiendes CajaLibre a otro negocio?</h2>
            <p className="recomendacion-descripcion">Selecciona una puntuación del 0 al 10.</p>
            <div className="recomendacion-puntuaciones">
              {Array.from({ length: 11 }, (_, numero) => (
                <button type="button" key={numero} className={calificacion === numero ? "puntuacion activa" : "puntuacion"} onClick={() => setCalificacion(numero)}>{numero}</button>
              ))}
            </div>
            <div className="recomendacion-extremos"><span>0 · Nada probable</span><span>10 · Muy probable</span></div>
            {calificacion !== null && (
              <div className="recomendacion-comentarios">
                <p className="recomendacion-subtitulo">¿Qué fue lo que más te gustó?</p>
                <div className="recomendacion-motivos">
                  {motivosDisponibles.map((motivo) => <button type="button" key={motivo} className={motivos.includes(motivo) ? "motivo seleccionado" : "motivo"} onClick={() => seleccionarMotivo(motivo)}>{motivo}</button>)}
                </div>
                <label htmlFor="comentarioRecomendacion">Comentario opcional</label>
                <textarea id="comentarioRecomendacion" value={comentario} onChange={(event) => setComentario(event.target.value)} placeholder="Cuéntanos cómo podemos mejorar..." maxLength={500} />
                <small>{comentario.length}/500 caracteres</small>
              </div>
            )}
            <div className="recomendacion-acciones">
              <button type="button" className="boton-secundario" onClick={onCerrar}>Ahora no</button>
              <button type="button" className="boton-principal" onClick={manejarEnvio} disabled={calificacion === null || enviando}>{enviando ? "Enviando..." : "Enviar respuesta"}</button>
            </div>
            <p className="recomendacion-gracias">Gracias por ayudarnos a mejorar CajaLibre.</p>
          </>
        ) : (
          <div className="recomendacion-confirmacion">
            <div className="confirmacion-icono">✓</div>
            <h2>¡Gracias por tu opinión!</h2>
            <p>{calificacion >= 9 ? "Nos alegra saber que recomendarías CajaLibre a otros negocios." : "Tomaremos en cuenta tus comentarios para seguir mejorando CajaLibre."}</p>
            <button type="button" className="boton-principal" onClick={onCerrar}>Continuar</button>
          </div>
        )}
      </div>
    </div>
  );
}
