// ✅ Archivo: src/js/pdf_hoja_servicio.js
// Ruta Windows (solo referencia):
// C:\Users\luisc.WINDOWS_LUIS\Documents\hoja de servicios\hoja_service-app\src\js\pdf_hoja_servicio.js

import { jsPDF } from "jspdf";
import logoUrl from "../../assets/logo.png"; // ✅ viene de src/assets/logo.png (Vite lo sirve bien)

// ===============================
// Utilidades: imagen -> PNG real
// ===============================
async function detectarTipoImagen(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf.slice(0, 16));

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;

  // JPG: FF D8 FF
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  // WEBP: "RIFF" .... "WEBP"
  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (isPng) return "PNG";
  if (isJpg) return "JPEG";
  if (isWebp) return "WEBP";
  return "UNKNOWN";
}

async function fetchAsDataURL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  const blob = await res.blob();

  const tipo = await detectarTipoImagen(blob);

  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  return { dataUrl, tipo };
}

// Convierte cualquier imagen (png/jpg/webp) a PNG REAL usando canvas
async function convertirADataURLPNG(dataUrl) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = dataUrl;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("No se pudo cargar imagen en canvas"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  return canvas.toDataURL("image/png");
}

// ===============================
// Utilidades: folio
// ===============================
function generarFolio(marca) {
  const m = (marca || "").trim().toLowerCase();
  const letras = m.substring(0, 3);
  const fecha = new Date();
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const anio = String(fecha.getFullYear()).slice(-2);

  if (letras.length === 3) return `${letras}${dia}${mes}${anio}`;
  return `${dia}${mes}${anio}`;
}

