import React, { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "../css/pos.css";
import Layout from "../components/Layout";
import POSMobileScanner from "../components/POSMobileScanner";
import ModalPago from "../components/modal_pago";
import ModalCanjePuntos from "../components/modal_canje_puntos";
import ModalSelectorProducto from "../components/modal_selector_producto";
import ModalSelectorServicio from "../components/modal_selector_servicio";
import ModalComparadorPrecios from "../components/modal_comparador_precios";
import ModalAperturaCaja from "../components/modal_apertura_caja";
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
import useServiciosConfig from "../hooks/useServiciosConfig";
import useTarjetaRecargoConfig from "../hooks/useTarjetaRecargoConfig";
import { calcularRecargoTarjeta } from "../js/services/tarjeta_recargo_config";

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

function createClienteDraft(telefono = "") {
  return {
    nombre: "",
    telefono: normalizarTelefonoCliente(telefono),
    direccion: "",
  };
}

export default function POS() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatCurrency } = useMonedaConfig();
  const { serviciosHabilitados } = useEmpresaConfig();
  const { habilitarCanjes, catalogoCanjes } = useServiciosConfig();
  const { config: tarjetaRecargoConfig } = useTarjetaRecargoConfig();
  const { imprimirAlCobrar } = useImpresorasConfig();
  const mostrarProgramaCliente = !habilitarCanjes;
  const vistaPOS = searchParams.get("vista") === "clientes" ? "clientes" : "ventas";
  const mostrandoClientesPOS = vistaPOS === "clientes";

  const inputRef = useRef(null);
  const scansProcesandoRef = useRef(new Set());
  const posProcessorIdRef = useRef(
    `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const carritoRef = useRef([]);
  const ultimoScanMovilRef = useRef({ termino: "", at: 0 });
  const ultimoClienteCanjePromptRef = useRef("");

  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteData, setClienteData] = useState(null);
  const [clienteBuscado, setClienteBuscado] = useState(false);
  const [mostrarAltaCliente, setMostrarAltaCliente] = useState(false);
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState(() => createClienteDraft(""));
  const [clienteVentasHistorial, setClienteVentasHistorial] = useState([]);
  const [clienteServiciosHistorial, setClienteServiciosHistorial] = useState([]);
  const [clienteResumenLoading, setClienteResumenLoading] = useState(false);

  const [productosDB, setProductosDB] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarSelectorProducto, setMostrarSelectorProducto] = useState(false);
  const [mostrarSelectorServicio, setMostrarSelectorServicio] = useState(false);
  const [cargandoServiciosListos, setCargandoServiciosListos] = useState(false);
  const [productosCoincidencia, setProductosCoincidencia] = useState([]);
  const [serviciosListos, setServiciosListos] = useState([]);
  const [serviciosPorEntregar, setServiciosPorEntregar] = useState([]);
  const [mostrarComparador, setMostrarComparador] = useState(false);
  const [productoComparar, setProductoComparar] = useState(null);
  const [mostrarVentaExtra, setMostrarVentaExtra] = useState(false);
  const [ventaExtraDescripcion, setVentaExtraDescripcion] = useState("");
  const [ventaExtraPrecio, setVentaExtraPrecio] = useState("");

  // 🔹 Modal Profesional
  const [mostrarPago, setMostrarPago] = useState(false);
  const [mostrarCanjeModal, setMostrarCanjeModal] = useState(false);
  const [tipoPago, setTipoPago] = useState("efectivo");

  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoTarjeta, setMontoTarjeta] = useState(0);
  const [montoTransferencia, setMontoTransferencia] = useState(0);
  const [referenciaPago, setReferenciaPago] = useState("");

  const [descuentoManual, setDescuentoManual] = useState(0);
  const [usarPuntos, setUsarPuntos] = useState(false);
  const [preferenciaCanje, setPreferenciaCanje] = useState("guardar");
  const [productoCanjeId, setProductoCanjeId] = useState("");
  const [aplicarIVA] = useState(() => {
    try {
      return localStorage.getItem("pos_aplicar_iva") !== "0";
    } catch {
      return true;
    }
  });
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
    setCarrito([]);
    setServiciosPorEntregar([]);
    setBusqueda("");
    setClienteTelefono("");
    setClienteData(null);
    setClienteBuscado(false);
    setMostrarAltaCliente(false);
    setNuevoCliente(createClienteDraft(""));
  }, [cajaCerradaHoy]);

  const cargarProductos = async () => {
    const data = await obtenerProductos();
    setProductosDB(data);
  };

  /* ================= CLIENTE ================= */

  const actualizarTelefonoCliente = (raw) => {
    const telefono = normalizarTelefonoCliente(raw);
    setClienteTelefono(telefono);
    setClienteData(null);
    setClienteBuscado(false);

    if (mostrarAltaCliente) {
      setNuevoCliente((prev) => ({
        ...prev,
        telefono,
      }));
    }
  };

  const verificarCliente = async () => {
    const telefono = normalizarTelefonoCliente(clienteTelefono);
    if (!telefono) {
      setClienteTelefono("");
      setClienteData(null);
      setClienteBuscado(false);
      setMostrarAltaCliente(false);
      return;
    }

    try {
      setClienteTelefono(telefono);
      const cliente = await buscarClientePorTelefono(telefono);
      setClienteData(cliente);
      setClienteBuscado(true);
      if (cliente) {
        setMostrarAltaCliente(false);
      }
    } catch (error) {
      console.error("No se pudo buscar el cliente:", error);
      alert("No se pudo verificar el cliente.");
    }
  };

  const abrirAltaCliente = () => {
    setNuevoCliente(createClienteDraft(clienteTelefono));
    setMostrarAltaCliente(true);
  };

  const cerrarAltaCliente = () => {
    setMostrarAltaCliente(false);
    setNuevoCliente(createClienteDraft(clienteTelefono));
  };

  const seleccionarClienteDesdePanel = (cliente) => {
    const telefono = normalizarTelefonoCliente(cliente?.telefono || "");
    setClienteTelefono(telefono);
    setClienteData(cliente || null);
    setClienteBuscado(Boolean(cliente));
    setMostrarAltaCliente(false);
    setNuevoCliente(createClienteDraft(telefono));
    actualizarQueryPOS((params) => {
      params.delete("vista");
      if (!esVistaMovil) {
        params.delete("modo");
      }
    });
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

    if (!nombre || !telefono || !direccion) {
      alert("Completa nombre, telefono y direccion del cliente.");
      return;
    }

    if (telefono.length < 10) {
      alert("Captura un telefono valido de 10 digitos.");
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
        alert("Ya existe un cliente con ese telefono. Se selecciono ese registro.");
        return;
      }

      const nuevo = await crearCliente({
        nombre,
        telefono,
        direccion,
      });

      setClienteTelefono(telefono);
      setClienteData({
        id: nuevo.id,
        nombre,
        telefono,
        direccion,
        puntos: 0,
      });
      setClienteBuscado(true);
      setMostrarAltaCliente(false);
      setNuevoCliente(createClienteDraft(""));
      alert("Cliente creado correctamente.");
    } catch (error) {
      console.error("No se pudo crear el cliente desde POS:", error);
      alert("No se pudo crear el cliente.");
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
        .filter((s) => parseCosto(s?.costo) > 0)
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
  };

  const agregarServicioAlCarrito = async (
    servicio,
    { autocompletarCliente = false, silencioso = false } = {}
  ) => {
    if (!servicio) return false;

    const estado = normalizarEstado(servicio.status);
    const costoServicio = parseCosto(servicio.costo);
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
              precioVenta: costoServicio,
              cantidad: 1,
              stock: 1,
              esServicio: true,
              servicioId: servicio.id,
              servicioFolio: servicio.folio || "-",
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

  const puntosCliente = Number(clienteData?.puntos || 0);

  const inventarioReservado = useMemo(() => {
    const reservados = new Map();

    carrito.forEach((item) => {
      if (item?.esServicio || item?.esVentaExtra) return;
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

  const descuentoPuntos =
    usarPuntos && clienteData
      ? Math.min(clienteData.puntos || 0, subtotal)
      : 0;

  const subtotalConDescuento =
    subtotal - descuentoManual - descuentoPuntos;

  const ivaRate = aplicarIVA ? IVA_RATE_DEFAULT : 0;
  const iva = subtotalConDescuento * ivaRate;
  const total = subtotalConDescuento + iva;
  const recargoTarjeta = calcularRecargoTarjeta(total, tarjetaRecargoConfig);
  const recargoTarjetaMonto =
    tipoPago === "tarjeta" && recargoTarjeta.habilitado ? recargoTarjeta.recargo : 0;
  const totalCobro = total + recargoTarjetaMonto;

  const totalPagado =
    Number(montoEfectivo) +
    Number(montoTarjeta) +
    Number(montoTransferencia);

  const cambio = totalPagado - totalCobro;

  const puntosGenerados = Math.floor(total / 10);
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

    if (totalPagado < totalCobro) {
      alert("Pago insuficiente");
      return;
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
      if (item?.esServicio || item?.esVentaExtra) return;
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

    const ventaPayload = {
      clienteId: clienteData?.id || null,
      clienteNombre: clienteData?.nombre || null,
      clienteTelefono: clienteTelefono || null,
      subtotal,
      descuentoManual,
      descuentoPuntos,
      aplicarIVA,
      ivaPorcentaje: ivaRate,
      iva,
      total: totalCobro,
      totalProductos: total,
      recargoTarjeta: recargoTarjetaMonto,
      tipoPago,
      pagoDetalle: {
        efectivo: montoEfectivo,
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

    const ventaId = await registrarVenta(ventaPayload);

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
        ventaId,
        fecha: ventaPayload.fecha,
        atendio: atendioVenta,
        cliente: {
          nombre: clienteData?.nombre || "Publico general",
          telefono: clienteTelefono || "-",
        },
        tipoPago,
        referenciaTarjeta: referenciaPago.trim() || "",
        productos: productosVenta,
        estado: serviciosPorEntregar.length > 0 ? "Entregado" : "Pagado",
        subtotal,
        aplicaIVA: aplicarIVA,
        ivaPorcentaje: ivaRate,
        iva,
        recargoTarjeta: recargoTarjetaMonto,
        proveedorRecargoTarjeta: recargoTarjeta.proveedor,
        total,
        totalCobro,
      });
    }

    setCarrito([]);
    setClienteTelefono("");
    setClienteData(null);
    setClienteBuscado(false);
    setMostrarPago(false);
    setMontoEfectivo(0);
    setMontoTarjeta(0);
    setMontoTransferencia(0);
    setReferenciaPago("");
    setServiciosPorEntregar([]);
    setDescuentoManual(0);
    setUsarPuntos(false);
    setPreferenciaCanje("guardar");
    setProductoCanjeId("");
    setMostrarAltaCliente(false);
    setNuevoCliente(createClienteDraft(""));

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
      <div className="pos-container">
        {/* IZQUIERDA */}
        <div className="main">
          {mostrandoClientesPOS ? (
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

          <h1>Punto de Venta</h1>
          {cajaCerradaHoy && (
            <div className="caja-cerrada-alert">
              Caja cerrada hoy. No se pueden registrar ventas hasta manana.
              {formatoCierre ? ` Cierre: ${formatoCierre}.` : ""}
            </div>
          )}

          <div className="pos-actions">
            <button
              type="button"
              className="btn-venta-extra"
              disabled={cajaCerradaHoy || faltaFondoInicial}
              onClick={() => setMostrarVentaExtra(true)}
            >
              Venta extra
            </button>
            {serviciosHabilitados && (
              <button
                type="button"
                className="btn-servicio-listo"
                disabled={cajaCerradaHoy || faltaFondoInicial}
                onClick={abrirSelectorServiciosListos}
              >
                Pagar servicio
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            className="buscador"
            placeholder="Escanea código o escribe nombre..."
            value={busqueda}
            disabled={cajaCerradaHoy || faltaFondoInicial}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (cajaCerradaHoy || faltaFondoInicial) return;
              if (e.key === "Enter") buscarYAgregarProducto();
            }}
          />

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
        <div className="panel-derecho">

          {/* El toggle de canjes tambien controla si POS muestra el bloque de cliente/puntos. */}
          {mostrarProgramaCliente && (
            <>
              <h3>Cliente (Opcional)</h3>

          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={clienteTelefono}
            disabled={cajaCerradaHoy || faltaFondoInicial}
            onChange={(e) => actualizarTelefonoCliente(e.target.value)}
            onBlur={verificarCliente}
            placeholder="Teléfono cliente"
            className="input"
          />

          <div className="pos-cliente-actions">
            <button
              type="button"
              className="btn-cliente-secundario"
              disabled={cajaCerradaHoy || faltaFondoInicial || !clienteTelefono}
              onClick={verificarCliente}
            >
              Buscar
            </button>
            {!clienteData && (
              <button
                type="button"
                className="btn-cliente-primario"
                disabled={cajaCerradaHoy || faltaFondoInicial}
                onClick={abrirAltaCliente}
              >
                + Crear cliente
              </button>
            )}
          </div>

          {clienteBuscado && !clienteData && !mostrarAltaCliente && (
            <p className="pos-cliente-hint">
              No se encontro un cliente con ese telefono. Puedes crearlo desde aqui.
            </p>
          )}

          {mostrarAltaCliente && (
            <div className="pos-cliente-form">
              <div className="pos-cliente-form-head">
                <strong>Nuevo cliente</strong>
                <span>Alta rapida desde caja</span>
              </div>

              <input
                type="text"
                className="input"
                placeholder="Nombre del cliente"
                value={nuevoCliente.nombre}
                disabled={guardandoCliente || cajaCerradaHoy || faltaFondoInicial}
                onChange={(e) => actualizarNuevoCliente("nombre", e.target.value)}
              />

              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                className="input"
                placeholder="Telefono"
                value={nuevoCliente.telefono}
                disabled={guardandoCliente || cajaCerradaHoy || faltaFondoInicial}
                onChange={(e) => actualizarNuevoCliente("telefono", e.target.value)}
              />

              <input
                type="text"
                className="input"
                placeholder="Direccion"
                value={nuevoCliente.direccion}
                disabled={guardandoCliente || cajaCerradaHoy || faltaFondoInicial}
                onChange={(e) => actualizarNuevoCliente("direccion", e.target.value)}
              />

              <div className="pos-cliente-form-actions">
                <button
                  type="button"
                  className="btn-cliente-secundario"
                  disabled={guardandoCliente}
                  onClick={cerrarAltaCliente}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-cliente-primario"
                  disabled={guardandoCliente || cajaCerradaHoy || faltaFondoInicial}
                  onClick={guardarNuevoCliente}
                >
                  {guardandoCliente ? "Guardando..." : "Guardar cliente"}
                </button>
              </div>
            </div>
          )}

          {/* El programa de canjes/puntos puede ocultarse desde Configuracion > Servicios. */}
          {clienteData && (
            <div className="cliente-info cliente-info-rich">
              <div className="cliente-info-head">
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

                <div className="cliente-info-badges">
                  <span className="cliente-pos-badge badge-points">
                    {clienteData.puntos || 0} pts
                  </span>
                  <span className="cliente-pos-badge badge-earned">
                    +{puntosGenerados} ahora
                  </span>
                </div>
              </div>

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
          )}

          {false && clienteData && (
            <div className="cliente-info">
              <p><strong>{clienteData.nombre}</strong></p>
              <p>Telefono: {clienteData.telefono || clienteTelefono || "-"}</p>
              {clienteData.direccion ? <p>Direccion: {clienteData.direccion}</p> : null}
              <p>⭐ Puntos actuales: {clienteData.puntos || 0}</p>
              <p>⭐ Esta compra genera: {puntosGenerados}</p>
            </div>
          )}

          {clienteData && (
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
            </>
          )}

          <div className="resumen">
            <p>Subtotal: {formatCurrency(subtotal)}</p>
            <p>IVA ({aplicarIVA ? "16%" : "0%"}): {formatCurrency(iva)}</p>
            <h2>Total: {formatCurrency(total)}</h2>
            {recargoTarjeta.habilitado && recargoTarjeta.recargo > 0 && (
              <p>
                Tarjeta: {formatCurrency(recargoTarjeta.totalConRecargo)}{" "}
                <span className="resumen-muted">
                  (+{formatCurrency(recargoTarjeta.recargo)})
                </span>
              </p>
            )}
          </div>

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
            Realizar Venta
          </button>

          <button
            className="btn-cancelar"
            disabled={cajaCerradaHoy || faltaFondoInicial}
            onClick={() => {
              setCarrito([]);
              setServiciosPorEntregar([]);
              setClienteTelefono("");
              setClienteData(null);
              setClienteBuscado(false);
              setPreferenciaCanje("guardar");
              setProductoCanjeId("");
              setMostrarAltaCliente(false);
              setNuevoCliente(createClienteDraft(""));
            }}
          >
            Vaciar
          </button>

        </div>
      </div>

      {/* MODALES DEL POS */}
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
        usarPuntos={usarPuntos}
        setUsarPuntos={setUsarPuntos}
        descuentoManual={descuentoManual}
        setDescuentoManual={setDescuentoManual}
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

