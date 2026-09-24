// ---------------------------------------------------------------------------
// Graficas NATIVAS de Excel para los reportes de CajaLibre.
//
// ExcelJS no sabe crear graficas, asi que se inyectan como partes OOXML sobre
// el archivo que ExcelJS ya genero. Son graficas de verdad (seleccionables,
// con tooltip y recalculables), no imagenes: una captura PNG se ve borrosa al
// imprimir y no deja al usuario tocar los datos.
//
// El modulo no conoce ningun reporte: recibe descripciones de grafica y
// devuelve el archivo con las partes agregadas.
// ---------------------------------------------------------------------------

// Paleta de series. Coincide con la identidad visual del kit para que una
// grafica nunca introduzca un color que no exista en el resto del reporte.
export const CHART_SERIES_COLORS = [
  "1E5F8C", // azul marino medio
  "17B3A3", // turquesa
  "F5B301", // ambar (acento)
  "4C82B5",
  "0F2A44", // azul marino profundo
  "6DC5BC",
  "C98A05",
  "8FB4D4",
];

const xmlEscape = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const safeNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

// Excel solo acepta letras de columna; con 26 sobran para las series de un
// reporte, pero se calcula igual para no romper si alguna vez se pasa de AA.
function columnLetter(index) {
  let rest = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (rest % 26)) + letters;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return letters;
}

function cacheXml(values, numeric) {
  return values
    .map((value, index) => {
      const content = numeric ? safeNumber(value) : xmlEscape(value);
      return '<c:pt idx="' + index + '"><c:v>' + content + '</c:v></c:pt>';
    })
    .join("");
}

// La cache es lo que Excel dibuja antes de recalcular; la formula es lo que
// permite al usuario ver y editar los datos de origen. Se escriben las dos.
function referenceXml({ numeric, formula, values, formatCode }) {
  const tag = numeric ? "num" : "str";
  const format = numeric && formatCode
    ? "<c:formatCode>" + xmlEscape(formatCode) + "</c:formatCode>"
    : "";
  return "<c:" + tag + "Ref><c:f>" + xmlEscape(formula) + "</c:f><c:" + tag + "Cache>"
    + format
    + '<c:ptCount val="' + values.length + '"/>'
    + cacheXml(values, numeric)
    + "</c:" + tag + "Cache></c:" + tag + "Ref>";
}

function solidFill(color) {
  return '<c:spPr><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill>'
    + "<a:ln><a:noFill/></a:ln></c:spPr>";
}

function lineStroke(color) {
  return '<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="' + color + '"/>'
    + "</a:solidFill><a:round/></a:ln><a:effectLst/></c:spPr>";
}

function markerXml(color) {
  return '<c:marker><c:symbol val="circle"/><c:size val="6"/>'
    + '<c:spPr><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill>'
    + '<a:ln w="9525"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:marker>';
}

// Los puntos de una dona necesitan color individual: la serie completa es una
// sola rosca y sin dPt saldria toda del mismo tono.
function doughnutPointsXml(count) {
  return Array.from({ length: count }, (_, index) => {
    const color = CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
    return '<c:dPt><c:idx val="' + index + '"/><c:bubble3D val="0"/>'
      + '<c:spPr><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill>'
      + '<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>';
  }).join("");
}

/**
 * Una serie de datos. El orden de los hijos de `c:ser` lo fija el esquema
 * OOXML y Excel rechaza el archivo completo si se altera, asi que cada tipo
 * arma su secuencia por separado en lugar de compartir una generica.
 */
