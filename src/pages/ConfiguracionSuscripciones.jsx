import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import AdminStats from "../components/superadmin/AdminStats";
import BusinessFilters from "../components/superadmin/BusinessFilters";
import BusinessTable from "../components/superadmin/BusinessTable";
import BusinessDrawer from "../components/superadmin/BusinessDrawer";
import { actualizarEstadoNegocio } from "../js/services/negocios";
import { establecerPremiumAdmin } from "../js/services/premium_payments";
import {
  listarNegociosPagina,
  obtenerProductosNegocio,
  obtenerResumenGlobal,
  registrarAccionAdmin,
} from "../js/services/superadmin_negocios";
import {
  exportarExpedienteNegocio,
  exportarNegociosCSV,
  exportarNegociosExcel,
  exportarNegociosPDF,
} from "../js/services/superadmin_export";
import { FILTROS_SERVIDOR } from "../js/services/superadmin_filtros";
import "../css/superadmin.css";

const ES_FILTRO_SERVIDOR = new Set(FILTROS_SERVIDOR.map((item) => item.id));

const MENSAJES_VACIO = {
  bloqueados: "No hay negocios bloqueados.",
  incompletos: "No hay negocios con configuración incompleta.",
  premium: "Todavía no hay negocios Premium.",
};

function normalizar(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function ConfiguracionSuscripciones() {
  const { loading, uid: currentUid, superAdmin } = useAutorizacionActual();

  const [negocios, setNegocios] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [orden, setOrden] = useState("recientes");
  const [pageSize, setPageSize] = useState(25);
  const [pagina, setPagina] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const [notaConfirmacion, setNotaConfirmacion] = useState("");
  const [mesesPremium, setMesesPremium] = useState(1);

  // Cursores de Firestore por pagina visitada: permite ir y volver sin
  // recorrer la coleccion completa.
  const cursores = useRef([null]);
  const [recarga, setRecarga] = useState(0);

  // Un filtro que Firestore no puede resolver se pide sin restriccion y se
  // refina sobre la pagina; el resto viaja como where() al servidor.
  const filtroServidor = ES_FILTRO_SERVIDOR.has(filtro) ? filtro : "todos";

  useEffect(() => {
    if (!superAdmin) return undefined;
    let cancelado = false;
    setCargando(true);
    setError("");

    listarNegociosPagina({
      pageSize,
      cursor: cursores.current[pagina] || null,
      orden,
      filtro: filtroServidor,
    })
      .then((resultado) => {
        if (cancelado) return;
        setNegocios(resultado.negocios);
        setHayMas(resultado.hayMas);
        cursores.current[pagina + 1] = resultado.cursor;
      })
      .catch((problema) => {
        if (cancelado) return;
        setNegocios([]);
        setHayMas(false);
        setError(
          problema?.code === "failed-precondition"
            ? "Firestore necesita un índice para este orden o filtro. Revisa el enlace del error en la consola."
            : "No se pudieron cargar los negocios.",
        );
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => { cancelado = true; };
  }, [superAdmin, pageSize, pagina, orden, filtroServidor, recarga]);

  useEffect(() => {
    if (!superAdmin) return undefined;
    let cancelado = false;
    setCargandoResumen(true);
    obtenerResumenGlobal()
      .then((datos) => { if (!cancelado) setResumen(datos); })
      .catch(() => { if (!cancelado) setResumen(null); })
      .finally(() => { if (!cancelado) setCargandoResumen(false); });
    return () => { cancelado = true; };
  }, [superAdmin, recarga]);

  // Cambiar filtro, orden o tamaño invalida los cursores acumulados.
  const reiniciarPaginacion = useCallback(() => {
    cursores.current = [null];
    setPagina(0);
  }, []);

  const cambiarFiltro = useCallback((valor) => {
    setFiltro(valor);
    reiniciarPaginacion();
  }, [reiniciarPaginacion]);

  const cambiarOrden = useCallback((valor) => {
    setOrden(valor);
    reiniciarPaginacion();
  }, [reiniciarPaginacion]);

  const cambiarPageSize = useCallback((valor) => {
    setPageSize(valor);
    reiniciarPaginacion();
  }, [reiniciarPaginacion]);

  const recargar = useCallback(() => {
    reiniciarPaginacion();
    setRecarga((valor) => valor + 1);
  }, [reiniciarPaginacion]);

  // Busqueda y filtros de actividad se resuelven sobre la pagina cargada:
  // Firestore no indexa texto libre ni el nivel de uso calculado.
  const visibles = useMemo(() => {
    const termino = normalizar(busqueda).trim();
    return negocios.filter((negocio) => {
      if (filtro === "free" && negocio.plan.esPremium) return false;
      if (filtro === "frecuente" && !["frecuente", "activo"].includes(negocio.actividad.id)) return false;
      if (filtro === "poco" && negocio.actividad.id !== "poco") return false;
      if (filtro === "inactivo" && negocio.actividad.id !== "inactivo") return false;
      if (!termino) return true;
      return [negocio.nombre, negocio.correo, negocio.negocioId, negocio.titularNombre]
        .some((campo) => normalizar(campo).includes(termino));
    });
  }, [negocios, busqueda, filtro]);

  const exportarGlobal = useCallback(async (formato) => {
    try {
      if (formato === "csv") exportarNegociosCSV(visibles);
      else if (formato === "excel") await exportarNegociosExcel(visibles);
      else await exportarNegociosPDF(visibles);
    } catch {
      setFeedback({ tipo: "error", texto: "No se pudo generar el archivo." });
    }
  }, [visibles]);

  const exportarNegocio = useCallback(async (negocio, usuarios, historial) => {
    setOcupado(true);
    setFeedback(null);
    try {
      // El catálogo se lee aquí, no al abrir el drawer: solo se paga la
      // lectura del inventario cuando de verdad se descarga el expediente.
      const { productos, truncado } = await obtenerProductosNegocio(negocio.negocioId)
        .catch(() => ({ productos: [], truncado: false }));
      await exportarExpedienteNegocio({
        negocio,
        usuarios,
        historial,
        productos,
        productosTruncados: truncado,
      });
      if (truncado) {
        setFeedback({
          tipo: "error",
          texto: `El catálogo de ${negocio.nombre} superó el tope de exportación y se recortó.`,
        });
      }
    } catch {
      setFeedback({ tipo: "error", texto: "No se pudo generar el expediente." });
    } finally {
      setOcupado(false);
    }
  }, []);

  const pedirConfirmacion = useCallback((tipo, negocio) => {
    setConfirmacion({ tipo, negocio });
    setNotaConfirmacion("");
    setMesesPremium(1);
  }, []);

  const ejecutarConfirmacion = useCallback(async () => {
    if (!confirmacion) return;
    const { tipo, negocio } = confirmacion;
    setOcupado(true);
    setFeedback(null);

    try {
      if (tipo === "bloquear") {
        await actualizarEstadoNegocio({
          negocioId: negocio.negocioId,
          estado: "bloqueado",
          razon: notaConfirmacion,
          actorUid: currentUid,
        });
        setFeedback({ tipo: "success", texto: `${negocio.nombre} quedó bloqueado.` });
      } else if (tipo === "desbloquear") {
        await actualizarEstadoNegocio({
          negocioId: negocio.negocioId,
          estado: "activo",
          razon: "",
          actorUid: currentUid,
        });
        await registrarAccionAdmin({
          negocioId: negocio.negocioId,
          action: "negocio_desbloqueado",
          actorUid: currentUid,
          detalle: notaConfirmacion,
        }).catch(() => null);
        setFeedback({ tipo: "success", texto: `${negocio.nombre} quedó desbloqueado.` });
      } else {
        // Premium solo se puede escribir desde Cloud Functions: las reglas de
        // Firestore bloquean esos campos para cualquier cliente.
        const activar = tipo === "premium_on";
        await establecerPremiumAdmin({
          negocioId: negocio.negocioId,
          activar,
          meses: mesesPremium,
          motivo: notaConfirmacion,
        });
        setFeedback({
          tipo: "success",
          texto: activar
            ? `Premium activado para ${negocio.nombre} por ${mesesPremium} mes(es).`
            : `Premium desactivado para ${negocio.nombre}.`,
        });
      }

      setConfirmacion(null);
      setSeleccionado(null);
      setRecarga((valor) => valor + 1);
    } catch (problema) {
      setFeedback({
        tipo: "error",
        texto: problema?.message || "No se pudo completar la acción administrativa.",
      });
    } finally {
      setOcupado(false);
    }
  }, [confirmacion, notaConfirmacion, mesesPremium, currentUid]);

  if (loading) {
    return (
      <div className="sa-wrap">
        <AdminStats resumen={null} cargando />
      </div>
    );
  }

  if (!superAdmin) {
    return (
      <div className="sa-wrap">
        <div className="sa-error">
          Solo el superadministrador de CajaLibre puede consultar negocios globales.
        </div>
      </div>
    );
  }

  const textoConfirmacion = {
    bloquear: {
      titulo: "Bloquear negocio",
      cuerpo: "El negocio perderá el acceso operativo a CajaLibre hasta que lo desbloquees. Sus datos no se eliminan.",
    },
    desbloquear: {
      titulo: "Desbloquear negocio",
      cuerpo: "El negocio recuperará el acceso operativo de inmediato.",
    },
    premium_on: {
      titulo: "Activar Premium manualmente",
      cuerpo: "Se concede Premium sin cobro asociado. No activa renovación automática y queda asentado en la bitácora.",
    },
    premium_off: {
      titulo: "Desactivar Premium",
      cuerpo: "El negocio perderá Premium de inmediato, aunque su periodo pagado siguiera vigente.",
    },
  }[confirmacion?.tipo] || {};

  return (
    <div className="sa-wrap">
      <AdminStats resumen={resumen} cargando={cargandoResumen} />

      <BusinessFilters
        busqueda={busqueda}
        onBuscar={setBusqueda}
        filtro={filtro}
        onFiltrar={cambiarFiltro}
        orden={orden}
        onOrdenar={cambiarOrden}
        pageSize={pageSize}
        onPageSize={cambiarPageSize}
        onExportar={exportarGlobal}
        onRecargar={recargar}
        ocupado={cargando}
      />

      {error ? <div className="sa-error">{error}</div> : null}
      {feedback ? (
        <div className={`sa-feedback ${feedback.tipo}`}>{feedback.texto}</div>
      ) : null}

      <BusinessTable
        negocios={visibles}
        cargando={cargando}
        seleccionadoId={seleccionado?.negocioId || ""}
        onSeleccionar={setSeleccionado}
        pagina={pagina}
        hayMas={hayMas && visibles.length === negocios.length}
        onAnterior={() => setPagina((valor) => Math.max(0, valor - 1))}
        onSiguiente={() => setPagina((valor) => valor + 1)}
        mensajeVacio={
          busqueda
            ? "No existen negocios con estos filtros."
            : MENSAJES_VACIO[filtro] || "No se encontraron negocios."
        }
      />

      <BusinessDrawer
        key={seleccionado?.negocioId || "sin-negocio"}
        negocio={seleccionado}
        onCerrar={() => setSeleccionado(null)}
        onBloquear={(negocio) => pedirConfirmacion("bloquear", negocio)}
        onDesbloquear={(negocio) => pedirConfirmacion("desbloquear", negocio)}
        onPremium={(negocio, activar) =>
          pedirConfirmacion(activar ? "premium_on" : "premium_off", negocio)}
        onExportar={exportarNegocio}
        ocupado={ocupado}
      />

      {confirmacion ? (
        <div className="sa-confirm-backdrop" role="presentation" onClick={() => !ocupado && setConfirmacion(null)}>
          <div
            className="sa-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="sa-confirm-title">{textoConfirmacion.titulo}</h3>
            <p>{textoConfirmacion.cuerpo}</p>

            {confirmacion.tipo === "premium_on" ? (
              <label>
                Meses de Premium
                <select
                  value={mesesPremium}
                  onChange={(event) => setMesesPremium(Number(event.target.value))}
                >
                  {[1, 3, 6, 12].map((meses) => (
                    <option key={meses} value={meses}>{meses} mes(es)</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              Motivo o nota interna
              <textarea
                rows={3}
                value={notaConfirmacion}
                onChange={(event) => setNotaConfirmacion(event.target.value)}
                placeholder="Queda registrado en el historial administrativo"
              />
            </label>

            <div className="sa-confirm-actions">
              <button
                type="button"
                className="sa-btn"
                onClick={() => setConfirmacion(null)}
                disabled={ocupado}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`sa-btn ${confirmacion.tipo === "desbloquear" ? "sa-btn-primary" : "sa-btn-danger"}`}
                onClick={ejecutarConfirmacion}
                disabled={ocupado}
              >
                {ocupado ? "Aplicando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
