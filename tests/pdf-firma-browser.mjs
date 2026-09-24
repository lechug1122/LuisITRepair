// Comprueba, generando el PDF de verdad en un navegador, que la firma del
// cliente aparece en la hoja de servicio QUE YA EXISTIA -- y que sin firma el
// documento sale exactamente como siempre.
//
// Fuera de `npm test` (necesita navegador y servidor de desarrollo):
//
//   npm run dev
//   node tests/pdf-firma-browser.mjs
//
// Se lee el PDF generado y se busca el texto dentro: jsPDF no comprime los
// flujos de contenido con la configuracion de CajaLibre, asi que las cadenas
// son legibles en el archivo.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ||
  pathToFileURL(`${process.env.TEMP}/cajalibre-browser-tests/node_modules/playwright/index.mjs`).href
);

const BASE = process.env.CAJALIBRE_DEV_URL || "http://localhost:5173";

// PNG de 1x1 opaco: basta para comprobar que la imagen se incrusta.
const FIRMA_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SERVICIO = {
  folio: "SV-20260920-001",
  nombre: "Ana López",
  telefono: "5512345678",
  direccion: "Calle Falsa 123",
  tipoDispositivo: "laptop",
  marca: "Dell",
  modelo: "Inspiron 15",
  numeroSerie: "ABC123",
  trabajo: "Cambio de teclado",
  costo: "1850",
  hojaServicio: { habilitada: true, terminos: ["Respaldar datos antes de la intervencion."] },
};

const fallos = [];
const comprobar = (nombre, condicion) => {
  console.log(`  ${condicion ? "ok  " : "FALLO  "}${nombre}`);
  if (!condicion) fallos.push(nombre);
};

const browser = await chromium.launch({ headless: true });
const contexto = await browser.newContext({ acceptDownloads: true });
const pagina = await contexto.newPage();
const erroresConsola = [];

pagina.on("pageerror", (error) => erroresConsola.push(String(error)));
await pagina.goto(`${BASE}/status`, { waitUntil: "domcontentloaded" });

/** Genera el PDF en el navegador y devuelve su contenido como texto. */
async function generar(servicio) {
  const descarga = pagina.waitForEvent("download", { timeout: 30000 });

  await pagina.evaluate(async (datos) => {
    const modulo = await import("/src/js/services/pdf_hoja_servicio.js");
    window.__resultadoPdf = await modulo.generarPdfHojaServicio(datos, datos.folio, { download: true });
  }, servicio);

  const archivo = await (await descarga).path();
  const resultado = await pagina.evaluate(() => window.__resultadoPdf);
  return { texto: readFileSync(archivo, "latin1"), resultado };
}

console.log("PDF sin aceptacion registrada");
const sinFirma = await generar(SERVICIO);
comprobar("el PDF se genera", sinFirma.resultado?.ok === true);
comprobar("conserva la raya de firma del cliente", sinFirma.texto.includes("NOMBRE Y FIRMA DEL CLIENTE"));
comprobar("NO inventa una firma que no existe", !sinFirma.texto.includes("ACEPTADA DIGITALMENTE"));

console.log("PDF con la orden aceptada y firmada");
const conFirma = await generar({
  ...SERVICIO,
  aceptacion: {
    estado: "aceptado",
    version: 1,
    nombreCliente: "Ana Lopez",
    aceptoCondiciones: true,
    firmaDataUrl: FIRMA_PNG,
    fechaRespuesta: { seconds: 1758400000, nanoseconds: 0 },
  },
});

comprobar("el PDF se genera", conFirma.resultado?.ok === true);
comprobar("muestra que fue aceptada digitalmente", conFirma.texto.includes("ACEPTADA DIGITALMENTE"));
comprobar("muestra el nombre de quien acepto", conFirma.texto.includes("Ana Lopez"));
comprobar("conserva el bloque de firmas original", conFirma.texto.includes("NOMBRE Y FIRMA DEL CLIENTE"));
comprobar("incrusta la imagen de la firma", conFirma.texto.includes("/Image"));
comprobar("sigue siendo un solo documento", conFirma.resultado?.filename === "comprobante_SV-20260920-001.pdf");

console.log("PDF con una aceptacion todavia pendiente");
const pendiente = await generar({
  ...SERVICIO,
  aceptacion: { estado: "pendiente", version: 1, firmaDataUrl: FIRMA_PNG },
});
comprobar(
  "una solicitud sin responder NO pinta firma",
  !pendiente.texto.includes("ACEPTADA DIGITALMENTE"),
);

comprobar("sin errores de ejecucion", erroresConsola.length === 0);

await browser.close();

if (fallos.length) {
  console.error(`\n${fallos.length} comprobacion(es) fallidas:`);
  fallos.forEach((fallo) => console.error(` - ${fallo}`));
  process.exit(1);
}
console.log("\nEl PDF existente integra la firma correctamente.");
