import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiArchive,
  FiBarChart2,
  FiBox,
  FiCheckCircle,
  FiClipboard,
  FiCreditCard,
  FiDollarSign,
  FiDownload,
  FiFileText,
  FiLoader,
  FiPackage,
  FiPercent,
  FiPieChart,
  FiRotateCcw,
  FiShield,
  FiShoppingBag,
  FiSlash,
  FiStar,
  FiTrendingUp,
  FiUser,
  FiUsers,
  FiXCircle,
} from "react-icons/fi";
import PremiumFeatureModal from "./PremiumFeatureModal";
import {
  categoriasVisibles,
  PERIODOS,
  resolverPeriodo,
} from "../js/services/reportes/catalogo_reportes.js";
import { esReportePremium } from "../js/services/plan_features.js";
import { generarReporte } from "../js/services/reportes/index.js";
import { esErrorSinDatos, etiquetaPeriodo } from "../js/services/reportes/excel_kit.js";
import { construirFuenteDatos } from "../js/services/reportes/datos_reportes.js";
import "../css/centro_exportaciones.css";

// Los iconos se resuelven por nombre para que el catalogo de reportes siga
// siendo datos puros y no tenga que importar componentes de React.
const ICONOS = {
  resumen: FiPieChart,
  ejecutivo: FiBarChart2,
  ventas: FiShoppingBag,
  pago: FiCreditCard,
  descuento: FiPercent,
  cancelacion: FiXCircle,
  devolucion: FiRotateCcw,
  producto: FiPackage,
  inventario: FiBox,
  alerta: FiAlertTriangle,
  kardex: FiClipboard,
  conteo: FiClipboard,
  caja: FiDollarSign,
  cliente: FiUsers,
  credito: FiUser,
  egreso: FiTrendingUp,
  empleado: FiUsers,
  restaurante: FiActivity,
  factura: FiFileText,
  rentabilidad: FiTrendingUp,
  paquete: FiArchive,
  auditoria: FiShield,
};

/**
 * Centro de exportaciones a Excel.
 *
 * Presenta el catalogo de reportes por categoria y se encarga de la parte de
 * la experiencia: elegir periodo, avisar cuando un reporte es Premium, avisar
 * cuando no hay datos y no dejar que se disparen dos descargas a la vez.
 *
 * Toda la generacion vive en los servicios; este componente no calcula nada
 * del negocio ni decide por si mismo quien puede descargar que.
 */
