// ---------------------------------------------------------------------------
// Reportes de ventas, resumen ejecutivo, cobros, descuentos, factura global y
// rentabilidad.
//
// Cada generador recibe el contexto ya resuelto (datos, periodo, negocio) y
// solo decide QUE informacion entra y como se ordena. El aspecto lo pone el
// kit; las cifras las calcula la capa de datos.
//
// La diferencia entre la version Free y la Premium de un mismo tema no es el
// diseño: es la profundidad. Free responde "que paso"; Premium agrega cuando,
// como, quien, cuanto costo y cuanto dejo.
// ---------------------------------------------------------------------------

import { aFecha, errorSinDatos, FORMATO, numero, textoSeguro } from "./excel_kit.js";
import {
  calcularMetricas,
  cobrosPorMetodo,
  consolidadoProductos,
  costoUnitario,
  descuentoTotalVenta,
  empleadoDeVenta,
  estadoVenta,
  etiquetaMetodoPago,
  filtrarPorFecha,
  indexarEmpleados,
  indexarProductos,
  resumenFiados,
  ventasPorCategoria,
  ventasPorDia,
  ventasPorEmpleado,
  ventasPorHora,
  ventasPorMes,
} from "./datos_reportes.js";
import {
  AVISO_COSTO_PARCIAL,
  AVISO_ESTIMACION,
  AVISO_FACTURA_GLOBAL,
  COLUMNAS_VENTA_BASICA,
  filaVentaBasica,
  iniciarReporte,
  nombreArchivo,
  recortarParaGrafica,
  serieTemporal,
  tarjeta,
} from "./generadores_comun.js";

/** Ventas del periodo pedido, en orden cronologico. */
function ventasDelPeriodo(contexto) {
  return filtrarPorFecha(contexto.datos.ventas, "fecha", contexto)
    .slice()
    .sort((a, b) => (aFecha(a?.fecha)?.getTime() || 0) - (aFecha(b?.fecha)?.getTime() || 0));
}

/** Ventas del periodo inmediatamente anterior, para las comparativas. */
function ventasComparativas(contexto) {
  if (!contexto.comparativo) return [];
  return filtrarPorFecha(contexto.datos.ventas, "fecha", contexto.comparativo);
}

function filasVentaBasicas(ventas) {
  return ventas.map((venta) => filaVentaBasica(venta, {
    fecha: aFecha(venta?.fecha),
    metodo: etiquetaMetodoPago(venta?.tipoPago),
    estado: estadoVenta(venta),
  }));
}

// ===========================================================================
// 1. Resumen de ventas (Free)
// ===========================================================================

export async function resumenVentas(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  if (!ventas.length) throw errorSinDatos();

  const metricas = calcularMetricas(ventas);
  const porDia = ventasPorDia(ventas);
  const cobros = cobrosPorMetodo(ventas);
  const serie = serieTemporal(porDia);

  const reporte = await iniciarReporte(contexto, "Resumen de ventas");
  const dash = await reporte.dashboard({ subtitulo: "Resumen del periodo" });

  dash.tarjetas([
    tarjeta("Total vendido", metricas.total, "moneda"),
    tarjeta("Operaciones", metricas.operaciones, "cantidad"),
    tarjeta("Ticket promedio", metricas.ticketPromedio, "moneda"),
    tarjeta("Productos vendidos", metricas.unidades, "cantidad"),
  ]);

  dash.seccion("Cobros por forma de pago");
  dash.datos([
    ...cobros.map((cobro) => ({ etiqueta: cobro.label, valor: cobro.value, formato: "moneda" })),
    { etiqueta: "Descuentos otorgados", valor: metricas.descuentos, formato: "moneda" },
  ]);

  dash.seccion("Comportamiento del periodo");
  dash.graficas([
    {
      tipo: "linea",
      titulo: serie.recortada ? "Ventas por día (últimos 31 días)" : "Ventas por día",
      datos: serie.datos,
    },
    { tipo: "dona", titulo: "Métodos de pago", datos: cobros },
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Detalle",
    subtitulo: "Operaciones del periodo",
    columnas: COLUMNAS_VENTA_BASICA,
    filas: filasVentaBasicas(ventas),
  });

  return reporte.descargar(nombreArchivo(contexto, "Resumen_Ventas"));
}

// ===========================================================================
// 2. Reporte ejecutivo (Free: resumen / Premium: completo con comparativa)
// ===========================================================================

export async function ejecutivoBasico(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  if (!ventas.length) throw errorSinDatos();

  const metricas = calcularMetricas(ventas);
  const cobros = cobrosPorMetodo(ventas);
  const consolidado = consolidadoProductos(ventas);
  const serie = serieTemporal(ventasPorDia(ventas));

  const reporte = await iniciarReporte(contexto, "Reporte ejecutivo");
  const dash = await reporte.dashboard({ subtitulo: "Panorama del periodo" });

  dash.tarjetas([
    tarjeta("Total vendido", metricas.total, "moneda"),
    tarjeta("Operaciones", metricas.operaciones, "cantidad"),
    tarjeta("Ticket promedio", metricas.ticketPromedio, "moneda"),
    tarjeta("Productos vendidos", metricas.unidades, "cantidad"),
  ]);

  dash.seccion("Resumen", "Cifras generales del periodo seleccionado");
  dash.datos([
    { etiqueta: "Subtotal", valor: metricas.subtotal, formato: "moneda" },
    { etiqueta: "Impuestos trasladados", valor: metricas.impuestos, formato: "moneda" },
    { etiqueta: "Descuentos otorgados", valor: metricas.descuentos, formato: "moneda" },
    { etiqueta: "Ventas a crédito", valor: metricas.fiado, formato: "moneda" },
    ...cobros.map((cobro) => ({ etiqueta: cobro.label, valor: cobro.value, formato: "moneda" })),
  ]);

  dash.seccion("Comportamiento");
  dash.graficas([
    { tipo: "linea", titulo: "Ventas por día", datos: serie.datos },
    { tipo: "dona", titulo: "Métodos de pago", datos: cobros },
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Productos",
    subtitulo: "Lo vendido en el periodo",
    columnas: [
      { header: "Producto", key: "nombre", ancho: 38 },
      { header: "Categoría", key: "categoria", ancho: 20 },
      { header: "Unidades", key: "unidades", formato: "decimal", total: true },
      { header: "Importe vendido", key: "ingreso", formato: "moneda", total: true },
    ],
    filas: consolidado,
  });

  await reporte.tabla({
    nombre: "Ventas",
    subtitulo: "Operaciones del periodo",
    columnas: COLUMNAS_VENTA_BASICA,
    filas: filasVentaBasicas(ventas),
  });

  return reporte.descargar(nombreArchivo(contexto, "Reporte_Ejecutivo"));
}

