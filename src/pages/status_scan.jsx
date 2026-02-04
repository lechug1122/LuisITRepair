import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import "../css/status_scan.css";

export default function StatusScan() {
  const navigate = useNavigate();

  useEffect(() => {
    const qr = new Html5Qrcode("reader");

    (async () => {
      try {
        const cams = await Html5Qrcode.getCameras();
        const camId = cams?.[0]?.id;

        if (!camId) return;

        await qr.start(
          camId,
          { fps: 10, qrbox: 250 },
          (decodedText) => {
            // decodedText será una URL tipo: http://localhost/status/ABC123
            // extraemos folio del final
            const parts = decodedText.split("/status/");
            const folio = parts[1]?.trim();

            if (folio) {
              qr.stop().then(() => navigate(`/status/${folio}`));
            }
          }
        );
      } catch (e) {
        // si falla permisos de cámara, el navegador mostrará aviso
      }
    })();

    return () => {
      qr.stop().catch(() => {});
    };
  }, [navigate]);

  return (
    <div className="scan-page">
      <div className="scan-box">
        <h2>Escanear QR</h2>
        <p>Apunta la cámara al código QR del ticket.</p>
        <div id="reader" className="scan-reader" />
        <button type="button" onClick={() => navigate("/status")}>
          Regresar
        </button>
      </div>
    </div>
  );
}
