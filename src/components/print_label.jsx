import React from "react";
import { createRoot } from "react-dom/client";
import QRCode from "react-qr-code";

/**
 * Imprime etiquetas pequeñas en una ventana nueva (solo etiquetas).
 * @param {Object} servicio
 * @param {string} urlStatus
 * @param {number} count  Cantidad de etiquetas a imprimir
 */
export function imprimirEtiquetas(servicio, urlStatus, count = 12) {
  const w = window.open("", "_blank", "width=900,height=650");
  if (!w) {
    alert("Bloqueado por el navegador. Permite popups para imprimir.");
    return;
  }

  const formatFecha = (ts) => {
    if (!ts?.seconds) return "-";
    return new Date(ts.seconds * 1000).toLocaleString("es-MX");
  };

  // HTML base + estilos para impresión
  w.document.open();
  w.document.write(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Etiquetas - ${servicio?.folio || ""}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; font-family: Arial, sans-serif; }
    .sheet{
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      align-content: start;
    }
    .label{
  .label{
  border: 1px solid #111;
  border-radius: 6px;
  padding: 6px;
  background: #fff;

  /* ✅ TAMAÑO REAL DE ETIQUETA */
  width: 4in;
  height: 2in;

  overflow: hidden;
  display: flex;
  gap: 8px;
}

    }
    .info{ flex: 1; min-width: 0; }
    .title{ font-weight: 800; font-size: 12px; margin-bottom: 6px; }
    .line{ display: flex; gap: 6px; font-size: 10px; line-height: 1.2; margin-bottom: 4px; }
    .k{ font-weight: 700; white-space: nowrap; }
    .v{
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .qr{
      width: 78px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
    }
    .small{ font-size: 8px; margin-top: 4px; text-align: center; word-break: break-word; }

    @page { margin: 8mm; }
    @media print {
      body{ padding: 0; }
    }
  </style>
</head>
<body>
  <div id="root"></div>
</body>
</html>
  `);
  w.document.close();

  // Render React dentro de la nueva ventana
  const mountNode = w.document.getElementById("root");
  const root = createRoot(mountNode);

  const Etiquetas = () => (
    <div className="sheet">
      {Array.from({ length: count }).map((_, i) => (
        <div className="label" key={i}>
          <div className="info">
            <div className="title">Etiqueta de Servicio</div>

            <div className="line">
              <span className="k">Nombre:</span>
              <span className="v">{servicio?.nombre || "-"}</span>
            </div>

            <div className="line">
              <span className="k">Fecha:</span>
              <span className="v">{formatFecha(servicio?.createdAt)}</span>
            </div>

            <div className="line">
              <span className="k">Folio:</span>
              <span className="v">{servicio?.folio || "-"}</span>
            </div>
          </div>

          <div className="qr">
            <QRCode value={urlStatus} size={70} />
            <div className="small">/status/{servicio?.folio || ""}</div>
          </div>
        </div>
      ))}
    </div>
  );

  root.render(<Etiquetas />);

  // imprime cuando ya cargó
  setTimeout(() => {
    w.focus();
    w.print();
    // si quieres que se cierre solo:
    // w.close();
  }, 350);
}
