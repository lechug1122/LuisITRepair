import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import "../css/pos_mobile_scanner.css";

const SCANNER_ID = "pos-mobile-reader";
const REAR_CAMERA_HINTS = ["back", "rear", "environment", "trasera", "posterior"];
const SCAN_CONFIG = {
  fps: 10,
  qrbox: { width: 260, height: 170 },
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransitionError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("already under transition") || msg.includes("cannot transition");
}

function isScannerRunning(state) {
  const normalized = String(state ?? "").toUpperCase();
  return (
    state === 2 ||
    state === 3 ||
    normalized === "SCANNING" ||
    normalized === "PAUSED"
  );
}

async function safelyDisposeScanner(instance) {
  if (!instance) return;
  try {
    const state = typeof instance.getState === "function" ? instance.getState() : null;
    if (isScannerRunning(state)) {
      await instance.stop();
    } else {
      await instance.stop().catch(() => {});
    }
  } catch {
    // noop
  }

  try {
    await instance.clear();
  } catch {
    // noop
  }
}

function cameraErrorMessage(err) {
  const text = String(err?.message || err || "").toLowerCase();
  if (!window.isSecureContext) {
    return "La camara requiere HTTPS o localhost.";
  }
  if (text.includes("permission") || text.includes("notallowederror")) {
    return "Permiso de camara denegado. Habilitalo en el navegador.";
  }
  if (text.includes("notfounderror") || text.includes("overconstrained")) {
    return "No se encontro camara compatible en este dispositivo.";
  }
  if (text.includes("notreadableerror") || text.includes("trackstarterror")) {
    return "La camara esta en uso por otra app.";
  }
  return "No se pudo iniciar la camara. Verifica permisos.";
}

function pickRearCameraId(cameras = []) {
  const rear = cameras.find((cam) => {
    const label = String(cam?.label || "").toLowerCase();
    return REAR_CAMERA_HINTS.some((hint) => label.includes(hint));
  });
  return rear?.id || null;
}

