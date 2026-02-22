import React, { useState, useEffect, useRef } from "react";
import "../css/pos.css";
import Layout from "../components/Layout";
import ModalPago from "../components/modal_pago";
import ModalSelectorProducto from "../components/modal_selector_producto";
import ModalComparadorPrecios from "../components/modal_comparador_precios";
import ModalAperturaCaja from "../components/modal_apertura_caja";
import { imprimirTicketVenta } from "../components/print_ticket_venta";
import {
  buscarServicioPorFolio,
  actualizarServicioPorId
} from "../js/services/servicios_firestore";

import {
  obtenerProductos,
  buscarClientePorTelefono,
  sumarPuntosCliente,
  registrarVenta,
  descontarStock
} from "../js/services/POS_firebase";
import { estaCajaCerradaHoy, obtenerCorteCajaDia, registrarAperturaCaja } from "../js/services/corte_caja_firestore";
import { auth } from "../initializer/firebase";

export default function POS() {

  const inputRef = useRef(null);

  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteData, setClienteData] = useState(null);

  const [productosDB, setProductosDB] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarSelectorProducto, setMostrarSelectorProducto] = useState(false);
  const [productosCoincidencia, setProductosCoincidencia] = useState([]);
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
  const [cajaCerradaHoy, setCajaCerradaHoy] = useState(false);
  const [corteHoy, setCorteHoy] = useState(null);
  const [mostrarAperturaModal, setMostrarAperturaModal] = useState(false);
  const [fondoInicialApertura, setFondoInicialApertura] = useState("");
  const [faltaFondoInicial, setFaltaFondoInicial] = useState(false);

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
    const falta = !cerrada && !(corte && corte.fondoInicialCaja !== undefined && corte.fondoInicialCaja !== null && Number(corte.fondoInicialCaja) > 0);
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

  /* ================= PRODUCTOS ================= */

  const buscarYAgregarProducto = async () => {
    if (cajaCerradaHoy || faltaFondoInicial) {
      if (cajaCerradaHoy) {
        alert("La caja de hoy ya esta cerrada. Las ventas se habilitan de nuevo manana.");
      } else {
        alert("Captura el fondo inicial de caja para comenzar ventas del día.");
        setMostrarAperturaModal(true);
      }
      return;
    }

    const termino = busqueda.trim();
    if (!termino) return;

    const terminoNormalizado = termino.toLowerCase();

    const productoPorCodigo = productosDB.find((p) =>
      String(p.codigo ?? "").trim().toLowerCase() === terminoNormalizado
    );

    if (productoPorCodigo) {
      agregarAlCarrito(productoPorCodigo);
      setBusqueda("");
      inputRef.current?.focus();
      return;
    }

    const servicio = await buscarServicioPorFolio(termino);

    if (servicio) {
      const estado = normalizarEstado(servicio.status);
      const costoServicio = parseCosto(servicio.costo);

      if (estado === "entregado") {
        alert("Este servicio ya fue entregado.");
        return;
      }

      if (!ESTADOS_PERMITIDOS_SERVICIO.has(estado) || costoServicio <= 0) {
        alert("Aun esta en mantenimiento.");
        return;
      }

      agregarAlCarrito({
        id: `servicio-${servicio.id}`,
        codigo: servicio.folio || "-",
        nombre: `Servicio ${servicio.folio || ""} - ${servicio.nombre || "Cliente"}`.trim(),
        precioVenta: costoServicio,
        cantidad: 1,
        stock: 1,
        esServicio: true,
        servicioId: servicio.id,
        servicioFolio: servicio.folio || "-"
      });

      setServiciosPorEntregar((prev) => {
        if (prev.some((s) => s.id === servicio.id)) return prev;
        return [...prev, servicio];
      });

      setBusqueda("");
      inputRef.current?.focus();
      return;
    }

    const coincidencias = productosDB.filter((p) =>
      String(p.nombre ?? "").toLowerCase().includes(terminoNormalizado)
    );

    if (coincidencias.length === 0) {
      alert("Producto no encontrado");
      return;
    }

    if (coincidencias.length === 1) {
      agregarAlCarrito(coincidencias[0]);
      setBusqueda("");
      inputRef.current?.focus();
      return;
    }

    setProductosCoincidencia(coincidencias);
    setMostrarSelectorProducto(true);
  };

  const seleccionarProductoCoincidencia = (producto) => {
    agregarAlCarrito(producto);
    setMostrarSelectorProducto(false);
    setProductosCoincidencia([]);
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

  const iva = subtotalConDescuento * 0.16;
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

    const ventaPayload = {
      clienteTelefono: clienteTelefono || null,
      subtotal,
      descuentoManual,
      descuentoPuntos,
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

    for (let producto of carrito) {
      if (producto.esServicio) continue;

      await descontarStock(
        producto.id,
        producto.stock - producto.cantidad
      );
    }

    if (clienteData) {

      if (usarPuntos && descuentoPuntos > 0) {
        await sumarPuntosCliente(clienteData.id, -descuentoPuntos);
      }

      await sumarPuntosCliente(clienteData.id, puntosGenerados);
    }

    for (const servicio of serviciosPorEntregar) {
      await actualizarServicioPorId(servicio.id, { status: "Entregado" });
    }

    imprimirTicketVenta({
      ventaId,
      fecha: ventaPayload.fecha,
      cliente: {
        nombre: clienteData?.nombre || "Publico general",
        telefono: clienteTelefono || "-"
      },
      tipoPago,
      referenciaTarjeta: referenciaPago.trim() || "",
      productos: carrito,
      estado: serviciosPorEntregar.length > 0 ? "Entregado" : "Pagado",
      subtotal,
      iva,
      total
    });

    alert("Venta profesional registrada");

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
    const valor = Number(String(fondoInicialApertura || "").replace(/,/g, "").trim()) || 0;
    if (valor <= 0) {
      alert("Captura el fondo inicial de caja antes de continuar.");
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
            <p>IVA (16%): ${iva.toFixed(2)}</p>
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





