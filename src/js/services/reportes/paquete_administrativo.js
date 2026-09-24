// ---------------------------------------------------------------------------
// Paquete administrativo (Premium).
//
// Un solo archivo con toda la administracion del periodo. No es la suma de los
// demas reportes pegados: es el resumen que un contador o un dueño abre una
// vez al mes, con una hoja por tema y un dashboard que las conecta.
//
// Regla importante: una seccion que no aplica al negocio NO genera hoja. Un
// archivo con seis hojas vacias se siente roto, y ademas obliga a la persona a
// revisar hojas que nunca van a tener nada.
// ---------------------------------------------------------------------------

import { aFecha, errorSinDatos, numero, textoSeguro } from "./excel_kit.js";
import {
  calcularMetricas,
  cobrosPorMetodo,
  consolidadoProductos,
  descuentoTotalVenta,
  empleadoDeVenta,
  estadoInventarioProducto,
  estadoVenta,
  etiquetaMetodoPago,
  filtrarPorFecha,
  indexarEmpleados,
  indexarProductos,
  normalizarOrdenes,
  platillosVendidos,
  resumenFiados,
  resumenInventario,
  ventasPorCategoria,
  ventasPorDia,
  ventasPorMes,
} from "./datos_reportes.js";
import { fechaDeCorte, filaCorteResumen } from "./generadores_catalogo.js";
import {
  AVISO_COSTO_PARCIAL,
  AVISO_ESTIMACION,
  AVISO_FACTURA_GLOBAL,
  iniciarReporte,
  nombreArchivo,
  recortarParaGrafica,
  serieTemporal,
  tarjeta,
} from "./generadores_comun.js";

