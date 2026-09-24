// ---------------------------------------------------------------------------
// Reportes de catalogo y operacion: productos, inventario, clientes, credito,
// egresos, empleados, caja y restaurante.
//
// Los reportes Free de este grupo entregan informacion que es del negocio
// (su catalogo, sus existencias, sus clientes, sus deudores). Nunca se
// bloquean: lo que Premium agrega es el analisis sobre ellos -- costo, valor,
// rotacion, comportamiento y comparativas.
// ---------------------------------------------------------------------------

import { aFecha, errorSinDatos, numero, textoSeguro } from "./excel_kit.js";
import {
  calcularMetricas,
  consolidadoProductos,
  estadoInventarioProducto,
  filtrarPorFecha,
  indexarEmpleados,
  indexarProductos,
  normalizarOrdenes,
  platillosVendidos,
  resumenFiados,
  resumenInventario,
  ventasPorCategoria,
  ventasPorEmpleado,
} from "./datos_reportes.js";
import {
  AVISO_COSTO_PARCIAL,
  horaTexto,
  iniciarReporte,
  nombreArchivo,
  recortarParaGrafica,
  tarjeta,
} from "./generadores_comun.js";

// ===========================================================================
// 5. Productos
// ===========================================================================

export async function catalogoProductos(contexto) {
  const productos = contexto.datos.productos;
  if (!productos.length) throw errorSinDatos("Todavía no hay productos registrados.");

  const resumen = resumenInventario(productos);
  const reporte = await iniciarReporte(contexto, "Catálogo de productos");
  const dash = await reporte.dashboard({ subtitulo: "Tu catálogo en este momento" });

  dash.tarjetas([
    tarjeta("Productos", resumen.productos, "cantidad"),
    tarjeta("Productos activos", resumen.activos, "cantidad"),
    tarjeta("Unidades en existencia", resumen.unidades, "decimal"),
    tarjeta("Productos agotados", resumen.agotados, "cantidad"),
  ]);

  dash.seccion("Distribución por categoría");
  const porCategoria = new Map();
  productos.forEach((producto) => {
    const categoria = textoSeguro(producto?.categoria, "Sin categoría");
    porCategoria.set(categoria, (porCategoria.get(categoria) || 0) + 1);
  });
  dash.graficas([{
    tipo: "columna",
    titulo: "Productos por categoría",
    datos: recortarParaGrafica(
      [...porCategoria.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      10,
    ),
    formatoValor: "#,##0",
  }]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Catalogo",
    subtitulo: "Productos registrados",
    columnas: [
      { header: "Código", key: "codigo", ancho: 18, vacio: "Sin código" },
      { header: "Nombre", key: "nombre", ancho: 38 },
      { header: "Categoría", key: "categoria", ancho: 22, vacio: "Sin categoría" },
      { header: "Unidad", key: "unidadMedida", ancho: 12, vacio: "Pza" },
      { header: "Precio", key: "precioVenta", formato: "moneda" },
      { header: "Existencia", key: "stock", formato: "decimal", total: true },
      { header: "Estado", key: "estado", ancho: 16 },
    ],
    filas: productos
      .map((producto) => ({ ...producto, estado: estadoInventarioProducto(producto) }))
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")),
  });

  return reporte.descargar(nombreArchivo(contexto, "Catalogo_Productos"));
}

export async function analisisProductos(contexto) {
  const productos = contexto.datos.productos;
  if (!productos.length) throw errorSinDatos("Todavía no hay productos registrados.");

  const indiceProductos = indexarProductos(productos);
  const ventas = filtrarPorFecha(contexto.datos.ventas, "fecha", contexto);
  const consolidado = consolidadoProductos(ventas, indiceProductos);
  const vendidoPorClave = new Map();
  consolidado.forEach((item) => {
    [item.clave, String(item.codigo || "").toLowerCase(), item.nombre.toLowerCase()]
      .filter(Boolean)
      .forEach((clave) => {
        if (!vendidoPorClave.has(clave)) vendidoPorClave.set(clave, item);
      });
  });

  // Dias del periodo: la rotacion se expresa en unidades vendidas por dia,
  // que es comparable entre periodos de distinta duracion.
  const dias = contexto.desde && contexto.hasta
    ? Math.max(1, Math.round((contexto.hasta - contexto.desde) / 86400000) + 1)
    : 1;

  const filas = productos.map((producto) => {
    const vendido = vendidoPorClave.get(String(producto.id || "").trim())
      || vendidoPorClave.get(String(producto.codigo || "").trim().toLowerCase())
      || vendidoPorClave.get(String(producto.nombre || "").trim().toLowerCase())
      || null;

    const costo = numero(producto?.precioCompra ?? producto?.ultimoCosto);
    const precio = numero(producto?.precioVenta);
    const stock = numero(producto?.stock);
    const unidades = vendido?.unidades || 0;

    return {
      codigo: textoSeguro(producto?.codigo, "Sin código"),
      nombre: textoSeguro(producto?.nombre, "Sin nombre"),
      categoria: textoSeguro(producto?.categoria, "Sin categoría"),
      costo,
      precio,
      margenUnitario: precio > 0 ? (precio - costo) / precio : 0,
      stock,
      stockMinimo: numero(producto?.stockMinimo),
      stockMaximo: numero(producto?.stockMaximo),
      unidades,
      ingreso: vendido?.ingreso || 0,
      utilidad: vendido?.utilidad || 0,
      ultimaVenta: vendido?.ultimaVenta || null,
      rotacion: Number((unidades / dias).toFixed(3)),
      valorInventario: Number((costo * stock).toFixed(2)),
      estado: estadoInventarioProducto(producto),
    };
  });

  const conMovimiento = filas.filter((fila) => fila.unidades > 0);
  const sinMovimiento = filas.filter((fila) => fila.unidades === 0);
  const masVendido = conMovimiento.slice().sort((a, b) => b.unidades - a.unidades)[0] || null;
  const metricas = calcularMetricas(ventas, { indiceProductos });

  const reporte = await iniciarReporte(contexto, "Análisis de productos");
  const dash = await reporte.dashboard({ subtitulo: "Qué se mueve y qué deja utilidad" });

  dash.tarjetas([
    tarjeta("Productos activos", filas.filter((fila) => fila.estado !== "Inactivo").length, "cantidad"),
    tarjeta("Productos vendidos", conMovimiento.length, "cantidad", null, `de ${filas.length} en catálogo`),
    tarjeta("Sin movimiento", sinMovimiento.length, "cantidad", null, "En el periodo elegido"),
    tarjeta("Producto más vendido", masVendido?.nombre || "N/A", "texto", null,
      masVendido ? `${masVendido.unidades.toLocaleString("es-MX")} unidades` : ""),
    tarjeta("Importe vendido", metricas.total, "moneda"),
    tarjeta("Utilidad estimada", metricas.utilidadBruta, "moneda"),
    tarjeta("Margen bruto", metricas.margen, "porcentaje"),
    tarjeta("Valor del inventario", resumenInventario(productos).valorCosto, "moneda", null, "A costo de compra"),
  ]);

  dash.seccion("Dónde está el movimiento");
  dash.graficas([
    {
      tipo: "barra",
      titulo: "Top 10 productos por importe",
      datos: conMovimiento.slice(0, 10).map((fila) => ({ label: fila.nombre, value: fila.ingreso })),
    },
    {
      tipo: "columna",
      titulo: "Ventas por categoría",
      datos: recortarParaGrafica(ventasPorCategoria(consolidado), 8),
    },
  ]);

  dash.seccion("Utilidad y productos detenidos");
  dash.graficas([
    {
      tipo: "barra",
      titulo: "Productos con mayor utilidad",
      datos: conMovimiento
        .slice()
        .sort((a, b) => b.utilidad - a.utilidad)
        .slice(0, 10)
        .map((fila) => ({ label: fila.nombre, value: fila.utilidad })),
    },
    {
      tipo: "barra",
      titulo: "Sin movimiento con mayor inventario",
      datos: sinMovimiento
        .slice()
        .sort((a, b) => b.valorInventario - a.valorInventario)
        .slice(0, 10)
        .map((fila) => ({ label: fila.nombre, value: fila.valorInventario })),
    },
  ]);

  if (metricas.costoParcial) dash.aviso(AVISO_COSTO_PARCIAL);
  dash.cerrar({});

  const columnas = [
    { header: "Código", key: "codigo", ancho: 18 },
    { header: "Producto", key: "nombre", ancho: 38 },
    { header: "Categoría", key: "categoria", ancho: 20 },
    { header: "Costo", key: "costo", formato: "moneda" },
    { header: "Precio", key: "precio", formato: "moneda" },
    { header: "Margen unitario", key: "margenUnitario", formato: "porcentaje" },
    { header: "Existencia", key: "stock", formato: "decimal", total: true },
    { header: "Stock mínimo", key: "stockMinimo", formato: "decimal" },
    { header: "Stock máximo", key: "stockMaximo", formato: "decimal" },
    { header: "Unidades vendidas", key: "unidades", formato: "decimal", total: true },
    { header: "Ingreso generado", key: "ingreso", formato: "moneda", total: true },
    { header: "Utilidad estimada", key: "utilidad", formato: "moneda", total: true },
    { header: "Rotación (u./día)", key: "rotacion", formato: "decimal" },
    { header: "Valor de inventario", key: "valorInventario", formato: "moneda", total: true },
    { header: "Última venta", key: "ultimaVenta", formato: "fecha" },
    { header: "Estado", key: "estado", ancho: 16 },
  ];

  await reporte.tabla({
    nombre: "Analisis",
    subtitulo: "Todos los productos del catálogo",
    columnas,
    filas: filas.slice().sort((a, b) => b.ingreso - a.ingreso),
    nota: metricas.costoParcial ? AVISO_COSTO_PARCIAL : "",
  });

  if (sinMovimiento.length) {
    await reporte.tabla({
      nombre: "Sin movimiento",
      subtitulo: "Productos que no se vendieron en el periodo",
      columnas: columnas.filter((columna) => !["unidades", "ingreso", "utilidad", "rotacion", "ultimaVenta"].includes(columna.key)),
      filas: sinMovimiento.slice().sort((a, b) => b.valorInventario - a.valorInventario),
    });
  }

  return reporte.descargar(nombreArchivo(contexto, "Analisis_Productos"));
}

// ===========================================================================
// 6 y 7. Inventario
// ===========================================================================

