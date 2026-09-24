// ---------------------------------------------------------------------------
// Plantilla visual unica de los Excel de CajaLibre.
//
// Todos los reportes -- Free y Premium -- se construyen con este kit. El
// objetivo es que el plan cambie QUE informacion se entrega, nunca como se ve:
// un reporte gratuito debe verse igual de profesional que uno pagado.
//
// El modulo no sabe nada de Firestore ni de React. Recibe datos ya calculados
// y devuelve un archivo. Asi la misma plantilla sirve para cualquier reporte
// nuevo sin volver a resolver encabezados, formatos ni graficas.
// ---------------------------------------------------------------------------

import { injectCharts, columnLetter } from "./excel_charts.js";

// Identidad visual. Azul marino y turquesa como colores de estructura, ambar
// solo como acento: un reporte lleno de colores deja de leerse.
export const TEMA = {
  navy: "FF0F2A44",
  navyMedio: "FF1E5F8C",
  turquesa: "FF17B3A3",
  ambar: "FFF5B301",
  blanco: "FFFFFFFF",
  texto: "FF1F2D3D",
  textoSuave: "FF64748B",
  borde: "FFE2E8F0",
  bordeSuave: "FFEEF2F7",
  fondo: "FFF7F9FC",
  fondoAlterno: "FFFCFDFE",
  tarjeta: "FFF1F6FA",
  positivo: "FF0E9F6E",
  negativo: "FFDC2626",
};

// Formatos numericos de Excel. Se guardan los valores como numeros y fechas
// reales y es el formato el que los presenta: asi el usuario puede sumar,
// filtrar y hacer tablas dinamicas sobre el reporte.
export const FORMATO = {
  moneda: '$#,##0.00;[Red]-$#,##0.00',
  monedaEntera: '$#,##0;[Red]-$#,##0',
  cantidad: "#,##0",
  decimal: "#,##0.00",
  porcentaje: "0.0%",
  // El signo y el color de la variacion salen del formato, no de un texto:
  // el valor sigue siendo un numero que Excel puede graficar.
  variacion: '"▲ "0.0%;[Red]"▼ "0.0%;"— "0.0%',
  fecha: "dd/mm/yyyy",
  fechaHora: "dd/mm/yyyy hh:mm",
  hora: "hh:mm",
  texto: null,
};

const ANCHO_COLUMNAS_DASHBOARD = 12;
const COLUMNAS_DASHBOARD = 12;

const NUMERO_FORMATOS = new Set(["moneda", "monedaEntera", "cantidad", "decimal", "porcentaje", "variacion"]);
const FECHA_FORMATOS = new Set(["fecha", "fechaHora", "hora"]);

/** Numero utilizable o 0. Evita que un NaN llegue a una celda. */
export function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Fecha utilizable o null. Acepta Timestamp de Firestore, Date, ms o texto. */
export function aFecha(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === "function") {
    try {
      const fecha = valor.toDate();
      return Number.isNaN(fecha.getTime()) ? null : fecha;
    } catch {
      return null;
    }
  }
  if (typeof valor?.seconds === "number") return new Date(valor.seconds * 1000);
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Texto seguro para una celda.
 *
 * Nunca debe llegar al archivo "undefined", "null", "NaN" ni
 * "[object Object]": son fugas del programa, no informacion del negocio.
 */
export function textoSeguro(valor, vacio = "N/A") {
  if (valor === null || valor === undefined) return vacio;
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : vacio;
  if (typeof valor === "boolean") return valor ? "Si" : "No";
  if (typeof valor === "object") {
    const fecha = aFecha(valor);
    if (fecha) return fecha.toLocaleString("es-MX");
    return vacio;
  }
  const texto = String(valor).trim();
  if (!texto || texto === "undefined" || texto === "null" || texto === "NaN") return vacio;
  return texto;
}

/** Variacion relativa entre dos periodos, o null si no hay base comparable. */
export function variacion(actual, anterior) {
  const base = numero(anterior);
  if (base === 0) return null;
  return (numero(actual) - base) / Math.abs(base);
}

