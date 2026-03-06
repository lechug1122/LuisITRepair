import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import "../css/status_scan.css";

const REAR_CAMERA_HINTS = ["back", "rear", "environment", "trasera", "posterior"];
const SCAN_CONFIG = { fps: 10, qrbox: 250 };

function pickRearCameraId(cameras = []) {
  const rear = cameras.find((cam) => {
    const label = (cam?.label || "").toLowerCase();
    return REAR_CAMERA_HINTS.some((hint) => label.includes(hint));
  });
  return rear?.id || null;
}

function readFolioFromText(decodedText) {
  const parts = decodedText.split("/status/");
  return parts[1]?.trim() || "";
}

export default function StatusScan() {
  const navigate = useNavigate();

  useEffect(() => {
    const qr = new Html5Qrcode("reader");

    const onSuccess = (decodedText) => {
      const folio = readFolioFromText(decodedText);
      if (!folio) return;
      qr
        .stop()
        .then(() => navigate(`/status/${encodeURIComponent(String(folio).trim())}`));
    };

    (async () => {
      try {
        // Preferred path for mobile: request rear camera.
        await qr.start(
          { facingMode: { ideal: "environment" } },
          SCAN_CONFIG,
          onSuccess
        );
      } catch {
        try {
          // Fallback: choose a camera whose label hints rear camera.
          const cameras = await Html5Qrcode.getCameras();
          const rearCameraId = pickRearCameraId(cameras);
          const fallbackCameraId = rearCameraId || cameras?.[0]?.id;

          if (!fallbackCameraId) return;
          await qr.start(fallbackCameraId, SCAN_CONFIG, onSuccess);
        } catch {
          // Camera permissions or availability failure.
        }
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
        <p>Usa la camara trasera para leer el QR del ticket.</p>
        <div id="reader" className="scan-reader" />
        <button type="button" onClick={() => navigate("/status")}>
          Regresar
        </button>
      </div>
    </div>
  );
}
