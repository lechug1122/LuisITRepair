import React, { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FiChevronDown,
  FiChevronUp,
  FiCreditCard,
  FiFileText,
  FiPercent,
  FiSearch,
  FiShoppingCart,
  FiTag,
  FiTool,
  FiUser,
  FiUserPlus,
  FiX,
  FiZap,
} from "react-icons/fi";
import "../css/pos.css";
import "../css/pos_descuento_color.css";
import Layout from "../components/Layout";
import POSMobileScanner from "../components/POSMobileScanner";
import ModalPago from "../components/modal_pago";
import ModalCanjePuntos from "../components/modal_canje_puntos";
import ModalSelectorProducto from "../components/modal_selector_producto";
import ModalSelectorServicio from "../components/modal_selector_servicio";
import ModalComparadorPrecios from "../components/modal_comparador_precios";
import ModalAperturaCaja from "../components/modal_apertura_caja";
import ModalPagoFiado from "../components/ModalPagoFiado";
import { imprimirTicketVenta } from "../components/print_ticket_venta";
import { ClientesPanel } from "./Clientes";
import {
  buscarServicioPorFolio,
  actualizarServicioPorId,
  listarServiciosPendientes,
  listarServiciosPorClienteId,
} from "../js/services/servicios_firestore";
import {
  crearCliente,
  listarClientes,
  obtenerClientePorId,
  listarVentasPorCliente,
} from "../js/services/clientes_firestore";
import {
  construirResumenComprasCliente,
  construirResumenServiciosCliente,
  fmtFechaCliente,
} from "../js/services/cliente_resumen";

import {
  obtenerProductos,
  buscarClientePorTelefono,
  sumarPuntosCliente,
  registrarVenta,
  descontarStock
} from "../js/services/POS_firebase";
import { estaCajaCerradaHoy, obtenerCorteCajaDia, registrarAperturaCaja } from "../js/services/corte_caja_firestore";
import {
  enviarScanPosMovil,
  suscribirScansPosUsuario,
  reclamarScanPosPendiente,
  finalizarScanPos,
} from "../js/services/pos_sync_firestore";
import { auth } from "../initializer/firebase";
import useImpresorasConfig from "../hooks/useImpresorasConfig";
import useMonedaConfig from "../hooks/useMonedaConfig";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { calcularImpuestosProducto, obtenerIVAConfig, readIVAConfigStorage } from "../js/services/iva_config";
import {
  readFacturacionConfigStorage,
  saveFacturacionConfigStorage,
} from "../js/services/facturacion_config";
import useServiciosConfig from "../hooks/useServiciosConfig";
import useTarjetaRecargoConfig from "../hooks/useTarjetaRecargoConfig";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import PremiumBadge from "../components/PremiumBadge";
import { escucharPromocionesDescuentos } from "../js/services/promociones_descuentos_firestore";
import { registrarPagoFiado, registrarVentaFiada } from "../js/services/fiados_firestore";
import { calcularRecargoTarjeta } from "../js/services/tarjeta_recargo_config";
import { generarPdfBoletaVenta } from "../js/services/pdf_boleta_venta";
import { readPOSFeatureConfig } from "../js/services/pos_feature_config";
import {
  actualizarCotizacion,
  eliminarCotizacion,
  guardarCotizacion,
  listarCotizaciones,
} from "../js/services/cotizaciones_firestore";
import {
  obtenerConfigDescuentoManual,
  validarPasswordDescuentoManual,
} from "../js/services/descuento_manual_config";

const IVA_RATE_DEFAULT = 0.16;