export async function inventarioActual(contexto) {
  const productos = contexto.datos.productos;
  if (!productos.length) throw errorSinDatos("Todavía no hay productos registrados.");

  const resumen = resumenInventario(productos);
  const porCategoria = new Map();
  productos.forEach((producto) => {
    const categoria = textoSeguro(producto?.categoria, "Sin categoría");
    porCategoria.set(categoria, (porCategoria.get(categoria) || 0) + numero(producto?.stock));
  });

  const reporte = await iniciarReporte(contexto, "Inventario actual");
  const dash = await reporte.dashboard({ subtitulo: "Existencias al momento de generar el reporte" });

  dash.tarjetas([
    tarjeta("Productos", resumen.productos, "cantidad"),
    tarjeta("Unidades", resumen.unidades, "decimal"),
    tarjeta("Con stock bajo", resumen.stockBajo, "cantidad"),
    tarjeta("Agotados", resumen.agotados, "cantidad"),
  ]);

  dash.seccion("Existencias por categoría");
  dash.graficas([{
    tipo: "columna",
    titulo: "Existencias por categoría",
    datos: recortarParaGrafica(
      [...porCategoria.entries()]
        .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
        .sort((a, b) => b.value - a.value),
      10,
    ),
    formatoValor: "#,##0.##",
  }]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Inventario",
    subtitulo: "Existencias actuales",
    columnas: [
      { header: "Código", key: "codigo", ancho: 18, vacio: "Sin código" },
      { header: "Producto", key: "nombre", ancho: 38 },
      { header: "Categoría", key: "categoria", ancho: 22, vacio: "Sin categoría" },
      { header: "Existencia", key: "stock", formato: "decimal", total: true },
      { header: "Precio", key: "precioVenta", formato: "moneda" },
      { header: "Estado", key: "estado", ancho: 16 },
    ],
    filas: productos
      .map((producto) => ({ ...producto, estado: estadoInventarioProducto(producto) }))
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")),
  });

  return reporte.descargar(nombreArchivo(contexto, "Inventario"));
}

export async function stockBajo(contexto) {
  const productos = contexto.datos.productos;
  // Se incluye lo agotado y lo que llego a su minimo: las dos cosas son lo que
  // hay que resurtir.
  const criticos = productos.filter((producto) => {
    if (producto?.activo === false) return false;
    const stock = numero(producto?.stock);
    const minimo = numero(producto?.stockMinimo);
    return stock <= 0 || (minimo > 0 && stock <= minimo);
  });

  if (!criticos.length) {
    throw errorSinDatos("Ningún producto está agotado ni por debajo de su stock mínimo. "
      + "Recuerda que la alerta necesita que el producto tenga un stock mínimo capturado.");
  }

  const filas = criticos.map((producto) => {
    const stock = numero(producto?.stock);
    const minimo = numero(producto?.stockMinimo);
    const maximo = numero(producto?.stockMaximo);
    // Sugerencia de compra: llevar la existencia al maximo si esta definido,
    // y si no, al menos al minimo.
    const objetivo = maximo > 0 ? maximo : minimo;
    return {
      codigo: textoSeguro(producto?.codigo, "Sin código"),
      nombre: textoSeguro(producto?.nombre, "Sin nombre"),
      categoria: textoSeguro(producto?.categoria, "Sin categoría"),
      stock,
      stockMinimo: minimo,
      sugerido: Math.max(0, Number((objetivo - stock).toFixed(2))),
      costo: numero(producto?.precioCompra ?? producto?.ultimoCosto),
      inversion: Number((Math.max(0, objetivo - stock) * numero(producto?.precioCompra ?? producto?.ultimoCosto)).toFixed(2)),
      proveedor: textoSeguro(producto?.proveedorPrincipal, ""),
      estado: estadoInventarioProducto(producto),
    };
  }).sort((a, b) => a.stock - b.stock);

  const reporte = await iniciarReporte(contexto, "Productos con stock bajo");
  const dash = await reporte.dashboard({ subtitulo: "Lo que conviene resurtir" });

  dash.tarjetas([
    tarjeta("Productos por resurtir", filas.length, "cantidad"),
    tarjeta("Agotados", filas.filter((fila) => fila.stock <= 0).length, "cantidad"),
    tarjeta("Unidades sugeridas", filas.reduce((suma, fila) => suma + fila.sugerido, 0), "decimal"),
    tarjeta("Inversión estimada", filas.reduce((suma, fila) => suma + fila.inversion, 0), "moneda"),
  ]);
  dash.seccion("Los más urgentes");
  dash.graficas([{
    tipo: "barra",
    titulo: "Unidades sugeridas de compra",
    datos: filas.slice(0, 12).map((fila) => ({ label: fila.nombre, value: fila.sugerido })),
    formatoValor: "#,##0.##",
  }]);
  dash.aviso("La sugerencia de compra lleva cada producto a su stock máximo; cuando no está "
    + "capturado, lo lleva a su stock mínimo.");
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Stock bajo",
    subtitulo: "Productos agotados o en su mínimo",
    columnas: [
      { header: "Código", key: "codigo", ancho: 18 },
      { header: "Producto", key: "nombre", ancho: 38 },
      { header: "Categoría", key: "categoria", ancho: 20 },
      { header: "Existencia", key: "stock", formato: "decimal" },
      { header: "Stock mínimo", key: "stockMinimo", formato: "decimal" },
      { header: "Compra sugerida", key: "sugerido", formato: "decimal", total: true },
      { header: "Costo unitario", key: "costo", formato: "moneda" },
      { header: "Inversión estimada", key: "inversion", formato: "moneda", total: true },
      { header: "Proveedor", key: "proveedor", ancho: 24, vacio: "" },
      { header: "Estado", key: "estado", ancho: 14 },
    ],
    filas,
  });

  return reporte.descargar(nombreArchivo(contexto, "Stock_Bajo"));
}

export async function inventarioCompleto(contexto) {
  const productos = contexto.datos.productos;
  if (!productos.length) throw errorSinDatos("Todavía no hay productos registrados.");

  const resumen = resumenInventario(productos);
  const filas = productos.map((producto) => {
    const costo = numero(producto?.precioCompra ?? producto?.ultimoCosto);
    const precio = numero(producto?.precioVenta);
    const stock = numero(producto?.stock);
    return {
      codigo: textoSeguro(producto?.codigo, "Sin código"),
      nombre: textoSeguro(producto?.nombre, "Sin nombre"),
      categoria: textoSeguro(producto?.categoria, "Sin categoría"),
      unidadMedida: textoSeguro(producto?.unidadMedida, "Pza"),
      proveedor: textoSeguro(producto?.proveedorPrincipal, ""),
      ubicacion: textoSeguro(producto?.ubicacion, ""),
      costo,
      precio,
      stock,
      stockMinimo: numero(producto?.stockMinimo),
      stockMaximo: numero(producto?.stockMaximo),
      valorCosto: Number((costo * stock).toFixed(2)),
      valorVenta: Number((precio * stock).toFixed(2)),
      utilidadPotencial: Number(((precio - costo) * stock).toFixed(2)),
      margen: precio > 0 ? (precio - costo) / precio : 0,
      estado: estadoInventarioProducto(producto),
    };
  });

  const porCategoria = new Map();
  filas.forEach((fila) => {
    porCategoria.set(fila.categoria, (porCategoria.get(fila.categoria) || 0) + fila.valorCosto);
  });

  const reporte = await iniciarReporte(contexto, "Inventario completo");
  const dash = await reporte.dashboard({ subtitulo: "Existencias valuadas" });

  dash.tarjetas([
    tarjeta("Valor a costo", resumen.valorCosto, "moneda"),
    tarjeta("Valor a precio de venta", resumen.valorVenta, "moneda"),
    tarjeta("Utilidad potencial", resumen.utilidadPotencial, "moneda"),
    tarjeta("Unidades", resumen.unidades, "decimal"),
    tarjeta("Productos", resumen.productos, "cantidad"),
    tarjeta("Agotados", resumen.agotados, "cantidad"),
    tarjeta("Stock bajo", resumen.stockBajo, "cantidad"),
    tarjeta("Sobrestock", resumen.sobrestock, "cantidad", null, "Por encima del stock máximo"),
  ]);

  dash.seccion("Dónde está el dinero del inventario");
  dash.graficas([
    {
      tipo: "columna",
      titulo: "Valor del inventario por categoría",
      datos: recortarParaGrafica(
        [...porCategoria.entries()]
          .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
          .sort((a, b) => b.value - a.value),
        10,
      ),
    },
    {
      tipo: "barra",
      titulo: "Productos con mayor valor en inventario",
      datos: filas.slice().sort((a, b) => b.valorCosto - a.valorCosto).slice(0, 10)
        .map((fila) => ({ label: fila.nombre, value: fila.valorCosto })),
    },
  ]);
  dash.aviso("El valor del inventario se calcula con el precio de compra registrado en cada "
    + "producto. Los productos sin costo capturado aportan cero a ese valor.");
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Inventario",
    subtitulo: "Existencias valuadas a costo y a venta",
    columnas: [
      { header: "Código", key: "codigo", ancho: 18 },
      { header: "Producto", key: "nombre", ancho: 38 },
      { header: "Categoría", key: "categoria", ancho: 20 },
      { header: "Unidad", key: "unidadMedida", ancho: 11 },
      { header: "Costo", key: "costo", formato: "moneda" },
      { header: "Precio", key: "precio", formato: "moneda" },
      { header: "Margen", key: "margen", formato: "porcentaje" },
      { header: "Existencia", key: "stock", formato: "decimal", total: true },
      { header: "Stock mínimo", key: "stockMinimo", formato: "decimal" },
      { header: "Stock máximo", key: "stockMaximo", formato: "decimal" },
      { header: "Valor a costo", key: "valorCosto", formato: "moneda", total: true },
      { header: "Valor a venta", key: "valorVenta", formato: "moneda", total: true },
      { header: "Utilidad potencial", key: "utilidadPotencial", formato: "moneda", total: true },
      { header: "Proveedor", key: "proveedor", ancho: 22, vacio: "" },
      { header: "Ubicación", key: "ubicacion", ancho: 18, vacio: "" },
      { header: "Estado", key: "estado", ancho: 15 },
    ],
    filas: filas.slice().sort((a, b) => b.valorCosto - a.valorCosto),
  });

  return reporte.descargar(nombreArchivo(contexto, "Inventario_Completo"));
}

// ===========================================================================
// 8. Corte de caja
// ===========================================================================

/** Cortes del periodo, del mas reciente al mas antiguo. */
function cortesOrdenados(cortes = []) {
  return cortes
    .slice()
    .sort((a, b) => String(b.fechaKey || "").localeCompare(String(a.fechaKey || "")));
}

function fechaDeCorte(corte) {
  const clave = String(corte?.fechaKey || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(clave)) return new Date(`${clave}T12:00:00`);
  return aFecha(corte?.cerradoEn || corte?.aperturaEn);
}