/** Quita acentos y caracteres que Windows no acepta en un nombre de archivo. */
export function limpiarNombreArchivo(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "Reporte";
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const dosDigitos = (valor) => String(valor).padStart(2, "0");

/** dd-mm-yyyy, el formato que llevan los nombres de archivo. */
function fechaArchivo(fecha) {
  return dosDigitos(fecha.getDate()) + "-" + dosDigitos(fecha.getMonth() + 1) + "-" + fecha.getFullYear();
}

/** dd/mm/yyyy para mostrar dentro del reporte. */
export function fechaLegible(valor) {
  const fecha = aFecha(valor);
  if (!fecha) return "N/A";
  return dosDigitos(fecha.getDate()) + "/" + dosDigitos(fecha.getMonth() + 1) + "/" + fecha.getFullYear();
}

/**
 * Nombre de archivo profesional y sin ambiguedad.
 *
 * Cuando el periodo es un mes natural completo se usa "Septiembre_2026", que
 * es como la gente nombra sus reportes; en cualquier otro caso van las dos
 * fechas, porque "Septiembre" seria mentira para un rango parcial.
 */
export function generarNombreArchivo({ slug, extra = "", desde = null, hasta = null } = {}) {
  const partes = ["CajaLibre", limpiarNombreArchivo(slug)];
  // `extra` solo se usa cuando el reporte es de un sujeto concreto, como el
  // estado de cuenta de un cliente. El nombre del negocio no entra: la persona
  // ya sabe de que negocio es su reporte y alargaria todos los archivos.
  const complemento = extra ? limpiarNombreArchivo(extra) : "";
  if (complemento && complemento !== "Reporte") partes.push(complemento);

  const inicio = aFecha(desde);
  const fin = aFecha(hasta);

  if (inicio && fin) {
    const mismoMes = inicio.getFullYear() === fin.getFullYear() && inicio.getMonth() === fin.getMonth();
    const cubreMes = mismoMes
      && inicio.getDate() === 1
      && fin.getDate() === new Date(fin.getFullYear(), fin.getMonth() + 1, 0).getDate();
    partes.push(cubreMes
      ? MESES[inicio.getMonth()] + "_" + inicio.getFullYear()
      : fechaArchivo(inicio) + "_" + fechaArchivo(fin));
  } else {
    partes.push(fechaArchivo(new Date()));
  }

  return partes.join("_") + ".xlsx";
}

/** Etiqueta del periodo tal como se lee en el encabezado. */
export function etiquetaPeriodo(desde, hasta) {
  const inicio = aFecha(desde);
  const fin = aFecha(hasta);
  if (!inicio && !fin) return "Toda la informacion registrada";
  if (inicio && fin) {
    if (fechaLegible(inicio) === fechaLegible(fin)) return fechaLegible(inicio);
    return fechaLegible(inicio) + " al " + fechaLegible(fin);
  }
  return inicio ? "Desde " + fechaLegible(inicio) : "Hasta " + fechaLegible(fin);
}

// Excel corta los nombres de hoja a 31 caracteres y prohibe : \ / ? * [ ].
// Ademas dos hojas no pueden llamarse igual, asi que se desambigua con un
// sufijo antes de que ExcelJS lance un error a media generacion.
function nombreHojaSeguro(nombre, usados) {
  const base = String(nombre || "Hoja")
    .replace(/[:\\/?*[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Hoja";

  if (!usados.has(base)) {
    usados.add(base);
    return base;
  }

  for (let indice = 2; indice < 100; indice += 1) {
    const sufijo = " " + indice;
    const candidato = base.slice(0, 31 - sufijo.length) + sufijo;
    if (!usados.has(candidato)) {
      usados.add(candidato);
      return candidato;
    }
  }
  return base.slice(0, 28) + Math.floor(Math.random() * 900 + 100);
}

function aplicarRelleno(celda, color) {
  celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function bordeFino(color = TEMA.borde) {
  return { style: "thin", color: { argb: color } };
}

/**
 * Escribe un valor respetando su tipo.
 *
 * Es la unica puerta por la que pasan los datos hacia una celda, y por eso es
 * el lugar donde se garantiza la regla de todo el kit: los numeros entran como
 * numeros y las fechas como fechas; solo el texto entra como texto.
 */
// Objetos de estilo compartidos.
//
// ExcelJS guarda la REFERENCIA que se le asigna a cada celda, asi que crear un
// objeto nuevo por celda solo multiplica el trabajo del recolector de basura.
// Una tabla de veinte columnas y cincuenta mil filas son un millon de celdas:
// con objetos nuevos por celda la generacion pasaba de veinte segundos, y
// compartiendo estas constantes baja a unos pocos.
const ALINEACION = {
  derecha: Object.freeze({ vertical: "middle", horizontal: "right" }),
  centro: Object.freeze({ vertical: "middle", horizontal: "center" }),
  izquierda: Object.freeze({ vertical: "middle", horizontal: "left" }),
  normal: Object.freeze({ vertical: "middle", wrapText: false }),
};

function escribirValor(celda, valor, formato, vacio = "N/A") {
  const tipo = formato || "texto";

  if (NUMERO_FORMATOS.has(tipo)) {
    celda.value = numero(valor);
    celda.numFmt = FORMATO[tipo];
    celda.alignment = ALINEACION.derecha;
    return;
  }

  if (FECHA_FORMATOS.has(tipo)) {
    const fecha = aFecha(valor);
    if (fecha) {
      celda.value = fecha;
      celda.numFmt = FORMATO[tipo];
    } else {
      celda.value = vacio;
    }
    celda.alignment = ALINEACION.centro;
    return;
  }

  celda.value = textoSeguro(valor, vacio);
  celda.alignment = ALINEACION.normal;
}

/**
 * Crea un reporte nuevo.
 *
 * Devuelve un constructor con las piezas que comparten todos los reportes.
 * Quien lo usa decide el contenido; el aspecto ya viene resuelto.
 */
export async function crearReporte({
  // Nombre del reporte tal como debe leerse en el encabezado.
  titulo,
  // Nombre comercial del negocio.
  negocio = "CajaLibre",
  // Etiqueta del periodo ya formateada.
  periodo = "",
  // Quien genero el reporte (opcional).
  usuario = "",
  // Datos opcionales del encabezado: RFC, sucursal, razon social.
  rfc = "",
  sucursal = "",
  // Logo a usar, ya resuelto por quien llama (data URL o URL).
  logo = "",
  // Etiqueta de plan que se muestra discretamente en el pie.
  plan = "",
} = {}) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const generadoEn = new Date();

  workbook.creator = negocio || "CajaLibre";
  workbook.lastModifiedBy = "CajaLibre";
  workbook.created = generadoEn;
  workbook.modified = generadoEn;
  workbook.subject = titulo;
  workbook.company = negocio;
  workbook.properties.date1904 = false;

  const nombresUsados = new Set();
  const graficas = [];
  let hojaDatos = null;
  let columnaDatos = 0;
  let logoId = null;
  let logoResuelto = false;

  // El logo se descarga una sola vez aunque aparezca en varias hojas.
  async function obtenerLogoId() {
    if (logoResuelto) return logoId;
    logoResuelto = true;
    const origen = String(logo || "").trim();
    if (!origen) return null;
    try {
      const respuesta = await fetch(origen);
      const buffer = await respuesta.arrayBuffer();
      const extension = /^data:image\/jpe?g/i.test(origen) || /\.jpe?g($|\?)/i.test(origen)
        ? "jpeg"
        : "png";
      logoId = workbook.addImage({ buffer, extension });
    } catch (error) {
      // Un logo que no carga no puede impedir el reporte.
      console.warn("[reportes] No se pudo incorporar el logo:", error);
      logoId = null;
    }
    return logoId;
  }

  /** Hoja oculta con los datos que alimentan las graficas nativas. */
  function asegurarHojaDatos() {
    if (hojaDatos) return hojaDatos;
    hojaDatos = workbook.addWorksheet(nombreHojaSeguro("Datos graficas", nombresUsados));
    // Oculta para no competir con el reporte, pero no "veryHidden": quien
    // quiera revisar el origen de una grafica puede mostrarla desde Excel.
    hojaDatos.state = "hidden";
    return hojaDatos;
  }

  /**
   * Registra una grafica: guarda sus datos en la hoja oculta y anota donde
   * debe dibujarse. El archivo final las inyecta todas de una vez.
   */
  function registrarGrafica({ tipo, titulo: tituloGrafica, datos, series, hoja, desde, hasta, formatoValor, leyenda }) {
    const categorias = datos.map((punto) => textoSeguro(punto.label, "Sin dato"));
    if (!categorias.length) return false;

    const listaSeries = series && series.length
      ? series
      : [{ nombre: tituloGrafica, valores: datos.map((punto) => numero(punto.value)) }];

    const sheet = asegurarHojaDatos();
    const columnaCategoria = columnLetter(columnaDatos);
    const encabezados = ["Concepto", ...listaSeries.map((serie) => textoSeguro(serie.nombre, "Valor"))];

    encabezados.forEach((encabezado, indice) => {
      sheet.getCell(1, columnaDatos + 1 + indice).value = encabezado;
    });
    categorias.forEach((categoria, fila) => {
      sheet.getCell(fila + 2, columnaDatos + 1).value = categoria;
      listaSeries.forEach((serie, indiceSerie) => {
        sheet.getCell(fila + 2, columnaDatos + 2 + indiceSerie).value = numero(serie.valores[fila]);
      });
    });

    const seriesResueltas = listaSeries.map((serie, indice) => ({
      nombre: textoSeguro(serie.nombre, "Valor"),
      valores: categorias.map((_, fila) => numero(serie.valores[fila])),
      columna: columnLetter(columnaDatos + 1 + indice),
    }));

    // Una columna en blanco separa los datos de una grafica de la siguiente.
    columnaDatos += listaSeries.length + 2;

    graficas.push({
      tipo,
      titulo: tituloGrafica,
      categorias,
      series: seriesResueltas,
      sheetName: sheet.name,
      categoryColumn: columnaCategoria,
      valueFormat: formatoValor || FORMATO.monedaEntera,
      mostrarLeyenda: leyenda,
      sheetTarget: hoja,
      desde,
      hasta,
    });
    return true;
  }

  /** Banda de encabezado. Identica en todas las hojas del reporte. */
  async function pintarEncabezado(sheet, { subtitulo = "", compacto = false } = {}) {
    const filas = compacto ? 4 : 6;
    const ultimaColumna = columnLetter(COLUMNAS_DASHBOARD - 1);

    for (let fila = 1; fila <= filas; fila += 1) {
      const row = sheet.getRow(fila);
      row.height = compacto ? 16 : 17;
      for (let col = 1; col <= COLUMNAS_DASHBOARD; col += 1) {
        aplicarRelleno(row.getCell(col), TEMA.navy);
      }
    }

    const idLogo = await obtenerLogoId();
    if (idLogo !== null && idLogo !== undefined) {
      sheet.addImage(idLogo, {
        tl: { col: 0.35, row: compacto ? 0.55 : 1.1 },
        ext: { width: 74, height: 58 },
        editAs: "oneCell",
      });
    }

    const colTexto = idLogo !== null && idLogo !== undefined ? "C" : "A";
    const filaMarca = compacto ? 1 : 2;

    sheet.mergeCells(colTexto + filaMarca + ":H" + filaMarca);
    const marca = sheet.getCell(colTexto + filaMarca);
    marca.value = "C A J A L I B R E";
    marca.font = { name: "Calibri", bold: true, size: 10, color: { argb: TEMA.ambar } };
    marca.alignment = { vertical: "middle" };

    sheet.mergeCells(colTexto + (filaMarca + 1) + ":H" + (filaMarca + 1));
    const cabecera = sheet.getCell(colTexto + (filaMarca + 1));
    cabecera.value = String(titulo || "Reporte").toUpperCase();
    cabecera.font = { name: "Calibri", bold: true, size: compacto ? 15 : 18, color: { argb: TEMA.blanco } };
    cabecera.alignment = { vertical: "middle" };

    sheet.mergeCells(colTexto + (filaMarca + 2) + ":H" + (filaMarca + 2));
    const negocioCelda = sheet.getCell(colTexto + (filaMarca + 2));
    negocioCelda.value = textoSeguro(negocio, "Negocio sin nombre")
      + (subtitulo ? "  ·  " + subtitulo : "");
    negocioCelda.font = { name: "Calibri", size: 10.5, color: { argb: "FFCBD9E6" } };
    negocioCelda.alignment = { vertical: "middle" };

    // Bloque derecho: periodo, generacion y los datos fiscales que existan.
    const derecha = [
      periodo ? "Periodo:  " + periodo : "",
      "Generado:  " + fechaLegible(generadoEn) + " " + generadoEn.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      [
        rfc ? "RFC: " + textoSeguro(rfc, "") : "",
        sucursal ? "Sucursal: " + textoSeguro(sucursal, "") : "",
        usuario ? "Generó: " + textoSeguro(usuario, "") : "",
      ].filter(Boolean).join("   ·   "),
    ].filter(Boolean);

    derecha.slice(0, compacto ? 2 : 3).forEach((linea, indice) => {
      const fila = filaMarca + indice;
      sheet.mergeCells("I" + fila + ":" + ultimaColumna + fila);
      const celda = sheet.getCell("I" + fila);
      celda.value = linea;
      celda.font = { name: "Calibri", size: 9.5, color: { argb: "FFB6C8D8" } };
      celda.alignment = { vertical: "middle", horizontal: "right" };
    });

    // Filo turquesa que cierra la banda y la separa del contenido.
    const filaFilo = filas;
    for (let col = 1; col <= COLUMNAS_DASHBOARD; col += 1) {
      aplicarRelleno(sheet.getRow(filaFilo).getCell(col), TEMA.turquesa);
    }
    sheet.getRow(filaFilo).height = 3.5;

    return filas + 2;
  }

  /** Pie discreto. La marca acompaña al reporte, no compite con los datos. */
  function pintarPie(sheet, fila, { nota = "" } = {}) {
    const ultimaColumna = columnLetter(COLUMNAS_DASHBOARD - 1);

    if (nota) {
      sheet.mergeCells("A" + fila + ":" + ultimaColumna + (fila + 1));
      const celdaNota = sheet.getCell("A" + fila);
      celdaNota.value = nota;
      celdaNota.font = { name: "Calibri", italic: true, size: 9, color: { argb: TEMA.textoSuave } };
      celdaNota.alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
      aplicarRelleno(celdaNota, TEMA.fondo);
      sheet.getRow(fila).height = 15;
      sheet.getRow(fila + 1).height = 15;
      fila += 3;
    }

    sheet.mergeCells("A" + fila + ":" + ultimaColumna + fila);
    const celda = sheet.getCell("A" + fila);
    celda.value = "Generado por CajaLibre  ·  " + fechaLegible(generadoEn) + " "
      + generadoEn.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
      + "  ·  Información para uso administrativo"
      + (plan ? "  ·  Plan " + plan : "");
    celda.font = { name: "Calibri", size: 8.5, color: { argb: TEMA.textoSuave } };
    celda.alignment = { vertical: "middle", horizontal: "center" };
    celda.border = { top: bordeFino(TEMA.borde) };
    sheet.getRow(fila).height = 18;
    return fila + 1;
  }

  /**
   * Hoja tipo dashboard: tarjetas, secciones, graficas y bloques de datos.
   *
   * Lleva su propio cursor de fila para que quien la use no tenga que contar
   * filas a mano ni recalcular posiciones al agregar una seccion nueva.
   */
  async function dashboard({ nombre = "Dashboard", subtitulo = "" } = {}) {
    const sheet = workbook.addWorksheet(nombreHojaSeguro(nombre, nombresUsados), {
      views: [{ showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.properties.defaultRowHeight = 16;
    sheet.columns = Array.from({ length: COLUMNAS_DASHBOARD }, () => ({ width: ANCHO_COLUMNAS_DASHBOARD }));

    let fila = await pintarEncabezado(sheet, { subtitulo });

    const api = {
      sheet,
      get fila() { return fila; },
      espacio(alto = 1) {
        fila += alto;
        return api;
      },

      /** Titulo de seccion: da jerarquia sin recurrir a encabezados enormes. */
      seccion(texto, descripcion = "") {
        sheet.mergeCells("A" + fila + ":" + columnLetter(COLUMNAS_DASHBOARD - 1) + fila);
        const celda = sheet.getCell("A" + fila);
        celda.value = String(texto || "").toUpperCase();
        celda.font = { name: "Calibri", bold: true, size: 11, color: { argb: TEMA.navy } };
        celda.alignment = { vertical: "middle" };
        celda.border = { bottom: bordeFino(TEMA.turquesa) };
        sheet.getRow(fila).height = 20;
        fila += 1;

        if (descripcion) {
          sheet.mergeCells("A" + fila + ":" + columnLetter(COLUMNAS_DASHBOARD - 1) + fila);
          const sub = sheet.getCell("A" + fila);
          sub.value = descripcion;
          sub.font = { name: "Calibri", size: 9.5, italic: true, color: { argb: TEMA.textoSuave } };
          sub.alignment = { vertical: "middle" };
          sheet.getRow(fila).height = 15;
          fila += 1;
        }
        fila += 1;
        return api;
      },

      /**
       * Tarjetas de indicador, cuatro por renglon.
       *
       * Cada tarjeta ocupa tres columnas y tres filas: etiqueta pequeña, cifra
       * grande y variacion. La cifra se guarda como numero con formato, no
       * como texto, para que siga siendo un dato y no una imagen del dato.
       */
        tarjetas(lista = []) {
        const items = lista.filter(Boolean);
        if (!items.length) return api;

        for (let inicio = 0; inicio < items.length; inicio += 4) {
          const grupo = items.slice(inicio, inicio + 4);
          const filaEtiqueta = fila;
          const filaValor = fila + 1;
          const filaVariacion = fila + 2;

          sheet.getRow(filaEtiqueta).height = 16;
          sheet.getRow(filaValor).height = 26;
          sheet.getRow(filaVariacion).height = 15;

          grupo.forEach((tarjeta, indice) => {
            const colInicio = indice * 3 + 1;
            const colFin = colInicio + 2;
            const letraInicio = columnLetter(colInicio - 1);
            const letraFin = columnLetter(colFin - 1);
            const acento = tarjeta.acento || [TEMA.navyMedio, TEMA.turquesa, TEMA.ambar, TEMA.navy][indice % 4];

            // Fondo y borde de la tarjeta, celda por celda: un relleno sobre
            // un rango combinado no permite marcar solo el filo superior.
            for (let f = filaEtiqueta; f <= filaVariacion; f += 1) {
              for (let c = colInicio; c <= colFin; c += 1) {
                const celda = sheet.getRow(f).getCell(c);
                aplicarRelleno(celda, TEMA.tarjeta);
                // Solo los filos reales de la tarjeta llevan borde; pasar
                // lados en `undefined` hace que ExcelJS escriba un borde vacio.
                const borde = {};
                if (f === filaEtiqueta) borde.top = { style: "medium", color: { argb: acento } };
                if (f === filaVariacion) borde.bottom = bordeFino(TEMA.borde);
                if (c === colInicio) borde.left = bordeFino(TEMA.borde);
                if (c === colFin) borde.right = bordeFino(TEMA.borde);
                celda.border = borde;
              }
            }

            sheet.mergeCells(letraInicio + filaEtiqueta + ":" + letraFin + filaEtiqueta);
            const etiqueta = sheet.getCell(letraInicio + filaEtiqueta);
            etiqueta.value = String(tarjeta.etiqueta || "").toUpperCase();
            etiqueta.font = { name: "Calibri", bold: true, size: 8.5, color: { argb: TEMA.textoSuave } };
            etiqueta.alignment = { vertical: "middle", horizontal: "center" };

            sheet.mergeCells(letraInicio + filaValor + ":" + letraFin + filaValor);
            const valor = sheet.getCell(letraInicio + filaValor);
            if (tarjeta.formato === "texto" || tarjeta.formato === undefined && typeof tarjeta.valor === "string") {
              valor.value = textoSeguro(tarjeta.valor, "N/A");
            } else {
              escribirValor(valor, tarjeta.valor, tarjeta.formato || "cantidad");
            }
            valor.font = { name: "Calibri", bold: true, size: 15, color: { argb: TEMA.navy } };
            valor.alignment = { vertical: "middle", horizontal: "center" };

            sheet.mergeCells(letraInicio + filaVariacion + ":" + letraFin + filaVariacion);
            const pie = sheet.getCell(letraInicio + filaVariacion);
            if (Number.isFinite(tarjeta.variacion)) {
              pie.value = numero(tarjeta.variacion);
              pie.numFmt = FORMATO.variacion;
              pie.font = {
                name: "Calibri",
                bold: true,
                size: 9,
                color: { argb: tarjeta.variacion >= 0 ? TEMA.positivo : TEMA.negativo },
              };
            } else {
              pie.value = textoSeguro(tarjeta.detalle, "");
              pie.font = { name: "Calibri", size: 9, color: { argb: TEMA.textoSuave } };
            }
            pie.alignment = { vertical: "middle", horizontal: "center" };
          });

          fila += 4;
        }
        return api;
      },

      /**
       * Bloque de pares concepto/valor. Sirve para resumenes ejecutivos donde
       * una tabla completa seria excesiva.
       */
      datos(lista = [], { columnas = 2 } = {}) {
        const items = lista.filter(Boolean);
        if (!items.length) return api;

        const anchoBloque = Math.floor(COLUMNAS_DASHBOARD / columnas);
        let indiceFila = 0;

        items.forEach((item, indice) => {
          const posicion = indice % columnas;
          if (posicion === 0) indiceFila = fila + Math.floor(indice / columnas);

          const colInicio = posicion * anchoBloque + 1;
          const colValor = colInicio + anchoBloque - 2;
          const row = sheet.getRow(indiceFila);
          row.height = 18;

          sheet.mergeCells(
            columnLetter(colInicio - 1) + indiceFila + ":" + columnLetter(colValor - 2) + indiceFila,
          );
          const etiqueta = sheet.getCell(columnLetter(colInicio - 1) + indiceFila);
          etiqueta.value = textoSeguro(item.etiqueta, "");
          etiqueta.font = { name: "Calibri", size: 10, color: { argb: TEMA.texto } };
          etiqueta.alignment = { vertical: "middle" };

          sheet.mergeCells(
            columnLetter(colValor - 1) + indiceFila + ":" + columnLetter(colInicio + anchoBloque - 2) + indiceFila,
          );
          const valor = sheet.getCell(columnLetter(colValor - 1) + indiceFila);
          escribirValor(valor, item.valor, item.formato || "texto", item.vacio ?? "N/A");
          valor.font = { name: "Calibri", bold: true, size: 10, color: { argb: TEMA.navy } };
          valor.alignment = { vertical: "middle", horizontal: "right" };

          // Franjas muy suaves: la lectura se guia por la alternancia, no por
          // lineas marcadas en cada celda.
          const tono = Math.floor(indice / columnas) % 2 ? TEMA.blanco : TEMA.fondo;
          for (let c = colInicio; c < colInicio + anchoBloque; c += 1) {
            aplicarRelleno(row.getCell(c), tono);
          }
          etiqueta.border = { bottom: bordeFino(TEMA.bordeSuave) };
          valor.border = { bottom: bordeFino(TEMA.bordeSuave) };
        });

        fila += Math.ceil(items.length / columnas) + 1;
        return api;
      },

      /**
       * Graficas del dashboard, de dos en dos.
       *
       * Se aceptan varias en una llamada para que queden alineadas entre si;
       * una grafica sin datos simplemente no se dibuja, en lugar de dejar un
       * marco vacio que el usuario no sabe interpretar.
       */
      graficas(lista = [], { alto = 15 } = {}) {
        const utiles = (lista || []).filter((grafica) => grafica && (grafica.datos || []).length);
        if (!utiles.length) return api;

        for (let inicio = 0; inicio < utiles.length; inicio += 2) {
          const grupo = utiles.slice(inicio, inicio + 2);
          const anchoGrafica = grupo.length === 1 ? COLUMNAS_DASHBOARD : COLUMNAS_DASHBOARD / 2;

          grupo.forEach((grafica, indice) => {
            registrarGrafica({
              tipo: grafica.tipo || "columna",
              titulo: grafica.titulo || "",
              datos: grafica.datos,
              series: grafica.series,
              formatoValor: grafica.formatoValor,
              leyenda: grafica.leyenda,
              hoja: sheet.name,
              // Los anclajes van en base cero, a diferencia de las filas de
              // ExcelJS, que empiezan en uno.
              desde: { col: indice * anchoGrafica, row: fila - 1 },
              hasta: { col: indice * anchoGrafica + anchoGrafica, row: fila - 1 + alto },
            });
          });

          for (let f = fila; f < fila + alto; f += 1) {
            sheet.getRow(f).height = 16;
          }
          fila += alto + 1;
        }
        return api;
      },

      /** Aviso o aclaracion legal dentro del dashboard. */
      aviso(texto) {
        if (!texto) return api;
        sheet.mergeCells("A" + fila + ":" + columnLetter(COLUMNAS_DASHBOARD - 1) + (fila + 1));
        const celda = sheet.getCell("A" + fila);
        celda.value = texto;
        celda.font = { name: "Calibri", italic: true, size: 9, color: { argb: TEMA.textoSuave } };
        celda.alignment = { vertical: "middle", wrapText: true };
        aplicarRelleno(celda, TEMA.fondo);
        celda.border = { left: { style: "medium", color: { argb: TEMA.ambar } } };
        sheet.getRow(fila).height = 15;
        sheet.getRow(fila + 1).height = 15;
        fila += 3;
        return api;
      },

      cerrar({ nota = "" } = {}) {
        fila = pintarPie(sheet, fila + 1, { nota });
        return api;
      },
    };

    return api;
  }

  /**
   * Hoja de tabla.
   *
   * Encabezado congelado, filtros automaticos, anchos calculados y totales al
   * final. Todas las tablas del sistema salen de aqui para que ninguna quede
   * sin filtro o con una columna cortada.
   */
  async function tabla({
    nombre,
    subtitulo = "",
    columnas = [],
    filas: datos = [],
    // Texto al pie de la hoja.
    nota = "",
    // Fila de totales. Se calcula sobre las columnas marcadas con `total`.
    totales = true,
    // Etiqueta de la fila de totales.
    etiquetaTotales = "TOTAL",
    // Tope de filas de la hoja.
    //
    // Existe por tiempo de generacion, no por limite de Excel: un reporte con
    // detalle por producto sobre un año entero puede pasar de cincuenta mil
    // filas y dejar el navegador sin responder medio minuto. Cuando se
    // recorta, los TOTALES siguen siendo los del periodo completo y la hoja lo
    // dice: un total que solo sumara las filas visibles seria un dato falso.
    maxFilas = 30000,
  } = {}) {
    const sheet = workbook.addWorksheet(nombreHojaSeguro(nombre, nombresUsados), {
      views: [{ showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const definiciones = columnas.filter(Boolean);
    sheet.columns = definiciones.map((columna) => ({
      // El ancho se fija explicitamente: una columna estrecha con moneda
      // muestra "#####" en lugar del importe.
      width: columna.ancho
        || (columna.formato === "moneda" ? 16
          : columna.formato === "fechaHora" ? 19
            : columna.formato === "fecha" ? 13
              : columna.formato === "hora" ? 9
                : Math.min(46, Math.max(12, String(columna.header || "").length + 6))),
    }));

    const todas = Array.isArray(datos) ? datos : [];
    const recortada = todas.length > maxFilas;
    const filasVisibles = recortada ? todas.slice(0, maxFilas) : todas;

    const filaEncabezadoBanda = await pintarEncabezado(sheet, { subtitulo, compacto: true });
    const filaTitulos = filaEncabezadoBanda;

    const encabezado = sheet.getRow(filaTitulos);
    encabezado.height = 26;
    definiciones.forEach((columna, indice) => {
      const celda = encabezado.getCell(indice + 1);
      celda.value = String(columna.header || "");
      celda.font = { name: "Calibri", bold: true, size: 10, color: { argb: TEMA.blanco } };
      aplicarRelleno(celda, TEMA.navyMedio);
      celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      celda.border = { bottom: { style: "medium", color: { argb: TEMA.turquesa } } };
    });

    // Estilos de fila creados una sola vez y reutilizados en todas las celdas.
    const fuenteDato = Object.freeze({ name: "Calibri", size: 10, color: { argb: TEMA.texto } });
    const bordeDato = Object.freeze({ bottom: bordeFino(TEMA.bordeSuave) });
    const rellenoPar = Object.freeze({
      type: "pattern", pattern: "solid", fgColor: { argb: TEMA.blanco },
    });
    const rellenoImpar = Object.freeze({
      type: "pattern", pattern: "solid", fgColor: { argb: TEMA.fondo },
    });
    // La alineacion forzada por columna tambien se resuelve una vez por
    // columna, no una vez por celda.
    const alineacionColumna = definiciones.map((columna) => (columna.alineacion
      ? ALINEACION[columna.alineacion === "right" ? "derecha"
        : columna.alineacion === "center" ? "centro" : "izquierda"]
      : null));

    filasVisibles.forEach((registro, indiceFila) => {
      const row = sheet.getRow(filaTitulos + 1 + indiceFila);
      row.height = 19;
      const relleno = indiceFila % 2 ? rellenoImpar : rellenoPar;
      definiciones.forEach((columna, indice) => {
        const celda = row.getCell(indice + 1);
        escribirValor(celda, registro?.[columna.key], columna.formato, columna.vacio ?? "N/A");
        celda.font = fuenteDato;
        celda.fill = relleno;
        celda.border = bordeDato;
        if (alineacionColumna[indice]) celda.alignment = alineacionColumna[indice];
      });
    });

    let ultimaFila = filaTitulos + filasVisibles.length;

    // Totales solo de lo que tiene sentido sumar. Si ninguna columna los pide,
    // no se inventa una fila de totales.
    const columnasTotal = definiciones
      .map((columna, indice) => ({ columna, indice }))
      .filter(({ columna }) => columna.total);

    if (totales && filasVisibles.length && columnasTotal.length) {
      const row = sheet.getRow(ultimaFila + 1);
      row.height = 24;
      definiciones.forEach((columna, indice) => {
        const celda = row.getCell(indice + 1);
        aplicarRelleno(celda, TEMA.navy);
        celda.font = { name: "Calibri", bold: true, size: 10.5, color: { argb: TEMA.blanco } };
        celda.border = { top: { style: "medium", color: { argb: TEMA.turquesa } } };
        celda.value = "";
        if (indice === 0) {
          celda.value = etiquetaTotales;
          celda.alignment = { vertical: "middle" };
        }
        const esTotal = columnasTotal.some((item) => item.indice === indice);
        if (esTotal) {
          if (recortada) {
            // Con la hoja recortada, una SUMA de lo visible daria menos de lo
            // que realmente ocurrio. Se escribe el total del periodo completo.
            celda.value = todas.reduce((suma, registro) => suma + numero(registro?.[columna.key]), 0);
          } else {
            const letra = columnLetter(indice);
            // Formula real, no un numero calculado en JavaScript: si el usuario
            // filtra o corrige una fila, el total se actualiza con el archivo.
            celda.value = {
              formula: "SUM(" + letra + (filaTitulos + 1) + ":" + letra + ultimaFila + ")",
            };
          }
          celda.numFmt = FORMATO[columna.formato] || FORMATO.decimal;
          celda.alignment = ALINEACION.derecha;
        }
      });
      ultimaFila += 1;
    }

    sheet.views = [{
      state: "frozen",
      ySplit: filaTitulos,
      showGridLines: false,
    }];

    if (filasVisibles.length) {
      sheet.autoFilter = {
        from: { row: filaTitulos, column: 1 },
        to: { row: filaTitulos + filasVisibles.length, column: definiciones.length },
      };
    }

    const avisoRecorte = recortada
      ? "Esta hoja muestra las primeras " + maxFilas.toLocaleString("es-MX") + " de "
        + todas.length.toLocaleString("es-MX") + " filas del periodo, para que el archivo se "
        + "genere en un tiempo razonable. Los totales corresponden al periodo COMPLETO. "
        + "Elige un periodo más corto si necesitas el detalle de todas las filas."
      : "";

    pintarPie(sheet, ultimaFila + 2, {
      nota: [avisoRecorte, nota].filter(Boolean).join("  "),
    });
    return sheet;
  }

  /** Escribe el archivo y lo entrega al navegador del usuario. */
  async function descargar(nombreArchivo) {
    let buffer = await workbook.xlsx.writeBuffer();
    buffer = await injectCharts(buffer, graficas);

    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    // El objeto se libera en cuanto el navegador tomo el archivo.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return nombreArchivo;
  }

  // `graficas` se expone para poder verificar la generacion sin navegador;
  // el reporte no la modifica desde fuera.
  return { workbook, dashboard, tabla, descargar, generadoEn, graficas };
}

/** Error que la pantalla reconoce como "no hay informacion", no como fallo. */
export function errorSinDatos(mensaje = "No encontramos información para generar este reporte en el periodo seleccionado.") {
  const error = new Error(mensaje);
  error.code = "reportes/sin-datos";
  return error;
}

export function esErrorSinDatos(error) {
  return error?.code === "reportes/sin-datos";
}
