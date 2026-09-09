// ServicioDetalle.jsx
// ✅ Lock solo cuando ya fue entregado/cobrado en POS
// ✅ Al generar boleta (PDF) guarda BD formaPago + items + total (y costo se actualiza)
// ❌ Eliminado: Hoja de servicio (imagen) + todo lo relacionado

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import { Html5Qrcode } from "html5-qrcode";
import useAutorizacionActual from "../hooks/useAutorizacionActual";

import {
  buscarServicioPorFolio,
  actualizarServicioPorId,
} from "../js/services/servicios_firestore";
import { actualizarCliente } from "../js/services/clientes_firestore";
import { obtenerProductos } from "../js/services/POS_firebase";
import useServiciosConfig from "../hooks/useServiciosConfig";
import useNotificacionesConfig from "../hooks/useNotificacionesConfig";
import { generarPdfBoletaVenta } from "../js/services/pdf_boleta_venta";
import { obtenerCotizacionPorId } from "../js/services/cotizaciones_firestore";
import { STATUS } from "../js/utils/status_map";
import {
  buildCamposPersonalizados,
  buildLegacyBlocksFromCampos,
  formatCampoServicio,
  getCamposVisiblesTipoNegocio,
  getEtiquetaOpcionTipo,
  inferTipoNegocioServicio,
} from "../js/services/tipos_negocio";

import "../css/servicio_detalle.css";

/* =========================
   CONFIG
========================= */
const STATUS_VALUE_SET = new Set(STATUS.map((s) => s.value));
const BOLETA_SCANNER_ID = "boleta-reader";