function seriesXml({
  tipo,
  index,
  nombre,
  categorias,
  valores,
  sheetName,
  categoryColumn,
  valueColumn,
  formatCode,
}) {
  const lastRow = valores.length + 1;
  const quotedSheet = "'" + sheetName.replace(/'/g, "''") + "'";
  const categoryFormula = quotedSheet + "!$" + categoryColumn + "$2:$" + categoryColumn + "$" + lastRow;
  const valueFormula = quotedSheet + "!$" + valueColumn + "$2:$" + valueColumn + "$" + lastRow;
  const color = CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];

  const head = '<c:idx val="' + index + '"/><c:order val="' + index + '"/>'
    + "<c:tx><c:strRef><c:f>"
    + xmlEscape(quotedSheet + "!$" + valueColumn + "$1")
    + '</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>'
    + xmlEscape(nombre)
    + "</c:v></c:pt></c:strCache></c:strRef></c:tx>";

  const cat = "<c:cat>"
    + referenceXml({ numeric: false, formula: categoryFormula, values: categorias })
    + "</c:cat>";
  const val = "<c:val>"
    + referenceXml({ numeric: true, formula: valueFormula, values: valores, formatCode })
    + "</c:val>";

  if (tipo === "linea") {
    // CT_LineSer: idx, order, tx, spPr, marker, dPt, dLbls, cat, val, smooth
    return "<c:ser>" + head + lineStroke(color) + markerXml(color) + cat + val
      + '<c:smooth val="0"/></c:ser>';
  }

  if (tipo === "dona") {
    // CT_PieSer: idx, order, tx, spPr, explosion, dPt, dLbls, cat, val
    return "<c:ser>" + head + doughnutPointsXml(valores.length) + cat + val + "</c:ser>";
  }

  // CT_BarSer: idx, order, tx, spPr, invertIfNegative, dPt, dLbls, cat, val
  return "<c:ser>" + head + solidFill(color) + '<c:invertIfNegative val="0"/>'
    + cat + val + "</c:ser>";
}

function axesXml({ catAxId, valAxId, valueFormat, horizontal }) {
  const tickFont = "<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>"
    + '<a:defRPr sz="900"><a:solidFill><a:srgbClr val="64748B"/></a:solidFill></a:defRPr>'
    + '</a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>';
  const axisLine = '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="E2E8F0"/>'
    + "</a:solidFill></a:ln></c:spPr>";
  const gridlines = '<c:majorGridlines><c:spPr><a:ln w="9525">'
    + '<a:solidFill><a:srgbClr val="EEF2F7"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';

  // En la barra horizontal los ejes intercambian su posicion en la hoja, pero
  // siguen siendo el mismo eje de categorias y el mismo de valores.
  const catPos = horizontal ? "l" : "b";
  const valPos = horizontal ? "b" : "l";

  const catAx = '<c:catAx><c:axId val="' + catAxId + '"/>'
    + '<c:scaling><c:orientation val="minMax"/></c:scaling>'
    + '<c:delete val="0"/><c:axPos val="' + catPos + '"/>'
    + '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>'
    + axisLine + tickFont
    + '<c:crossAx val="' + valAxId + '"/><c:crosses val="autoZero"/><c:auto val="1"/>'
    + '<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>';

  const valAx = '<c:valAx><c:axId val="' + valAxId + '"/>'
    + '<c:scaling><c:orientation val="minMax"/></c:scaling>'
    + '<c:delete val="0"/><c:axPos val="' + valPos + '"/>'
    + gridlines
    + '<c:numFmt formatCode="' + xmlEscape(valueFormat || "#,##0") + '" sourceLinked="0"/>'
    + '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>'
    + axisLine + tickFont
    + '<c:crossAx val="' + catAxId + '"/><c:crosses val="autoZero"/>'
    + '<c:crossBetween val="between"/></c:valAx>';

  return catAx + valAx;
}

