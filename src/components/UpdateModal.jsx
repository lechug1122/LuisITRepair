import React, { useEffect, useMemo, useState } from "react";
import "../css/updateModal.css";

function UpdateModal({ onClose }) {
  const [index, setIndex] = useState(0);

  const slides = [
    {
      title: "Servicios y detalle movil",
      content: (
        <ul>
          <li>Vista responsive completa para telefono y tablet.</li>
          <li>Topbar y navbar ajustados para no romper en pantallas chicas.</li>
          <li>Se mejoro el flujo para abrir y editar servicios desde cliente.</li>
          <li>Se corrigieron tamanos para conservar visual original en servicios.</li>
        </ul>
      ),
    },
    {
      title: "Panel lateral y accesos",
      content: (
        <ul>
          <li>Pestanas flotantes de notas y calendario con comportamiento auto-oculto.</li>
          <li>El panel lateral se asoma al acercar el puntero y no estorba contenido.</li>
          <li>Se ajusto la separacion visual para reducir espacios sobrantes.</li>
        </ul>
      ),
    },
    {
      title: "POS y ticket",
      content: (
        <ul>
          <li>IVA se controla desde configuracion y se refleja en ticket y POS.</li>
          <li>Se renombro el bloque a Configuracion de IVA para ubicarlo mas rapido.</li>
          <li>Personalizacion de ticket con visualizador en tiempo real.</li>
          <li>Se agrego campo de atendio para imprimir en ticket de venta.</li>
        </ul>
      ),
    },
    {
      title: "Productos e inventario",
      content: (
        <ul>
          <li>Modificar por codigo ahora usa modal propio, sin prompts nativos.</li>
          <li>Validacion de codigo mas clara y edicion directa del producto encontrado.</li>
          <li>Botones del modal corregidos para mantener proporciones consistentes.</li>
        </ul>
      ),
    },
    {
      title: "Hoja de servicio y control",
      content: (
        <ul>
          <li>Terminos actualizados: despues de 30 dias de abandono no hay responsabilidad.</li>
          <li>Mejor ajuste de textos para evitar montado en formato de impresion.</li>
          <li>Correcciones de presencia para estado en linea de trabajadores.</li>
        </ul>
      ),
    },
  ];

  const totalSlides = slides.length;
  const progress = useMemo(
    () => Math.round(((index + 1) / totalSlides) * 100),
    [index, totalSlides],
  );

  const nextSlide = () => {
    setIndex((prev) => (prev < totalSlides - 1 ? prev + 1 : prev));
  };

  const prevSlide = () => {
    setIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        setIndex((prev) => (prev < totalSlides - 1 ? prev + 1 : prev));
      }
      if (e.key === "ArrowLeft") {
        setIndex((prev) => (prev > 0 ? prev - 1 : prev));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, totalSlides]);

  return (
    <div className="update-overlay" onClick={onClose}>
      <div className="update-modal slider" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="update-close" onClick={onClose} aria-label="Cerrar">
          X
        </button>

        <div className="update-head">
          <span className="update-chip">Novedades</span>
          <span className="update-step">
            {index + 1}/{totalSlides}
          </span>
        </div>

        <div className="update-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="slider-content">
          <h2>{slides[index].title}</h2>
          <div className="slide-body">{slides[index].content}</div>
        </div>

        <div className="slider-controls">
          <button type="button" onClick={prevSlide} disabled={index === 0}>
            Anterior
          </button>

          {index < totalSlides - 1 ? (
            <button type="button" className="update-next" onClick={nextSlide}>
              Siguiente
            </button>
          ) : (
            <button type="button" className="update-next" onClick={onClose}>
              Finalizar
            </button>
          )}
        </div>

        <div className="slider-dots">
          {slides.map((slide, i) => (
            <button
              type="button"
              key={i}
              title={slide.title}
              className={i === index ? "dot active" : "dot"}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default UpdateModal;
