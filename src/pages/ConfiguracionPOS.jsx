import { useEffect, useMemo, useState } from "react";
import { imprimirTicketVenta } from "../components/print_ticket_venta";
import logoUrl from "../assets/logo.png";
import {
  readTicketConfigStorage,
  saveTicketConfigStorage,
  splitTicketLines,
} from "../js/services/ticket_config";
import {
  DEFAULT_FACTURACION_CONFIG,
  readFacturacionConfigStorage,
  saveFacturacionConfigStorage,
} from "../js/services/facturacion_config";

const IVA_STORAGE_KEY = "pos_aplicar_iva";

function leerIVAStorage() {
  try {
    return localStorage.getItem(IVA_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("es-MX");
}

function shortenText(value, max = 38) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function formatFacturaFolio(serie, folio) {
  const serieOk = String(serie || "A").trim() || "A";
  const folioNum = Number(folio) > 0 ? Number(folio) : 1;
  return `${serieOk}-${String(Math.floor(folioNum)).padStart(6, "0")}`;
}

export default function ConfiguracionPOS() {
  const [aplicarIVA, setAplicarIVA] = useState(leerIVAStorage);
  const [ticketCfg, setTicketCfg] = useState(readTicketConfigStorage);
  const [factCfg, setFactCfg] = useState(readFacturacionConfigStorage);
  const [guardado, setGuardado] = useState(false);
  const [panelesAbiertos, setPanelesAbiertos] = useState({
    iva: true,
    facturacion: true,
    ticket: true,
  });

  useEffect(() => {
    try {
      localStorage.setItem(IVA_STORAGE_KEY, aplicarIVA ? "1" : "0");
      const ok = saveTicketConfigStorage(ticketCfg) && saveFacturacionConfigStorage(factCfg);
      if (!ok) throw new Error("No se pudo guardar ticket config");
      setGuardado(true);
      const t = setTimeout(() => setGuardado(false), 1200);
      return () => clearTimeout(t);
    } catch {
      setGuardado(false);
      return undefined;
    }
  }, [aplicarIVA, ticketCfg, factCfg]);

  const actualizarTicket = (key, value) => {
    setTicketCfg((prev) => ({ ...prev, [key]: value }));
  };

  const actualizarFacturacion = (key, value) => {
    setFactCfg((prev) => ({ ...prev, [key]: value }));
  };

  const alternarPanel = (panel) => {
    setPanelesAbiertos((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const datosClienteEjemplo = useMemo(
    () => ({
      nombre: "Cliente de prueba",
      telefono: "2711234567",
    }),
    [],
  );
  const atendioEjemplo = "Usuario demo";

  const productosEjemplo = useMemo(
    () => [
      {
        nombre: "Cable HDMI 2m",
        cantidad: 2,
        precioVenta: 129,
        esServicio: false,
      },
      {
        nombre: "Servicio mantenimiento laptop",
        cantidad: 1,
        precioVenta: 450,
        esServicio: true,
        servicioFolio: "S/N04032601",
      },
    ],
    [],
  );

  const fechaEjemplo = useMemo(() => new Date(), []);
  const subtotalEjemplo = useMemo(
    () =>
      productosEjemplo.reduce(
        (acc, item) => acc + Number(item.precioVenta || 0) * Number(item.cantidad || 0),
        0,
      ),
    [productosEjemplo],
  );
  const ivaRateEjemplo = aplicarIVA ? 0.16 : 0;
  const ivaEjemplo = subtotalEjemplo * ivaRateEjemplo;
  const totalEjemplo = subtotalEjemplo + ivaEjemplo;
  const topLinesPreview = useMemo(
    () => splitTicketLines(ticketCfg.extraTopLines),
    [ticketCfg.extraTopLines],
  );
  const bottomLinesPreview = useMemo(
    () => splitTicketLines(ticketCfg.extraBottomLines),
    [ticketCfg.extraBottomLines],
  );
  const facturaFolioPreview = useMemo(
    () => formatFacturaFolio(factCfg.serie, factCfg.folioActual),
    [factCfg.serie, factCfg.folioActual],
  );

  const probarImpresion = () => {
    imprimirTicketVenta({
      ventaId: "VTA-PRUEBA-001",
      fecha: fechaEjemplo,
      atendio: atendioEjemplo,
      cliente: datosClienteEjemplo,
      tipoPago: "efectivo",
      referenciaTarjeta: "",
      productos: productosEjemplo,
      estado: "Pagado",
      subtotal: subtotalEjemplo,
      aplicaIVA,
      ivaPorcentaje: ivaRateEjemplo,
      iva: ivaEjemplo,
      total: totalEjemplo,
      ticketConfig: ticketCfg,
    });
  };

  return (
    <section className="cfg-pos-wrap">
      <div className="cfg-pos-page-head">
        <h2>POS y Facturacion</h2>
        <p>Configura IVA, facturacion y ticket de venta desde un solo lugar.</p>
      </div>

      <div className="cfg-pos-card cfg-pos-overview-card">
        <button
          type="button"
          className="cfg-collapse-head"
          onClick={() => alternarPanel("iva")}
          aria-expanded={panelesAbiertos.iva}
        >
          <div className="cfg-collapse-title-wrap">
            <h3 className="cfg-collapse-title">Configuracion de IVA</h3>
            <p className="cfg-collapse-subtitle">
              Activa o desactiva el IVA para POS y ticket de venta.
            </p>
          </div>
          <div className="cfg-collapse-meta">
            <span className={`cfg-pos-overview-pill ${aplicarIVA ? "on" : "off"}`}>
              {aplicarIVA ? "IVA activo" : "IVA inactivo"}
            </span>
            <span className={`cfg-collapse-arrow ${panelesAbiertos.iva ? "open" : ""}`}>v</span>
          </div>
        </button>

        {panelesAbiertos.iva && (
          <div className="cfg-collapse-body">
            <div className="cfg-pos-overview-controls">
              <label className="cfg-pos-iva-row">
                <input
                  type="checkbox"
                  checked={aplicarIVA}
                  onChange={(e) => setAplicarIVA(e.target.checked)}
                />
                <span>Habilitar IVA (16%)</span>
              </label>

              <div className={`cfg-pos-status ${aplicarIVA ? "on" : "off"}`}>
                Estado actual: {aplicarIVA ? "IVA habilitado" : "IVA deshabilitado"}
              </div>
            </div>

            <small className="cfg-pos-help">
              Este ajuste impacta el total mostrado en POS y el ticket de venta.
            </small>
          </div>
        )}
      </div>

      <div className="cfg-pos-card cfg-billing-card">
        <button
          type="button"
          className="cfg-collapse-head"
          onClick={() => alternarPanel("facturacion")}
          aria-expanded={panelesAbiertos.facturacion}
        >
          <div className="cfg-collapse-title-wrap">
            <h3 className="cfg-collapse-title">Facturacion</h3>
            <p className="cfg-collapse-subtitle">
              Configuracion fiscal basica para emitir facturas desde POS.
            </p>
          </div>
          <div className="cfg-collapse-meta">
            <span className={`cfg-billing-pill ${factCfg.enabled ? "on" : "off"}`}>
              {factCfg.enabled ? "Facturacion activa" : "Facturacion inactiva"}
            </span>
            <span className={`cfg-collapse-arrow ${panelesAbiertos.facturacion ? "open" : ""}`}>v</span>
          </div>
        </button>

        {panelesAbiertos.facturacion && <div className="cfg-collapse-body">
        <div className="cfg-billing-grid">
          <div className="cfg-billing-block">
            <h4>Control de emision</h4>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={factCfg.enabled}
                onChange={(e) => actualizarFacturacion("enabled", e.target.checked)}
              />
              Habilitar facturacion en POS
            </label>

            <label>Modo de emision</label>
            <select
              value={factCfg.emisionMode}
              onChange={(e) => actualizarFacturacion("emisionMode", e.target.value)}
              disabled={!factCfg.enabled}
            >
              <option value="ticket_y_factura">Ticket y factura</option>
              <option value="factura_bajo_solicitud">Factura bajo solicitud</option>
              <option value="solo_factura">Solo factura</option>
            </select>

            <div className="cfg-billing-row">
              <label>Serie</label>
              <input
                value={factCfg.serie}
                onChange={(e) =>
                  actualizarFacturacion("serie", e.target.value.toUpperCase().slice(0, 8))
                }
                disabled={!factCfg.enabled}
                placeholder="A"
              />
            </div>

            <div className="cfg-billing-row">
              <label>Folio actual</label>
              <input
                type="number"
                min="1"
                value={factCfg.folioActual}
                onChange={(e) =>
                  actualizarFacturacion("folioActual", Math.max(1, Number(e.target.value || 1)))
                }
                disabled={!factCfg.enabled}
              />
            </div>

            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={factCfg.autoIncrement}
                onChange={(e) => actualizarFacturacion("autoIncrement", e.target.checked)}
                disabled={!factCfg.enabled}
              />
              Incrementar folio automaticamente
            </label>
          </div>

          <div className="cfg-billing-block">
            <h4>Datos del emisor</h4>
            <label>Razon social</label>
            <input
              value={factCfg.razonSocial}
              onChange={(e) => actualizarFacturacion("razonSocial", e.target.value)}
              disabled={!factCfg.enabled}
              placeholder="Nombre fiscal"
            />

            <label>RFC emisor</label>
            <input
              value={factCfg.rfcEmisor}
              onChange={(e) =>
                actualizarFacturacion(
                  "rfcEmisor",
                  e.target.value.toUpperCase().replace(/[^A-Z0-9&]/g, "").slice(0, 13),
                )
              }
              disabled={!factCfg.enabled}
              placeholder="XAXX010101000"
            />

            <label>Regimen fiscal</label>
            <select
              value={factCfg.regimenFiscal}
              onChange={(e) => actualizarFacturacion("regimenFiscal", e.target.value)}
              disabled={!factCfg.enabled}
            >
              <option value="601">601 - General de Ley</option>
              <option value="612">612 - Personas Fisicas</option>
              <option value="626">626 - Simplificado de Confianza</option>
            </select>

            <label>Codigo postal fiscal</label>
            <input
              value={factCfg.codigoPostalEmisor}
              onChange={(e) =>
                actualizarFacturacion("codigoPostalEmisor", e.target.value.replace(/\D/g, "").slice(0, 5))
              }
              disabled={!factCfg.enabled}
              placeholder="00000"
            />
          </div>

          <div className="cfg-billing-block">
            <h4>CFDI por defecto</h4>
            <label>Uso CFDI</label>
            <select
              value={factCfg.usoCFDI}
              onChange={(e) => actualizarFacturacion("usoCFDI", e.target.value)}
              disabled={!factCfg.enabled}
            >
              <option value="G03">G03 - Gastos en general</option>
              <option value="G01">G01 - Adquisicion de mercancias</option>
              <option value="S01">S01 - Sin efectos fiscales</option>
            </select>

            <label>Metodo de pago</label>
            <select
              value={factCfg.metodoPago}
              onChange={(e) => actualizarFacturacion("metodoPago", e.target.value)}
              disabled={!factCfg.enabled}
            >
              <option value="PUE">PUE - Pago en una sola exhibicion</option>
              <option value="PPD">PPD - Pago en parcialidades</option>
            </select>

            <label>Forma de pago</label>
            <select
              value={factCfg.formaPago}
              onChange={(e) => actualizarFacturacion("formaPago", e.target.value)}
              disabled={!factCfg.enabled}
            >
              <option value="01">01 - Efectivo</option>
              <option value="03">03 - Transferencia</option>
              <option value="04">04 - Tarjeta credito</option>
              <option value="28">28 - Tarjeta debito</option>
            </select>

            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={factCfg.requiereRFCCliente}
                onChange={(e) => actualizarFacturacion("requiereRFCCliente", e.target.checked)}
                disabled={!factCfg.enabled}
              />
              Solicitar RFC del cliente
            </label>

            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={factCfg.requiereCorreoCliente}
                onChange={(e) => actualizarFacturacion("requiereCorreoCliente", e.target.checked)}
                disabled={!factCfg.enabled}
              />
              Solicitar correo del cliente
            </label>

            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={factCfg.timbradoPruebas}
                onChange={(e) => actualizarFacturacion("timbradoPruebas", e.target.checked)}
                disabled={!factCfg.enabled}
              />
              Modo pruebas (sin timbrado real)
            </label>
          </div>

          <div className="cfg-billing-block cfg-billing-block-wide">
            <div className="cfg-billing-block-header">
              <h4>Terminos y vista previa</h4>
              <button
                type="button"
                className="cfg-ticket-test-btn"
                onClick={() => setFactCfg({ ...DEFAULT_FACTURACION_CONFIG })}
              >
                Restablecer
              </button>
            </div>

            <label>Terminos de factura</label>
            <textarea
              rows={3}
              value={factCfg.terminosFactura}
              onChange={(e) => actualizarFacturacion("terminosFactura", e.target.value)}
              placeholder="Ej. Factura valida para deduccion conforme a legislacion vigente."
              disabled={!factCfg.enabled}
            />

            <div className="cfg-billing-preview">
              <div className="cfg-billing-preview-head">
                <strong>Vista previa de factura</strong>
                <span>{facturaFolioPreview}</span>
              </div>
              <div className="cfg-billing-preview-grid">
                <div>
                  <b>Emisor:</b> {factCfg.razonSocial || "-"}
                </div>
                <div>
                  <b>RFC:</b> {factCfg.rfcEmisor || "Pendiente"}
                </div>
                <div>
                  <b>Regimen:</b> {factCfg.regimenFiscal}
                </div>
                <div>
                  <b>CP:</b> {factCfg.codigoPostalEmisor || "00000"}
                </div>
                <div>
                  <b>Uso CFDI:</b> {factCfg.usoCFDI}
                </div>
                <div>
                  <b>Metodo/Forma:</b> {factCfg.metodoPago} / {factCfg.formaPago}
                </div>
              </div>
            </div>
          </div>
        </div>

          <small className="cfg-pos-help">
            Configuracion guardada automaticamente para el flujo de facturacion.
          </small>
        </div>}
      </div>

      <div className="cfg-pos-card cfg-ticket-card">
        <button
          type="button"
          className="cfg-collapse-head"
          onClick={() => alternarPanel("ticket")}
          aria-expanded={panelesAbiertos.ticket}
        >
          <div className="cfg-collapse-title-wrap">
            <h3 className="cfg-collapse-title">Personalizacion del ticket de venta</h3>
            <p className="cfg-collapse-subtitle">
              Activa o desactiva elementos del ticket impreso.
            </p>
          </div>
          <div className="cfg-collapse-meta">
            <span className="cfg-billing-pill on">Ticket listo</span>
            <span className={`cfg-collapse-arrow ${panelesAbiertos.ticket ? "open" : ""}`}>v</span>
          </div>
        </button>

        {panelesAbiertos.ticket && <div className="cfg-collapse-body">
        <div className="cfg-ticket-head">
          <h4>Vista previa y controles</h4>
          <button type="button" className="cfg-ticket-test-btn" onClick={probarImpresion}>
            Probar impresion
          </button>
        </div>

        <div className="cfg-ticket-editor-layout">
          <div className="cfg-ticket-preview-wrap">
            <h4>Visualizador del ticket</h4>

            <div className="cfg-ticket-preview-frame">
              <div className="cfg-ticket-preview-paper">
                <div className="cfg-ticket-preview-header">
                  {ticketCfg.showLogo && (
                    <div className="cfg-ticket-preview-logo">
                      <img src={logoUrl} alt="Logo negocio" />
                    </div>
                  )}

                  <div className="cfg-ticket-preview-title">Ticket de venta</div>

                  {ticketCfg.showBusinessData && (
                    <>
                      {ticketCfg.businessName?.trim() && (
                        <div className="cfg-ticket-preview-sub">{ticketCfg.businessName.trim()}</div>
                      )}
                      {ticketCfg.businessAddress?.trim() && (
                        <div className="cfg-ticket-preview-sub">{ticketCfg.businessAddress.trim()}</div>
                      )}
                      {ticketCfg.businessPhone?.trim() && (
                        <div className="cfg-ticket-preview-sub">{ticketCfg.businessPhone.trim()}</div>
                      )}
                    </>
                  )}

                  <div className="cfg-ticket-preview-sub">
                    Folio: <b>VTA-PRUEBA-001</b>
                  </div>
                  <div className="cfg-ticket-preview-sub">Fecha: {formatDate(fechaEjemplo)}</div>
                  <div className="cfg-ticket-preview-sub">Atendio: {atendioEjemplo}</div>

                  {topLinesPreview.map((line, idx) => (
                    <div key={`top-${idx}`} className="cfg-ticket-preview-extra">
                      {line}
                    </div>
                  ))}
                </div>

                {ticketCfg.showClientSection && (
                  <div className="cfg-ticket-preview-section">
                    <div className="cfg-ticket-preview-section-title">Cliente</div>
                    {ticketCfg.showClientName && <div>{datosClienteEjemplo.nombre}</div>}
                    {ticketCfg.showClientPhone && <div>Tel: {datosClienteEjemplo.telefono}</div>}
                  </div>
                )}

                <div className="cfg-ticket-preview-section">
                  <div className="cfg-ticket-preview-section-title">Conceptos y precio</div>
                  {productosEjemplo.map((p, idx) => {
                    const cantidad = Number(p.cantidad || 0);
                    const precio = Number(p.precioVenta || 0);
                    const totalLinea = cantidad * precio;
                    const nombre = ticketCfg.fullDescription ? p.nombre : shortenText(p.nombre);
                    const etiqueta = p.esServicio
                      ? `Servicio ${p.servicioFolio || ""}`
                      : "Producto";
                    return (
                      <div key={`item-${idx}`} className="cfg-ticket-preview-item">
                        <div className="cfg-ticket-preview-item-name">{nombre || "-"}</div>
                        {ticketCfg.showProductMeta && (
                          <div className="cfg-ticket-preview-item-meta">{etiqueta}</div>
                        )}
                        <div className="cfg-ticket-preview-item-row">
                          <span>
                            {ticketCfg.showUnitPrice
                              ? `${cantidad} x ${formatMoney(precio)}`
                              : `${cantidad} pza`}
                          </span>
                          <b>{formatMoney(totalLinea)}</b>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {ticketCfg.showPaymentSection && (
                  <div className="cfg-ticket-preview-section">
                    <div className="cfg-ticket-preview-section-title">Pago</div>
                    <div>
                      <b>Metodo:</b> Efectivo
                    </div>
                  </div>
                )}

                {ticketCfg.showStatusSection && (
                  <div className="cfg-ticket-preview-section">
                    <div className="cfg-ticket-preview-section-title">Estado actual</div>
                    <div className="cfg-ticket-preview-status-row">
                      <span className="cfg-ticket-preview-dot" />
                      <span className="cfg-ticket-preview-status-pill">Pagado</span>
                    </div>
                  </div>
                )}

                <div className="cfg-ticket-preview-divider" />

                <div className="cfg-ticket-preview-section">
                  <div className="cfg-ticket-preview-item-row">
                    <span>Subtotal</span>
                    <span>{formatMoney(subtotalEjemplo)}</span>
                  </div>
                  {aplicarIVA && (
                    <div className="cfg-ticket-preview-item-row">
                      <span>IVA (16%)</span>
                      <span>{formatMoney(ivaEjemplo)}</span>
                    </div>
                  )}
                  <div className="cfg-ticket-preview-item-row cfg-ticket-preview-total">
                    <span>Total</span>
                    <span>{formatMoney(totalEjemplo)}</span>
                  </div>
                </div>

                {bottomLinesPreview.map((line, idx) => (
                  <div key={`bottom-${idx}`} className="cfg-ticket-preview-extra">
                    {line}
                  </div>
                ))}

                {ticketCfg.showLegend && ticketCfg.legendText?.trim() && (
                  <div className="cfg-ticket-preview-legend">{ticketCfg.legendText.trim()}</div>
                )}

                {ticketCfg.footerText?.trim() && (
                  <div className="cfg-ticket-preview-footer">{ticketCfg.footerText.trim()}</div>
                )}
              </div>
            </div>
          </div>

          <div className="cfg-ticket-controls">
            <div className="cfg-ticket-grid">
              <div className="cfg-ticket-block">
            <h4>Encabezado</h4>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={ticketCfg.showLogo}
                onChange={(e) => actualizarTicket("showLogo", e.target.checked)}
              />
              Mostrar logo del negocio
            </label>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={ticketCfg.showBusinessData}
                onChange={(e) => actualizarTicket("showBusinessData", e.target.checked)}
              />
              Mostrar datos del negocio
            </label>

            <label>Nombre del negocio</label>
            <input
              value={ticketCfg.businessName}
              onChange={(e) => actualizarTicket("businessName", e.target.value)}
              placeholder="Ej. LuisITRepair"
            />

            <label>Direccion</label>
            <input
              value={ticketCfg.businessAddress}
              onChange={(e) => actualizarTicket("businessAddress", e.target.value)}
              placeholder="Ej. Calle 5 #123"
            />

            <label>Telefono</label>
            <input
              value={ticketCfg.businessPhone}
              onChange={(e) => actualizarTicket("businessPhone", e.target.value)}
              placeholder="Ej. 2711234567"
            />
          </div>

              <div className="cfg-ticket-block">
            <h4>Contenido</h4>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={ticketCfg.showUnitPrice}
                onChange={(e) => actualizarTicket("showUnitPrice", e.target.checked)}
              />
              Incluir precio unitario
            </label>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={ticketCfg.fullDescription}
                onChange={(e) => actualizarTicket("fullDescription", e.target.checked)}
              />
              Imprimir descripcion completa
            </label>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={ticketCfg.showProductMeta}
                onChange={(e) => actualizarTicket("showProductMeta", e.target.checked)}
              />
              Mostrar tipo (producto/servicio)
            </label>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={ticketCfg.showClientSection}
                onChange={(e) => actualizarTicket("showClientSection", e.target.checked)}
              />
              Mostrar seccion cliente
            </label>
            <label className="cfg-check-row cfg-check-indent">
              <input
                type="checkbox"
                checked={ticketCfg.showClientName}
                onChange={(e) => actualizarTicket("showClientName", e.target.checked)}
                disabled={!ticketCfg.showClientSection}
              />
              Nombre del cliente
            </label>
            <label className="cfg-check-row cfg-check-indent">
              <input
                type="checkbox"
                checked={ticketCfg.showClientPhone}
                onChange={(e) => actualizarTicket("showClientPhone", e.target.checked)}
                disabled={!ticketCfg.showClientSection}
              />
              Telefono del cliente
            </label>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={ticketCfg.showPaymentSection}
                onChange={(e) => actualizarTicket("showPaymentSection", e.target.checked)}
              />
              Mostrar seccion pago
            </label>
            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={ticketCfg.showStatusSection}
                onChange={(e) => actualizarTicket("showStatusSection", e.target.checked)}
              />
              Mostrar estado actual
            </label>
          </div>

              <div className="cfg-ticket-block cfg-ticket-block-wide">
            <h4>Mensajes</h4>
            <label>Lineas adicionales arriba</label>
            <textarea
              rows={3}
              value={ticketCfg.extraTopLines}
              onChange={(e) => actualizarTicket("extraTopLines", e.target.value)}
              placeholder="Una linea por renglon"
            />

            <label>Lineas adicionales abajo</label>
            <textarea
              rows={3}
              value={ticketCfg.extraBottomLines}
              onChange={(e) => actualizarTicket("extraBottomLines", e.target.value)}
              placeholder="Una linea por renglon"
            />

            <label className="cfg-check-row">
              <input
                type="checkbox"
                checked={ticketCfg.showLegend}
                onChange={(e) => actualizarTicket("showLegend", e.target.checked)}
              />
              Mostrar leyenda de cambios
            </label>

            <label>Leyenda</label>
            <textarea
              rows={3}
              value={ticketCfg.legendText}
              onChange={(e) => actualizarTicket("legendText", e.target.value)}
              placeholder="Se aceptan cambios..."
              disabled={!ticketCfg.showLegend}
            />

            <label>Mensaje final</label>
            <input
              value={ticketCfg.footerText}
              onChange={(e) => actualizarTicket("footerText", e.target.value)}
              placeholder="Gracias por tu preferencia"
            />
              </div>
            </div>
          </div>
        </div>

          <small className="cfg-pos-help">
            Se guarda automaticamente y aplica al ticket que se imprime desde POS.
          </small>

          {guardado && <small className="cfg-pos-saved">Guardado automaticamente.</small>}
        </div>}
      </div>
    </section>
  );
}