function plotAreaXml({ tipo, series, seriesCount, valueFormat, chartId }) {
  // Los ids de eje deben ser unicos dentro del archivo, no solo de la grafica.
  const catAxId = 200000000 + chartId * 2;
  const valAxId = 200000001 + chartId * 2;

  if (tipo === "dona") {
    return '<c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/>' + series
      + "<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>"
      + "<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>"
      + '<a:defRPr sz="900" b="1"><a:solidFill><a:srgbClr val="0F2A44"/></a:solidFill></a:defRPr>'
      + '</a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>'
      + '<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/>'
      + '<c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls>'
      + '<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart></c:plotArea>';
  }

  if (tipo === "linea") {
    // CT_LineChart: grouping, varyColors, ser, dLbls, marker, axId, axId
    return '<c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/>'
      + '<c:varyColors val="0"/>' + series
      + '<c:marker val="1"/><c:axId val="' + catAxId + '"/><c:axId val="' + valAxId + '"/>'
      + "</c:lineChart>"
      + axesXml({ catAxId, valAxId, valueFormat, horizontal: false })
      + "</c:plotArea>";
  }

  const horizontal = tipo === "barra";
  // Con una sola serie las etiquetas de valor ayudan; con varias estorban.
  const labels = seriesCount === 1
    ? '<c:dLbls><c:numFmt formatCode="' + xmlEscape(valueFormat || "#,##0") + '" sourceLinked="0"/>'
      + "<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>"
      + "<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>"
      + '<a:defRPr sz="850" b="1"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:defRPr>'
      + '</a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>'
      + '<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/>'
      + '<c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>'
    : "";

  // CT_BarChart: barDir, grouping, varyColors, ser, dLbls, gapWidth, overlap, axId, axId
  return '<c:plotArea><c:layout/><c:barChart><c:barDir val="' + (horizontal ? "bar" : "col") + '"/>'
    + '<c:grouping val="clustered"/><c:varyColors val="0"/>' + series + labels
    + '<c:gapWidth val="' + (seriesCount > 1 ? 80 : 45) + '"/>'
    + '<c:overlap val="' + (seriesCount > 1 ? -15 : 0) + '"/>'
    + '<c:axId val="' + catAxId + '"/><c:axId val="' + valAxId + '"/></c:barChart>'
    + axesXml({ catAxId, valAxId, valueFormat, horizontal })
    + "</c:plotArea>";
}

/**
 * Documento completo de una grafica.
 *
 * `spec` describe la grafica ya resuelta: tipo, titulo, categorias y una o
 * varias series, junto con la hoja y columnas donde quedaron sus datos.
 */
export function createChartXml(spec, chartId) {
  const {
    tipo,
    titulo,
    categorias,
    series,
    sheetName,
    categoryColumn,
    valueFormat,
    mostrarLeyenda,
  } = spec;

  const seriesXmlAll = series
    .map((serie, index) => seriesXml({
      tipo,
      index,
      nombre: serie.nombre,
      categorias,
      valores: serie.valores,
      sheetName,
      categoryColumn,
      valueColumn: serie.columna,
      formatCode: valueFormat,
    }))
    .join("");

  const conLeyenda = mostrarLeyenda ?? (tipo === "dona" || series.length > 1);
  const legend = conLeyenda
    ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/>'
      + "<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>"
      + '<a:defRPr sz="900"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:defRPr>'
      + '</a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr></c:legend>'
    : "";

  const title = "<c:title><c:tx><c:rich>"
    + '<a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square"'
    + ' anchor="ctr" anchorCtr="1"/><a:lstStyle/><a:p><a:pPr>'
    + '<a:defRPr sz="1150" b="1"><a:solidFill><a:srgbClr val="0F2A44"/></a:solidFill></a:defRPr>'
    + '</a:pPr><a:r><a:rPr lang="es-MX" sz="1150" b="1"/><a:t>' + xmlEscape(titulo)
    + "</a:t></a:r></a:p></c:rich></c:tx>"
    + '<c:overlay val="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:title>';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<c:date1904 val="0"/><c:lang val="es-MX"/><c:roundedCorners val="0"/><c:chart>'
    + title + '<c:autoTitleDeleted val="0"/>'
    + plotAreaXml({ tipo, series: seriesXmlAll, seriesCount: series.length, valueFormat, chartId })
    + legend
    + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>'
    + '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>'
    + '<a:ln w="9525"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>'
    + "<c:printSettings><c:headerFooter/>"
    + '<c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/>'
    + "<c:pageSetup/></c:printSettings></c:chartSpace>";
}

