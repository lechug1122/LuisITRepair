import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { FiArrowLeft, FiCheckCircle, FiMaximize, FiMinimize, FiSearch, FiShoppingBag, FiTag } from "react-icons/fi";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import useMonedaConfig from "../hooks/useMonedaConfig";
import usePOSFeatures from "../hooks/usePOSFeatures";
import { consultarPrecioNegocio } from "../js/services/consulta_precios";
import { canUsePriceChecker } from "../js/services/plan_features";
import PageLoader from "../components/PageLoader";
import "../css/consulta_precios.css";

function Barcode() {
  return <svg className="consulta-barcode" viewBox="0 0 156 52" fill="currentColor" aria-hidden="true">
    {[0, 6, 10, 18, 22, 31, 39, 45, 50, 59, 65, 73, 82, 88, 97, 104, 111, 117, 128, 134, 142, 150].map(
      (x, index) => <rect key={x} x={x} y="0" width={index % 3 === 0 ? 4 : 2} height={index % 4 === 0 ? 52 : 44} />,
    )}
  </svg>;
}

function ConsultaNegocio({ negocioId }) {
  const { nombreEmpresa, logoEmpresa } = useEmpresaConfig();
  const { formatCurrency } = useMonedaConfig();
  const { promocionesDescuentos } = usePOSFeatures();
  const [codigo, setCodigo] = useState("");
  const [resultado, setResultado] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const [segundos, setSegundos] = useState(10);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [avisoPantalla, setAvisoPantalla] = useState("");
  const input = useRef(null);
  const pantalla = useRef(null);
  const solicitud = useRef(0);
  const autoConsulta = useRef(0);
  const ritmo = useRef({ ultimo: 0, rapidos: 0 });

  useEffect(() => () => {
    solicitud.current += 1;
    window.clearTimeout(autoConsulta.current);
  }, []);

  useEffect(() => {
    const update = () => setPantallaCompleta(document.fullscreenElement === pantalla.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    if (!resultado) return undefined;
    const vence = resultado.consultadoEn + 10000;
    const timer = window.setInterval(() => {
      const restantes = Math.max(0, Math.ceil((vence - Date.now()) / 1000));
      setSegundos(restantes);
      if (restantes === 0) setResultado(null);
    }, 250);
    return () => window.clearInterval(timer);
  }, [resultado]);

  const consultarCodigo = useCallback(async (valor) => {
    const barcode = String(valor || "").trim();
    window.clearTimeout(autoConsulta.current);
    ritmo.current.rapidos = 0;
    if (!barcode) { input.current?.focus(); return; }
    const id = ++solicitud.current;
    setConsultando(true);
    setResultado(null);
    setCodigo("");
    input.current?.focus();
    try {
      const data = await consultarPrecioNegocio(negocioId, barcode, { promocionesHabilitadas: promocionesDescuentos });
      if (id !== solicitud.current) return;
      setSegundos(10);
      setResultado({ ...data, consultadoEn: Date.now() });
    } catch (error) {
      if (id !== solicitud.current) return;
      setSegundos(10);
      setResultado({ codigo: barcode, consultadoEn: Date.now(), error: error?.code
        ? "No fue posible consultar el precio. Intenta de nuevo o solicita ayuda al personal."
        : error?.message || "No fue posible consultar el precio." });
    } finally {
      if (id === solicitud.current) setConsultando(false);
    }
  }, [negocioId, promocionesDescuentos]);

  const consultar = (event) => {
    event.preventDefault();
    consultarCodigo(codigo);
  };

  // Un lector de codigos "teclea" mucho mas rapido que una persona: si llegan
  // varios caracteres seguidos casi sin pausa, consultamos solos al terminar.
  const escribirCodigo = (event) => {
    const valor = event.target.value;
    const ahora = Date.now();
    const delta = ahora - ritmo.current.ultimo;
    ritmo.current.ultimo = ahora;
    if (valor.length <= 1) ritmo.current.rapidos = 0;
    else if (valor.length > codigo.length && delta < 35) ritmo.current.rapidos += 1;
    setCodigo(valor);

    window.clearTimeout(autoConsulta.current);
    if (ritmo.current.rapidos >= 3 && valor.trim().length >= 4) {
      autoConsulta.current = window.setTimeout(() => consultarCodigo(valor), 140);
    }
  };

  // Al pegar llega el codigo completo de golpe: no hay nada que esperar.
  const pegarCodigo = (event) => {
    const texto = String(event.clipboardData?.getData("text") || "").replace(/\s+/g, " ").trim();
    if (!texto) return;
    event.preventDefault();
    setCodigo(texto);
    consultarCodigo(texto);
  };

  const alternarPantalla = async () => {
    setAvisoPantalla("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (pantalla.current?.requestFullscreen) await pantalla.current.requestFullscreen();
      else setAvisoPantalla("Tu navegador no permite usar pantalla completa.");
    } catch { setAvisoPantalla("No se pudo abrir la pantalla completa en este navegador."); }
  };

  const producto = resultado?.producto;
  return (
    <main className="consulta-precios" ref={pantalla}>
      <div className="consulta-toolbar">
        <Link to="/POS"><FiArrowLeft aria-hidden="true" /> Volver al punto de venta</Link>
        <button type="button" onClick={alternarPantalla}>
          {pantallaCompleta ? <FiMinimize aria-hidden="true" /> : <FiMaximize aria-hidden="true" />}
          {pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
        </button>
      </div>
      {avisoPantalla && <p className="consulta-screen-notice" role="status">{avisoPantalla}</p>}
      <section className="consulta-card" aria-labelledby="consulta-titulo">
        <header className="consulta-header">
          <span className="consulta-negocio-nombre">{nombreEmpresa || "Tu negocio"}</span>
          <h1 id="consulta-titulo">Consulta de precios</h1>
          <p>Escanea el código de barras del producto</p>
          <Barcode />
          <form onSubmit={consultar} className="consulta-form" aria-busy={consultando}>
            <label htmlFor="consulta-codigo">Código de barras</label>
            <div className="consulta-input-row">
              <input ref={input} id="consulta-codigo" value={codigo} onChange={escribirCodigo} onPaste={pegarCodigo}
                placeholder="Escanea o escribe el código" autoFocus autoComplete="off" maxLength={128}
                spellCheck={false} enterKeyHint="search" />
              <button type="submit"><FiSearch aria-hidden="true" /> {consultando ? "Consultando…" : "Consultar"}</button>
            </div>
            <small>Al escanear o pegar el código la búsqueda comienza sola. Si lo escribes a mano, presiona Enter.</small>
          </form>
        </header>

        <div className={`consulta-result${logoEmpresa ? " consulta-result-logo" : ""}`}
          style={logoEmpresa ? { "--consulta-logo": `url(${logoEmpresa})` } : undefined}
          role="status" aria-live="polite" aria-atomic="true">
          {consultando ? (
            <div className="consulta-empty"><span className="consulta-spinner" aria-hidden="true" /><h2>Buscando tu producto…</h2></div>
          ) : resultado?.error ? (
            <div className="consulta-empty consulta-error"><FiSearch aria-hidden="true" /><h2>No se pudo consultar</h2><p>{resultado.error}</p></div>
          ) : producto ? (
            <>
              <span className="consulta-result-label"><FiCheckCircle aria-hidden="true" /> Producto encontrado</span>
              <h2 className="consulta-product-name">{producto.nombre}</h2>
              {producto.presentacion && <p className="consulta-presentation">{producto.presentacion}</p>}
              <span className="consulta-price-label">Precio</span>
              <strong className="consulta-price">{formatCurrency(producto.precio)}</strong>
              <span className={`consulta-stock ${producto.disponible ? "" : "consulta-stock-empty"}`}><i aria-hidden="true" />{producto.disponible ? "Disponible" : "Agotado"}</span>
              {resultado.promociones.map((promo) => (
                <div className="consulta-promo" key={promo.id}>
                  <span><FiTag aria-hidden="true" /> {promo.tipo === "descuento" ? "Descuento" : "Promoción"}</span>
                  <strong>{promo.tipo === "paquete" ? `${promo.cantidad} por ${formatCurrency(promo.precio)}`
                    : promo.tipo === "descuento" ? `Precio con descuento: ${formatCurrency(promo.precio)}` : promo.nombre}</strong>
                  {promo.detalle && <small>{promo.detalle}</small>}
                  {promo.tipo !== "condicionada" && promo.nombre && <small>{promo.nombre}</small>}
                </div>
              ))}
              {resultado.errorPromociones && <p className="consulta-promo-notice">No se pudieron consultar las promociones. Confirma las ofertas con el personal.</p>}
              <small className="consulta-result-code">Código: {producto.codigo}</small>
            </>
          ) : resultado ? (
            <div className="consulta-empty"><FiSearch aria-hidden="true" /><h2>Producto no encontrado</h2><p>No encontramos el código <strong>{resultado.codigo}</strong> en este negocio.</p><small>Revisa el código o solicita ayuda al personal.</small></div>
          ) : (
            <div className="consulta-empty"><FiShoppingBag aria-hidden="true" /><h2>Conoce el precio al instante</h2><p>Escanea un producto para ver su precio y disponibilidad.</p></div>
          )}
        </div>

        <footer className="consulta-footer">
          <p>{resultado ? "Escanea otro producto para consultar su precio" : "Listo para escanear tu próximo producto"}</p>
          {resultado && <div className="consulta-countdown"><span aria-hidden="true" style={{ "--consulta-progress": `${segundos * 10}%` }} /><small>Se reiniciará automáticamente en {segundos} segundos</small></div>}
        </footer>
      </section>
    </main>
  );
}

export default function ConsultaPrecios() {
  const { negocioId, premiumState } = useAutorizacionActual();
  const { consultaPrecios } = usePOSFeatures();
  if (premiumState === "loading") return <PageLoader text="Validando plan del negocio..." />;
  if (!canUsePriceChecker({ premiumState, enabled: consultaPrecios })) return <Navigate to="/configuracion/pos" replace />;
  if (!negocioId) return <p className="consulta-screen-notice">No se pudo identificar el negocio de la sesión.</p>;
  return <ConsultaNegocio key={negocioId} negocioId={negocioId} />;
}