function detectarVistaMovilPOS() {
  if (typeof navigator === "undefined") return false;

  const ua = String(navigator.userAgent || navigator.vendor || "");
  const platform = String(navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
  const esIPadOS = platform === "macintel" && maxTouchPoints > 1;
  const esAndroid = /android/i.test(ua);
  const esIOS = /iphone|ipod|ipad/i.test(ua) || esIPadOS;
  const esWindowsPhone = /windows phone|iemobile/i.test(ua);
  const esEscritorio =
    /win32|win64|windows|macintel|macppc|mac68k|linux x86_64|linux arm|cros/i.test(platform)
    && !esIPadOS;

  if (esEscritorio) return false;
  if (typeof navigator.userAgentData?.mobile === "boolean") {
    if (!navigator.userAgentData.mobile && !esAndroid && !esIOS && !esWindowsPhone) {
      return false;
    }
  }

  return esAndroid || esIOS || esWindowsPhone;
}

function normalizarProductoCanje(producto, puntosForzados = null) {
  const precio = Number(producto?.precioVenta ?? producto?.precio ?? 0);
  const puntosBase = Number(puntosForzados ?? producto?.puntosCanje ?? 0);
  const puntosRequeridos = puntosBase > 0
    ? Math.round(puntosBase)
    : Math.max(100, Math.ceil(precio / 10) * 10);

  return {
    id: String(producto?.id || "").trim(),
    nombre:
      producto?.nombre ||
      producto?.nombreProducto ||
      producto?.codigo ||
      "Producto sin nombre",
    categoria: producto?.categoria || "General",
    stock: Number(producto?.stock || 0),
    precio,
    puntosRequeridos,
  };
}

function normalizarTelefonoCliente(raw = "") {
  return String(raw || "").replace(/\D/g, "").slice(0, 10);
}

function normalizarBusquedaCliente(raw = "") {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function obtenerInicialesCliente(nombre = "") {
  const partes = String(nombre || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return partes.map((parte) => parte.charAt(0).toUpperCase()).join("") || "CL";
}

function createClienteDraft(telefono = "") {
  return {
    nombre: "",
    telefono: normalizarTelefonoCliente(telefono),
    direccion: "",
  };
}

function obtenerRequerimientosPromocion(regla = {}) {
  if (Array.isArray(regla.requerimientos) && regla.requerimientos.length) {
    return regla.requerimientos.map((requisito) => ({
      productoId: String(requisito.productoId || ""),
      productoNombre: String(requisito.productoNombre || "el producto participante"),
      cantidad: Math.max(1, Number(requisito.cantidad) || 1),
    })).filter((requisito) => requisito.productoId);
  }
  return regla.productoRequeridoId ? [{
    productoId: String(regla.productoRequeridoId),
    productoNombre: regla.productoRequeridoNombre || "el producto participante",
    cantidad: Math.max(1, Number(regla.cantidadRequerida) || 1),
  }] : [];
}

function calcularCiclosPromocion(regla, carrito = []) {
  const reglaId = String(regla.id || "");
  const requisitos = obtenerRequerimientosPromocion(regla);
  if (!requisitos.length) return 0;
  return Math.min(...requisitos.map((requisito) => {
    const item = carrito.find((producto) => String(producto.id) === requisito.productoId);
    const esBeneficiado = requisito.productoId === String(regla.productoBeneficiadoId);
    const regalos = esBeneficiado ? Number(item?.regalosPromocion?.[reglaId] || 0) : 0;
    return Math.floor(Math.max(0, Number(item?.cantidad || 0) - regalos) / requisito.cantidad);
  }));
}

function calcularImporteDescuento(regla, carrito = [], subtotal = 0) {
  if (!regla) return 0;
  if (regla.clase === "promocion" && obtenerRequerimientosPromocion(regla).length && regla.productoBeneficiadoId) {
    const beneficiado = carrito.find((producto) => String(producto.id) === String(regla.productoBeneficiadoId));
    if (!beneficiado) return 0;
    const beneficiadas = Math.max(1, Number(regla.cantidadBeneficiada) || 1);
    const ciclosRequisitos = calcularCiclosPromocion(regla, carrito);
    const ciclos = Math.min(ciclosRequisitos, Math.floor(Number(beneficiado.cantidad || 0) / beneficiadas));
    if (ciclos <= 0) return 0;
    const unidadesConBeneficio = ciclos * beneficiadas;
    const precioBeneficiado = Number(beneficiado.precioVenta || 0);
    const maximoBeneficiable = precioBeneficiado * unidadesConBeneficio;
    const valor = Math.max(0, Number(regla.beneficioValor) || 0);
    const importe = regla.beneficioTipo === "gratis"
      ? maximoBeneficiable
      : regla.beneficioTipo === "porcentaje"
        ? maximoBeneficiable * (valor / 100)
        : regla.beneficioTipo === "precio_especial"
          ? Math.max(0, precioBeneficiado - valor) * unidadesConBeneficio
          : Math.min(maximoBeneficiable, valor * ciclos);
    return Math.min(subtotal, Math.max(0, importe));
  }
  const aplicables = carrito.filter((producto) => {
    if (producto.esPagoFiado || producto.esAbonoServicio) return false;
    if (regla.aplicaA === "todos") return true;
    if (regla.aplicaA === "productos") return (regla.objetivoIds || []).includes(String(producto.id));
    if (regla.aplicaA === "categoria") return (regla.objetivoIds || []).includes(String(producto.categoria || "Sin categoría"));
    return false;
  });
  const base = aplicables.reduce(
    (acumulado, producto) => acumulado + Number(producto.precioVenta || 0) * Number(producto.cantidad || 0),
    0,
  );
  const importe = regla.tipo === "porcentaje"
    ? base * (Number(regla.valor || 0) / 100)
    : regla.tipo === "precio_especial"
      ? aplicables.reduce((ahorro, producto) => ahorro + Math.max(0, Number(producto.precioVenta || 0) - Number(regla.valor || 0)) * Number(producto.cantidad || 0), 0)
      : Math.min(base, Number(regla.valor || 0));
  return Math.min(subtotal, Math.max(0, importe));
}

function describirPromocion(regla) {
  const requisitos = obtenerRequerimientosPromocion(regla);
  const requerido = requisitos.map((requisito) => `${requisito.cantidad} ${requisito.productoNombre}`).join(" + ") || "el producto participante";
  const beneficiado = regla.productoBeneficiadoNombre || requisitos[0]?.productoNombre || "el producto participante";
  const beneficio = regla.beneficioTipo === "gratis"
    ? `${regla.cantidadBeneficiada || 1} ${beneficiado} gratis`
    : regla.beneficioTipo === "porcentaje"
      ? `${regla.beneficioValor || 0}% de descuento en ${beneficiado}`
      : regla.beneficioTipo === "precio_especial"
        ? `${beneficiado} a precio especial de $${Number(regla.beneficioValor || 0).toFixed(2)}`
        : `$${Number(regla.beneficioValor || 0).toFixed(2)} de descuento en ${beneficiado}`;
  return `Compra ${requerido} y obtén ${beneficio}.`;
}

function fechaLocalISO() {
  const hoy = new Date();
  const offset = hoy.getTimezoneOffset() * 60000;
  return new Date(hoy.getTime() - offset).toISOString().slice(0, 10);
}

export default function POS() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatCurrency } = useMonedaConfig();
  const { serviciosHabilitados, tipoNegocioActivo, logoEmpresa } = useEmpresaConfig();
  const { habilitarCanjes, catalogoCanjes } = useServiciosConfig();
  const { config: tarjetaRecargoConfig } = useTarjetaRecargoConfig();
  const { imprimirAlCobrar } = useImpresorasConfig();
  const { puede, isPremium } = useAutorizacionActual();
  const [funcionesPOS] = useState(readPOSFeatureConfig);
  const mostrarProgramaCliente = !habilitarCanjes;
  const vistaParamPOS = searchParams.get("vista");
  const vistaPOS = ["clientes", "cotizacion"].includes(vistaParamPOS)
    ? vistaParamPOS
    : "ventas";
  const mostrandoClientesPOS = vistaPOS === "clientes";
  const mostrandoCotizacionPOS = vistaPOS === "cotizacion";

  const inputRef = useRef(null);
  const accionesRapidasRef = useRef(null);
  const scansProcesandoRef = useRef(new Set());
  const posProcessorIdRef = useRef(
    `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const carritoRef = useRef([]);
  const ultimoScanMovilRef = useRef({ termino: "", at: 0 });
  const ultimoClienteCanjePromptRef = useRef("");

  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteData, setClienteData] = useState(null);
  const [, setClienteBuscado] = useState(false);
  const [mostrarAltaCliente, setMostrarAltaCliente] = useState(false);
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState(() => createClienteDraft(""));
  const [busquedaClientePOS, setBusquedaClientePOS] = useState("");
  const [clientesDisponiblesPOS, setClientesDisponiblesPOS] = useState([]);
  const [cargandoClientesPOS, setCargandoClientesPOS] = useState(true);
  const [errorClientesPOS, setErrorClientesPOS] = useState("");
  const [mensajeClientePOS, setMensajeClientePOS] = useState("");
  const [mostrarDetallesClientePOS, setMostrarDetallesClientePOS] = useState(false);
  const [mostrarAccionesRapidas, setMostrarAccionesRapidas] = useState(false);
  const [clienteVentasHistorial, setClienteVentasHistorial] = useState([]);
  const [clienteServiciosHistorial, setClienteServiciosHistorial] = useState([]);
  const [clienteResumenLoading, setClienteResumenLoading] = useState(false);

  const [productosDB, setProductosDB] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarSelectorProducto, setMostrarSelectorProducto] = useState(false);
  const [mostrarSelectorServicio, setMostrarSelectorServicio] = useState(false);
  const [mostrarSelectorAbono, setMostrarSelectorAbono] = useState(false);
  const [serviciosAbonables, setServiciosAbonables] = useState([]);
  const [servicioParaAbono, setServicioParaAbono] = useState(null);
  const [montoAbonoServicio, setMontoAbonoServicio] = useState("");
  const [cargandoServiciosListos, setCargandoServiciosListos] = useState(false);
  const [productosCoincidencia, setProductosCoincidencia] = useState([]);
  const [serviciosListos, setServiciosListos] = useState([]);
  const [serviciosPorEntregar, setServiciosPorEntregar] = useState([]);
  const [mostrarComparador, setMostrarComparador] = useState(false);
  const [productoComparar, setProductoComparar] = useState(null);
  const [mostrarVentaExtra, setMostrarVentaExtra] = useState(false);
  const [mostrarPagoFiado, setMostrarPagoFiado] = useState(false);
  const [mostrarPromociones, setMostrarPromociones] = useState(false);
  const [promocionDetectada, setPromocionDetectada] = useState(null);
  const promocionesAvisadasRef = useRef(new Map());
  const [ventaExtraDescripcion, setVentaExtraDescripcion] = useState("");
  const [ventaExtraPrecio, setVentaExtraPrecio] = useState("");
  const [generandoCotizacion, setGenerandoCotizacion] = useState(false);
  const [cotizacionNombre, setCotizacionNombre] = useState("");
  const [cotizacionServicioId, setCotizacionServicioId] = useState("");
  const [serviciosAbiertosCotizacion, setServiciosAbiertosCotizacion] = useState([]);
  const [cargandoServiciosCotizacion, setCargandoServiciosCotizacion] = useState(false);
  const [cotizacionFecha, setCotizacionFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [cotizacionFormaPago, setCotizacionFormaPago] = useState("");
  const [cotizacionNotas, setCotizacionNotas] = useState("");
  const [cotizacionesHistorial, setCotizacionesHistorial] = useState([]);
  const [cargandoCotizaciones, setCargandoCotizaciones] = useState(false);
  const [cotizacionEditandoId, setCotizacionEditandoId] = useState("");
  const [eliminandoCotizacionId, setEliminandoCotizacionId] = useState("");

  // 🔹 Modal Profesional
  const [mostrarPago, setMostrarPago] = useState(false);
  const [mostrarCanjeModal, setMostrarCanjeModal] = useState(false);
  const [tipoPago, setTipoPago] = useState("efectivo");

  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoTarjeta, setMontoTarjeta] = useState(0);
  const [montoTransferencia, setMontoTransferencia] = useState(0);
  const [referenciaPago, setReferenciaPago] = useState("");

  const [descuentoManual, setDescuentoManual] = useState(0);
  const [porcentajeDescuentoManual, setPorcentajeDescuentoManual] = useState(0);
  const [porcentajeDescuentoDraft, setPorcentajeDescuentoDraft] = useState("10");
  const [mostrarDescuentoManual, setMostrarDescuentoManual] = useState(false);
  const [passwordDescuentoManual, setPasswordDescuentoManual] = useState("");
  const [errorDescuentoManual, setErrorDescuentoManual] = useState("");
  const [validandoDescuentoManual, setValidandoDescuentoManual] = useState(false);
  const [reglasDescuento, setReglasDescuento] = useState([]);
  const [reglaDescuentoId, setReglaDescuentoId] = useState("");
  const [usarPuntos, setUsarPuntos] = useState(false);
  const [preferenciaCanje, setPreferenciaCanje] = useState("guardar");
  const [productoCanjeId, setProductoCanjeId] = useState("");
  const [ivaConfig, setIvaConfig] = useState(readIVAConfigStorage);
  const { aplicarIVA, preciosIncluyenImpuestos } = ivaConfig;
  const [cajaCerradaHoy, setCajaCerradaHoy] = useState(false);
  const [corteHoy, setCorteHoy] = useState(null);
  const [mostrarAperturaModal, setMostrarAperturaModal] = useState(false);
  const [fondoInicialApertura, setFondoInicialApertura] = useState("0");
  const [faltaFondoInicial, setFaltaFondoInicial] = useState(false);
  const [esVistaMovil, setEsVistaMovil] = useState(detectarVistaMovilPOS);
  const modoMovilPOS = esVistaMovil
    ? (searchParams.get("modo") === "pos" ? "pos" : "scanner")
    : "desktop";
  const mostrandoEscanerMovil = esVistaMovil && modoMovilPOS === "scanner";
  const mostrandoPOSMovil = esVistaMovil && modoMovilPOS === "pos";
  const uidActual = auth.currentUser?.uid || "";

  const clientesCoincidentesPOS = useMemo(() => {
    const consulta = normalizarBusquedaCliente(busquedaClientePOS);
    const digitos = String(busquedaClientePOS || "").replace(/\D/g, "");
    if (!consulta && !digitos) return [];

    return clientesDisponiblesPOS
      .filter((cliente) => {
        const nombre = normalizarBusquedaCliente(cliente?.nombre);
        const telefono = String(cliente?.telefono || "").replace(/\D/g, "");
        const rfc = normalizarBusquedaCliente(cliente?.rfc || cliente?.RFC);
        return (consulta && nombre.includes(consulta))
          || (digitos && telefono.includes(digitos))
          || (consulta && rfc.includes(consulta));
      })
      .slice(0, 6);
  }, [busquedaClientePOS, clientesDisponiblesPOS]);

  useEffect(() => {
    let activo = true;
    setCargandoClientesPOS(true);
    listarClientes({ max: 100 })
      .then((clientes) => {
        if (!activo) return;
        setClientesDisponiblesPOS(Array.isArray(clientes) ? clientes : []);
        setErrorClientesPOS("");
      })
      .catch((error) => {
        console.error("No se pudieron cargar los clientes del POS:", error);
        if (activo) setErrorClientesPOS("No pudimos cargar los clientes. Intenta de nuevo.");
      })
      .finally(() => {
        if (activo) setCargandoClientesPOS(false);
      });

    return () => { activo = false; };
  }, []);

  useEffect(() => {
    if (!mostrarAccionesRapidas) return undefined;

    const cerrarAlHacerClickFuera = (event) => {
      if (!accionesRapidasRef.current?.contains(event.target)) {
        setMostrarAccionesRapidas(false);
      }
    };
    const cerrarConEscape = (event) => {
      if (event.key === "Escape") setMostrarAccionesRapidas(false);
    };

    document.addEventListener("pointerdown", cerrarAlHacerClickFuera);
    document.addEventListener("keydown", cerrarConEscape);
    return () => {
      document.removeEventListener("pointerdown", cerrarAlHacerClickFuera);
      document.removeEventListener("keydown", cerrarConEscape);
    };
  }, [mostrarAccionesRapidas]);

  useEffect(() => escucharPromocionesDescuentos(
    setReglasDescuento,
    (error) => console.warn("[POS] No se pudieron cargar promociones y descuentos:", error?.code || error),
  ), []);

  useEffect(() => {
    let activo = true;
    obtenerIVAConfig().then((config) => {
      if (activo) setIvaConfig(config);
    });
    return () => { activo = false; };
  }, []);

  const ESTADOS_PERMITIDOS_SERVICIO = new Set(["listo", "cancelado", "no_reparable"]);

  const normalizarEstado = (raw) => {
    return String(raw || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_ ]/g, "")
      .replace(/\s+/g, "_")
      .trim();
  };

  const parseCosto = (raw) => {
    const n = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const parseCantidad = (raw) => {
    const n = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  };

  const normalizarCodigo = (raw) =>
    String(raw ?? "").trim().toLowerCase();

  const actualizarQueryPOS = (mutator) => {
    const params = new URLSearchParams(searchParams);
    mutator(params);
    setSearchParams(params);
  };

  const cambiarModoMovil = (modo) => {
    actualizarQueryPOS((params) => {
      params.set("modo", modo === "pos" ? "pos" : "scanner");
    });
  };

  const opcionesModoMovil = esVistaMovil
    ? [
        {
          key: "scanner",
          label: "Escaner",
          active: modoMovilPOS === "scanner",
          onClick: () => cambiarModoMovil("scanner"),
        },
        {
          key: "pos",
          label: "POS movil",
          active: modoMovilPOS === "pos",
          onClick: () => cambiarModoMovil("pos"),
        },
      ]
    : [];

  useEffect(() => {
    carritoRef.current = carrito;
  }, [carrito]);

  const resolverProductoBoleta = (item, catalogo = []) => {
    const productoId = String(item?.productoId || "").trim();
    if (productoId) {
      const porId = catalogo.find((p) => String(p?.id || "").trim() === productoId);
      if (porId) return porId;
    }

    const codigo = normalizarCodigo(item?.codigo || "");
    if (!codigo) return null;
    return catalogo.find((p) => normalizarCodigo(p?.codigo || "") === codigo) || null;
  };

  const calcularConsumoBoletaServicios = (servicios, catalogo = []) => {
    const consumoPorProducto = new Map();
    const faltantes = [];

    (servicios || []).forEach((servicio) => {
      if (!servicio || servicio.boletaStockAjustado) return;
      const boletaItems = Array.isArray(servicio?.boleta?.items)
        ? servicio.boleta.items
        : [];

      boletaItems.forEach((item) => {
        const cantidad = parseCantidad(item?.cantidad);
        if (cantidad <= 0) return;

        const producto = resolverProductoBoleta(item, catalogo);
        if (!producto?.id) {
          return;
        }

        const prev = consumoPorProducto.get(producto.id) || {
          producto,
          cantidad: 0,
        };
        prev.cantidad += cantidad;
        consumoPorProducto.set(producto.id, prev);
      });
    });

    consumoPorProducto.forEach(({ producto, cantidad }) => {
      const stockActual = Number(producto?.stock || 0);
      if (cantidad > stockActual) {
        faltantes.push({
          nombre: producto?.nombre || producto?.codigo || producto?.id,
          stockActual,
          requerido: cantidad,
        });
      }
    });

    return { consumoPorProducto, faltantes };
  };

  const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value?.toDate === "function") return value.toDate().getTime();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const formatoCierre = (() => {
    const cierre = corteHoy?.cerradoEn;
    if (!cierre) return "";
    const fecha = typeof cierre?.toDate === "function"
      ? cierre.toDate()
      : typeof cierre?.seconds === "number"
      ? new Date(cierre.seconds * 1000)
      : new Date(cierre);
    if (Number.isNaN(fecha.getTime())) return "";
    return fecha.toLocaleString("es-MX");
  })();

  const refrescarEstadoCaja = async () => {
    const [cerrada, corte] = await Promise.all([
      estaCajaCerradaHoy(),
      obtenerCorteCajaDia(),
    ]);
    setCajaCerradaHoy(cerrada);
    setCorteHoy(corte);
    const tieneFondoInicialRegistrado = !!(
      corte &&
      corte.fondoInicialCaja !== undefined &&
      corte.fondoInicialCaja !== null &&
      Number.isFinite(Number(corte.fondoInicialCaja))
    );
    const falta = !cerrada && !tieneFondoInicialRegistrado;
    setFaltaFondoInicial(falta);
    if (falta) {
      setMostrarAperturaModal(true);
    } else {
      setMostrarAperturaModal(false);
    }
  };

  useEffect(() => {
    cargarProductos();
    inputRef.current?.focus();
    refrescarEstadoCaja();

    const timer = setInterval(() => {
      refrescarEstadoCaja();
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setEsVistaMovil(detectarVistaMovilPOS());
  }, []);

  useEffect(() => {
    const termino = busqueda.trim();
    if (cajaCerradaHoy || faltaFondoInicial) return;
    if (!termino) return;

    const terminoNormalizado = termino.toLowerCase();
    const productoPorCodigo = productosDB.find((p) =>
      String(p.codigo ?? "").trim().toLowerCase() === terminoNormalizado
    );

    if (!productoPorCodigo) return;

    // Escaner de codigo de barras: espera breve al terminar de escribir y agrega sin Enter.
    const timer = setTimeout(() => {
      agregarAlCarrito(productoPorCodigo);
      setBusqueda("");
      inputRef.current?.focus();
    }, 120);

    return () => clearTimeout(timer);
  }, [busqueda, productosDB, cajaCerradaHoy, faltaFondoInicial]);

  useEffect(() => {
    if (!cajaCerradaHoy) return;
    setMostrarPago(false);
    setTipoPago("efectivo");
    setCarrito([]);
    setServiciosPorEntregar([]);
    setBusqueda("");
    setClienteTelefono("");
    setClienteData(null);
    setClienteBuscado(false);
    setMostrarAltaCliente(false);
    setNuevoCliente(createClienteDraft(""));
    setBusquedaClientePOS("");
    setMensajeClientePOS("");
    setErrorClientesPOS("");
  }, [cajaCerradaHoy]);

  const cargarProductos = async () => {
    const data = await obtenerProductos();
    setProductosDB(data);
  };

  /* ================= CLIENTE ================= */

  const abrirAltaCliente = ({ vacio = false } = {}) => {
    const consulta = vacio ? "" : String(busquedaClientePOS || "").trim();
    const telefonoConsulta = normalizarTelefonoCliente(consulta);
    const pareceTelefono = telefonoConsulta.length > 0 && /^[\d\s()+-]+$/.test(consulta);
    setNuevoCliente({
      ...createClienteDraft(vacio ? "" : clienteTelefono || (pareceTelefono ? telefonoConsulta : "")),
      nombre: pareceTelefono ? "" : consulta,
    });
    if (vacio) setBusquedaClientePOS("");
    setMostrarAltaCliente(true);
    setMensajeClientePOS("");
    setErrorClientesPOS("");
  };

  const cerrarAltaCliente = () => {
    setMostrarAltaCliente(false);
    setNuevoCliente(createClienteDraft(clienteTelefono));
    setErrorClientesPOS("");
  };

  const seleccionarClienteDesdePanel = (cliente) => {
    const telefono = normalizarTelefonoCliente(cliente?.telefono || "");
    setClienteTelefono(telefono);
    setClienteData(cliente || null);
    setClienteBuscado(Boolean(cliente));
    setMostrarAltaCliente(false);
    setBusquedaClientePOS("");
    setMostrarDetallesClientePOS(false);
    setMensajeClientePOS(cliente ? "Cliente seleccionado para esta venta." : "");
    setNuevoCliente(createClienteDraft(telefono));
    if (cliente?.id) {
      setClientesDisponiblesPOS((actuales) => [
        cliente,
        ...actuales.filter((item) => item.id !== cliente.id),
      ]);
    }
    actualizarQueryPOS((params) => {
      params.delete("vista");
      if (!esVistaMovil) {
        params.delete("modo");
      }
    });
  };

  const quitarClienteDeVenta = () => {
    setClienteTelefono("");
    setClienteData(null);
    setClienteBuscado(false);
    setMostrarDetallesClientePOS(false);
    setMensajeClientePOS("Cliente retirado de la venta.");
  };

  const actualizarNuevoCliente = (key, value) => {
    setNuevoCliente((prev) => ({
      ...prev,
      [key]: key === "telefono" ? normalizarTelefonoCliente(value) : value,
    }));
  };

  const guardarNuevoCliente = async () => {
    const nombre = String(nuevoCliente.nombre || "").trim();
    const telefono = normalizarTelefonoCliente(nuevoCliente.telefono);
    const direccion = String(nuevoCliente.direccion || "").trim();

    setErrorClientesPOS("");
    setMensajeClientePOS("");

    if (!nombre || !telefono) {
      setErrorClientesPOS("Escribe el nombre y un teléfono de 10 dígitos.");
      return;
    }

    if (telefono.length < 10) {
      setErrorClientesPOS("El teléfono debe tener 10 dígitos.");
      return;
    }

    try {
      setGuardandoCliente(true);

      const existente = await buscarClientePorTelefono(telefono);
      if (existente) {
        setClienteTelefono(existente.telefono || telefono);
        setClienteData(existente);
        setClienteBuscado(true);
        setMostrarAltaCliente(false);
        setBusquedaClientePOS("");
        setClientesDisponiblesPOS((actuales) => [
          existente,
          ...actuales.filter((item) => item.id !== existente.id),
        ]);
        setMensajeClientePOS("Ese teléfono ya estaba registrado. Seleccionamos al cliente existente.");
        if (tipoPago === "fiado") setMostrarPago(true);
        return;
      }

      const nuevo = await crearCliente({
        nombre,
        telefono,
        direccion,
      });

      setClienteTelefono(telefono);
      const clienteCreado = {
        id: nuevo.id,
        nombre,
        telefono,
        direccion,
        puntos: 0,
      };
      setClienteData(clienteCreado);
      setClienteBuscado(true);
      setMostrarAltaCliente(false);
      setBusquedaClientePOS("");
      setNuevoCliente(createClienteDraft(""));
      setClientesDisponiblesPOS((actuales) => [clienteCreado, ...actuales]);
      setMensajeClientePOS("Cliente guardado y seleccionado para esta venta.");
      if (tipoPago === "fiado") setMostrarPago(true);
    } catch (error) {
      console.error("No se pudo crear el cliente desde POS:", error);
      setErrorClientesPOS("No se pudo guardar el cliente. Revisa los datos e intenta de nuevo.");
    } finally {
      setGuardandoCliente(false);
    }
  };

  const cargarServiciosListosParaCobro = async () => {
    setCargandoServiciosListos(true);
    try {
      const pendientes = await listarServiciosPendientes();
      const listos = pendientes
        .filter((s) => ESTADOS_PERMITIDOS_SERVICIO.has(normalizarEstado(s?.status)))
        .filter((s) => !s?.cobradoEnPOS)
        .filter((s) => Math.max(0, parseCosto(s?.costo) - Number(s?.totalAbonado || 0)) > 0)
        .sort((a, b) => toMillis(b?.updatedAt || b?.createdAt) - toMillis(a?.updatedAt || a?.createdAt));

      setServiciosListos(listos);
    } catch (err) {
      console.error("Error cargando servicios listos:", err);
      alert("No se pudieron cargar los servicios listos.");
    } finally {
      setCargandoServiciosListos(false);
    }
  };

  const abrirSelectorServiciosListos = async () => {
    if (!serviciosHabilitados) return;
    if (cajaCerradaHoy || faltaFondoInicial) {
      if (cajaCerradaHoy) {
        alert("La caja de hoy ya esta cerrada. Las ventas se habilitan de nuevo manana.");
      } else {
        alert("Captura el fondo inicial de caja para comenzar ventas del dia.");
        setMostrarAperturaModal(true);
      }
      return;
    }

    setMostrarSelectorServicio(true);
    await cargarServiciosListosParaCobro();
  };

  const abrirSelectorAbonosServicio = async () => {
    if (!serviciosHabilitados) return;
    if (cajaCerradaHoy || faltaFondoInicial) {
      if (cajaCerradaHoy) alert("La caja de hoy ya esta cerrada.");
      else setMostrarAperturaModal(true);
      return;
    }
    setMostrarSelectorAbono(true);
    setCargandoServiciosListos(true);
    try {
      const servicios = await listarServiciosPendientes();
      setServiciosAbonables(servicios.filter((item) => !item?.cobradoEnPOS));
    } catch (error) {
      console.error("No se pudieron cargar los servicios para abono:", error);
      alert("No se pudieron cargar los servicios.");
    } finally {
      setCargandoServiciosListos(false);
    }
  };

  const seleccionarServicioParaAbono = (servicio) => {
    setMostrarSelectorAbono(false);
    setServicioParaAbono(servicio);
    setMontoAbonoServicio("");
  };

  const agregarAbonoServicioAlCarrito = async () => {
    const monto = Math.round(Number(String(montoAbonoServicio).replace(",", ".")) * 100) / 100;
    if (!servicioParaAbono || !Number.isFinite(monto) || monto <= 0) {
      alert("Ingresa un abono mayor que cero.");
      return;
    }
    const itemId = `abono-servicio-${servicioParaAbono.id}`;
    setCarrito((actual) => {
      const existente = actual.find((item) => item.id === itemId);
      const partida = {
        id: itemId,
        codigo: servicioParaAbono.folio || "-",
        nombre: `Abono servicio ${servicioParaAbono.folio || ""} - ${servicioParaAbono.nombre || "Cliente"}`.trim(),
        precioVenta: monto,
        cantidad: 1,
        stock: 1,
        esAbonoServicio: true,
        tipoImpuesto: "NO_OBJETO",
        servicioId: servicioParaAbono.id,
        servicioFolio: servicioParaAbono.folio || "-",
      };
      return existente ? actual.map((item) => item.id === itemId ? partida : item) : [...actual, partida];
    });
    await vincularClienteDesdeServicio(servicioParaAbono);
    setServicioParaAbono(null);
    setMontoAbonoServicio("");
  };

  useEffect(() => {
    const folioAbono = String(searchParams.get("abonarServicio") || "").trim();
    if (!folioAbono || !serviciosHabilitados) return;
    let cancelado = false;
    buscarServicioPorFolio(folioAbono)
      .then((servicio) => {
        if (!cancelado && servicio && !servicio.cobradoEnPOS) seleccionarServicioParaAbono(servicio);
      })
      .catch((error) => console.error("No se pudo abrir el servicio para abono:", error))
      .finally(() => {
        if (!cancelado) {
          const siguientes = new URLSearchParams(searchParams);
          siguientes.delete("abonarServicio");
          setSearchParams(siguientes, { replace: true });
        }
      });
    return () => { cancelado = true; };
  }, [searchParams, serviciosHabilitados, setSearchParams]);

  const vincularClienteDesdeServicio = async (servicio) => {
    const telefonoServicio = String(servicio?.telefono || "").trim();
    let cliente = null;

    try {
      if (servicio?.clienteId) {
        cliente = await obtenerClientePorId(servicio.clienteId);
      }

      if (!cliente && telefonoServicio) {
        cliente = await buscarClientePorTelefono(telefonoServicio);
      }
    } catch (err) {
      console.error("No se pudo resolver cliente del servicio:", err);
    }

    setClienteTelefono(cliente?.telefono || telefonoServicio);
    setClienteData(cliente || null);
    setClienteBuscado(Boolean(cliente || telefonoServicio));
    setMostrarAltaCliente(false);
    setBusquedaClientePOS("");
  };

  const agregarServicioAlCarrito = async (
    servicio,
    { autocompletarCliente = false, silencioso = false } = {}
  ) => {
    if (!servicio) return false;

    const estado = normalizarEstado(servicio.status);
    const costoServicio = parseCosto(servicio.costo);
    const totalAbonadoServicio = Math.max(0, Number(servicio.totalAbonado || 0));
    const saldoServicio = Math.max(0, costoServicio - totalAbonadoServicio);
    const itemId = `servicio-${servicio.id}`;

    if (estado === "entregado" || servicio?.cobradoEnPOS) {
      if (!silencioso) alert("Este servicio ya fue cobrado/entregado.");
      return false;
    }

    if (!ESTADOS_PERMITIDOS_SERVICIO.has(estado) || costoServicio <= 0) {
      if (!silencioso) {
        alert("Solo se pueden cobrar servicios en estado Listo, Cancelado o No reparable con costo valido.");
      }
      return false;
    }

    if (saldoServicio <= 0) {
      if (!silencioso) alert("Este servicio ya no tiene saldo pendiente. Revisa los abonos registrados.");
      return false;
    }

    if (carritoRef.current.some((p) => p.id === itemId)) {
      if (!silencioso) alert("Ese servicio ya esta agregado al carrito.");
      return false;
    }

    setCarrito((prev) => [
      ...(prev.some((p) => p.id === itemId)
        ? prev
        : [
            ...prev,
            {
              id: itemId,
              codigo: servicio.folio || "-",
              nombre: `Servicio ${servicio.folio || ""} - ${servicio.nombre || "Cliente"}`.trim(),
              precioVenta: saldoServicio,
              cantidad: 1,
              stock: 1,
              esServicio: true,
              servicioId: servicio.id,
              servicioFolio: servicio.folio || "-",
              costoServicioOriginal: costoServicio,
              totalAbonadoServicio,
            },
          ]),
    ]);

    setServiciosPorEntregar((prev) => {
      if (prev.some((s) => s.id === servicio.id)) return prev;
      return [...prev, servicio];
    });

    if (autocompletarCliente) {
      await vincularClienteDesdeServicio(servicio);
    }

    return true;
  };

  /* ================= PRODUCTOS ================= */

  const buscarYAgregarPorTermino = async (
    terminoRaw,
    { mostrarAlertas = true, permitirBusquedaNombre = true } = {}
  ) => {
    if (cajaCerradaHoy || faltaFondoInicial) {
      const msg = cajaCerradaHoy
        ? "La caja de hoy ya esta cerrada. Las ventas se habilitan de nuevo manana."
        : "Captura el fondo inicial de caja para comenzar ventas del dia.";

      if (mostrarAlertas) {
        alert(msg);
        if (faltaFondoInicial) setMostrarAperturaModal(true);
      }

      return { ok: false, message: msg };
    }

    const termino = String(terminoRaw || "").trim();
    if (!termino) {
      return { ok: false, message: "Ingresa un codigo o folio." };
    }

    const terminoNormalizado = termino.toLowerCase();

    const productoPorCodigo = productosDB.find((p) =>
      String(p.codigo ?? "").trim().toLowerCase() === terminoNormalizado
    );

    if (productoPorCodigo) {
      agregarAlCarrito(productoPorCodigo);
      return {
        ok: true,
        tipo: "producto",
        label: productoPorCodigo?.codigo || productoPorCodigo?.nombre || termino,
      };
    }

    if (serviciosHabilitados) {
      const servicio = await buscarServicioPorFolio(termino);

      if (servicio) {
        const agregado = await agregarServicioAlCarrito(servicio, {
          autocompletarCliente: true,
          silencioso: !mostrarAlertas,
        });
        if (!agregado) {
          return {
            ok: false,
            message: "El servicio no se pudo agregar. Debe estar en estado Listo, Cancelado o No reparable y no haberse cobrado.",
          };
        }
        return {
          ok: true,
          tipo: "servicio",
          label: servicio?.folio || termino,
        };
      }
    }

    if (!permitirBusquedaNombre) {
      return {
        ok: false,
        message: serviciosHabilitados
          ? "No se encontro un producto o servicio con ese codigo."
          : "No se encontro un producto con ese codigo.",
      };
    }

    const coincidencias = productosDB.filter((p) =>
      String(p.nombre ?? "").toLowerCase().includes(terminoNormalizado)
    );

    if (coincidencias.length === 0) {
      if (mostrarAlertas) alert("Producto no encontrado");
      return {
        ok: false,
        message: serviciosHabilitados
          ? "No se encontro un producto o servicio con ese codigo."
          : "No se encontro un producto con ese codigo.",
      };
    }

    if (coincidencias.length === 1) {
      agregarAlCarrito(coincidencias[0]);
      return {
        ok: true,
        tipo: "producto",
        label: coincidencias[0]?.codigo || coincidencias[0]?.nombre || termino,
      };
    }

    setProductosCoincidencia(coincidencias);
    setMostrarSelectorProducto(true);

    return {
      ok: true,
      tipo: "selector",
      label: "Selecciona el producto correcto en la lista.",
    };
  };

  useEffect(() => {
    if (!uidActual || esVistaMovil) return undefined;

    const unsubscribe = suscribirScansPosUsuario(
      uidActual,
      (scans) => {
        if (cajaCerradaHoy || faltaFondoInicial) return;

        const pendientes = (scans || [])
          .filter((s) => String(s?.status || "") === "pending")
          .filter((s) => String(s?.termino || "").trim() !== "")
          .sort((a, b) => toMillis(a?.createdAt) - toMillis(b?.createdAt));

        pendientes.forEach((scan) => {
          if (scansProcesandoRef.current.has(scan.id)) return;
          scansProcesandoRef.current.add(scan.id);

          (async () => {
            try {
              const claim = await reclamarScanPosPendiente(
                scan.id,
                posProcessorIdRef.current,
              );
              if (!claim?.ok) return;

              const termino = String(
                claim?.scan?.termino || scan?.termino || "",
              ).trim();
              if (!termino) {
                await finalizarScanPos(scan.id, {
                  status: "error",
                  message: "Codigo vacio.",
                });
                return;
              }

              const result = await buscarYAgregarPorTermino(termino, {
                mostrarAlertas: false,
                permitirBusquedaNombre: false,
              });

              if (result?.ok) {
                await finalizarScanPos(scan.id, {
                  status: "processed",
                  result,
                });
              } else {
                await finalizarScanPos(scan.id, {
                  status: "error",
                  message:
                    result?.message ||
                    "No se pudo agregar al carrito en POS escritorio.",
                });
              }
            } catch (err) {
              console.error("Error procesando scan remoto:", err);
              try {
                await finalizarScanPos(scan.id, {
                  status: "error",
                  message: err?.message || "Error procesando scan remoto.",
                });
              } catch (innerErr) {
                console.error("No se pudo cerrar scan remoto:", innerErr);
              }
            } finally {
              scansProcesandoRef.current.delete(scan.id);
            }
          })();
        });
      },
      (err) => {
        console.error("Error suscribiendo scans POS remotos:", err);
      },
    );

    return () => {
      unsubscribe?.();
      scansProcesandoRef.current.clear();
    };
  }, [uidActual, esVistaMovil, cajaCerradaHoy, faltaFondoInicial, productosDB]); // eslint-disable-line react-hooks/exhaustive-deps

  const buscarYAgregarProducto = async () => {
    const result = await buscarYAgregarPorTermino(busqueda, { mostrarAlertas: true });
    if (!result.ok) return;

    if (result.tipo !== "selector") {
      setBusqueda("");
    }
    inputRef.current?.focus();
  };

  const seleccionarProductoCoincidencia = (producto) => {
    agregarAlCarrito(producto);
    setMostrarSelectorProducto(false);
    setProductosCoincidencia([]);
    setBusqueda("");
    inputRef.current?.focus();
  };

  const seleccionarServicioListo = async (servicio) => {
    const agregado = await agregarServicioAlCarrito(servicio, { autocompletarCliente: true });
    if (!agregado) return;

    setServiciosListos((prev) => prev.filter((s) => s.id !== servicio.id));
    setMostrarSelectorServicio(false);
    setBusqueda("");
    inputRef.current?.focus();
  };

  const cerrarVentaExtra = () => {
    setMostrarVentaExtra(false);
    setVentaExtraDescripcion("");
    setVentaExtraPrecio("");
    inputRef.current?.focus();
  };

  const agregarVentaExtra = (event) => {
    event.preventDefault();
    if (cajaCerradaHoy || faltaFondoInicial) return;

    const descripcion = String(ventaExtraDescripcion || "").trim();
    const precio = Number(String(ventaExtraPrecio || "").trim().replace(",", "."));

    if (!descripcion) {
      alert("Ingresa una descripcion para la venta extra.");
      return;
    }

    if (!Number.isFinite(precio) || precio <= 0) {
      alert("Ingresa un precio valido mayor que cero.");
      return;
    }

    setCarrito((prev) => [
      ...prev,
      {
        id: `venta-extra-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        nombre: descripcion,
        descripcion,
        codigo: "",
        precioVenta: Math.round(precio * 100) / 100,
        cantidad: 1,
        esVentaExtra: true,
      },
    ]);
    cerrarVentaExtra();
  };

  const agregarAlCarrito = (producto) => {
    if (cajaCerradaHoy || faltaFondoInicial) return;

    if (producto.esServicio) {
      const yaExiste = carrito.some((p) => p.id === producto.id);
      if (yaExiste) {
        alert("Ese servicio ya esta agregado al carrito.");
        return;
      }

      setCarrito([...carrito, { ...producto, cantidad: 1 }]);
      return;
    }

    const existe = carrito.find(p => p.id === producto.id);

    if (existe) {
      if (existe.cantidad >= producto.stock) {
        alert("No hay más stock disponible");
        return;
      }

      setCarrito(carrito.map(p =>
        p.id === producto.id
          ? { ...p, cantidad: p.cantidad + 1 }
          : p
      ));

    } else {
      if (producto.stock <= 0) {
        alert("Sin stock disponible");
        return;
      }

      setCarrito([...carrito, { ...producto, cantidad: 1 }]);
    }
  };

  const eliminarDelCarrito = (id) => {
    if (cajaCerradaHoy || faltaFondoInicial) return;

    if (itemCanjeVenta?.id === id) {
      guardarPuntosParaDespues();
      return;
    }

    const item = carrito.find((p) => p.id === id);

    if (item?.esServicio && item?.servicioId) {
      setServiciosPorEntregar((prev) => prev.filter((s) => s.id !== item.servicioId));
    }

    setCarrito(carrito.filter(p => p.id !== id));
  };

  const abrirComparador = (item) => {
    if (item?.esServicio || item?.esVentaExtra) {
      alert("La comparativa por marketplace aplica solo para productos de inventario.");
      return;
    }

    setProductoComparar(item);
    setMostrarComparador(true);
  };

  const agregarPagoFiadoAlCarrito = (cuenta, monto) => {
    if (carrito.some((item) => item.esPagoFiado && item.fiadoId === cuenta.id)) {
      alert("Esta cuenta de fiado ya está agregada al cobro.");
      return;
    }
    setCarrito((actual) => [...actual, {
      id: `pago-fiado-${cuenta.id}`,
      nombre: `Abono fiado · ${cuenta.clienteNombre}`,
      codigo: "PAGO-FIADO",
      precioVenta: Number(monto),
      cantidad: 1,
      stock: 1,
      tipoImpuesto: "NO_OBJETO",
      iva: 0,
      esPagoFiado: true,
      fiadoId: cuenta.id,
      clienteIdFiado: cuenta.clienteId,
      saldoFiadoAnterior: Number(cuenta.saldo || 0),
    }]);
    setMostrarPagoFiado(false);
  };

  const vaciarPOS = () => {
    setCarrito([]); setServiciosPorEntregar([]); setClienteTelefono(""); setClienteData(null);
    setClienteBuscado(false); setPreferenciaCanje("guardar"); setProductoCanjeId("");
    setMostrarAltaCliente(false); setNuevoCliente(createClienteDraft(""));
    setBusquedaClientePOS(""); setMensajeClientePOS("");
    setErrorClientesPOS(""); setMostrarDetallesClientePOS(false);
  };

  const puntosCliente = Number(clienteData?.puntos || 0);

  const inventarioReservado = useMemo(() => {
    const reservados = new Map();

    carrito.forEach((item) => {
      if (item?.esServicio || item?.esVentaExtra || item?.esPagoFiado) return;
      const productoId = String(item?.id || "").trim();
      const cantidad = parseCantidad(item?.cantidad);
      if (!productoId || cantidad <= 0) return;
      reservados.set(productoId, (reservados.get(productoId) || 0) + cantidad);
    });

    const consumoBoleta = calcularConsumoBoletaServicios(serviciosPorEntregar, productosDB);
    consumoBoleta.consumoPorProducto.forEach(({ cantidad }, productoId) => {
      const qty = parseCantidad(cantidad);
      if (qty <= 0) return;
      reservados.set(productoId, (reservados.get(productoId) || 0) + qty);
    });

    return reservados;
  }, [carrito, productosDB, serviciosPorEntregar]);

  const productosCanjeables = useMemo(() => {
    const productosMap = new Map(
      productosDB.map((producto) => [String(producto?.id || "").trim(), producto]),
    );

    const normalizarDisponible = (producto, puntosForzados = null) => {
      const base = normalizarProductoCanje(producto, puntosForzados);
      if (!base.id) return null;

      const reservados = inventarioReservado.get(base.id) || 0;
      const stockDisponible = Math.max(0, Number(base.stock || 0) - reservados);

      if (stockDisponible <= 0) return null;

      return {
        ...base,
        stockDisponible,
      };
    };

    if (Array.isArray(catalogoCanjes) && catalogoCanjes.length > 0) {
      return catalogoCanjes
        .filter((item) => item?.activo !== false && item?.productId)
        .map((item) => {
          const producto = productosMap.get(String(item?.productId || "").trim());
          if (!producto) return null;

          return normalizarDisponible(
            {
              ...producto,
              nombre: item?.nombreProducto || producto?.nombre,
            },
            item?.puntos,
          );
        })
        .filter(Boolean)
        .sort((a, b) => a.puntosRequeridos - b.puntosRequeridos || a.precio - b.precio);
    }

    return productosDB
      .map((producto) => normalizarDisponible(producto))
      .filter(Boolean)
      .sort((a, b) => a.puntosRequeridos - b.puntosRequeridos || a.precio - b.precio)
      .slice(0, 8);
  }, [catalogoCanjes, inventarioReservado, productosDB]);

  const canjesDisponibles = useMemo(
    () => productosCanjeables.filter((producto) => puntosCliente >= producto.puntosRequeridos),
    [productosCanjeables, puntosCliente],
  );

  const siguienteCanjeDisponible = useMemo(
    () =>
      productosCanjeables.find((producto) => puntosCliente < producto.puntosRequeridos) || null,
    [productosCanjeables, puntosCliente],
  );

  const canjeSeleccionado = useMemo(
    () => canjesDisponibles.find((producto) => producto.id === productoCanjeId) || null,
    [canjesDisponibles, productoCanjeId],
  );

  const canjeActivo = Boolean(
    clienteData && preferenciaCanje === "canjear" && canjeSeleccionado,
  );

  useEffect(() => {
    const atajosPOS = (event) => {
      // El modal de cobro tiene sus propios atajos. Mientras esté abierto,
      // F1 debe confirmar el pago y no ejecutar "Venta extra" en segundo plano.
      if (mostrarPago) return;
      // F5 pertenece a "Abonar servicio" dentro del POS; evita recargar la página.
      if (event.key === "F5" && serviciosHabilitados) event.preventDefault();
      const tag = String(event.target?.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]:not(.pos-quick-actions-modal)')) return;
      const cajaBloqueada = cajaCerradaHoy || faltaFondoInicial;
      if (/^F[1-7]$/.test(event.key)) setMostrarAccionesRapidas(false);
      if (event.key === "F1" && !cajaBloqueada) { event.preventDefault(); setMostrarVentaExtra(true); }
      if (event.key === "F2" && funcionesPOS.promocionesDescuentos) { event.preventDefault(); setMostrarPromociones(true); }
      if (event.key === "F3" && serviciosHabilitados && !cajaBloqueada) { event.preventDefault(); abrirSelectorServiciosListos(); }
      if (event.key === "F4" && funcionesPOS.fiado && !cajaBloqueada) { event.preventDefault(); setMostrarPagoFiado(true); }
      if (event.key === "F5" && serviciosHabilitados && !cajaBloqueada) { event.preventDefault(); abrirSelectorAbonosServicio(); }
      if (event.key === "F6" && funcionesPOS.promocionesDescuentos && !cajaBloqueada) { event.preventDefault(); abrirDescuentoManual(); }
      if (event.key === "F7" && !cajaBloqueada) { event.preventDefault(); abrirAltaCliente({ vacio: true }); }
      if (event.code === "Space") {
        if (cajaBloqueada) return;
        event.preventDefault();
        const hayCanjeActivo = Boolean(
          clienteData && preferenciaCanje === "canjear" && canjeSeleccionado,
        );
        if (carrito.length === 0 && !hayCanjeActivo) return alert("Agrega un producto antes de realizar la venta.");
        setMostrarPago(true);
      }
      if (event.key === "Delete" && !cajaBloqueada) { event.preventDefault(); vaciarPOS(); }
    };
    window.addEventListener("keydown", atajosPOS);
    return () => window.removeEventListener("keydown", atajosPOS);
  }, [carrito.length, clienteData, preferenciaCanje, canjeSeleccionado, serviciosHabilitados, cajaCerradaHoy, faltaFondoInicial, mostrarPago]); // eslint-disable-line react-hooks/exhaustive-deps

  const puntosCanjeados = canjeActivo ? canjeSeleccionado.puntosRequeridos : 0;

  const itemCanjeVenta = canjeActivo
    ? {
        id: `canje-${canjeSeleccionado.id}`,
        productoId: canjeSeleccionado.id,
        nombre: `${canjeSeleccionado.nombre} (Canje por puntos)`,
        precioVenta: 0,
        cantidad: 1,
        stock: canjeSeleccionado.stockDisponible,
        esCanje: true,
        puntosCanjeados: canjeSeleccionado.puntosRequeridos,
      }
    : null;

  const productosVenta = itemCanjeVenta ? [...carrito, itemCanjeVenta] : carrito;

  const seleccionarCanje = (productoId) => {
    if (!productoId) return;
    setProductoCanjeId(productoId);
    setPreferenciaCanje("canjear");
    setMostrarCanjeModal(false);
  };

  const guardarPuntosParaDespues = () => {
    setPreferenciaCanje("guardar");
    setProductoCanjeId("");
    setMostrarCanjeModal(false);
  };

  useEffect(() => {
    if (!clienteData?.id) return;
    setPreferenciaCanje("guardar");
    setProductoCanjeId("");
  }, [clienteData?.id]);

  useEffect(() => {
    if (!clienteData) {
      setPreferenciaCanje("guardar");
      setProductoCanjeId("");
      setMostrarCanjeModal(false);
      ultimoClienteCanjePromptRef.current = "";
      return;
    }

    setProductoCanjeId((prev) => {
      if (!canjesDisponibles.length) return "";
      return canjesDisponibles.some((producto) => producto.id === prev)
        ? prev
        : canjesDisponibles[0].id;
    });

    if (preferenciaCanje === "canjear" && canjesDisponibles.length === 0) {
      setPreferenciaCanje("guardar");
    }
  }, [canjesDisponibles, clienteData, preferenciaCanje]);

  useEffect(() => {
    if (!mostrarProgramaCliente || !clienteData?.id) return;
    if (cajaCerradaHoy || faltaFondoInicial) return;
    if (canjesDisponibles.length === 0) return;
    if (ultimoClienteCanjePromptRef.current === clienteData.id) return;

    ultimoClienteCanjePromptRef.current = clienteData.id;
    setMostrarCanjeModal(true);
  }, [
    cajaCerradaHoy,
    canjesDisponibles.length,
    clienteData?.id,
    faltaFondoInicial,
    mostrarProgramaCliente,
  ]);

  useEffect(() => {
    if (!mostrarProgramaCliente || !clienteData || canjesDisponibles.length > 0) return;
    setMostrarCanjeModal(false);
  }, [canjesDisponibles.length, clienteData, mostrarProgramaCliente]);

  useEffect(() => {
    let cancelado = false;

    const cargarResumenCliente = async () => {
      if (!clienteData?.id) {
        setClienteVentasHistorial([]);
        setClienteServiciosHistorial([]);
        setClienteResumenLoading(false);
        return;
      }

      setClienteResumenLoading(true);
      try {
        const [ventas, servicios] = await Promise.all([
          listarVentasPorCliente({
            clienteId: clienteData.id,
            telefono: clienteData.telefono || clienteTelefono || "",
          }),
          serviciosHabilitados
            ? listarServiciosPorClienteId(clienteData.id)
            : Promise.resolve([]),
        ]);

        if (cancelado) return;
        setClienteVentasHistorial(Array.isArray(ventas) ? ventas : []);
        setClienteServiciosHistorial(Array.isArray(servicios) ? servicios : []);
      } catch (error) {
        if (cancelado) return;
        console.error("No se pudo cargar el resumen del cliente en POS:", error);
        setClienteVentasHistorial([]);
        setClienteServiciosHistorial([]);
      } finally {
        if (!cancelado) {
          setClienteResumenLoading(false);
        }
      }
    };

    cargarResumenCliente();

    return () => {
      cancelado = true;
    };
  }, [clienteData?.id, clienteData?.telefono, clienteTelefono, serviciosHabilitados]);

  /* ================= TOTALES PROFESIONALES ================= */

  const subtotal = carrito.reduce(
    (acc, p) => acc + p.precioVenta * p.cantidad,
    0
  );

  const hoyDescuento = fechaLocalISO();
  const puedeAutorizarDescuentos = puede("descuentos.gestionar") || puede("promociones.gestionar");
  const reglasVigentes = funcionesPOS.promocionesDescuentos ? reglasDescuento.filter((regla) => (
    regla.activo !== false
    && String(regla.fechaInicio || "") <= hoyDescuento
    && String(regla.fechaFin || "") >= hoyDescuento
    && (regla.clase === "promocion" || regla.autorizacion === "sin_autorizacion" || puedeAutorizarDescuentos)
  )) : [];
  const promocionesVigentes = reglasVigentes.filter((regla) => regla.clase === "promocion");

  useEffect(() => {
    const promocionesAlcanzadas = promocionesVigentes.map((regla) => {
      const reglaId = String(regla.id);
      const beneficiadoEnCarrito = carrito.find((item) => String(item.id) === String(regla.productoBeneficiadoId));
      const regalosPrevios = Number(beneficiadoEnCarrito?.regalosPromocion?.[reglaId] || 0);
      const ciclos = calcularCiclosPromocion(regla, carrito);
      const regalosEsperados = ciclos * Math.max(1, Number(regla.cantidadBeneficiada) || 1);
      return { regla, regalosPrevios, regalosEsperados };
    }).filter((item) => item.regalosEsperados > 0);
    const idsAlcanzados = new Set(promocionesAlcanzadas.map(({ regla }) => String(regla.id)));

    promocionesAvisadasRef.current.forEach((cantidad, id) => {
      if (!idsAlcanzados.has(id)) promocionesAvisadasRef.current.delete(id);
    });

    const nueva = promocionesAlcanzadas.find(
      ({ regla, regalosPrevios, regalosEsperados }) => regalosEsperados > regalosPrevios
        && regalosEsperados > Number(promocionesAvisadasRef.current.get(String(regla.id)) || 0),
    );
    if (nueva) {
      const regla = nueva.regla;
      const reglaId = String(regla.id);
      const productoCatalogo = productosDB.find(
        (producto) => String(producto.id) === String(regla.productoBeneficiadoId),
      );
      const productoActual = carrito.find(
        (producto) => String(producto.id) === String(regla.productoBeneficiadoId),
      );
      const faltantes = nueva.regalosEsperados - nueva.regalosPrevios;
      const disponibles = Math.max(0, Number(productoCatalogo?.stock ?? productoActual?.stock ?? 0) - Number(productoActual?.cantidad || 0));
      const cantidadAgregar = Math.min(faltantes, disponibles);

      promocionesAvisadasRef.current.set(reglaId, nueva.regalosEsperados);
      if (cantidadAgregar > 0 && (productoActual || productoCatalogo)) {
        setCarrito((actual) => {
          const existente = actual.find((producto) => String(producto.id) === String(regla.productoBeneficiadoId));
          if (existente) {
            return actual.map((producto) => String(producto.id) === String(regla.productoBeneficiadoId)
              ? {
                ...producto,
                cantidad: Number(producto.cantidad || 0) + cantidadAgregar,
                regalosPromocion: {
                  ...(producto.regalosPromocion || {}),
                  [reglaId]: nueva.regalosPrevios + cantidadAgregar,
                },
              }
              : producto);
          }
          return [...actual, {
            ...productoCatalogo,
            cantidad: cantidadAgregar,
            regalosPromocion: { [reglaId]: cantidadAgregar },
          }];
        });
      }
      setPromocionDetectada({ ...regla, agregadoAutomaticamente: cantidadAgregar > 0 });
    }
  }, [carrito, productosDB, promocionesVigentes]);
  const reglasCalculadas = reglasVigentes
    .map((regla) => ({ regla, importe: calcularImporteDescuento(regla, carrito, subtotal) }))
    .filter((item) => item.importe > 0)
    .sort((a, b) => b.importe - a.importe);
  const reglaElegida = reglaDescuentoId
    ? reglasCalculadas.find((item) => item.regla.id === reglaDescuentoId)
    : reglasCalculadas[0];
  const reglaDescuento = reglaElegida?.regla || null;
  const descuentoRegla = reglaElegida?.importe || 0;

  const descuentoPuntos =
    usarPuntos && clienteData
      ? Math.min(clienteData.puntos || 0, subtotal)
      : 0;

  const subtotalConDescuento =
    subtotal - descuentoManual - descuentoRegla - descuentoPuntos;

  useEffect(() => {
    if (descuentoManual <= 0) return;
    const descuentoActualizado = Number((subtotal * (porcentajeDescuentoManual / 100)).toFixed(2));
    if (descuentoActualizado !== descuentoManual) setDescuentoManual(descuentoActualizado);
  }, [subtotal, descuentoManual, porcentajeDescuentoManual]);

  const abrirDescuentoManual = () => {
    if (subtotal <= 0) {
      alert("Agrega productos al carrito antes de aplicar el descuento.");
      return;
    }
    setPasswordDescuentoManual("");
    setPorcentajeDescuentoDraft(porcentajeDescuentoManual > 0 ? String(porcentajeDescuentoManual) : "10");
    setErrorDescuentoManual("");
    setMostrarDescuentoManual(true);
  };

  const autorizarDescuentoManual = async (event) => {
    event.preventDefault();
    setErrorDescuentoManual("");
    const porcentaje = Number(porcentajeDescuentoDraft);
    if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
      setErrorDescuentoManual("Ingresa un porcentaje mayor que 0 y máximo de 100%.");
      return;
    }
    try {
      setValidandoDescuentoManual(true);
      const config = await obtenerConfigDescuentoManual();
      if (!config.configurado) {
        setErrorDescuentoManual("El jefe del sistema aún no ha asignado la contraseña en Configuración > POS.");
        return;
      }
      if (!await validarPasswordDescuentoManual(passwordDescuentoManual, config)) {
        setErrorDescuentoManual("Contraseña incorrecta.");
        return;
      }
      setPorcentajeDescuentoManual(porcentaje);
      setDescuentoManual(Number((subtotal * (porcentaje / 100)).toFixed(2)));
      setMostrarDescuentoManual(false);
      setPasswordDescuentoManual("");
    } catch {
      setErrorDescuentoManual("No se pudo validar la autorización. Intenta de nuevo.");
    } finally {
      setValidandoDescuentoManual(false);
    }
  };

  const factorDescuento = subtotal > 0 ? Math.max(0, subtotalConDescuento / subtotal) : 0;
  const tasasIVAActivas = new Set();
  const calculoIVA = productosVenta.reduce(
    (acc, producto) => {
      const importe = Number(producto?.precioVenta || 0) * Number(producto?.cantidad || 0) * factorDescuento;
      const noObjeto = String(producto?.tipoImpuesto || "").toUpperCase() === "NO_OBJETO";
      const tasa = aplicarIVA && !noObjeto
        ? Math.max(0, Number(producto?.iva ?? IVA_RATE_DEFAULT * 100) / 100)
        : 0;
      if (tasa > 0) tasasIVAActivas.add(tasa);
      const calculoLinea = calcularImpuestosProducto({
        importe,
        cantidad: Number(producto?.cantidad || 0),
        tasaIVA: tasa,
        iepsTipo: String(producto?.iepsTipo || "ninguno"),
        iepsValor: Number(producto?.ieps || 0),
        preciosIncluyenImpuestos,
      });
      return {
        subtotalSinIVA: acc.subtotalSinIVA + calculoLinea.subtotalSinImpuestos,
        ieps: acc.ieps + calculoLinea.ieps,
        iva: acc.iva + calculoLinea.iva,
        total: acc.total + calculoLinea.total,
      };
    },
    { subtotalSinIVA: 0, ieps: 0, iva: 0, total: 0 },
  );
  const ivaRate = tasasIVAActivas.size === 1 ? [...tasasIVAActivas][0] : 0;
  const subtotalFiscal = Number(calculoIVA.subtotalSinIVA.toFixed(2));
  const iva = Number(calculoIVA.iva.toFixed(2));
  const ieps = Number(calculoIVA.ieps.toFixed(2));
  const total = Number(calculoIVA.total.toFixed(2));
  const totalCotizacion = productosVenta.reduce(
    (suma, producto) => suma + Number(producto?.precioVenta || 0) * Number(producto?.cantidad || 0),
    0,
  );

  const cargarHistorialCotizaciones = async () => {
    try {
      setCargandoCotizaciones(true);
      setCotizacionesHistorial(await listarCotizaciones());
    } catch (error) {
      console.error("No se pudo cargar el historial de cotizaciones:", error);
    } finally {
      setCargandoCotizaciones(false);
    }
  };

  useEffect(() => {
    if (!mostrandoCotizacionPOS) return;
    cargarHistorialCotizaciones();
    setCargandoServiciosCotizacion(true);
    listarServiciosPendientes()
      .then((items) => setServiciosAbiertosCotizacion(Array.isArray(items) ? items : []))
      .catch((error) => {
        console.error("No se pudieron cargar los servicios abiertos:", error);
        setServiciosAbiertosCotizacion([]);
      })
      .finally(() => setCargandoServiciosCotizacion(false));
  }, [mostrandoCotizacionPOS]);

  const actualizarPartidaCotizacion = (id, cambios) => {
    setCarrito((prev) => prev.map((item) => (
      item.id === id ? { ...item, ...cambios } : item
    )));
  };

  const agregarRenglonCotizacion = () => {
    setCarrito((prev) => [
      ...prev,
      {
        id: `cotizacion-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        codigo: `P-${String(prev.length + 1).padStart(3, "0")}`,
        nombre: "",
        precioVenta: 0,
        cantidad: 1,
        esCotizacionManual: true,
      },
    ]);
  };

  const generarCotizacion = async () => {
    const nombreCotizacionLimpio = cotizacionNombre.trim();
    if (!nombreCotizacionLimpio) {
      alert("Asigna un nombre a la cotizacion antes de guardarla.");
      return;
    }
    if (productosVenta.length === 0) {
      alert("Agrega al menos un producto o servicio para generar la cotizacion.");
      return;
    }

    const ahora = new Date();
    const folioCotizacion = `COT-${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, "0")}${String(ahora.getDate()).padStart(2, "0")}-${String(ahora.getHours()).padStart(2, "0")}${String(ahora.getMinutes()).padStart(2, "0")}${String(ahora.getSeconds()).padStart(2, "0")}`;

    try {
      setGenerandoCotizacion(true);
      const servicioAsignado = serviciosAbiertosCotizacion.find(
        (servicio) => servicio.id === cotizacionServicioId,
      ) || null;
      const datosCotizacion = {
        tipoDocumento: "cotizacion",
        folio: folioCotizacion,
        nombreCotizacion: nombreCotizacionLimpio,
        servicioId: servicioAsignado?.id || "",
        servicioFolio: servicioAsignado?.folio || "",
        servicioDescripcion: servicioAsignado?.trabajo || servicioAsignado?.tipoDispositivo || "",
        clienteId: clienteData?.id || "",
        nombre: clienteData?.nombre || "Cliente general",
        direccion: clienteData?.direccion || "S/N",
        telefono: clienteData?.telefono || clienteTelefono || "",
        fecha: cotizacionFecha || ahora.toLocaleDateString("es-MX"),
        formaPago: cotizacionFormaPago,
        notas: cotizacionNotas,
        items: productosVenta.map((producto, index) => ({
          item: producto.codigo || `P-${String(index + 1).padStart(3, "0")}`,
          descripcion: producto.nombre || "Articulo",
          cantidad: producto.cantidad || 1,
          pUnitario: producto.precioVenta || 0,
        })),
        total: totalCotizacion,
        tipoNegocioId: tipoNegocioActivo?.id || "",
      };
      const cotizacionId = cotizacionEditandoId
        ? await actualizarCotizacion(cotizacionEditandoId, datosCotizacion)
        : await guardarCotizacion(datosCotizacion);
      setCotizacionEditandoId(cotizacionId);
      if (servicioAsignado) {
        const cotizacionesPrevias = Array.isArray(servicioAsignado.cotizaciones)
          ? servicioAsignado.cotizaciones
          : [];
        await actualizarServicioPorId(servicioAsignado.id, {
          cotizaciones: [
            ...cotizacionesPrevias.filter((item) => item?.id !== cotizacionId),
            {
              id: cotizacionId,
              folio: folioCotizacion,
              nombre: nombreCotizacionLimpio,
              fecha: datosCotizacion.fecha,
              total: totalCotizacion,
            },
          ],
          ...(servicioAsignado.boleta
            ? {}
            : {
                boleta: {
                  cotizacionId,
                  tipoDocumento: "cotizacion",
                  folio: folioCotizacion,
                  fecha: datosCotizacion.fecha,
                  formaPago: datosCotizacion.formaPago,
                  notas: datosCotizacion.notas,
                  items: datosCotizacion.items,
                  total: totalCotizacion,
                },
              }),
        });
      }
      await generarPdfBoletaVenta(datosCotizacion);
      await cargarHistorialCotizaciones();
    } catch (error) {
      console.error("No se pudo generar la cotizacion PDF:", error);
      alert("No se pudo generar la cotizacion. Intenta nuevamente.");
    } finally {
      setGenerandoCotizacion(false);
    }
  };

  const abrirCotizacionGuardada = (cotizacion) => {
    setCotizacionEditandoId(cotizacion?.id || "");
    setCotizacionNombre(cotizacion?.nombreCotizacion || "");
    setCotizacionServicioId(cotizacion?.servicioId || "");
    setCotizacionFecha(String(cotizacion?.fecha || "").slice(0, 10));
    setCotizacionFormaPago(cotizacion?.formaPago || "");
    setCotizacionNotas(cotizacion?.notas || "");
    setClienteTelefono(cotizacion?.telefono || "");
    setClienteData(cotizacion?.clienteId ? {
      id: cotizacion.clienteId,
      nombre: cotizacion.nombre || "Cliente general",
      telefono: cotizacion.telefono || "",
      direccion: cotizacion.direccion || "",
    } : null);
    setCarrito((cotizacion?.items || []).map((item, index) => ({
      id: `cotizacion-historial-${Date.now()}-${index}`,
      codigo: item.item || `P-${String(index + 1).padStart(3, "0")}`,
      nombre: item.descripcion || "",
      precioVenta: Number(item.pUnitario || item.precio || 0),
      cantidad: Number(item.cantidad || 1),
      esCotizacionManual: true,
    })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEliminarCotizacion = async (cotizacion) => {
    if (!cotizacion?.id) return;
    const confirmar = window.confirm(
      `¿Eliminar la cotizacion "${cotizacion.nombreCotizacion || cotizacion.folio || "seleccionada"}"?`,
    );
    if (!confirmar) return;

    try {
      setEliminandoCotizacionId(cotizacion.id);
      await eliminarCotizacion(cotizacion.id);
      if (cotizacionEditandoId === cotizacion.id) setCotizacionEditandoId("");
      await cargarHistorialCotizaciones();
    } catch (error) {
      console.error("No se pudo eliminar la cotizacion:", error);
      alert(error?.message || "No se pudo eliminar la cotizacion.");
    } finally {
      setEliminandoCotizacionId("");
    }
  };

  const descargarCotizacionGuardada = async (cotizacion) => {
    try {
      setGenerandoCotizacion(true);
      await generarPdfBoletaVenta({ ...cotizacion, tipoDocumento: "cotizacion" });
    } catch (error) {
      console.error("No se pudo descargar la cotizacion guardada:", error);
      alert("No se pudo descargar la cotizacion guardada.");
    } finally {
      setGenerandoCotizacion(false);
    }
  };
  const recargoTarjeta = calcularRecargoTarjeta(total, tarjetaRecargoConfig);
  const recargoTarjetaMonto =
    tipoPago === "tarjeta" && recargoTarjeta.habilitado ? recargoTarjeta.recargo : 0;
  const totalCobro = total + recargoTarjetaMonto;

  const totalPagado =
    Number(montoEfectivo) +
    Number(montoTarjeta) +
    Number(montoTransferencia);

  const cambio = totalPagado - totalCobro;

  const basePuntos = carrito
    .filter((item) => !item.esPagoFiado && !item.esAbonoServicio)
    .reduce((suma, item) => suma + Number(item.precioVenta || 0) * Number(item.cantidad || 0), 0);
  const puntosGenerados = Math.floor(basePuntos / 10);
  const clienteComprasResumen = useMemo(
    () => construirResumenComprasCliente(clienteVentasHistorial),
    [clienteVentasHistorial],
  );
  const clienteServiciosResumen = useMemo(
    () => construirResumenServiciosCliente(clienteServiciosHistorial),
    [clienteServiciosHistorial],
  );

  useEffect(() => {
    if (!mostrarPago) return;

    if (tipoPago === "tarjeta") {
      setMontoTarjeta(recargoTarjeta.habilitado ? recargoTarjeta.totalConRecargo : total);
      setMontoEfectivo(0);
      setMontoTransferencia(0);
      return;
    }

    if (tipoPago === "efectivo") {
      setMontoTarjeta(0);
      setMontoTransferencia(0);
      return;
    }

    if (tipoPago === "fiado") {
      setMontoEfectivo(0);
      setMontoTarjeta(0);
      setMontoTransferencia(0);
    }
  }, [mostrarPago, tipoPago, recargoTarjeta.habilitado, recargoTarjeta.totalConRecargo, total]);

  /* ================= VENTA PROFESIONAL ================= */

  const realizarVentaPro = async () => {
    const cerrada = await estaCajaCerradaHoy();
    if (cerrada) {
      setCajaCerradaHoy(true);
      setMostrarPago(false);
      alert("La caja de hoy ya esta cerrada. Intenta nuevamente manana.");
      return;
    }

    if (carrito.length === 0 && !canjeActivo) {
      alert("No hay productos ni canjes seleccionados");
      return;
    }

    if (tipoPago !== "fiado" && totalPagado < totalCobro) {
      alert("Pago insuficiente");
      return;
    }

    if (tipoPago === "fiado") {
      if (carrito.some((item) => item.esPagoFiado)) {
        alert("Un pago de fiado no puede volver a cobrarse como fiado. Selecciona efectivo o tarjeta.");
        return;
      }
      if (carrito.some((item) => item.esAbonoServicio)) {
        alert("Un abono de servicio debe pagarse con efectivo, tarjeta o transferencia; no puede registrarse como fiado.");
        return;
      }
      const telefonoFiado = normalizarTelefonoCliente(clienteData?.telefono || clienteTelefono);
      if (!clienteData?.id || telefonoFiado.length < 10) {
        setMostrarPago(false);
        abrirAltaCliente();
        alert("Para fiar debes seleccionar o crear un cliente con teléfono de 10 dígitos.");
        return;
      }
    }

    if (tipoPago === "tarjeta" && !referenciaPago.trim()) {
      alert("Ingresa la referencia de pago de tarjeta");
      return;
    }

    if (canjeActivo) {
      if (!clienteData?.id) {
        alert("Selecciona un cliente valido para canjear puntos.");
        return;
      }

      if (puntosCliente < puntosCanjeados) {
        alert("El cliente ya no tiene puntos suficientes para este canje.");
        return;
      }

      if (Number(canjeSeleccionado?.stockDisponible || 0) <= 0) {
        alert("El producto seleccionado para canje ya no tiene stock disponible.");
        return;
      }
    }

    const consumoBoleta = calcularConsumoBoletaServicios(
      serviciosPorEntregar,
      productosDB,
    );

    const requeridosPorProducto = new Map();
    const stockMetaPorProducto = new Map();

    productosDB.forEach((producto) => {
      const id = String(producto?.id || "").trim();
      if (!id) return;
      stockMetaPorProducto.set(id, {
        nombre: producto?.nombre || producto?.codigo || id,
        stockActual: Number(producto?.stock || 0),
      });
    });

    carrito.forEach((item) => {
      if (item?.esServicio || item?.esVentaExtra || item?.esPagoFiado || item?.esAbonoServicio) return;
      const id = String(item?.id || "").trim();
      if (!id) return;
      const qty = parseCantidad(item?.cantidad);
      if (qty <= 0) return;

      const prev = requeridosPorProducto.get(id) || 0;
      requeridosPorProducto.set(id, prev + qty);

      if (!stockMetaPorProducto.has(id)) {
        stockMetaPorProducto.set(id, {
          nombre: item?.nombre || item?.codigo || id,
          stockActual: Number(item?.stock || 0),
        });
      }
    });

    if (canjeActivo) {
      const productoId = String(canjeSeleccionado?.id || "").trim();
      if (productoId) {
        const prev = requeridosPorProducto.get(productoId) || 0;
        requeridosPorProducto.set(productoId, prev + 1);

        if (!stockMetaPorProducto.has(productoId)) {
          stockMetaPorProducto.set(productoId, {
            nombre: canjeSeleccionado?.nombre || productoId,
            stockActual: Number(canjeSeleccionado?.stockDisponible || canjeSeleccionado?.stock || 0),
          });
        }
      }
    }

    consumoBoleta.consumoPorProducto.forEach(({ producto, cantidad }, productoId) => {
      const qty = parseCantidad(cantidad);
      if (qty <= 0) return;

      const prev = requeridosPorProducto.get(productoId) || 0;
      requeridosPorProducto.set(productoId, prev + qty);

      if (!stockMetaPorProducto.has(productoId)) {
        stockMetaPorProducto.set(productoId, {
          nombre: producto?.nombre || producto?.codigo || productoId,
          stockActual: Number(producto?.stock || 0),
        });
      }
    });

    const faltantesInventario = [];
    requeridosPorProducto.forEach((requerido, productoId) => {
      const meta = stockMetaPorProducto.get(productoId);
      const stockActual = Number(meta?.stockActual || 0);
      if (requerido > stockActual) {
        faltantesInventario.push({
          nombre: meta?.nombre || productoId,
          stockActual,
          requerido,
        });
      }
    });

    if (faltantesInventario.length > 0) {
      const detalle = faltantesInventario
        .slice(0, 4)
        .map(
          (f) =>
            `- ${f.nombre}: stock ${f.stockActual}, requerido ${f.requerido}`,
        )
        .join("\n");
      alert(
        `No hay stock suficiente para completar la venta.\n${detalle}`,
      );
      return;
    }

    const facturacionCfgVenta = readFacturacionConfigStorage();
    const folioTicket = `${String(facturacionCfgVenta.serie || "A").trim() || "A"}-${String(
      Math.max(1, Number(facturacionCfgVenta.folioActual) || 1),
    ).padStart(6, "0")}`;
    const ventaPayload = {
      folioTicket,
      clienteId: clienteData?.id || null,
      clienteNombre: clienteData?.nombre || null,
      clienteTelefono: clienteTelefono || null,
      subtotal: subtotalFiscal,
      descuentoManual,
      porcentajeDescuentoManual,
      descuentoRegla: Number(descuentoRegla.toFixed(2)),
      promocionDescuentoAplicado: reglaDescuento ? {
        id: reglaDescuento.id,
        nombre: reglaDescuento.nombre,
        clase: reglaDescuento.clase,
        tipo: reglaDescuento.tipo,
        valor: Number(reglaDescuento.valor || 0),
        importe: Number(descuentoRegla.toFixed(2)),
      } : null,
      descuentoPuntos,
      aplicarIVA,
      preciosIncluyenImpuestos,
      ivaPorcentaje: ivaRate,
      iva,
      ieps,
      total: totalCobro,
      totalProductos: total,
      recargoTarjeta: recargoTarjetaMonto,
      tipoPago,
      estadoPago: tipoPago === "fiado" ? "pendiente" : "pagado",
      pagoDetalle: {
        efectivo: montoEfectivo,
        cambio: Math.max(0, cambio),
        tarjeta: montoTarjeta,
        transferencia: montoTransferencia,
        referenciaTarjeta: referenciaPago.trim() || null,
        recargoTarjeta: recargoTarjetaMonto,
        totalSinRecargo: total,
        proveedorRecargoTarjeta: recargoTarjeta.proveedor || null,
        porcentajeRecargoTarjeta: recargoTarjeta.porcentajeTotal,
      },
      puntosGenerados,
      puntosCanjeados,
      canjeAplicado: canjeActivo
        ? {
            productoId: canjeSeleccionado.id,
            nombre: canjeSeleccionado.nombre,
            puntos: canjeSeleccionado.puntosRequeridos,
          }
        : null,
      fecha: new Date(),
      productos: productosVenta,
    };

    let ventaId;
    try {
      if (tipoPago === "fiado") {
        const resultadoFiado = await registrarVentaFiada(ventaPayload, {
          clienteId: clienteData.id,
          clienteNombre: clienteData.nombre,
          clienteTelefono: clienteData.telefono || clienteTelefono,
          monto: totalCobro,
          limiteCredito: totalCobro,
          diasCredito: 30,
          descripcion: `Venta ${folioTicket}`,
          notas: "Cuenta generada automáticamente desde Punto de Venta.",
        });
        ventaId = resultadoFiado.ventaId;
      } else {
        ventaId = await registrarVenta(ventaPayload);
      }
    } catch (error) {
      console.error("No se pudo registrar el cobro:", error);
      alert(error?.code === "permission-denied"
        ? "No se pudo registrar el fiado porque faltan permisos de Firebase. Actualiza las reglas de Firestore e intenta nuevamente."
        : `No se pudo registrar la venta: ${error?.message || "Error desconocido"}`);
      return;
    }
    for (const item of carrito.filter((producto) => producto.esPagoFiado)) {
      try {
        await registrarPagoFiado(item.fiadoId, {
          monto: Number(item.precioVenta) * Number(item.cantidad),
          metodo: tipoPago,
        });
      } catch (error) {
        console.error("No se pudo aplicar el abono de fiado:", error);
        alert(`La venta se registró, pero no se pudo actualizar el fiado de ${item.nombre}. Revisa la cuenta manualmente.`);
      }
    }
    for (const item of carrito.filter((producto) => producto.esAbonoServicio)) {
      try {
        const servicioActual = await buscarServicioPorFolio(item.servicioFolio);
        if (!servicioActual) throw new Error("Servicio no encontrado");
        const monto = Number(item.precioVenta) * Number(item.cantidad);
        const abonosPrevios = Array.isArray(servicioActual.abonos) ? servicioActual.abonos : [];
        const totalAbonado = Number(servicioActual.totalAbonado || 0) + monto;
        const costo = parseCosto(servicioActual.costo);
        await actualizarServicioPorId(servicioActual.id, {
          abonos: [...abonosPrevios, {
            monto,
            metodo: tipoPago,
            ventaId: folioTicket || ventaId,
            fecha: new Date(),
          }],
          totalAbonado,
          saldoPendiente: costo > 0 ? Math.max(0, costo - totalAbonado) : null,
          ultimoAbonoEn: new Date(),
        });
      } catch (error) {
        console.error("No se pudo registrar el abono del servicio:", error);
        alert(`La venta se registró, pero no se pudo aplicar el abono al servicio ${item.servicioFolio}.`);
      }
    }
    if (facturacionCfgVenta.autoIncrement !== false) {
      saveFacturacionConfigStorage({
        ...facturacionCfgVenta,
        folioActual: Math.max(1, Number(facturacionCfgVenta.folioActual) || 1) + 1,
      });
    }

    for (const [productoId, requerido] of requeridosPorProducto.entries()) {
      if (requerido <= 0) continue;
      const stockActual = Number(
        stockMetaPorProducto.get(productoId)?.stockActual || 0,
      );
      const nuevoStock = Math.max(0, stockActual - requerido);
      await descontarStock(productoId, nuevoStock);
      stockMetaPorProducto.set(productoId, {
        ...(stockMetaPorProducto.get(productoId) || {}),
        stockActual: nuevoStock,
      });
    }

    if (clienteData) {

      if (usarPuntos && descuentoPuntos > 0) {
        await sumarPuntosCliente(clienteData.id, -descuentoPuntos);
      }

      if (canjeActivo && puntosCanjeados > 0) {
        await sumarPuntosCliente(clienteData.id, -puntosCanjeados);
      }

      await sumarPuntosCliente(clienteData.id, puntosGenerados);
    }

    for (const servicio of serviciosPorEntregar) {
      const boletaTieneProductosInventario = Array.isArray(servicio?.boleta?.items)
        && servicio.boleta.items.some((item) => {
          const qty = parseCantidad(item?.cantidad);
          if (qty <= 0) return false;
          return !!resolverProductoBoleta(item, productosDB);
        });

      // Marcar como cobrado y entregado exclusivamente desde POS/Ventas.
      await actualizarServicioPorId(servicio.id, {
        status: "entregado",
        cobradoEnPOS: true,
        fechaCobro: new Date(),
        saldoPendiente: 0,
        totalPagado: parseCosto(servicio.costo),
        ...(servicio?.boletaStockAjustado || boletaTieneProductosInventario
          ? {
              boletaStockAjustado: true,
              boletaStockAjustadoAt: new Date(),
            }
          : {}),
      });
    }

    const atendioVenta =
      String(auth.currentUser?.displayName || "").trim() ||
      String(auth.currentUser?.email || "").trim() ||
      "Sin asignar";

    if (imprimirAlCobrar) {
      imprimirTicketVenta({
        ventaId: folioTicket || ventaId,
        fecha: ventaPayload.fecha,
        atendio: atendioVenta,
        cliente: {
          nombre: clienteData?.nombre || "Publico general",
          telefono: clienteTelefono || "-",
        },
        tipoPago,
        referenciaTarjeta: referenciaPago.trim() || "",
        productos: productosVenta,
        estado: tipoPago === "fiado"
          ? "Pendiente de pago"
          : serviciosPorEntregar.length > 0 ? "Entregado" : "Pagado",
        subtotal: subtotalFiscal,
        descuentoManual,
        descuentoRegla,
        promocionNombre: reglaDescuento?.nombre || "",
        aplicaIVA: aplicarIVA,
        ivaPorcentaje: ivaRate,
        iva,
        ieps,
        recargoTarjeta: recargoTarjetaMonto,
        proveedorRecargoTarjeta: recargoTarjeta.proveedor,
        total,
        totalCobro,
        montoRecibido: totalPagado,
        cambio: Math.max(0, cambio),
        preciosIncluyenImpuestos,
      });
    }

    setCarrito([]);
    setClienteTelefono("");
    setClienteData(null);
    setClienteBuscado(false);
    setMostrarPago(false);
    setTipoPago("efectivo");
    setMontoEfectivo(0);
    setMontoTarjeta(0);
    setMontoTransferencia(0);
    setReferenciaPago("");
    setServiciosPorEntregar([]);
    setDescuentoManual(0);
    setPorcentajeDescuentoManual(0);
    setReglaDescuentoId("");
    setUsarPuntos(false);
    setPreferenciaCanje("guardar");
    setProductoCanjeId("");
    setMostrarAltaCliente(false);
    setNuevoCliente(createClienteDraft(""));
    setBusquedaClientePOS("");
    setMensajeClientePOS("");
    setErrorClientesPOS("");
    setMostrarDetallesClientePOS(false);

    cargarProductos();
    inputRef.current?.focus();
  };

  const confirmarApertura = async () => {
    const valorRaw = String(fondoInicialApertura ?? "").replace(/,/g, "").trim();
    const valor = Number(valorRaw === "" ? 0 : valorRaw);

    if (!Number.isFinite(valor) || valor < 0) {
      alert("Captura un fondo inicial valido (0 o mayor).");
      return;
    }

    try {
      await registrarAperturaCaja(valor, {
        uid: auth.currentUser?.uid || "",
        email: auth.currentUser?.email || "",
        nombre: auth.currentUser?.displayName || "",
      });

      await refrescarEstadoCaja();
      setMostrarAperturaModal(false);
      alert("Fondo inicial guardado. Puedes continuar con ventas.");
    } catch (err) {
      console.error("Error guardando apertura:", err);
      alert("No se pudo guardar el fondo inicial.");
    }
  };

  const resolverCodigoMovil = async (termino) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return {
        ok: false,
        message: "Inicia sesion para sincronizar con POS de escritorio.",
      };
    }

    const terminoFinal = String(termino || "").trim();
    if (!terminoFinal) {
      return { ok: false, message: "Codigo vacio." };
    }

    const terminoNormalizado = terminoFinal.toLowerCase();
    const ahora = Date.now();
    if (
      ultimoScanMovilRef.current.termino === terminoNormalizado &&
      ahora - ultimoScanMovilRef.current.at < 2500
    ) {
      return {
        ok: true,
        tipo: "sync",
        label: `${terminoFinal} (ya enviado)`,
      };
    }

    try {
      await enviarScanPosMovil({
        uid,
        termino: terminoFinal,
        actorUid: uid,
        actorEmail: auth.currentUser?.email || "",
      });
      ultimoScanMovilRef.current = {
        termino: terminoNormalizado,
        at: ahora,
      };

      return {
        ok: true,
        tipo: "sync",
        label: terminoFinal,
      };
    } catch (err) {
      console.error("No se pudo sincronizar scan movil:", err);
      return {
        ok: false,
        message: "No se pudo enviar el codigo al POS de escritorio.",
      };
    }
  };

  const resolverCodigoPosMovil = async (termino) => {
    const result = await buscarYAgregarPorTermino(termino, {
      mostrarAlertas: false,
      permitirBusquedaNombre: false,
    });

    if (result?.ok && result.tipo !== "selector") {
      setBusqueda("");
    }

    return result;
  };

  const scannerBloqueado = cajaCerradaHoy || faltaFondoInicial;
  const scannerBloqueadoMsg = cajaCerradaHoy
    ? "Caja cerrada. El escaner se habilitara manana."
    : "Captura el fondo inicial para habilitar el escaner.";

  if (mostrandoEscanerMovil) {
    return (
      <>
        <POSMobileScanner
          disabled={scannerBloqueado}
          disabledMessage={scannerBloqueadoMsg}
          itemsCount={productosVenta.length}
          total={total}
          serviciosHabilitados={serviciosHabilitados}
          title="Escaner POS"
          subtitle="Escanea productos o servicios y envialos al POS de escritorio."
          modeOptions={opcionesModoMovil}
          onResolveCode={resolverCodigoMovil}
        />

        <ModalAperturaCaja
          mostrar={mostrarAperturaModal}
          onClose={() => setMostrarAperturaModal(false)}
          fondoInicial={fondoInicialApertura}
          setFondoInicial={setFondoInicialApertura}
          confirmarApertura={confirmarApertura}
        />
      </>
    );
  }

  return (
    <Layout>
      <div
        className={`pos-container${isPremium ? " pos-container-premium" : ""}${mostrandoCotizacionPOS ? " pos-container-cotizacion" : ""}${logoEmpresa ? " pos-container-con-logo" : ""}`}
        style={logoEmpresa ? { "--pos-logo": `url(${logoEmpresa})` } : undefined}
      >
        {/* IZQUIERDA */}
        <div className="main">
          {mostrandoCotizacionPOS ? (
            <section className="cotizacion-editor">
              <div className="boleta-head cotizacion-editor-head">
                <div className="cotizacion-title-wrap">
                  <span className="cotizacion-title-icon" aria-hidden="true">🧾</span>
                  <div>
                    <span className="cotizacion-eyebrow">Documento comercial</span>
                    <h1>Boleta de cotización</h1>
                    <p>Prepara una propuesta clara para tu cliente sin registrar una venta.</p>
                  </div>
                </div>
                <label className="boleta-toggle cotizacion-status">
                  <input type="checkbox" checked readOnly />
                  Cotización activa
                </label>
              </div>

              <div className="boleta-meta-grid cotizacion-meta-grid">
                <div>
                  <label htmlFor="cotizacion-nombre"><b>Nombre de la cotización</b></label>
                  <input
                    id="cotizacion-nombre"
                    value={cotizacionNombre}
                    maxLength={100}
                    placeholder="Ej: Reparación laptop oficina"
                    onChange={(e) => setCotizacionNombre(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="cotizacion-servicio"><b>Asignar a servicio abierto</b></label>
                  <select
                    id="cotizacion-servicio"
                    value={cotizacionServicioId}
                    onChange={(e) => setCotizacionServicioId(e.target.value)}
                    disabled={cargandoServiciosCotizacion}
                  >
                    <option value="">{cargandoServiciosCotizacion ? "Cargando servicios..." : "Sin servicio asignado"}</option>
                    {serviciosAbiertosCotizacion.map((servicio) => (
                      <option key={servicio.id} value={servicio.id}>
                        {servicio.folio || "Sin folio"} · {servicio.nombre || "Cliente sin nombre"} · {servicio.status || "Pendiente"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cotizacion-fecha"><b>Fecha cotización</b></label>
                  <input id="cotizacion-fecha" type="date" value={cotizacionFecha} onChange={(e) => setCotizacionFecha(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="cotizacion-pago"><b>Forma de pago</b></label>
                  <select id="cotizacion-pago" value={cotizacionFormaPago} onChange={(e) => setCotizacionFormaPago(e.target.value)}>
                    <option value="">Selecciona...</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label><b>Total</b></label>
                  <div className="boleta-total-label">{formatCurrency(totalCotizacion)}</div>
                </div>
              </div>

              <div className="boleta-table-wrap cotizacion-table-wrap">
                <div className="boleta-scan-tools">
                  <label htmlFor="cotizacion-scan"><b>Escanear producto para cotización</b></label>
                  <input
                    id="cotizacion-scan"
                    ref={inputRef}
                    placeholder="Escanea código y presiona Enter"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      buscarYAgregarProducto();
                    }}
                  />
                </div>

                <table className="boleta-table cotizacion-table">
                  <thead>
                    <tr>
                      <th>ITEM</th><th>DESCRIPCIÓN</th><th>P. UNITARIO</th><th>CANTIDAD</th><th>IMPORTE</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosVenta.length === 0 && (
                      <tr className="cotizacion-empty-row">
                        <td colSpan="6">
                          <div className="cotizacion-empty">
                            <span>📦</span>
                            <strong>Aún no hay conceptos en la cotización</strong>
                            <small>Escanea un producto o agrega un renglón manual para comenzar.</small>
                          </div>
                        </td>
                      </tr>
                    )}
                    {productosVenta.map((producto, index) => (
                      <tr key={producto.id}>
                        <td><input value={producto.codigo || `P-${String(index + 1).padStart(3, "0")}`} onChange={(e) => actualizarPartidaCotizacion(producto.id, { codigo: e.target.value })} /></td>
                        <td><input value={producto.nombre || ""} placeholder="Ej: Memoria DDR3 8GB..." onChange={(e) => actualizarPartidaCotizacion(producto.id, { nombre: e.target.value })} /></td>
                        <td><input type="number" min="0" step="0.01" value={producto.precioVenta ?? 0} onChange={(e) => actualizarPartidaCotizacion(producto.id, { precioVenta: e.target.value })} /></td>
                        <td><input type="number" min="1" step="1" value={producto.cantidad ?? 1} onChange={(e) => actualizarPartidaCotizacion(producto.id, { cantidad: e.target.value })} /></td>
                        <td className="cotizacion-importe">{formatCurrency(Number(producto.precioVenta || 0) * Number(producto.cantidad || 0))}</td>
                        <td><button type="button" className="btn btn-danger" onClick={() => eliminarDelCarrito(producto.id)} title="Quitar">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan="4">TOTAL FINAL:</td><td className="cotizacion-importe">{formatCurrency(totalCotizacion)}</td><td /></tr>
                  </tfoot>
                </table>
              </div>

              <div className="cotizacion-notas">
                <label htmlFor="cotizacion-notas"><b>Observaciones / Notas de cotización</b></label>
                <textarea id="cotizacion-notas" value={cotizacionNotas} onChange={(e) => setCotizacionNotas(e.target.value)} placeholder="Ej: Incluye instalación..." />
              </div>

              <div className="boleta-actions cotizacion-actions">
                <button type="button" className="btn" onClick={agregarRenglonCotizacion}>Agregar renglón</button>
                <button type="button" className="btn btn-ok" disabled={!cotizacionNombre.trim() || productosVenta.length === 0 || generandoCotizacion} onClick={generarCotizacion}>
                  {generandoCotizacion ? "Guardando..." : "Guardar y descargar PDF"}
                </button>
              </div>

              <section className="cotizaciones-historial">
                <div className="cotizaciones-historial-head">
                  <div>
                    <span className="cotizacion-eyebrow">Seguimiento</span>
                    <h2>Historial de cotizaciones</h2>
                    <p>Consulta propuestas anteriores, reutilízalas o descarga nuevamente su PDF.</p>
                  </div>
                  <button type="button" className="cotizaciones-refresh" onClick={cargarHistorialCotizaciones} disabled={cargandoCotizaciones}>
                    {cargandoCotizaciones ? "Actualizando..." : "Actualizar"}
                  </button>
                </div>

                {cargandoCotizaciones && cotizacionesHistorial.length === 0 ? (
                  <div className="cotizaciones-history-empty">Cargando historial...</div>
                ) : cotizacionesHistorial.length === 0 ? (
                  <div className="cotizaciones-history-empty">
                    <span>🗂️</span>
                    <strong>Aún no hay cotizaciones guardadas</strong>
                    <small>La primera aparecerá aquí al usar “Guardar y descargar PDF”.</small>
                  </div>
                ) : (
                  <div className="cotizaciones-history-list">
                    {cotizacionesHistorial.map((cotizacion) => (
                      <article className="cotizacion-history-card" key={cotizacion.id}>
                        <div className="cotizacion-history-main">
                          <span className="cotizacion-history-folio">{cotizacion.folio || "Sin folio"}</span>
                          <strong>{cotizacion.nombreCotizacion || cotizacion.folio || "Cotización sin nombre"}</strong>
                          <small>
                            {cotizacion.nombre || "Cliente general"} · {cotizacion.fecha || "Sin fecha"} · {(cotizacion.items || []).length} concepto(s)
                          </small>
                          {cotizacion.servicioFolio && <small>Servicio asignado: {cotizacion.servicioFolio}</small>}
                        </div>
                        <div className="cotizacion-history-total">{formatCurrency(cotizacion.total || 0)}</div>
                        <div className="cotizacion-history-actions">
                          <button type="button" onClick={() => abrirCotizacionGuardada(cotizacion)}>Reabrir</button>
                          <button type="button" className="primary" onClick={() => descargarCotizacionGuardada(cotizacion)}>PDF</button>
                          <button
                            type="button"
                            className="danger"
                            disabled={eliminandoCotizacionId === cotizacion.id}
                            onClick={() => handleEliminarCotizacion(cotizacion)}
                          >
                            {eliminandoCotizacionId === cotizacion.id ? "Eliminando..." : "Eliminar"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </section>
          ) : mostrandoClientesPOS ? (
            <ClientesPanel
              embedded
              onSelectCliente={seleccionarClienteDesdePanel}
            />
          ) : (
            <>
          {mostrandoPOSMovil && (
            <POSMobileScanner
              embedded
              disabled={scannerBloqueado}
              disabledMessage={scannerBloqueadoMsg}
              itemsCount={productosVenta.length}
              total={total}
              serviciosHabilitados={serviciosHabilitados}
              title="POS movil"
              subtitle="Usa el mismo escaner para agregar al carrito y cobrar desde este celular."
              overlayLabel="POS MOVIL"
              modeOptions={opcionesModoMovil}
              onResolveCode={resolverCodigoPosMovil}
            />
          )}

          <header className="pos-title-block">
            <div>
              <span className="pos-eyebrow">Caja abierta</span>
              <h1>{mostrandoCotizacionPOS ? "Cotización" : "Punto de Venta"}</h1>
              {isPremium && <PremiumBadge />}
              <p>Agrega productos y servicios para iniciar una venta.</p>
            </div>
            <div className="pos-quick-actions" ref={accionesRapidasRef}>
              <button
                type="button"
                className="pos-quick-actions-trigger"
                aria-haspopup="dialog"
                aria-expanded={mostrarAccionesRapidas}
                onClick={() => setMostrarAccionesRapidas((visible) => !visible)}
              >
                <FiZap aria-hidden="true" />
                <span>Acciones rápidas</span>
                <small>F1–F7</small>
                <FiChevronDown className={mostrarAccionesRapidas ? "open" : ""} aria-hidden="true" />
              </button>

              {mostrarAccionesRapidas && (
                <div
                  className="pos-quick-actions-overlay"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setMostrarAccionesRapidas(false);
                  }}
                >
                  <section
                    className="pos-quick-actions-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="pos-quick-actions-title"
                  >
                    <header className="pos-quick-actions-modal-head">
                      <div>
                        <span aria-hidden="true"><FiZap /></span>
                        <div>
                          <small>PUNTO DE VENTA</small>
                          <h2 id="pos-quick-actions-title">Acciones rápidas</h2>
                          <p>Elige una opción o usa directamente F1–F7.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Cerrar acciones rápidas"
                        onClick={() => setMostrarAccionesRapidas(false)}
                      >
                        <FiX />
                      </button>
                    </header>

                    <div className="pos-quick-actions-grid">

                  <button
                    type="button"
                    disabled={cajaCerradaHoy || faltaFondoInicial}
                    onClick={() => {
                      setMostrarAccionesRapidas(false);
                      setMostrarVentaExtra(true);
                    }}
                  >
                    <i className="blue"><FiShoppingCart /></i>
                    <span><strong>Venta extra</strong><small>Agrega un cobro manual</small></span>
                    <kbd>F1</kbd>
                  </button>

                  {funcionesPOS.promocionesDescuentos && (
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarAccionesRapidas(false);
                        setMostrarPromociones(true);
                      }}
                    >
                      <i className="violet"><FiPercent /></i>
                      <span><strong>Promociones</strong><small>Consulta ofertas activas</small></span>
                      <kbd>F2</kbd>
                    </button>
                  )}

                  {serviciosHabilitados && (
                    <button
                      type="button"
                      disabled={cajaCerradaHoy || faltaFondoInicial}
                      onClick={() => {
                        setMostrarAccionesRapidas(false);
                        abrirSelectorServiciosListos();
                      }}
                    >
                      <i className="amber"><FiFileText /></i>
                      <span><strong>Pagar servicio</strong><small>Cobra un servicio terminado</small></span>
                      <kbd>F3</kbd>
                    </button>
                  )}

                  {funcionesPOS.fiado && (
                    <button
                      type="button"
                      disabled={cajaCerradaHoy || faltaFondoInicial}
                      onClick={() => {
                        setMostrarAccionesRapidas(false);
                        setMostrarPagoFiado(true);
                      }}
                    >
                      <i className="green"><FiCreditCard /></i>
                      <span><strong>Pagar fiado</strong><small>Registra un abono pendiente</small></span>
                      <kbd>F4</kbd>
                    </button>
                  )}

                  {serviciosHabilitados && (
                    <button
                      type="button"
                      disabled={cajaCerradaHoy || faltaFondoInicial}
                      onClick={() => {
                        setMostrarAccionesRapidas(false);
                        abrirSelectorAbonosServicio();
                      }}
                    >
                      <i className="cyan"><FiTool /></i>
                      <span><strong>Abonar servicio</strong><small>Agrega un abono al cobro</small></span>
                      <kbd>F5</kbd>
                    </button>
                  )}

                  {funcionesPOS.promocionesDescuentos && (
                    <button
                      type="button"
                      disabled={cajaCerradaHoy || faltaFondoInicial}
                      onClick={() => {
                        setMostrarAccionesRapidas(false);
                        abrirDescuentoManual();
                      }}
                    >
                      <i className="slate"><FiTag /></i>
                      <span><strong>Descuento manual</strong><small>Requiere autorización</small></span>
                      <kbd>F6</kbd>
                    </button>
                  )}

                  <button
                    type="button"
                    className="pos-quick-client-action"
                    disabled={cajaCerradaHoy || faltaFondoInicial}
                    onClick={() => {
                      setMostrarAccionesRapidas(false);
                      abrirAltaCliente({ vacio: true });
                    }}
                  >
                    <i className="indigo"><FiUserPlus /></i>
                    <span><strong>Agregar cliente</strong><small>Registra uno para esta venta</small></span>
                    <kbd>F7</kbd>
                  </button>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </header>
          {cajaCerradaHoy && (
            <div className="caja-cerrada-alert">
              Caja cerrada hoy. No se pueden registrar ventas hasta manana.
              {formatoCierre ? ` Cierre: ${formatoCierre}.` : ""}
            </div>
          )}

          {descuentoManual > 0 && (
            <div className="pos-manual-discount-active">
              Descuento manual {porcentajeDescuentoManual}%: <strong>-{formatCurrency(descuentoManual)}</strong>
              <button type="button" onClick={() => { setDescuentoManual(0); setPorcentajeDescuentoManual(0); }}>Quitar</button>
            </div>
          )}

          <label className="pos-search-field">
            <span className="pos-search-icon" aria-hidden="true">⌕</span>
            <input
              ref={inputRef}
              className="buscador"
              aria-label="Buscar producto por código o nombre"
              placeholder="Escanea un código o busca un producto"
              value={busqueda}
              disabled={cajaCerradaHoy || faltaFondoInicial}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (cajaCerradaHoy || faltaFondoInicial) return;
                if (e.key === "Enter") buscarYAgregarProducto();
              }}
            />
            <span className="pos-search-hint">Enter</span>
          </label>

          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant</th>
                <th>Precio</th>
                <th>Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosVenta.length === 0 ? (
                <tr className="tabla-empty-row">
                  <td colSpan="5">
                    <div className="tabla-empty-state">
                      <span className="tabla-empty-icon" aria-hidden="true">▦</span>
                      <strong>Aun no hay productos en la venta</strong>
                      <span>
                        {serviciosHabilitados
                          ? "Escanea un codigo, agrega un servicio o selecciona un canje."
                          : "Escanea un codigo o selecciona un canje."}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                productosVenta.map((p) => {
                  const meta = p.esCanje
                    ? `Canje por puntos · ${p.puntosCanjeados || 0} pts`
                    : p.esServicio
                      ? `Servicio ${p.servicioFolio || ""}`.trim()
                    : p.esVentaExtra
                      ? "Venta extra"
                    : p.esPagoFiado
                      ? "Pago de cuenta fiada"
                    : p.esAbonoServicio
                      ? `Abono al servicio ${p.servicioFolio || ""}`.trim()
                      : p.codigo
                        ? `Codigo: ${p.codigo}`
                        : "Producto de inventario";

                  return (
                    <tr
                      key={p.id}
                      className={
                        p.esCanje
                          ? "tabla-fila-canje"
                          : p.esServicio
                            ? "tabla-fila-servicio"
                            : p.esVentaExtra
                              ? "tabla-fila-extra"
                              : ""
                      }
                    >
                      <td className="tabla-producto-cell" data-label="Producto">
                        <div className="tabla-producto">
                          <strong className="tabla-producto-nombre">{p.nombre}</strong>
                          <span className="tabla-producto-meta">{meta}</span>
                        </div>
                      </td>
                      <td className="tabla-num" data-label="Cantidad">{p.cantidad}</td>
                      <td className="tabla-num" data-label="Precio">{formatCurrency(p.precioVenta)}</td>
                      <td className="tabla-num tabla-total" data-label="Total">
                        {formatCurrency(p.precioVenta * p.cantidad)}
                      </td>
                      <td className="tabla-acciones" data-label="Acciones">
                        {p.esCanje ? (
                          <span className="tabla-tag tabla-tag-canje">Canje $0</span>
                        ) : p.esServicio ? (
                          <span className="tabla-tag tabla-tag-servicio">Servicio</span>
                        ) : p.esVentaExtra ? (
                          <span className="tabla-tag tabla-tag-extra">Extra</span>
                        ) : p.esPagoFiado ? (
                          <span className="tabla-tag tabla-tag-fiado">Abono</span>
                        ) : p.esAbonoServicio ? (
                          <span className="tabla-tag tabla-tag-servicio">Abono servicio</span>
                        ) : (
                          <button
                            type="button"
                            className="btn-comparar"
                            disabled={cajaCerradaHoy || faltaFondoInicial}
                            onClick={() => abrirComparador(p)}
                          >
                            Comparar
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-eliminar-item"
                          disabled={cajaCerradaHoy || faltaFondoInicial}
                          onClick={() => eliminarDelCarrito(p.id)}
                        >
                          {p.esCanje ? "Quitar" : "X"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

            </>
          )}

        </div>

        {/* DERECHA */}
        {!mostrandoCotizacionPOS && <div className="panel-derecho">
          <div className="pos-panel-scroll">

          {/* La selección del cliente siempre está disponible; los canjes se pueden ocultar. */}
              <div className="pos-client-heading">
                <div className="pos-client-heading-icon" aria-hidden="true"><FiUser /></div>
                <div>
                  <h3>Cliente</h3>
                  <span>Busca o agrega un cliente para esta venta.</span>
                </div>
                <button
                  type="button"
                  className="pos-client-add-button"
                  disabled={cajaCerradaHoy || faltaFondoInicial}
                  onClick={() => abrirAltaCliente({ vacio: true })}
                >
                  <FiUserPlus />
                  <span>Añadir cliente</span>
                  <kbd>F7</kbd>
                </button>
              </div>

              <div className="pos-client-mode-panel">
                <label className="pos-client-search-field">
                  <FiSearch aria-hidden="true" />
                  <span className="sr-only">Buscar cliente</span>
                  <input
                    type="search"
                    value={busquedaClientePOS}
                    disabled={cajaCerradaHoy || faltaFondoInicial}
                    onChange={(event) => {
                      setBusquedaClientePOS(event.target.value);
                      setMensajeClientePOS("");
                      setErrorClientesPOS("");
                    }}
                    placeholder="Nombre, teléfono o RFC..."
                    autoComplete="off"
                  />
                </label>

                {cargandoClientesPOS && (
                  <p className="pos-client-state">Cargando clientes...</p>
                )}

                {!mostrarAltaCliente && !cargandoClientesPOS && busquedaClientePOS.trim() && clientesCoincidentesPOS.length > 0 && (
                  <div className="pos-client-results" aria-label="Clientes encontrados">
                    {clientesCoincidentesPOS.map((cliente) => (
                      <button
                        type="button"
                        className="pos-client-result"
                        key={cliente.id}
                        onClick={() => seleccionarClienteDesdePanel(cliente)}
                      >
                        <span className="pos-client-avatar">{obtenerInicialesCliente(cliente.nombre)}</span>
                        <span>
                          <strong>{cliente.nombre || "Cliente sin nombre"}</strong>
                          <small>{cliente.telefono || "Sin teléfono"}</small>
                        </span>
                        <b>Usar</b>
                      </button>
                    ))}
                  </div>
                )}

                {!mostrarAltaCliente && !cargandoClientesPOS && busquedaClientePOS.trim() && clientesCoincidentesPOS.length === 0 && (
                  <div className="pos-client-empty">
                    <strong>Cliente no encontrado</strong>
                    <span>Regístralo para usarlo en esta venta.</span>
                    <button type="button" onClick={abrirAltaCliente}>
                      <FiUserPlus /> Registrar este cliente
                    </button>
                  </div>
                )}

                {!mostrarAltaCliente && !cargandoClientesPOS && !busquedaClientePOS.trim() && !clienteData && (
                  <p className="pos-client-state">Escribe un nombre o teléfono para comenzar.</p>
                )}
              </div>

              {!mostrarAltaCliente && errorClientesPOS && <p className="pos-client-message error" role="alert">{errorClientesPOS}</p>}
              {!mostrarAltaCliente && mensajeClientePOS && <p className="pos-client-message success" role="status">{mensajeClientePOS}</p>}

          {/* El programa de canjes/puntos puede ocultarse desde Configuracion > Servicios. */}
          {clienteData && (
            <div className="cliente-info cliente-info-rich">
              <div className="cliente-info-head">
                <span className="pos-client-avatar pos-client-avatar-selected" aria-hidden="true">
                  {obtenerInicialesCliente(clienteData.nombre)}
                </span>
                <div className="cliente-info-copy">
                  <strong className="cliente-info-name">{clienteData.nombre}</strong>
                  <span className="cliente-info-subline">
                    Tel: {clienteData.telefono || clienteTelefono || "-"}
                  </span>
                  {clienteData.direccion ? (
                    <span className="cliente-info-subline">
                      Dir: {clienteData.direccion}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="pos-client-remove"
                  aria-label="Quitar cliente de la venta"
                  title="Quitar cliente"
                  onClick={quitarClienteDeVenta}
                >
                  <FiX />
                </button>
              </div>

              {mostrarProgramaCliente && <div className="cliente-info-badges">
                  <span className="cliente-pos-badge badge-points">
                    {clienteData.puntos || 0} pts
                  </span>
                  <span className="cliente-pos-badge badge-earned">
                    +{puntosGenerados} ahora
                  </span>
              </div>}

              <button
                type="button"
                className="pos-client-details-toggle"
                aria-expanded={mostrarDetallesClientePOS}
                onClick={() => setMostrarDetallesClientePOS((actual) => !actual)}
              >
                {mostrarDetallesClientePOS ? "Ocultar datos" : "Ver más datos"}
                {mostrarDetallesClientePOS ? <FiChevronUp /> : <FiChevronDown />}
              </button>

              <div className={`cliente-info-details ${mostrarDetallesClientePOS ? "open" : ""}`}>
              {clienteResumenLoading ? (
                <p className="cliente-pos-muted">Cargando resumen del cliente...</p>
              ) : (
                <>
                  <div className="cliente-pos-stats">
                    <div className="cliente-pos-stat">
                      <span>Compras</span>
                      <strong>{clienteComprasResumen.totalTickets}</strong>
                    </div>
                    <div className="cliente-pos-stat">
                      <span>Total</span>
                      <strong>{formatCurrency(clienteComprasResumen.totalCompras)}</strong>
                    </div>
                    <div className="cliente-pos-stat">
                      <span>Ultima</span>
                      <strong>
                        {clienteComprasResumen.ultimaCompra
                          ? fmtFechaCliente(
                              clienteComprasResumen.ultimaCompra.fecha
                              || clienteComprasResumen.ultimaCompra.createdAt,
                            )
                          : "-"}
                      </strong>
                    </div>
                  </div>

                  {serviciosHabilitados ? (
                    <div className="cliente-pos-stats cliente-pos-stats-servicios">
                      <div className="cliente-pos-stat">
                        <span>Servicios</span>
                        <strong>{clienteServiciosResumen.totalServicios}</strong>
                      </div>
                      <div className="cliente-pos-stat">
                        <span>Abiertos</span>
                        <strong>{clienteServiciosResumen.pendientes}</strong>
                      </div>
                    </div>
                  ) : null}

                  <div className="cliente-pos-summary">
                    <span className="cliente-pos-summary-label">Frecuentes</span>
                    {clienteComprasResumen.productosFrecuentes.length > 0 ? (
                      <div className="cliente-pos-tags">
                        {clienteComprasResumen.productosFrecuentes.map((producto) => (
                          <span
                            key={`${producto.nombre}-${producto.cantidad}`}
                            className="cliente-pos-tag"
                          >
                            {producto.nombre}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="cliente-pos-muted">Sin compras registradas todavia.</p>
                    )}
                  </div>

                  {serviciosHabilitados && clienteServiciosResumen.ultimoServicio ? (
                    <div className="cliente-pos-row">
                      <span>Ultimo servicio</span>
                      <strong>
                        {clienteServiciosResumen.ultimoServicio.folio || "Sin folio"} ·{" "}
                        {fmtFechaCliente(
                          clienteServiciosResumen.ultimoServicio.updatedAt
                          || clienteServiciosResumen.ultimoServicio.createdAt,
                        )}
                      </strong>
                    </div>
                  ) : null}
                </>
              )}
              </div>
            </div>
          )}

          {mostrarProgramaCliente && clienteData && (
            <div className="canje-pos-card">
              <div className="canje-pos-head">
                <strong>Canje con puntos</strong>
                <span>
                  {canjesDisponibles.length > 0
                    ? `${canjesDisponibles.length} disponible${canjesDisponibles.length === 1 ? "" : "s"}`
                    : "Sin canje disponible"}
                </span>
              </div>

              {canjesDisponibles.length > 0 ? canjeActivo && canjeSeleccionado ? (
                <>
                  <div className="canje-pos-preview">
                    <p><strong>{canjeSeleccionado.nombre}</strong></p>
                    <p>Canje seleccionado para esta venta.</p>
                    <p>Puntos a usar: {canjeSeleccionado.puntosRequeridos}</p>
                    <p>Stock disponible: {canjeSeleccionado.stockDisponible}</p>
                  </div>

                  <button
                    type="button"
                    className="btn-canje-modal"
                    disabled={cajaCerradaHoy || faltaFondoInicial}
                    onClick={() => setMostrarCanjeModal(true)}
                  >
                    Cambiar canje
                  </button>

                  <button
                    type="button"
                    className="btn-canje-guardar"
                    disabled={cajaCerradaHoy || faltaFondoInicial}
                    onClick={guardarPuntosParaDespues}
                  >
                    Guardar puntos mejor
                  </button>
                </>
              ) : (
                <>
                  <p className="canje-pos-hint">
                    Este cliente ya puede canjear un premio en esta visita.
                  </p>
                  <button
                    type="button"
                    className="btn-canje-modal"
                    disabled={cajaCerradaHoy || faltaFondoInicial}
                    onClick={() => setMostrarCanjeModal(true)}
                  >
                    Ver productos para canjear
                  </button>
                </>
              ) : siguienteCanjeDisponible ? (
                <p className="canje-pos-hint">
                  Le faltan {Math.max(siguienteCanjeDisponible.puntosRequeridos - puntosCliente, 0)} puntos
                  para canjear <strong>{siguienteCanjeDisponible.nombre}</strong>.
                </p>
              ) : (
                <p className="canje-pos-hint">
                  No hay productos de canje disponibles en este momento.
                </p>
              )}
            </div>
          )}
          <hr />
          </div>

          <div className="resumen">
            {aplicarIVA && <p>IVA por producto: {formatCurrency(iva)}</p>}
            {ieps > 0 && <p>IEPS: {formatCurrency(ieps)}</p>}
            {descuentoRegla > 0 && (
              <div className="resumen-descuento-simple">
                <div>
                  <span>Descuento aplicado</span>
                  <strong>{reglaDescuento?.nombre}</strong>
                </div>
                <div className="resumen-ahorro">
                  <span>Ahorras</span>
                  <strong>-{formatCurrency(descuentoRegla)}</strong>
                </div>
              </div>
            )}
            <span className="resumen-total-label">Total a cobrar</span>
            <h2>{formatCurrency(total)}</h2>
            {recargoTarjeta.habilitado && recargoTarjeta.recargo > 0 && (
              <p>Tarjeta: {formatCurrency(recargoTarjeta.totalConRecargo)}{" "}<span className="resumen-muted">(+{formatCurrency(recargoTarjeta.recargo)})</span></p>
            )}
          </div>

          {!mostrandoCotizacionPOS && (
            <button
              className="btn-venta"
              disabled={cajaCerradaHoy || faltaFondoInicial}
              onClick={() => {
                if (carrito.length === 0 && !canjeActivo) {
                  alert("Agrega un producto o selecciona un canje antes de continuar.");
                  return;
                }
                setMostrarPago(true);
              }}
            >
              <kbd>Espacio</kbd> Realizar Venta
            </button>
          )}

          <button
            className="btn-cancelar"
            disabled={cajaCerradaHoy || faltaFondoInicial}
            onClick={vaciarPOS}
          >
            <kbd>Supr</kbd> Vaciar
          </button>

        </div>}
      </div>

      {/* MODALES DEL POS */}
      {mostrarAltaCliente && (
        <div
          className="pos-client-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !guardandoCliente) cerrarAltaCliente();
          }}
        >
          <form
            className="pos-client-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-client-modal-title"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !guardandoCliente) cerrarAltaCliente();
            }}
            onSubmit={(event) => {
              event.preventDefault();
              guardarNuevoCliente();
            }}
          >
            <header className="pos-client-modal-header">
              <div className="pos-client-modal-title">
                <span aria-hidden="true"><FiUserPlus /></span>
                <div>
                  <small>NUEVO CLIENTE</small>
                  <h2 id="pos-client-modal-title">Agregar cliente</h2>
                  <p>Guárdalo y quedará seleccionado para esta venta.</p>
                </div>
              </div>
              <button
                type="button"
                className="pos-client-modal-close"
                aria-label="Cerrar formulario de cliente"
                disabled={guardandoCliente}
                onClick={cerrarAltaCliente}
              >
                <FiX />
              </button>
            </header>

            <div className="pos-client-modal-body">
              <p className="pos-client-modal-help">
                Sólo necesitamos dos datos. La dirección se puede completar después.
              </p>

              <label>
                <span className="pos-client-field-label">Nombre completo <b>*</b></span>
                <input
                  type="text"
                  placeholder="Ej. Juan Pérez"
                  value={nuevoCliente.nombre}
                  disabled={guardandoCliente || cajaCerradaHoy || faltaFondoInicial}
                  onChange={(event) => actualizarNuevoCliente("nombre", event.target.value)}
                  autoFocus
                  required
                />
              </label>

              <label>
                <span className="pos-client-field-label">Teléfono <b>*</b></span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10 dígitos"
                  value={nuevoCliente.telefono}
                  disabled={guardandoCliente || cajaCerradaHoy || faltaFondoInicial}
                  onChange={(event) => actualizarNuevoCliente("telefono", event.target.value)}
                  required
                />
              </label>

              <label>
                <span className="pos-client-field-label">Dirección <em>(opcional)</em></span>
                <input
                  type="text"
                  placeholder="Calle, número y colonia"
                  value={nuevoCliente.direccion}
                  disabled={guardandoCliente || cajaCerradaHoy || faltaFondoInicial}
                  onChange={(event) => actualizarNuevoCliente("direccion", event.target.value)}
                />
              </label>

              {errorClientesPOS && <p className="pos-client-message error" role="alert">{errorClientesPOS}</p>}
            </div>

            <footer className="pos-client-modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={guardandoCliente}
                onClick={cerrarAltaCliente}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary"
                disabled={guardandoCliente || cajaCerradaHoy || faltaFondoInicial}
              >
                {guardandoCliente ? "Guardando..." : "Guardar y usar"}
              </button>
            </footer>
          </form>
        </div>
      )}

      <ModalPagoFiado mostrar={mostrarPagoFiado} onClose={() => setMostrarPagoFiado(false)} onAgregar={agregarPagoFiadoAlCarrito} formatCurrency={formatCurrency} />
      <ModalSelectorServicio
        mostrar={mostrarSelectorAbono}
        cargando={cargandoServiciosListos}
        servicios={serviciosAbonables}
        titulo="Abonar servicio"
        subtitulo="Selecciona cualquier servicio abierto. Puede tener precio definido o pendiente."
        mensajeVacio="No hay servicios abiertos para recibir abonos."
        mostrarCosto
        onClose={() => setMostrarSelectorAbono(false)}
        onSeleccionar={seleccionarServicioParaAbono}
      />
      {servicioParaAbono && (
        <div className="abono-servicio-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setServicioParaAbono(null);
        }}>
          <section className="abono-servicio-modal" role="dialog" aria-modal="true" aria-labelledby="abono-servicio-title">
            <header>
              <div><small>ABONO DE SERVICIO</small><h2 id="abono-servicio-title">Registrar abono</h2></div>
              <button type="button" onClick={() => setServicioParaAbono(null)} aria-label="Cerrar">×</button>
            </header>
            <div className="abono-servicio-info">
              <span>Folio <strong>{servicioParaAbono.folio || "-"}</strong></span>
              <span>Cliente <strong>{servicioParaAbono.nombre || "Sin nombre"}</strong></span>
              <span>Costo actual <strong>{parseCosto(servicioParaAbono.costo) > 0 ? formatCurrency(parseCosto(servicioParaAbono.costo)) : "Por definir"}</strong></span>
              <span>Abonado <strong>{formatCurrency(servicioParaAbono.totalAbonado || 0)}</strong></span>
            </div>
            <label><b>Monto del abono</b><input autoFocus type="number" min="0.01" step="0.01" value={montoAbonoServicio} onChange={(event) => setMontoAbonoServicio(event.target.value)} placeholder="0.00" /></label>
            <p>El servicio permanecerá abierto. El método de pago se elegirá al realizar la venta.</p>
            <footer><button type="button" onClick={() => setServicioParaAbono(null)}>Cancelar</button><button type="button" className="primary" onClick={agregarAbonoServicioAlCarrito}>Agregar al cobro</button></footer>
          </section>
        </div>
      )}
      {promocionDetectada && (
        <div className="promo-pos-overlay" role="presentation">
          <section className="promo-pos-modal promo-detectada-modal" role="dialog" aria-modal="true" aria-labelledby="promo-detectada-title">
            <div className="promo-pos-icon" aria-hidden="true">%</div>
            <span className="promo-pos-eyebrow">Promoción detectada</span>
            <h2 id="promo-detectada-title">{promocionDetectada.nombre}</h2>
            <p>{describirPromocion(promocionDetectada)}</p>
            <div className="promo-pos-notice">
              {promocionDetectada.agregadoAutomaticamente
                ? "Ya tienes la cantidad requerida y el producto de regalo se agregó automáticamente al carrito."
                : "Ya tienes la cantidad requerida, pero el producto beneficiado no tiene stock disponible."}
            </div>
            <button type="button" className="promo-pos-primary" onClick={() => setPromocionDetectada(null)}>
              Entendido
            </button>
          </section>
        </div>
      )}

      {mostrarPromociones && (
        <div className="promo-pos-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setMostrarPromociones(false);
        }}>
          <section className="promo-pos-modal" role="dialog" aria-modal="true" aria-labelledby="promociones-activas-title">
            <div className="promo-pos-header">
              <div>
                <span className="promo-pos-eyebrow">Punto de venta</span>
                <h2 id="promociones-activas-title">Promociones activas</h2>
                <p>Consulta las ofertas disponibles hoy.</p>
              </div>
              <button type="button" className="venta-extra-close" onClick={() => setMostrarPromociones(false)} aria-label="Cerrar">×</button>
            </div>
            <div className="promo-pos-list">
              {promocionesVigentes.length === 0 ? (
                <div className="promo-pos-empty">No hay promociones activas en este momento.</div>
              ) : promocionesVigentes.map((regla) => (
                <article key={regla.id}>
                  <strong>{regla.nombre}</strong>
                  <p>{describirPromocion(regla)}</p>
                  <small>Vigente hasta {regla.fechaFin}</small>
                </article>
              ))}
            </div>
            <button type="button" className="promo-pos-primary" onClick={() => setMostrarPromociones(false)}>Cerrar</button>
          </section>
        </div>
      )}

      {mostrarVentaExtra && (
        <div
          className="venta-extra-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cerrarVentaExtra();
          }}
        >
          <form
            className="venta-extra-modal"
            onSubmit={agregarVentaExtra}
            role="dialog"
            aria-modal="true"
            aria-labelledby="venta-extra-title"
          >
            <div className="venta-extra-header">
              <div>
                <h2 id="venta-extra-title">Agregar venta extra</h2>
                <p>Captura un concepto que no pertenece al inventario.</p>
              </div>
              <button
                type="button"
                className="venta-extra-close"
                onClick={cerrarVentaExtra}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <label htmlFor="venta-extra-descripcion">Descripcion</label>
            <input
              id="venta-extra-descripcion"
              type="text"
              maxLength={120}
              value={ventaExtraDescripcion}
              onChange={(event) => setVentaExtraDescripcion(event.target.value)}
              placeholder="Ej. Instalacion, envio o ajuste"
              autoFocus
              required
            />

            <label htmlFor="venta-extra-precio">Precio</label>
            <input
              id="venta-extra-precio"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={ventaExtraPrecio}
              onChange={(event) => setVentaExtraPrecio(event.target.value)}
              placeholder="0.00"
              required
            />

            <div className="venta-extra-actions">
              <button type="button" className="venta-extra-cancel" onClick={cerrarVentaExtra}>
                Cancelar
              </button>
              <button type="submit" className="venta-extra-submit">
                Agregar a la venta
              </button>
            </div>
          </form>
        </div>
      )}

      {serviciosHabilitados && (
        <ModalSelectorServicio
          mostrar={mostrarSelectorServicio}
          cargando={cargandoServiciosListos}
          servicios={serviciosListos}
          onClose={() => setMostrarSelectorServicio(false)}
          onSeleccionar={seleccionarServicioListo}
        />
      )}

      {mostrarDescuentoManual && (
        <div className="promo-pos-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setMostrarDescuentoManual(false);
        }}>
          <form className="venta-extra-modal pos-manual-discount-modal" role="dialog" aria-modal="true" aria-labelledby="manual-discount-title" onSubmit={autorizarDescuentoManual}>
            <div className="venta-extra-header">
              <div><p>Autorización del jefe</p><h2 id="manual-discount-title">Aplicar descuento manual</h2></div>
              <button type="button" className="venta-extra-close" aria-label="Cerrar" onClick={() => setMostrarDescuentoManual(false)}>×</button>
            </div>
            <label htmlFor="manual-discount-percent">Porcentaje de descuento</label>
            <input id="manual-discount-percent" type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={porcentajeDescuentoDraft} onChange={(event) => setPorcentajeDescuentoDraft(event.target.value)} autoFocus required />
            <p>Se descontarán <strong>{formatCurrency(subtotal * ((Number(porcentajeDescuentoDraft) || 0) / 100))}</strong> del carrito actual.</p>
            <label htmlFor="manual-discount-password">Contraseña de autorización</label>
            <input id="manual-discount-password" type="password" autoComplete="current-password" value={passwordDescuentoManual} onChange={(event) => setPasswordDescuentoManual(event.target.value)} required />
            {errorDescuentoManual && <div className="pos-manual-discount-error" role="alert">{errorDescuentoManual}</div>}
            <div className="venta-extra-actions">
              <button type="button" className="venta-extra-cancel" onClick={() => setMostrarDescuentoManual(false)}>Cancelar</button>
              <button type="submit" className="venta-extra-submit" disabled={validandoDescuentoManual}>{validandoDescuentoManual ? "Validando..." : "Autorizar descuento"}</button>
            </div>
          </form>
        </div>
      )}

      <ModalCanjePuntos
        mostrar={mostrarCanjeModal && mostrarProgramaCliente && !!clienteData && canjesDisponibles.length > 0}
        onClose={() => setMostrarCanjeModal(false)}
        cliente={clienteData}
        puntosCliente={puntosCliente}
        canjesDisponibles={canjesDisponibles}
        canjeSeleccionadoId={canjeSeleccionado?.id || ""}
        formatCurrency={formatCurrency}
        onSeleccionarCanje={seleccionarCanje}
        onGuardarPuntos={guardarPuntosParaDespues}
      />

      <ModalPago
        mostrar={mostrarPago && !cajaCerradaHoy && !faltaFondoInicial}
        onClose={() => setMostrarPago(false)}
        total={total}
        totalCobro={totalCobro}
        recargoTarjeta={recargoTarjeta}
        recargoTarjetaMonto={recargoTarjetaMonto}
        imprimirAlCobrar={imprimirAlCobrar}
        clienteData={clienteData}
        onSolicitarClienteFiado={() => {
          setMostrarPago(false);
          setTipoPago("fiado");
          abrirAltaCliente();
          alert("Selecciona o crea un cliente con teléfono de 10 dígitos para continuar con el fiado.");
        }}
        usarPuntos={usarPuntos}
        setUsarPuntos={setUsarPuntos}
        descuentoManual={descuentoManual}
        setDescuentoManual={setDescuentoManual}
        reglasDescuento={reglasVigentes}
        reglaDescuentoId={reglaDescuentoId}
        setReglaDescuentoId={setReglaDescuentoId}
        descuentoRegla={descuentoRegla}
        tipoPago={tipoPago}
        setTipoPago={setTipoPago}
        montoEfectivo={montoEfectivo}
        setMontoEfectivo={setMontoEfectivo}
        montoTarjeta={montoTarjeta}
        setMontoTarjeta={setMontoTarjeta}
        montoTransferencia={montoTransferencia}
        setMontoTransferencia={setMontoTransferencia}
        referenciaPago={referenciaPago}
        setReferenciaPago={setReferenciaPago}
        totalPagado={totalPagado}
        cambio={cambio}
        confirmarVenta={realizarVentaPro}
      />

      <ModalAperturaCaja
        mostrar={mostrarAperturaModal}
        onClose={() => setMostrarAperturaModal(false)}
        fondoInicial={fondoInicialApertura}
        setFondoInicial={setFondoInicialApertura}
        confirmarApertura={confirmarApertura}
      />

      <ModalSelectorProducto
        mostrar={mostrarSelectorProducto}
        busqueda={busqueda}
        productos={productosCoincidencia}
        onClose={() => {
          setMostrarSelectorProducto(false);
          setProductosCoincidencia([]);
          inputRef.current?.focus();
        }}
        onSeleccionar={seleccionarProductoCoincidencia}
      />

      <ModalComparadorPrecios
        mostrar={mostrarComparador}
        producto={productoComparar}
        onClose={() => {
          setMostrarComparador(false);
          setProductoComparar(null);
        }}
      />

    </Layout>
  );
}