/* =========================
   Helpers
========================= */
function normalizarStatus(raw) {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

function isFinalStatus(status) {
  const s = normalizarStatus(status);
  return s === "entregado" || s === "abandonado";
}

function statusValueFromRaw(raw) {
  const s = normalizarStatus(raw);
  if (!s) return "pendiente";
  if (s === "en_revision") return "revision";
  if (s === "en_reparacion") return "reparacion";
  if (s === "en_espera_de_refaccion") return "espera_refaccion";
  if (s === "finalizado") return "listo";
  return STATUS_VALUE_SET.has(s) ? s : "pendiente";
}

function requierePrecioFinal(status) {
  const s = normalizarStatus(status);
  const estadosTempranos = new Set([
    "pendiente",
    "en_revision",
    "revision",
    "en_reparacion",
    "reparacion",
  ]);
  return !estadosTempranos.has(s);
}

function permitePrecioCero(status) {
  const s = normalizarStatus(status);
  return s === "cancelado" || s === "no_reparable";
}

function formatFecha(ts) {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleDateString("es-MX");
}

function parsePrecioEditable(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const sanitized = raw
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");

  if (!sanitized) return null;

  const n = Number(sanitized);
  return Number.isFinite(n) ? n : null;
}

function num(v) {
  const s = String(v ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function money(n) {
  const val = Number(n) || 0;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(val);
}

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let year = 0;
  let month = 0;
  let day = 0;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [year, month, day] = raw.split("-").map(Number);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    [day, month, year] = raw.split("/").map(Number);
  } else {
    return null;
  }

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDays(from, to) {
  if (!(from instanceof Date) || !(to instanceof Date)) return 0;
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / 86400000);
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * ✅ PDF SIN CORS (abre webapp con payload)
 * NO tocamos correo/telefono (tu plantilla ya lo trae)
 */
/* =========================
   Wizard
========================= */
const PASOS_BASE = [
  { key: "pendiente", label: "Pendiente" },
  { key: "proceso", label: "En proceso" },
  { key: "final", label: "Finalizado" },
  { key: "entregado", label: "Entregado" },
];

const WIZARD_VARIANTS = {
  normal: {
    theme: "normal",
    steps: PASOS_BASE,
    activeByStatus: {
      pendiente: 0,
      revision: 1,
      reparacion: 1,
      en_reparacion: 1,
      espera_refaccion: 1,
      en_espera_de_refaccion: 1,
      trabajando: 1,
      listo: 2,
      finalizado: 2,
      entregado: 3,
    },
  },
  danger: {
    theme: "danger",
    steps: [
      { key: "pendiente", label: "Pendiente" },
      { key: "proceso", label: "En proceso" },
      { key: "cancelado", label: "Cancelado" },
    ],
    activeByStatus: {
      cancelado: 2,
    },
  },
  muted: {
    theme: "muted",
    steps: [
      { key: "pendiente", label: "Pendiente" },
      { key: "proceso", label: "En proceso" },
      { key: "no_reparable", label: "No reparable" },
    ],
    activeByStatus: {
      no_reparable: 2,
    },
  },
};

function getWizardConfig(status) {
  const s = normalizarStatus(status);
  if (s === "cancelado") return WIZARD_VARIANTS.danger;
  if (s === "no_reparable") return WIZARD_VARIANTS.muted;
  return WIZARD_VARIANTS.normal;
}

function WizardProgress({ status }) {
  const statusKey = normalizarStatus(status);
  const cfg = getWizardConfig(statusKey);
  const pasos = cfg.steps;
  const activeIndex = cfg.activeByStatus[statusKey] ?? 0;
  const fillPct = pasos.length > 1 ? (activeIndex / (pasos.length - 1)) * 100 : 0;

  const themeClass =
    cfg.theme === "danger"
      ? "wizard--danger"
      : cfg.theme === "muted"
        ? "wizard--muted"
        : "wizard--normal";

  return (
    <div
      className={`wizard-progress2 ${themeClass}`}
      style={{
        ["--pct"]: `${fillPct}%`,
        gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))`,
      }}
    >
      <div className="wizard-track" />
      <div className="wizard-fill" />

      {pasos.map((paso, i) => {
        let cls = "wizard-step";
        if (i < activeIndex) cls += " complete";
        if (i === activeIndex) cls += " in-progress";

        return (
          <div key={paso.key} className={cls}>
            <div className="wizard-node" />
            <div className="wizard-label">{paso.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================
   Boleta Items
========================= */
function nuevoItem(i) {
  const idx = String(i + 1).padStart(3, "0");
  return {
    id: uid(),
    item: `P-${idx}`,
    descripcion: "",
    pUnitario: "",
    cantidad: 1,
  };
}

function limpiarBoletaItems(items) {
  return (items || [])
    .map((it) => ({
      item: String(it.item || ""),
      codigo: String(it.codigo || "").trim(),
      productoId: String(it.productoId || "").trim(),
      descripcion: String(it.descripcion || "").trim(),
      pUnitario: num(it.pUnitario),
      cantidad: num(it.cantidad),
    }))
    .filter((it) => it.descripcion !== "");
}

function buildEquipoEdit(servicio) {
  return {
    nombre: servicio?.nombre || "",
    telefono: servicio?.telefono || "",
    direccion: servicio?.direccion || "",
    tipoDispositivo: servicio?.tipoDispositivo || "",
    marca: servicio?.marca || "",
    modelo: servicio?.modelo || "",
    numeroSerie: servicio?.numeroSerie || "",
    omitirNumeroSerie: !!servicio?.omitirNumeroSerie,
    trabajo: servicio?.trabajo || "",
    procesador: servicio?.laptopPc?.procesador || "",
    ram: servicio?.laptopPc?.ram || "",
    disco: servicio?.laptopPc?.disco || "",
    estadoPantalla: servicio?.laptopPc?.estadoPantalla || "Funciona bien",
    estadoTeclado: servicio?.laptopPc?.estadoTeclado || "Funciona bien",
    estadoMouse: servicio?.laptopPc?.estadoMouse || "Funciona bien",
    funciona: servicio?.laptopPc?.funciona || "Sí",
    enciendeEquipo: servicio?.laptopPc?.enciendeEquipo || "Sí",
    contrasenaEquipo: servicio?.laptopPc?.contrasenaEquipo || "",
    tipoImpresora: servicio?.impresora?.tipoImpresora || "Inyección de tinta",
    imprime: servicio?.impresora?.imprime || "Sí",
    condicionesImpresora: servicio?.impresora?.condicionesImpresora || "",
    tamanoMonitor: servicio?.monitor?.tamanoMonitor || "",
    colores: servicio?.monitor?.colores || "Sí",
    condicionesMonitor: servicio?.monitor?.condicionesMonitor || "",
  };
}

function getEquipoDetalles(servicio) {
  if (!servicio) return [];

  const detalles = [
    { label: "Tipo", value: servicio.tipoDispositivo || "-" },
    { label: "Marca", value: servicio.marca || "-" },
    { label: "Modelo", value: servicio.modelo || "-" },
    {
      label: "No. de serie",
      value: servicio.omitirNumeroSerie ? "No proporcionado" : servicio.numeroSerie || "-",
    },
  ];

  const tipo = normalizarStatus(servicio?.tipoDispositivo);

  if (tipo === "laptop" || tipo === "pc") {
    detalles.push(
      { label: "Procesador", value: servicio?.laptopPc?.procesador || "-" },
      { label: "RAM", value: servicio?.laptopPc?.ram || "-" },
      { label: "Disco", value: servicio?.laptopPc?.disco || "-" },
      { label: "Estado de pantalla", value: servicio?.laptopPc?.estadoPantalla || "-" },
      { label: "Estado de teclado", value: servicio?.laptopPc?.estadoTeclado || "-" },
      { label: "Estado de mouse", value: servicio?.laptopPc?.estadoMouse || "-" },
      { label: "Funciona", value: servicio?.laptopPc?.funciona || "-" },
      { label: "Enciende", value: servicio?.laptopPc?.enciendeEquipo || "-" },
      { label: "Contrasena del equipo", value: servicio?.laptopPc?.contrasenaEquipo || "-" },
    );
  }

  if (tipo === "impresora") {
    detalles.push(
      { label: "Tipo de impresora", value: servicio?.impresora?.tipoImpresora || "-" },
      { label: "Imprime", value: servicio?.impresora?.imprime || "-" },
      { label: "Condiciones", value: servicio?.impresora?.condicionesImpresora || "-" },
    );
  }

  if (tipo === "monitor") {
    detalles.push(
      { label: "Tamano", value: servicio?.monitor?.tamanoMonitor || "-" },
      { label: "Colores correctos", value: servicio?.monitor?.colores || "-" },
      { label: "Condiciones", value: servicio?.monitor?.condicionesMonitor || "-" },
    );
  }

  return detalles;
}

function tieneCaracteristicasPendientes(servicio) {
  if (!servicio) return false;
  if (servicio.caracteristicasPendientes) return true;

  const tipo = normalizarStatus(servicio.tipoDispositivo);

  if (tipo === "laptop" || tipo === "pc") {
    return (
      !servicio?.laptopPc?.procesador ||
      !servicio?.laptopPc?.ram ||
      !servicio?.laptopPc?.disco
    );
  }
  if (tipo === "impresora") {
    return !servicio?.impresora?.condicionesImpresora;
  }
  if (tipo === "monitor") {
    return !servicio?.monitor?.tamanoMonitor;
  }

  return false;
}

function buildEquipoEditDynamic(servicio) {
  const tipoNegocio = inferTipoNegocioServicio(servicio);
  return {
    nombre: servicio?.nombre || "",
    telefono: servicio?.telefono || "",
    direccion: servicio?.direccion || "",
    tipoDispositivo: servicio?.tipoDispositivo || "",
    marca: servicio?.marca || "",
    modelo: servicio?.modelo || "",
    numeroSerie: servicio?.numeroSerie || "",
    omitirNumeroSerie: !!servicio?.omitirNumeroSerie,
    trabajo: servicio?.trabajo || "",
    tipoNegocioId: tipoNegocio?.id || "",
    tipoNegocioSnapshot: tipoNegocio,
    camposPersonalizados: buildCamposPersonalizados(
      tipoNegocio,
      servicio?.camposPersonalizados,
      servicio,
    ),
  };
}

function getEquipoDetallesDynamic(servicio) {
  if (!servicio) return [];

  const tipoNegocio = inferTipoNegocioServicio(servicio);
  const camposVisibles = getCamposVisiblesTipoNegocio(tipoNegocio, servicio?.tipoDispositivo);
  const camposPersonalizados = buildCamposPersonalizados(
    tipoNegocio,
    servicio?.camposPersonalizados,
    servicio,
  );

  const detalles = [
    {
      label: tipoNegocio?.etiquetaTipoDispositivo || "Tipo",
      value: getEtiquetaOpcionTipo(tipoNegocio, servicio.tipoDispositivo || "-"),
    },
    { label: tipoNegocio?.etiquetaMarca || "Marca", value: servicio.marca || "-" },
    { label: tipoNegocio?.etiquetaModelo || "Modelo", value: servicio.modelo || "-" },
    {
      label: tipoNegocio?.etiquetaSerie || "No. de serie",
      value: servicio.omitirNumeroSerie ? "No proporcionado" : servicio.numeroSerie || "-",
    },
  ];

  camposVisibles.forEach((campo) => {
    detalles.push({
      label: campo.etiqueta,
      value: formatCampoServicio(campo, camposPersonalizados[campo.id]),
    });
  });

  return detalles;
}

function tieneCaracteristicasPendientesDynamic(servicio) {
  if (!servicio) return false;
  if (servicio.caracteristicasPendientes) return true;

  const tipoNegocio = inferTipoNegocioServicio(servicio);
  const camposVisibles = getCamposVisiblesTipoNegocio(tipoNegocio, servicio?.tipoDispositivo);
  const camposPersonalizados = buildCamposPersonalizados(
    tipoNegocio,
    servicio?.camposPersonalizados,
    servicio,
  );

  return camposVisibles.some((campo) => {
    if (!campo.requerido) return false;
    if (campo.tipo === "checkbox") return !camposPersonalizados[campo.id];
    return !String(camposPersonalizados[campo.id] ?? "").trim();
  });
}

export default function ServicioDetalle() {
  const { folio: folioParam } = useParams();
  const navigate = useNavigate();
  const { rol } = useAutorizacionActual();
  const { precioRevision, politicaRetardo } = useServiciosConfig();
  const { config: notificacionesConfig } = useNotificacionesConfig();
  const folio = useMemo(() => {
    const raw = String(folioParam || "").trim();
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [folioParam]);

  const [loading, setLoading] = useState(true);
  const [servicio, setServicio] = useState(null);

  const [status, setStatus] = useState("pendiente");
  const [fechaAprox, setFechaAprox] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const [usarBoleta, setUsarBoleta] = useState(false);
  const [precioFinal, setPrecioFinal] = useState("");
  const [hoyCursor, setHoyCursor] = useState(() => new Date());
  const [mostrarModalRetardo, setMostrarModalRetardo] = useState(false);
  const [abandonoDismissKey, setAbandonoDismissKey] = useState("");

  const [boletaFecha, setBoletaFecha] = useState("");
  const [boletaFormaPago, setBoletaFormaPago] = useState("");
  const [boletaNotas, setBoletaNotas] = useState("");

  const [items, setItems] = useState([
    nuevoItem(0),
    nuevoItem(1),
    nuevoItem(2),
  ]);
  const [productosDB, setProductosDB] = useState([]);
  const [scanCode, setScanCode] = useState("");

  // ✅ Fotos observaciones (varias)
  const [obsFotos, setObsFotos] = useState([]); // [{url,path,name}]

  const [exportingPdf, setExportingPdf] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [savingNotaAdmin, setSavingNotaAdmin] = useState(false);
  const [mostrarModalCaracteristicas, setMostrarModalCaracteristicas] =
    useState(false);
  const [mostrarScannerBoleta, setMostrarScannerBoleta] = useState(false);
  const [scannerBoletaInfo, setScannerBoletaInfo] = useState(
    "Escanea un producto para agregarlo a la boleta.",
  );
  const [scannerBoletaError, setScannerBoletaError] = useState("");
  const [esVistaMovil, setEsVistaMovil] = useState(false);
  const [mostrarPestanaNotas, setMostrarPestanaNotas] = useState(false);
  const [notaAdminEdit, setNotaAdminEdit] = useState("");
  const notaAutosaveTimerRef = useRef(null);
  const notaAdminGuardadaRef = useRef("");
  const boletaScannerRef = useRef(null);
  const boletaScannerDedupeRef = useRef({ value: "", at: 0 });
  const autoRetardoSyncRef = useRef(false);
  const [equipoEdit, setEquipoEdit] = useState(buildEquipoEditDynamic(null));
  const [modalPaso, setModalPaso] = useState(0);
  const statusPrevioRef = useRef("pendiente");

  const locked =
    isFinalStatus(servicio?.status) ||
    (!!servicio?.locked && isFinalStatus(servicio?.lockedReason));
  const tipoEquipoEdit = normalizarStatus(
    equipoEdit?.tipoDispositivo || servicio?.tipoDispositivo,
  );
  const esAdmin = normalizarStatus(rol) === "administrador";
  const statusActual = statusValueFromRaw(status || servicio?.status || "pendiente");
  const statusMeta = STATUS.find((s) => s.value === statusActual);
  const statusLabel = statusMeta?.label || "Pendiente";
  const equipoDetalles = useMemo(() => getEquipoDetallesDynamic(servicio), [servicio]);
  const tipoNegocioServicio = useMemo(
    () => equipoEdit?.tipoNegocioSnapshot || inferTipoNegocioServicio(servicio),
    [equipoEdit?.tipoNegocioSnapshot, servicio],
  );
  const camposTecnicosEdit = useMemo(
    () =>
      getCamposVisiblesTipoNegocio(
        tipoNegocioServicio,
        equipoEdit?.tipoDispositivo || servicio?.tipoDispositivo,
      ),
    [tipoNegocioServicio, equipoEdit?.tipoDispositivo, servicio?.tipoDispositivo],
  );

  const pasosModal = useMemo(
    () => [{ key: "general", label: "Datos generales" }],
    [],
  );

  const modalPasoActual = pasosModal[modalPaso]?.key || "general";

  useEffect(() => {
    if (modalPaso > pasosModal.length - 1) setModalPaso(0);
  }, [modalPaso, pasosModal.length]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHoyCursor(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        let data = await buscarServicioPorFolio(folio);
        const cotizacionesAsignadas = Array.isArray(data?.cotizaciones)
          ? data.cotizaciones
          : [];
        const ultimaCotizacion = cotizacionesAsignadas.at(-1);

        // Las cotizaciones creadas desde el POS se guardan por separado. Si el
        // servicio aun no tiene boleta, se carga la ultima como boleta editable.
        if (data && !data.boleta && ultimaCotizacion?.id) {
          try {
            const cotizacion = await obtenerCotizacionPorId(ultimaCotizacion.id);
            if (cotizacion) {
              data = {
                ...data,
                boleta: {
                  cotizacionId: cotizacion.id,
                  tipoDocumento: "cotizacion",
                  folio: cotizacion.folio || "",
                  fecha: cotizacion.fecha || "",
                  formaPago: cotizacion.formaPago || "",
                  notas: cotizacion.notas || "",
                  items: Array.isArray(cotizacion.items) ? cotizacion.items : [],
                  total: Number(cotizacion.total || 0),
                },
              };
            }
          } catch (error) {
            console.error("No se pudo cargar la cotizacion asignada:", error);
          }
        }
        if (!alive) return;

        setServicio(data);
        setEquipoEdit(buildEquipoEditDynamic(data));
        if (
          data &&
          !isFinalStatus(data?.status) &&
          tieneCaracteristicasPendientesDynamic(data)
        ) {
          setModalPaso(0);
          setMostrarModalCaracteristicas(true);
        }

        setStatus(statusValueFromRaw(data?.status));
        setObservaciones(data?.observaciones || "");
        setFechaAprox(data?.fechaAprox || "");
        setNotaAdminEdit(data?.notaAdmin || "");
        notaAdminGuardadaRef.current = String(data?.notaAdmin || "").trim();

        if (
          data?.costo !== undefined &&
          data?.costo !== null &&
          data?.costo !== ""
        ) {
          const cargoRetardoGuardado = Number(data?.retardo?.cargoTotal || 0);
          const costoBase = Math.max(0, num(data.costo) - cargoRetardoGuardado);
          setPrecioFinal(String(costoBase || num(data.costo)));
        }

        if (Array.isArray(data?.observacionesFotos))
          setObsFotos(data.observacionesFotos);

        // boleta guardada
        if (data?.boleta) {
          setUsarBoleta(true);
          setBoletaFecha(data?.boleta?.fecha || "");
          setBoletaFormaPago(data?.boleta?.formaPago || "");
          setBoletaNotas(data?.boleta?.notas || ""); // ✅ respeta notas guardadas

          if (Array.isArray(data?.boleta?.items) && data.boleta.items.length) {
            const mapped = data.boleta.items.map((it, idx) => ({
              id: uid(),
              item: it?.item || `P-${String(idx + 1).padStart(3, "0")}`,
              codigo: it?.codigo || "",
              productoId: it?.productoId || "",
              descripcion: it?.descripcion || "",
              pUnitario: it?.pUnitario ?? "",
              cantidad: it?.cantidad ?? 1,
            }));
            setItems(mapped);
          }
        } else {
          setUsarBoleta(false);
          setBoletaFormaPago("");
          setBoletaNotas("");
        }

        const hoy = new Date();
        const yyyy = hoy.getFullYear();
        const mm = String(hoy.getMonth() + 1).padStart(2, "0");
        const dd = String(hoy.getDate()).padStart(2, "0");
        if (!data?.boleta?.fecha) setBoletaFecha(`${yyyy}-${mm}-${dd}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // cargar productos para búsqueda por código
    (async () => {
      try {
        const prods = await obtenerProductos();
        if (alive) setProductosDB(Array.isArray(prods) ? prods : []);
      } catch (e) {
        console.error("Error cargando productos:", e);
      }
    })();

    return () => (alive = false);
  }, [folio]);

  useEffect(() => {
    if (!esAdmin || !servicio?.id || locked || loading) return undefined;

    const valorActual = String(notaAdminEdit || "").trim();
    const valorGuardado = String(notaAdminGuardadaRef.current || "").trim();
    if (valorActual === valorGuardado) return undefined;

    if (notaAutosaveTimerRef.current) {
      clearTimeout(notaAutosaveTimerRef.current);
    }

    notaAutosaveTimerRef.current = setTimeout(async () => {
      try {
        setSavingNotaAdmin(true);
        await actualizarServicioPorId(servicio.id, { notaAdmin: valorActual });
        notaAdminGuardadaRef.current = valorActual;
        setServicio((prev) => (prev ? { ...prev, notaAdmin: valorActual } : prev));
      } catch (e) {
        console.error("Error guardando nota interna:", e);
      } finally {
        setSavingNotaAdmin(false);
      }
    }, 700);

    return () => {
      if (notaAutosaveTimerRef.current) {
        clearTimeout(notaAutosaveTimerRef.current);
      }
    };
  }, [notaAdminEdit, esAdmin, servicio?.id, locked, loading]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => {
      const byWidth = window.matchMedia("(max-width: 900px)").matches;
      const byTouch = window.matchMedia("(pointer: coarse)").matches;
      setEsVistaMovil(byWidth || byTouch);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    const statusNormalizado = normalizarStatus(status);
    const statusPrevio = normalizarStatus(statusPrevioRef.current);

    if (
      statusNormalizado === "cancelado" &&
      !usarBoleta &&
      Number(precioRevision || 0) > 0 &&
      (statusPrevio !== "cancelado" || !String(precioFinal || "").trim())
    ) {
      setPrecioFinal(String(precioRevision));
    }

    statusPrevioRef.current = status;
  }, [precioFinal, precioRevision, status, usarBoleta]);

  const agregarProductoBoletaPorCodigo = (codigoRaw) => {
    const termino = String(codigoRaw || "").trim().toLowerCase();
    if (!termino) return { ok: false, message: "Codigo vacio." };

    const producto = productosDB.find(
      (p) => String(p.codigo || "").trim().toLowerCase() === termino,
    );

    if (!producto) {
      return { ok: false, message: "Producto no encontrado en inventario." };
    }

    setItems((prev) => {
      const existingIdx = prev.findIndex((row) => {
        const sameId =
          String(row?.productoId || "").trim() &&
          String(row?.productoId || "").trim() === String(producto?.id || "").trim();
        const sameCode =
          String(row?.codigo || "").trim().toLowerCase() ===
          String(producto?.codigo || "").trim().toLowerCase();
        return sameId || sameCode;
      });

      if (existingIdx >= 0) {
        return prev.map((row, idx) =>
          idx !== existingIdx
            ? row
            : {
                ...row,
                cantidad: num(row?.cantidad) + 1,
                pUnitario:
                  row?.pUnitario !== undefined && row?.pUnitario !== ""
                    ? row.pUnitario
                    : producto.precioVenta ?? producto.precio ?? 0,
              },
        );
      }

      return [
        ...prev,
        {
          id: uid(),
          item: `P-${String(prev.length + 1).padStart(3, "0")}`,
          codigo: producto.codigo || "",
          productoId: producto.id || "",
          descripcion:
            producto.nombre ||
            producto.nombreProducto ||
            producto.descripcion ||
            "",
          pUnitario: producto.precioVenta ?? producto.precio ?? 0,
          cantidad: 1,
        },
      ];
    });

    return {
      ok: true,
      label: producto.codigo || producto.nombre || "producto",
    };
  };

  useEffect(() => {
    if (!mostrarScannerBoleta) return undefined;

    let active = true;
    let qr = null;
    const REAR_HINTS = ["back", "rear", "environment", "trasera", "posterior"];
    const SCAN_CFG = { fps: 10, qrbox: 250 };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const isTransitionError = (err) => {
      const msg = String(err?.message || err || "").toLowerCase();
      return (
        msg.includes("already under transition") ||
        msg.includes("cannot transition")
      );
    };

    const isScannerRunning = (state) => {
      const normalized = String(state ?? "").toUpperCase();
      return (
        state === 2 ||
        state === 3 ||
        normalized === "SCANNING" ||
        normalized === "PAUSED"
      );
    };

    const safelyDisposeScanner = async (instance) => {
      if (!instance) return;
      try {
        const state =
          typeof instance.getState === "function" ? instance.getState() : null;
        if (isScannerRunning(state)) {
          await instance.stop();
        } else {
          await instance.stop().catch(() => {});
        }
      } catch {
        // noop
      }
      try {
        await instance.clear();
      } catch {
        // noop
      }
    };

    const cameraErrorMessage = (err) => {
      const text = String(err?.message || err || "").toLowerCase();
      if (text.includes("requires-secure-context")) {
        return "Abre la app en HTTPS o localhost para usar la camara.";
      }
      if (text.includes("getusermedia-not-supported")) {
        return "Este navegador no soporta camara.";
      }
      if (text.includes("reader-host-not-ready")) {
        return "No se pudo preparar el lector. Intenta de nuevo.";
      }
      if (!window.isSecureContext) {
        return "La camara requiere HTTPS o localhost.";
      }
      if (text.includes("permission") || text.includes("notallowederror")) {
        return "Permiso de camara denegado. Habilitalo en el navegador.";
      }
      if (text.includes("notfounderror") || text.includes("overconstrained")) {
        return "No se encontro camara compatible en este dispositivo.";
      }
      if (text.includes("notreadableerror") || text.includes("trackstarterror")) {
        return "La camara esta en uso por otra app.";
      }
      return "No se pudo iniciar la camara.";
    };

    const pickRear = (cameras = []) => {
      const rear = cameras.find((c) => {
        const label = String(c?.label || "").toLowerCase();
        return REAR_HINTS.some((hint) => label.includes(hint));
      });
      return rear?.id || null;
    };

    const waitForReaderHost = async (attempts = 20) => {
      for (let i = 0; i < attempts; i += 1) {
        const el = document.getElementById(BOLETA_SCANNER_ID);
        if (el && el.clientWidth > 0) return el;
        await wait(80);
      }
      return null;
    };

    const onSuccess = (decodedText) => {
      if (!active) return;
      const raw = String(decodedText || "").trim();
      if (!raw) return;

      const now = Date.now();
      if (
        boletaScannerDedupeRef.current.value === raw &&
        now - boletaScannerDedupeRef.current.at < 500
      ) {
        return;
      }

      boletaScannerDedupeRef.current = { value: raw, at: now };
      const result = agregarProductoBoletaPorCodigo(raw);
      if (result.ok) {
        setScannerBoletaError("");
        setScannerBoletaInfo(`Agregado: ${result.label}`);
      } else {
        setScannerBoletaError(result.message || "No se pudo agregar.");
      }
    };

    (async () => {
      setScannerBoletaError("");
      setScannerBoletaInfo("Solicitando acceso a camara...");
      try {
        if (!window.isSecureContext) {
          throw new Error("requires-secure-context");
        }

        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia-not-supported");
        }

        const preStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        preStream.getTracks().forEach((track) => track.stop());

        if (!active) return;

        setScannerBoletaInfo("Iniciando camara...");

        const host = await waitForReaderHost();
        if (!host) {
          throw new Error("reader-host-not-ready");
        }

        host.innerHTML = "";
        qr = new Html5Qrcode(BOLETA_SCANNER_ID);
        boletaScannerRef.current = qr;

        try {
          await qr.start({ facingMode: { ideal: "environment" } }, SCAN_CFG, onSuccess);
        } catch (firstErr) {
          if (isTransitionError(firstErr)) {
            await wait(250);
            if (active) {
              await qr.start(
                { facingMode: { ideal: "environment" } },
                SCAN_CFG,
                onSuccess,
              );
            }
          } else {
            await safelyDisposeScanner(qr);
            if (!active) return;
            qr = new Html5Qrcode(BOLETA_SCANNER_ID);
            boletaScannerRef.current = qr;

            const cameras = await Html5Qrcode.getCameras();
            const rearId = pickRear(cameras);
            const fallback = rearId || cameras?.[0]?.id;
            if (!fallback) throw new Error("No hay camara disponible.");
            await qr.start(fallback, SCAN_CFG, onSuccess);
          }
        }

        if (active) setScannerBoletaInfo("Escaneando productos...");
      } catch (err) {
        console.error("No se pudo iniciar escaner boleta:", err);
        if (active) setScannerBoletaError(cameraErrorMessage(err));
      }
    })();

    return () => {
      active = false;
      const current = boletaScannerRef.current;
      boletaScannerRef.current = null;
      if (current) {
        safelyDisposeScanner(current).catch(() => {});
      }
      const host = document.getElementById(BOLETA_SCANNER_ID);
      if (host) host.innerHTML = "";
    };
  }, [mostrarScannerBoleta, productosDB]);

  const handleBack = () => {
    if (confirm("¿Seguro que quieres regresar?")) navigate(-1);
  };

  const handleEdit = () => {
    if (locked) {
      alert(
        "🔒 Este servicio ya está cerrado/bloqueado. No se puede modificar.",
      );
      return;
    }
    setEquipoEdit(buildEquipoEditDynamic(servicio));
    setModalPaso(0);
    setMostrarModalCaracteristicas(true);
  };

  const abrirWhatsAppAviso = (nextStatus) => {
    try {
      if (!servicio) return;
      const nombre = servicio?.nombre || "cliente";
      const fol = servicio?.folio || folio || "#";
      const tipo = servicio?.tipoDispositivo || "equipo";
      const marca = servicio?.marca || "";
      const modelo = servicio?.modelo || "";

      const texto = `Hola ${nombre},\n\nTe informamos que el servicio ${fol} (${tipo} ${marca} ${modelo}) ahora se encuentra en estado: *${nextStatus}*.\n\nGracias por confiar en nosotros — te avisaremos cuando haya novedades.`;

      const tel = String(servicio?.telefono || "").replace(/\D/g, "");
      if (!tel) return alert("No hay teléfono del cliente para WhatsApp.");

      const wa = `https://wa.me/52${tel}?text=${encodeURIComponent(texto)}`;
      window.open(wa, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Error abriendo WhatsApp:", e);
    }
  };

  const cerrarAdvertenciaAbandono = () => {
    setMostrarModalRetardo(false);
    setAbandonoDismissKey(avisoRetardoKey);
  };

  const notificarClienteAbandono = async () => {
    try {
      const tel = String(servicio?.telefono || "").replace(/\D/g, "");
      if (!tel) {
        alert("No hay telefono del cliente para WhatsApp.");
        return;
      }

      if (servicio?.id) {
        const actualizado = await actualizarServicioPorId(servicio.id, {
          abandonoNotificadoAt: new Date().toISOString(),
          abandonoNotificadoCargo: cargoRetardoTotal,
          abandonoNotificadoDias: diasRetardoAplicados,
        });
        setServicio(actualizado);
      }

      const wa = `https://wa.me/52${tel}?text=${encodeURIComponent(mensajeAbandonoCliente)}`;
      window.open(wa, "_blank", "noopener,noreferrer");
      cerrarAdvertenciaAbandono();
    } catch (error) {
      console.error("No se pudo notificar abandono:", error);
      alert("No se pudo abrir la notificacion de abandono.");
    }
  };

  const urlStatus = `${window.location.origin}/status/${encodeURIComponent(
    String(folio || ""),
  )}`;

  const whatsappUrl = useMemo(() => {
    const tel = String(servicio?.telefono || "").replace(/\D/g, "");
    if (!tel) return "";
    const msg = encodeURIComponent(
      `Hola ${servicio?.nombre || ""}, te escribimos sobre tu servicio ${servicio?.folio || folio}.`,
    );
    return `https://wa.me/52${tel}?text=${msg}`;
  }, [servicio?.telefono, servicio?.nombre, servicio?.folio, folio]);

  const retardoConfig = useMemo(() => {
    const snapshotRetardo = servicio?.hojaServicio?.retardo;

    if (snapshotRetardo?.habilitado) {
      return snapshotRetardo;
    }

    if (politicaRetardo?.habilitado) {
      return politicaRetardo;
    }

    return snapshotRetardo || politicaRetardo || null;
  }, [servicio?.hojaServicio?.retardo, politicaRetardo]);

  const totalBoleta = useMemo(() => {
    return items.reduce(
      (acc, r) => acc + num(r.pUnitario) * num(r.cantidad),
      0,
    );
  }, [items]);

  const hoyNormalizado = useMemo(() => {
    const next = new Date(hoyCursor);
    next.setHours(0, 0, 0, 0);
    return next;
  }, [hoyCursor]);

  const diasRetardoAutomaticos = useMemo(() => {
    if (!retardoConfig?.habilitado) return 0;
    const entrega = parseDateOnly(fechaAprox || servicio?.fechaAprox || "");
    if (!entrega) return 0;
    const atrasoBruto = diffDays(entrega, hoyNormalizado);
    return Math.max(0, atrasoBruto - Number(retardoConfig?.diasTolerancia || 0));
  }, [fechaAprox, hoyNormalizado, retardoConfig, servicio?.fechaAprox]);

  const diasRetardoAplicados = useMemo(() => {
    if (!retardoConfig?.habilitado) return 0;
    return diasRetardoAutomaticos;
  }, [diasRetardoAutomaticos, retardoConfig]);

  const bloquesRetardo = useMemo(() => {
    if (!retardoConfig?.habilitado || diasRetardoAplicados <= 0) return 0;
    const cada = Math.max(1, Number(retardoConfig?.aplicarCadaDias || 1));
    return Math.ceil(diasRetardoAplicados / cada);
  }, [diasRetardoAplicados, retardoConfig]);

  const cargoRetardoTotal = useMemo(() => {
    if (!retardoConfig?.habilitado) return 0;
    return bloquesRetardo * Number(retardoConfig?.cargo || 0);
  }, [bloquesRetardo, retardoConfig]);

  const baseEditable = useMemo(
    () => (usarBoleta ? totalBoleta : num(precioFinal)),
    [precioFinal, totalBoleta, usarBoleta],
  );

  const abandonoPorDias = useMemo(() => {
    if (!retardoConfig?.habilitado) return false;
    return diasRetardoAplicados >= Math.max(1, Number(retardoConfig?.abandonoDias || 0));
  }, [diasRetardoAplicados, retardoConfig]);

  const abandonoPorCosto = useMemo(() => {
    if (!retardoConfig?.habilitado || !retardoConfig?.abandonoSiSuperaCosto) return false;
    return cargoRetardoTotal > baseEditable && baseEditable > 0;
  }, [baseEditable, cargoRetardoTotal, retardoConfig]);

  const abandonoActivo = abandonoPorDias || abandonoPorCosto;
  const notificacionAbandonoActiva = notificacionesConfig?.abandono_equipos !== false;

  const totalConRetardo = useMemo(
    () => baseEditable + cargoRetardoTotal,
    [baseEditable, cargoRetardoTotal],
  );

  const statusPersistidoNormalizado = useMemo(
    () => normalizarStatus(servicio?.status || ""),
    [servicio?.status],
  );

  const subtotalBoletaPersistido = useMemo(() => {
    return (servicio?.boleta?.items || []).reduce(
      (acc, item) => acc + num(item?.pUnitario) * num(item?.cantidad),
      0,
    );
  }, [servicio?.boleta?.items]);

  const costoBasePersistido = useMemo(() => {
    const costoActual = num(servicio?.costo);
    const retardoActual = num(servicio?.retardo?.cargoTotal);
    const sinRetardo = Math.max(0, costoActual - retardoActual);
    const costoPersistidoVacio =
      servicio?.costo === undefined ||
      servicio?.costo === null ||
      String(servicio?.costo).trim() === "";

    if (sinRetardo > 0) return sinRetardo;
    if (
      costoPersistidoVacio &&
      statusPersistidoNormalizado === "cancelado" &&
      Number(precioRevision || 0) > 0
    ) {
      return Number(precioRevision || 0);
    }

    return 0;
  }, [precioRevision, servicio?.costo, servicio?.retardo?.cargoTotal, statusPersistidoNormalizado]);

  const diasRetardoPersistidos = useMemo(() => {
    if (!retardoConfig?.habilitado) return 0;
    const entrega = parseDateOnly(servicio?.fechaAprox || "");
    if (!entrega) return 0;
    const atrasoBruto = diffDays(entrega, hoyNormalizado);
    return Math.max(0, atrasoBruto - Number(retardoConfig?.diasTolerancia || 0));
  }, [hoyNormalizado, retardoConfig, servicio?.fechaAprox]);

  const bloquesRetardoPersistidos = useMemo(() => {
    if (!retardoConfig?.habilitado || diasRetardoPersistidos <= 0) return 0;
    const cada = Math.max(1, Number(retardoConfig?.aplicarCadaDias || 1));
    return Math.ceil(diasRetardoPersistidos / cada);
  }, [diasRetardoPersistidos, retardoConfig]);

  const cargoRetardoPersistido = useMemo(() => {
    if (!retardoConfig?.habilitado || statusPersistidoNormalizado === "entregado") return 0;
    return bloquesRetardoPersistidos * Number(retardoConfig?.cargo || 0);
  }, [bloquesRetardoPersistidos, retardoConfig, statusPersistidoNormalizado]);

  const abandonoPersistidoPorDias = useMemo(() => {
    if (!retardoConfig?.habilitado) return false;
    return diasRetardoPersistidos >= Math.max(1, Number(retardoConfig?.abandonoDias || 0));
  }, [diasRetardoPersistidos, retardoConfig]);

  const basePersistidaEditable = servicio?.boleta ? subtotalBoletaPersistido : costoBasePersistido;

  const abandonoPersistidoPorCosto = useMemo(() => {
    if (!retardoConfig?.habilitado || !retardoConfig?.abandonoSiSuperaCosto) return false;
    return cargoRetardoPersistido > basePersistidaEditable && basePersistidaEditable > 0;
  }, [basePersistidaEditable, cargoRetardoPersistido, retardoConfig]);

  const abandonoPersistidoActivo = abandonoPersistidoPorDias || abandonoPersistidoPorCosto;
  const diasRetardoModal = Math.max(
    diasRetardoAplicados,
    diasRetardoPersistidos,
    Number(servicio?.retardo?.diasAplicados || 0),
  );
  const cargoRetardoModal = Math.max(
    cargoRetardoTotal,
    cargoRetardoPersistido,
    num(servicio?.retardo?.cargoTotal),
  );
  const abandonoModalActivo =
    abandonoActivo || abandonoPersistidoActivo || !!servicio?.retardo?.abandonoActivo;
  const avisoRetardoKey = useMemo(
    () => [
      servicio?.id || folio || "sin_servicio",
      diasRetardoModal,
      Number(cargoRetardoModal || 0).toFixed(2),
      abandonoModalActivo ? "abandono" : "retardo",
    ].join("|"),
    [abandonoModalActivo, cargoRetardoModal, diasRetardoModal, folio, servicio?.id],
  );
  const avisoRetardoVisible =
    normalizarStatus(servicio?.status || "") !== "entregado" &&
    (diasRetardoModal > 0 || cargoRetardoModal > 0) &&
    abandonoDismissKey !== avisoRetardoKey;

  const mensajeAbandonoCliente = useMemo(() => {
    if (!servicio) return "";

    const nombre = servicio?.nombre || "cliente";
    const fol = servicio?.folio || folio || "#";
    const tipo = servicio?.tipoDispositivo || "equipo";
    const marca = servicio?.marca || "";
    const modelo = servicio?.modelo || "";
    if (abandonoActivo) {
      const motivo = abandonoPorDias
        ? "exceder los dias permitidos de resguardo"
        : "superar el cargo permitido de resguardo";

      return [
        `Estimado(a) ${nombre},`,
        "",
        `Tu equipo con folio ${fol} (${tipo} ${marca} ${modelo}) se encuentra en abandono por ${motivo}.`,
        `El cargo acumulado por guardado es de +${money(cargoRetardoTotal)} y el total actualizado del servicio es ${money(totalConRetardo)}.`,
        "Favor de comunicarte con nosotros lo antes posible para coordinar la entrega o cierre del servicio.",
      ].join("\n");
    }

    return [
      `Estimado(a) ${nombre},`,
      "",
      `Tu equipo con folio ${fol} (${tipo} ${marca} ${modelo}) presenta retraso en resguardo.`,
      `Ya se genero un cargo acumulado por guardado de +${money(cargoRetardoTotal)} y el total actualizado del servicio es ${money(totalConRetardo)}.`,
      "Favor de comunicarte con nosotros lo antes posible para recoger tu equipo y evitar cargos mayores.",
    ].join("\n");
  }, [
    abandonoActivo,
    abandonoPorDias,
    cargoRetardoTotal,
    folio,
    servicio,
    totalConRetardo,
  ]);

  useEffect(() => {
    if (
      loading ||
      !servicio?.id ||
      locked ||
      savingAll ||
      autoRetardoSyncRef.current ||
      statusPersistidoNormalizado === "entregado" ||
      !retardoConfig?.habilitado
    ) {
      return;
    }

    const retardoActual = servicio?.retardo || {};
    const costoActual = num(servicio?.costo);
    const totalBoletaActual = num(servicio?.boleta?.total);
    const cargoActual = num(retardoActual?.cargoTotal);
    const diasActuales = Number(retardoActual?.diasAplicados || 0);
    const abandonoActual = !!retardoActual?.abandonoActivo;
    const costoEsperado = servicio?.boleta
      ? subtotalBoletaPersistido + cargoRetardoPersistido
      : costoBasePersistido > 0
        ? costoBasePersistido + cargoRetardoPersistido
        : costoActual;

    const boletaDesfasada = !!servicio?.boleta &&
      Math.abs(totalBoletaActual - (subtotalBoletaPersistido + cargoRetardoPersistido)) > 0.009;
    const costoDesfasado = Math.abs(costoActual - costoEsperado) > 0.009;
    const retardoDesfasado =
      cargoActual !== cargoRetardoPersistido ||
      diasActuales !== diasRetardoPersistidos ||
      abandonoActual !== abandonoPersistidoActivo;

    if (!boletaDesfasada && !costoDesfasado && !retardoDesfasado) {
      return;
    }

    const patch = {
      costo: costoEsperado,
      retardo: {
        habilitado: true,
        diasTolerancia: Number(retardoConfig?.diasTolerancia || 0),
        diasAutomaticos: diasRetardoPersistidos,
        diasAplicados: diasRetardoPersistidos,
        cargoUnitario: Number(retardoConfig?.cargo || 0),
        aplicarCadaDias: Math.max(1, Number(retardoConfig?.aplicarCadaDias || 1)),
        cargoTotal: cargoRetardoPersistido,
        abandonoDias: Math.max(1, Number(retardoConfig?.abandonoDias || 0)),
        abandonoSiSuperaCosto: !!retardoConfig?.abandonoSiSuperaCosto,
        abandonoActivo: abandonoPersistidoActivo,
        abandonoMotivo: abandonoPersistidoPorDias
          ? "dias"
          : abandonoPersistidoPorCosto
            ? "costo"
            : "",
      },
      ...(servicio?.boleta
        ? {
            boleta: {
              ...servicio.boleta,
              items: limpiarBoletaItems(servicio.boleta.items || []),
              total: subtotalBoletaPersistido + cargoRetardoPersistido,
            },
          }
        : {}),
    };

    autoRetardoSyncRef.current = true;

    actualizarServicioPorId(servicio.id, patch)
      .then((actualizado) => {
        setServicio(actualizado);
      })
      .catch((error) => {
        console.error("No se pudo sincronizar retardo automatico:", error);
      })
      .finally(() => {
        autoRetardoSyncRef.current = false;
      });
  }, [
    abandonoPersistidoActivo,
    abandonoPersistidoPorCosto,
    abandonoPersistidoPorDias,
    cargoRetardoPersistido,
    costoBasePersistido,
    loading,
    locked,
    retardoConfig,
    savingAll,
    servicio,
    statusPersistidoNormalizado,
    subtotalBoletaPersistido,
    diasRetardoPersistidos,
  ]);

  useEffect(() => {
    if (avisoRetardoVisible) {
      setMostrarModalRetardo(true);
      return;
    }

    setMostrarModalRetardo(false);
  }, [avisoRetardoVisible]);

  const itemsValidos = useMemo(() => {
    return (items || []).some((it) => (it?.descripcion || "").trim() !== "");
  }, [items]);

  const puedeExportarBoleta = useMemo(() => {
    return usarBoleta && !!servicio && itemsValidos && !loading;
  }, [usarBoleta, servicio, itemsValidos, loading]);

  const updateRow = (id, patch) => {
    if (locked) return;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };
  const addRow = () => {
    if (locked) return;
    setItems((prev) => [...prev, nuevoItem(prev.length)]);
  };
  const removeRow = (id) => {
    if (locked) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  // =========================
  // Guardar TODO (con lock)
  // =========================
 // =========================
// Guardar TODO (con lock)
// =========================
const guardarTodo = async ({ silent = false } = {}) => {
  if (!servicio?.id) {
    if (!silent) alert("❌ No se encontró el ID del servicio.");
    return false;
  }

  if (locked) {
    if (!silent)
      alert("🔒 Este servicio ya está cerrado/bloqueado. No se puede modificar.");
    return false;
  }

  const costoManualCapturado = parsePrecioEditable(precioFinal);
  const costoSinBoleta = costoManualCapturado ?? 0;
  const costoConBoleta = totalBoleta;
  const nextStatus = statusValueFromRaw(status);
  const statusNormalizado = normalizarStatus(nextStatus);
  const statusGuardar =
    ["cancelado", "no_reparable"].includes(statusNormalizado) && abandonoActivo
      ? "abandonado"
      : nextStatus;
  const statusGuardarNormalizado = normalizarStatus(statusGuardar);
  const pidePrecio = requierePrecioFinal(nextStatus);
  const aceptaPrecioCero = permitePrecioCero(nextStatus);
  const costoPersistidoVacio =
    servicio?.costo === undefined ||
    servicio?.costo === null ||
    String(servicio?.costo).trim() === "";

  // ===============================
  // VALIDACIONES NORMALES
  // ===============================

  if (!usarBoleta) {
    const costoManualInvalido =
      costoManualCapturado === null ||
      (!aceptaPrecioCero && costoManualCapturado <= 0);

    if (pidePrecio && costoManualInvalido) {
      if (!silent)
        alert(
          aceptaPrecioCero
            ? "⚠️ Captura un Precio final válido (puede ser 0) o activa Boleta."
            : "⚠️ Captura un Precio final válido (mayor a 0) o activa Boleta.",
        );
      return false;
    }
  } else {
    if (!itemsValidos) {
      if (!silent)
        alert("⚠️ Agrega al menos 1 artículo con descripción para guardar la boleta.");
      return false;
    }
    if (!boletaFormaPago) {
      if (!silent) alert("⚠️ Selecciona una Forma de pago.");
      return false;
    }
  }

  // ===============================
  // 🚫 BLOQUEAR ENTREGADO SI NO ESTÁ COBRADO
  // ===============================

  if (statusGuardarNormalizado === "entregado") {
    const estaCobradoEnPOS = !!servicio?.cobradoEnPOS;
    if (!estaCobradoEnPOS) {
      if (!silent) {
        alert("No puedes marcar como ENTREGADO hasta que el servicio sea cobrado en POS/Ventas.");
      }
      return false;
    }
  }

  const willLock = isFinalStatus(statusGuardar);

  if (willLock) {
    const ok = confirm(
      `⚠️ Vas a marcar el servicio como "${statusGuardar}".\n\nEsto lo CERRARÁ y YA NO se podrá modificar.\n\n¿Confirmas?`
    );
    if (!ok) return false;
  }

  const costoRevision = Number(precioRevision || 0);
  const aplicarRetardo =
    !!retardoConfig?.habilitado &&
    statusGuardarNormalizado !== "entregado";
  const cargoRetardoGuardar = aplicarRetardo ? cargoRetardoTotal : 0;
  const costoGuardar = usarBoleta
    ? costoConBoleta + cargoRetardoGuardar
    : statusNormalizado === "cancelado" && costoRevision > 0 && costoManualCapturado === null
      ? costoRevision + cargoRetardoGuardar
      : costoManualCapturado !== null
        ? costoSinBoleta + cargoRetardoGuardar
        : costoPersistidoVacio
          ? ""
          : servicio?.costo;

  const patch = {
    status: statusGuardar,
    fechaAprox: fechaAprox || "",
    observaciones: observaciones || "",
    ...(esAdmin ? { notaAdmin: String(notaAdminEdit || "").trim() } : {}),

    precioDespues: false,
    costo: costoGuardar,
    retardo: aplicarRetardo
      ? {
          habilitado: true,
          diasTolerancia: Number(retardoConfig?.diasTolerancia || 0),
          diasAutomaticos: diasRetardoAutomaticos,
          diasAplicados: diasRetardoAplicados,
          cargoUnitario: Number(retardoConfig?.cargo || 0),
          aplicarCadaDias: Math.max(1, Number(retardoConfig?.aplicarCadaDias || 1)),
          cargoTotal: cargoRetardoGuardar,
          abandonoDias: Math.max(1, Number(retardoConfig?.abandonoDias || 0)),
          abandonoSiSuperaCosto: !!retardoConfig?.abandonoSiSuperaCosto,
          abandonoActivo,
          abandonoMotivo: abandonoPorDias ? "dias" : abandonoPorCosto ? "costo" : "",
        }
      : {
          habilitado: false,
          diasTolerancia: Number(retardoConfig?.diasTolerancia || 0),
          diasAutomaticos: 0,
          diasAplicados: 0,
          cargoUnitario: Number(retardoConfig?.cargo || 0),
          aplicarCadaDias: Math.max(1, Number(retardoConfig?.aplicarCadaDias || 1)),
          cargoTotal: 0,
          abandonoDias: Math.max(1, Number(retardoConfig?.abandonoDias || 0)),
          abandonoSiSuperaCosto: !!retardoConfig?.abandonoSiSuperaCosto,
          abandonoActivo: false,
          abandonoMotivo: "",
        },

    observacionesFotos: obsFotos || [],

    ...(usarBoleta
      ? {
          boleta: {
            fecha: boletaFecha || "",
            formaPago: boletaFormaPago || "",
            notas: boletaNotas || "",
            items: limpiarBoletaItems(items),
            total: costoConBoleta + cargoRetardoGuardar,
          },
        }
      : { boleta: null }),

    ...(willLock
      ? {
          locked: true,
          lockedReason: statusGuardarNormalizado,
        }
      : {}),
  };

  try {
    setSavingAll(true);

    const actualizado = await actualizarServicioPorId(servicio.id, patch);

    setServicio(actualizado);
    notaAdminGuardadaRef.current = String(notaAdminEdit || "").trim();

    setPrecioFinal(
      String(
        Math.max(
          0,
          Number(actualizado?.costo ?? (usarBoleta ? costoConBoleta : costoSinBoleta)) -
            Number(actualizado?.retardo?.cargoTotal || 0),
        )
      )
    );

    return true;
  } catch (e) {
    console.error(e);
    if (!silent) alert(`❌ Error guardando: ${e?.message || e}`);
    return false;
  } finally {
    setSavingAll(false);
  }
};

  const handleGuardarTodo = async () => {
    await guardarTodo({ silent: false });
  };

  const guardarCaracteristicasEquipo = async () => {
    if (!servicio?.id) return;
    if (locked) {
      alert(
        "🔒 Este servicio ya está cerrado/bloqueado. No se puede modificar.",
      );
      return;
    }

    const tipo = normalizarStatus(
      equipoEdit?.tipoDispositivo || servicio?.tipoDispositivo,
    );
    const nombreLimpio = String(equipoEdit?.nombre || "").trim();
    const telefonoLimpio = String(equipoEdit?.telefono || "")
      .replace(/\D/g, "")
      .slice(0, 10);
    const direccionLimpia = String(equipoEdit?.direccion || "").trim();
    const numeroSerieLimpio = String(equipoEdit?.numeroSerie || "").trim();

    if (!nombreLimpio) {
      alert("Captura el nombre del cliente.");
      return;
    }

    if (!equipoEdit?.omitirNumeroSerie && !numeroSerieLimpio) {
      alert(
        "Captura el numero de serie o activa 'No quiero poner el numero de serie'.",
      );
      return;
    }

    const patch = {
      caracteristicasPendientes: false,
      nombre: nombreLimpio,
      telefono: telefonoLimpio,
      direccion: direccionLimpia,
      tipoDispositivo: equipoEdit?.tipoDispositivo || "",
      marca: String(equipoEdit?.marca || "").trim(),
      modelo: String(equipoEdit?.modelo || "").trim(),
      numeroSerie: equipoEdit?.omitirNumeroSerie ? "" : numeroSerieLimpio,
      omitirNumeroSerie: !!equipoEdit?.omitirNumeroSerie,
      trabajo: String(equipoEdit?.trabajo || "").trim(),
      laptopPc: null,
      impresora: null,
      monitor: null,
    };

    if (tipo === "laptop" || tipo === "pc") {
      patch.laptopPc = {
        procesador: equipoEdit.procesador || "",
        ram: equipoEdit.ram || "",
        disco: equipoEdit.disco || "",
        estadoPantalla: equipoEdit.estadoPantalla || "Funciona bien",
        estadoTeclado: equipoEdit.estadoTeclado || "Funciona bien",
        estadoMouse: equipoEdit.estadoMouse || "Funciona bien",
        funciona: equipoEdit.funciona || "Sí",
        enciendeEquipo: equipoEdit.enciendeEquipo || "Sí",
        contrasenaEquipo: equipoEdit.contrasenaEquipo || "",
      };
    } else if (tipo === "impresora") {
      patch.impresora = {
        tipoImpresora: equipoEdit.tipoImpresora || "Inyección de tinta",
        imprime: equipoEdit.imprime || "Sí",
        condicionesImpresora: equipoEdit.condicionesImpresora || "",
      };
    } else if (tipo === "monitor") {
      patch.monitor = {
        tamanoMonitor: equipoEdit.tamanoMonitor || "",
        colores: equipoEdit.colores || "Sí",
        condicionesMonitor: equipoEdit.condicionesMonitor || "",
      };
    }

    const actualizado = await actualizarServicioPorId(servicio.id, patch);

    if (servicio?.clienteId) {
      try {
        await actualizarCliente(servicio.clienteId, {
          nombre: patch.nombre,
          telefono: patch.telefono,
          direccion: patch.direccion,
          numeroSeriePreferido: patch.numeroSerie,
          omitirNumeroSerie: patch.omitirNumeroSerie,
        });
      } catch (errCli) {
        console.error("No se pudo actualizar el cliente enlazado:", errCli);
      }
    }

    setServicio(actualizado);
    setEquipoEdit(buildEquipoEditDynamic(actualizado));
    setMostrarModalCaracteristicas(false);
  };

  // ✅ Generar PDF: primero guarda boleta y luego abre PDF
  const guardarCaracteristicasEquipoDynamic = async () => {
    if (!servicio?.id) return;
    if (locked) {
      alert("Este servicio ya esta cerrado o bloqueado. No se puede modificar.");
      return;
    }

    const tipo = normalizarStatus(
      equipoEdit?.tipoDispositivo || servicio?.tipoDispositivo,
    );
    const nombreLimpio = String(equipoEdit?.nombre || "").trim();
    const telefonoLimpio = String(equipoEdit?.telefono || "")
      .replace(/\D/g, "")
      .slice(0, 10);
    const direccionLimpia = String(equipoEdit?.direccion || "").trim();
    const numeroSerieLimpio = String(equipoEdit?.numeroSerie || "").trim();

    if (!nombreLimpio) {
      alert("Captura el nombre del cliente.");
      return;
    }

    if (!equipoEdit?.omitirNumeroSerie && !numeroSerieLimpio) {
      alert("Captura el numero de serie o activa 'No quiero poner el numero de serie'.");
      return;
    }

    const camposPersonalizados = buildCamposPersonalizados(
      tipoNegocioServicio,
      equipoEdit?.camposPersonalizados,
    );
    const campoFaltante = camposTecnicosEdit.find((campo) => {
      if (!campo.requerido) return false;
      if (campo.tipo === "checkbox") return !camposPersonalizados[campo.id];
      return !String(camposPersonalizados[campo.id] ?? "").trim();
    });

    if (campoFaltante) {
      alert(`Completa el campo obligatorio: ${campoFaltante.etiqueta}.`);
      return;
    }

    const legacyBlocks = buildLegacyBlocksFromCampos(tipo, camposPersonalizados);
    const patch = {
      caracteristicasPendientes: false,
      nombre: nombreLimpio,
      telefono: telefonoLimpio,
      direccion: direccionLimpia,
      tipoDispositivo: equipoEdit?.tipoDispositivo || "",
      marca: String(equipoEdit?.marca || "").trim(),
      modelo: String(equipoEdit?.modelo || "").trim(),
      numeroSerie: equipoEdit?.omitirNumeroSerie ? "" : numeroSerieLimpio,
      omitirNumeroSerie: !!equipoEdit?.omitirNumeroSerie,
      trabajo: String(equipoEdit?.trabajo || "").trim(),
      tipoNegocioId: tipoNegocioServicio?.id || "",
      tipoNegocioNombre: tipoNegocioServicio?.nombre || "",
      tipoNegocioSnapshot: tipoNegocioServicio,
      camposPersonalizados,
      laptopPc: legacyBlocks.laptopPc,
      impresora: legacyBlocks.impresora,
      monitor: legacyBlocks.monitor,
    };

    const actualizado = await actualizarServicioPorId(servicio.id, patch);

    if (servicio?.clienteId) {
      try {
        await actualizarCliente(servicio.clienteId, {
          nombre: patch.nombre,
          telefono: patch.telefono,
          direccion: patch.direccion,
          numeroSeriePreferido: patch.numeroSerie,
          omitirNumeroSerie: patch.omitirNumeroSerie,
        });
      } catch (errCli) {
        console.error("No se pudo actualizar el cliente enlazado:", errCli);
      }
    }

    setServicio(actualizado);
    setEquipoEdit(buildEquipoEditDynamic(actualizado));
    setMostrarModalCaracteristicas(false);
  };

  const handleExportPdf = async () => {
    if (!puedeExportarBoleta) {
      alert("⚠️ Activa 'Generar boleta' y captura al menos 1 descripción.");
      return;
    }
    if (locked) {
      alert(
        "🔒 Servicio bloqueado. Puedes generar PDF si ya está guardada la boleta, pero no modificar.",
      );
    }

    try {
      setExportingPdf(true);

      // guarda silencioso (asegura formaPago + notas + items en BD)
      await guardarTodo({ silent: true });

      await generarPdfBoletaVenta({
        folio: servicio?.folio || folio || "",
        nombre: servicio?.nombre || "",
        direccion: servicio?.direccion || "S/N",
        telefono: servicio?.telefono || "",
        fecha: boletaFecha || "",
        formaPago: boletaFormaPago || "",
        notas: boletaNotas || "",
        items,
        total: totalBoleta,
      });
    } catch (error) {
      console.error("No se pudo generar la boleta PDF:", error);
      alert("No se pudo generar la boleta PDF. Intenta nuevamente.");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCampoTecnicoEditChange = (campoId, value) => {
    setEquipoEdit((prev) => ({
      ...prev,
      camposPersonalizados: {
        ...(prev?.camposPersonalizados || {}),
        [campoId]: value,
      },
    }));
  };

  const renderCampoTecnicoEdit = (campo) => {
    const value = equipoEdit?.camposPersonalizados?.[campo.id];
    const wrapperClass = `equipo-field${campo.anchoCompleto ? " equipo-field--full" : ""}`;

    if (campo.tipo === "textarea") {
      return (
        <label key={campo.id} className={wrapperClass}>
          <span>{campo.etiqueta}</span>
          <textarea
            value={String(value ?? "")}
            placeholder={campo.placeholder || ""}
            onChange={(e) => handleCampoTecnicoEditChange(campo.id, e.target.value)}
          />
        </label>
      );
    }

    if (campo.tipo === "select") {
      return (
        <label key={campo.id} className={wrapperClass}>
          <span>{campo.etiqueta}</span>
          <select
            value={String(value ?? "")}
            onChange={(e) => handleCampoTecnicoEditChange(campo.id, e.target.value)}
          >
            <option value="">-- Selecciona --</option>
            {(campo.opciones || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (campo.tipo === "checkbox") {
      return (
        <label key={campo.id} className="equipo-check equipo-field--full">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => handleCampoTecnicoEditChange(campo.id, e.target.checked)}
          />
          <span>{campo.etiqueta}</span>
        </label>
      );
    }

    return (
      <label key={campo.id} className={wrapperClass}>
        <span>{campo.etiqueta}</span>
        <input
          type={campo.tipo === "number" ? "number" : "text"}
          value={String(value ?? "")}
          placeholder={campo.placeholder || ""}
          onChange={(e) => handleCampoTecnicoEditChange(campo.id, e.target.value)}
        />
      </label>
    );
  };

  if (loading)
    return (
      <div className="detalle-page">
        <p>Cargando...</p>
      </div>
    );

  if (!servicio) {
    return (
      <div className="detalle-page">
        <div className="detalle-card">
          <div className="detalle-topbar">
            <button className="icon-btn" onClick={handleBack} title="Regresar">
              ←
            </button>
            <div className="detalle-title">
              <h2>Servicio no encontrado</h2>
              <small>Folio: {folio}</small>
            </div>
            <button className="icon-btn" onClick={handleEdit} title="Editar">
              ✎
            </button>
          </div>
          <p>No existe un servicio con ese folio.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="detalle-page">
      <div className="detalle-card">
        {/* Topbar */}
        <div className="detalle-topbar">
          <button className="icon-btn" onClick={handleBack} title="Regresar">
            ←
          </button>

          <div className="detalle-title">
            <h2>Detalle del Servicio</h2>
            <small className="detalle-meta">
              Folio: <b>{servicio.folio}</b> · Estado:{" "}
              <span
                className={`servicio-status-badge servicio-status-badge-${normalizarStatus(statusActual)}`}
              >
                {statusLabel}
              </span>
              {locked && (
                <span className="detalle-locked-flag">
                  🔒 CERRADO
                </span>
              )}
            </small>
          </div>

          <button className="icon-btn" onClick={handleEdit} title="Editar">
            ✎
          </button>
        </div>

        {/* Estado */}
        <div className="box full">
          <h3>Estado del servicio</h3>
          <WizardProgress status={statusActual} />

          <div className="estado-controls">
            <div className="estado-control-item">
              <label>
                <b>Actualizar estado</b>
              </label>

              <select
                className="input-compact"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={locked}
              >
                {STATUS.filter(
                  (s) =>
                    s.value !== "entregado" ||
                    statusValueFromRaw(status) === "entregado",
                ).map((s, idx) => (
                  <option key={`${s.value}-${s.label}-${idx}`} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="estado-control-item">
              <label>
                <b>Fecha de entrega aproximada</b>
              </label>
              <input
                type="date"
                className="input-compact"
                value={fechaAprox}
                onChange={(e) => setFechaAprox(e.target.value)}
                disabled={locked}
              />
            </div>

            <div className="estado-control-item estado-control-item-btn">
              <label className="estado-action-label">&nbsp;</label>
              <button
                className="btn btn-wa"
                onClick={() => abrirWhatsAppAviso(status)}
                disabled={locked}
              >
                Avisar cliente por WhatsApp
              </button>
            </div>
          </div>

        </div>

        {/* Grid */}
        <div className="grid">
          <div className="box">
            <h3>Cliente</h3>
            <p>
              <b>Nombre:</b> {servicio.nombre || "-"}
            </p>
            <p>
              <b>Teléfono:</b> {servicio.telefono || "-"}
            </p>
            <p>
              <b>Dirección:</b> {servicio.direccion || "-"}
            </p>

            {whatsappUrl ? (
              <a
                className="btn btn-wa cliente-wa-btn"
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp Cliente
              </a>
            ) : (
              <small style={{ opacity: 0.75, marginTop: 12, display: "block" }}>
                (Sin teléfono para WhatsApp)
              </small>
            )}

            <div className="qr-status-wrap">
              <b>QR estado:</b>
              <div className="qr-status-code">
                <QRCode value={urlStatus} size={esVistaMovil ? 92 : 110} />
              </div>
              <small style={{ opacity: 0.8 }}>/status/{folio}</small>
            </div>
          </div>

          <div className="box">
            <h3>Equipo</h3>
            <div className="equipo-detalles-grid">
              {equipoDetalles.map((item) => (
                <div key={`${item.label}-${item.value}`} className="equipo-detail-item">
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

          </div>

          <div className="box">
            <h3>Servicio</h3>
            <p>
              <b>Estado:</b> {statusLabel}
            </p>
            <p>
              <b>Descripción:</b> {servicio.trabajo || "-"}
            </p>
            <p>
              <b>Costo:</b> {servicio.costo || "-"}
            </p>
            <p>
              <b>Total abonado:</b> {money(servicio.totalAbonado || 0)}
            </p>
            {num(servicio.costo) > 0 && (
              <p><b>Saldo pendiente:</b> {money(Math.max(0, num(servicio.costo) - Number(servicio.totalAbonado || 0)))}</p>
            )}
            <p>
              <b>Precio después:</b> {servicio.precioDespues ? "Sí" : "No"}
            </p>
            <p>
              <b>Fecha ingreso:</b> {formatFecha(servicio.createdAt)}
            </p>
          </div>
        </div>

        {/* Observaciones */}
        <div className="box full">
          <h3>Observaciones</h3>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Observaciones internas del servicio..."
            disabled={locked}
          />
        </div>

        {/* Boleta */}
        <div className="box full">
          <div className="boleta-head">
            <h3 style={{ margin: 0 }}>Boleta de venta</h3>

            <label className="boleta-toggle">
              <input
                type="checkbox"
                checked={usarBoleta}
                onChange={(e) => setUsarBoleta(e.target.checked)}
                disabled={locked}
              />
              Generar boleta de venta
            </label>
          </div>

          {!usarBoleta && (
            <div className="boleta-precio-wrap">
              <label>
                <b>Precio final</b>
              </label>
              <input
                value={precioFinal}
                onChange={(e) => setPrecioFinal(e.target.value)}
                placeholder="Ej: 2239"
                disabled={locked}
              />
              <small style={{ opacity: 0.75 }}>
                Si NO usas boleta, este precio se guarda como <b>costo</b>.
              </small>
              {retardoConfig?.habilitado ? (
                <small className="boleta-retardo-inline">
                  Base: <b>{money(num(precioFinal))}</b> + recargo por retardo:{" "}
                  <b>{money(cargoRetardoTotal)}</b> = total a guardar:{" "}
                  <b>{money(totalConRetardo)}</b>
                </small>
              ) : null}
            </div>
          )}

          <div className="boleta-retardo-card">
            <div className="boleta-retardo-head">
              <h4>Retardo y abandono</h4>
              <span className={`boleta-retardo-pill${retardoConfig?.habilitado ? " on" : " off"}`}>
                {retardoConfig?.habilitado ? "Activo" : "Deshabilitado"}
              </span>
            </div>

            {retardoConfig?.habilitado ? (
              <>
                <div className="boleta-retardo-grid">
                  <div className="boleta-retardo-auto">
                    <small>Dias de retardo automaticos</small>
                    <strong>{diasRetardoAplicados} dia(s)</strong>
                    <span>
                      Se calculan solos con base en la fecha de entrega, la tolerancia y el dia
                      actual.
                    </span>
                  </div>

                  <div className="boleta-retardo-preview">
                    <span>Tolerancia: {Number(retardoConfig?.diasTolerancia || 0)} dia(s)</span>
                    <span>
                      Cargo: {money(retardoConfig?.cargo || 0)} cada{" "}
                      {Math.max(1, Number(retardoConfig?.aplicarCadaDias || 1))} dia(s)
                    </span>
                    <span>Retardo aplicado: {diasRetardoAplicados} dia(s)</span>
                    <span>Recargo total: {money(cargoRetardoTotal)}</span>
                  </div>
                </div>

                <div className="boleta-retardo-summary">
                  <strong>Total a guardar:</strong> {money(totalConRetardo)}
                </div>

              </>
            ) : (
              <small className="boleta-retardo-disabled">
                La politica de retardo esta deshabilitada en configuracion.
              </small>
            )}
          </div>

          {usarBoleta && (
            <div>
              <div className="boleta-meta-grid">
                <div>
                  <label>
                    <b>Fecha boleta</b>
                  </label>
                  <input
                    type="date"
                    className="input-compact"
                    value={boletaFecha}
                    onChange={(e) => setBoletaFecha(e.target.value)}
                    disabled={locked}
                  />
                </div>

                <div>
                  <label>
                    <b>Forma de pago</b>
                  </label>
                  <select
                    value={boletaFormaPago}
                    onChange={(e) => setBoletaFormaPago(e.target.value)}
                    disabled={locked}
                  >
                    <option value="">Selecciona…</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label>
                    <b>Total</b>
                  </label>
                  <div className="boleta-total-label">
                    {money(totalConRetardo)}
                  </div>
                </div>
              </div>

              <div className="boleta-table-wrap">
                <div className="boleta-scan-tools">
                  <label style={{ margin: 0 }}>
                    <b>Escanear producto para boleta</b>
                  </label>
                  <input
                    placeholder="Escanea codigo y presiona Enter"
                    value={scanCode}
                    disabled={locked}
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const result = agregarProductoBoletaPorCodigo(scanCode);
                      if (!result.ok) {
                        alert(result.message || "No se pudo agregar producto.");
                        return;
                      }
                      setScanCode("");
                    }}
                    style={{ height: 36, padding: "0 8px", borderRadius: 6 }}
                  />
                  {esVistaMovil && !locked && (
                    <button
                      type="button"
                      className="btn boleta-scan-btn"
                      onClick={() => setMostrarScannerBoleta(true)}
                    >
                      Escanear camara
                    </button>
                  )}
                </div>
                <table className="boleta-table">
                  <thead>
                    <tr style={{ background: "#2563eb", color: "#fff" }}>
                      <th style={{ padding: 10, textAlign: "left" }}>ITEM</th>
                      <th style={{ padding: 10, textAlign: "left" }}>
                        DESCRIPCIÓN
                      </th>
                      <th style={{ padding: 10, textAlign: "right" }}>
                        P. UNITARIO
                      </th>
                      <th style={{ padding: 10, textAlign: "right" }}>
                        CANTIDAD
                      </th>
                      <th style={{ padding: 10, textAlign: "right" }}>
                        IMPORTE
                      </th>
                      <th style={{ padding: 10 }}></th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((r) => {
                      const importe = num(r.pUnitario) * num(r.cantidad);
                      return (
                        <tr
                          key={r.id}
                          style={{ borderBottom: "1px solid rgba(0,0,0,.08)" }}
                        >
                          <td style={{ padding: 8, width: 90 }}>
                            <input
                              value={r.item}
                              onChange={(e) =>
                                updateRow(r.id, { item: e.target.value })
                              }
                              disabled={locked}
                              style={{
                                width: "100%",
                                height: 40,
                                borderRadius: 10,
                                padding: "0 10px",
                                border: "1px solid rgba(0,0,0,.18)",
                              }}
                            />
                          </td>

                          <td style={{ padding: 8, minWidth: 260 }}>
                            <input
                              value={r.descripcion}
                              onChange={(e) =>
                                updateRow(r.id, { descripcion: e.target.value })
                              }
                              disabled={locked}
                              placeholder="Ej: Memoria DDR3 8GB..."
                              style={{
                                width: "100%",
                                height: 40,
                                borderRadius: 10,
                                padding: "0 10px",
                                border: "1px solid rgba(0,0,0,.18)",
                              }}
                            />
                          </td>

                          <td style={{ padding: 8, width: 140 }}>
                            <input
                              value={r.pUnitario}
                              onChange={(e) =>
                                updateRow(r.id, { pUnitario: e.target.value })
                              }
                              disabled={locked}
                              placeholder="0.00"
                              style={{
                                width: "100%",
                                height: 40,
                                borderRadius: 10,
                                padding: "0 10px",
                                border: "1px solid rgba(0,0,0,.18)",
                                textAlign: "right",
                              }}
                            />
                          </td>

                          <td style={{ padding: 8, width: 120 }}>
                            <input
                              value={r.cantidad}
                              onChange={(e) =>
                                updateRow(r.id, { cantidad: e.target.value })
                              }
                              disabled={locked}
                              style={{
                                width: "100%",
                                height: 40,
                                borderRadius: 10,
                                padding: "0 10px",
                                border: "1px solid rgba(0,0,0,.18)",
                                textAlign: "right",
                              }}
                            />
                          </td>

                          <td
                            style={{
                              padding: 8,
                              width: 160,
                              textAlign: "right",
                              fontWeight: 900,
                            }}
                          >
                            {money(importe)}
                          </td>

                          <td
                            style={{
                              padding: 8,
                              width: 60,
                              textAlign: "center",
                            }}
                          >
                            {!locked && (
                              <button
                                className="btn btn-danger"
                                onClick={() => removeRow(r.id)}
                                title="Quitar"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: 10,
                          textAlign: "right",
                          fontWeight: 900,
                        }}
                      >
                        SUBTOTAL:
                      </td>
                      <td
                        style={{
                          padding: 10,
                          textAlign: "right",
                          fontWeight: 900,
                        }}
                      >
                        {money(totalBoleta)}
                      </td>
                      <td />
                    </tr>
                    {cargoRetardoTotal > 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          style={{
                            padding: 10,
                            textAlign: "right",
                            fontWeight: 800,
                            color: "#1d4ed8",
                          }}
                        >
                          RETARDO:
                        </td>
                        <td
                          style={{
                            padding: 10,
                            textAlign: "right",
                            fontWeight: 800,
                            color: "#1d4ed8",
                          }}
                        >
                          {money(cargoRetardoTotal)}
                        </td>
                        <td />
                      </tr>
                    ) : null}
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: 10,
                          textAlign: "right",
                          fontWeight: 900,
                        }}
                      >
                        TOTAL FINAL:
                      </td>
                      <td
                        style={{
                          padding: 10,
                          textAlign: "right",
                          fontWeight: 900,
                        }}
                      >
                        {money(totalConRetardo)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div style={{ marginTop: 12 }}>
                <label>
                  <b>Observaciones / Notas de boleta</b>
                </label>
                <textarea
                  value={boletaNotas}
                  onChange={(e) => setBoletaNotas(e.target.value)}
                  disabled={locked}
                  placeholder="Ej: Incluye instalación..."
                />
              </div>

              <div className="boleta-actions">
                {!locked && (
                  <button className="btn" onClick={addRow}>
                    Agregar renglón
                  </button>
                )}

                <button
                  className={`btn btn-ok ${!puedeExportarBoleta || exportingPdf ? "disabled" : ""}`}
                  onClick={handleExportPdf}
                  disabled={!puedeExportarBoleta || exportingPdf}
                >
                  {exportingPdf
                    ? "Generando PDF..."
                    : "Descargar boleta PDF"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ✅ BOTÓN ÚNICO HASTA ABAJO */}
        <div className="box full" style={{ marginTop: 14 }}>
          {!locked && (
            <button
              type="button"
              className="btn servicio-abono-pos-btn"
              onClick={() => navigate(`/POS?abonarServicio=${encodeURIComponent(servicio.folio || folio)}`)}
            >
              Abonar servicio en Punto de Venta
            </button>
          )}
          <button
            className={`btn btn-ok ${savingAll || locked ? "disabled" : ""}`}
            onClick={handleGuardarTodo}
            disabled={savingAll || locked}
            style={{ width: "100%", padding: "12px 16px", fontWeight: 900 }}
          >
            {locked
              ? "Servicio cerrado (no editable)"
              : savingAll
                ? "Guardando todo..."
                : "Guardar cambios (Todo)"}
          </button>

          <small style={{ opacity: 0.75, display: "block", marginTop: 8 }}>
            Guarda: estado, fecha aprox, observaciones, fotos y boleta (si
            aplica).
          </small>
        </div>
      </div>

      {esAdmin && (
        <>
          <button
            type="button"
            className={`notas-side-tab no-print ${mostrarPestanaNotas ? "open" : ""}`}
            onClick={() => setMostrarPestanaNotas((v) => !v)}
            title="Notas internas"
          >
            <span className="notas-tab-icon" aria-hidden="true">📎</span>
            <span>Notas</span>
          </button>

          <aside className={`notas-side-drawer no-print ${mostrarPestanaNotas ? "open" : ""}`}>
            <div className="notas-side-head">
              <span className="notas-clip" aria-hidden="true">📎</span>
              <strong>Notas internas</strong>
            </div>

            <textarea
              className="notas-side-textarea"
              placeholder="Escribe una nota interna..."
              value={notaAdminEdit}
              onChange={(e) => setNotaAdminEdit(e.target.value)}
              disabled={savingNotaAdmin || locked}
            />

            <div className="notas-side-actions">
              <small>
                {locked
                  ? "Servicio cerrado: notas bloqueadas."
                  : savingNotaAdmin
                    ? "Guardando nota..."
                    : "Se guarda automaticamente."}
              </small>
            </div>
          </aside>
        </>
      )}

      {mostrarModalRetardo ? (
        <div className="abandono-modal-overlay no-print">
          <div className={`abandono-modal${abandonoModalActivo ? " is-abandono" : " is-retraso"}`}>
            <div className="abandono-modal-head">
              <div className="abandono-modal-icon-wrap">
                <div className="abandono-modal-icon" aria-hidden="true">!</div>
              </div>

              <div className="abandono-modal-copy">
                <span className="abandono-modal-kicker">
                  {abandonoModalActivo ? "Alerta critica" : "Seguimiento automatico"}
                </span>
                <h3>{abandonoModalActivo ? "Equipo en abandono" : "Equipo con retraso"}</h3>
                <p>
                  {abandonoModalActivo
                    ? "El equipo ya excedio la politica configurada de resguardo y requiere seguimiento inmediato."
                    : `Ya paso la tolerancia configurada y el equipo acumula ${diasRetardoModal} dia(s) de retraso.`}
                </p>
              </div>

              <div className={`abandono-modal-badge${abandonoModalActivo ? " danger" : ""}`}>
                {abandonoModalActivo ? "Abandono" : "Retraso"}
              </div>
            </div>

            <div className="abandono-modal-summary">
              <div className="abandono-modal-stat">
                <span>Folio</span>
                <strong>{servicio?.folio || folio || "-"}</strong>
              </div>
              <div className="abandono-modal-stat">
                <span>Dias de retraso</span>
                <strong>{diasRetardoModal} dia(s)</strong>
              </div>
              <div className="abandono-modal-stat">
                <span>Recargo acumulado</span>
                <strong>{money(cargoRetardoModal)}</strong>
              </div>
              <div className="abandono-modal-stat">
                <span>Total actualizado</span>
                <strong>{money(totalConRetardo)}</strong>
              </div>
            </div>

            <div className="abandono-modal-message">
              <strong>Mensaje sugerido al cliente</strong>
              <p>{mensajeAbandonoCliente}</p>
            </div>

            <div className="abandono-modal-actions">
              {notificacionAbandonoActiva ? (
                <button
                  type="button"
                  className="btn btn-wa abandono-modal-btn-primary"
                  onClick={notificarClienteAbandono}
                >
                  Notificar al cliente
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-light abandono-modal-btn-secondary"
                onClick={cerrarAdvertenciaAbandono}
              >
                Cerrar advertencia
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mostrarScannerBoleta && (
        <div className="boleta-scanner-overlay no-print">
          <div className="boleta-scanner-modal">
            <div className="boleta-scanner-head">
              <h4>Escaner de boleta</h4>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setMostrarScannerBoleta(false)}
              >
                Cerrar
              </button>
            </div>

            <p className="boleta-scanner-sub">
              Escanea productos para agregarlos directamente a la boleta.
            </p>

            <div id={BOLETA_SCANNER_ID} className="boleta-scanner-reader" />

            {scannerBoletaError ? (
              <div className="boleta-scanner-msg boleta-scanner-msg--error">
                {scannerBoletaError}
              </div>
            ) : (
              <div className="boleta-scanner-msg">{scannerBoletaInfo}</div>
            )}
          </div>
        </div>
      )}

      {mostrarModalCaracteristicas && (
        <div className="equipo-modal-overlay">
          <div className="equipo-modal">
            <h3>Editar datos del servicio</h3>
            <p className="equipo-modal-alerta">
              Desde aqui puedes editar cliente, equipo y caracteristicas
              tecnicas.
            </p>

            {pasosModal.length > 1 && <div className="equipo-carousel-head">
              <div className="equipo-carousel-tabs">
                {pasosModal.map((p, idx) => (
                  <button
                    type="button"
                    key={p.key}
                    className={`equipo-tab ${idx === modalPaso ? "active" : ""}`}
                    onClick={() => setModalPaso(idx)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="equipo-carousel-nav">
                <button
                  type="button"
                  className="equipo-nav-btn"
                  disabled={modalPaso === 0}
                  onClick={() => setModalPaso((p) => Math.max(0, p - 1))}
                >
                  ← Anterior
                </button>
                <small className="equipo-modal-step">
                  Paso {modalPaso + 1} de {pasosModal.length}
                </small>
                <button
                  type="button"
                  className="equipo-nav-btn"
                  disabled={modalPaso >= pasosModal.length - 1}
                  onClick={() =>
                    setModalPaso((p) => Math.min(pasosModal.length - 1, p + 1))
                  }
                >
                  Siguiente →
                </button>
              </div>
            </div>}

            {modalPasoActual === "general" && (
              <div className="equipo-modal-grid equipo-modal-grid--general">
                <label className="equipo-field">
                  <span>Nombre del cliente</span>
                  <input
                    value={equipoEdit.nombre}
                    onChange={(e) =>
                      setEquipoEdit((p) => ({ ...p, nombre: e.target.value }))
                    }
                  />
                </label>
                <label className="equipo-field">
                  <span>Telefono</span>
                  <input
                    value={equipoEdit.telefono}
                    onChange={(e) =>
                      setEquipoEdit((p) => ({
                        ...p,
                        telefono: e.target.value.replace(/\D/g, "").slice(0, 10),
                      }))
                    }
                  />
                </label>
                <label className="equipo-field equipo-field--full">
                  <span>Direccion</span>
                  <input
                    value={equipoEdit.direccion}
                    onChange={(e) =>
                      setEquipoEdit((p) => ({ ...p, direccion: e.target.value }))
                    }
                  />
                </label>
                <label className="equipo-field">
                  <span>{tipoNegocioServicio?.etiquetaTipoDispositivo || "Tipo de dispositivo"}</span>
                  <select
                    value={equipoEdit.tipoDispositivo}
                    onChange={(e) =>
                      setEquipoEdit((p) => ({
                        ...p,
                        tipoDispositivo: e.target.value,
                      }))
                    }
                  >
                    {(tipoNegocioServicio?.opcionesTipoDispositivo || []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="equipo-field">
                  <span>{tipoNegocioServicio?.etiquetaMarca || "Marca"}</span>
                  <input
                    value={equipoEdit.marca}
                    onChange={(e) =>
                      setEquipoEdit((p) => ({ ...p, marca: e.target.value }))
                    }
                  />
                </label>
                <label className="equipo-field">
                  <span>{tipoNegocioServicio?.etiquetaModelo || "Modelo"}</span>
                  <input
                    value={equipoEdit.modelo}
                    onChange={(e) =>
                      setEquipoEdit((p) => ({ ...p, modelo: e.target.value }))
                    }
                  />
                </label>
                <label className="equipo-field">
                  <span>{tipoNegocioServicio?.etiquetaSerie || "No. de serie"}</span>
                  <input
                    value={equipoEdit.numeroSerie}
                    disabled={!!equipoEdit.omitirNumeroSerie}
                    onChange={(e) =>
                      setEquipoEdit((p) => ({
                        ...p,
                        numeroSerie: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="equipo-check equipo-field--full">
                  <input
                    type="checkbox"
                    checked={!!equipoEdit.omitirNumeroSerie}
                    onChange={(e) =>
                      setEquipoEdit((p) => ({
                        ...p,
                        omitirNumeroSerie: e.target.checked,
                        numeroSerie: e.target.checked ? "" : p.numeroSerie,
                      }))
                    }
                  />
                  <span>No quiero poner este dato</span>
                </label>
                <label className="equipo-field equipo-field--full">
                  <span>{tipoNegocioServicio?.etiquetaTrabajo || "Trabajo / falla reportada"}</span>
                  <textarea
                    value={equipoEdit.trabajo}
                    onChange={(e) =>
                      setEquipoEdit((p) => ({ ...p, trabajo: e.target.value }))
                    }
                  />
                </label>

                {camposTecnicosEdit.length > 0 && (
                  <div className="equipo-field equipo-field--full">
                    <span>Campos del servicio</span>
                    <div className="equipo-modal-grid equipo-modal-grid--embedded">
                      {camposTecnicosEdit.map((campo) => renderCampoTecnicoEdit(campo))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {modalPasoActual === "tecnico" && (
              <div className="equipo-modal-grid">
                {camposTecnicosEdit.length === 0 ? (
                  <div className="cfg-grid-empty">
                    Este servicio no tiene campos tecnicos adicionales para este tipo.
                  </div>
                ) : (
                  camposTecnicosEdit.map((campo) => renderCampoTecnicoEdit(campo))
                )}
              </div>
            )}

            {false && modalPasoActual === "tecnico" &&
              (tipoEquipoEdit === "laptop" || tipoEquipoEdit === "pc") && (
              <div className="equipo-modal-grid">
                <input
                  placeholder="Procesador"
                  value={equipoEdit.procesador}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({ ...p, procesador: e.target.value }))
                  }
                />
                <input
                  placeholder="RAM"
                  value={equipoEdit.ram}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({ ...p, ram: e.target.value }))
                  }
                />
                <input
                  placeholder="Disco"
                  value={equipoEdit.disco}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({ ...p, disco: e.target.value }))
                  }
                />
                <input
                  placeholder="Pantalla"
                  value={equipoEdit.estadoPantalla}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({
                      ...p,
                      estadoPantalla: e.target.value,
                    }))
                  }
                />
                <input
                  placeholder="Teclado"
                  value={equipoEdit.estadoTeclado}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({
                      ...p,
                      estadoTeclado: e.target.value,
                    }))
                  }
                />
                <input
                  placeholder="Mouse/Touchpad"
                  value={equipoEdit.estadoMouse}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({
                      ...p,
                      estadoMouse: e.target.value,
                    }))
                  }
                />
                <input
                  placeholder="Contrasena del equipo"
                  value={equipoEdit.contrasenaEquipo}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({
                      ...p,
                      contrasenaEquipo: e.target.value,
                    }))
                  }
                />
              </div>
            )}

            {false && modalPasoActual === "tecnico" && tipoEquipoEdit === "impresora" && (
              <div className="equipo-modal-grid">
                <input
                  placeholder="Tipo de impresora"
                  value={equipoEdit.tipoImpresora}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({
                      ...p,
                      tipoImpresora: e.target.value,
                    }))
                  }
                />
                <input
                  placeholder="Imprime (Sí/No)"
                  value={equipoEdit.imprime}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({ ...p, imprime: e.target.value }))
                  }
                />
                <textarea
                  placeholder="Condiciones físicas"
                  value={equipoEdit.condicionesImpresora}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({
                      ...p,
                      condicionesImpresora: e.target.value,
                    }))
                  }
                />
              </div>
            )}

            {false && modalPasoActual === "tecnico" && tipoEquipoEdit === "monitor" && (
              <div className="equipo-modal-grid">
                <input
                  placeholder="Tamaño del monitor"
                  value={equipoEdit.tamanoMonitor}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({
                      ...p,
                      tamanoMonitor: e.target.value,
                    }))
                  }
                />
                <input
                  placeholder="Colores (Sí/No)"
                  value={equipoEdit.colores}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({ ...p, colores: e.target.value }))
                  }
                />
                <textarea
                  placeholder="Condiciones físicas"
                  value={equipoEdit.condicionesMonitor}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({
                      ...p,
                      condicionesMonitor: e.target.value,
                    }))
                  }
                />
              </div>
            )}

            <div className="equipo-modal-actions">
              <button
                className="btn btn-ok"
                onClick={guardarCaracteristicasEquipoDynamic}
              >
                Guardar cambios
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setMostrarModalCaracteristicas(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




