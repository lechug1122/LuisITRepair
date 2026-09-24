import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import "../css/status.css";
import "../css/status_scan.css";

const REAR_CAMERA_HINTS = ["back", "rear", "environment", "trasera", "posterior"];
const SCAN_CONFIG = {
  fps: 10,
  qrbox: (width, height) => {
    const size = Math.min(250, Math.floor(Math.min(width, height) * 0.75));
    return { width: size, height: size };
  },
};

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
  const [cameraError, setCameraError] = useState("");

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

          if (!fallbackCameraId) {
            setCameraError("No encontramos una cámara disponible. Puedes consultar el servicio con tu folio.");
            return;
          }
          await qr.start(fallbackCameraId, SCAN_CONFIG, onSuccess);
        } catch {
          setCameraError("No se pudo abrir la cámara. Revisa el permiso de tu navegador o consulta con tu folio.");
        }
      }
    })();

    return () => {
      qr.stop().catch(() => {});
    };
  }, [navigate]);

  return (
    <main className="status-page status-page--centered">
      <section className="status-box status-entry scan-box">
        <span className="status-eyebrow">Consulta de servicio</span>
        <h1>Escanea tu código QR</h1>
        <p>Coloca el QR de tu ticket frente a la cámara para consultar tu servicio.</p>
        <div id="reader" className="scan-reader" />
        {cameraError ? <p className="scan-error" role="alert">{cameraError}</p> : <p className="scan-hint">Mantén el código visible y procura tener buena iluminación.</p>}
        <button className="status-button status-button-secondary" type="button" onClick={() => navigate("/status")}>
          Consultar con mi folio
        </button>
      </section>
    </main>
  );
}
