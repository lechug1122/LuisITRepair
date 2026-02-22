// ServicioDetalle.jsx
// ✅ Fotos en Observaciones (varias)
// ✅ Lock si status = entregado/cancelado/no_reparable (confirmación + ya no modifica)
// ✅ Al generar boleta (PDF) guarda BD formaPago + items + total (y costo se actualiza)
// ❌ Eliminado: Hoja de servicio (imagen) + todo lo relacionado

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import QRCode from "react-qr-code";

import {
  buscarServicioPorFolio,
  actualizarServicioPorId,
} from "../js/services/servicios_firestore";
import { obtenerProductos } from "../js/services/POS_firebase";
import { STATUS } from "../js/utils/status_map";

import "../css/servicio_detalle.css";

// ✅ Storage (solo para fotos de observaciones)
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

/* =========================
   CONFIG
========================= */
const GOOGLE_SHEETS_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbwzaBlvaMtMlEfyvOHWORy46lm_lqt8xCAYNe-xxvZN41D9EXw3_UP7ZZGC-ZUNuIr1/exec";

const storage = getStorage();

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
  return new Date(ts.seconds * 1000).toLocaleString("es-MX");
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
  en_espera_de_refaccion: {
    pct: 40,
    theme: "normal",
    finalLabel: "Finalizado",
  },
  en_reparacion: { pct: 55, theme: "normal", finalLabel: "Finalizado" },
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
      descripcion: String(it.descripcion || "").trim(),
      pUnitario: num(it.pUnitario),
      cantidad: num(it.cantidad),
    }))
    .filter((it) => it.descripcion !== "");
}

