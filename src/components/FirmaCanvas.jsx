import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { FiRotateCcw } from "react-icons/fi";

// ---------------------------------------------------------------------------
// Area de firma.
//
// Se usa Pointer Events y no eventos de raton y de tactil por separado: es la
// unica API que trata igual al dedo, al stylus y al raton, y la unica que
// entrega presion y captura del puntero. Con `setPointerCapture` el trazo no
// se corta cuando el dedo sale del recuadro.
//
// `touch-action: none` (en la hoja de estilos) es lo que impide que el telefono
// interprete la firma como un gesto de desplazamiento. Sin eso, firmar en movil
// mueve la pagina y el trazo sale partido.
//
// El PNG se exporta con FONDO TRANSPARENTE y recortado al trazo: asi la firma
// se puede colocar sobre la linea del PDF sin tapar nada con un rectangulo
// blanco, y pesa unas pocas decenas de KB.
// ---------------------------------------------------------------------------

const COLOR_TRAZO = "#101d33";
const GROSOR_BASE = 2.2;
const MARGEN_RECORTE = 8;

const FirmaCanvas = forwardRef(function FirmaCanvas({ onCambio, deshabilitado = false }, ref) {
  const lienzo = useRef(null);
  const contexto = useRef(null);
  const trazando = useRef(false);
  const ultimoPunto = useRef(null);
  const hayTrazo = useRef(false);
  const [vacio, setVacio] = useState(true);

  // Se redibuja a la resolucion real de la pantalla: en un telefono con DPR 3
  // un lienzo sin escalar produce una firma borrosa.
  const ajustarTamano = useCallback(() => {
    const canvas = lienzo.current;
    if (!canvas) return;

    const caja = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const previo = hayTrazo.current ? canvas.toDataURL("image/png") : "";

    canvas.width = Math.max(1, Math.round(caja.width * dpr));
    canvas.height = Math.max(1, Math.round(caja.height * dpr));

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = COLOR_TRAZO;
    contexto.current = ctx;

    // Girar el telefono no debe borrar lo que la persona ya firmo.
    if (previo) {
      const imagen = new Image();
      imagen.onload = () => ctx.drawImage(imagen, 0, 0, caja.width, caja.height);
      imagen.src = previo;
    }
  }, []);

  useEffect(() => {
    ajustarTamano();
    window.addEventListener("resize", ajustarTamano);
    window.addEventListener("orientationchange", ajustarTamano);
    return () => {
      window.removeEventListener("resize", ajustarTamano);
      window.removeEventListener("orientationchange", ajustarTamano);
    };
  }, [ajustarTamano]);

  const puntoDelEvento = (evento) => {
    const caja = lienzo.current.getBoundingClientRect();
    return { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
  };

  const iniciar = (evento) => {
    if (deshabilitado) return;
    evento.preventDefault();
    lienzo.current.setPointerCapture?.(evento.pointerId);
    trazando.current = true;
    ultimoPunto.current = puntoDelEvento(evento);

    // Un toque sin arrastre tambien debe dejar marca: hay firmas con puntos.
    const ctx = contexto.current;
    ctx.beginPath();
    ctx.arc(ultimoPunto.current.x, ultimoPunto.current.y, GROSOR_BASE / 2, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_TRAZO;
    ctx.fill();
    marcarConTrazo();
  };

  const mover = (evento) => {
    if (!trazando.current || deshabilitado) return;
    evento.preventDefault();

    const ctx = contexto.current;
    const punto = puntoDelEvento(evento);
    const anterior = ultimoPunto.current;

    // El stylus entrega presion real; el dedo y el raton mandan 0.5 o 0, y en
    // ese caso se usa un grosor fijo en vez de un trazo que adelgaza solo.
    const presion = evento.pressure > 0 && evento.pressure !== 0.5 ? evento.pressure : 0.5;
    ctx.lineWidth = GROSOR_BASE * (0.65 + presion * 0.7);

    ctx.beginPath();
    ctx.moveTo(anterior.x, anterior.y);
    // Curva suave hacia el punto medio: evita el aspecto de linea quebrada
    // cuando el navegador entrega pocos puntos por segundo.
    ctx.quadraticCurveTo(anterior.x, anterior.y, (anterior.x + punto.x) / 2, (anterior.y + punto.y) / 2);
    ctx.stroke();

    ultimoPunto.current = punto;
    marcarConTrazo();
  };

  const terminar = (evento) => {
    if (!trazando.current) return;
    lienzo.current?.releasePointerCapture?.(evento.pointerId);
    trazando.current = false;
    ultimoPunto.current = null;
  };

  function marcarConTrazo() {
    if (hayTrazo.current) return;
    hayTrazo.current = true;
    setVacio(false);
    onCambio?.(true);
  }

  const limpiar = useCallback(() => {
    const canvas = lienzo.current;
    if (!canvas) return;
    const ctx = contexto.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hayTrazo.current = false;
    setVacio(true);
    onCambio?.(false);
  }, [onCambio]);

  /**
   * PNG recortado al trazo, con fondo transparente.
   *
   * Devuelve "" si no hay firma: quien llama no tiene que adivinar si el
   * lienzo estaba vacio.
   */
  const exportar = useCallback(() => {
    const canvas = lienzo.current;
    if (!canvas || !hayTrazo.current) return "";

    const ctx = canvas.getContext("2d");
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // Solo importa el canal alfa: el fondo es transparente, no blanco.
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0) return "";

    minX = Math.max(0, minX - MARGEN_RECORTE);
    minY = Math.max(0, minY - MARGEN_RECORTE);
    maxX = Math.min(width - 1, maxX + MARGEN_RECORTE);
    maxY = Math.min(height - 1, maxY + MARGEN_RECORTE);

    const recorte = document.createElement("canvas");
    recorte.width = maxX - minX + 1;
    recorte.height = maxY - minY + 1;
    recorte.getContext("2d").drawImage(
      canvas,
      minX, minY, recorte.width, recorte.height,
      0, 0, recorte.width, recorte.height,
    );

    return recorte.toDataURL("image/png");
  }, []);

  useImperativeHandle(ref, () => ({ exportar, limpiar, estaVacio: () => !hayTrazo.current }), [exportar, limpiar]);

  return (
    <div className="sv-firma">
      <div className="sv-firma-encabezado">
        <span className="sv-firma-titulo">Firma del cliente</span>
        <button
          type="button"
          className="sv-firma-limpiar"
          onClick={limpiar}
          disabled={vacio || deshabilitado}
        >
          <FiRotateCcw aria-hidden="true" /> Limpiar firma
        </button>
      </div>

      <div className={`sv-firma-lienzo ${vacio ? "es-vacio" : ""}`}>
        <canvas
          ref={lienzo}
          onPointerDown={iniciar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onPointerLeave={terminar}
          role="img"
          aria-label="Área de firma. Traza tu firma con el dedo, el lápiz o el ratón."
        />
        {vacio ? (
          <span className="sv-firma-guia" aria-hidden="true">
            Firma aquí
          </span>
        ) : null}
        <span className="sv-firma-linea" aria-hidden="true" />
      </div>

      <p className="sv-firma-ayuda">
        {vacio
          ? "Usa el dedo, un lápiz táctil o el ratón."
          : "¿No quedó bien? Usa «Limpiar firma» y vuelve a intentarlo."}
      </p>
    </div>
  );
});

export default FirmaCanvas;