export async function paqueteAdministrativo(contexto) {
  const { datos } = contexto;
  const ventas = filtrarPorFecha(datos.ventas, "fecha", contexto)
    .slice()
    .sort((a, b) => (aFecha(a?.fecha)?.getTime() || 0) - (aFecha(b?.fecha)?.getTime() || 0));

  const egresos = filtrarPorFecha(datos.egresos, "fecha", contexto);
  const cortes = datos.cortes
    .filter((corte) => corte?.cerrado === true)
    .filter((corte) => {
      const fecha = fechaDeCorte(corte);
      if (!fecha) return false;
      if (contexto.desde && fecha < contexto.desde) return false;
      if (contexto.hasta && fecha > contexto.hasta) return false;
      return true;
    })
    .sort((a, b) => String(b.fechaKey || "").localeCompare(String(a.fechaKey || "")));

  // El paquete necesita al menos algo de operacion en el periodo. Sin ventas,
  // egresos ni cortes no hay administracion que reportar.
  if (!ventas.length && !egresos.length && !cortes.length) throw errorSinDatos();

  const indiceProductos = indexarProductos(datos.productos);
  const indiceEmpleados = indexarEmpleados(datos.empleados);
  const metricas = calcularMetricas(ventas, { indiceProductos, egresos });
  const anteriores = contexto.comparativo
    ? filtrarPorFecha(datos.ventas, "fecha", contexto.comparativo)
    : [];
  const metricasAnteriores = anteriores.length
    ? calcularMetricas(anteriores, { indiceProductos })
    : null;

  const consolidado = consolidadoProductos(ventas, indiceProductos);
  const categorias = ventasPorCategoria(consolidado);
  const cobros = cobrosPorMetodo(ventas);
  const porDia = ventasPorDia(ventas);
  const porMes = ventasPorMes(ventas);
  const inventario = resumenInventario(datos.productos);
  const credito = resumenFiados(datos.fiados, contexto);
  const serie = serieTemporal(porDia);

  const clientesConCompra = new Set(
    ventas.map((venta) => String(venta?.clienteId || "").trim()).filter(Boolean),
  );

  const reporte = await iniciarReporte(contexto, "Paquete administrativo");

  // ------------------------------- Dashboard -------------------------------
  const dash = await reporte.dashboard({ subtitulo: "Resumen administrativo del periodo" });

  dash.tarjetas([
    tarjeta("Ventas", metricas.total, "moneda", metricasAnteriores?.total ?? null),
    tarjeta("Utilidad estimada", metricas.utilidadBruta, "moneda", metricasAnteriores?.utilidadBruta ?? null),
    tarjeta("Operaciones", metricas.operaciones, "cantidad", metricasAnteriores?.operaciones ?? null),
    tarjeta("Ticket promedio", metricas.ticketPromedio, "moneda", metricasAnteriores?.ticketPromedio ?? null),
    tarjeta("Egresos", metricas.egresos, "moneda"),
    tarjeta("Cuentas por cobrar", credito.pendiente, "moneda", null, `${credito.conDeuda} cliente(s)`),
    tarjeta("Valor de inventario", inventario.valorCosto, "moneda", null, "A costo de compra"),
    tarjeta("Clientes atendidos", clientesConCompra.size, "cantidad", null, "Clientes identificados"),
  ]);

  dash.seccion("Tendencia de ventas e ingresos contra egresos");
  const unidad = porMes.length > 1 ? porMes : porDia;
  const egresosPorUnidad = new Map();
  egresos.forEach((egreso) => {
    if (!egreso.fecha) return;
    const clave = porMes.length > 1
      ? `${egreso.fecha.getFullYear()}-${String(egreso.fecha.getMonth() + 1).padStart(2, "0")}`
      : `${egreso.fecha.getFullYear()}-${String(egreso.fecha.getMonth() + 1).padStart(2, "0")}-${String(egreso.fecha.getDate()).padStart(2, "0")}`;
    egresosPorUnidad.set(clave, (egresosPorUnidad.get(clave) || 0) + egreso.monto);
  });

  dash.graficas([
    {
      tipo: "linea",
      titulo: serie.recortada ? "Tendencia de ventas (últimos 31 días)" : "Tendencia de ventas",
      datos: serie.datos,
    },
    {
      tipo: "columna",
      titulo: "Ingresos vs egresos",
      datos: unidad.slice(-12).map((punto) => ({ label: punto.label })),
      series: [
        { nombre: "Ingresos", valores: unidad.slice(-12).map((punto) => punto.value) },
        {
          nombre: "Egresos",
          valores: unidad.slice(-12).map((punto) => Number((egresosPorUnidad.get(punto.clave) || 0).toFixed(2))),
        },
      ],
    },
  ]);

  dash.seccion("Cobros, productos y categorías");
  dash.graficas([
    { tipo: "dona", titulo: "Métodos de pago", datos: cobros },
    {
      tipo: "barra",
      titulo: "Top productos",
      datos: recortarParaGrafica(
        consolidado.map((item) => ({ label: item.nombre, value: item.ingreso })),
        10,
      ),
    },
  ]);
  dash.graficas([{
    tipo: "columna",
    titulo: "Ventas por categoría",
    datos: recortarParaGrafica(categorias, 8),
  }]);

  if (metricas.costoParcial) dash.aviso(AVISO_COSTO_PARCIAL);
  dash.aviso(AVISO_ESTIMACION);
  dash.cerrar({});

  // --------------------------- Resumen ejecutivo ---------------------------
  await reporte.tabla({
    nombre: "Resumen",
    subtitulo: "Cifras del periodo",
    columnas: [
      { header: "Concepto", key: "concepto", ancho: 42 },
      { header: "Importe", key: "importe", formato: "moneda" },
      { header: "Periodo anterior", key: "anterior", formato: "moneda", vacio: "" },
    ],
    filas: [
      { concepto: "Ventas del periodo", importe: metricas.total, anterior: metricasAnteriores?.total ?? null },
      { concepto: "Número de operaciones", importe: metricas.operaciones, anterior: metricasAnteriores?.operaciones ?? null },
      { concepto: "Ticket promedio", importe: metricas.ticketPromedio, anterior: metricasAnteriores?.ticketPromedio ?? null },
      { concepto: "Subtotal", importe: metricas.subtotal, anterior: metricasAnteriores?.subtotal ?? null },
      { concepto: "IVA trasladado", importe: metricas.iva, anterior: metricasAnteriores?.iva ?? null },
      { concepto: "IEPS trasladado", importe: metricas.ieps, anterior: metricasAnteriores?.ieps ?? null },
      { concepto: "Descuentos otorgados", importe: metricas.descuentos, anterior: metricasAnteriores?.descuentos ?? null },
      { concepto: "Unidades vendidas", importe: metricas.unidades, anterior: metricasAnteriores?.unidades ?? null },
      { concepto: "Costo de mercancía vendida", importe: metricas.costo, anterior: metricasAnteriores?.costo ?? null },
      { concepto: "Utilidad bruta estimada", importe: metricas.utilidadBruta, anterior: metricasAnteriores?.utilidadBruta ?? null },
      { concepto: "Egresos del periodo", importe: metricas.egresos, anterior: null },
      { concepto: "Resultado estimado", importe: metricas.resultado, anterior: null },
      { concepto: "Ventas a crédito", importe: metricas.fiado, anterior: metricasAnteriores?.fiado ?? null },
      { concepto: "Saldo por cobrar", importe: credito.pendiente, anterior: null },
      { concepto: "Valor del inventario a costo", importe: inventario.valorCosto, anterior: null },
    ],
    totales: false,
    nota: AVISO_ESTIMACION,
  });

  // -------------------------------- Ventas ---------------------------------
  if (ventas.length) {
    await reporte.tabla({
      nombre: "Ventas",
      subtitulo: "Operaciones del periodo",
      columnas: [
        { header: "Folio", key: "folio", ancho: 16 },
        { header: "Fecha", key: "fecha", formato: "fecha" },
        { header: "Hora", key: "hora", formato: "hora" },
        { header: "Cliente", key: "cliente", ancho: 26, vacio: "Público general" },
        { header: "Subtotal", key: "subtotal", formato: "moneda", total: true },
        { header: "Descuento", key: "descuento", formato: "moneda", total: true },
        { header: "IVA", key: "iva", formato: "moneda", total: true },
        { header: "IEPS", key: "ieps", formato: "moneda", total: true },
        { header: "Total", key: "total", formato: "moneda", total: true },
        { header: "Método de pago", key: "metodo", ancho: 18 },
        { header: "Estado", key: "estado", ancho: 18 },
        { header: "Atendió", key: "atendio", ancho: 22 },
      ],
      filas: ventas.map((venta) => {
        const fecha = aFecha(venta?.fecha);
        return {
          folio: String(venta?.folioTicket || venta?.id || "").trim() || "Sin folio",
          fecha,
          hora: fecha,
          cliente: venta?.clienteNombre,
          subtotal: numero(venta?.subtotal),
          descuento: descuentoTotalVenta(venta),
          iva: numero(venta?.iva),
          ieps: numero(venta?.ieps),
          total: numero(venta?.total),
          metodo: etiquetaMetodoPago(venta?.tipoPago),
          estado: estadoVenta(venta),
          atendio: empleadoDeVenta(venta, indiceEmpleados),
        };
      }),
    });
  }

  // ------------------------------- Productos -------------------------------
  if (consolidado.length) {
    await reporte.tabla({
      nombre: "Productos",
      subtitulo: "Productos vendidos en el periodo",
      columnas: [
        { header: "Producto", key: "nombre", ancho: 38 },
        { header: "Código", key: "codigo", ancho: 16, vacio: "" },
        { header: "Categoría", key: "categoria", ancho: 20 },
        { header: "Unidades", key: "unidades", formato: "decimal", total: true },
        { header: "Importe vendido", key: "ingreso", formato: "moneda", total: true },
        { header: "Costo estimado", key: "costo", formato: "moneda", total: true },
        { header: "Utilidad estimada", key: "utilidad", formato: "moneda", total: true },
        { header: "Margen", key: "margen", formato: "porcentaje" },
      ],
      filas: consolidado,
      nota: metricas.costoParcial ? AVISO_COSTO_PARCIAL : "",
    });
  }

  // ---------------------------- Metodos de pago ----------------------------
  if (cobros.length) {
    await reporte.tabla({
      nombre: "Metodos de pago",
      subtitulo: "Cobros por forma de pago",
      columnas: [
        { header: "Método de pago", key: "label", ancho: 24 },
        { header: "Importe", key: "value", formato: "moneda", total: true },
        { header: "Operaciones", key: "operaciones", formato: "cantidad", total: true },
        { header: "Ticket promedio", key: "ticketPromedio", formato: "moneda" },
        { header: "Participación", key: "participacion", formato: "porcentaje" },
      ],
      filas: cobros,
    });
  }

  // ------------------------------- Inventario ------------------------------
  if (datos.productos.length) {
    await reporte.tabla({
      nombre: "Inventario",
      subtitulo: "Existencias valuadas al momento de generar el paquete",
      columnas: [
        { header: "Código", key: "codigo", ancho: 18, vacio: "Sin código" },
        { header: "Producto", key: "nombre", ancho: 38, vacio: "Sin nombre" },
        { header: "Categoría", key: "categoria", ancho: 20, vacio: "Sin categoría" },
        { header: "Costo", key: "costo", formato: "moneda" },
        { header: "Precio", key: "precio", formato: "moneda" },
        { header: "Existencia", key: "stock", formato: "decimal", total: true },
        { header: "Valor a costo", key: "valorCosto", formato: "moneda", total: true },
        { header: "Estado", key: "estado", ancho: 15 },
      ],
      filas: datos.productos
        .map((producto) => {
          const costo = numero(producto?.precioCompra ?? producto?.ultimoCosto);
          const stock = numero(producto?.stock);
          return {
            codigo: textoSeguro(producto?.codigo, ""),
            nombre: textoSeguro(producto?.nombre, ""),
            categoria: textoSeguro(producto?.categoria, ""),
            costo,
            precio: numero(producto?.precioVenta),
            stock,
            valorCosto: Number((costo * stock).toFixed(2)),
            estado: estadoInventarioProducto(producto),
          };
        })
        .sort((a, b) => b.valorCosto - a.valorCosto),
    });
  }

  // -------------------------------- Egresos --------------------------------
  if (egresos.length) {
    await reporte.tabla({
      nombre: "Egresos",
      subtitulo: "Salidas de dinero del periodo",
      columnas: [
        { header: "Fecha", key: "fecha", formato: "fecha" },
        { header: "Concepto", key: "descripcion", ancho: 44, vacio: "Sin concepto" },
        { header: "Tipo", key: "tipo", ancho: 20 },
        { header: "Responsable", key: "usuario", ancho: 24, vacio: "" },
        { header: "Importe", key: "monto", formato: "moneda", total: true },
      ],
      filas: egresos,
    });
  }

  // -------------------------------- Cortes ---------------------------------
  if (cortes.length) {
    await reporte.tabla({
      nombre: "Cortes",
      subtitulo: "Cortes de caja cerrados en el periodo",
      columnas: [
        { header: "Fecha", key: "fecha", formato: "fecha" },
        { header: "Usuario", key: "cajero", ancho: 24 },
        { header: "Operaciones", key: "tickets", formato: "cantidad", total: true },
        { header: "Ventas", key: "ventas", formato: "moneda", total: true },
        { header: "Efectivo", key: "efectivo", formato: "moneda", total: true },
        { header: "Tarjeta", key: "tarjeta", formato: "moneda", total: true },
        { header: "Transferencia", key: "transferencia", formato: "moneda", total: true },
        { header: "Otros", key: "otros", formato: "moneda", total: true },
      ],
      filas: cortes.map(filaCorteResumen),
    });
  }

  // -------------------------------- Clientes -------------------------------
  if (datos.clientes.length) {
    const porCliente = new Map();
    ventas.forEach((venta) => {
      const clave = String(venta?.clienteId || "").trim();
      if (!clave) return;
      const registro = porCliente.get(clave) || { compras: 0, total: 0, ultima: null };
      const fecha = aFecha(venta?.fecha);
      registro.compras += 1;
      registro.total += numero(venta?.total);
      if (fecha && (!registro.ultima || fecha > registro.ultima)) registro.ultima = fecha;
      porCliente.set(clave, registro);
    });

    const saldoPorCliente = new Map();
    datos.fiados.forEach((cuenta) => {
      const clave = String(cuenta?.clienteId || "").trim();
      if (!clave) return;
      saldoPorCliente.set(clave, (saldoPorCliente.get(clave) || 0) + numero(cuenta?.saldo));
    });

    await reporte.tabla({
      nombre: "Clientes",
      subtitulo: "Clientes y su actividad en el periodo",
      columnas: [
        { header: "Cliente", key: "nombre", ancho: 32, vacio: "Sin nombre" },
        { header: "Teléfono", key: "telefono", ancho: 17, vacio: "" },
        { header: "Compras del periodo", key: "compras", formato: "cantidad", total: true },
        { header: "Gastado en el periodo", key: "total", formato: "moneda", total: true },
        { header: "Última compra", key: "ultima", formato: "fecha", vacio: "Sin compras" },
        { header: "Saldo pendiente", key: "saldo", formato: "moneda", total: true },
      ],
      filas: datos.clientes
        .map((cliente) => {
          const registro = porCliente.get(String(cliente.id)) || null;
          return {
            nombre: textoSeguro(cliente?.nombre, ""),
            telefono: textoSeguro(cliente?.telefono, ""),
            compras: registro?.compras || 0,
            total: Number((registro?.total || 0).toFixed(2)),
            ultima: registro?.ultima || null,
            saldo: Number((saldoPorCliente.get(String(cliente.id)) || 0).toFixed(2)),
          };
        })
        .sort((a, b) => b.total - a.total),
    });
  }

  // --------------------------------- Fiado ---------------------------------
  if (datos.fiados.length) {
    await reporte.tabla({
      nombre: "Fiado",
      subtitulo: "Cuentas a crédito y su saldo",
      columnas: [
        { header: "Cliente", key: "cliente", ancho: 32 },
        { header: "Teléfono", key: "telefono", ancho: 17, vacio: "" },
        { header: "Límite de crédito", key: "limite", formato: "moneda" },
        { header: "Saldo", key: "saldo", formato: "moneda", total: true },
        { header: "Vencimiento", key: "vencimiento", formato: "fecha", vacio: "Sin fecha" },
      ],
      filas: datos.fiados
        .map((cuenta) => {
          const vencimiento = cuenta?.fechaVencimiento
            ? new Date(`${cuenta.fechaVencimiento}T12:00:00`)
            : null;
          return {
            cliente: textoSeguro(cuenta?.clienteNombre, "Cliente sin nombre"),
            telefono: textoSeguro(cuenta?.clienteTelefono, ""),
            limite: numero(cuenta?.limiteCredito),
            saldo: numero(cuenta?.saldo),
            vencimiento: vencimiento && !Number.isNaN(vencimiento.getTime()) ? vencimiento : null,
          };
        })
        .sort((a, b) => b.saldo - a.saldo),
    });
  }

  // ------------------------------- Impuestos -------------------------------
  if (ventas.length) {
    await reporte.tabla({
      nombre: "Impuestos",
      subtitulo: "Impuestos trasladados en el periodo",
      columnas: [
        { header: "Impuesto", key: "impuesto", ancho: 26 },
        { header: "Base (subtotal)", key: "base", formato: "moneda" },
        { header: "Importe", key: "importe", formato: "moneda", total: true },
        { header: "Operaciones", key: "operaciones", formato: "cantidad" },
      ],
      filas: [
        {
          impuesto: "IVA trasladado",
          base: metricas.subtotal,
          importe: metricas.iva,
          operaciones: ventas.filter((venta) => numero(venta?.iva) > 0).length,
        },
        {
          impuesto: "IEPS trasladado",
          base: metricas.subtotal,
          importe: metricas.ieps,
          operaciones: ventas.filter((venta) => numero(venta?.ieps) > 0).length,
        },
      ],
      nota: "Solo se incluyen los impuestos que CajaLibre calcula y guarda en cada venta.",
    });

    // ------------------------- Reporte factura global ------------------------
    const fiscal = contexto.fiscal || {};
    await reporte.tabla({
      nombre: "Factura global",
      subtitulo: "Información para preparar la factura global",
      columnas: [
        { header: "Folio de venta", key: "folio", ancho: 18 },
        { header: "Fecha", key: "fecha", formato: "fecha" },
        { header: "Hora", key: "hora", formato: "hora" },
        { header: "Subtotal", key: "subtotal", formato: "moneda", total: true },
        { header: "Descuento", key: "descuento", formato: "moneda", total: true },
        { header: "IVA", key: "iva", formato: "moneda", total: true },
        { header: "IEPS", key: "ieps", formato: "moneda", total: true },
        { header: "Total", key: "total", formato: "moneda", total: true },
        { header: "Forma de pago", key: "metodo", ancho: 18 },
        { header: "Estado", key: "estado", ancho: 18 },
      ],
      filas: ventas.map((venta) => {
        const fecha = aFecha(venta?.fecha);
        return {
          folio: String(venta?.folioTicket || venta?.id || "").trim() || "Sin folio",
          fecha,
          hora: fecha,
          subtotal: numero(venta?.subtotal),
          descuento: descuentoTotalVenta(venta),
          iva: numero(venta?.iva),
          ieps: numero(venta?.ieps),
          total: numero(venta?.total),
          metodo: etiquetaMetodoPago(venta?.tipoPago),
          estado: estadoVenta(venta),
        };
      }),
      nota: `${AVISO_FACTURA_GLOBAL} RFC del emisor: ${textoSeguro(fiscal.rfc, "no registrado")}. `
        + `Razón social: ${textoSeguro(fiscal.razonSocial, "no registrada")}.`,
    });
  }

  // ------------------------------- Restaurante -----------------------------
  // Solo si el negocio realmente opera en modo restaurante y tiene comandas.
  if (contexto.esRestaurante) {
    const ordenes = normalizarOrdenes(datos.ordenes).filter((orden) => {
      if (!orden.fecha) return false;
      if (contexto.desde && orden.fecha < contexto.desde) return false;
      if (contexto.hasta && orden.fecha > contexto.hasta) return false;
      return true;
    });
    const platillos = platillosVendidos(ordenes.filter((orden) => orden.statusCrudo === "cobrada"));

    if (platillos.length) {
      await reporte.tabla({
        nombre: "Restaurante",
        subtitulo: "Platillos vendidos en el periodo",
        columnas: [
          { header: "Platillo", key: "nombre", ancho: 38 },
          { header: "Categoría", key: "categoria", ancho: 22 },
          { header: "Cantidad", key: "cantidad", formato: "decimal", total: true },
          { header: "Importe", key: "importe", formato: "moneda", total: true },
          { header: "Participación", key: "participacion", formato: "porcentaje" },
        ],
        filas: platillos,
      });
    }
  }

  return reporte.descargar(nombreArchivo(contexto, "Paquete_Administrativo"));
}
