import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import Calendar from "react-calendar";
import { FiBarChart2, FiChevronDown, FiFileText } from "react-icons/fi";
import "react-calendar/dist/Calendar.css";
import Layout from "../components/Layout";
import { getDocs } from "firebase/firestore";
import { auth } from "../initializer/firebase";
import { generarPdfCorteCajaDia } from "../js/services/pdf_corte_caja";
import {
  cerrarCajaHoy,
  obtenerCorteCajaDia,
  listarCortesCaja,
} from "../js/services/corte_caja_firestore";
import {
  guardarEgreso,
  obtenerEgresosDia,
  eliminarEgreso,
  actualizarEgreso,
} from "../js/services/egresos_firestore";
import { APARIENCIA_EVENT, readAparienciaConfigStorage } from "../js/services/apariencia_config";
import { filterItemsByTenant, getTenantCollectionQuery } from "../js/services/tenant";
import ModalEgresos from "../components/modal_egresos";
import { imprimirTicketVenta, visualizarTicketVenta } from "../components/print_ticket_venta";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { obtenerEfectivoNetoVenta } from "../js/services/efectivo_venta";
import { generarExcelFacturaGlobal, generarExcelReporteNegocio } from "../js/services/excel_reporte_negocio";
import "../css/reportes.css";

const money = (value) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const CHART_BAR_COLORS = [
  "#0f766e",
  "#2563eb",
  "#9333ea",
  "#f59e0b",
  "#dc2626",
  "#0891b2",
  "#7c3aed",
  "#ea580c",
  "#16a34a",
  "#e11d48",
];

const PIE_COLORS = ["#16a34a", "#2563eb", "#9333ea", "#f59e0b"];

const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const getChartItemColor = (index) => CHART_BAR_COLORS[index % CHART_BAR_COLORS.length];

const getProductoNombre = (producto) => String(producto?.nombre || "").trim() || "Sin nombre";

const isServicioProducto = (producto) => {
  const tipo = normalizeSearchText(producto?.tipo);
  const nombre = normalizeSearchText(producto?.nombre);
  return (
    tipo === "servicio" ||
    ["lap", "laptop", "computadora", "impresora", "reparacion", "servicio"].some((keyword) =>
      nombre.includes(keyword)
    )
  );
};

const getServicioClienteLabel = (venta, producto) => {
  const clienteEnNombre = getProductoNombre(producto)
    .split(" - ")
    .slice(1)
    .join(" - ")
    .trim();

  return (
    clienteEnNombre ||
    String(venta?.clienteNombre || "").trim() ||
    String(venta?.clienteTelefono || "").trim() ||
    "Cliente no identificado"
  );
};

const getServicioDisplayName = (producto) => {
  const folio = String(producto?.servicioFolio || producto?.codigo || "").trim();
  if (folio) return `Servicio ${folio}`;
  return getProductoNombre(producto);
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ymd = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatChartDateTick = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
};

const getCajeroDisplayName = (corte, empleadosNombreIndex = null) => {
  const nombre = String(corte?.cajero?.nombre || "").trim();
  if (nombre) return nombre;

  const uid = String(corte?.cajero?.uid || "").trim();
  if (uid && empleadosNombreIndex?.byUid?.[uid]) {
    return empleadosNombreIndex.byUid[uid];
  }

  const correo = String(corte?.cajero?.email || "").trim().toLowerCase();
  if (correo && empleadosNombreIndex?.byEmail?.[correo]) {
    return empleadosNombreIndex.byEmail[correo];
  }

  return "Cajero sin nombre";
};

const getCorteHoraLabel = (corte) => {
  const fecha = toDate(corte?.cerradoEn || corte?.aperturaEn);
  if (!fecha) return "Hora no disponible";
  return fecha.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getDiferenciaTone = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount === 0) return "neutral";
  return amount > 0 ? "positive" : "negative";
};

const getVentaServicioItem = (venta) =>
  Array.isArray(venta?.productos) ? venta.productos.find((item) => item?.esServicio) : null;

const getVentaClienteTicketData = (venta) => {
  const servicioItem = getVentaServicioItem(venta);
  const nombreDesdeServicio = String(servicioItem?.nombre || "")
    .split(" - ")
    .slice(1)
    .join(" - ")
    .trim();

  return {
    nombre: String(venta?.clienteNombre || "").trim() || nombreDesdeServicio || "Publico general",
    telefono: String(venta?.clienteTelefono || "").trim() || "-",
  };
};