export default function CentroExportaciones({
  premiumState,
  premiumStatusLoaded = false,
  negocioId = "",
  negocioNombre = "",
  usuario = "",
  logo = "",
  esRestaurante = false,
  // Ventas que la pantalla ya tiene cargadas: evita volver a leerlas.
  ventas = null,
  limiteCortesFree = 0,
  // Periodo inicial heredado de los filtros de la pantalla.
  periodoInicial = null,
}) {
  const [categoriaActiva, setCategoriaActiva] = useState("todas");
  const [periodoId, setPeriodoId] = useState("este_mes");
  const [desde, setDesde] = useState(() => periodoInicial?.desde || "");
  const [hasta, setHasta] = useState(() => periodoInicial?.hasta || "");
  const [generando, setGenerando] = useState("");
  const [aviso, setAviso] = useState(null);
  const [reportePremium, setReportePremium] = useState(null);
  const [reporteNoDisponible, setReporteNoDisponible] = useState(null);
  const [cuentasCredito, setCuentasCredito] = useState(null);
  const [clienteId, setClienteId] = useState("");
  const avisoTimer = useRef(null);

  // El periodo personalizado arranca con el rango que la persona ya tenia
  // elegido en los filtros de Reportes, para no pedirle que lo repita.
  useEffect(() => {
    if (periodoInicial?.desde && !desde) setDesde(periodoInicial.desde);
    if (periodoInicial?.hasta && !hasta) setHasta(periodoInicial.hasta);
  }, [periodoInicial, desde, hasta]);

  useEffect(() => () => {
    if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
  }, []);

  const mostrarAviso = useCallback((mensaje, tono = "exito") => {
    if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
    setAviso({ mensaje, tono });
    // Los avisos de error se quedan mas tiempo: hay algo que leer y decidir.
    avisoTimer.current = window.setTimeout(() => setAviso(null), tono === "exito" ? 5000 : 9000);
  }, []);

  const periodo = useMemo(() => resolverPeriodo(periodoId, {
    desde: desde ? new Date(`${desde}T00:00:00`) : null,
    hasta: hasta ? new Date(`${hasta}T00:00:00`) : null,
  }), [periodoId, desde, hasta]);

  const periodoTexto = useMemo(
    () => etiquetaPeriodo(periodo.desde, periodo.hasta),
    [periodo],
  );

  const categorias = useMemo(() => categoriasVisibles({ esRestaurante }), [esRestaurante]);

  const visibles = useMemo(() => {
    if (categoriaActiva === "todas") return categorias;
    return categorias.filter((categoria) => categoria.id === categoriaActiva);
  }, [categorias, categoriaActiva]);

  // Las cuentas a credito se leen solo si de verdad se van a usar, y una sola
  // vez: el selector de cliente es el unico que las necesita.
  const cargarCuentasCredito = useCallback(async () => {
    if (cuentasCredito !== null) return;
    try {
      const datos = await construirFuenteDatos({ requiere: ["fiados"], negocioId });
      const unicos = new Map();
      datos.fiados.forEach((cuenta) => {
        const id = String(cuenta?.clienteId || "").trim();
        if (!id) return;
        const nombre = String(cuenta?.clienteNombre || "").trim() || "Cliente sin nombre";
        const saldo = Number(cuenta?.saldo || 0);
        const actual = unicos.get(id);
        unicos.set(id, { id, nombre, saldo: (actual?.saldo || 0) + saldo });
      });
      setCuentasCredito([...unicos.values()].sort((a, b) => b.saldo - a.saldo));
    } catch (error) {
      console.error("No se pudieron cargar las cuentas a crédito:", error);
      setCuentasCredito([]);
    }
  }, [cuentasCredito, negocioId]);

  const handleGenerar = useCallback(async (reporte) => {
    // Una sola exportacion a la vez: dos libros de Excel generandose en
    // paralelo compiten por memoria y la persona no sabe cual se descargo.
    if (generando) return;

    if (!premiumStatusLoaded) {
      mostrarAviso("Estamos confirmando tu plan. Intenta de nuevo en un momento.", "error");
      return;
    }

    // Un reporte que el sistema todavia no puede construir con datos reales
    // explica que faltaria registrar, en lugar de entregar un archivo inventado.
    if (reporte.disponible === false) {
      setReporteNoDisponible(reporte);
      return;
    }

    // Un reporte Premium en un negocio gratuito nunca llega al generador: se
    // explica y se ofrece el plan, sin errores y sin descargar nada.
    if (esReportePremium(reporte.id) && premiumState !== "premium") {
      setReportePremium(reporte);
      return;
    }

    if (reporte.seleccionCliente && !clienteId) {
      mostrarAviso("Selecciona el cliente del estado de cuenta.", "error");
      await cargarCuentasCredito();
      return;
    }

    try {
      setGenerando(reporte.id);
      setAviso(null);
      await generarReporte({
        reporteId: reporte.id,
        premiumState,
        periodoId,
        desde: desde ? new Date(`${desde}T00:00:00`) : null,
        hasta: hasta ? new Date(`${hasta}T00:00:00`) : null,
        negocioId,
        negocioNombre,
        usuario,
        logo,
        esRestaurante,
        ventasPrecargadas: Array.isArray(ventas) ? ventas : null,
        clienteId,
        limiteCortesFree,
      });
      mostrarAviso("Reporte generado correctamente.", "exito");
    } catch (error) {
      // El detalle tecnico va a la consola; a la persona se le dice algo que
      // pueda entender y accionar.
      console.error(`No se pudo generar el reporte "${reporte.id}":`, error);
      if (esErrorSinDatos(error)) {
        mostrarAviso(error.message, "info");
      } else if (error?.code === "reportes/requiere-premium") {
        setReportePremium(reporte);
      } else if (error?.code === "reportes/no-disponible") {
        setReporteNoDisponible(reporte);
      } else if (error?.code === "reportes/falta-cliente") {
        mostrarAviso(error.message, "error");
      } else if (error?.code === "permission-denied") {
        mostrarAviso("No tienes permiso para consultar esta información.", "error");
      } else {
        mostrarAviso("Hubo un problema al generar el reporte. Intenta nuevamente.", "error");
      }
    } finally {
      setGenerando("");
    }
  }, [
    cargarCuentasCredito, clienteId, desde, esRestaurante, generando, hasta, limiteCortesFree,
    logo, mostrarAviso, negocioId, negocioNombre, periodoId, premiumState, premiumStatusLoaded,
    usuario, ventas,
  ]);

  const periodoActivo = PERIODOS.find((item) => item.id === periodoId);

  return (
    <section className="export-center" aria-labelledby="export-center-titulo">
      <header className="export-center-head">
        <div>
          <span className="export-center-eyebrow">Centro de exportaciones</span>
          <h2 id="export-center-titulo">Generar Excel</h2>
          <p>
            Reportes profesionales con la información real de tu negocio.
            {" "}Se descargan a tu dispositivo; nada se guarda en la nube.
          </p>
        </div>

        <div className="export-center-periodo">
          <label htmlFor="export-periodo">Periodo</label>
          <select
            id="export-periodo"
            value={periodoId}
            onChange={(event) => setPeriodoId(event.target.value)}
          >
            {PERIODOS.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>

          {periodoActivo?.personalizado && (
            <div className="export-center-rango">
              <input
                type="date"
                value={desde}
                max={hasta || undefined}
                onChange={(event) => setDesde(event.target.value)}
                aria-label="Fecha inicial"
              />
              <span aria-hidden="true">→</span>
              <input
                type="date"
                value={hasta}
                min={desde || undefined}
                onChange={(event) => setHasta(event.target.value)}
                aria-label="Fecha final"
              />
            </div>
          )}

          <small>
            {periodoActivo?.personalizado && (!desde || !hasta)
              ? "Elige las dos fechas del rango."
              : periodoTexto}
          </small>
        </div>
      </header>

      {aviso && (
        <div className={`export-center-aviso tono-${aviso.tono}`} role="status">
          {aviso.tono === "exito" ? <FiCheckCircle aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />}
          <span>{aviso.mensaje}</span>
        </div>
      )}

      <nav className="export-center-tabs" aria-label="Categorías de reportes">
        <button
          type="button"
          className={categoriaActiva === "todas" ? "activa" : ""}
          onClick={() => setCategoriaActiva("todas")}
        >
          Todos
        </button>
        {categorias.map((categoria) => (
          <button
            key={categoria.id}
            type="button"
            className={categoriaActiva === categoria.id ? "activa" : ""}
            onClick={() => setCategoriaActiva(categoria.id)}
          >
            {categoria.nombre}
          </button>
        ))}
      </nav>

      {visibles.map((categoria) => (
        <div key={categoria.id} className="export-center-grupo">
          <div className="export-center-grupo-head">
            <h3>{categoria.nombre}</h3>
            <p>{categoria.descripcion}</p>
          </div>

          <div className="export-center-grid">
            {categoria.reportes.map((reporte) => {
              const Icono = ICONOS[reporte.icono] || FiFileText;
              const premium = esReportePremium(reporte.id);
              const disponible = reporte.disponible !== false;
              const bloqueado = premium && premiumState !== "premium";
              const enProgreso = generando === reporte.id;

              return (
                <article
                  key={reporte.id}
                  className={[
                    "export-card",
                    premium ? "es-premium" : "es-free",
                    !disponible ? "no-disponible" : "",
                    reporte.destacado ? "destacada" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <div className="export-card-top">
                    <span className="export-card-icono" aria-hidden="true">
                      {disponible ? <Icono /> : <FiSlash />}
                    </span>
                    <span className={`export-card-plan ${premium ? "plan-premium" : "plan-free"}`}>
                      {premium ? <><FiStar aria-hidden="true" /> Premium</> : "Gratis"}
                    </span>
                  </div>

                  <h4>{reporte.nombre}</h4>
                  <p className="export-card-desc">{reporte.descripcion}</p>

                  {disponible && reporte.incluye && (
                    <p className="export-card-incluye">
                      <strong>Incluye:</strong> {reporte.incluye}
                    </p>
                  )}

                  {!disponible && (
                    <p className="export-card-motivo">{reporte.motivoNoDisponible}</p>
                  )}

                  {disponible && reporte.aviso && (
                    <p className="export-card-nota">{reporte.aviso}</p>
                  )}

                  {disponible && reporte.seleccionCliente && !bloqueado && (
                    <label className="export-card-cliente">
                      <span>Cliente</span>
                      <select
                        value={clienteId}
                        onFocus={cargarCuentasCredito}
                        onChange={(event) => setClienteId(event.target.value)}
                      >
                        <option value="">
                          {cuentasCredito === null ? "Toca para cargar clientes…" : "Selecciona un cliente"}
                        </option>
                        {(cuentasCredito || []).map((cuenta) => (
                          <option key={cuenta.id} value={cuenta.id}>
                            {cuenta.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <footer className="export-card-foot">
                    <span className="export-card-periodo">
                      {reporte.periodo ? periodoTexto : "Situación actual"}
                    </span>
                    <button
                      type="button"
                      className="export-card-btn"
                      onClick={() => handleGenerar(reporte)}
                      disabled={Boolean(generando) || !disponible}
                      aria-busy={enProgreso}
                    >
                      {enProgreso ? (
                        <><FiLoader className="girando" aria-hidden="true" /> Generando…</>
                      ) : !disponible ? (
                        "No disponible aún"
                      ) : (
                        <><FiDownload aria-hidden="true" /> Generar Excel</>
                      )}
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        </div>
      ))}

      <PremiumFeatureModal
        abierto={Boolean(reportePremium)}
        titulo="Obtén reportes más completos"
        mensaje={
          "Con CajaLibre Premium puedes acceder a reportes avanzados, históricos, análisis de "
          + "utilidad, kardex, comparativas y paquetes administrativos."
          + (reportePremium ? ` El reporte “${reportePremium.nombre}” forma parte de Premium.` : "")
        }
        textoPrincipal="Conocer Premium"
        textoSecundario="Ahora no"
        onCerrar={() => setReportePremium(null)}
      />

      {reporteNoDisponible && (
        <div
          className="export-center-overlay"
          role="presentation"
          onClick={() => setReporteNoDisponible(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setReporteNoDisponible(null);
          }}
        >
          <section
            className="export-center-dialogo"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-no-disponible-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="export-center-dialogo-pill">
              <FiSlash aria-hidden="true" /> Todavía no disponible
            </span>
            <h3 id="export-no-disponible-titulo">{reporteNoDisponible.nombre}</h3>
            <p>{reporteNoDisponible.motivoNoDisponible}</p>
            <button type="button" onClick={() => setReporteNoDisponible(null)}>Entendido</button>
          </section>
        </div>
      )}
    </section>
  );
}