function filaCorteResumen(corte) {
  const resumen = corte?.resumen || {};
  return {
    fecha: fechaDeCorte(corte),
    cajero: textoSeguro(corte?.cajero?.nombre || corte?.cajero?.email, "Sin asignar"),
    cerrado: corte?.cerrado === true ? "Cerrado" : "Abierto",
    tickets: numero(resumen?.tickets),
    ventas: numero(resumen?.total),
    efectivo: numero(resumen?.efectivo),
    tarjeta: numero(resumen?.tarjeta),
    transferencia: numero(resumen?.transferencia),
    otros: numero(resumen?.otros),
  };
}

export async function corteCajaBasico(contexto) {
  const cortes = cortesOrdenados(contexto.datos.cortes).filter((corte) => corte?.cerrado === true);
  if (!cortes.length) throw errorSinDatos("Todavía no hay cortes de caja cerrados.");

  // El plan gratuito ya solo conserva los cortes recientes en el sistema; el
  // reporte respeta ese mismo alcance en lugar de abrir una puerta lateral.
  const limite = numero(contexto.limiteCortesFree) || cortes.length;
  const visibles = contexto.esPremium ? cortes : cortes.slice(0, limite);
  const ultimo = visibles[0];
  const resumen = ultimo?.resumen || {};

  const reporte = await iniciarReporte(contexto, "Corte de caja");
  const dash = await reporte.dashboard({ subtitulo: `Corte del ${fechaDeCorte(ultimo)?.toLocaleDateString("es-MX") || "día"}` });

  dash.tarjetas([
    tarjeta("Ventas del corte", numero(resumen?.total), "moneda"),
    tarjeta("Operaciones", numero(resumen?.tickets), "cantidad"),
    tarjeta("Efectivo esperado", numero(ultimo?.cajaFinalEsperada), "moneda"),
    tarjeta("Cajero", textoSeguro(ultimo?.cajero?.nombre, "Sin asignar"), "texto"),
  ]);

  dash.seccion("Cobros del corte");
  dash.datos([
    { etiqueta: "Fecha del corte", valor: fechaDeCorte(ultimo), formato: "fecha" },
    { etiqueta: "Cerrado a las", valor: aFecha(ultimo?.cerradoEn), formato: "hora" },
    { etiqueta: "Efectivo", valor: numero(resumen?.efectivo), formato: "moneda" },
    { etiqueta: "Tarjeta", valor: numero(resumen?.tarjeta), formato: "moneda" },
    { etiqueta: "Transferencia", valor: numero(resumen?.transferencia), formato: "moneda" },
    { etiqueta: "Otros medios", valor: numero(resumen?.otros), formato: "moneda" },
  ]);
  dash.aviso("El arqueo detallado (denominaciones, efectivo contado y diferencia) y el historial "
    + "completo de cortes están disponibles con CajaLibre Premium.");
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Cortes",
    subtitulo: contexto.esPremium ? "Cortes cerrados" : `Últimos ${visibles.length} corte(s)`,
    columnas: [
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Usuario", key: "cajero", ancho: 24 },
      { header: "Operaciones", key: "tickets", formato: "cantidad", total: true },
      { header: "Ventas", key: "ventas", formato: "moneda", total: true },
      { header: "Efectivo", key: "efectivo", formato: "moneda", total: true },
      { header: "Tarjeta", key: "tarjeta", formato: "moneda", total: true },
      { header: "Transferencia", key: "transferencia", formato: "moneda", total: true },
    ],
    filas: visibles.map(filaCorteResumen),
  });

  return reporte.descargar(nombreArchivo(contexto, "Corte_Caja"));
}

export async function corteCajaCompleto(contexto) {
  const cortes = cortesOrdenados(contexto.datos.cortes).filter((corte) => corte?.cerrado === true);
  if (!cortes.length) throw errorSinDatos("Todavía no hay cortes de caja cerrados.");

  const ultimo = cortes[0];
  const resumen = ultimo?.resumen || {};
  const conteo = ultimo?.conteoEfectivo || {};
  const salidas = Array.isArray(ultimo?.retiros) ? ultimo.retiros : [];

  const reporte = await iniciarReporte(contexto, "Corte de caja completo");
  const dash = await reporte.dashboard({ subtitulo: `Corte del ${fechaDeCorte(ultimo)?.toLocaleDateString("es-MX") || "día"}` });

  dash.tarjetas([
    tarjeta("Ventas del corte", numero(resumen?.total), "moneda"),
    tarjeta("Operaciones", numero(resumen?.tickets), "cantidad"),
    tarjeta("Efectivo esperado", numero(ultimo?.cajaFinalEsperada), "moneda"),
    tarjeta("Efectivo contado", conteo?.contado === null || conteo?.contado === undefined ? "Sin arqueo" : numero(conteo.contado),
      conteo?.contado === null || conteo?.contado === undefined ? "texto" : "moneda"),
    tarjeta("Diferencia", conteo?.diferencia === null || conteo?.diferencia === undefined ? "Sin arqueo" : numero(conteo.diferencia),
      conteo?.diferencia === null || conteo?.diferencia === undefined ? "texto" : "moneda"),
    tarjeta("Fondo inicial", numero(ultimo?.fondoInicialCaja), "moneda"),
    tarjeta("Salidas de caja", numero(ultimo?.totalRetiros), "moneda", null, `${salidas.length} movimiento(s)`),
    tarjeta("Descuentos", numero(resumen?.descuentos), "moneda"),
  ]);

  dash.seccion("Detalle del corte");
  dash.datos([
    { etiqueta: "Fecha del corte", valor: fechaDeCorte(ultimo), formato: "fecha" },
    { etiqueta: "Apertura", valor: aFecha(ultimo?.aperturaEn), formato: "hora" },
    { etiqueta: "Cierre", valor: aFecha(ultimo?.cerradoEn), formato: "hora" },
    { etiqueta: "Usuario que cerró", valor: ultimo?.cajero?.nombre || ultimo?.cajero?.email, formato: "texto" },
    { etiqueta: "Fondo inicial de caja", valor: numero(ultimo?.fondoInicialCaja), formato: "moneda" },
    { etiqueta: "Ventas del día", valor: numero(resumen?.total), formato: "moneda" },
    { etiqueta: "Subtotal", valor: numero(resumen?.subtotal), formato: "moneda" },
    { etiqueta: "IVA", valor: numero(resumen?.iva), formato: "moneda" },
    { etiqueta: "Cobrado en efectivo", valor: numero(resumen?.efectivo), formato: "moneda" },
    { etiqueta: "Cobrado con tarjeta", valor: numero(resumen?.tarjeta), formato: "moneda" },
    { etiqueta: "Cobrado por transferencia", valor: numero(resumen?.transferencia), formato: "moneda" },
    { etiqueta: "Otros medios", valor: numero(resumen?.otros), formato: "moneda" },
    { etiqueta: "Ventas a crédito", valor: numero(resumen?.ventasFiadas), formato: "moneda" },
    { etiqueta: "Descuentos otorgados", valor: numero(resumen?.descuentos), formato: "moneda" },
    { etiqueta: "Unidades vendidas", valor: numero(resumen?.unidades), formato: "decimal" },
    { etiqueta: "Salidas de caja", valor: numero(ultimo?.totalRetiros), formato: "moneda" },
    { etiqueta: "Efectivo esperado en caja", valor: numero(ultimo?.cajaFinalEsperada), formato: "moneda" },
    { etiqueta: "Arqueo realizado", valor: ultimo?.arqueoRealizado === true ? "Sí" : "No", formato: "texto" },
    { etiqueta: "Observaciones del corte", valor: ultimo?.notasCorte, formato: "texto", vacio: "Sin observaciones" },
  ]);

  if (ultimo?.arqueoRealizado) {
    dash.seccion("Arqueo");
    dash.datos([
      { etiqueta: "Efectivo esperado", valor: numero(conteo?.esperado), formato: "moneda" },
      { etiqueta: "Efectivo contado", valor: numero(conteo?.contado), formato: "moneda" },
      { etiqueta: "Diferencia", valor: numero(conteo?.diferencia), formato: "moneda" },
      { etiqueta: "Descuadre reconocido", valor: ultimo?.descuadreReconocido === true ? "Sí" : "No", formato: "texto" },
    ]);
  }

  // Ni las propinas ni las cancelaciones o devoluciones de venta existen en el
  // corte porque el sistema no las registra; se dice en lugar de mostrar cero.
  dash.aviso("CajaLibre no registra cancelaciones ni devoluciones de ventas ya cobradas, así que "
    + "el corte no incluye esos conceptos. Las propinas solo existen en el modo restaurante.");
  dash.cerrar({});

  if (Array.isArray(ultimo?.denominaciones) && ultimo.denominaciones.length) {
    await reporte.tabla({
      nombre: "Denominaciones",
      subtitulo: "Conteo de efectivo del arqueo",
      columnas: [
        { header: "Denominación", key: "valor", formato: "moneda" },
        { header: "Cantidad", key: "cantidad", formato: "cantidad", total: true },
        { header: "Importe", key: "importe", formato: "moneda", total: true },
      ],
      filas: ultimo.denominaciones.map((item) => ({
        valor: numero(item?.valor),
        cantidad: numero(item?.cantidad),
        importe: Number((numero(item?.valor) * numero(item?.cantidad)).toFixed(2)),
      })),
    });
  }

  if (salidas.length) {
    await reporte.tabla({
      nombre: "Salidas",
      subtitulo: "Egresos y retiros considerados en el corte",
      columnas: [
        { header: "Tipo", key: "tipo", ancho: 18 },
        { header: "Motivo", key: "motivo", ancho: 40, vacio: "Sin motivo" },
        { header: "Responsable", key: "usuario", ancho: 24, vacio: "" },
        { header: "Origen", key: "origen", ancho: 18 },
        { header: "Importe", key: "monto", formato: "moneda", total: true },
      ],
      filas: salidas.map((salida) => ({
        tipo: textoSeguro(salida?.tipo, "egreso"),
        motivo: textoSeguro(salida?.motivo, ""),
        usuario: textoSeguro(salida?.usuario, ""),
        origen: salida?.origen === "arqueo" ? "Retiro en arqueo" : "Egreso diario",
        monto: numero(salida?.monto),
      })),
    });
  }

  await reporte.tabla({
    nombre: "Cortes",
    subtitulo: "Todos los cortes cerrados",
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

  return reporte.descargar(nombreArchivo(contexto, "Corte_Caja_Completo"));
}

export async function historialCortes(contexto) {
  const todos = cortesOrdenados(contexto.datos.cortes).filter((corte) => corte?.cerrado === true);
  const cortes = todos.filter((corte) => {
    const fecha = fechaDeCorte(corte);
    if (!fecha) return false;
    if (contexto.desde && fecha < contexto.desde) return false;
    if (contexto.hasta && fecha > contexto.hasta) return false;
    return true;
  });

  if (!cortes.length) throw errorSinDatos("No hay cortes de caja cerrados en el periodo seleccionado.");

  const filas = cortes.map((corte) => {
    const resumen = corte?.resumen || {};
    const conteo = corte?.conteoEfectivo || {};
    const tieneArqueo = corte?.arqueoRealizado === true
      && conteo?.contado !== null && conteo?.contado !== undefined;
    return {
      ...filaCorteResumen(corte),
      fondoInicial: numero(corte?.fondoInicialCaja),
      salidas: numero(corte?.totalRetiros),
      esperado: numero(corte?.cajaFinalEsperada),
      contado: tieneArqueo ? numero(conteo.contado) : null,
      diferencia: tieneArqueo ? numero(conteo.diferencia) : null,
      arqueo: tieneArqueo ? "Sí" : "No",
      descuentos: numero(resumen?.descuentos),
      credito: numero(resumen?.ventasFiadas),
      observaciones: textoSeguro(corte?.notasCorte, ""),
    };
  });

  const conArqueo = filas.filter((fila) => fila.diferencia !== null);
  const totalVentas = filas.reduce((suma, fila) => suma + fila.ventas, 0);
  const totalEfectivo = filas.reduce((suma, fila) => suma + fila.efectivo, 0);
  const otrosPagos = filas.reduce((suma, fila) => suma + fila.tarjeta + fila.transferencia + fila.otros, 0);
  const diferenciaNeta = conArqueo.reduce((suma, fila) => suma + fila.diferencia, 0);

  const reporte = await iniciarReporte(contexto, "Historial de cortes de caja");
  const dash = await reporte.dashboard({ subtitulo: "Cortes cerrados del periodo" });

  dash.tarjetas([
    tarjeta("Cortes en el periodo", filas.length, "cantidad"),
    tarjeta("Ventas acumuladas", totalVentas, "moneda"),
    tarjeta("Efectivo acumulado", totalEfectivo, "moneda"),
    tarjeta("Otros medios de pago", otrosPagos, "moneda"),
    tarjeta("Cortes con arqueo", conArqueo.length, "cantidad", null, `de ${filas.length} cortes`),
    tarjeta("Diferencia neta", diferenciaNeta, "moneda", null, "Sobrantes menos faltantes"),
    tarjeta("Cortes con faltante", conArqueo.filter((fila) => fila.diferencia < -0.01).length, "cantidad"),
    tarjeta("Cortes con sobrante", conArqueo.filter((fila) => fila.diferencia > 0.01).length, "cantidad"),
  ]);

  dash.seccion("Resultado de los cortes");
  dash.graficas([
    {
      tipo: "columna",
      titulo: "Ventas por corte",
      datos: filas.slice().reverse().slice(-31).map((fila) => ({
        label: fila.fecha ? fila.fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "N/A",
        value: fila.ventas,
      })),
    },
    {
      tipo: "dona",
      titulo: "Composición de los cobros",
      datos: [
        { label: "Efectivo", value: Number(totalEfectivo.toFixed(2)) },
        { label: "Tarjeta", value: Number(filas.reduce((s, f) => s + f.tarjeta, 0).toFixed(2)) },
        { label: "Transferencia", value: Number(filas.reduce((s, f) => s + f.transferencia, 0).toFixed(2)) },
        { label: "Otros", value: Number(filas.reduce((s, f) => s + f.otros, 0).toFixed(2)) },
      ].filter((item) => item.value > 0),
    },
  ]);

  if (conArqueo.length) {
    dash.seccion("Diferencias de arqueo");
    dash.graficas([{
      tipo: "columna",
      titulo: "Diferencia por fecha",
      datos: conArqueo.slice().reverse().slice(-31).map((fila) => ({
        label: fila.fecha ? fila.fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "N/A",
        value: fila.diferencia,
      })),
    }]);
  } else {
    dash.aviso("Ningún corte del periodo incluye arqueo de efectivo, así que no hay diferencias que comparar.");
  }
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Cortes",
    subtitulo: "Detalle de cada corte",
    columnas: [
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Usuario", key: "cajero", ancho: 24 },
      { header: "Operaciones", key: "tickets", formato: "cantidad", total: true },
      { header: "Ventas", key: "ventas", formato: "moneda", total: true },
      { header: "Efectivo", key: "efectivo", formato: "moneda", total: true },
      { header: "Tarjeta", key: "tarjeta", formato: "moneda", total: true },
      { header: "Transferencia", key: "transferencia", formato: "moneda", total: true },
      { header: "Otros", key: "otros", formato: "moneda", total: true },
      { header: "Ventas a crédito", key: "credito", formato: "moneda", total: true },
      { header: "Descuentos", key: "descuentos", formato: "moneda", total: true },
      { header: "Fondo inicial", key: "fondoInicial", formato: "moneda" },
      { header: "Salidas de caja", key: "salidas", formato: "moneda", total: true },
      { header: "Efectivo esperado", key: "esperado", formato: "moneda", total: true },
      { header: "Efectivo contado", key: "contado", formato: "moneda", vacio: "Sin arqueo" },
      { header: "Diferencia", key: "diferencia", formato: "moneda", vacio: "Sin arqueo" },
      { header: "Arqueo", key: "arqueo", ancho: 10 },
      { header: "Observaciones", key: "observaciones", ancho: 36, vacio: "" },
    ],
    filas,
  });

  return reporte.descargar(nombreArchivo(contexto, "Historial_Cortes"));
}