export async function ejecutivoCompleto(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  if (!ventas.length) throw errorSinDatos();

  const { productos, clientes, fiados, egresos } = contexto.datos;
  const indiceProductos = indexarProductos(productos);
  const indiceEmpleados = indexarEmpleados(contexto.datos.empleados);
  const egresosPeriodo = filtrarPorFecha(egresos, "fecha", contexto);

  const metricas = calcularMetricas(ventas, { indiceProductos, egresos: egresosPeriodo });
  const anteriores = ventasComparativas(contexto);
  const metricasAnteriores = anteriores.length
    ? calcularMetricas(anteriores, { indiceProductos })
    : null;

  const consolidado = consolidadoProductos(ventas, indiceProductos);
  const categorias = ventasPorCategoria(consolidado);
  const cobros = cobrosPorMetodo(ventas);
  const porEmpleado = ventasPorEmpleado(ventas, indiceEmpleados);
  const porDia = ventasPorDia(ventas);
  const porHora = ventasPorHora(ventas);
  const porMes = ventasPorMes(ventas);
  const credito = resumenFiados(fiados, contexto);
  const serie = serieTemporal(porDia);

  // Clientes: nuevos son los registrados dentro del periodo; frecuentes, los
  // que compraron mas de una vez en el. Las dos cifras salen de datos reales,
  // no de una clasificacion guardada en el cliente.
  const clientesNuevos = filtrarPorFecha(clientes, "createdAt", contexto).length;
  const comprasPorCliente = new Map();
  ventas.forEach((venta) => {
    const clave = String(venta?.clienteId || venta?.clienteTelefono || "").trim();
    if (!clave) return;
    comprasPorCliente.set(clave, (comprasPorCliente.get(clave) || 0) + 1);
  });
  const clientesFrecuentes = [...comprasPorCliente.values()].filter((veces) => veces > 1).length;

  const reporte = await iniciarReporte(contexto, "Reporte ejecutivo completo");

  // --- Hoja 1: Dashboard ---
  const dash = await reporte.dashboard({ subtitulo: "Panorama integral del negocio" });
  dash.tarjetas([
    tarjeta("Ventas", metricas.total, "moneda", metricasAnteriores?.total ?? null),
    tarjeta("Operaciones", metricas.operaciones, "cantidad", metricasAnteriores?.operaciones ?? null),
    tarjeta("Ticket promedio", metricas.ticketPromedio, "moneda", metricasAnteriores?.ticketPromedio ?? null),
    tarjeta("Utilidad estimada", metricas.utilidadBruta, "moneda", metricasAnteriores?.utilidadBruta ?? null),
    tarjeta("Egresos", metricas.egresos, "moneda"),
    tarjeta("Clientes atendidos", comprasPorCliente.size, "cantidad", null, "Clientes identificados"),
    tarjeta("Productos vendidos", metricas.unidades, "cantidad", metricasAnteriores?.unidades ?? null),
    tarjeta("Saldo por cobrar", credito.pendiente, "moneda", null, `${credito.conDeuda} cliente(s) con deuda`),
  ]);

  dash.seccion("Tendencia y cobros");
  dash.graficas([
    {
      tipo: "linea",
      titulo: serie.recortada ? "Ventas por día (últimos 31 días)" : "Ventas por día",
      datos: serie.datos,
    },
    { tipo: "dona", titulo: "Métodos de pago", datos: cobros },
  ]);

  dash.seccion("Productos y resultado");
  dash.graficas([
    {
      tipo: "barra",
      titulo: "Productos más vendidos",
      datos: recortarParaGrafica(
        consolidado.map((item) => ({ label: item.nombre, value: item.ingreso })),
        10,
      ),
    },
    {
      tipo: "columna",
      titulo: "Ingresos vs egresos",
      datos: (porMes.length > 1 ? porMes : porDia).slice(-12).map((punto) => ({ label: punto.label })),
      series: [
        {
          nombre: "Ingresos",
          valores: (porMes.length > 1 ? porMes : porDia).slice(-12).map((punto) => punto.value),
        },
        {
          nombre: "Egresos",
          valores: (porMes.length > 1 ? porMes : porDia).slice(-12).map((punto) => {
            // Los egresos se acumulan en la misma unidad de tiempo que los
            // ingresos para que las dos series sean comparables.
            const mismaUnidad = porMes.length > 1
              ? (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`
              : (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
            return egresosPeriodo
              .filter((egreso) => egreso.fecha && mismaUnidad(egreso.fecha) === punto.clave)
              .reduce((suma, egreso) => suma + egreso.monto, 0);
          }),
        },
      ],
    },
  ]);

  dash.seccion("Categorías y equipo");
  dash.graficas([
    {
      tipo: "columna",
      titulo: "Ventas por categoría",
      datos: recortarParaGrafica(categorias, 8),
    },
    {
      tipo: "barra",
      titulo: "Ventas por empleado",
      datos: porEmpleado.map((item) => ({ label: item.nombre, value: item.total })).slice(0, 10),
    },
  ]);

  dash.seccion("Resumen ejecutivo");
  dash.datos([
    { etiqueta: "Subtotal", valor: metricas.subtotal, formato: "moneda" },
    { etiqueta: "IVA trasladado", valor: metricas.iva, formato: "moneda" },
    { etiqueta: "IEPS trasladado", valor: metricas.ieps, formato: "moneda" },
    { etiqueta: "Descuentos otorgados", valor: metricas.descuentos, formato: "moneda" },
    { etiqueta: "Costo de mercancía vendida", valor: metricas.costo, formato: "moneda" },
    { etiqueta: "Utilidad bruta estimada", valor: metricas.utilidadBruta, formato: "moneda" },
    { etiqueta: "Margen bruto", valor: metricas.margen, formato: "porcentaje" },
    { etiqueta: "Egresos del periodo", valor: metricas.egresos, formato: "moneda" },
    { etiqueta: "Resultado estimado", valor: metricas.resultado, formato: "moneda" },
    { etiqueta: "Clientes nuevos", valor: clientesNuevos, formato: "cantidad" },
    { etiqueta: "Clientes frecuentes", valor: clientesFrecuentes, formato: "cantidad" },
    { etiqueta: "Fiado generado", valor: credito.generado, formato: "moneda" },
    { etiqueta: "Fiado recuperado", valor: credito.recuperado, formato: "moneda" },
    { etiqueta: "Saldo por cobrar", valor: credito.pendiente, formato: "moneda" },
  ]);

  if (metricas.costoParcial) dash.aviso(AVISO_COSTO_PARCIAL);
  dash.aviso(AVISO_ESTIMACION);
  dash.cerrar({});

  // --- Hoja 2: Ventas ---
  await reporte.tabla({
    nombre: "Ventas",
    subtitulo: "Comportamiento por día y por hora",
    columnas: [
      { header: "Día", key: "label", ancho: 14 },
      { header: "Operaciones", key: "operaciones", formato: "cantidad", total: true },
      { header: "Importe vendido", key: "value", formato: "moneda", total: true },
      { header: "Ticket promedio", key: "promedio", formato: "moneda" },
    ],
    filas: porDia.map((dia) => ({
      ...dia,
      promedio: dia.operaciones > 0 ? dia.value / dia.operaciones : 0,
    })),
  });

  await reporte.tabla({
    nombre: "Por hora",
    subtitulo: "Distribución de ventas a lo largo del día",
    columnas: [
      { header: "Hora", key: "label", ancho: 12 },
      { header: "Operaciones", key: "operaciones", formato: "cantidad", total: true },
      { header: "Importe vendido", key: "value", formato: "moneda", total: true },
    ],
    filas: porHora,
  });

  // --- Hoja 3: Productos ---
  await reporte.tabla({
    nombre: "Productos",
    subtitulo: "Rendimiento por producto",
    columnas: [
      { header: "Producto", key: "nombre", ancho: 38 },
      { header: "Código", key: "codigo", ancho: 16, vacio: "" },
      { header: "Categoría", key: "categoria", ancho: 20 },
      { header: "Unidades", key: "unidades", formato: "decimal", total: true },
      { header: "Importe vendido", key: "ingreso", formato: "moneda", total: true },
      { header: "Costo estimado", key: "costo", formato: "moneda", total: true },
      { header: "Utilidad estimada", key: "utilidad", formato: "moneda", total: true },
      { header: "Margen", key: "margen", formato: "porcentaje" },
      { header: "Última venta", key: "ultimaVenta", formato: "fecha" },
    ],
    filas: consolidado,
    nota: metricas.costoParcial ? AVISO_COSTO_PARCIAL : "",
  });

  await reporte.tabla({
    nombre: "Categorias",
    subtitulo: "Participación por categoría",
    columnas: [
      { header: "Categoría", key: "label", ancho: 26 },
      { header: "Unidades", key: "unidades", formato: "decimal", total: true },
      { header: "Importe vendido", key: "value", formato: "moneda", total: true },
      { header: "Utilidad estimada", key: "utilidad", formato: "moneda", total: true },
    ],
    filas: categorias,
  });

  // --- Hoja 4: Finanzas ---
  await reporte.tabla({
    nombre: "Finanzas",
    subtitulo: "Cobros, descuentos y egresos",
    columnas: [
      { header: "Concepto", key: "concepto", ancho: 32 },
      { header: "Importe", key: "importe", formato: "moneda" },
      { header: "Participación", key: "participacion", formato: "porcentaje" },
    ],
    filas: [
      ...cobros.map((cobro) => ({
        concepto: `Cobrado en ${cobro.label.toLowerCase()}`,
        importe: cobro.value,
        participacion: cobro.participacion,
      })),
      { concepto: "Descuentos otorgados", importe: metricas.descuentos, participacion: metricas.total > 0 ? metricas.descuentos / metricas.total : 0 },
      { concepto: "Costo de mercancía vendida", importe: metricas.costo, participacion: metricas.total > 0 ? metricas.costo / metricas.total : 0 },
      { concepto: "Utilidad bruta estimada", importe: metricas.utilidadBruta, participacion: metricas.margen },
      { concepto: "Egresos del periodo", importe: metricas.egresos, participacion: metricas.total > 0 ? metricas.egresos / metricas.total : 0 },
      { concepto: "Resultado estimado", importe: metricas.resultado, participacion: metricas.total > 0 ? metricas.resultado / metricas.total : 0 },
    ],
    totales: false,
    nota: AVISO_ESTIMACION,
  });

  // --- Hoja 5: Clientes ---
  if (comprasPorCliente.size) {
    const porCliente = new Map();
    ventas.forEach((venta) => {
      const clave = String(venta?.clienteId || venta?.clienteTelefono || "").trim();
      if (!clave) return;
      const registro = porCliente.get(clave) || {
        cliente: textoSeguro(venta?.clienteNombre, "Cliente sin nombre"),
        telefono: textoSeguro(venta?.clienteTelefono, ""),
        compras: 0,
        total: 0,
        ultima: null,
      };
      const fecha = aFecha(venta?.fecha);
      registro.compras += 1;
      registro.total += numero(venta?.total);
      if (fecha && (!registro.ultima || fecha > registro.ultima)) registro.ultima = fecha;
      porCliente.set(clave, registro);
    });

    await reporte.tabla({
      nombre: "Clientes",
      subtitulo: "Clientes identificados en el periodo",
      columnas: [
        { header: "Cliente", key: "cliente", ancho: 30 },
        { header: "Teléfono", key: "telefono", ancho: 16, vacio: "" },
        { header: "Compras", key: "compras", formato: "cantidad", total: true },
        { header: "Total gastado", key: "total", formato: "moneda", total: true },
        { header: "Ticket promedio", key: "promedio", formato: "moneda" },
        { header: "Última compra", key: "ultima", formato: "fecha" },
      ],
      filas: [...porCliente.values()]
        .map((item) => ({ ...item, promedio: item.compras > 0 ? item.total / item.compras : 0 }))
        .sort((a, b) => b.total - a.total),
      nota: "Solo incluye ventas con cliente identificado. Las ventas a público general no se asocian a ningún cliente.",
    });
  }

  // --- Hoja 6: Datos ---
  await reporte.tabla({
    nombre: "Datos",
    subtitulo: "Operaciones del periodo",
    columnas: [
      ...COLUMNAS_VENTA_BASICA,
      { header: "Cliente", key: "cliente", ancho: 28, vacio: "Público general" },
      { header: "Subtotal", key: "subtotal", formato: "moneda", total: true },
      { header: "Descuento", key: "descuento", formato: "moneda", total: true },
      { header: "IVA", key: "iva", formato: "moneda", total: true },
      { header: "IEPS", key: "ieps", formato: "moneda", total: true },
      { header: "Atendió", key: "atendio", ancho: 22 },
    ],
    filas: ventas.map((venta) => ({
      ...filaVentaBasica(venta, {
        fecha: aFecha(venta?.fecha),
        metodo: etiquetaMetodoPago(venta?.tipoPago),
        estado: estadoVenta(venta),
      }),
      cliente: venta?.clienteNombre,
      subtotal: venta?.subtotal,
      descuento: descuentoTotalVenta(venta),
      iva: venta?.iva,
      ieps: venta?.ieps,
      atendio: empleadoDeVenta(venta, indiceEmpleados),
    })),
  });

  return reporte.descargar(nombreArchivo(contexto, "Reporte_Ejecutivo_Completo"));
}

// ===========================================================================
// 4. Historial de ventas
// ===========================================================================

export async function historialVentas(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  if (!ventas.length) throw errorSinDatos();

  const metricas = calcularMetricas(ventas);
  const serie = serieTemporal(ventasPorDia(ventas));

  const reporte = await iniciarReporte(contexto, "Historial de ventas");
  const dash = await reporte.dashboard({ subtitulo: "Resumen del historial" });
  dash.tarjetas([
    tarjeta("Total vendido", metricas.total, "moneda"),
    tarjeta("Operaciones", metricas.operaciones, "cantidad"),
    tarjeta("Ticket promedio", metricas.ticketPromedio, "moneda"),
    tarjeta("Productos vendidos", metricas.unidades, "cantidad"),
  ]);
  dash.seccion("Comportamiento");
  dash.graficas([{ tipo: "linea", titulo: "Ventas por día", datos: serie.datos }]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Ventas",
    subtitulo: "Operaciones del periodo",
    columnas: COLUMNAS_VENTA_BASICA,
    filas: filasVentaBasicas(ventas),
  });

  return reporte.descargar(nombreArchivo(contexto, "Historial_Ventas"));
}

export async function historialVentasCompleto(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  if (!ventas.length) throw errorSinDatos();

  const indiceProductos = indexarProductos(contexto.datos.productos);
  const indiceEmpleados = indexarEmpleados(contexto.datos.empleados);
  const metricas = calcularMetricas(ventas, { indiceProductos });
  const cobros = cobrosPorMetodo(ventas);
  const consolidado = consolidadoProductos(ventas, indiceProductos);
  const serie = serieTemporal(ventasPorDia(ventas));

  // Una fila por producto vendido: es el nivel de detalle que permite auditar
  // una venta linea por linea.
  const filas = [];
  ventas.forEach((venta) => {
    const fecha = aFecha(venta?.fecha);
    const base = {
      folio: String(venta?.folioTicket || venta?.id || "").trim() || "Sin folio",
      fecha,
      hora: fecha,
      cliente: venta?.clienteNombre,
      metodo: etiquetaMetodoPago(venta?.tipoPago),
      estado: estadoVenta(venta),
      empleado: empleadoDeVenta(venta, indiceEmpleados),
      mesa: venta?.mesaEtiqueta,
      totalVenta: numero(venta?.total),
    };
    const items = Array.isArray(venta?.productos) ? venta.productos : [];

    if (!items.length) {
      filas.push({ ...base, producto: "Venta sin productos registrados", cantidad: 0 });
      return;
    }

    // El descuento y los impuestos son de la venta completa; se reparten entre
    // sus lineas segun el peso de cada una, para que la suma de la columna
    // siga coincidiendo con el total de la venta.
    const importeTotal = items.reduce((suma, item) => suma + numero(item?.precioVenta ?? item?.precio) * (numero(item?.cantidad) || 1), 0);
    const descuentoVenta = descuentoTotalVenta(venta);

    items.forEach((item) => {
      const cantidad = numero(item?.cantidad) || 1;
      const precio = numero(item?.precioVenta ?? item?.precio);
      const importe = precio * cantidad;
      const peso = importeTotal > 0 ? importe / importeTotal : 1 / items.length;
      // Un costo desconocido se muestra como 0 en la columna, pero la utilidad
      // del periodo se calcula aparte y avisa cuando fue parcial.
      const unitario = costoUnitario(item, indiceProductos) ?? 0;

      filas.push({
        ...base,
        producto: textoSeguro(item?.nombre, "Sin nombre"),
        codigo: textoSeguro(item?.codigo, ""),
        categoria: textoSeguro(item?.categoria, "Sin categoría"),
        cantidad,
        precioUnitario: precio,
        costoUnitario: unitario,
        descuento: Number((descuentoVenta * peso).toFixed(2)),
        subtotal: importe,
        impuestos: Number(((numero(venta?.iva) + numero(venta?.ieps)) * peso).toFixed(2)),
        total: Number((importe - descuentoVenta * peso).toFixed(2)),
        ganancia: Number((importe - unitario * cantidad - descuentoVenta * peso).toFixed(2)),
        observaciones: textoSeguro(venta?.promocionDescuentoAplicado?.nombre, ""),
      });
    });
  });

  const reporte = await iniciarReporte(contexto, "Historial de ventas completo");
  const dash = await reporte.dashboard({ subtitulo: "Detalle por producto vendido" });
  dash.tarjetas([
    tarjeta("Total vendido", metricas.total, "moneda"),
    tarjeta("Operaciones", metricas.operaciones, "cantidad"),
    tarjeta("Ticket promedio", metricas.ticketPromedio, "moneda"),
    tarjeta("Utilidad estimada", metricas.utilidadBruta, "moneda"),
  ]);
  dash.seccion("Comportamiento del periodo");
  dash.graficas([
    { tipo: "linea", titulo: "Ventas por día", datos: serie.datos },
    { tipo: "columna", titulo: "Ventas por hora", datos: ventasPorHora(ventas) },
  ]);
  dash.graficas([
    { tipo: "columna", titulo: "Ventas por categoría", datos: recortarParaGrafica(ventasPorCategoria(consolidado), 8) },
    { tipo: "dona", titulo: "Métodos de pago", datos: cobros },
  ]);
  if (metricas.costoParcial) dash.aviso(AVISO_COSTO_PARCIAL);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Detalle",
    subtitulo: "Una fila por producto vendido",
    columnas: [
      { header: "Folio", key: "folio", ancho: 16 },
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Hora", key: "hora", formato: "hora" },
      { header: "Cliente", key: "cliente", ancho: 26, vacio: "Público general" },
      { header: "Producto", key: "producto", ancho: 34 },
      { header: "Código", key: "codigo", ancho: 15, vacio: "" },
      { header: "Categoría", key: "categoria", ancho: 18 },
      { header: "Cantidad", key: "cantidad", formato: "decimal", total: true },
      { header: "Precio unitario", key: "precioUnitario", formato: "moneda" },
      { header: "Costo unitario", key: "costoUnitario", formato: "moneda" },
      { header: "Descuento", key: "descuento", formato: "moneda", total: true },
      { header: "Subtotal", key: "subtotal", formato: "moneda", total: true },
      { header: "Impuestos", key: "impuestos", formato: "moneda", total: true },
      { header: "Total", key: "total", formato: "moneda", total: true },
      { header: "Ganancia estimada", key: "ganancia", formato: "moneda", total: true },
      { header: "Atendió", key: "empleado", ancho: 22 },
      { header: "Método de pago", key: "metodo", ancho: 18 },
      { header: "Estado", key: "estado", ancho: 18 },
      { header: "Mesa", key: "mesa", ancho: 14, vacio: "" },
      { header: "Observaciones", key: "observaciones", ancho: 26, vacio: "" },
    ],
    filas,
    nota: metricas.costoParcial ? AVISO_COSTO_PARCIAL : "",
  });

  await reporte.tabla({
    nombre: "Ventas",
    subtitulo: "Resumen por operación",
    columnas: COLUMNAS_VENTA_BASICA,
    filas: filasVentaBasicas(ventas),
  });

  return reporte.descargar(nombreArchivo(contexto, "Historial_Ventas_Completo"));
}

// ===========================================================================
// 17. Metodos de pago
// ===========================================================================

export async function metodosPagoBasico(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  if (!ventas.length) throw errorSinDatos();

  const cobros = cobrosPorMetodo(ventas);
  const metricas = calcularMetricas(ventas);

  const reporte = await iniciarReporte(contexto, "Métodos de pago");
  const dash = await reporte.dashboard({ subtitulo: "Cómo te pagan tus clientes" });
  dash.tarjetas([
    tarjeta("Total cobrado", metricas.total, "moneda"),
    tarjeta("Operaciones", metricas.operaciones, "cantidad"),
    tarjeta("Forma principal", cobros[0]?.label || "N/A", "texto", null,
      cobros[0] ? `${(cobros[0].participacion * 100).toFixed(1)}% del total` : ""),
    tarjeta("Ticket promedio", metricas.ticketPromedio, "moneda"),
  ]);
  dash.seccion("Participación por forma de pago");
  dash.graficas([{ tipo: "dona", titulo: "Métodos de pago", datos: cobros }]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Metodos",
    subtitulo: "Resumen por forma de pago",
    columnas: [
      { header: "Método de pago", key: "label", ancho: 24 },
      { header: "Importe", key: "value", formato: "moneda", total: true },
      { header: "Participación", key: "participacion", formato: "porcentaje" },
    ],
    filas: cobros,
  });

  return reporte.descargar(nombreArchivo(contexto, "Metodos_Pago"));
}

export async function metodosPagoAvanzado(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  if (!ventas.length) throw errorSinDatos();

  const indiceEmpleados = indexarEmpleados(contexto.datos.empleados);
  const cobros = cobrosPorMetodo(ventas);
  const metricas = calcularMetricas(ventas);
  const anteriores = ventasComparativas(contexto);
  const cobrosAnteriores = anteriores.length ? cobrosPorMetodo(anteriores) : [];
  const anteriorPorMetodo = new Map(cobrosAnteriores.map((item) => [item.label, item.value]));

  // Evolucion diaria de cada forma de pago.
  //
  // Las ventas se agrupan por dia UNA vez y cada dia se desglosa UNA vez. La
  // alternativa obvia -- recorrer todas las ventas por cada dia y por cada
  // metodo -- multiplica el trabajo por noventa en un mes y se nota en cuanto
  // el negocio tiene varios miles de operaciones.
  const dias = ventasPorDia(ventas);
  const ventasPorClaveDia = new Map();
  ventas.forEach((venta) => {
    const fecha = aFecha(venta?.fecha);
    if (!fecha) return;
    const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
    if (!ventasPorClaveDia.has(clave)) ventasPorClaveDia.set(clave, []);
    ventasPorClaveDia.get(clave).push(venta);
  });
  const cobrosPorClaveDia = new Map(
    [...ventasPorClaveDia.entries()].map(([clave, lista]) => [
      clave,
      new Map(cobrosPorMetodo(lista).map((item) => [item.label, item.value])),
    ]),
  );
  const metodosPrincipales = cobros.slice(0, 3).map((item) => item.label);
  const seriesEvolucion = metodosPrincipales.map((metodo) => ({
    nombre: metodo,
    valores: dias.map((dia) => cobrosPorClaveDia.get(dia.clave)?.get(metodo) || 0),
  }));

  const reporte = await iniciarReporte(contexto, "Métodos de pago avanzado");
  const dash = await reporte.dashboard({ subtitulo: "Detalle y evolución de los cobros" });
  dash.tarjetas([
    tarjeta("Total cobrado", metricas.total, "moneda", anteriores.length ? calcularMetricas(anteriores).total : null),
    tarjeta("Operaciones", metricas.operaciones, "cantidad", anteriores.length ? anteriores.length : null),
    tarjeta("Forma principal", cobros[0]?.label || "N/A", "texto", null,
      cobros[0] ? `${(cobros[0].participacion * 100).toFixed(1)}% del total` : ""),
    tarjeta("Ticket promedio", metricas.ticketPromedio, "moneda"),
  ]);

  dash.seccion("Participación y evolución");
  dash.graficas([
    { tipo: "dona", titulo: "Métodos de pago", datos: cobros },
    {
      tipo: "linea",
      titulo: "Evolución por forma de pago",
      datos: dias.slice(-31).map((dia) => ({ label: dia.label })),
      series: seriesEvolucion.map((serie) => ({ ...serie, valores: serie.valores.slice(-31) })),
    },
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Metodos",
    subtitulo: "Comparativa contra el periodo anterior",
    columnas: [
      { header: "Método de pago", key: "label", ancho: 24 },
      { header: "Importe", key: "value", formato: "moneda", total: true },
      { header: "Operaciones", key: "operaciones", formato: "cantidad", total: true },
      { header: "Ticket promedio", key: "ticketPromedio", formato: "moneda" },
      { header: "Participación", key: "participacion", formato: "porcentaje" },
      { header: "Periodo anterior", key: "anterior", formato: "moneda", total: true },
      { header: "Variación", key: "cambio", formato: "porcentaje" },
    ],
    filas: cobros.map((cobro) => {
      const anterior = anteriorPorMetodo.get(cobro.label) ?? null;
      return {
        ...cobro,
        anterior: anterior ?? 0,
        cambio: anterior && anterior !== 0 ? (cobro.value - anterior) / Math.abs(anterior) : 0,
      };
    }),
    nota: anteriores.length
      ? ""
      : "No hay operaciones en el periodo anterior, así que no se muestra comparativa.",
  });

  await reporte.tabla({
    nombre: "Evolucion",
    subtitulo: "Cobros por día",
    columnas: [
      { header: "Día", key: "label", ancho: 14 },
      { header: "Operaciones", key: "operaciones", formato: "cantidad", total: true },
      { header: "Importe cobrado", key: "value", formato: "moneda", total: true },
    ],
    filas: dias,
  });

  await reporte.tabla({
    nombre: "Datos",
    subtitulo: "Cobros operación por operación",
    columnas: [
      { header: "Folio", key: "folio", ancho: 16 },
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Hora", key: "hora", formato: "hora" },
      { header: "Método de pago", key: "metodo", ancho: 18 },
      { header: "Efectivo", key: "efectivo", formato: "moneda", total: true },
      { header: "Tarjeta", key: "tarjeta", formato: "moneda", total: true },
      { header: "Transferencia", key: "transferencia", formato: "moneda", total: true },
      { header: "Total", key: "total", formato: "moneda", total: true },
      { header: "Referencia", key: "referencia", ancho: 20, vacio: "" },
      { header: "Cajero", key: "cajero", ancho: 22 },
    ],
    filas: ventas.map((venta) => {
      const fecha = aFecha(venta?.fecha);
      const detalle = venta?.pagoDetalle || {};
      return {
        folio: String(venta?.folioTicket || venta?.id || "").trim() || "Sin folio",
        fecha,
        hora: fecha,
        metodo: etiquetaMetodoPago(venta?.tipoPago),
        efectivo: numero(detalle?.efectivo),
        tarjeta: numero(detalle?.tarjeta),
        transferencia: numero(detalle?.transferencia),
        total: numero(venta?.total),
        referencia: textoSeguro(detalle?.referenciaTarjeta, ""),
        cajero: empleadoDeVenta(venta, indiceEmpleados),
      };
    }),
  });

  return reporte.descargar(nombreArchivo(contexto, "Metodos_Pago_Avanzado"));
}

// ===========================================================================
// 14. Auditoria de descuentos
// ===========================================================================

export async function auditoriaDescuentos(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  const conDescuento = ventas.filter((venta) => descuentoTotalVenta(venta) > 0);
  if (!conDescuento.length) {
    throw errorSinDatos("No se registraron descuentos en el periodo seleccionado.");
  }

  const indiceEmpleados = indexarEmpleados(contexto.datos.empleados);
  const totalVentas = ventas.reduce((suma, venta) => suma + numero(venta?.total), 0);
  const totalDescuentos = conDescuento.reduce((suma, venta) => suma + descuentoTotalVenta(venta), 0);

  const filas = conDescuento.map((venta) => {
    const fecha = aFecha(venta?.fecha);
    const descuento = descuentoTotalVenta(venta);
    const total = numero(venta?.total);
    return {
      folio: String(venta?.folioTicket || venta?.id || "").trim() || "Sin folio",
      fecha,
      hora: fecha,
      precioOriginal: Number((total + descuento).toFixed(2)),
      manual: numero(venta?.descuentoManual),
      promocion: numero(venta?.descuentoRegla),
      puntos: numero(venta?.descuentoPuntos),
      descuento: Number(descuento.toFixed(2)),
      precioFinal: total,
      peso: total + descuento > 0 ? descuento / (total + descuento) : 0,
      regla: textoSeguro(venta?.promocionDescuentoAplicado?.nombre, ""),
      empleado: empleadoDeVenta(venta, indiceEmpleados),
      cliente: venta?.clienteNombre,
    };
  });

  // Descuentos agrupados por persona y por dia, para las graficas.
  const porEmpleado = new Map();
  const porDia = new Map();
  filas.forEach((fila) => {
    porEmpleado.set(fila.empleado, (porEmpleado.get(fila.empleado) || 0) + fila.descuento);
    const clave = fila.fecha
      ? `${fila.fecha.getFullYear()}-${String(fila.fecha.getMonth() + 1).padStart(2, "0")}-${String(fila.fecha.getDate()).padStart(2, "0")}`
      : "Sin fecha";
    porDia.set(clave, (porDia.get(clave) || 0) + fila.descuento);
  });

  const reporte = await iniciarReporte(contexto, "Auditoría de descuentos");
  const dash = await reporte.dashboard({ subtitulo: "Descuentos aplicados en el periodo" });
  dash.tarjetas([
    tarjeta("Descuentos totales", totalDescuentos, "moneda"),
    tarjeta("Ventas con descuento", conDescuento.length, "cantidad", null, `de ${ventas.length} operaciones`),
    tarjeta("Peso sobre ventas", totalVentas > 0 ? totalDescuentos / totalVentas : 0, "porcentaje"),
    tarjeta("Descuento promedio", totalDescuentos / conDescuento.length, "moneda"),
  ]);

  dash.seccion("Distribución de los descuentos");
  dash.graficas([
    {
      tipo: "barra",
      titulo: "Descuentos por empleado",
      datos: [...porEmpleado.entries()]
        .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    },
    {
      tipo: "columna",
      titulo: "Descuentos por día",
      datos: [...porDia.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-31)
        .map(([clave, value]) => ({
          label: clave === "Sin fecha" ? clave : clave.slice(8) + "/" + clave.slice(5, 7),
          value: Number(value.toFixed(2)),
        })),
    },
  ]);
  dash.aviso("CajaLibre guarda el importe del descuento y la promoción aplicada. El motivo escrito "
    + "y el usuario que autoriza todavía no se registran, así que no aparecen en este reporte.");
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Descuentos",
    subtitulo: "Detalle por operación",
    columnas: [
      { header: "Folio", key: "folio", ancho: 16 },
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Hora", key: "hora", formato: "hora" },
      { header: "Cliente", key: "cliente", ancho: 26, vacio: "Público general" },
      { header: "Precio original", key: "precioOriginal", formato: "moneda", total: true },
      { header: "Descuento manual", key: "manual", formato: "moneda", total: true },
      { header: "Descuento promoción", key: "promocion", formato: "moneda", total: true },
      { header: "Descuento por puntos", key: "puntos", formato: "moneda", total: true },
      { header: "Descuento total", key: "descuento", formato: "moneda", total: true },
      { header: "Precio final", key: "precioFinal", formato: "moneda", total: true },
      { header: "Peso del descuento", key: "peso", formato: "porcentaje" },
      { header: "Promoción aplicada", key: "regla", ancho: 26, vacio: "" },
      { header: "Atendió", key: "empleado", ancho: 22 },
    ],
    filas,
  });

  return reporte.descargar(nombreArchivo(contexto, "Auditoria_Descuentos"));
}

// ===========================================================================
// 3. Reporte para factura global
// ===========================================================================

export async function reporteFacturaGlobal(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  if (!ventas.length) throw errorSinDatos();

  const indiceEmpleados = indexarEmpleados(contexto.datos.empleados);
  const metricas = calcularMetricas(ventas);
  const cobros = cobrosPorMetodo(ventas);
  const fiscal = contexto.fiscal || {};

  // La periodicidad se deduce del periodo pedido, no se pregunta: es lo que el
  // SAT espera declarar y ya esta determinado por las fechas elegidas.
  const dias = contexto.desde && contexto.hasta
    ? Math.round((contexto.hasta - contexto.desde) / 86400000) + 1
    : 0;
  const periodicidad = dias <= 1 ? "Diaria" : dias <= 7 ? "Semanal" : dias <= 16 ? "Quincenal" : dias <= 31 ? "Mensual" : "Personalizada";
  const referencia = contexto.hasta || contexto.desde || new Date();

  const reporte = await iniciarReporte(contexto, "Reporte para factura global");

  const dash = await reporte.dashboard({ subtitulo: "Preparación y conciliación" });
  dash.tarjetas([
    tarjeta("Operaciones", metricas.operaciones, "cantidad"),
    tarjeta("Subtotal", metricas.subtotal, "moneda"),
    tarjeta("Impuestos", metricas.impuestos, "moneda"),
    tarjeta("Total general", metricas.total, "moneda"),
  ]);

  dash.seccion("Datos del emisor y del periodo");
  dash.datos([
    { etiqueta: "Nombre comercial", valor: contexto.negocioNombre, formato: "texto" },
    { etiqueta: "Razón social", valor: fiscal.razonSocial, formato: "texto" },
    { etiqueta: "RFC", valor: fiscal.rfc, formato: "texto" },
    { etiqueta: "Régimen fiscal", valor: fiscal.regimenFiscal, formato: "texto" },
    { etiqueta: "Código postal", valor: fiscal.codigoPostal, formato: "texto" },
    { etiqueta: "RFC receptor público general", valor: fiscal.rfcPublicoGeneral, formato: "texto" },
    { etiqueta: "Periodicidad", valor: periodicidad, formato: "texto" },
    { etiqueta: "Mes", valor: referencia.toLocaleDateString("es-MX", { month: "long" }), formato: "texto" },
    { etiqueta: "Año", valor: referencia.getFullYear(), formato: "cantidad" },
    { etiqueta: "Fecha inicial", valor: contexto.desde, formato: "fecha" },
    { etiqueta: "Fecha final", valor: contexto.hasta, formato: "fecha" },
    { etiqueta: "Primer folio", valor: ventas[0]?.folioTicket || ventas[0]?.id, formato: "texto" },
    { etiqueta: "Último folio", valor: ventas.at(-1)?.folioTicket || ventas.at(-1)?.id, formato: "texto" },
    { etiqueta: "Forma de pago predeterminada", valor: fiscal.formaPago, formato: "texto" },
  ]);

  dash.seccion("Resumen de impuestos");
  dash.datos([
    { etiqueta: "Número de operaciones", valor: metricas.operaciones, formato: "cantidad" },
    { etiqueta: "Subtotal", valor: metricas.subtotal, formato: "moneda" },
    { etiqueta: "Descuentos", valor: metricas.descuentos, formato: "moneda" },
    { etiqueta: "IVA trasladado", valor: metricas.iva, formato: "moneda" },
    { etiqueta: "IEPS trasladado", valor: metricas.ieps, formato: "moneda" },
    { etiqueta: "Total general", valor: metricas.total, formato: "moneda" },
  ]);
  dash.aviso(AVISO_FACTURA_GLOBAL);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Operaciones",
    subtitulo: "Operaciones a incluir en la factura global",
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
      { header: "Cajero", key: "cajero", ancho: 22 },
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
        cajero: empleadoDeVenta(venta, indiceEmpleados),
        estado: estadoVenta(venta),
      };
    }),
    nota: AVISO_FACTURA_GLOBAL,
  });

  // Solo se listan los impuestos que el sistema efectivamente calculo. No se
  // agregan conceptos fiscales que CajaLibre no registra.
  await reporte.tabla({
    nombre: "Impuestos",
    subtitulo: "Impuestos trasladados en el periodo",
    columnas: [
      { header: "Impuesto", key: "impuesto", ancho: 24 },
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
    ].filter((fila) => fila.importe > 0 || fila.impuesto.includes("IVA")),
    nota: "Solo se incluyen los impuestos que CajaLibre calcula y guarda en cada venta. "
      + "Cualquier otro impuesto debe determinarse con tu contador.",
  });

  await reporte.tabla({
    nombre: "Formas de pago",
    subtitulo: "Cobros por forma de pago",
    columnas: [
      { header: "Forma de pago", key: "label", ancho: 24 },
      { header: "Importe", key: "value", formato: "moneda", total: true },
      { header: "Operaciones", key: "operaciones", formato: "cantidad", total: true },
      { header: "Participación", key: "participacion", formato: "porcentaje" },
    ],
    filas: cobros,
  });

  return reporte.descargar(nombreArchivo(contexto, "Reporte_Factura_Global"));
}

// ===========================================================================
// 18. Rentabilidad
// ===========================================================================

export async function rentabilidad(contexto) {
  const ventas = ventasDelPeriodo(contexto);
  if (!ventas.length) throw errorSinDatos();

  const indiceProductos = indexarProductos(contexto.datos.productos);
  const egresosPeriodo = filtrarPorFecha(contexto.datos.egresos, "fecha", contexto);
  const metricas = calcularMetricas(ventas, { indiceProductos, egresos: egresosPeriodo });
  const consolidado = consolidadoProductos(ventas, indiceProductos);
  const porMes = ventasPorMes(ventas);
  const porDia = ventasPorDia(ventas);
  const unidad = porMes.length > 1 ? porMes : porDia;

  const anteriores = ventasComparativas(contexto);
  const metricasAnteriores = anteriores.length
    ? calcularMetricas(anteriores, { indiceProductos })
    : null;

  // Costo y utilidad en la misma unidad de tiempo que las ventas, para poder
  // graficarlos uno junto al otro.
  const claveDe = (fecha) => (porMes.length > 1
    ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`
    : `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`);

  const costoPorUnidad = new Map();
  ventas.forEach((venta) => {
    const fecha = aFecha(venta?.fecha);
    if (!fecha) return;
    const clave = claveDe(fecha);
    // El costo se suma linea por linea en el mismo recorrido; pedir las
    // metricas completas de cada venta solo para leer su costo recorreria la
    // venta varias veces sin necesidad.
    const costo = (Array.isArray(venta?.productos) ? venta.productos : [])
      .reduce((suma, item) => {
        const unitario = costoUnitario(item, indiceProductos);
        return unitario === null ? suma : suma + unitario * (numero(item?.cantidad) || 1);
      }, 0);
    costoPorUnidad.set(clave, (costoPorUnidad.get(clave) || 0) + costo);
  });

  const reporte = await iniciarReporte(contexto, "Reporte de rentabilidad");
  const dash = await reporte.dashboard({ subtitulo: "Qué queda después de costos y gastos" });

  dash.tarjetas([
    tarjeta("Ventas", metricas.total, "moneda", metricasAnteriores?.total ?? null),
    tarjeta("Costo de mercancía", metricas.costo, "moneda", metricasAnteriores?.costo ?? null),
    tarjeta("Utilidad bruta", metricas.utilidadBruta, "moneda", metricasAnteriores?.utilidadBruta ?? null),
    tarjeta("Margen bruto", metricas.margen, "porcentaje"),
    tarjeta("Egresos", metricas.egresos, "moneda"),
    tarjeta("Resultado estimado", metricas.resultado, "moneda"),
    tarjeta("Descuentos otorgados", metricas.descuentos, "moneda"),
    tarjeta("Ticket promedio", metricas.ticketPromedio, "moneda", metricasAnteriores?.ticketPromedio ?? null),
  ]);

  dash.seccion("Cómo se forma el resultado", "Ventas menos costo de productos, menos egresos");
  dash.datos([
    { etiqueta: "Ventas del periodo", valor: metricas.total, formato: "moneda" },
    { etiqueta: "( − ) Costo de los productos vendidos", valor: metricas.costo, formato: "moneda" },
    { etiqueta: "( = ) Utilidad bruta", valor: metricas.utilidadBruta, formato: "moneda" },
    { etiqueta: "( − ) Egresos del periodo", valor: metricas.egresos, formato: "moneda" },
    { etiqueta: "( = ) Resultado estimado", valor: metricas.resultado, formato: "moneda" },
    { etiqueta: "Margen sobre ventas", valor: metricas.margen, formato: "porcentaje" },
  ], { columnas: 1 });

  dash.seccion("Evolución");
  dash.graficas([
    {
      tipo: "columna",
      titulo: "Ventas vs costos",
      datos: unidad.slice(-12).map((punto) => ({ label: punto.label })),
      series: [
        { nombre: "Ventas", valores: unidad.slice(-12).map((punto) => punto.value) },
        {
          nombre: "Costo",
          valores: unidad.slice(-12).map((punto) => Number((costoPorUnidad.get(punto.clave) || 0).toFixed(2))),
        },
      ],
    },
    {
      tipo: "linea",
      titulo: "Utilidad por periodo",
      datos: unidad.slice(-12).map((punto) => ({
        label: punto.label,
        value: Number((punto.value - (costoPorUnidad.get(punto.clave) || 0)).toFixed(2)),
      })),
    },
  ]);

  dash.seccion("Dónde está el margen");
  dash.graficas([
    {
      tipo: "barra",
      titulo: "Productos con mayor utilidad",
      datos: consolidado
        .filter((item) => item.utilidad > 0)
        .slice()
        .sort((a, b) => b.utilidad - a.utilidad)
        .slice(0, 10)
        .map((item) => ({ label: item.nombre, value: item.utilidad })),
    },
    {
      tipo: "columna",
      titulo: "Utilidad por categoría",
      datos: recortarParaGrafica(
        ventasPorCategoria(consolidado)
          .map((item) => ({ label: item.label, value: item.utilidad }))
          .sort((a, b) => b.value - a.value),
        8,
      ),
    },
  ]);

  if (metricas.costoParcial) dash.aviso(AVISO_COSTO_PARCIAL);
  dash.aviso(AVISO_ESTIMACION);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Rentabilidad",
    subtitulo: "Utilidad estimada por producto",
    columnas: [
      { header: "Producto", key: "nombre", ancho: 38 },
      { header: "Categoría", key: "categoria", ancho: 20 },
      { header: "Unidades", key: "unidades", formato: "decimal", total: true },
      { header: "Ingreso", key: "ingreso", formato: "moneda", total: true },
      { header: "Costo", key: "costo", formato: "moneda", total: true },
      { header: "Utilidad", key: "utilidad", formato: "moneda", total: true },
      { header: "Margen", key: "margen", formato: "porcentaje" },
      { header: "Costo registrado", key: "costoRegistrado", ancho: 16 },
    ],
    filas: consolidado.map((item) => ({
      ...item,
      costoRegistrado: item.costoConocido ? "Completo" : "Parcial",
    })),
    nota: metricas.costoParcial ? AVISO_COSTO_PARCIAL : AVISO_ESTIMACION,
  });

  await reporte.tabla({
    nombre: "Egresos",
    subtitulo: "Egresos considerados en el resultado",
    columnas: [
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Concepto", key: "descripcion", ancho: 40, vacio: "Sin concepto" },
      { header: "Tipo", key: "tipo", ancho: 18 },
      { header: "Responsable", key: "usuario", ancho: 22, vacio: "" },
      { header: "Importe", key: "monto", formato: "moneda", total: true },
    ],
    filas: egresosPeriodo,
    nota: egresosPeriodo.length ? "" : "No se registraron egresos en el periodo.",
  });

  return reporte.descargar(nombreArchivo(contexto, "Rentabilidad"));
}

export { FORMATO };
