import React, { useState, useEffect, useRef } from "react";
import "../css/pos.css";
import Layout from "../components/Layout";
import POSMobileScanner from "../components/POSMobileScanner";
import ModalPago from "../components/modal_pago";
import ModalSelectorProducto from "../components/modal_selector_producto";
import ModalSelectorServicio from "../components/modal_selector_servicio";
import ModalComparadorPrecios from "../components/modal_comparador_precios";
import ModalAperturaCaja from "../components/modal_apertura_caja";
import { imprimirTicketVenta } from "../components/print_ticket_venta";
import {
  buscarServicioPorFolio,
  actualizarServicioPorId,
  listarServiciosPendientes,
} from "../js/services/servicios_firestore";
import { obtenerClientePorId } from "../js/services/clientes_firestore";

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

const MOBILE_POS_BREAKPOINT = 1024;
const IVA_RATE_DEFAULT = 0.16;

function detectarVistaMovilPOS() {
  if (typeof window === "undefined") return false;
  const byWidth = window.matchMedia(`(max-width: ${MOBILE_POS_BREAKPOINT}px)`).matches;
  const byPointer = window.matchMedia("(pointer: coarse)").matches;
  return byWidth || byPointer;
}

export default function POS() {

  const inputRef = useRef(null);
  const scansProcesandoRef = useRef(new Set());
  const posProcessorIdRef = useRef(
    `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );

  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteData, setClienteData] = useState(null);

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

  // 🔹 Modal Profesional
  const [mostrarPago, setMostrarPago] = useState(false);
  const [tipoPago, setTipoPago] = useState("efectivo");

  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoTarjeta, setMontoTarjeta] = useState(0);
  const [montoTransferencia, setMontoTransferencia] = useState(0);
  const [referenciaPago, setReferenciaPago] = useState("");

  const [descuentoManual, setDescuentoManual] = useState(0);
  const [usarPuntos, setUsarPuntos] = useState(false);
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
  const uidActual = auth.currentUser?.uid || "";

  const ESTADOS_PERMITIDOS_SERVICIO = new Set(["listo"]);

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
    if (typeof window === "undefined") return undefined;
    const sync = () => setEsVistaMovil(detectarVistaMovilPOS());
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
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
  }, [cajaCerradaHoy]);

  const cargarProductos = async () => {
    const data = await obtenerProductos();
    setProductosDB(data);
  };

  /* ================= CLIENTE ================= */

  const verificarCliente = async () => {
    if (!clienteTelefono) {
      setClienteData(null);
      return;
    }

    const cliente = await buscarClientePorTelefono(clienteTelefono);
    setClienteData(cliente);
  };

  const cargarServiciosListosParaCobro = async () => {
    setCargandoServiciosListos(true);
    try {
      const pendientes = await listarServiciosPendientes();
      const listos = pendientes
        .filter((s) => normalizarEstado(s?.status) === "listo")
        .filter((s) => !Boolean(s?.cobradoEnPOS))
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
      if (!silencioso) alert("Solo se pueden cobrar servicios en estado Listo con costo valido.");
      return false;
    }

    if (carrito.some((p) => p.id === itemId)) {
      if (!silencioso) alert("Ese servicio ya esta agregado al carrito.");
      return false;
    }

    setCarrito((prev) => [
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

    const servicio = await buscarServicioPorFolio(termino);

    if (servicio) {
      const agregado = await agregarServicioAlCarrito(servicio, {
        autocompletarCliente: true,
        silencioso: !mostrarAlertas,
      });
      if (!agregado) {
        return {
          ok: false,
          message: "El servicio no se pudo agregar. Debe estar en estado Listo y no haberse cobrado.",
        };
      }
      return {
        ok: true,
        tipo: "servicio",
        label: servicio?.folio || termino,
      };
    }

    if (!permitirBusquedaNombre) {
      return { ok: false, message: "No se encontro un producto o servicio con ese codigo." };
    }

    const coincidencias = productosDB.filter((p) =>
      String(p.nombre ?? "").toLowerCase().includes(terminoNormalizado)
    );

    if (coincidencias.length === 0) {
      if (mostrarAlertas) alert("Producto no encontrado");
      return { ok: false, message: "No se encontro un producto o servicio con ese codigo." };
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

    const item = carrito.find((p) => p.id === id);

    if (item?.esServicio && item?.servicioId) {
      setServiciosPorEntregar((prev) => prev.filter((s) => s.id !== item.servicioId));
    }

    setCarrito(carrito.filter(p => p.id !== id));
  };

  const abrirComparador = (item) => {
    if (item?.esServicio) {
      alert("La comparativa por marketplace aplica solo para productos.");
      return;
    }

    setProductoComparar(item);
    setMostrarComparador(true);
  };

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

  const totalPagado =
    Number(montoEfectivo) +
    Number(montoTarjeta) +
    Number(montoTransferencia);

  const cambio = totalPagado - total;

  const puntosGenerados = Math.floor(total / 10);

  /* ================= VENTA PROFESIONAL ================= */

  const realizarVentaPro = async () => {
    const cerrada = await estaCajaCerradaHoy();
    if (cerrada) {
      setCajaCerradaHoy(true);
      setMostrarPago(false);
      alert("La caja de hoy ya esta cerrada. Intenta nuevamente manana.");
      return;
    }

    if (carrito.length === 0) {
      alert("No hay productos en el carrito");
      return;
    }

    if (totalPagado < total) {
      alert("Pago insuficiente");
      return;
    }

    if (tipoPago === "tarjeta" && !referenciaPago.trim()) {
      alert("Ingresa la referencia de pago de tarjeta");
      return;
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
      if (item?.esServicio) return;
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
      clienteTelefono: clienteTelefono || null,
      subtotal,
      descuentoManual,
      descuentoPuntos,
      aplicarIVA,
      ivaPorcentaje: ivaRate,
      iva,
      total,
      tipoPago,
      pagoDetalle: {
        efectivo: montoEfectivo,
        tarjeta: montoTarjeta,
        transferencia: montoTransferencia,
        referenciaTarjeta: referenciaPago.trim() || null
      },
      puntosGenerados,
      fecha: new Date(),
      productos: carrito
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

    imprimirTicketVenta({
      ventaId,
      fecha: ventaPayload.fecha,
      atendio: atendioVenta,
      cliente: {
        nombre: clienteData?.nombre || "Publico general",
        telefono: clienteTelefono || "-"
      },
      tipoPago,
      referenciaTarjeta: referenciaPago.trim() || "",
      productos: carrito,
      estado: serviciosPorEntregar.length > 0 ? "Entregado" : "Pagado",
      subtotal,
      aplicaIVA: aplicarIVA,
      ivaPorcentaje: ivaRate,
      iva,
      total
    });

    setCarrito([]);
    setClienteTelefono("");
    setClienteData(null);
    setMostrarPago(false);
    setMontoEfectivo(0);
    setMontoTarjeta(0);
    setMontoTransferencia(0);
    setReferenciaPago("");
    setServiciosPorEntregar([]);
    setDescuentoManual(0);
    setUsarPuntos(false);

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

    try {
      await enviarScanPosMovil({
        uid,
        termino: terminoFinal,
        actorUid: uid,
        actorEmail: auth.currentUser?.email || "",
      });

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

  const scannerBloqueado = cajaCerradaHoy || faltaFondoInicial;
  const scannerBloqueadoMsg = cajaCerradaHoy
    ? "Caja cerrada. El escaner se habilitara manana."
    : "Captura el fondo inicial para habilitar el escaner.";

  if (esVistaMovil) {
    return (
      <>
        <POSMobileScanner
          disabled={scannerBloqueado}
          disabledMessage={scannerBloqueadoMsg}
          itemsCount={carrito.length}
          total={total}
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
              className="btn-servicio-listo"
              disabled={cajaCerradaHoy || faltaFondoInicial}
              onClick={abrirSelectorServiciosListos}
            >
              Pagar servicio
            </button>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.cantidad}</td>
                  <td>${p.precioVenta}</td>
                  <td>${p.precioVenta * p.cantidad}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-comparar"
                      disabled={cajaCerradaHoy || faltaFondoInicial}
                      onClick={() => abrirComparador(p)}
                    >
                      Comparar
                    </button>
                    <button disabled={cajaCerradaHoy || faltaFondoInicial} onClick={() => eliminarDelCarrito(p.id)}>X</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>

        {/* DERECHA */}
        <div className="panel-derecho">

          <h3>Cliente (Opcional)</h3>

          <input
            value={clienteTelefono}
            disabled={cajaCerradaHoy || faltaFondoInicial}
            onChange={(e) => setClienteTelefono(e.target.value)}
            onBlur={verificarCliente}
            placeholder="Teléfono cliente"
            className="input"
          />

          {clienteData && (
            <div className="cliente-info">
              <p><strong>{clienteData.nombre}</strong></p>
              <p>⭐ Puntos actuales: {clienteData.puntos}</p>
              <p>⭐ Esta compra genera: {puntosGenerados}</p>
            </div>
          )}

          <hr />

          <div className="resumen">
            <p>Subtotal: ${subtotal.toFixed(2)}</p>
            <p>IVA ({aplicarIVA ? "16%" : "0%"}): ${iva.toFixed(2)}</p>
            <h2>Total: ${total.toFixed(2)}</h2>
          </div>

          <button
            className="btn-venta"
            disabled={cajaCerradaHoy || faltaFondoInicial}
            onClick={() => setMostrarPago(true)}
          >
            Realizar Venta
          </button>

          <button
            className="btn-cancelar"
            disabled={cajaCerradaHoy || faltaFondoInicial}
            onClick={() => {
              setCarrito([]);
              setServiciosPorEntregar([]);
            }}
          >
            Vaciar
          </button>

        </div>
      </div>

      {/* 🔹 MODAL SEPARADO */}
      <ModalSelectorServicio
        mostrar={mostrarSelectorServicio}
        cargando={cargandoServiciosListos}
        servicios={serviciosListos}
        onClose={() => setMostrarSelectorServicio(false)}
        onSeleccionar={seleccionarServicioListo}
      />

      <ModalPago
        mostrar={mostrarPago && !cajaCerradaHoy && !faltaFondoInicial}
        onClose={() => setMostrarPago(false)}
        total={total}
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

