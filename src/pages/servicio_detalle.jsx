// ServicioDetalle.jsx
// ✅ Fotos en Observaciones (varias)
// ✅ Lock si status = entregado/cancelado/no_reparable (confirmación + ya no modifica)
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
import { STATUS } from "../js/utils/status_map";

import "../css/servicio_detalle.css";

// ✅ Storage (solo para fotos de observaciones)
import {
  getStorage,
  ref as storageRef,
  deleteObject,
} from "firebase/storage";

/* =========================
   CONFIG
========================= */
const GOOGLE_SHEETS_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbwzaBlvaMtMlEfyvOHWORy46lm_lqt8xCAYNe-xxvZN41D9EXw3_UP7ZZGC-ZUNuIr1/exec";

const storage = getStorage();
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
  return s === "entregado" || s === "cancelado" || s === "no_reparable";
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

function formatFecha(ts) {
  if (!ts?.seconds) return "-";
  return new Date(ts.seconds * 1000).toLocaleDateString("es-MX");
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

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * ✅ PDF SIN CORS (abre webapp con payload)
 * NO tocamos correo/telefono (tu plantilla ya lo trae)
 */
function abrirPDFGoogleSheets({
  servicio,
  boletaFecha,
  boletaFormaPago,
  boletaNotas,
  items,
  folio,
}) {
  const payload = {
    folio: servicio?.folio || folio || "",
    nombre: servicio?.nombre || "",
    direccion: servicio?.direccion || "S/N",
    fecha: boletaFecha || "",
    formaPago: boletaFormaPago || "",
    notas: boletaNotas || "", // ✅ NOTAS RESPETADAS
    items: (items || []).map((it) => ({
      item: it?.item || "",
      descripcion: it?.descripcion || "",
      pUnitario: num(it?.pUnitario),
      cantidad: num(it?.cantidad),
    })),
  };

  const url = `${GOOGLE_SHEETS_WEBAPP_URL}?payload=${encodeURIComponent(
    JSON.stringify(payload),
  )}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/* =========================
   Wizard
========================= */
const PASOS_BASE = [
  { key: "pendiente", label: "Pendiente" },
  { key: "proceso", label: "En proceso" },
  { key: "final", label: "Finalizado" },
  { key: "entregado", label: "Entregado" },
];

const PROGRESO_POR_STATUS = {
  pendiente: { pct: 0, theme: "normal", finalLabel: "Finalizado" },
  revision: { pct: 30, theme: "normal", finalLabel: "Finalizado" },
  reparacion: { pct: 52, theme: "normal", finalLabel: "Finalizado" },
  en_reparacion: { pct: 52, theme: "normal", finalLabel: "Finalizado" },
  espera_refaccion: {
    pct: 40,
    theme: "normal",
    finalLabel: "Finalizado",
  },
  en_espera_de_refaccion: {
    pct: 40,
    theme: "normal",
    finalLabel: "Finalizado",
  },
  trabajando: { pct: 60, theme: "normal", finalLabel: "Finalizado" },
  listo: { pct: 85, theme: "normal", finalLabel: "Finalizado" },
  finalizado: { pct: 85, theme: "normal", finalLabel: "Finalizado" },
  entregado: { pct: 100, theme: "normal", finalLabel: "Finalizado" },
  cancelado: { pct: 100, theme: "danger", finalLabel: "Cancelado" },
  no_reparable: { pct: 100, theme: "muted", finalLabel: "No reparable" },
};

function getCfg(status) {
  const s = normalizarStatus(status);
  return (
    PROGRESO_POR_STATUS[s] || {
      pct: 0,
      theme: "normal",
      finalLabel: "Finalizado",
    }
  );
}

function WizardProgress({ status }) {
  const cfg = getCfg(status);

  const pasos = useMemo(() => {
    const copy = PASOS_BASE.map((p) => ({ ...p }));
    const idx = copy.findIndex((p) => p.key === "final");
    if (idx !== -1) copy[idx].label = cfg.finalLabel;
    return copy;
  }, [cfg.finalLabel]);

  let activeIndex = 0;
  if (cfg.pct >= 25) activeIndex = 1;
  if (cfg.pct >= 75) activeIndex = 2;
  if (cfg.pct >= 100) activeIndex = 3;

  const themeClass =
    cfg.theme === "danger"
      ? "wizard--danger"
      : cfg.theme === "muted"
        ? "wizard--muted"
        : "wizard--normal";

  return (
    <div
      className={`wizard-progress2 ${themeClass}`}
      style={{ ["--pct"]: `${cfg.pct}%` }}
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

/* =========================
   Upload helpers (solo obs fotos)
========================= */
async function tryDeleteFromStorage(path) {
  if (!path) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch {
    // no truena
  }
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

export default function ServicioDetalle() {
  const { folio: folioParam } = useParams();
  const navigate = useNavigate();
  const { rol } = useAutorizacionActual();
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
  const [equipoEdit, setEquipoEdit] = useState(buildEquipoEdit(null));
  const [modalPaso, setModalPaso] = useState(0);

  const locked = !!servicio?.locked || isFinalStatus(servicio?.status);
  const tipoEquipoEdit = normalizarStatus(
    equipoEdit?.tipoDispositivo || servicio?.tipoDispositivo,
  );
  const esAdmin = normalizarStatus(rol) === "administrador";
  const statusActual = statusValueFromRaw(status || servicio?.status || "pendiente");
  const statusMeta = STATUS.find((s) => s.value === statusActual);
  const statusLabel = statusMeta?.label || "Pendiente";

  const pasosModal = useMemo(() => {
    const base = [{ key: "general", label: "Datos generales" }];
    if (
      tipoEquipoEdit === "laptop" ||
      tipoEquipoEdit === "pc" ||
      tipoEquipoEdit === "impresora" ||
      tipoEquipoEdit === "monitor"
    ) {
      base.push({ key: "tecnico", label: "Datos tecnicos" });
    }
    return base;
  }, [tipoEquipoEdit]);

  const modalPasoActual = pasosModal[modalPaso]?.key || "general";

  useEffect(() => {
    if (modalPaso > pasosModal.length - 1) setModalPaso(0);
  }, [modalPaso, pasosModal.length]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const data = await buscarServicioPorFolio(folio);
        if (!alive) return;

        setServicio(data);
        setEquipoEdit(buildEquipoEdit(data));
        if (
          data &&
          !isFinalStatus(data?.status) &&
          tieneCaracteristicasPendientes(data)
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
          setPrecioFinal(String(data.costo));
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
    setEquipoEdit(buildEquipoEdit(servicio));
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

  const totalBoleta = useMemo(() => {
    return items.reduce(
      (acc, r) => acc + num(r.pUnitario) * num(r.cantidad),
      0,
    );
  }, [items]);

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

  const removeObsFoto = async (idx) => {
    if (locked) return;
    const foto = obsFotos[idx];
    if (!foto) return;
    if (!confirm("¿Quitar esta foto?")) return;
    setObsFotos((prev) => prev.filter((_, i) => i !== idx));
    await tryDeleteFromStorage(foto.path);
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

  const costoSinBoleta = num(precioFinal);
  const costoConBoleta = totalBoleta;
  const nextStatus = statusValueFromRaw(status);
  const pidePrecio = requierePrecioFinal(nextStatus);

  // ===============================
  // VALIDACIONES NORMALES
  // ===============================

  if (!usarBoleta) {
    if (pidePrecio && (!costoSinBoleta || costoSinBoleta <= 0)) {
      if (!silent)
        alert("⚠️ Captura un Precio final válido (mayor a 0) o activa Boleta.");
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

  if (normalizarStatus(nextStatus) === "entregado") {
    const estaCobradoEnPOS = !!servicio?.cobradoEnPOS;
    if (!estaCobradoEnPOS) {
      if (!silent) {
        alert("No puedes marcar como ENTREGADO hasta que el servicio sea cobrado en POS/Ventas.");
      }
      return false;
    }
  }

  const willLock = isFinalStatus(nextStatus);

  if (willLock) {
    const ok = confirm(
      `⚠️ Vas a marcar el servicio como "${nextStatus}".\n\nEsto lo CERRARÁ y YA NO se podrá modificar.\n\n¿Confirmas?`
    );
    if (!ok) return false;
  }

  const costoGuardar = usarBoleta
    ? costoConBoleta
    : costoSinBoleta > 0
    ? costoSinBoleta
    : servicio?.costo || "";

  const patch = {
    status: nextStatus,
    fechaAprox: fechaAprox || "",
    observaciones: observaciones || "",
    ...(esAdmin ? { notaAdmin: String(notaAdminEdit || "").trim() } : {}),

    precioDespues: false,
    costo: costoGuardar,

    observacionesFotos: obsFotos || [],

    ...(usarBoleta
      ? {
          boleta: {
            fecha: boletaFecha || "",
            formaPago: boletaFormaPago || "",
            notas: boletaNotas || "",
            items: limpiarBoletaItems(items),
            total: costoConBoleta,
          },
        }
      : { boleta: null }),

    ...(willLock
      ? {
          locked: true,
          lockedReason: normalizarStatus(nextStatus),
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
        actualizado?.costo ??
          (usarBoleta ? costoConBoleta : costoSinBoleta)
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
    setEquipoEdit(buildEquipoEdit(actualizado));
    setMostrarModalCaracteristicas(false);
  };

  // ✅ Generar PDF: primero guarda boleta y luego abre PDF
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

      abrirPDFGoogleSheets({
        servicio,
        boletaFecha,
        boletaFormaPago,
        boletaNotas,
        items,
        folio,
      });
    } finally {
      setExportingPdf(false);
    }
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
            <small>
              Folio: <b>{servicio.folio}</b> · Estado:{" "}
              <span
                className={`badge badge-${normalizarStatus(statusActual)}`}
              >
                {statusLabel}
              </span>
              {locked && (
                <span style={{ marginLeft: 10, fontWeight: 900 }}>
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
            <p>
              <b>Tipo:</b> {servicio.tipoDispositivo || "-"}
            </p>
            <p>
              <b>Marca:</b> {servicio.marca || "-"}
            </p>
            <p>
              <b>Modelo:</b> {servicio.modelo || "-"}
            </p>
            <p>
              <b>No. de serie:</b>{" "}
              {servicio.omitirNumeroSerie
                ? "No proporcionado"
                : servicio.numeroSerie || "-"}
            </p>
            <p>
              <b>Contrasena del equipo:</b>{" "}
              {servicio?.laptopPc?.contrasenaEquipo || "-"}
            </p>
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

          <div style={{ marginTop: 12 }}>
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}></div>

            {obsFotos?.length > 0 && (
              <div className="obs-fotos-grid">
                {obsFotos.map((f, idx) => (
                  <div key={`${f.path || f.url}-${idx}`} className="obs-foto-item">
                    <a href={f.url} target="_blank" rel="noreferrer">
                      <img
                        src={f.url}
                        alt="foto"
                        className="obs-foto-img"
                      />
                    </a>
                    <div className="obs-foto-foot">
                      <small className="obs-foto-name">
                        {f.name || "foto"}
                      </small>
                      {!locked && (
                        <button
                          className="btn btn-danger"
                          onClick={() => removeObsFoto(idx)}
                          title="Quitar"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
            </div>
          )}

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
                    {money(totalBoleta)}
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
                        TOTAL:
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
                    : "Generar PDF (Plantilla)"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ✅ BOTÓN ÚNICO HASTA ABAJO */}
        <div className="box full" style={{ marginTop: 14 }}>
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

            <div className="equipo-carousel-head">
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
            </div>

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
                <span>Tipo de dispositivo</span>
                <select
                  value={equipoEdit.tipoDispositivo}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({
                      ...p,
                      tipoDispositivo: e.target.value,
                    }))
                  }
                >
                  <option value="laptop">Laptop</option>
                  <option value="pc">Computadora de Escritorio</option>
                  <option value="impresora">Impresora</option>
                  <option value="monitor">Monitor</option>
                </select>
              </label>
              <label className="equipo-field">
                <span>Marca</span>
                <input
                  value={equipoEdit.marca}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({ ...p, marca: e.target.value }))
                  }
                />
              </label>
              <label className="equipo-field">
                <span>Modelo</span>
                <input
                  value={equipoEdit.modelo}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({ ...p, modelo: e.target.value }))
                  }
                />
              </label>
              <label className="equipo-field">
                <span>No. de serie</span>
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
                <span>No quiero poner el numero de serie</span>
              </label>
              <label className="equipo-field equipo-field--full">
                <span>Trabajo / falla reportada</span>
                <textarea
                  value={equipoEdit.trabajo}
                  onChange={(e) =>
                    setEquipoEdit((p) => ({ ...p, trabajo: e.target.value }))
                  }
                />
              </label>
              </div>
            )}

            {modalPasoActual === "tecnico" &&
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

            {modalPasoActual === "tecnico" && tipoEquipoEdit === "impresora" && (
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

            {modalPasoActual === "tecnico" && tipoEquipoEdit === "monitor" && (
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
                onClick={guardarCaracteristicasEquipo}
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