// ===========================================================================
// 9. Egresos
// ===========================================================================

const TIPOS_EGRESO_LEGIBLE = {
  factura: "Factura",
  boleta_venta: "Boleta de venta",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  otro: "Otro",
};

const etiquetaTipoEgreso = (tipo) => TIPOS_EGRESO_LEGIBLE[String(tipo || "otro")]
  || textoSeguro(tipo, "Otro");

export async function egresosBasico(contexto) {
  const egresos = filtrarPorFecha(contexto.datos.egresos, "fecha", contexto);
  if (!egresos.length) throw errorSinDatos("No se registraron egresos en el periodo seleccionado.");

  const total = egresos.reduce((suma, egreso) => suma + egreso.monto, 0);

  const reporte = await iniciarReporte(contexto, "Egresos");
  const dash = await reporte.dashboard({ subtitulo: "Salidas de dinero del periodo" });
  dash.tarjetas([
    tarjeta("Total egresado", total, "moneda"),
    tarjeta("Número de egresos", egresos.length, "cantidad"),
    tarjeta("Promedio por egreso", total / egresos.length, "moneda"),
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Egresos",
    subtitulo: "Egresos registrados",
    columnas: [
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Concepto", key: "descripcion", ancho: 46, vacio: "Sin concepto" },
      { header: "Cantidad", key: "monto", formato: "moneda", total: true },
    ],
    filas: egresos,
  });

  return reporte.descargar(nombreArchivo(contexto, "Egresos"));
}

export async function egresosAvanzado(contexto) {
  const egresos = filtrarPorFecha(contexto.datos.egresos, "fecha", contexto);
  if (!egresos.length) throw errorSinDatos("No se registraron egresos en el periodo seleccionado.");

  const total = egresos.reduce((suma, egreso) => suma + egreso.monto, 0);

  const porTipo = new Map();
  const porMes = new Map();
  const porResponsable = new Map();
  const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  egresos.forEach((egreso) => {
    const tipo = etiquetaTipoEgreso(egreso.tipo);
    porTipo.set(tipo, (porTipo.get(tipo) || 0) + egreso.monto);
    const responsable = textoSeguro(egreso.usuario, "Sin responsable");
    porResponsable.set(responsable, (porResponsable.get(responsable) || 0) + egreso.monto);
    if (egreso.fecha) {
      const clave = `${egreso.fecha.getFullYear()}-${String(egreso.fecha.getMonth() + 1).padStart(2, "0")}`;
      const actual = porMes.get(clave) || { total: 0, etiqueta: `${MESES_CORTOS[egreso.fecha.getMonth()]} ${egreso.fecha.getFullYear()}` };
      actual.total += egreso.monto;
      porMes.set(clave, actual);
    }
  });

  const principal = [...porTipo.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const reporte = await iniciarReporte(contexto, "Egresos detallados");
  const dash = await reporte.dashboard({ subtitulo: "En qué se va el dinero" });

  dash.tarjetas([
    tarjeta("Total egresado", total, "moneda"),
    tarjeta("Número de egresos", egresos.length, "cantidad"),
    tarjeta("Tipo principal", principal?.[0] || "N/A", "texto", null,
      principal ? `${((principal[1] / total) * 100).toFixed(1)}% del total` : ""),
    tarjeta("Promedio por egreso", total / egresos.length, "moneda"),
  ]);

  dash.seccion("Distribución y evolución");
  dash.graficas([
    {
      tipo: "dona",
      titulo: "Egresos por tipo de comprobante",
      datos: [...porTipo.entries()]
        .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
        .sort((a, b) => b.value - a.value),
    },
    {
      tipo: "columna",
      titulo: "Egresos por mes",
      datos: [...porMes.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, valor]) => ({ label: valor.etiqueta, value: Number(valor.total.toFixed(2)) })),
    },
  ]);

  dash.seccion("Responsables");
  dash.graficas([{
    tipo: "barra",
    titulo: "Egresos por responsable",
    datos: [...porResponsable.entries()]
      .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
  }]);

  dash.aviso("CajaLibre guarda el tipo de comprobante, el concepto, el importe y el responsable "
    + "de cada egreso. La categoría de gasto, la forma de pago y la referencia todavía no se "
    + "capturan al registrarlo, por lo que no aparecen en este reporte.");
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Egresos",
    subtitulo: "Detalle de cada egreso",
    columnas: [
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Hora", key: "hora", formato: "hora", vacio: "Sin hora" },
      { header: "Concepto", key: "descripcion", ancho: 44, vacio: "Sin concepto" },
      { header: "Tipo de comprobante", key: "tipoLegible", ancho: 22 },
      { header: "Responsable", key: "usuario", ancho: 24, vacio: "Sin responsable" },
      { header: "Importe", key: "monto", formato: "moneda", total: true },
    ],
    filas: egresos.map((egreso) => ({
      ...egreso,
      // Los egresos antiguos no guardaron la hora exacta; se deja vacía en vez
      // de mostrar 00:00, que se leería como "a medianoche".
      hora: egreso.tieneHora ? egreso.fecha : null,
      tipoLegible: etiquetaTipoEgreso(egreso.tipo),
    })),
  });

  await reporte.tabla({
    nombre: "Por tipo",
    subtitulo: "Resumen por tipo de comprobante",
    columnas: [
      { header: "Tipo de comprobante", key: "label", ancho: 26 },
      { header: "Importe", key: "value", formato: "moneda", total: true },
      { header: "Participación", key: "participacion", formato: "porcentaje" },
    ],
    filas: [...porTipo.entries()]
      .map(([label, value]) => ({
        label,
        value: Number(value.toFixed(2)),
        participacion: total > 0 ? value / total : 0,
      }))
      .sort((a, b) => b.value - a.value),
  });

  return reporte.descargar(nombreArchivo(contexto, "Egresos_Detallados"));
}

