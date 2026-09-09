import { useCallback, useEffect, useMemo, useState } from "react";
import { imprimirTicketVenta } from "../components/print_ticket_venta";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import useImpresorasConfig from "../hooks/useImpresorasConfig";
import {
  fetchLocalPrinters,
  readLocalPrintersCache,
} from "../js/services/printer_bridge";
import {
  actualizarImpresorasConfig,
  getDocumentoInicioServicioLabel,
  getModoImpresionLabel,
  getSalidaTicketMovilLabel,
  getTamanoHojaServicioLabel,
} from "../js/services/impresoras_config";
import { detectMobileDevice } from "../js/services/mobile_detection";

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildPrinterBridgeInstaller(baseUrl) {
  const safeBaseUrl = String(baseUrl || "").replace(/"/g, '""');

  return [
    "@echo off",
    "setlocal",
    `set "BASE_URL=${safeBaseUrl}"`,
    'set "INSTALL_DIR=%LOCALAPPDATA%\\LuisITRepairPrinterBridge"',
    'if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"',
    "",
    'call :download "%BASE_URL%/printer_bridge.ps1" "%INSTALL_DIR%\\printer_bridge.ps1" || goto :error',
    "",
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; $startup = [Environment]::GetFolderPath('Startup'); $launcher = Join-Path $startup 'LuisITRepair Printer Bridge.lnk'; $legacy = Join-Path $startup 'LuisITRepair Printer Bridge.vbs'; $script = Join-Path $env:INSTALL_DIR 'printer_bridge.ps1'; $powershell = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'; $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($launcher); $shortcut.TargetPath = $powershell; $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + $script + '""'; $shortcut.WorkingDirectory = $env:INSTALL_DIR; $shortcut.WindowStyle = 7; $shortcut.IconLocation = $powershell + ',0'; $shortcut.Save(); if (Test-Path $legacy) { Remove-Item -Path $legacy -Force }; Start-Process -FilePath $powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$script) -WindowStyle Hidden" || goto :error`,
    'echo El activador de impresoras ya quedo instalado en esta PC.',
    "goto :eof",
    "",
    ":download",
    'set "DL_URL=%~1"',
    'set "DL_DEST=%~2"',
    'curl.exe -fsSL "%DL_URL%" -o "%DL_DEST%" >nul 2>nul',
    "if not errorlevel 1 exit /b 0",
    `powershell.exe -NoProfile -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri $env:DL_URL -OutFile $env:DL_DEST"`,
    "exit /b %ERRORLEVEL%",
    "",
    ":error",
    'echo No se pudo instalar el activador local de impresoras.',
    "exit /b 1",
  ].join("\r\n");
}

export default function ConfiguracionImpresoras() {
  const { serviciosHabilitados } = useEmpresaConfig();
  const impresoras = useImpresorasConfig();
  const [esDispositivoMovil, setEsDispositivoMovil] = useState(() => detectMobileDevice());
  const [modoImpresion, setModoImpresion] = useState(impresoras.modoImpresion);
  const [nombreImpresoraTicket, setNombreImpresoraTicket] = useState(
    impresoras.nombreImpresoraTicket,
  );
  const [tamanoTicket, setTamanoTicket] = useState(impresoras.tamanoTicket);
  const [nombreImpresoraHojaServicio, setNombreImpresoraHojaServicio] = useState(
    impresoras.nombreImpresoraHojaServicio,
  );
  const [tamanoHojaServicio, setTamanoHojaServicio] = useState(impresoras.tamanoHojaServicio);
  const [salidaTicketMovil, setSalidaTicketMovil] = useState(impresoras.salidaTicketMovil);
  const [impresorasPc, setImpresorasPc] = useState(readLocalPrintersCache);
  const [cargandoImpresoras, setCargandoImpresoras] = useState(false);
  const [impresorasMsg, setImpresorasMsg] = useState("");
  const [impresorasError, setImpresorasError] = useState("");
  const [imprimirAlCobrar, setImprimirAlCobrar] = useState(impresoras.imprimirAlCobrar);
  const [imprimirAlIniciarServicio, setImprimirAlIniciarServicio] = useState(
    impresoras.imprimirAlIniciarServicio,
  );
  const [documentoAlIniciarServicio, setDocumentoAlIniciarServicio] = useState(
    impresoras.documentoAlIniciarServicio,
  );
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");

  useEffect(() => {
    setModoImpresion(impresoras.modoImpresion);
    setNombreImpresoraTicket(impresoras.nombreImpresoraTicket);
    setTamanoTicket(impresoras.tamanoTicket);
    setNombreImpresoraHojaServicio(impresoras.nombreImpresoraHojaServicio);
    setTamanoHojaServicio(impresoras.tamanoHojaServicio);
    setSalidaTicketMovil(impresoras.salidaTicketMovil);
    setImprimirAlCobrar(impresoras.imprimirAlCobrar);
    setImprimirAlIniciarServicio(impresoras.imprimirAlIniciarServicio);
    setDocumentoAlIniciarServicio(impresoras.documentoAlIniciarServicio);
  }, [
    impresoras.documentoAlIniciarServicio,
    impresoras.imprimirAlCobrar,
    impresoras.imprimirAlIniciarServicio,
    impresoras.modoImpresion,
    impresoras.nombreImpresoraHojaServicio,
    impresoras.nombreImpresoraTicket,
    impresoras.tamanoTicket,
    impresoras.salidaTicketMovil,
    impresoras.tamanoHojaServicio,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncDevice = () => {
      setEsDispositivoMovil(detectMobileDevice());
    };

    syncDevice();
    window.addEventListener("resize", syncDevice);
    window.addEventListener("orientationchange", syncDevice);

    return () => {
      window.removeEventListener("resize", syncDevice);
      window.removeEventListener("orientationchange", syncDevice);
    };
  }, []);

  const resumenImpresoraTicket = useMemo(() => {
    const name = String(nombreImpresoraTicket || "").trim();
    return name || "Predeterminada del sistema";
  }, [nombreImpresoraTicket]);
  const resumenImpresoraHojaServicio = useMemo(() => {
    const name = String(nombreImpresoraHojaServicio || "").trim();
    return name || "Predeterminada del sistema";
  }, [nombreImpresoraHojaServicio]);
  const resumenTamanoHojaServicio = useMemo(() => {
    return getTamanoHojaServicioLabel({ tamanoHojaServicio });
  }, [tamanoHojaServicio]);
  const resumenSalidaTicketMovil = useMemo(() => {
    return getSalidaTicketMovilLabel({ salidaTicketMovil });
  }, [salidaTicketMovil]);
  const impresorasDisponibles = useMemo(() => {
    return impresorasPc
      .map((item) => item?.name || "")
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index);
  }, [impresorasPc]);
  const aliasDisponibles = useMemo(() => {
    return [
      ...impresorasDisponibles,
      String(nombreImpresoraTicket || "").trim(),
      String(nombreImpresoraHojaServicio || "").trim(),
    ]
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index);
  }, [impresorasDisponibles, nombreImpresoraHojaServicio, nombreImpresoraTicket]);

  const estadoCobro = imprimirAlCobrar ? "Activo al cobrar" : "Sin autoimpresion al cobrar";
  const estadoInicio = imprimirAlIniciarServicio
    ? `Activo al iniciar servicio: ${getDocumentoInicioServicioLabel({
      documentoAlIniciarServicio,
    })}`
    : "Sin autoimpresion al iniciar servicio";

  const probarImpresion = () => {
    imprimirTicketVenta({
      ventaId: "PRN-TEST-001",
      fecha: new Date(),
      atendio: "Configuracion",
      cliente: {
        nombre: "Cliente de prueba",
        telefono: "2711234567",
      },
      tipoPago: "efectivo",
      referenciaTarjeta: "",
      productos: [
        {
          id: "test-1",
          nombre: serviciosHabilitados ? "Servicio de prueba" : "Venta de prueba",
          cantidad: 1,
          precioVenta: 150,
          esServicio: serviciosHabilitados,
          servicioFolio: serviciosHabilitados ? "SV-TEST-01" : "",
        },
      ],
      estado: "Pagado",
      subtotal: 150,
      aplicaIVA: true,
      ivaPorcentaje: 0.16,
      iva: 24,
      total: 174,
    });
  };

  const descargarDriverLocal = () => {
    const installerContent = buildPrinterBridgeInstaller(
      `${window.location.origin}/printer-bridge`,
    );
    downloadTextFile("Instalar_Puente_Impresora.cmd", installerContent, "text/plain;charset=utf-8");
    setMensaje("Se descargo el driver local.");
    window.setTimeout(() => setMensaje(""), 2500);
  };

  const cargarImpresorasPc = useCallback(async () => {
    try {
      setCargandoImpresoras(true);
      setImpresorasError("");
      const result = await fetchLocalPrinters();
      setImpresorasPc(result.printers || []);
      setImpresorasMsg("Lista de impresoras actualizada.");
    } catch {
      const cachedPrinters = readLocalPrintersCache();
      if (cachedPrinters.length > 0) {
        setImpresorasPc(cachedPrinters);
        setImpresorasMsg("Mostrando la ultima lista disponible en esta PC.");
        setImpresorasError("");
      } else {
        setImpresorasMsg("");
        setImpresorasError("No se pudo actualizar la lista de impresoras en este momento.");
      }
    } finally {
      setCargandoImpresoras(false);
    }
  }, []);

  const handleGuardar = async () => {
    if (guardando) return;

    try {
      setGuardando(true);
      setErrorDetalle("");

      await actualizarImpresorasConfig({
        modoImpresion,
        nombreImpresoraTicket,
        tamanoTicket,
        nombreImpresoraHojaServicio,
        tamanoHojaServicio,
        salidaTicketMovil,
        imprimirAlCobrar,
        imprimirAlIniciarServicio,
        documentoAlIniciarServicio,
      });

      setMensaje("Configuracion de impresoras guardada.");
      window.setTimeout(() => setMensaje(""), 2500);
    } catch (error) {
      console.error("No se pudo guardar configuracion de impresoras:", error);
      setMensaje("No se pudo guardar la configuracion.");
      setErrorDetalle(String(error?.code || error?.message || "Error desconocido"));
      window.setTimeout(() => setMensaje(""), 2500);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="cfg-pos-wrap">
      <div className="cfg-pos-page-head">
        <h2>Impresoras</h2>
        <p>
          {serviciosHabilitados
            ? "Centraliza la impresion automatica del cobro en POS y del alta de servicio."
            : "Centraliza la impresion automatica del cobro en POS y las preferencias del equipo local."}
        </p>
      </div>

      <div className="cfg-pos-card cfg-billing-card cfg-printer-layout-card">
        <div className="cfg-servicios-head">
          <div>
            <h3>Flujo de impresion</h3>
            <p>Define como se dispara la impresion y en que momentos se ejecuta automaticamente.</p>
          </div>
          <button type="button" className="cfg-ticket-test-btn" onClick={probarImpresion}>
            Probar impresion
          </button>
        </div>

        <div className="cfg-billing-grid cfg-printer-grid">
          <div className="cfg-ticket-block">
            <h4>Modo de impresion</h4>
            <label>Comportamiento deseado</label>
            <select
              value={modoImpresion}
              onChange={(e) => setModoImpresion(e.target.value)}
            >
              <option value="dialogo">Abrir dialogo del navegador</option>
              <option value="silenciosa">Impresion silenciosa</option>
            </select>

            <div className="cfg-empresa-preview">
              <strong>Modo actual:</strong> {getModoImpresionLabel({ modoImpresion })}
            </div>

            <small className="cfg-pos-help">
              El modo y la impresora se guardan por computadora.
            </small>
          </div>

          {esDispositivoMovil && (
            <div className="cfg-ticket-block">
              <h4>Ticket en movil</h4>
              <label>Al imprimir desde este dispositivo</label>
              <select
                value={salidaTicketMovil}
                onChange={(e) => setSalidaTicketMovil(e.target.value)}
              >
                <option value="dialogo">Abrir dialogo del navegador</option>
                <option value="imagen">Guardar o compartir como imagen</option>
              </select>

              <div className="cfg-company-managed">
                Preferencia local para ticket movil
                <strong>{resumenSalidaTicketMovil}</strong>
              </div>

              <small className="cfg-pos-help">
                Esta opcion se guarda solo en este dispositivo. En iPhone conviene usar imagen para
                mandarlo a PrinterApp sin espacios grandes.
              </small>
            </div>
          )}

          <div className="cfg-ticket-block">
            <h4>Impresora de tickets</h4>
            <label>Ancho del papel térmico</label>
            <select value={tamanoTicket} onChange={(e) => setTamanoTicket(e.target.value)}>
              <option value="58mm">58 mm</option>
              <option value="80mm">80 mm</option>
            </select>
            <small className="cfg-pos-help">
              Se aplica a tickets de POS y documentos térmicos de facturación.
            </small>
            <label>Nombre o alias para tickets</label>
            <select
              value={nombreImpresoraTicket}
              onChange={(e) => setNombreImpresoraTicket(e.target.value)}
            >
              <option value="">Predeterminada del sistema</option>
              {aliasDisponibles.map((alias) => (
                <option
                  key={alias}
                  value={alias}
                >
                  {alias}
                </option>
              ))}
            </select>

            <div className="cfg-printer-alias-list">
              <div className="cfg-printer-list-head">
                <button
                  type="button"
                  className="cfg-ticket-test-btn"
                  onClick={cargarImpresorasPc}
                  disabled={cargandoImpresoras}
                >
                  {cargandoImpresoras ? "Buscando..." : "Actualizar lista"}
                </button>
              </div>
              {cargandoImpresoras && aliasDisponibles.length === 0 ? (
                <span className="cfg-printer-hint">Buscando impresoras instaladas...</span>
              ) : null}
              {!cargandoImpresoras && aliasDisponibles.length === 0 ? (
                <span className="cfg-printer-hint">No se encontraron impresoras disponibles.</span>
              ) : null}
              {impresorasMsg ? <small className="cfg-pos-saved">{impresorasMsg}</small> : null}
              {impresorasError ? <small className="cfg-pos-help">{impresorasError}</small> : null}
            </div>

            <div className="cfg-company-managed">
              Impresora seleccionada para tickets
              <strong>{resumenImpresoraTicket}</strong>
            </div>
          </div>

          {serviciosHabilitados && (
            <div className="cfg-ticket-block">
              <h4>Impresora hoja de servicio</h4>
              <label>Nombre o alias para hoja de servicio</label>
            <select
              value={nombreImpresoraHojaServicio}
              onChange={(e) => setNombreImpresoraHojaServicio(e.target.value)}
            >
              <option value="">Predeterminada del sistema</option>
              {aliasDisponibles.map((alias) => (
                <option
                  key={`hoja-${alias}`}
                  value={alias}
                >
                  {alias}
                </option>
              ))}
            </select>

            <div className="cfg-company-managed">
              Impresora seleccionada para hoja
              <strong>{resumenImpresoraHojaServicio}</strong>
            </div>

            <label>Tamaño de la hoja</label>
            <select
              value={tamanoHojaServicio}
              onChange={(e) => setTamanoHojaServicio(e.target.value)}
            >
              <option value="a4">A4</option>
              <option value="carta">Carta</option>
            </select>

            <div className="cfg-company-managed">
              Tamaño configurado para hoja
              <strong>{resumenTamanoHojaServicio}</strong>
            </div>

            <small className="cfg-pos-help">
              Aplica al PDF de la hoja y a la impresion silenciosa cuando el driver local este
              actualizado.
            </small>
            </div>
          )}

          <div className="cfg-ticket-block">
            <h4>Eventos automaticos</h4>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={imprimirAlCobrar}
                onChange={(e) => setImprimirAlCobrar(e.target.checked)}
              />
              <span>Imprimir ticket automaticamente al cobrar en POS</span>
            </label>

            {serviciosHabilitados && (
              <>
                <label className="cfg-check-row">
                  <input
                    type="checkbox"
                    checked={imprimirAlIniciarServicio}
                    onChange={(e) => setImprimirAlIniciarServicio(e.target.checked)}
                  />
                  <span>Imprimir automaticamente al iniciar un servicio</span>
                </label>

                <label>Documento al iniciar servicio</label>
                <select
                  value={documentoAlIniciarServicio}
                  onChange={(e) => setDocumentoAlIniciarServicio(e.target.value)}
                  disabled={!imprimirAlIniciarServicio}
                >
                  <option value="ticket">Ticket de servicio</option>
                  <option value="hoja">Hoja de servicio</option>
                  <option value="ambos">Ticket y hoja de servicio</option>
                </select>

                <small className="cfg-pos-help">
                  En modo silencioso, la hoja se imprime sin abrir ventana usando la impresora de
                  hoja de servicio.
                </small>
              </>
            )}

            <div className="cfg-servicios-canje-summary cfg-printer-summary">
              <span>{estadoCobro}</span>
              {serviciosHabilitados ? <span>{estadoInicio}</span> : null}
            </div>
          </div>
        </div>

        <div className="cfg-ticket-block cfg-printer-driver-panel">
          <h4>Driver local</h4>

          <div className="cfg-printer-driver-card">
            <div className="cfg-printer-driver-copy">
              <span className="cfg-printer-driver-badge">Disponible solo en Windows</span>
              <strong>Activador local de impresoras</strong>
              <p>
                Descarga este archivo y ejecútalo una sola vez en esta PC para activar las
                impresoras locales. No requiere instalar Node.js.
              </p>
              <small className="cfg-pos-help">
                Activalo en esta computadora para leer impresoras locales y usar impresion
                silenciosa.
              </small>
            </div>

            <button
              type="button"
              className="cfg-ticket-test-btn cfg-printer-driver-btn"
              onClick={descargarDriverLocal}
            >
              Instalar conector de impresoras
            </button>
          </div>
        </div>
      </div>

      <div className="cfg-servicios-savebar">
        <button
          type="button"
          className="cfg-ticket-test-btn"
          onClick={handleGuardar}
          disabled={guardando}
        >
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>

        <small className="cfg-pos-help">
          Los eventos automaticos se comparten en el sistema, pero la impresora y el modo se
          guardan solo en esta PC.
        </small>
        {mensaje ? <small className="cfg-pos-saved">{mensaje}</small> : null}
        {errorDetalle ? <small className="cfg-pos-help">Detalle: {errorDetalle}</small> : null}
      </div>
    </section>
  );
}