function anchorXml({ relId, shapeId, desde, hasta }) {
  return '<xdr:twoCellAnchor editAs="oneCell">'
    + "<xdr:from><xdr:col>" + desde.col + "</xdr:col><xdr:colOff>38100</xdr:colOff>"
    + "<xdr:row>" + desde.row + "</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>"
    + "<xdr:to><xdr:col>" + hasta.col + "</xdr:col><xdr:colOff>0</xdr:colOff>"
    + "<xdr:row>" + hasta.row + "</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>"
    + '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr>'
    + '<xdr:cNvPr id="' + shapeId + '" name="Grafica ' + shapeId + '"/>'
    + "<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>"
    + '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">'
    + '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' r:id="' + relId + '"/>'
    + "</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>";
}

const RELS_VACIO = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + "</Relationships>";

const DRAWING_ABIERTO = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"'
  + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">';

/**
 * Ubica el archivo XML de una hoja por su nombre visible.
 *
 * No se asume que la hoja N sea `sheetN.xml`: ExcelJS puede numerarlas de otra
 * forma y equivocarse aqui pondria las graficas en la hoja incorrecta. Se
 * resuelve por el mismo camino que usa Excel: workbook.xml -> rels -> destino.
 */
async function resolveSheetPath(zip, sheetName) {
  const workbookFile = zip.file("xl/workbook.xml");
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relsFile) return null;

  const workbookXml = await workbookFile.async("string");
  const relsXml = await relsFile.async("string");

  // El nombre viaja escapado dentro del XML del libro.
  const escapado = xmlEscape(sheetName);
  const sheetTag = [...workbookXml.matchAll(/<sheet[^>]*\/?>/g)]
    .map((match) => match[0])
    .find((tag) => {
      const name = /name="([^"]*)"/.exec(tag)?.[1];
      return name === escapado || name === sheetName;
    });
  if (!sheetTag) return null;

  const relId = /r:id="([^"]*)"/.exec(sheetTag)?.[1];
  if (!relId) return null;

  const relTag = [...relsXml.matchAll(/<Relationship[^>]*\/?>/g)]
    .map((match) => match[0])
    .find((tag) => new RegExp('Id="' + relId + '"').test(tag));
  const target = relTag ? /Target="([^"]*)"/.exec(relTag)?.[1] : null;
  if (!target) return null;

  const clean = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
  return "xl/" + clean;
}