// ===========================================================================
// 10. Clientes
// ===========================================================================

export async function directorioClientes(contexto) {
  const clientes = contexto.datos.clientes;
  if (!clientes.length) throw errorSinDatos("Todavía no hay clientes registrados.");

  const reporte = await iniciarReporte(contexto, "Directorio de clientes");
  const dash = await reporte.dashboard({ subtitulo: "Tus clientes registrados" });
  dash.tarjetas([
    tarjeta("Clientes registrados", clientes.length, "cantidad"),
    tarjeta("Con teléfono", clientes.filter((cliente) => String(cliente?.telefono || "").trim()).length, "cantidad"),
    tarjeta("Con dirección", clientes.filter((cliente) => String(cliente?.direccion || "").trim()).length, "cantidad"),
  ]);
  // El correo no forma parte del cliente en CajaLibre; se aclara para que la
  // ausencia de la columna no parezca un error del reporte.
  dash.aviso("CajaLibre no captura el correo del cliente, así que el directorio incluye teléfono "
    + "y dirección. Si necesitas el correo, habría que agregarlo primero al registro de clientes.");
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Clientes",
    subtitulo: "Directorio completo",
    columnas: [
      { header: "Nombre", key: "nombre", ancho: 34, vacio: "Sin nombre" },
      { header: "Teléfono", key: "telefono", ancho: 18, vacio: "Sin teléfono" },
      { header: "Dirección", key: "direccion", ancho: 44, vacio: "" },
      { header: "Registrado", key: "createdAt", formato: "fecha", vacio: "" },
    ],
    filas: clientes
      .slice()
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")),
    totales: false,
  });

  return reporte.descargar(nombreArchivo(contexto, "Directorio_Clientes"));
}

export async function analisisClientes(contexto) {
  const { clientes, fiados } = contexto.datos;
  if (!clientes.length) throw errorSinDatos("Todavía no hay clientes registrados.");

  const ventas = filtrarPorFecha(contexto.datos.ventas, "fecha", contexto);
  // Todas las ventas, no solo las del periodo: la primera compra y la
  // antiguedad de un cliente no dependen del rango elegido.
  const todasLasVentas = contexto.datos.ventas;

  const saldoPorCliente = new Map();
  fiados.forEach((cuenta) => {
    const clave = String(cuenta?.clienteId || "").trim();
    if (!clave) return;
    saldoPorCliente.set(clave, (saldoPorCliente.get(clave) || 0) + numero(cuenta?.saldo));
  });

  const porCliente = new Map();
  const acumular = (lista, enPeriodo) => {
    lista.forEach((venta) => {
      const clave = String(venta?.clienteId || "").trim();
      if (!clave) return;
      const registro = porCliente.get(clave) || {
        compras: 0, total: 0, primera: null, ultima: null,
        comprasPeriodo: 0, totalPeriodo: 0, productos: new Map(), categorias: new Map(),
      };
      const fecha = aFecha(venta?.fecha);
      registro.compras += 1;
      registro.total += numero(venta?.total);
      if (fecha) {
        if (!registro.primera || fecha < registro.primera) registro.primera = fecha;
        if (!registro.ultima || fecha > registro.ultima) registro.ultima = fecha;
      }
      if (enPeriodo) {
        registro.comprasPeriodo += 1;
        registro.totalPeriodo += numero(venta?.total);
        (Array.isArray(venta?.productos) ? venta.productos : []).forEach((item) => {
          const nombre = textoSeguro(item?.nombre, "Sin nombre");
          const categoria = textoSeguro(item?.categoria, "Sin categoría");
          const cantidad = numero(item?.cantidad) || 1;
          registro.productos.set(nombre, (registro.productos.get(nombre) || 0) + cantidad);
          registro.categorias.set(categoria, (registro.categorias.get(categoria) || 0) + cantidad);
        });
      }
      porCliente.set(clave, registro);
    });
  };
  acumular(todasLasVentas, false);
  const idsPeriodo = new Set(ventas.map((venta) => String(venta?.clienteId || "").trim()));
  acumular(ventas.filter((venta) => idsPeriodo.has(String(venta?.clienteId || "").trim())), true);

  const masFrecuente = (mapa) => [...mapa.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const ahora = Date.now();

  const filas = clientes.map((cliente) => {
    const registro = porCliente.get(String(cliente.id)) || null;
    const total = registro?.total || 0;
    const compras = registro?.compras || 0;
    const ultima = registro?.ultima || null;
    const diasSinComprar = ultima ? Math.floor((ahora - ultima.getTime()) / 86400000) : null;

    // La clasificacion se CALCULA al exportar y no se guarda en el cliente:
    // generar un reporte no debe modificar los datos del negocio.
    let clasificacion = "Sin compras";
    if (compras > 0) {
      if (diasSinComprar !== null && diasSinComprar > 90) clasificacion = "Inactivo";
      else if (compras >= 10 || total >= 10000) clasificacion = "VIP";
      else if (compras >= 3) clasificacion = "Frecuente";
      else clasificacion = "Nuevo";
    }

    return {
      nombre: textoSeguro(cliente?.nombre, "Sin nombre"),
      telefono: textoSeguro(cliente?.telefono, "Sin teléfono"),
      direccion: textoSeguro(cliente?.direccion, ""),
      registrado: aFecha(cliente?.createdAt),
      primera: registro?.primera || null,
      ultima,
      compras,
      total: Number(total.toFixed(2)),
      ticketPromedio: compras > 0 ? Number((total / compras).toFixed(2)) : 0,
      comprasPeriodo: registro?.comprasPeriodo || 0,
      totalPeriodo: Number((registro?.totalPeriodo || 0).toFixed(2)),
      productoFavorito: registro ? masFrecuente(registro.productos) : "",
      categoriaFavorita: registro ? masFrecuente(registro.categorias) : "",
      diasSinComprar,
      saldoPendiente: Number((saldoPorCliente.get(String(cliente.id)) || 0).toFixed(2)),
      clasificacion,
      puntos: numero(cliente?.puntos),
    };
  });

  const conCompras = filas.filter((fila) => fila.compras > 0);
  const nuevosPeriodo = filtrarPorFecha(clientes, "createdAt", contexto).length;

  const reporte = await iniciarReporte(contexto, "Análisis de clientes");
  const dash = await reporte.dashboard({ subtitulo: "Quién compra y cuánto deja" });

  dash.tarjetas([
    tarjeta("Clientes registrados", clientes.length, "cantidad"),
    tarjeta("Clientes con compras", conCompras.length, "cantidad"),
    tarjeta("Clientes nuevos", nuevosPeriodo, "cantidad", null, "Registrados en el periodo"),
    tarjeta("Compraron en el periodo", filas.filter((fila) => fila.comprasPeriodo > 0).length, "cantidad"),
    tarjeta("Clientes VIP", filas.filter((fila) => fila.clasificacion === "VIP").length, "cantidad"),
    tarjeta("Clientes frecuentes", filas.filter((fila) => fila.clasificacion === "Frecuente").length, "cantidad"),
    tarjeta("Clientes inactivos", filas.filter((fila) => fila.clasificacion === "Inactivo").length, "cantidad", null, "Sin comprar en 90 días"),
    tarjeta("Saldo por cobrar", filas.reduce((suma, fila) => suma + fila.saldoPendiente, 0), "moneda"),
  ]);

  dash.seccion("Los que más compran");
  dash.graficas([
    {
      tipo: "barra",
      titulo: "Clientes con mayores compras",
      datos: conCompras.slice().sort((a, b) => b.total - a.total).slice(0, 10)
        .map((fila) => ({ label: fila.nombre, value: fila.total })),
    },
    {
      tipo: "dona",
      titulo: "Clientes por clasificación",
      datos: ["VIP", "Frecuente", "Nuevo", "Inactivo", "Sin compras"]
        .map((clasificacion) => ({
          label: clasificacion,
          value: filas.filter((fila) => fila.clasificacion === clasificacion).length,
        }))
        .filter((item) => item.value > 0),
      formatoValor: "#,##0",
    },
  ]);

  dash.aviso("La clasificación se calcula al generar el reporte y no modifica al cliente. "
    + "VIP: 10 compras o más de $10,000 acumulados. Frecuente: 3 o más compras. "
    + "Inactivo: sin comprar en los últimos 90 días. Solo se consideran las ventas con cliente "
    + "identificado; las ventas a público general no se asocian a nadie.");
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Clientes",
    subtitulo: "Comportamiento de compra",
    columnas: [
      { header: "Cliente", key: "nombre", ancho: 32 },
      { header: "Teléfono", key: "telefono", ancho: 17 },
      { header: "Clasificación", key: "clasificacion", ancho: 15 },
      { header: "Primera compra", key: "primera", formato: "fecha", vacio: "Sin compras" },
      { header: "Última compra", key: "ultima", formato: "fecha", vacio: "Sin compras" },
      { header: "Días sin comprar", key: "diasSinComprar", formato: "cantidad", vacio: "N/A" },
      { header: "Compras", key: "compras", formato: "cantidad", total: true },
      { header: "Total gastado", key: "total", formato: "moneda", total: true },
      { header: "Ticket promedio", key: "ticketPromedio", formato: "moneda" },
      { header: "Compras del periodo", key: "comprasPeriodo", formato: "cantidad", total: true },
      { header: "Gastado en el periodo", key: "totalPeriodo", formato: "moneda", total: true },
      { header: "Producto favorito", key: "productoFavorito", ancho: 30, vacio: "" },
      { header: "Categoría favorita", key: "categoriaFavorita", ancho: 20, vacio: "" },
      { header: "Saldo pendiente", key: "saldoPendiente", formato: "moneda", total: true },
      { header: "Puntos", key: "puntos", formato: "cantidad" },
      { header: "Registrado", key: "registrado", formato: "fecha", vacio: "" },
    ],
    filas: filas.slice().sort((a, b) => b.total - a.total),
  });

  return reporte.descargar(nombreArchivo(contexto, "Analisis_Clientes"));
}

// ===========================================================================
// 11. Fiado / credito
// ===========================================================================

