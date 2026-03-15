import React, { useEffect, useMemo, useState } from "react";
import "../css/updateModal.css";

function UpdateModal({ onClose }) {
  const [index, setIndex] = useState(0);

  const slides = [
    {
      title: "Servicios y retardo automatico",
      content: (
        <>
          <p className="slide-lead">
            El sistema ya calcula automaticamente el retardo segun la fecha de entrega y la
            tolerancia configurada.
          </p>
          <ul>
            <li>El recargo por guardado crece solo conforme pasan los dias.</li>
            <li>Cancelado y No reparable siguen acumulando retardo mientras no esten entregados.</li>
            <li>Tambien se detecta abandono por dias o por exceder el costo configurado.</li>
            <li>El total del servicio y de la boleta ya incluye el recargo correcto.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Detalle del servicio renovado",
      content: (
        <>
          <p className="slide-lead">
            La vista de detalle ahora tiene mejor seguimiento visual y mas contexto operativo.
          </p>
          <ul>
            <li>Se corrigio el progress bar para estados normales, cancelados y no reparables.</li>
            <li>Aparece un modal rojo centrado cuando el equipo entra en retraso o abandono.</li>
            <li>El modal incluye resumen del cargo, total actualizado y mensaje listo para WhatsApp.</li>
            <li>Se mejoraron botones, acomodo general y consistencia visual del modulo.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Hojas de servicio y configuracion",
      content: (
        <>
          <p className="slide-lead">
            La configuracion de servicios ahora controla mejor lo que se imprime, lo que se cobra y
            lo que se avisa.
          </p>
          <ul>
            <li>La hoja de servicio en PDF puede activarse o desactivarse sin perder retardo y abandono.</li>
            <li>Los terminos y condiciones ya son editables desde configuracion.</li>
            <li>La politica de retardo y abandono se guarda con el servicio y viaja al PDF cuando aplica.</li>
            <li>Se agrego una opcion para activar o no avisos de abandono desde Notificaciones.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Dashboard y notificaciones",
      content: (
        <>
          <p className="slide-lead">
            El panel principal quedo mas claro para lectura rapida y mejor seguimiento del negocio.
          </p>
          <ul>
            <li>Se mejoraron las graficas de barras y pastel con un estilo mas limpio.</li>
            <li>Ingresos del mes ya consideran utilidad real de productos vendidos en POS.</li>
            <li>Los cuadros y graficas muestran ayudas visuales y explicaciones mas claras.</li>
            <li>Ahora tambien aparece una notificacion de actualizacion reciente dentro del sistema.</li>
          </ul>
        </>
      ),
    },
    {
      title: "POS, clientes y canjes",
      content: (
        <>
          <p className="slide-lead">
            Ventas y fidelidad ahora se sienten mas integradas dentro del flujo diario.
          </p>
          <ul>
            <li>Los canjes por puntos ya pueden elegirse desde modal y entrar a la lista con total en $0.00.</li>
            <li>La tabla del POS se reorganizo para verse mas limpia y entendible.</li>
            <li>Cliente detalle muestra progreso tipo stepper y mejor acomodo responsive.</li>
            <li>Se ajustaron varias vistas para que sidebar, paneles y fondos se vean mas parejos.</li>
          </ul>
        </>
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
          <div className="update-head-copy">
            <span className="update-chip">Actualizacion reciente</span>
            <span className="update-caption">Marzo 2026 · Cambios ya activos</span>
          </div>
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
              key={slide.title}
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