/* =========================
   Upload helpers (solo obs fotos)
========================= */
async function uploadImageToStorage({ servicioId, folder, file }) {
  const ext = (file?.name || "").split(".").pop() || "jpg";
  const path = `servicios/${servicioId}/${folder}/${Date.now()}_${uid()}.${ext}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  return { url, path, name: file?.name || "" };
}

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
  const { folio } = useParams();
  const navigate = useNavigate();

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
  const [uploadingObs, setUploadingObs] = useState(false);
  const [mostrarModalCaracteristicas, setMostrarModalCaracteristicas] =
    useState(false);
  const [equipoEdit, setEquipoEdit] = useState(buildEquipoEdit(null));

  const locked = !!servicio?.locked || isFinalStatus(servicio?.status);

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
          setMostrarModalCaracteristicas(true);
        }

        setStatus(data?.status || "pendiente");
        setObservaciones(data?.observaciones || "");
        setFechaAprox(data?.fechaAprox || "");

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
              descripcion: it?.descripcion || "",
              pUnitario: it?.pUnitario ?? "",
              cantidad: it?.cantidad ?? 1,
            }));
            setItems(mapped);
          }
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

  const urlStatus = `${window.location.origin}/status/${folio}`;

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

  // =========================
  // Upload Observaciones fotos
  // =========================
  const onUploadObsFotos = async (files) => {
    if (!files?.length) return;
    if (!servicio?.id) return alert("❌ Falta ID del servicio.");
    if (locked) return alert("🔒 Servicio bloqueado. No se puede subir.");

    try {
      setUploadingObs(true);
      const list = Array.from(files);
      const uploaded = [];
      for (const f of list) {
        const up = await uploadImageToStorage({
          servicioId: servicio.id,
          folder: "observaciones_fotos",
          file: f,
        });
        uploaded.push(up);
      }
      setObsFotos((prev) => [...prev, ...uploaded]);
      alert("✅ Fotos subidas. (Se guardan al presionar 'Guardar cambios')");
    } catch (e) {
      console.error(e);
      alert(`❌ Error subiendo fotos: ${e?.message || e}`);
    } finally {
      setUploadingObs(false);
    }
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
  const nextStatus = status || "pendiente";
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
    const boletaGuardada = servicio?.boleta;

    const estaCobrado =
      boletaGuardada &&
      boletaGuardada.formaPago &&
      num(boletaGuardada.total) > 0;

    if (!estaCobrado) {
      if (!silent) {
        alert("❌ No puedes marcar como ENTREGADO hasta que esté COBRADO desde el Punto de Venta.");
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

    setPrecioFinal(
      String(
        actualizado?.costo ??
          (usarBoleta ? costoConBoleta : costoSinBoleta)
      )
    );

    if (!silent)
      alert("✅ Guardado completo (servicio + boleta + fotos).");

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

    const tipo = normalizarStatus(servicio?.tipoDispositivo);
    const patch = { caracteristicasPendientes: false };

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
    setServicio(actualizado);
    setMostrarModalCaracteristicas(false);
    alert("✅ Características actualizadas.");
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
                className={`badge badge-${normalizarStatus(status || "pendiente")}`}
              >
                {status || "pendiente"}
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
          <WizardProgress status={status} />

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <label>
              <b>Actualizar estado</b>
            </label>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={locked}
            >
              {STATUS.map((s, idx) => (
                <option key={`${s.key}-${s.label}-${idx}`} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>

            <label>
              <b>Fecha de entrega aproximada</b>
            </label>
            <input
              type="date"
              value={fechaAprox}
              onChange={(e) => setFechaAprox(e.target.value)}
              disabled={locked}
            />
            <div style={{ marginTop: 8 }}>
              <button
                className="btn btn-wa"
                onClick={() => abrirWhatsAppAviso(status)}
                disabled={locked}
                style={{ width: "100%", textAlign: "center" }}
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
                className="btn btn-wa"
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  marginTop: 12,
                  width: "100%",
                  textAlign: "center",
                  display: "inline-flex",
                  justifyContent: "center",
                }}
              >
                WhatsApp Cliente
              </a>
            ) : (
              <small style={{ opacity: 0.75, marginTop: 12, display: "block" }}>
                (Sin teléfono para WhatsApp)
              </small>
            )}

            <div style={{ marginTop: 12 }}>
              <b>QR estado:</b>
              <div style={{ marginTop: 8 }}>
                <QRCode value={urlStatus} size={110} />
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
          </div>

          <div className="box">
            <h3>Servicio</h3>
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
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                {obsFotos.map((f, idx) => (
                  <div
                    key={`${f.path || f.url}-${idx}`}
                    style={{
                      width: 140,
                      border: "1px solid rgba(0,0,0,.12)",
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <a href={f.url} target="_blank" rel="noreferrer">
                      <img
                        src={f.url}
                        alt="foto"
                        style={{
                          width: "100%",
                          height: 110,
                          objectFit: "cover",
                        }}
                      />
                    </a>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: 8,
                        gap: 8,
                      }}
                    >
                      <small
                        style={{
                          opacity: 0.8,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>Boleta de venta</h3>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontWeight: 800,
              }}
            >
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
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <div>
                  <label>
                    <b>Fecha boleta</b>
                  </label>
                  <input
                    type="date"
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
                  <div
                    style={{
                      height: 44,
                      display: "flex",
                      alignItems: "center",
                      fontWeight: 900,
                    }}
                  >
                    {money(totalBoleta)}
                  </div>
                </div>
              </div>

              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <div
                  style={{
                    marginBottom: 8,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <label style={{ margin: 0 }}>
                    <b>Escanear producto para boleta</b>
                  </label>
                  <input
                    placeholder="Escanea código y presiona Enter"
                    value={scanCode}
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key !== "Enter") return;
                      const termino = String(scanCode || "")
                        .trim()
                        .toLowerCase();
                      if (!termino) return;

                      const producto = productosDB.find(
                        (p) =>
                          String(p.codigo || "")
                            .trim()
                            .toLowerCase() === termino,
                      );

                      if (!producto) {
                        alert("Producto no encontrado en la base del POS");
                        return;
                      }

                      // Añadir como renglón a la boleta
                      setItems((prev) => [
                        ...prev,
                        {
                          id: uid(),
                          item: `P-${String(prev.length + 1).padStart(3, "0")}`,
                          descripcion:
                            producto.nombre ||
                            producto.nombreProducto ||
                            producto.descripcion ||
                            "",
                          pUnitario:
                            producto.precioVenta ?? producto.precio ?? 0,
                          cantidad: 1,
                        },
                      ]);

                      setScanCode("");
                    }}
                    style={{ height: 36, padding: "0 8px", borderRadius: 6 }}
                  />
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
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

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 12,
                }}
              >
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

      {mostrarModalCaracteristicas && (
        <div className="equipo-modal-overlay">
          <div className="equipo-modal">
            <h3>Completar características del equipo</h3>
            <p className="equipo-modal-alerta">
              Este servicio se registró con la opción de rellenar después.
              Completa los datos técnicos.
            </p>

            {(normalizarStatus(servicio?.tipoDispositivo) === "laptop" ||
              normalizarStatus(servicio?.tipoDispositivo) === "pc") && (
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
              </div>
            )}

            {normalizarStatus(servicio?.tipoDispositivo) === "impresora" && (
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

            {normalizarStatus(servicio?.tipoDispositivo) === "monitor" && (
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
                Guardar características
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