const getVentaAtendioLabel = (venta, empleadosNombreIndex = null) => {
  const stored = String(venta?.atendio || venta?.atendidoPor || "").trim();
  if (stored) return stored;

  const actorEmail = String(venta?.actorEmail || "").trim().toLowerCase();
  if (actorEmail && empleadosNombreIndex?.byEmail?.[actorEmail]) {
    return empleadosNombreIndex.byEmail[actorEmail];
  }

  return "Sin asignar";
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

const DENOMINACIONES = [
  1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5,
];

const TIPO_EGRESO_META = {
  factura: { label: "Factura", emoji: "\u{1F9FE}" },
  boleta_venta: { label: "Boleta de venta", emoji: "\u{1F6D2}" },
  nota_credito: { label: "Nota de credito", emoji: "\u{2795}" },
  nota_debito: { label: "Nota de debito", emoji: "\u{2796}" },
  otro: { label: "Otro", emoji: "\u{1F4DD}" },
};

export default function Reportes() {
  const { empresa, serviciosHabilitados } = useEmpresaConfig();
  const [ventas, setVentas] = useState([]);
  const [cuentasPorCobrar, setCuentasPorCobrar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generandoExcel, setGenerandoExcel] = useState("");
  const [cerrandoCaja, setCerrandoCaja] = useState(false);
  const [cajaCerradaHoy, setCajaCerradaHoy] = useState(false);
  const [mostrarModalCierre, setMostrarModalCierre] = useState(false);
  const [corteHoyDetalle, setCorteHoyDetalle] = useState(null);
  const [fondoInicialCaja, setFondoInicialCaja] = useState("");
  const [denominaciones, setDenominaciones] = useState({});
  const [notasCorte, setNotasCorte] = useState("");
  const [descuadreConfirmado, setDescuadreConfirmado] = useState(false);
  const [cortesHistorial, setCortesHistorial] = useState([]);
  const [filtroCajero, setFiltroCajero] = useState("");
  const [fechaCorteDesde, setFechaCorteDesde] = useState("");
  const [fechaCorteHasta, setFechaCorteHasta] = useState("");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return ymd(d);
  });
  const [fechaHasta, setFechaHasta] = useState(() => ymd(new Date()));
  const [mostrarModalEgresos, setMostrarModalEgresos] = useState(false);
  const [egresos, setEgresos] = useState([]);
  const [empleadosNombreIndex, setEmpleadosNombreIndex] = useState({ byUid: {}, byEmail: {} });
  const [expandedChartDetails, setExpandedChartDetails] = useState({});
  const [chartProductVisibility, setChartProductVisibility] = useState({});
  const [activeBottomSection, setActiveBottomSection] = useState("historial");
  const [animationsEnabled, setAnimationsEnabled] = useState(
    () => readAparienciaConfigStorage().animations !== false,
  );
  const [isDarkMode, setIsDarkMode] = useState(
    () => readAparienciaConfigStorage().themeMode === "oscuro",
  );

  // Estados para calendario y filtros visuales
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [fijarCalendario, setFijarCalendario] = useState(() => {
    try {
      return localStorage.getItem("reportes_calendar_pinned") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const bootstrapReportes = async () => {
      await Promise.allSettled([
        obtenerVentas(),
        cargarEstadoCorteHoy(),
        cargarHistorialCortes(),
        cargarEgresosDia(),
        cargarNombresEmpleados(),
        cargarCuentasPorCobrar(),
      ]);
    };

    bootstrapReportes().catch((error) => {
      console.warn("[reportes] No se pudo completar la carga inicial:", error?.code || error);
    });
  }, []);

  const cargarCuentasPorCobrar = async () => {
    const snapshot = await getDocs(getTenantCollectionQuery("fiados"));
    setCuentasPorCobrar(filterItemsByTenant(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  };

  useEffect(() => {
    try {
      localStorage.setItem("reportes_calendar_pinned", fijarCalendario ? "1" : "0");
    } catch (e) {
      console.error("Error saving calendar state:", e);
    }
  }, [fijarCalendario]);

  useEffect(() => {
    const onAparienciaChange = (event) => {
      const next = event?.detail || readAparienciaConfigStorage();
      setAnimationsEnabled(next?.animations !== false);
      setIsDarkMode(next?.themeMode === "oscuro");
    };

    window.addEventListener(APARIENCIA_EVENT, onAparienciaChange);
    return () => window.removeEventListener(APARIENCIA_EVENT, onAparienciaChange);
  }, []);

  const cambiarFecchaAlSeleccionarDia = (fecha) => {
    const f = ymd(fecha);
    setFechaDesde(f);
    setFechaHasta(f);
    setSelectedDate(fecha);
  };

  const toggleFijarCalendario = () => {
    setFijarCalendario((prev) => {
      const next = !prev;
      if (next) setMostrarCalendario(true);
      return next;
    });
  };

  const cargarEstadoCorteHoy = async () => {
    try {
      const corte = await obtenerCorteCajaDia();
      setCajaCerradaHoy(!!(corte && corte.cerrado));
      setCorteHoyDetalle(corte || null);
      if (corte?.fondoInicialCaja !== undefined && corte?.fondoInicialCaja !== null) {
        setFondoInicialCaja(String(corte.fondoInicialCaja));
      }
      if (Array.isArray(corte?.denominaciones)) {
        const map = {};
        corte.denominaciones.forEach((d) => {
          map[String(d.valor)] = Number(d.cantidad || 0);
        });
        setDenominaciones(map);
      }
      if (corte?.notasCorte) setNotasCorte(String(corte.notasCorte));
    } catch (error) {
      console.error("Error cargando estado de corte:", error);
      setCajaCerradaHoy(false);
      setCorteHoyDetalle(null);
    }
  };

  const cargarHistorialCortes = async () => {
    try {
      const data = await listarCortesCaja();
      setCortesHistorial(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error cargando historial de cortes:", error);
      setCortesHistorial([]);
    }
  };

  const cargarNombresEmpleados = async () => {
    try {
      const snapshot = await getDocs(getTenantCollectionQuery("empleados"));
      const byUid = {};
      const byEmail = {};

      filterItemsByTenant(snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))).forEach((data) => {
        const nombre = String(data?.nombre || "").trim();
        const uid = String(data?.uid || "").trim();
        const correo = String(data?.correo || data?.email || "").trim().toLowerCase();

        if (!nombre) return;
        if (uid) byUid[uid] = nombre;
        if (correo) byEmail[correo] = nombre;
      });

      setEmpleadosNombreIndex({ byUid, byEmail });
    } catch (err) {
      console.error("Error cargando nombres de empleados:", err);
    }
  };

  const cargarEgresosDia = async () => {
    try {
      const datos = await obtenerEgresosDia();
      setEgresos(Array.isArray(datos?.egresos) ? datos.egresos : []);
    } catch (err) {
      console.error("Error cargando egresos:", err);
    }
  };

  const handleAgregarEgreso = async (egreso) => {
    if (cajaCerradaHoy) {
      alert("La caja de hoy ya esta cerrada. No se pueden registrar egresos.");
      return;
    }
    try {
      await guardarEgreso({
        ...egreso,
        usuario: auth.currentUser?.email || "sin_usuario",
      });
      await cargarEgresosDia();
    } catch (err) {
      console.error("Error agregando egreso:", err);
      alert("No se pudo agregar el egreso");
    }
  };

  const handleEliminarEgreso = async (egresoId) => {
    if (cajaCerradaHoy) {
      alert("La caja de hoy ya esta cerrada. No se pueden modificar egresos.");
      return;
    }
    if (!confirm("¿Confirmas que quieres eliminar este egreso?")) return;
    try {
      await eliminarEgreso(egresoId);
      await cargarEgresosDia();
    } catch (err) {
      console.error("Error eliminando egreso:", err);
      alert("No se pudo eliminar el egreso");
    }
  };

  const handleEditarEgreso = async (egresoId, actualizacion) => {
    if (cajaCerradaHoy) {
      alert("La caja de hoy ya esta cerrada. No se pueden modificar egresos.");
      return;
    }
    try {
      await actualizarEgreso(egresoId, actualizacion);
      await cargarEgresosDia();
    } catch (err) {
      console.error("Error editando egreso:", err);
      alert("No se pudo editar el egreso");
    }
  };

  const obtenerVentas = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(getTenantCollectionQuery("ventas"));
      const lista = filterItemsByTenant(querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })));
      setVentas(lista);
    } catch (error) {
      console.error("Error cargando ventas:", error);
      setVentas([]);
    } finally {
      setLoading(false);
    }
  };

  const totalEgresos = useMemo(() => {
    return egresos.reduce((acc, e) => acc + Number(e.monto || 0), 0);
  }, [egresos]);

  const currentCajeroNombre = useMemo(() => {
    const uid = String(auth.currentUser?.uid || "").trim();
    const correo = String(auth.currentUser?.email || "").trim().toLowerCase();

    return (
      (uid ? empleadosNombreIndex.byUid?.[uid] : "") ||
      (correo ? empleadosNombreIndex.byEmail?.[correo] : "") ||
      String(auth.currentUser?.displayName || "").trim()
    );
  }, [empleadosNombreIndex]);

  const updateDenominacion = (valor, cantidad) => {
    const key = String(valor);
    setDescuadreConfirmado(false);
    setDenominaciones((prev) => ({
      ...prev,
      [key]: Math.max(0, Number(cantidad || 0)),
    }));
  };

  const buildVentaTicketPayload = (venta) => {
    const detalle = venta?.pagoDetalle || {};
    const servicioItem = getVentaServicioItem(venta);

    return {
      ventaId: String(venta?.folioTicket || venta?.id || "-"),
      fecha: toDate(venta?.fecha) || new Date(),
      atendio: getVentaAtendioLabel(venta, empleadosNombreIndex),
      cliente: getVentaClienteTicketData(venta),
      tipoPago: String(venta?.tipoPago || "efectivo").trim().toLowerCase(),
      referenciaTarjeta:
        String(detalle?.referenciaTarjeta || venta?.referenciaTarjeta || "").trim(),
      productos: Array.isArray(venta?.productos) ? venta.productos : [],
      estado: servicioItem ? "Entregado" : "Pagado",
      subtotal: Number(venta?.subtotal || 0),
      aplicaIVA: venta?.aplicarIVA !== false,
      ivaPorcentaje: Number(venta?.ivaPorcentaje || 0.16),
      iva: Number(venta?.iva || 0),
      ieps: Number(venta?.ieps || 0),
      total: Number(venta?.total || 0),
      montoRecibido: Number(detalle?.efectivo || 0),
      cambio: Number(detalle?.cambio || 0),
      preciosIncluyenImpuestos: venta?.preciosIncluyenImpuestos === true,
    };
  };

  const handleVisualizarVentaTicket = async (venta) => {
    try {
      await visualizarTicketVenta(buildVentaTicketPayload(venta));
    } catch (error) {
      console.error("Error visualizando ticket:", error);
      alert("No se pudo visualizar el ticket.");
    }
  };

  const handleReimprimirVentaTicket = async (venta) => {
    try {
      await imprimirTicketVenta(buildVentaTicketPayload(venta));
    } catch (error) {
      console.error("Error reimprimiendo ticket:", error);
      alert("No se pudo reimprimir el ticket.");
    }
  };

  const generarReporteFacturaGlobal = async () => {
    const fechaBase = fechaHasta ? new Date(`${fechaHasta}T12:00:00`) : new Date();
    const year = fechaBase.getFullYear();
    const month = fechaBase.getMonth();
    const ventasMes = ventas
      .filter((venta) => {
        const fecha = toDate(venta?.fecha);
        return fecha && fecha.getFullYear() === year && fecha.getMonth() === month;
      })
      .sort((a, b) => (toDate(a?.fecha)?.getTime() || 0) - (toDate(b?.fecha)?.getTime() || 0));

    if (ventasMes.length === 0) {
      alert("No hay ventas registradas en el mes seleccionado.");
      return;
    }

    try {
      setGenerandoExcel("factura");
      await generarExcelFacturaGlobal({ empresa, ventas: ventasMes, fechaBase });
    } catch (error) {
      console.error("No se pudo generar el reporte para factura global:", error);
      alert("No se pudo generar el reporte para factura global.");
    } finally {
      setGenerandoExcel("");
    }
  };

  const handleGenerarExcel = async () => {
    if (generandoExcel) return;
    if (!ventasFiltradas.length) {
      alert("No hay ventas en el periodo seleccionado para generar el reporte.");
      return;
    }
    try {
      setGenerandoExcel("ejecutivo");
      await generarExcelReporteNegocio({ empresa, ventas: ventasFiltradas, fechaDesde, fechaHasta });
    } catch (error) {
      console.error("No se pudo generar el reporte de Excel:", error);
      alert("No se pudo generar el reporte de Excel. Intenta nuevamente.");
    } finally {
      setGenerandoExcel("");
    }
  };

  const handleCorteCaja = async () => {
    if (cerrandoCaja) return;
    if (!fondoInicialValido) {
      alert("Captura un fondo inicial valido (0 o mayor) antes de cerrar.");
      return;
    }
    if (hayDescuadre && (!descuadreConfirmado || !notasCorte.trim())) {
      alert(
        "El efectivo contado no coincide con el esperado. Para cerrar con un descuadre, confirma el faltante o sobrante y documenta el motivo en Notas del corte.",
      );
      return;
    }

    try {
      setCerrandoCaja(true);
      const res = await cerrarCajaHoy(ventas, {
        efectivoContado: Number(totalDenominaciones || 0),
        fondoInicialCaja: Number(fondoInicialNum || 0),
        denominaciones: DENOMINACIONES.map((valor) => ({
          valor,
          cantidad: Number(denominaciones[String(valor)] || 0),
        })),
        retiros: [],
        egresos: egresosValidos,
        cajero: {
          uid: auth.currentUser?.uid || "",
          email: auth.currentUser?.email || "",
          nombre: currentCajeroNombre || "",
        },
        notasCorte,
        permitirDescuadre: descuadreConfirmado,
      });
      setCajaCerradaHoy(true);
      setCorteHoyDetalle(res.corte || null);
      await cargarHistorialCortes();

      if (res.yaCerrado) {
        alert("La caja de hoy ya estaba cerrada. Se descargara el PDF del corte.");
      } else {
        alert("Caja cerrada correctamente. No se podran registrar mas ventas hoy.");
      }

      await generarPdfCorteCajaDia(ventas, {
        corte: res.corte || null,
        fechaKey: res?.corte?.fechaKey || ymd(new Date()),
        cuentasPorCobrar,
      });
      setMostrarModalCierre(false);
    } catch (err) {
      console.error("Error cerrando caja:", err);
      alert("No se pudo cerrar la caja.");
    } finally {
      setCerrandoCaja(false);
    }
  };

  const handleBotonCorte = async () => {
    if (cajaCerradaHoy) {
      await generarPdfCorteCajaDia(ventas, {
        corte: corteHoyDetalle || null,
        fechaKey: ymd(new Date()),
        cuentasPorCobrar,
      });
      return;
    }
    // Sincroniza egresos del dia antes de abrir el modal de cierre.
    await cargarEgresosDia();
    setDescuadreConfirmado(false);
    setMostrarModalCierre(true);
  };

  const handleDescargarCorteHistorial = async (corte) => {
    const key = String(corte?.fechaKey || "");
    if (!key) return;
    const ventasDia = ventas.filter((v) => {
      const fecha = toDate(v.fecha);
      return fecha && ymd(fecha) === key;
    });
    await generarPdfCorteCajaDia(ventasDia, {
      corte: corte || null,
      fechaKey: key,
      cuentasPorCobrar,
    });
  };

  const ventasFiltradas = useMemo(() => {
    const desde = fechaDesde ? new Date(`${fechaDesde}T00:00:00`) : null;
    const hasta = fechaHasta ? new Date(`${fechaHasta}T23:59:59`) : null;
    const txt = filtroTexto.trim().toLowerCase();

    return ventas.filter((v) => {
      const fecha = toDate(v.fecha);
      if (!fecha) return false;
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;

      if (!txt) return true;
      const id = String(v.id || "").toLowerCase();
      const tipo = String(v.tipoPago || "").toLowerCase();
      const productos = (v.productos || []).map((p) => String(p?.nombre || "").toLowerCase()).join(" ");
      return id.includes(txt) || tipo.includes(txt) || productos.includes(txt);
    });
  }, [ventas, fechaDesde, fechaHasta, filtroTexto]);

  const kpis = useMemo(() => {
    const total = ventasFiltradas.reduce((acc, v) => acc + Number(v.total || 0), 0);
    const tickets = ventasFiltradas.length;
    const promedio = tickets > 0 ? total / tickets : 0;

    const hoyIni = startOfToday();
    const hoyFin = endOfToday();
    const ventasHoy = ventas.filter((v) => {
      const f = toDate(v.fecha);
      return f && f >= hoyIni && f <= hoyFin;
    });
    const totalHoy = ventasHoy.reduce((acc, v) => acc + Number(v.total || 0), 0);

    let unidades = 0;
    let servicios = 0;
    ventasFiltradas.forEach((v) => {
      (v.productos || []).forEach((p) => {
        const cantidad = Number(p?.cantidad || 0);
        unidades += cantidad;
        if (p?.esServicio || isServicioProducto(p)) {
          servicios += cantidad;
        }
      });
    });

    const iva = ventasFiltradas.reduce((acc, v) => acc + Number(v.iva || 0), 0);
    return { total, tickets, promedio, totalHoy, unidades, servicios, iva };
  }, [ventas, ventasFiltradas]);

  const totalDescuentosPeriodo = ventasFiltradas.reduce((total, venta) => total + Number(venta?.descuentoManual || 0) + Number(venta?.descuentoRegla || 0) + Number(venta?.descuentoPuntos || 0), 0);
  const totalFiadoPeriodo = ventasFiltradas.filter((venta) => String(venta?.tipoPago || "").toLowerCase() === "fiado").reduce((total, venta) => total + Number(venta?.total || 0), 0);

  const ventasPorDia = useMemo(() => {
    const map = new Map();
    ventasFiltradas.forEach((v) => {
      const f = toDate(v.fecha);
      if (!f) return;
      const key = ymd(f);
      const curr = map.get(key) || 0;
      map.set(key, curr + Number(v.total || 0));
    });

    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([fecha, total]) => ({ fecha, total: Number(total.toFixed(2)) }));
  }, [ventasFiltradas]);

  const _topProductos = useMemo(() => {
    const map = new Map();
    ventasFiltradas.forEach((v) => {
      (v.productos || []).forEach((p) => {
        // Detectar si es un servicio
        const esServicio = p?.tipo?.toLowerCase() === "servicio" || 
                          ["lap", "laptop", "computadora", "impresora", "reparación", "servicio"].some(
                            (s) => String(p?.nombre || "").toLowerCase().includes(s)
                          );
        
        const nombre = esServicio ? `🔧 Servicios` : (p?.nombre || "Sin nombre");
        const cantidad = Number(p?.cantidad || 0);
        const importe = Number(p?.precioVenta || 0) * cantidad;
        const curr = map.get(nombre) || { cantidad: 0, importe: 0 };
        map.set(nombre, {
          cantidad: curr.cantidad + cantidad,
          importe: curr.importe + importe,
        });
      });
    });

    return [...map.entries()]
      .map(([nombre, val]) => ({ nombre, ...val }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);
  }, [ventasFiltradas]);

  const _utilidadPorProducto = useMemo(() => {
    const map = new Map();
    ventasFiltradas.forEach((v) => {
      (v.productos || []).forEach((p) => {
        const nombre = p?.nombre || "Sin nombre";
        const cantidad = Number(p?.cantidad || 0);
        const venta = Number(p?.precioVenta || 0);
        const compra = Number(p?.precioCompra || 0);
        const utilidad = (venta - compra) * cantidad;
        const curr = map.get(nombre) || 0;
        map.set(nombre, curr + utilidad);
      });
    });

    return [...map.entries()]
      .map(([nombre, utilidad]) => ({ nombre, utilidad: Number(utilidad.toFixed(2)) }))
      .sort((a, b) => b.utilidad - a.utilidad)
      .slice(0, 10);
  }, [ventasFiltradas]);

  const topProductosChart = useMemo(() => {
    const map = new Map();
    ventasFiltradas.forEach((v) => {
      (v.productos || []).forEach((p) => {
        const cantidad = Number(p?.cantidad || 0);
        const importe = Number(p?.precioVenta || 0) * cantidad;
        const esServicio = p?.esServicio || isServicioProducto(p);
        const nombre = esServicio ? "Servicios" : getProductoNombre(p);
        const tipo = esServicio ? "Servicio" : "Producto";
        const key = `${tipo}:${nombre}`;
        const detalleNombre = esServicio ? getServicioDisplayName(p) : null;
        const curr = map.get(key) || {
          nombre,
          tipo,
          cantidad: 0,
          importe: 0,
          detallesMap: new Map(),
        };

        if (detalleNombre) {
          const detalleActual = curr.detallesMap.get(detalleNombre) || {
            nombre: detalleNombre,
            cantidad: 0,
            importe: 0,
          };
          curr.detallesMap.set(detalleNombre, {
            ...detalleActual,
            cantidad: detalleActual.cantidad + cantidad,
            importe: detalleActual.importe + importe,
          });
        }

        map.set(key, {
          ...curr,
          cantidad: curr.cantidad + cantidad,
          importe: curr.importe + importe,
        });
      });
    });

    return [...map.values()]
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10)
      .map((item, index) => ({
        ...item,
        color: getChartItemColor(index),
        detalles: [...(item.detallesMap?.values() || [])]
          .sort((a, b) => b.cantidad - a.cantidad)
          .slice(0, 10),
      }));
  }, [ventasFiltradas]);

  const utilidadPorProductoChart = useMemo(() => {
    const map = new Map();
    ventasFiltradas.forEach((v) => {
      (v.productos || []).forEach((p) => {
        const cantidad = Number(p?.cantidad || 0);
        const venta = Number(p?.precioVenta || 0);
        const compra = Number(p?.precioCompra || 0);
        const utilidad = (venta - compra) * cantidad;
        const esServicio = p?.esServicio || isServicioProducto(p);
        const nombre = esServicio ? "Servicios" : getProductoNombre(p);
        const tipo = esServicio ? "Servicio" : "Producto";
        const key = `${tipo}:${nombre}`;
        const detalleNombre = esServicio ? getServicioDisplayName(p) : null;
        const curr = map.get(key) || {
          nombre,
          tipo,
          utilidad: 0,
          detallesMap: new Map(),
        };

        if (detalleNombre) {
          const detalleActual = curr.detallesMap.get(detalleNombre) || {
            nombre: detalleNombre,
            utilidad: 0,
          };
          curr.detallesMap.set(detalleNombre, {
            ...detalleActual,
            utilidad: detalleActual.utilidad + utilidad,
          });
        }

        map.set(key, {
          ...curr,
          utilidad: curr.utilidad + utilidad,
        });
      });
    });

    return [...map.values()]
      .map((item) => ({
        ...item,
        utilidad: Number(item.utilidad.toFixed(2)),
        detalles: [...(item.detallesMap?.values() || [])]
          .map((detalle) => ({
            ...detalle,
            utilidad: Number(detalle.utilidad.toFixed(2)),
          }))
          .sort((a, b) => b.utilidad - a.utilidad)
          .slice(0, 10),
      }))
      .sort((a, b) => b.utilidad - a.utilidad)
      .slice(0, 10)
      .map((item, index) => ({ ...item, color: getChartItemColor(index) }));
  }, [ventasFiltradas]);

  const serviciosRealizados = useMemo(() => {
    const items = [];

    ventasFiltradas.forEach((v) => {
      const fecha = toDate(v.fecha);

      (v.productos || []).forEach((p, index) => {
        if (!(p?.esServicio || isServicioProducto(p))) return;

        const cantidad = Math.max(1, Number(p?.cantidad || 1));
        items.push({
          id: `${v.id || "venta"}-${p?.servicioId || p?.servicioFolio || index}`,
          fecha,
          fechaTexto: fecha?.toLocaleString("es-MX") || "-",
          servicio: getServicioDisplayName(p),
          folio: String(p?.servicioFolio || p?.codigo || "-").trim() || "-",
          cliente: getServicioClienteLabel(v, p),
          ventaId: String(v?.id || "-"),
          venta: v,
          metodo: String(v?.tipoPago || "-").trim() || "-",
          cantidad,
          monto: Number(p?.precioVenta || 0) * cantidad,
        });
      });
    });

    return items.sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0));
  }, [ventasFiltradas]);

  const metodosPago = useMemo(() => {
    const resumen = { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0 };

    ventasFiltradas.forEach((v) => {
      const detalle = v?.pagoDetalle || {};
      const tipo = String(v?.tipoPago || "").toLowerCase();

      resumen.efectivo += obtenerEfectivoNetoVenta(v);
      resumen.tarjeta += Number(detalle.tarjeta || (tipo === "tarjeta" ? v.total : 0) || 0);
      resumen.transferencia += Number(
        detalle.transferencia || (tipo === "transferencia" ? v.total : 0) || 0
      );

      if (!["efectivo", "tarjeta", "transferencia"].includes(tipo)) {
        resumen.otros += Number(v.total || 0);
      }
    });

    return [
      { name: "Efectivo", value: Number(resumen.efectivo.toFixed(2)) },
      { name: "Tarjeta", value: Number(resumen.tarjeta.toFixed(2)) },
      { name: "Transferencia", value: Number(resumen.transferencia.toFixed(2)) },
      { name: "Otros", value: Number(resumen.otros.toFixed(2)) },
    ].filter((x) => x.value > 0);
  }, [ventasFiltradas]);

  const ventasPorDiaResumen = useMemo(() => {
    const total = ventasPorDia.reduce((acc, item) => acc + Number(item?.total || 0), 0);
    const promedio = ventasPorDia.length > 0 ? total / ventasPorDia.length : 0;
    const mejorDia = ventasPorDia.reduce(
      (best, item) => (Number(item?.total || 0) > Number(best?.total || 0) ? item : best),
      null,
    );
    return { total, promedio, mejorDia };
  }, [ventasPorDia]);

  const topProductosResumen = useMemo(() => {
    const totalUnidades = topProductosChart.reduce((acc, item) => acc + Number(item?.cantidad || 0), 0);
    const productos = topProductosChart.filter((item) => item.tipo === "Producto").length;
    const servicios = topProductosChart.filter((item) => item.tipo === "Servicio").length;
    return {
      totalUnidades,
      productos,
      servicios,
      lider: topProductosChart[0] || null,
    };
  }, [topProductosChart]);

  const utilidadResumen = useMemo(() => {
    const total = utilidadPorProductoChart.reduce((acc, item) => acc + Number(item?.utilidad || 0), 0);
    return {
      total,
      lider: utilidadPorProductoChart[0] || null,
    };
  }, [utilidadPorProductoChart]);

  const metodosPagoResumen = useMemo(() => {
    const total = metodosPago.reduce((acc, item) => acc + Number(item?.value || 0), 0);
    const items = [...metodosPago]
      .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0))
      .map((item, index) => ({
        ...item,
        color: PIE_COLORS[index % PIE_COLORS.length],
        percent: total > 0 ? (Number(item?.value || 0) / total) * 100 : 0,
      }));

    return {
      total,
      items,
      lider: items[0] || null,
    };
  }, [metodosPago]);

  const chartTextColor = isDarkMode ? "#cbd5e1" : "#475569";
  const chartGridColor = isDarkMode ? "#334155" : "#dbe3ef";
  const chartTooltipStyle = {
    background: isDarkMode ? "#111827" : "#ffffff",
    border: `1px solid ${chartGridColor}`,
    color: isDarkMode ? "#e5e7eb" : "#0f172a",
    borderRadius: 10,
  };
  const ventasHoy = useMemo(() => {
    const ini = startOfToday();
    const fin = endOfToday();
    return ventas.filter((v) => {
      const f = toDate(v.fecha);
      return f && f >= ini && f <= fin;
    });
  }, [ventas]);

  const efectivoEsperadoHoy = useMemo(() => {
    return ventasHoy.reduce((acc, v) => {
      return acc + obtenerEfectivoNetoVenta(v);
    }, 0);
  }, [ventasHoy]);

  const fondoInicialRaw = String(fondoInicialCaja ?? "").replace(/,/g, "").trim();
  const fondoInicialNum = fondoInicialRaw === "" ? 0 : Number(fondoInicialRaw);
  const fondoInicialValido = Number.isFinite(fondoInicialNum) && fondoInicialNum >= 0;

  const totalDenominaciones = useMemo(() => {
    return DENOMINACIONES.reduce((acc, valor) => {
      const cantidad = Number(denominaciones[String(valor)] || 0);
      return acc + valor * cantidad;
    }, 0);
  }, [denominaciones]);

  // Egresos capturados en "Registrar Egresos" (coleccion diaria).
  const egresosValidos = useMemo(() => {
    return egresos
      .map((e) => ({
        id: String(e?.id || ""),
        tipo: String(e?.tipo || "otro"),
        monto: Number(String(e?.monto || "").replace(/,/g, "")),
        descripcion: String(e?.descripcion || "").trim(),
        usuario: String(e?.usuario || "").trim() || auth.currentUser?.email || "sin_usuario",
      }))
      .filter((e) => Number.isFinite(e.monto) && e.monto > 0);
  }, [egresos]);

  const totalEgresosDia = useMemo(() => {
    return egresosValidos.reduce((acc, e) => acc + Number(e.monto || 0), 0);
  }, [egresosValidos]);

  const totalSalidasCaja = totalEgresosDia;
  const cajaFinalEsperada = fondoInicialNum + efectivoEsperadoHoy - totalSalidasCaja;
  const diferenciaContado = totalDenominaciones - cajaFinalEsperada;
  const hayDescuadre = Math.abs(diferenciaContado) >= 0.01;
  const cierreConDescuadreDocumentado =
    !hayDescuadre || (descuadreConfirmado && notasCorte.trim().length > 0);
  const aperturaPendiente = !cajaCerradaHoy && !fondoInicialValido;

  const cortesHistorialFiltrado = useMemo(() => {
    const cajeroQ = filtroCajero.trim().toLowerCase();
    return cortesHistorial.filter((c) => {
      const f = String(c?.fechaKey || "");
      if (fechaCorteDesde && f < fechaCorteDesde) return false;
      if (fechaCorteHasta && f > fechaCorteHasta) return false;

      if (!cajeroQ) return true;
      const byEmail = String(c?.cajero?.email || "").toLowerCase();
      const byNombre = String(c?.cajero?.nombre || "").toLowerCase();
      const byUid = String(c?.cajero?.uid || "").toLowerCase();
      return byEmail.includes(cajeroQ) || byNombre.includes(cajeroQ) || byUid.includes(cajeroQ);
    });
  }, [cortesHistorial, filtroCajero, fechaCorteDesde, fechaCorteHasta]);

  const historialCortesResumen = useMemo(() => {
    const tickets = cortesHistorialFiltrado.reduce(
      (acc, corte) => acc + Number(corte?.resumen?.tickets || 0),
      0,
    );
    const ultimo = cortesHistorialFiltrado
      .slice()
      .sort((a, b) => String(b?.fechaKey || "").localeCompare(String(a?.fechaKey || "")))[0] || null;

    return {
      total: cortesHistorialFiltrado.length,
      tickets,
      ultimo,
    };
  }, [cortesHistorialFiltrado]);

  const toggleChartDetail = (detailKey) => {
    setExpandedChartDetails((prev) => ({
      ...prev,
      [detailKey]: !prev[detailKey],
    }));
  };

  const setChartProductsVisible = (chartId, shouldShowProducts) => {
    setChartProductVisibility((prev) => ({
      ...prev,
      [chartId]: shouldShowProducts,
    }));
  };

  const getVisibleChartItems = (chartId, items) => {
    const shouldShowProducts = chartProductVisibility[chartId] !== false;
    if (shouldShowProducts) return items;
    return items.filter((item) => item.tipo !== "Producto");
  };

  const selectBottomSection = (sectionKey) => {
    setActiveBottomSection(sectionKey);
  };

  const renderChartVisibilityTabs = (chartId, items) => {
    const hasProducts = items.some((item) => item.tipo === "Producto");
    if (!hasProducts) return null;

    const shouldShowProducts = chartProductVisibility[chartId] !== false;

    return (
      <div className="chart-visibility-wrap">
        <small>Lista inferior</small>
        <div className="chart-visibility-tabs" role="tablist" aria-label="Filtro de productos en lista">
          <button
            type="button"
            className={`chart-visibility-tab ${shouldShowProducts ? "active" : ""}`}
            onClick={() => setChartProductsVisible(chartId, true)}
          >
            Mostrar productos
          </button>
          <button
            type="button"
            className={`chart-visibility-tab ${!shouldShowProducts ? "active" : ""}`}
            onClick={() => setChartProductsVisible(chartId, false)}
          >
            Ocultar productos
          </button>
        </div>
      </div>
    );
  };

  const renderChartSeriesList = (chartId, items, valueFormatter, detailValueFormatter) => {
    const visibleItems = getVisibleChartItems(chartId, items);

    if (!visibleItems.length) {
      return <p className="chart-series-empty">Sin datos en el periodo seleccionado.</p>;
    }

    return (
      <div className="chart-series-list">
        {visibleItems.map((item) => {
          const detailKey = `${chartId}:${item.tipo}:${item.nombre}`;
          const showDetails = Boolean(expandedChartDetails[detailKey]);
          const canExpand = Array.isArray(item.detalles) && item.detalles.length > 0;
          const subLabel = canExpand
            ? serviciosHabilitados
              ? `${item.detalles.length} servicio(s) dentro de este total`
              : `${item.detalles.length} detalle(s) dentro de este total`
            : item.tipo;

          return (
            <div className="chart-series-item-wrap" key={detailKey}>
              <div className="chart-series-item">
                <span
                  className="chart-series-swatch"
                  style={{ background: item.color }}
                  aria-hidden="true"
                />
                <div className="chart-series-copy">
                  <strong>{item.nombre}</strong>
                  <small>{subLabel}</small>
                </div>
                <div className="chart-series-actions">
                  <b>{valueFormatter(item)}</b>
                  {canExpand && (
                    <button
                      type="button"
                      className="chart-series-toggle"
                      onClick={() => toggleChartDetail(detailKey)}
                    >
                      {showDetails
                        ? serviciosHabilitados ? "Ocultar servicios" : "Ocultar detalle"
                        : serviciosHabilitados ? "Ver servicios" : "Ver detalle"}
                    </button>
                  )}
                </div>
              </div>

              {canExpand && showDetails && (
                <div className="chart-series-details">
                  {item.detalles.map((detalle) => (
                    <div className="chart-series-detail-row" key={`${detailKey}:${detalle.nombre}`}>
                      <span>{detalle.nombre}</span>
                      <strong>{detailValueFormatter(detalle)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Layout>
      <div className={`reportes-page ${fijarCalendario ? "calendar-layout-pinned" : ""}`}>
      
        <div className="reportes-header">
          <h1>Reportes</h1>
          <div className="reportes-header-actions">

            <details className="excel-report-menu">
              <summary className={`btn-excel-report ${generandoExcel || loading ? "is-disabled" : ""}`}>
                <FiBarChart2 aria-hidden="true" />
                <span>{generandoExcel ? "Generando Excel..." : "Generar Excel"}</span>
                <FiChevronDown className="excel-menu-chevron" aria-hidden="true" />
              </summary>
              <div className="excel-report-options">
                <button type="button" onClick={handleGenerarExcel} disabled={!!generandoExcel || loading}>
                  <FiBarChart2 aria-hidden="true" />
                  <span><strong>Reporte ejecutivo</strong><small>Periodo y filtros seleccionados</small></span>
                </button>
                <button type="button" onClick={generarReporteFacturaGlobal} disabled={!!generandoExcel || loading}>
                  <FiFileText aria-hidden="true" />
                  <span><strong>Factura global</strong><small>Mes de la fecha final seleccionada</small></span>
                </button>
              </div>
            </details>

            <button
              className="btn-refresh"
              onClick={async () => {
                await Promise.all([obtenerVentas(), cargarEstadoCorteHoy(), cargarHistorialCortes(), cargarEgresosDia(), cargarCuentasPorCobrar()]);
              }}
              type="button"
            >
              Actualizar
            </button>
            <button
              className="btn-egresos"
              type="button"
              onClick={() => setMostrarModalEgresos(true)}
              title={
                cajaCerradaHoy
                  ? "Caja cerrada: no se pueden registrar egresos hoy"
                  : "Registrar egresos"
              }
              disabled={cajaCerradaHoy || cerrandoCaja}
            >
              📊 Egresos
            </button>
            <button
              className="btn-corte"
              type="button"
              onClick={handleBotonCorte}
              disabled={cerrandoCaja}
            >
              {cajaCerradaHoy ? "Descargar corte de hoy (PDF)" : "Cerrar caja de hoy + PDF"}
            </button>
          </div>
        </div>

        {aperturaPendiente && (
          <div className="apertura-alert">
            Fondo de caja apertura pendiente. Capturalo antes de cerrar la caja de hoy.
          </div>
        )}
     

        <div className="reportes-kpis">
          <div className="kpi-card">
            <small>Ventas hoy</small>
            <b>{money(kpis.totalHoy)}</b>
          </div>
          <div className="kpi-card">
            <small>Total periodo</small>
            <b>{money(kpis.total)}</b>
          </div>
          <div className="kpi-card">
            <small>Tickets</small>
            <b>{kpis.tickets}</b>
          </div>
          {serviciosHabilitados && (
            <div className="kpi-card">
              <small>Servicios realizados</small>
              <b>{kpis.servicios}</b>
            </div>
          )}
          <div className="kpi-card">
            <small>Ticket promedio</small>
            <b>{money(kpis.promedio)}</b>
          </div>
          <div className="kpi-card">
            <small>Unidades vendidas</small>
            <b>{kpis.unidades}</b>
          </div>
          <div className="kpi-card">
            <small>IVA total</small>
            <b>{money(kpis.iva)}</b>
          </div>
          <div className="kpi-card"><small>Descuentos aplicados</small><b>{money(totalDescuentosPeriodo)}</b></div>
          <div className="kpi-card"><small>Ventas fiadas</small><b>{money(totalFiadoPeriodo)}</b></div>
        </div>

        <section className="reportes-deudas-card">
          <div className="reportes-deudas-head"><div><span>Cuentas por cobrar</span><h2>Quiénes deben</h2><p>Saldos vigentes y vencidos registrados mediante ventas fiadas.</p></div><strong>{money(cuentasPorCobrar.reduce((total, cuenta) => total + Number(cuenta.saldo || 0), 0))}</strong></div>
          <div className="reportes-deudas-table-wrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Venta</th><th>Vencimiento</th><th>Estado</th><th>Saldo</th></tr></thead><tbody>{cuentasPorCobrar.filter((cuenta) => Number(cuenta.saldo || 0) > 0).sort((a,b) => String(a.fechaVencimiento || "").localeCompare(String(b.fechaVencimiento || ""))).map((cuenta) => { const vencida = cuenta.fechaVencimiento && cuenta.fechaVencimiento < ymd(new Date()); return <tr key={cuenta.id}><td><strong>{cuenta.clienteNombre || "Sin nombre"}</strong></td><td>{cuenta.clienteTelefono || "-"}</td><td>{cuenta.folioVenta || cuenta.ventaId || "-"}</td><td>{cuenta.fechaVencimiento || "-"}</td><td><span className={vencida ? "deuda-vencida" : "deuda-vigente"}>{vencida ? "Vencida" : "Vigente"}</span></td><td><b>{money(cuenta.saldo)}</b></td></tr>})}{!cuentasPorCobrar.some((cuenta) => Number(cuenta.saldo || 0) > 0) && <tr><td colSpan="6" className="deudas-empty">No hay cuentas pendientes.</td></tr>}</tbody></table></div>
        </section>

        <div className="reportes-grid">
          <div className="chart-card chart-card-sales">
            <div className="chart-card-head">
              <div className="chart-card-copy">
                <span className="chart-card-kicker">Movimiento</span>
                <h3>Ventas por dia (ultimos 30 dias)</h3>
                <p>Comportamiento diario del periodo filtrado y dias mas fuertes de cobro.</p>
              </div>
              <div className="chart-card-stat">
                <strong>{money(ventasPorDiaResumen.total)}</strong>
                <small>Acumulado</small>
              </div>
            </div>

            <div className="chart-card-chips">
              <span className="chart-chip">Promedio diario: {money(ventasPorDiaResumen.promedio)}</span>
              <span className="chart-chip">
                Mejor dia:{" "}
                {ventasPorDiaResumen.mejorDia
                  ? `${formatChartDateTick(ventasPorDiaResumen.mejorDia.fecha)} · ${money(
                      ventasPorDiaResumen.mejorDia.total,
                    )}`
                  : "Sin ventas"}
              </span>
            </div>

            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={ventasPorDia}>
                  <defs>
                    <linearGradient id="ventasAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fill: chartTextColor }}
                    tickFormatter={formatChartDateTick}
                    axisLine={{ stroke: chartGridColor }}
                    tickLine={false}
                    minTickGap={18}
                  />
                  <YAxis
                    tick={{ fill: chartTextColor }}
                    axisLine={{ stroke: chartGridColor }}
                    tickLine={false}
                    width={54}
                  />
                  <Tooltip
                    formatter={(v) => money(v)}
                    labelFormatter={(value) => formatChartDateTick(value)}
                    isAnimationActive={animationsEnabled}
                    contentStyle={chartTooltipStyle}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="none"
                    fill="url(#ventasAreaGradient)"
                    isAnimationActive={animationsEnabled}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: "#ffffff", stroke: "#2563eb", strokeWidth: 3 }}
                    isAnimationActive={animationsEnabled}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card chart-card-products">
            <div className="chart-card-head">
              <div className="chart-card-copy">
                <span className="chart-card-kicker">Ranking</span>
                <h3>Top productos (unidades)</h3>
                <p>
                  {serviciosHabilitados
                    ? "Mezcla de productos y servicios mas movidos dentro del periodo actual."
                    : "Productos mas movidos dentro del periodo actual."}
                </p>
              </div>
              <div className="chart-card-stat">
                <strong>{topProductosResumen.totalUnidades}</strong>
                <small>Unidades top</small>
              </div>
            </div>

            <div className="chart-card-chips">
              {serviciosHabilitados && (
                <span className="chart-chip">Servicios: {topProductosResumen.servicios}</span>
              )}
              <span className="chart-chip">Productos: {topProductosResumen.productos}</span>
              <span className="chart-chip">
                Lider: {topProductosResumen.lider?.nombre || "Sin datos"}
              </span>
            </div>

            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topProductosChart} barGap={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis dataKey="nombre" hide />
                  <YAxis
                    tick={{ fill: chartTextColor }}
                    axisLine={{ stroke: chartGridColor }}
                    tickLine={false}
                    allowDecimals={false}
                    width={44}
                  />
                  <Tooltip
                    formatter={(v) => [v, "Unidades"]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.nombre || ""}
                    isAnimationActive={animationsEnabled}
                    contentStyle={chartTooltipStyle}
                  />
                  <Bar
                    dataKey="cantidad"
                    name="Unidades"
                    radius={[12, 12, 4, 4]}
                    barSize={28}
                    isAnimationActive={animationsEnabled}
                  >
                    {topProductosChart.map((entry) => (
                      <Cell key={`${entry.tipo}-${entry.nombre}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {renderChartVisibilityTabs("top-productos", topProductosChart)}
            {renderChartSeriesList(
              "top-productos",
              topProductosChart,
              (item) => `${item.cantidad} und.`,
              (detalle) => `${detalle.cantidad} und.`,
            )}
          </div>

          <div className="chart-card chart-card-payments">
            <div className="chart-card-head">
              <div className="chart-card-copy">
                <span className="chart-card-kicker">Cobro</span>
                <h3>Metodo de pago</h3>
                <p>Distribucion del efectivo, tarjeta, transferencia y otras entradas.</p>
              </div>
              <div className="chart-card-stat">
                <strong>{money(metodosPagoResumen.total)}</strong>
                <small>Total cobrado</small>
              </div>
            </div>

            <div className="chart-payment-layout">
              <div className="chart-donut-shell">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={metodosPagoResumen.items}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={68}
                      outerRadius={102}
                      paddingAngle={4}
                      stroke={isDarkMode ? "#0f172a" : "#ffffff"}
                      strokeWidth={4}
                      isAnimationActive={animationsEnabled}
                    >
                      {metodosPagoResumen.items.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => money(v)}
                      isAnimationActive={animationsEnabled}
                      contentStyle={chartTooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="chart-donut-center">
                  <span>Metodo lider</span>
                  <strong>{metodosPagoResumen.lider?.name || "Sin datos"}</strong>
                  <small>{money(metodosPagoResumen.lider?.value || 0)}</small>
                </div>
              </div>

              <div className="chart-payment-list">
                {metodosPagoResumen.items.map((item) => (
                  <div className="chart-payment-item" key={item.name}>
                    <span
                      className="chart-payment-dot"
                      style={{ background: item.color }}
                      aria-hidden="true"
                    />
                    <div className="chart-payment-copy">
                      <strong>{item.name}</strong>
                      <small>{money(item.value)}</small>
                    </div>
                    <b>{item.percent.toFixed(0)}%</b>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-card chart-card-profit">
            <div className="chart-card-head">
              <div className="chart-card-copy">
                <span className="chart-card-kicker">Rentabilidad</span>
                <h3>Utilidad estimada por producto</h3>
                <p>Lectura rapida de lo que mas deja margen dentro del ranking actual.</p>
              </div>
              <div className="chart-card-stat">
                <strong>{money(utilidadResumen.total)}</strong>
                <small>Utilidad top</small>
              </div>
            </div>

            <div className="chart-card-chips">
              <span className="chart-chip">
                Mejor aporte: {utilidadResumen.lider?.nombre || "Sin datos"}
              </span>
              <span className="chart-chip">
                Margen visible: {money(utilidadResumen.lider?.utilidad || 0)}
              </span>
            </div>

            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={utilidadPorProductoChart} barGap={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis dataKey="nombre" hide />
                  <YAxis
                    tick={{ fill: chartTextColor }}
                    axisLine={{ stroke: chartGridColor }}
                    tickLine={false}
                    width={54}
                  />
                  <Tooltip
                    formatter={(v) => money(v)}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.nombre || ""}
                    isAnimationActive={animationsEnabled}
                    contentStyle={chartTooltipStyle}
                  />
                  <Bar
                    dataKey="utilidad"
                    name="Utilidad"
                    radius={[12, 12, 4, 4]}
                    barSize={28}
                    isAnimationActive={animationsEnabled}
                  >
                    {utilidadPorProductoChart.map((entry) => (
                      <Cell key={`${entry.tipo}-${entry.nombre}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {renderChartVisibilityTabs("utilidad-productos", utilidadPorProductoChart)}
            {renderChartSeriesList(
              "utilidad-productos",
              utilidadPorProductoChart,
              (item) => money(item.utilidad),
              (detalle) => money(detalle.utilidad),
            )}
          </div>
        </div>
 
        {activeBottomSection === "historial" && (
        <div className="tabla-reportes-wrap historial-cortes-panel">
          <div className="reportes-section-head">
            <div>
              <h3>Historial de cortes</h3>
              <p>Consulta cierres por fecha, cajero y resultado del conteo de caja.</p>
            </div>
            <div className="reportes-section-badge">
              {historialCortesResumen.total} corte(s)
            </div>
          </div>

          <div className="chart-card-chips historial-cortes-chips">
            <span className="chart-chip">Tickets acumulados: {historialCortesResumen.tickets}</span>
            <span className="chart-chip">
              Ultimo corte: {historialCortesResumen.ultimo?.fechaKey || "Sin registros"}
            </span>
          </div>

          <div className="historial-cortes-filtros">
            <input
              type="date"
              value={fechaCorteDesde}
              onChange={(e) => setFechaCorteDesde(e.target.value)}
            />
            <input
              type="date"
              value={fechaCorteHasta}
              onChange={(e) => setFechaCorteHasta(e.target.value)}
            />
            <input
              placeholder="Filtrar por nombre del cajero"
              value={filtroCajero}
              onChange={(e) => setFiltroCajero(e.target.value)}
            />
          </div>

          {cortesHistorialFiltrado.length === 0 ? (
            <p>Sin cortes para el filtro actual.</p>
          ) : (
            <table className="tabla-reportes">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cajero</th>
                  <th>Tickets</th>
                  <th>IVA</th>
                  <th>Efectivo esperado</th>
                  <th>Contado</th>
                  <th>Diferencia</th>
                  <th>Documento</th>
                </tr>
              </thead>
              <tbody>
                {cortesHistorialFiltrado.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="historial-fecha-cell">
                        <strong>{c.fechaKey || "-"}</strong>
                        <small>{getCorteHoraLabel(c)}</small>
                      </div>
                    </td>
                    <td>
                      <div className="historial-cajero-cell">
                        <strong>{getCajeroDisplayName(c, empleadosNombreIndex)}</strong>
                        <small>{c?.cajero?.uid ? `ID ${String(c.cajero.uid).slice(0, 8)}` : "Cajero registrado"}</small>
                      </div>
                    </td>
                    <td>
                      <span className="historial-pill">{Number(c?.resumen?.tickets || 0)} tickets</span>
                    </td>
                    <td>{money(c?.resumen?.iva || 0)}</td>
                    <td>{money(c?.conteoEfectivo?.esperado || 0)}</td>
                    <td>{c?.conteoEfectivo?.contado == null ? "-" : money(c?.conteoEfectivo?.contado)}</td>
                    <td>
                      {c?.conteoEfectivo?.diferencia == null ? (
                        "-"
                      ) : (
                        <span
                          className={`historial-diff ${getDiferenciaTone(c?.conteoEfectivo?.diferencia)}`}
                        >
                          {money(c?.conteoEfectivo?.diferencia)}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-refresh btn-documento-corte"
                        onClick={() => handleDescargarCorteHistorial(c)}
                      >
                        Descargar PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}

        {(activeBottomSection === "servicios" || activeBottomSection === "ventas") && (
  <div className="reportes-buscador">
      
          <div className="filtro-texto-wrap">
            <label>Buscar</label>
            <input
              placeholder="ID venta, metodo o producto..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
          </div>
        </div>
        )}
        {serviciosHabilitados && activeBottomSection === "servicios" && (
        <div className="tabla-reportes-wrap">
          <div className="reportes-section-head">
            <div>
              <h3>Servicios realizados</h3>
              <p>Servicios cobrados dentro del periodo y filtro actual.</p>
            </div>
            <div className="reportes-section-badge">
              {serviciosRealizados.length} registrados
            </div>
          </div>
          {loading && <p>Cargando...</p>}
          {!loading && serviciosRealizados.length === 0 && (
            <p>No hay servicios registrados en el filtro actual.</p>
          )}

          {!loading && serviciosRealizados.length > 0 && (
            <table className="tabla-reportes">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Servicio</th>
                  <th>Cliente</th>
                  <th>Venta</th>
                  <th>Metodo</th>
                  <th>Cantidad</th>
                  <th>Monto</th>
                  <th>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {serviciosRealizados.map((item) => (
                  <tr key={item.id}>
                    <td>{item.fechaTexto}</td>
                    <td>
                      <strong>{item.servicio}</strong>
                      <br />
                      <small>Folio: {item.folio}</small>
                    </td>
                    <td>{item.cliente}</td>
                    <td>{item.ventaId}</td>
                    <td>{item.metodo}</td>
                    <td>{item.cantidad}</td>
                    <td>{money(item.monto)}</td>
                    <td>
                      <div className="tabla-ticket-actions">
                        <button
                          type="button"
                          className="tabla-ticket-btn secondary"
                          onClick={() => handleVisualizarVentaTicket(item.venta)}
                        >
                          Visualizar ticket
                        </button>
                        <button
                          type="button"
                          className="tabla-ticket-btn"
                          onClick={() => handleReimprimirVentaTicket(item.venta)}
                        >
                          Reimprimir ticket
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}

        {activeBottomSection === "ventas" && (
        <div className="tabla-reportes-wrap">
          <h3>Detalle de ventas</h3>
          {loading && <p>Cargando...</p>}
          {!loading && ventasFiltradas.length === 0 && <p>Sin resultados en el filtro actual.</p>}

          {!loading && ventasFiltradas.length > 0 && (
            <table className="tabla-reportes">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Metodo</th>
                  <th>Items</th>
                  <th>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {ventasFiltradas
                  .slice()
                  .sort((a, b) => (toDate(b.fecha)?.getTime() || 0) - (toDate(a.fecha)?.getTime() || 0))
                  .map((v) => (
                    <tr key={v.id}>
                      <td>{v.id}</td>
                      <td>{toDate(v.fecha)?.toLocaleString("es-MX") || "-"}</td>
                      <td>{money(v.total)}</td>
                      <td>{v.tipoPago || "-"}</td>
                      <td>
                        {(v.productos || [])
                          .map((p) => `${p.nombre} x${p.cantidad}`)
                          .slice(0, 3)
                          .join(" | ")}
                      </td>
                      <td>
                        <div className="tabla-ticket-actions">
                          <button
                            type="button"
                            className="tabla-ticket-btn secondary"
                            onClick={() => handleVisualizarVentaTicket(v)}
                          >
                            Visualizar ticket
                          </button>
                          <button
                            type="button"
                            className="tabla-ticket-btn"
                            onClick={() => handleReimprimirVentaTicket(v)}
                          >
                            Reimprimir ticket
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
        )}

        <nav className="reportes-bottom-nav" aria-label="Secciones de reportes">
          <button
            type="button"
            className={activeBottomSection === "historial" ? "active" : ""}
            onClick={() => selectBottomSection("historial")}
          >
            Historial de cortes
          </button>
          {serviciosHabilitados && (
            <button
              type="button"
              className={activeBottomSection === "servicios" ? "active" : ""}
              onClick={() => selectBottomSection("servicios")}
            >
              Servicios realizados
            </button>
          )}
          <button
            type="button"
            className={activeBottomSection === "ventas" ? "active" : ""}
            onClick={() => selectBottomSection("ventas")}
          >
            Detalle de ventas
          </button>
        </nav>

        {mostrarModalCierre && (
          <div className="corte-modal-overlay">
            <div className="corte-modal">
              <h2>Cerrar caja de hoy</h2>
              <p className="corte-modal-sub">
                Completa el arqueo de caja. Al confirmar se cerrara el dia y se generara el PDF.
              </p>

              <div className="conteo-caja-grid">
                <div>
                  <label>Fondo inicial</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fondoInicialCaja}
                    onChange={(e) => setFondoInicialCaja(e.target.value)}
                  />
                </div>
                <div>
                  <label>Ventas netas en efectivo</label>
                  <div className="conteo-caja-value">{money(efectivoEsperadoHoy)}</div>
                </div>
                <div>
                  <label>Efectivo esperado</label>
                  <div className="conteo-caja-value">{money(cajaFinalEsperada)}</div>
                </div>
              </div>

              <div className="denominaciones-wrap">
                <h4>Denominaciones</h4>
                <div className="denominaciones-grid">
                  {DENOMINACIONES.map((valor) => (
                    <div key={`modal-den-${valor}`} className="den-item">
                      <label>{money(valor)}</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={denominaciones[String(valor)] || ""}
                        onChange={(e) => updateDenominacion(valor, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="conteo-caja-grid">
                <div>
                  <label>Total contado</label>
                  <div className="conteo-caja-value">{money(totalDenominaciones)}</div>
                </div>
                <div>
                  <label>Diferencia</label>
                  <div className={`conteo-caja-value ${hayDescuadre ? (diferenciaContado < 0 ? "neg" : "pos") : "ok"}`}>
                    {money(diferenciaContado)}
                  </div>
                </div>
                <div>
                  <label>Total salidas de caja</label>
                  <div className="conteo-caja-value">{money(totalSalidasCaja)}</div>
                </div>
              </div>

              {hayDescuadre && (
                <div className="alerta-descuadre-caja" role="alert">
                  <strong>
                    {diferenciaContado < 0 ? "Faltante detectado" : "Sobrante detectado"}: {money(Math.abs(diferenciaContado))}
                  </strong>
                  <span>
                    El cierre no coincide con el fondo inicial, las ventas en efectivo y las salidas registradas.
                    Revisa las denominaciones o escribe el motivo en Notas del corte y confirma el descuadre.
                  </span>
                  <label>
                    <input
                      type="checkbox"
                      checked={descuadreConfirmado}
                      onChange={(e) => setDescuadreConfirmado(e.target.checked)}
                    />
                    Confirmo que revisé el conteo y deseo registrar este descuadre.
                  </label>
                </div>
              )}

              <div className="retiros-wrap">
                <div className="retiros-head">
                  <h4>Egresos manuales</h4>
                  <div className="reportes-header-actions">
                    <button
                      className="btn-refresh"
                      type="button"
                      onClick={() => setMostrarModalEgresos(true)}
                      disabled={cajaCerradaHoy || cerrandoCaja}
                    >
                      + Egreso
                    </button>
                  </div>
                </div>
                <p className="conteo-caja-hint">
                  Usa el boton <strong>+ Egreso</strong> para abrir el modal de registrar egresos.
                </p>

                <div className="egresos-corte-wrap">
                  <div className="egresos-corte-head">
                    <h5>Egresos del modal diario</h5>
                    <span>{money(totalEgresosDia)}</span>
                  </div>

                  {egresosValidos.length === 0 && (
                    <p className="conteo-caja-hint">Sin egresos registrados.</p>
                  )}

                  {egresosValidos.length > 0 && (
                    <div className="egresos-corte-list">
                      {egresosValidos.map((e) => {
                        const tipoMeta = TIPO_EGRESO_META[e.tipo] || TIPO_EGRESO_META.otro;
                        return (
                          <div
                            key={`egreso-corte-${e.id || `${e.tipo}-${e.descripcion}`}`}
                            className="egreso-corte-card"
                          >
                            <div className="egreso-corte-header">
                              <div className="egreso-corte-tipo">
                                <span className="egreso-corte-emoji">{tipoMeta.emoji}</span>
                                <span>{tipoMeta.label}</span>
                              </div>
                              <div className="egreso-corte-monto">{money(e.monto || 0)}</div>
                            </div>
                            <div className="egreso-corte-desc">{e.descripcion || "-"}</div>
                            <div className="egreso-corte-user">{e.usuario || "-"}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="conteo-caja-notas">
                <label>Notas del corte</label>
                <input value={notasCorte} onChange={(e) => setNotasCorte(e.target.value)} />
              </div>

              <div className="corte-modal-actions">
                <button
                  className="btn-corte"
                  type="button"
                  onClick={handleCorteCaja}
                  disabled={cerrandoCaja || !cierreConDescuadreDocumentado}
                >
                  {cerrandoCaja ? "Cerrando..." : "Confirmar cierre y generar PDF"}
                </button>
                <button
                  className="btn-refresh"
                  type="button"
                  onClick={() => setMostrarModalCierre(false)}
                  disabled={cerrandoCaja}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <ModalEgresos
          mostrar={mostrarModalEgresos}
          onClose={() => setMostrarModalEgresos(false)}
          egresos={egresos}
          onAgregarEgreso={handleAgregarEgreso}
          onEliminarEgreso={handleEliminarEgreso}
          onEditarEgreso={handleEditarEgreso}
          totalEgresos={totalEgresos}
        />

        <button
          className={`calendar-side-tab ${mostrarCalendario || fijarCalendario ? "open" : ""}`}
          onClick={() => setMostrarCalendario((v) => !v)}
        >
          {"\u{1F4C5}"} Calendario
        </button>

        {(mostrarCalendario || fijarCalendario) && (
          <aside className={`calendar-side-drawer ${fijarCalendario ? "pinned" : ""}`}>
            <div className="calendar-side-actions">
              <button className="btn-light" onClick={() => setMostrarCalendario(false)}>
                {"\u{1F441}"} Ocultar
              </button>
              <button className="btn-light" onClick={toggleFijarCalendario}>
                {fijarCalendario ? "\u{1F4CD} Desfijar" : "\u{1F4CC} Fijar"}
              </button>
            </div>

            <div className="calendar-box side">
              <h4>Selecciona un día</h4>
              <Calendar
                onChange={cambiarFecchaAlSeleccionarDia}
                value={selectedDate}
              />
            </div>

            <div className="panel-card side">
              <div className="panel-header">
                <h4>
                  Reportes para{" "}
                  {selectedDate.toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h4>
              </div>
              {ventasFiltradas.length === 0 ? (
                <p className="sin-resultados">No hay ventas para esta fecha.</p>
              ) : (
                <div className="ventas-resumen-calendario">
                  <div className="resumen-dia">
                    <span className="label">Total ventas:</span>
                    <span className="valor">{money(ventasFiltradas.reduce((acc, v) => acc + Number(v.total || 0), 0))}</span>
                  </div>
                  <div className="resumen-dia">
                    <span className="label">Tickets:</span>
                    <span className="valor">{ventasFiltradas.length}</span>
                  </div>
                  <div className="resumen-dia">
                    <span className="label">Ticket promedio:</span>
                    <span className="valor">
                      {money(ventasFiltradas.length > 0 ? ventasFiltradas.reduce((acc, v) => acc + Number(v.total || 0), 0) / ventasFiltradas.length : 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </Layout>
  );
}