function nextDrawingIndex(zip) {
  const indices = Object.keys(zip.files)
    .map((name) => /^xl\/drawings\/drawing(\d+)\.xml$/.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return indices.length ? Math.max(...indices) + 1 : 1;
}

/**
 * Agrega las graficas al archivo ya escrito por ExcelJS.
 *
 * `charts` trae cada grafica con la hoja donde debe verse y su posicion. La
 * funcion nunca lanza: un reporte sin graficas sigue siendo util, mientras que
 * un reporte que no se descarga no sirve de nada.
 */
export async function injectCharts(buffer, charts = []) {
  if (!charts.length) return buffer;

  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);

    // Las graficas se agrupan por hoja: cada hoja tiene un unico "drawing" que
    // las contiene todas, y agregarlas de una vez evita reescribirlo por cada
    // grafica.
    const porHoja = new Map();
    charts.forEach((chart) => {
      if (!porHoja.has(chart.sheetTarget)) porHoja.set(chart.sheetTarget, []);
      porHoja.get(chart.sheetTarget).push(chart);
    });

    let chartId = 0;
    let shapeId = 5000;
    const nuevasPartes = [];

    for (const [sheetName, lista] of porHoja.entries()) {
      const sheetPath = await resolveSheetPath(zip, sheetName);
      if (!sheetPath || !zip.file(sheetPath)) continue;

      const sheetFile = sheetPath.split("/").pop();
      const sheetRelsPath = sheetPath.replace(/\/[^/]+$/, "/_rels/" + sheetFile + ".rels");
      let sheetRels = zip.file(sheetRelsPath)
        ? await zip.file(sheetRelsPath).async("string")
        : RELS_VACIO;

      // Si la hoja ya tiene un drawing (por el logo, por ejemplo) las graficas
      // se suman a ese; crear un segundo drawing para la misma hoja produce un
      // archivo que Excel considera dañado.
      const drawingRel = [...sheetRels.matchAll(/<Relationship[^>]*\/?>/g)]
        .map((match) => match[0])
        .find((tag) => tag.includes("/relationships/drawing"));

      let drawingPath;
      let drawingEsNuevo = false;

      if (drawingRel) {
        const target = /Target="([^"]*)"/.exec(drawingRel)?.[1] || "";
        drawingPath = "xl/" + target.replace(/^\.\.\//, "").replace(/^\/?xl\//, "");
      } else {
        chartId += 1;
        drawingPath = "xl/drawings/drawing" + nextDrawingIndex(zip) + ".xml";
        drawingEsNuevo = true;
        const relId = "rIdClDraw" + chartId;
        sheetRels = sheetRels.replace(
          "</Relationships>",
          '<Relationship Id="' + relId + '"'
          + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"'
          + ' Target="../drawings/' + drawingPath.split("/").pop() + '"/></Relationships>',
        );
        zip.file(sheetRelsPath, sheetRels);

        let sheetXml = await zip.file(sheetPath).async("string");
        // `drawing` va al final del elemento worksheet; el esquema lo exige
        // despues del resto del contenido de la hoja.
        if (!sheetXml.includes("<drawing ")) {
          sheetXml = sheetXml.replace("</worksheet>", '<drawing r:id="' + relId + '"/></worksheet>');
        }
        zip.file(sheetPath, sheetXml);
        zip.file(drawingPath, DRAWING_ABIERTO + "</xdr:wsDr>");
        zip.file(drawingPath.replace(/\/([^/]+)$/, "/_rels/$1.rels"), RELS_VACIO);
      }

      const drawingRelsPath = drawingPath.replace(/\/([^/]+)$/, "/_rels/$1.rels");
      let drawingXml = zip.file(drawingPath)
        ? await zip.file(drawingPath).async("string")
        : DRAWING_ABIERTO + "</xdr:wsDr>";
      let drawingRels = zip.file(drawingRelsPath)
        ? await zip.file(drawingRelsPath).async("string")
        : RELS_VACIO;

      let anchors = "";
      let relaciones = "";

      lista.forEach((chart) => {
        chartId += 1;
        shapeId += 1;
        const partName = "xl/charts/chartCl" + chartId + ".xml";
        const relId = "rIdClChart" + chartId;
        zip.file(partName, createChartXml(chart, chartId));
        nuevasPartes.push("/" + partName);
        anchors += anchorXml({ relId, shapeId, desde: chart.desde, hasta: chart.hasta });
        relaciones += '<Relationship Id="' + relId + '"'
          + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"'
          + ' Target="../charts/chartCl' + chartId + '.xml"/>';
      });

      drawingXml = drawingXml.replace("</xdr:wsDr>", anchors + "</xdr:wsDr>");
      zip.file(drawingPath, drawingXml);
      drawingRels = drawingRels.replace("</Relationships>", relaciones + "</Relationships>");
      zip.file(drawingRelsPath, drawingRels);

      if (drawingEsNuevo) {
        let contentTypes = await zip.file("[Content_Types].xml").async("string");
        if (!contentTypes.includes('PartName="/' + drawingPath + '"')) {
          contentTypes = contentTypes.replace(
            "</Types>",
            '<Override PartName="/' + drawingPath + '"'
            + ' ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
          );
          zip.file("[Content_Types].xml", contentTypes);
        }
      }
    }

    if (!nuevasPartes.length) return buffer;

    let contentTypes = await zip.file("[Content_Types].xml").async("string");
    const overrides = nuevasPartes
      .map((part) => '<Override PartName="' + part + '"'
        + ' ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>')
      .join("");
    contentTypes = contentTypes.replace("</Types>", overrides + "</Types>");
    zip.file("[Content_Types].xml", contentTypes);

    return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
  } catch (error) {
    // El reporte vale mas que sus graficas: se entrega sin ellas.
    console.warn("[reportes] No se pudieron agregar las graficas nativas:", error);
    return buffer;
  }
}

export { columnLetter };