// ===============================
// ✅ PDF Principal
// ===============================
export async function generarPdfHojaServicio(form) {
  try {
    const doc = new jsPDF();
    const folio = generarFolio(form.marca);

    // ===== Logo (a prueba de PNG/JPG/WEBP renombrado) =====
    let logoDataUrlPng = null;
    try {
      const { dataUrl, tipo } = await fetchAsDataURL(logoUrl);
      console.log("🖼️ Logo detectado como:", tipo);

      // ✅ Siempre lo convertimos a PNG real para jsPDF
      logoDataUrlPng = await convertirADataURLPNG(dataUrl);
    } catch (e) {
      console.warn("⚠️ Logo no cargado / no convertido:", e.message);
    }

    // ===== Borde general del documento =====
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.7);
    doc.rect(10, 10, 190, 285);

    // ===== Logo y encabezado =====
    if (logoDataUrlPng) {
      doc.addImage(logoDataUrlPng, "PNG", 15, 12, 32, 32);
    }

    // Título grande
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.text("Hoja De Servicio", 60, 30);

    // Fecha y hora
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const ahora = new Date();
    const fechaActual = ahora.toLocaleDateString();
    const horaActual = ahora.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    doc.text(`Fecha: ${fechaActual} ${horaActual}`, 150, 24);

    // ===== Layout =====
    let yInicio = 45;

    // ===============================
    // DATOS DEL CLIENTE
    // ===============================
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);

    doc.rect(15, yInicio, 180, 30);

    doc.setFillColor(28, 69, 135);
    doc.rect(15, yInicio, 180, 8, "F");

    doc.setTextColor(255, 255, 255);
    doc.text("DATOS DEL CLIENTE", 20, yInicio + 6);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    let yTexto = yInicio + 14;
    doc.text(`Nombre: ${form.nombre || "-"}`, 20, yTexto);
    doc.text(`Dirección: ${form.direccion || "-"}`, 20, yTexto + 6);
    doc.text(`Teléfono: ${form.telefono || "-"}`, 20, yTexto + 12);

    // ===============================
    // DATOS DEL EQUIPO
    // ===============================
    let y = yInicio + 35;

    doc.rect(15, y, 180, 20);

    doc.setFillColor(28, 69, 135);
    doc.rect(15, y, 180, 8, "F");

    doc.setTextColor(255, 255, 255);
    doc.text("DATOS DEL EQUIPO", 20, y + 6);

    doc.setTextColor(0, 0, 0);
    doc.text(`Tipo: ${form.tipoDispositivo || "-"}`, 20, y + 12);
    doc.text(`Marca: ${form.marca || "-"}`, 80, y + 12);
    doc.text(`Modelo: ${form.modelo || "-"}`, 140, y + 12);
    doc.text(`Folio: ${folio || "-"}`, 20, y + 18);

    y += 25;

    // ===============================
    // CAMPOS ESPECÍFICOS SEGÚN TIPO
    // ===============================
    if (form.tipoDispositivo === "laptop" || form.tipoDispositivo === "pc") {
      doc.rect(15, y, 180, 32);

      doc.setFillColor(28, 69, 135);
      doc.rect(15, y, 180, 8, "F");

      doc.setTextColor(255, 255, 255);
      doc.text("CARACTERÍSTICAS", 20, y + 6);

      doc.setTextColor(0, 0, 0);
      doc.text(`Procesador: ${form.procesador || "-"}`, 20, y + 12);
      doc.text(`RAM: ${form.ram || "-"}`, 80, y + 12);
      doc.text(`Disco: ${form.disco || "-"}`, 140, y + 12);

      doc.text(`Estado de pantalla: ${form.estadoPantalla || "-"}`, 20, y + 18);
      doc.text(`Estado de Teclado: ${form.estadoTeclado || "-"}`, 80, y + 18);
      doc.text(`Estado de Mouse: ${form.estadoMouse || "-"}`, 140, y + 18);

      doc.text(`¿Enciende?: ${form.enciendeEquipo || "-"}`, 20, y + 24);
      doc.text(`¿Funciona?: ${form.funciona || "-"}`, 80, y + 24);
      doc.text(`Contraseña del equipo: ${form.contrasenaEquipo || "-"}`, 140, y + 24);

      y += 37;
    } else if (form.tipoDispositivo === "impresora") {
      doc.rect(15, y, 180, 20);

      doc.setFillColor(28, 69, 135);
      doc.rect(15, y, 180, 8, "F");

      doc.setTextColor(255, 255, 255);
      doc.text("IMPRESORA", 20, y + 6);

      doc.setTextColor(0, 0, 0);
      doc.text(`Tipo: ${form.tipoImpresora || "-"}`, 20, y + 12);
      doc.text(`¿Imprime?: ${form.imprime || "-"}`, 80, y + 12);
      doc.text(`Condiciones: ${form.condicionesImpresora || "-"}`, 20, y + 18);

      y += 25;
    } else if (form.tipoDispositivo === "monitor") {
      doc.rect(15, y, 180, 20);

      doc.setFillColor(28, 69, 135);
      doc.rect(15, y, 180, 8, "F");

      doc.setTextColor(255, 255, 255);
      doc.text("MONITOR", 20, y + 6);

      doc.setTextColor(0, 0, 0);
      doc.text(`Tamaño: ${form.tamanoMonitor || "-"}`, 20, y + 12);
      doc.text(`¿Colores correctos?: ${form.colores || "-"}`, 80, y + 12);
      doc.text(`Condiciones: ${form.condicionesMonitor || "-"}`, 20, y + 18);

      y += 25;
    }

    // ===============================
    // TRABAJO Y COSTO
    // ===============================
    doc.rect(15, y, 180, 16);

    doc.setFillColor(28, 69, 135);
    doc.rect(15, y, 180, 8, "F");

    doc.setTextColor(255, 255, 255);
    doc.text("TRABAJO Y COSTO", 20, y + 6);

    doc.setTextColor(0, 0, 0);
    doc.text(`Trabajo: ${form.trabajo || "-"}`, 20, y + 12);

    if (form.precioDespues) {
      doc.text("Costo Estimado: El precio se da después del mantenimiento", 120, y + 12);
    } else {
      doc.text(`Costo Estimado: $${form.costo || "-"}`, 120, y + 12);
    }

    // ===============================
    // TÉRMINOS Y CONDICIONES
    // ===============================
    y += 20;
    doc.setFontSize(10);
    doc.setDrawColor(63, 135, 166);
    doc.setLineWidth(0.5);

    doc.rect(15, y, 180, 110);

    doc.setFillColor(63, 135, 166);
    doc.rect(15, y, 180, 12, "F");

    doc.setTextColor(255, 255, 255);
    doc.text("Términos y Condiciones", 20, y + 9);

    doc.setTextColor(0, 0, 0);

    const texto = [
      "Copia de seguridad de datos: El proveedor recomienda al Cliente realizar copias de seguridad de todos los datos almacenados en sus equipos antes de la intervención. El proveedor no se hace responsable de la pérdida de datos, programas o configuraciones.",
      "Garantía de reparación: El proveedor se compromete a realizar su mejor esfuerzo para la resolución de los problemas, dependiendo de su naturaleza. La garantía de reparación se limita a los trabajos efectuados.",
      "Limitación de responsabilidad: El proveedor no será responsable por fallas en el equipo o software derivadas de factores externos como virus, uso indebido, uso por parte del cliente, modificaciones realizadas por el cliente o causas ajenas a su control.",
      "Presupuesto y autorización: El presupuesto presentado al cliente será válido por un tiempo determinado. Ningún trabajo será realizado sin la autorización del cliente.",
      "Tiempo de entrega: El tiempo de entrega estimado será informado al cliente, pudiendo variar según la complejidad de la reparación.",
      "Revisión posterior: El cliente se compromete a revisar el equipo en el momento de la entrega para verificar el correcto funcionamiento.",
      "Garantía de los trabajos: Los trabajos de reparación realizados tendrán una garantía limitada que será especificada en el comprobante de servicio. Esta garantía no cubre daños ocasionados por manipulación indebida, virus, golpes, caídas, líquidos u otros eventos externos que afecten al equipo.",
    ];

    let ty = y + 16;
    texto.forEach((t) => {
      const lines = doc.splitTextToSize(t, 172);
      doc.text(lines, 18, ty);
      ty += doc.getTextDimensions(lines).h + 4;
    });

    // ===============================
    // FIRMAS
    // ===============================
    y += 115;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);

    doc.rect(15, y, 85, 15);
    doc.rect(110, y, 85, 15);

    doc.text("NOMBRE Y FIRMA DEL TÉCNICO:", 20, y + 6);
    doc.text("NOMBRE Y FIRMA DEL CLIENTE:", 115, y + 6);

    // ✅ Guardar PDF
    doc.save(`comprobante_${folio}.pdf`);
  } catch (err) {
    console.error("Error generando PDF:", err);
    alert("Error generando PDF. Revisa consola (F12).");
  }
}