function extractScanTerm(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";

  try {
    const parsed = new URL(text);
    const [beforeQuery] = String(parsed.pathname || "").split("?");
    const parts = beforeQuery.split("/status/");
    if (parts[1]) return decodeURIComponent(parts[1]).trim();
  } catch {
    // Keep raw parser for plain values.
  }

  const splitStatus = text.split("/status/");
  if (splitStatus[1]) {
    return decodeURIComponent(splitStatus[1].split(/[?#]/)[0]).trim();
  }

  return text;
}

export default function POSMobileScanner({
  disabled = false,
  disabledMessage = "",
  itemsCount = 0,
  total = 0,
  onResolveCode,
  onExitToNormal,
}) {
  const scannerRef = useRef(null);
  const dedupeRef = useRef({ value: "", at: 0 });
  const resolveRef = useRef(onResolveCode);

  const [manualCode, setManualCode] = useState("");
  const [scannerInfo, setScannerInfo] = useState("Escaner listo para leer codigo de barras y QR.");
  const [scannerError, setScannerError] = useState("");

  useEffect(() => {
    resolveRef.current = onResolveCode;
  }, [onResolveCode]);

  const processTerm = async (term) => {
    const normalized = extractScanTerm(term);
    if (!normalized) {
      setScannerError("No se detecto un codigo valido.");
      return;
    }

    const fn = resolveRef.current;
    if (typeof fn !== "function") return;

    const result = await fn(normalized);
    if (result?.ok) {
      setScannerError("");
      if (result.tipo === "sync") {
        setScannerInfo(`Codigo enviado al POS de escritorio: ${result.label}`);
      } else if (result.tipo === "servicio") {
        setScannerInfo(`Servicio ${result.label} agregado.`);
      } else {
        setScannerInfo(`Producto ${result.label} agregado.`);
      }
      return;
    }

    setScannerError(result?.message || "No se pudo procesar el codigo.");
  };

  useEffect(() => {
    if (disabled) {
      setScannerError("");
      setScannerInfo(disabledMessage || "Escaner temporalmente deshabilitado.");
      return undefined;
    }

    let active = true;
    let qrInstance = null;

    const waitForReaderHost = async (attempts = 20) => {
      for (let i = 0; i < attempts; i += 1) {
        const el = document.getElementById(SCANNER_ID);
        if (el && el.clientWidth > 0) return el;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return null;
    };

    const onSuccess = (decodedText) => {
      if (!active) return;

      const raw = String(decodedText || "").trim();
      if (!raw) return;

      const now = Date.now();
      if (dedupeRef.current.value === raw && now - dedupeRef.current.at < 450) return;

      dedupeRef.current = { value: raw, at: now };
      processTerm(raw).catch((err) => {
        console.error("Error procesando escaneo movil:", err);
        if (active) setScannerError("No se pudo procesar el codigo escaneado.");
      });
    };

    const start = async () => {
      setScannerError("");
      setScannerInfo("Solicitando acceso a camara...");

      if (!window.isSecureContext) {
        setScannerError("La camara requiere HTTPS o localhost.");
        return;
      }

      if (!navigator?.mediaDevices?.getUserMedia) {
        setScannerError("Este navegador no soporta camara.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        stream.getTracks().forEach((track) => track.stop());
      } catch (permissionErr) {
        if (active) setScannerError(cameraErrorMessage(permissionErr));
        return;
      }

      if (active) setScannerInfo("Iniciando camara trasera...");

      const host = await waitForReaderHost();
      if (!active) return;
      if (!host) {
        setScannerError("No se pudo preparar el lector. Recarga la pagina.");
        return;
      }

      host.innerHTML = "";
      const createScanner = () => {
        qrInstance = new Html5Qrcode(SCANNER_ID);
        scannerRef.current = qrInstance;
      };

      createScanner();

      try {
        await qrInstance.start({ facingMode: { ideal: "environment" } }, SCAN_CONFIG, onSuccess);
        if (active) setScannerInfo("Escaneando codigos...");
      } catch (firstErr) {
        if (isTransitionError(firstErr)) {
          try {
            await wait(250);
            if (!active) return;
            await qrInstance.start({ facingMode: { ideal: "environment" } }, SCAN_CONFIG, onSuccess);
            if (active) setScannerInfo("Escaneando codigos...");
            return;
          } catch (retryErr) {
            if (!isTransitionError(retryErr)) {
              console.warn("Reintento de escaner movil fallo:", retryErr);
            }
          }
        }

        try {
          await safelyDisposeScanner(qrInstance);
          if (!active) return;

          createScanner();
          const cameras = await Html5Qrcode.getCameras();
          const rearCameraId = pickRearCameraId(cameras);
          const fallbackCameraId = rearCameraId || cameras?.[0]?.id;

          if (!fallbackCameraId) {
            if (active) setScannerError("No se encontro una camara disponible.");
            return;
          }

          await qrInstance.start(fallbackCameraId, SCAN_CONFIG, onSuccess);
          if (active) setScannerInfo("Escaner activo.");
        } catch (err) {
          if (!isTransitionError(err)) {
            console.error("Error iniciando escaner movil:", err);
          }
          if (active) setScannerError(cameraErrorMessage(err));
        }
      }
    };

    start();

    return () => {
      active = false;
      const current = scannerRef.current;
      scannerRef.current = null;
      if (current) {
        safelyDisposeScanner(current).catch(() => {});
      }
      const host = document.getElementById(SCANNER_ID);
      if (host) host.innerHTML = "";
    };
  }, [disabled, disabledMessage]);

  const submitManual = async () => {
    try {
      await processTerm(manualCode);
      setManualCode("");
    } catch (err) {
      console.error("Error en captura manual:", err);
      setScannerError("No se pudo procesar el codigo manual.");
    }
  };

  return (
    <div className="posm-page">
      <div className="posm-card">
        <div className="posm-head">
          <h1 className="posm-title">Escaner POS</h1>
          {typeof onExitToNormal === "function" && (
            <button
              type="button"
              className="posm-switch-btn"
              onClick={onExitToNormal}
            >
              Pantalla normal
            </button>
          )}
        </div>
        <p className="posm-subtitle">Escanea codigo de barras o QR de servicio.</p>

        <div className="posm-reader-wrap">
          <div className="posm-reader">
            <div id={SCANNER_ID} className="posm-reader-host" />
            <div className="posm-reader-overlay">
              <span>ESCANER</span>
            </div>
          </div>
        </div>

        {scannerError ? (
          <div className="posm-msg posm-msg-error">{scannerError}</div>
        ) : (
          <div className="posm-msg">{scannerInfo}</div>
        )}

        <div className="posm-manual">
          <input
            type="text"
            value={manualCode}
            placeholder="Pega codigo o folio"
            disabled={disabled}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitManual();
            }}
          />
          <button type="button" disabled={disabled} onClick={submitManual}>
            Agregar
          </button>
        </div>

        <div className="posm-summary">
          <div>Items en carrito: <b>{itemsCount}</b></div>
          <div>Total actual: <b>${Number(total || 0).toFixed(2)}</b></div>
        </div>
      </div>
    </div>
  );
}