export async function saldosPendientes(contexto) {
  const conSaldo = contexto.datos.fiados.filter((cuenta) => numero(cuenta?.saldo) > 0.01);
  if (!conSaldo.length) throw errorSinDatos("No hay saldos pendientes por cobrar.");

  const total = conSaldo.reduce((suma, cuenta) => suma + numero(cuenta?.saldo), 0);

  const reporte = await iniciarReporte(contexto, "Saldos pendientes");
  const dash = await reporte.dashboard({ subtitulo: "Lo que te deben" });
  dash.tarjetas([
    tarjeta("Total pendiente", total, "moneda"),
    tarjeta("Clientes con deuda", conSaldo.length, "cantidad"),
    tarjeta("Deuda promedio", total / conSaldo.length, "moneda"),
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Saldos",
    subtitulo: "Cuentas con saldo pendiente",
    columnas: [
      { header: "Cliente", key: "cliente", ancho: 34 },
      { header: "Teléfono", key: "telefono", ancho: 18, vacio: "" },
      { header: "Saldo pendiente", key: "saldo", formato: "moneda", total: true },
    ],
    filas: conSaldo
      .map((cuenta) => ({
        cliente: textoSeguro(cuenta?.clienteNombre, "Cliente sin nombre"),
        telefono: textoSeguro(cuenta?.clienteTelefono, ""),
        saldo: numero(cuenta?.saldo),
      }))
      .sort((a, b) => b.saldo - a.saldo),
  });

  return reporte.descargar(nombreArchivo(contexto, "Saldos_Pendientes"));
}

export async function cuentasPorCobrar(contexto) {
  const fiados = contexto.datos.fiados;
  if (!fiados.length) throw errorSinDatos("Todavía no hay cuentas a crédito registradas.");

  const resumen = resumenFiados(fiados, contexto);
  const ahora = Date.now();

  const cuentas = fiados.map((cuenta) => {
    const saldo = numero(cuenta?.saldo);
    const vencimiento = cuenta?.fechaVencimiento ? new Date(`${cuenta.fechaVencimiento}T12:00:00`) : null;
    const movimientos = Array.isArray(cuenta?.movimientos) ? cuenta.movimientos : [];
    const ultimoPago = movimientos
      .filter((movimiento) => numero(movimiento?.abono) > 0)
      .map((movimiento) => aFecha(movimiento?.fecha))
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || null;
    const diasVencido = vencimiento && saldo > 0.01 && !Number.isNaN(vencimiento.getTime())
      ? Math.floor((ahora - vencimiento.getTime()) / 86400000)
      : null;

    return {
      cliente: textoSeguro(cuenta?.clienteNombre, "Cliente sin nombre"),
      telefono: textoSeguro(cuenta?.clienteTelefono, ""),
      inicio: cuenta?.fechaInicio ? new Date(`${cuenta.fechaInicio}T12:00:00`) : null,
      vencimiento: vencimiento && !Number.isNaN(vencimiento.getTime()) ? vencimiento : null,
      limiteCredito: numero(cuenta?.limiteCredito),
      cargos: movimientos.reduce((suma, movimiento) => suma + numero(movimiento?.cargo), 0),
      abonos: movimientos.reduce((suma, movimiento) => suma + numero(movimiento?.abono), 0),
      saldo,
      ultimoPago,
      diasVencido: diasVencido !== null && diasVencido > 0 ? diasVencido : null,
      estado: saldo <= 0.01 ? "Liquidada" : (diasVencido !== null && diasVencido > 0 ? "Vencida" : "Vigente"),
      notas: textoSeguro(cuenta?.notas, ""),
    };
  });

  const reporte = await iniciarReporte(contexto, "Cuentas por cobrar");
  const dash = await reporte.dashboard({ subtitulo: "Tu cobranza completa" });

  dash.tarjetas([
    tarjeta("Total pendiente", resumen.pendiente, "moneda"),
    tarjeta("Recuperado en el periodo", resumen.recuperado, "moneda"),
    tarjeta("Clientes con deuda", resumen.conDeuda, "cantidad"),
    tarjeta("Deuda promedio", resumen.deudaPromedio, "moneda"),
    tarjeta("Fiado generado", resumen.generado, "moneda", null, "Cargos del periodo"),
    tarjeta("Cuentas vencidas", cuentas.filter((cuenta) => cuenta.estado === "Vencida").length, "cantidad"),
    tarjeta("Cuentas liquidadas", cuentas.filter((cuenta) => cuenta.estado === "Liquidada").length, "cantidad"),
    tarjeta("Cuentas totales", cuentas.length, "cantidad"),
  ]);

  dash.seccion("Deuda y recuperación");
  dash.graficas([
    {
      tipo: "barra",
      titulo: "Deuda por cliente",
      datos: cuentas.filter((cuenta) => cuenta.saldo > 0.01)
        .sort((a, b) => b.saldo - a.saldo).slice(0, 12)
        .map((cuenta) => ({ label: cuenta.cliente, value: cuenta.saldo })),
    },
    {
      tipo: "dona",
      titulo: "Cuentas por estado",
      datos: ["Vigente", "Vencida", "Liquidada"]
        .map((estado) => ({ label: estado, value: cuentas.filter((cuenta) => cuenta.estado === estado).length }))
        .filter((item) => item.value > 0),
      formatoValor: "#,##0",
    },
  ]);

  // Recuperacion por dia dentro del periodo, con los movimientos reales.
  const recuperacion = new Map();
  resumen.movimientos.forEach((movimiento) => {
    if (!(movimiento.abono > 0) || !movimiento.fecha) return;
    const clave = `${movimiento.fecha.getFullYear()}-${String(movimiento.fecha.getMonth() + 1).padStart(2, "0")}-${String(movimiento.fecha.getDate()).padStart(2, "0")}`;
    recuperacion.set(clave, (recuperacion.get(clave) || 0) + movimiento.abono);
  });

  if (recuperacion.size) {
    dash.seccion("Cobranza del periodo");
    dash.graficas([{
      tipo: "columna",
      titulo: "Recuperación por día",
      datos: [...recuperacion.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-31)
        .map(([clave, value]) => ({
          label: `${clave.slice(8)}/${clave.slice(5, 7)}`,
          value: Number(value.toFixed(2)),
        })),
    }]);
  }
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Cuentas",
    subtitulo: "Estado de cada cuenta a crédito",
    columnas: [
      { header: "Cliente", key: "cliente", ancho: 32 },
      { header: "Teléfono", key: "telefono", ancho: 17, vacio: "" },
      { header: "Inicio", key: "inicio", formato: "fecha", vacio: "" },
      { header: "Vencimiento", key: "vencimiento", formato: "fecha", vacio: "Sin fecha" },
      { header: "Límite de crédito", key: "limiteCredito", formato: "moneda" },
      { header: "Cargos", key: "cargos", formato: "moneda", total: true },
      { header: "Abonos", key: "abonos", formato: "moneda", total: true },
      { header: "Saldo", key: "saldo", formato: "moneda", total: true },
      { header: "Último pago", key: "ultimoPago", formato: "fecha", vacio: "Sin pagos" },
      { header: "Días vencido", key: "diasVencido", formato: "cantidad", vacio: "" },
      { header: "Estado", key: "estado", ancho: 13 },
      { header: "Observaciones", key: "notas", ancho: 34, vacio: "" },
    ],
    filas: cuentas.slice().sort((a, b) => b.saldo - a.saldo),
  });

  await reporte.tabla({
    nombre: "Movimientos",
    subtitulo: "Cargos y abonos del periodo",
    columnas: [
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Hora", key: "hora", formato: "hora" },
      { header: "Cliente", key: "cliente", ancho: 32 },
      { header: "Concepto", key: "descripcion", ancho: 40, vacio: "Sin concepto" },
      { header: "Cargo", key: "cargo", formato: "moneda", total: true },
      { header: "Abono", key: "abono", formato: "moneda", total: true },
      { header: "Saldo resultante", key: "saldo", formato: "moneda" },
      { header: "Forma de pago", key: "metodo", ancho: 18, vacio: "" },
    ],
    filas: resumen.movimientos.map((movimiento) => ({ ...movimiento, hora: movimiento.fecha })),
    nota: resumen.movimientos.length ? "" : "No hubo movimientos de crédito en el periodo.",
  });

  return reporte.descargar(nombreArchivo(contexto, "Cuentas_Por_Cobrar"));
}

export async function estadoCuentaCliente(contexto) {
  const clienteId = String(contexto.clienteId || "").trim();
  if (!clienteId) throw errorSinDatos("Selecciona un cliente para generar su estado de cuenta.");

  const cuentas = contexto.datos.fiados.filter(
    (cuenta) => String(cuenta?.clienteId || "").trim() === clienteId,
  );
  if (!cuentas.length) throw errorSinDatos("El cliente seleccionado no tiene cuentas a crédito.");

  const nombreCliente = textoSeguro(cuentas[0]?.clienteNombre, "Cliente sin nombre");
  const movimientos = [];
  cuentas.forEach((cuenta) => {
    (Array.isArray(cuenta?.movimientos) ? cuenta.movimientos : []).forEach((movimiento) => {
      movimientos.push({
        fecha: aFecha(movimiento?.fecha),
        hora: aFecha(movimiento?.fecha),
        descripcion: textoSeguro(movimiento?.descripcion, "Sin concepto"),
        cargo: numero(movimiento?.cargo),
        abono: numero(movimiento?.abono),
        saldo: numero(movimiento?.saldo),
        metodo: textoSeguro(movimiento?.metodo, ""),
        vencimiento: cuenta?.fechaVencimiento ? new Date(`${cuenta.fechaVencimiento}T12:00:00`) : null,
      });
    });
  });
  movimientos.sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));

  const cargos = movimientos.reduce((suma, movimiento) => suma + movimiento.cargo, 0);
  const abonos = movimientos.reduce((suma, movimiento) => suma + movimiento.abono, 0);
  const saldo = cuentas.reduce((suma, cuenta) => suma + numero(cuenta?.saldo), 0);

  const reporte = await iniciarReporte(contexto, `Estado de cuenta · ${nombreCliente}`);
  const dash = await reporte.dashboard({ subtitulo: nombreCliente });

  dash.tarjetas([
    tarjeta("Saldo actual", saldo, "moneda"),
    tarjeta("Cargos acumulados", cargos, "moneda"),
    tarjeta("Abonos acumulados", abonos, "moneda"),
    tarjeta("Movimientos", movimientos.length, "cantidad"),
  ]);

  dash.seccion("Datos de la cuenta");
  dash.datos([
    { etiqueta: "Cliente", valor: nombreCliente, formato: "texto" },
    { etiqueta: "Teléfono", valor: cuentas[0]?.clienteTelefono, formato: "texto", vacio: "Sin teléfono" },
    { etiqueta: "Cuentas a crédito", valor: cuentas.length, formato: "cantidad" },
    { etiqueta: "Límite de crédito", valor: cuentas.reduce((suma, cuenta) => suma + numero(cuenta?.limiteCredito), 0), formato: "moneda" },
    { etiqueta: "Primer movimiento", valor: movimientos[0]?.fecha, formato: "fecha" },
    { etiqueta: "Último movimiento", valor: movimientos.at(-1)?.fecha, formato: "fecha" },
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Estado de cuenta",
    subtitulo: `Movimientos de ${nombreCliente}`,
    columnas: [
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Hora", key: "hora", formato: "hora" },
      { header: "Concepto", key: "descripcion", ancho: 44 },
      { header: "Cargo", key: "cargo", formato: "moneda", total: true },
      { header: "Abono", key: "abono", formato: "moneda", total: true },
      { header: "Saldo", key: "saldo", formato: "moneda" },
      { header: "Forma de pago", key: "metodo", ancho: 18, vacio: "" },
      { header: "Vencimiento", key: "vencimiento", formato: "fecha", vacio: "Sin fecha" },
    ],
    filas: movimientos,
  });

  return reporte.descargar(nombreArchivo(contexto, "Estado_Cuenta", nombreCliente));
}

