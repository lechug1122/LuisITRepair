import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  construirExpedienteNegocio,
  filaProducto,
} from "../src/js/services/superadmin_expediente.js";
import { INVENTARIO_EXCEL_COLUMNS } from "../src/js/services/inventario_excel.js";

const negocio = {
  nombre: "Abarrotes La Tiendita",
  negocioId: "abc123",
  correo: "duenio@gmail.com",
  estado: "activo",
  tipoNegocioId: "abarrotes",
  setupCompleto: true,
  terminosAceptados: true,
  terminosVersion: "2026-07-22",
  telefono: "2731430147",
  conteos: { usuariosTotal: 4, usuariosActivos: 3, equiposTotal: 2 },
  plan: { etiqueta: "Premium", esPremium: true, renovacionAutomatica: false },
  actividad: { label: "Activo frecuente", dias: 0 },
  ultimoAccesoMs: Date.now(),
};

const productos = [
  { codigo: "P001", nombre: "Coca Cola 600ml", precioVenta: 22.5, precioCompra: 15, stock: 48 },
  { codigo: "P002", nombre: "Sabritas", precioVenta: "18", stock: "12", iva: 16 },
  { codigo: "P003", nombre: "Producto sin precios" },
];

async function abrirLibro(libro) {
  const buffer = await libro.xlsx.writeBuffer();
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(buffer);
  return leido;
}

test("el expediente incluye una pestaña de productos con el catalogo", async () => {
  const libro = construirExpedienteNegocio(ExcelJS, { negocio, productos });
  const leido = await abrirLibro(libro);

  const hoja = leido.getWorksheet("Productos");
  assert.ok(hoja, "falta la pestaña Productos");

  // Encabezados: los mismos que usa la exportacion de inventario del negocio.
  const encabezados = hoja.getRow(1).values.slice(1);
  assert.deepEqual(encabezados, INVENTARIO_EXCEL_COLUMNS.map((c) => c.label));

  assert.equal(hoja.rowCount, productos.length + 1);
  const primera = hoja.getRow(2);
  assert.equal(primera.getCell(1).value, "P001");
  assert.equal(primera.getCell(2).value, "Coca Cola 600ml");
});

test("las pestañas esperadas existen y ninguna es comercial", async () => {
  const libro = construirExpedienteNegocio(ExcelJS, { negocio, productos });
  const leido = await abrirLibro(libro);
  const nombres = leido.worksheets.map((hoja) => hoja.name);

  assert.deepEqual(nombres, [
    "Resumen", "Usuarios", "Plan", "Actividad",
    "Configuracion", "Productos", "Historial administrativo",
  ]);

  // Ninguna pestaña puede exponer la operacion comercial del negocio.
  const prohibidas = ["venta", "ingreso", "cliente", "fiado", "corte", "ticket"];
  nombres.forEach((nombre) => {
    prohibidas.forEach((palabra) => {
      assert.ok(!nombre.toLowerCase().includes(palabra), `${nombre} expone ${palabra}`);
    });
  });
});

test("los campos numericos se escriben como numero, no como texto", () => {
  const fila = filaProducto(productos[1]);
  assert.equal(fila.precioVenta, 18);
  assert.equal(typeof fila.precioVenta, "number");
  assert.equal(fila.stock, 12);
  assert.equal(fila.iva, 16);

  // Un producto sin precios no debe romper la hoja ni escribir NaN.
  const vacio = filaProducto(productos[2]);
  assert.equal(vacio.precioVenta, 0);
  assert.equal(vacio.stock, 0);
  assert.ok(Number.isFinite(vacio.precioCompra));
  assert.equal(vacio.categoria, "");
});

test("el resumen declara cuantos productos se incluyeron", async () => {
  const libro = construirExpedienteNegocio(ExcelJS, { negocio, productos });
  const leido = await abrirLibro(libro);
  const resumen = leido.getWorksheet("Resumen");

  const filas = [];
  resumen.eachRow((row) => filas.push(row.values.slice(1)));
  const conteo = filas.find((fila) => fila[0] === "Productos en catalogo");
  assert.ok(conteo, "el resumen no declara el catalogo");
  assert.equal(conteo[1], productos.length);
});

test("un catalogo recortado deja constancia en la hoja", async () => {
  const libro = construirExpedienteNegocio(ExcelJS, {
    negocio,
    productos,
    productosTruncados: true,
  });
  const leido = await abrirLibro(libro);
  const hoja = leido.getWorksheet("Productos");

  const ultima = hoja.getRow(hoja.rowCount);
  assert.match(String(ultima.getCell(2).value), /recortado/i);
});

test("un negocio sin productos genera la pestaña vacia sin fallar", async () => {
  const libro = construirExpedienteNegocio(ExcelJS, { negocio, productos: [] });
  const leido = await abrirLibro(libro);
  const hoja = leido.getWorksheet("Productos");
  assert.ok(hoja);
  assert.equal(hoja.rowCount, 1); // solo encabezados
});