// ===========================================================================
// 12. Empleados
// ===========================================================================

const etiquetaEstadoEmpleado = (empleado) => (empleado?.activo === false ? "Inactivo" : "Activo");

export async function empleadosBasico(contexto) {
  const empleados = contexto.datos.empleados;
  if (!empleados.length) throw errorSinDatos("Todavía no hay empleados registrados.");

  const reporte = await iniciarReporte(contexto, "Lista de empleados");
  const dash = await reporte.dashboard({ subtitulo: "Tu personal registrado" });
  dash.tarjetas([
    tarjeta("Empleados", empleados.length, "cantidad"),
    tarjeta("Activos", empleados.filter((empleado) => empleado?.activo !== false).length, "cantidad"),
    tarjeta("Inactivos", empleados.filter((empleado) => empleado?.activo === false).length, "cantidad"),
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Empleados",
    subtitulo: "Personal del negocio",
    columnas: [
      { header: "Nombre", key: "nombre", ancho: 34, vacio: "Sin nombre" },
      { header: "Rol", key: "rol", ancho: 22, vacio: "Sin rol" },
      { header: "Estado", key: "estado", ancho: 14 },
    ],
    filas: empleados
      .map((empleado) => ({ ...empleado, estado: etiquetaEstadoEmpleado(empleado) }))
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")),
    totales: false,
  });

  return reporte.descargar(nombreArchivo(contexto, "Empleados"));
}

export async function rendimientoEmpleados(contexto) {
  const empleados = contexto.datos.empleados;
  const ventas = filtrarPorFecha(contexto.datos.ventas, "fecha", contexto);
  if (!ventas.length) throw errorSinDatos();

  const indiceEmpleados = indexarEmpleados(empleados);
  const porEmpleado = ventasPorEmpleado(ventas, indiceEmpleados);

  // Cortes realizados por cada persona dentro del periodo.
  const cortesPorEmpleado = new Map();
  contexto.datos.cortes
    .filter((corte) => corte?.cerrado === true)
    .forEach((corte) => {
      const fecha = fechaDeCorte(corte);
      if (contexto.desde && fecha && fecha < contexto.desde) return;
      if (contexto.hasta && fecha && fecha > contexto.hasta) return;
      const nombre = textoSeguro(corte?.cajero?.nombre || corte?.cajero?.email, "Sin asignar");
      cortesPorEmpleado.set(nombre, (cortesPorEmpleado.get(nombre) || 0) + 1);
    });

  const rolPorNombre = new Map(
    empleados.map((empleado) => [String(empleado?.nombre || "").trim(), String(empleado?.rol || "")]),
  );

  const filas = porEmpleado.map((registro) => ({
    ...registro,
    rol: textoSeguro(rolPorNombre.get(registro.nombre), ""),
    cortes: cortesPorEmpleado.get(registro.nombre) || 0,
    participacion: 0,
  }));
  const totalVendido = filas.reduce((suma, fila) => suma + fila.total, 0);
  filas.forEach((fila) => { fila.participacion = totalVendido > 0 ? fila.total / totalVendido : 0; });

  const mejor = filas[0] || null;
  const sinAsignar = filas.find((fila) => fila.nombre === "Sin asignar");

  const reporte = await iniciarReporte(contexto, "Rendimiento de empleados");
  const dash = await reporte.dashboard({ subtitulo: "Desempeño del equipo en el periodo" });

  dash.tarjetas([
    tarjeta("Empleado con más ventas", mejor?.nombre || "N/A", "texto", null,
      mejor ? mejor.total.toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : ""),
    tarjeta("Total vendido", totalVendido, "moneda"),
    tarjeta("Operaciones", filas.reduce((suma, fila) => suma + fila.operaciones, 0), "cantidad"),
    tarjeta("Ticket promedio", ventas.length > 0 ? totalVendido / ventas.length : 0, "moneda"),
  ]);

  dash.seccion("Comparativa del equipo");
  dash.graficas([
    {
      tipo: "barra",
      titulo: "Ventas por empleado",
      datos: filas.slice(0, 12).map((fila) => ({ label: fila.nombre, value: fila.total })),
    },
    {
      tipo: "columna",
      titulo: "Operaciones por empleado",
      datos: filas.slice(0, 12).map((fila) => ({ label: fila.nombre, value: fila.operaciones })),
      formatoValor: "#,##0",
    },
  ]);
  dash.graficas([{
    tipo: "columna",
    titulo: "Ticket promedio por empleado",
    datos: filas.slice(0, 12).map((fila) => ({ label: fila.nombre, value: Number(fila.ticketPromedio.toFixed(2)) })),
  }]);

  if (sinAsignar && sinAsignar.operaciones > 0) {
    dash.aviso(`${sinAsignar.operaciones} operación(es) aparecen como "Sin asignar". CajaLibre `
      + "empezó a guardar quién cobra cada venta a partir de esta actualización, así que las "
      + "ventas anteriores no tienen ese dato.");
  }
  // No se exportan correos, identificadores internos ni permisos: para medir
  // desempeño no hacen falta y son datos sensibles del personal.
  dash.aviso("Este reporte mide desempeño de venta. No incluye datos personales del empleado "
    + "más allá de su nombre y rol.");
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Rendimiento",
    subtitulo: "Desempeño por empleado",
    columnas: [
      { header: "Empleado", key: "nombre", ancho: 30 },
      { header: "Rol", key: "rol", ancho: 20, vacio: "" },
      { header: "Ventas", key: "total", formato: "moneda", total: true },
      { header: "Operaciones", key: "operaciones", formato: "cantidad", total: true },
      { header: "Ticket promedio", key: "ticketPromedio", formato: "moneda" },
      { header: "Participación", key: "participacion", formato: "porcentaje" },
      { header: "Descuentos otorgados", key: "descuentos", formato: "moneda", total: true },
      { header: "Efectivo", key: "efectivo", formato: "moneda", total: true },
      { header: "Tarjeta", key: "tarjeta", formato: "moneda", total: true },
      { header: "Transferencia", key: "transferencia", formato: "moneda", total: true },
      { header: "Ventas a crédito", key: "fiado", formato: "moneda", total: true },
      { header: "Cortes realizados", key: "cortes", formato: "cantidad", total: true },
    ],
    filas,
    nota: "CajaLibre no registra cancelaciones ni devoluciones de ventas, así que esas columnas "
      + "no forman parte del reporte.",
  });

  return reporte.descargar(nombreArchivo(contexto, "Rendimiento_Empleados"));
}

// ===========================================================================
// 13. Restaurante
// ===========================================================================

/** Comandas del periodo, ya normalizadas. */
function ordenesDelPeriodo(contexto) {
  return normalizarOrdenes(contexto.datos.ordenes)
    .filter((orden) => {
      if (!orden.fecha) return false;
      if (contexto.desde && orden.fecha < contexto.desde) return false;
      if (contexto.hasta && orden.fecha > contexto.hasta) return false;
      return true;
    });
}

export async function restauranteResumen(contexto) {
  const ordenes = ordenesDelPeriodo(contexto);
  const cobradas = ordenes.filter((orden) => orden.statusCrudo === "cobrada");
  if (!ordenes.length) throw errorSinDatos("No hay comandas registradas en el periodo seleccionado.");

  const total = cobradas.reduce((suma, orden) => suma + orden.total, 0);
  const mesas = new Set(cobradas.map((orden) => orden.mesa).filter((mesa) => mesa !== "Sin mesa"));
  // Una "cuenta" es la venta con la que se cobraron una o varias comandas.
  const cuentas = new Set(cobradas.map((orden) => orden.ventaId || orden.id));

  const reporte = await iniciarReporte(contexto, "Resumen restaurante");
  const dash = await reporte.dashboard({ subtitulo: "Operación del restaurante" });

  dash.tarjetas([
    tarjeta("Ventas cobradas", total, "moneda"),
    tarjeta("Cuentas cobradas", cuentas.size, "cantidad"),
    tarjeta("Mesas atendidas", mesas.size, "cantidad"),
    tarjeta("Ticket promedio", cuentas.size > 0 ? total / cuentas.size : 0, "moneda"),
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Restaurante",
    subtitulo: "Comandas del periodo",
    columnas: [
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Hora", key: "hora", formato: "hora" },
      { header: "Cuenta", key: "folio", ancho: 14 },
      { header: "Mesa", key: "mesa", ancho: 18 },
      { header: "Estado", key: "estado", ancho: 16 },
      { header: "Total", key: "total", formato: "moneda", total: true },
    ],
    filas: ordenes.map((orden) => ({ ...orden, hora: orden.fecha })),
  });

  return reporte.descargar(nombreArchivo(contexto, "Resumen_Restaurante"));
}

export async function restauranteMeseros(contexto) {
  const cobradas = ordenesDelPeriodo(contexto).filter((orden) => orden.statusCrudo === "cobrada");
  if (!cobradas.length) throw errorSinDatos("No hay comandas cobradas en el periodo seleccionado.");

  const mapa = new Map();
  cobradas.forEach((orden) => {
    const registro = mapa.get(orden.mesero) || {
      mesero: orden.mesero, mesas: new Set(), cuentas: new Set(), total: 0, propinas: 0, comandas: 0,
    };
    if (orden.mesa !== "Sin mesa") registro.mesas.add(orden.mesa);
    registro.cuentas.add(orden.ventaId || orden.id);
    registro.total += orden.total;
    registro.propinas += orden.propina;
    registro.comandas += 1;
    mapa.set(orden.mesero, registro);
  });

  const filas = [...mapa.values()]
    .map((registro) => ({
      mesero: registro.mesero,
      mesas: registro.mesas.size,
      cuentas: registro.cuentas.size,
      comandas: registro.comandas,
      total: Number(registro.total.toFixed(2)),
      propinas: Number(registro.propinas.toFixed(2)),
      ticketPromedio: registro.cuentas.size > 0 ? Number((registro.total / registro.cuentas.size).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const reporte = await iniciarReporte(contexto, "Ventas por mesero");
  const dash = await reporte.dashboard({ subtitulo: "Desempeño del personal de piso" });

  dash.tarjetas([
    tarjeta("Mesero con más ventas", filas[0]?.mesero || "N/A", "texto", null,
      filas[0] ? filas[0].total.toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : ""),
    tarjeta("Total vendido", filas.reduce((suma, fila) => suma + fila.total, 0), "moneda"),
    tarjeta("Cuentas atendidas", filas.reduce((suma, fila) => suma + fila.cuentas, 0), "cantidad"),
    tarjeta("Propinas", filas.reduce((suma, fila) => suma + fila.propinas, 0), "moneda"),
  ]);

  dash.seccion("Comparativa");
  dash.graficas([
    { tipo: "barra", titulo: "Ventas por mesero", datos: filas.map((fila) => ({ label: fila.mesero, value: fila.total })) },
    {
      tipo: "columna",
      titulo: "Ticket promedio por mesero",
      datos: filas.map((fila) => ({ label: fila.mesero, value: fila.ticketPromedio })),
    },
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Meseros",
    subtitulo: "Desempeño por mesero",
    columnas: [
      { header: "Mesero", key: "mesero", ancho: 30 },
      { header: "Mesas atendidas", key: "mesas", formato: "cantidad", total: true },
      { header: "Cuentas", key: "cuentas", formato: "cantidad", total: true },
      { header: "Comandas", key: "comandas", formato: "cantidad", total: true },
      { header: "Total vendido", key: "total", formato: "moneda", total: true },
      { header: "Ticket promedio", key: "ticketPromedio", formato: "moneda" },
      { header: "Propinas", key: "propinas", formato: "moneda", total: true },
    ],
    filas,
  });

  return reporte.descargar(nombreArchivo(contexto, "Ventas_Por_Mesero"));
}

export async function restaurantePlatillos(contexto) {
  const cobradas = ordenesDelPeriodo(contexto).filter((orden) => orden.statusCrudo === "cobrada");
  const platillos = platillosVendidos(cobradas);
  if (!platillos.length) throw errorSinDatos("No hay platillos vendidos en el periodo seleccionado.");

  const porCategoria = new Map();
  platillos.forEach((platillo) => {
    porCategoria.set(platillo.categoria, (porCategoria.get(platillo.categoria) || 0) + platillo.importe);
  });

  const reporte = await iniciarReporte(contexto, "Platillos vendidos");
  const dash = await reporte.dashboard({ subtitulo: "Qué se pide más" });

  dash.tarjetas([
    tarjeta("Platillo más vendido", platillos[0]?.nombre || "N/A", "texto", null,
      platillos[0] ? `${platillos[0].cantidad.toLocaleString("es-MX")} unidades` : ""),
    tarjeta("Importe vendido", platillos.reduce((suma, item) => suma + item.importe, 0), "moneda"),
    tarjeta("Unidades vendidas", platillos.reduce((suma, item) => suma + item.cantidad, 0), "decimal"),
    tarjeta("Platillos distintos", platillos.length, "cantidad"),
  ]);

  dash.seccion("Los más vendidos");
  dash.graficas([
    {
      tipo: "barra",
      titulo: "Platillos más vendidos",
      datos: platillos.slice(0, 12).map((item) => ({ label: item.nombre, value: item.importe })),
    },
    {
      tipo: "dona",
      titulo: "Ventas por categoría",
      datos: [...porCategoria.entries()]
        .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    },
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Platillos",
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

  return reporte.descargar(nombreArchivo(contexto, "Platillos_Vendidos"));
}

export async function restauranteMesas(contexto) {
  const cobradas = ordenesDelPeriodo(contexto).filter((orden) => orden.statusCrudo === "cobrada");
  if (!cobradas.length) throw errorSinDatos("No hay comandas cobradas en el periodo seleccionado.");

  const mapa = new Map();
  cobradas.forEach((orden) => {
    const registro = mapa.get(orden.mesa) || { mesa: orden.mesa, servicios: new Set(), total: 0, comandas: 0 };
    registro.servicios.add(orden.ventaId || orden.id);
    registro.total += orden.total;
    registro.comandas += 1;
    mapa.set(orden.mesa, registro);
  });

  const filas = [...mapa.values()]
    .map((registro) => ({
      mesa: registro.mesa,
      servicios: registro.servicios.size,
      comandas: registro.comandas,
      total: Number(registro.total.toFixed(2)),
      ticketPromedio: registro.servicios.size > 0 ? Number((registro.total / registro.servicios.size).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const reporte = await iniciarReporte(contexto, "Rendimiento de mesas");
  const dash = await reporte.dashboard({ subtitulo: "Qué mesas trabajan más" });

  dash.tarjetas([
    tarjeta("Mesas con servicio", filas.length, "cantidad"),
    tarjeta("Total facturado", filas.reduce((suma, fila) => suma + fila.total, 0), "moneda"),
    tarjeta("Servicios", filas.reduce((suma, fila) => suma + fila.servicios, 0), "cantidad"),
    tarjeta("Mesa más productiva", filas[0]?.mesa || "N/A", "texto", null,
      filas[0] ? filas[0].total.toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : ""),
  ]);
  dash.seccion("Comparativa de mesas");
  dash.graficas([
    { tipo: "barra", titulo: "Total facturado por mesa", datos: filas.slice(0, 15).map((fila) => ({ label: fila.mesa, value: fila.total })) },
    {
      tipo: "columna",
      titulo: "Servicios por mesa",
      datos: filas.slice(0, 15).map((fila) => ({ label: fila.mesa, value: fila.servicios })),
      formatoValor: "#,##0",
    },
  ]);
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Mesas",
    subtitulo: "Rendimiento por mesa",
    columnas: [
      { header: "Mesa", key: "mesa", ancho: 22 },
      { header: "Servicios", key: "servicios", formato: "cantidad", total: true },
      { header: "Comandas", key: "comandas", formato: "cantidad", total: true },
      { header: "Total facturado", key: "total", formato: "moneda", total: true },
      { header: "Ticket promedio", key: "ticketPromedio", formato: "moneda" },
    ],
    filas,
  });

  return reporte.descargar(nombreArchivo(contexto, "Rendimiento_Mesas"));
}

export async function restauranteComandas(contexto) {
  const ordenes = ordenesDelPeriodo(contexto);
  if (!ordenes.length) throw errorSinDatos("No hay comandas registradas en el periodo seleccionado.");

  const conTiempo = ordenes.filter((orden) => orden.minutosPreparacion !== null);
  const promedio = conTiempo.length
    ? conTiempo.reduce((suma, orden) => suma + orden.minutosPreparacion, 0) / conTiempo.length
    : null;

  const reporte = await iniciarReporte(contexto, "Comandas y tiempos de preparación");
  const dash = await reporte.dashboard({ subtitulo: "Cómo responde la cocina" });

  dash.tarjetas([
    tarjeta("Comandas", ordenes.length, "cantidad"),
    tarjeta("Tiempo promedio", promedio === null ? "Sin datos" : Number(promedio.toFixed(1)),
      promedio === null ? "texto" : "decimal", null, promedio === null ? "" : "minutos"),
    tarjeta("Comandas cobradas", ordenes.filter((orden) => orden.statusCrudo === "cobrada").length, "cantidad"),
    tarjeta("Comandas canceladas", ordenes.filter((orden) => orden.statusCrudo === "cancelada").length, "cantidad"),
  ]);

  dash.seccion("Distribución");
  dash.graficas([
    {
      tipo: "dona",
      titulo: "Comandas por estado",
      datos: ["Cobrada", "Cancelada", "Lista", "En preparación", "Nueva"]
        .map((estado) => ({ label: estado, value: ordenes.filter((orden) => orden.estado === estado).length }))
        .filter((item) => item.value > 0),
      formatoValor: "#,##0",
    },
    {
      tipo: "columna",
      titulo: "Comandas por hora",
      datos: (() => {
        const horas = new Map();
        ordenes.forEach((orden) => {
          if (!orden.fecha) return;
          const clave = orden.fecha.getHours();
          horas.set(clave, (horas.get(clave) || 0) + 1);
        });
        return [...horas.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([hora, value]) => ({ label: `${String(hora).padStart(2, "0")}:00`, value }));
      })(),
      formatoValor: "#,##0",
    },
  ]);

  if (promedio === null) {
    dash.aviso("Ninguna comanda del periodo se marcó como lista, así que no hay tiempos de "
      + "preparación que medir. El tiempo se calcula entre el momento en que se crea la comanda "
      + "y el momento en que se marca lista.");
  }
  dash.cerrar({});

  await reporte.tabla({
    nombre: "Comandas",
    subtitulo: "Detalle y tiempos",
    columnas: [
      { header: "Folio", key: "folio", ancho: 14 },
      { header: "Fecha", key: "fecha", formato: "fecha" },
      { header: "Mesa", key: "mesa", ancho: 18 },
      { header: "Mesero", key: "mesero", ancho: 24 },
      { header: "Hora solicitada", key: "horaSolicitada", ancho: 16 },
      { header: "Hora en preparación", key: "horaPreparacion", ancho: 18 },
      { header: "Hora lista", key: "horaLista", ancho: 14 },
      { header: "Minutos de preparación", key: "minutosPreparacion", formato: "decimal", vacio: "Sin medir" },
      { header: "Estado", key: "estado", ancho: 16 },
      { header: "Total", key: "total", formato: "moneda", total: true },
      { header: "Propina", key: "propina", formato: "moneda", total: true },
      { header: "Cobró", key: "cobradaPor", ancho: 22, vacio: "" },
    ],
    filas: ordenes.map((orden) => ({
      ...orden,
      horaSolicitada: horaTexto(orden.creada),
      horaPreparacion: horaTexto(orden.iniciada),
      horaLista: horaTexto(orden.lista),
    })),
  });

  return reporte.descargar(nombreArchivo(contexto, "Comandas"));
}

// Solo se re-exporta lo que este modulo define y el paquete administrativo
// reutiliza; lo demas se importa de su origen.
export { fechaDeCorte, filaCorteResumen };
