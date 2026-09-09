import { useEffect, useMemo, useState } from "react";
import useServiciosConfig from "../hooks/useServiciosConfig";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import {
  actualizarServiciosConfig,
  DEFAULT_TERMINOS_SERVICIO,
  describeRetardoConfig,
} from "../js/services/configure_servicios";
import { obtenerProductos } from "../js/services/POS_firebase";

function moneyInput(value) {
  return String(value ?? "").replace(/[^\d.]/g, "");
}

function integerInput(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function createCanjeRow() {
  return {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    productId: "",
    puntos: "100",
    activo: true,
  };
}

function createTermRow(text = "") {
  return {
    id: `term_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text,
  };
}

export default function ConfiguracionServicios() {
  const { serviciosHabilitados } = useEmpresaConfig();
  const {
    precioRevision,
    catalogoCanjes,
    habilitarCanjes,
    hojaServicioHabilitada,
    terminosServicio,
    politicaRetardo,
  } = useServiciosConfig();

  const [precio, setPrecio] = useState(String(precioRevision || 0));
  const [canjesDeshabilitados, setCanjesDeshabilitados] = useState(habilitarCanjes);
  const [emitirHojaServicio, setEmitirHojaServicio] = useState(hojaServicioHabilitada);
  const [retardoHabilitado, setRetardoHabilitado] = useState(!!politicaRetardo?.habilitado);
  const [retardoDias, setRetardoDias] = useState(String(politicaRetardo?.diasTolerancia ?? 3));
  const [retardoCargo, setRetardoCargo] = useState(String(politicaRetardo?.cargo ?? 0));
  const [retardoCadaDias, setRetardoCadaDias] = useState(
    String(politicaRetardo?.aplicarCadaDias ?? 1),
  );
  const [abandonoDias, setAbandonoDias] = useState(String(politicaRetardo?.abandonoDias ?? 30));
  const [abandonoSiSuperaCosto, setAbandonoSiSuperaCosto] = useState(
    politicaRetardo?.abandonoSiSuperaCosto !== false,
  );
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");
  const [productos, setProductos] = useState([]);
  const [canjes, setCanjes] = useState([createCanjeRow()]);
  const [terminos, setTerminos] = useState(DEFAULT_TERMINOS_SERVICIO.map((item) => createTermRow(item)));

  const mostrarCanjesEnVistas = !canjesDeshabilitados;
  const hojaServicioActiva = !!emitirHojaServicio;
  const politicaRetardoPreview = describeRetardoConfig({
    habilitado: retardoHabilitado,
    diasTolerancia: retardoDias,
    cargo: retardoCargo,
    aplicarCadaDias: retardoCadaDias,
    abandonoDias,
    abandonoSiSuperaCosto,
  });

  useEffect(() => {
    setPrecio(String(precioRevision || 0));
  }, [precioRevision]);

  useEffect(() => {
    setCanjesDeshabilitados(habilitarCanjes);
  }, [habilitarCanjes]);

  useEffect(() => {
    setEmitirHojaServicio(hojaServicioHabilitada);
  }, [hojaServicioHabilitada]);

  useEffect(() => {
    setTerminos(
      Array.isArray(terminosServicio) && terminosServicio.length
        ? terminosServicio.map((item) => createTermRow(item))
        : DEFAULT_TERMINOS_SERVICIO.map((item) => createTermRow(item)),
    );
  }, [terminosServicio]);

  useEffect(() => {
    setRetardoHabilitado(!!politicaRetardo?.habilitado);
    setRetardoDias(String(politicaRetardo?.diasTolerancia ?? 3));
    setRetardoCargo(String(politicaRetardo?.cargo ?? 0));
    setRetardoCadaDias(String(politicaRetardo?.aplicarCadaDias ?? 1));
    setAbandonoDias(String(politicaRetardo?.abandonoDias ?? 30));
    setAbandonoSiSuperaCosto(politicaRetardo?.abandonoSiSuperaCosto !== false);
  }, [politicaRetardo]);

  useEffect(() => {
    setCanjes(
      Array.isArray(catalogoCanjes) && catalogoCanjes.length
        ? catalogoCanjes.map((item) => ({
            id: item.id || `canje_${item.productId}`,
            productId: item.productId || "",
            puntos: String(Number(item.puntos || 0) || 0),
            activo: item.activo !== false,
          }))
        : [createCanjeRow()],
    );
  }, [catalogoCanjes]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const inventario = await obtenerProductos();
        if (!alive) return;
        setProductos(Array.isArray(inventario) ? inventario : []);
      } catch (error) {
        console.warn("No se pudo cargar inventario para canjes:", error?.code || error);
        if (alive) setProductos([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const productosDisponibles = useMemo(
    () =>
      productos
        .filter((producto) => producto?.activo !== false)
        .sort((a, b) => String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es")),
    [productos],
  );

  const productosMap = useMemo(
    () => new Map(productosDisponibles.map((producto) => [producto.id, producto])),
    [productosDisponibles],
  );

  const canjesActivos = useMemo(
    () => canjes.filter((item) => item.productId && Number(item.puntos || 0) > 0 && item.activo),
    [canjes],
  );

  const updateCanje = (id, patch) => {
    setCanjes((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addCanje = () => {
    setCanjes((prev) => [...prev, createCanjeRow()]);
  };

  const removeCanje = (id) => {
    setCanjes((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return next.length ? next : [createCanjeRow()];
    });
  };

  const updateTerm = (id, text) => {
    setTerminos((prev) => prev.map((item) => (item.id === id ? { ...item, text } : item)));
  };

  const addTerm = () => {
    setTerminos((prev) => [...prev, createTermRow("")]);
  };

  const removeTerm = (id) => {
    setTerminos((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return next.length ? next : [createTermRow(DEFAULT_TERMINOS_SERVICIO[0])];
    });
  };

  const handleGuardar = async () => {
    if (guardando) return;

    try {
      setGuardando(true);
      setErrorDetalle("");

      await actualizarServiciosConfig({
        precioRevision: moneyInput(precio),
        habilitarCanjes: canjesDeshabilitados,
        catalogoCanjes: canjes
          .filter((item) => item.productId)
          .map((item) => {
            const producto = productosMap.get(item.productId);
            return {
              id: item.id,
              productId: item.productId,
              nombreProducto: producto?.nombre || producto?.nombreProducto || "",
              puntos: integerInput(item.puntos),
              activo: item.activo !== false,
            };
          }),
        hojaServicio: {
          habilitada: hojaServicioActiva,
          terminos: terminos.map((item) => item.text.trim()).filter(Boolean),
          retardo: {
            habilitado: retardoHabilitado,
            diasTolerancia: integerInput(retardoDias),
            cargo: moneyInput(retardoCargo),
            aplicarCadaDias: integerInput(retardoCadaDias),
            abandonoDias: integerInput(abandonoDias),
            abandonoSiSuperaCosto,
          },
        },
      });

      setMensaje("Configuracion de servicios guardada.");
      window.setTimeout(() => setMensaje(""), 2500);
    } catch (error) {
      console.error("No se pudo guardar configuracion de servicios:", error);
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
        <h2>{serviciosHabilitados ? "Servicios" : "Canjes y fidelidad"}</h2>
        <p>
          {serviciosHabilitados
            ? "Configura precio, hojas de servicio, terminos, retardo y catalogo de canjes."
            : "Administra el programa de puntos y canjes mientras el modulo de servicios permanece oculto."}
        </p>
      </div>

      {!serviciosHabilitados && (
        <div className="cfg-pos-card cfg-empresa-card">
          <div className="cfg-ticket-block cfg-ticket-block-wide">
            <h4>Modo tienda de abarrotes</h4>
            <p className="cfg-pos-help">
              La hoja de servicio, su PDF y el seguimiento tecnico estan ocultos porque el tipo de
              negocio activo no usa el modulo de servicios.
            </p>
          </div>
        </div>
      )}

      {serviciosHabilitados && (
        <>
          <div className="cfg-pos-card cfg-empresa-card">
            <div className="cfg-ticket-block cfg-ticket-block-wide">
              <h4>Precio de revision</h4>
              <label htmlFor="servicios-precio-revision">Costo automatico al cancelar</label>
              <input
                id="servicios-precio-revision"
                type="text"
                inputMode="decimal"
                value={precio}
                onChange={(e) => setPrecio(moneyInput(e.target.value))}
                placeholder="Ej. 150"
                maxLength={12}
              />

              <div className="cfg-empresa-preview">
                <strong>Vista previa:</strong> ${Number(precio || 0).toFixed(2)}
              </div>

              <small className="cfg-pos-help">
                Cuando un servicio se marque como cancelado, este precio se cargara automaticamente.
              </small>
            </div>
          </div>

          <div className="cfg-pos-card cfg-servicios-card" id="hoja-servicio">
            <div className="cfg-servicios-head">
              <div>
                <h3>Hojas de servicio</h3>
                <p>Activa el PDF automatico, define terminos editables y la politica de retardo.</p>
              </div>
              <button
                type="button"
                className="cfg-ticket-test-btn"
                onClick={addTerm}
                disabled={!hojaServicioActiva}
              >
                + Agregar termino
              </button>
            </div>

            <div className="cfg-ticket-block cfg-ticket-block-wide">
              <h4>PDF de hoja de servicio</h4>
              <label className="cfg-check-row">
                <input
                  type="checkbox"
                  checked={hojaServicioActiva}
                  onChange={(e) => setEmitirHojaServicio(e.target.checked)}
                />
                <span>Generar y descargar la hoja de servicio en PDF al guardar un servicio</span>
              </label>

              <div className="cfg-empresa-preview">
                <strong>Estado actual:</strong>{" "}
                {hojaServicioActiva ? "PDF activo en Hoja de servicio" : "PDF deshabilitado"}
              </div>

              <small className="cfg-pos-help">
                Si apagas esta opcion, el servicio se guarda sin generar PDF. La politica de retardo
                y abandono se conserva activa por separado.
              </small>
            </div>

            <div className="cfg-servicios-canje-summary cfg-servicios-summary">
              <span>{terminos.filter((item) => item.text.trim()).length} terminos activos</span>
              <span>{hojaServicioActiva ? "PDF automatico activo" : "PDF automatico apagado"}</span>
            </div>

            <div className="cfg-servicios-terms-list">
              {terminos.map((item, index) => (
                <div key={item.id} className="cfg-servicios-term-row">
                  <div className="cfg-servicios-canje-order">{index + 1}</div>

                  <div className="cfg-servicios-term-fields">
                    <label>
                      Termino o condicion
                      <textarea
                        value={item.text}
                        onChange={(e) => updateTerm(item.id, e.target.value)}
                        placeholder="Escribe la condicion del servicio"
                        disabled={!hojaServicioActiva}
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    className="cfg-servicios-remove-btn"
                    onClick={() => removeTerm(item.id)}
                    disabled={!hojaServicioActiva}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>

            <div className="cfg-ticket-block cfg-ticket-block-wide">
              <h4>Retardo y abandono</h4>
              <label className="cfg-check-row">
                <input
                  type="checkbox"
                  checked={retardoHabilitado}
                  onChange={(e) => setRetardoHabilitado(e.target.checked)}
                />
                <span>Aplicar politica automatica de retardo y abandono</span>
              </label>

              <div className="cfg-servicios-policy-grid">
                <label>
                  Dias de tolerancia
                  <input
                    type="text"
                    inputMode="numeric"
                    value={retardoDias}
                    onChange={(e) => setRetardoDias(integerInput(e.target.value))}
                    disabled={!retardoHabilitado}
                  />
                </label>

                <label>
                  Cargo por retardo
                  <input
                    type="text"
                    inputMode="decimal"
                    value={retardoCargo}
                    onChange={(e) => setRetardoCargo(moneyInput(e.target.value))}
                    disabled={!retardoHabilitado}
                  />
                </label>

                <label>
                  Aplicar cargo cada
                  <input
                    type="text"
                    inputMode="numeric"
                    value={retardoCadaDias}
                    onChange={(e) => setRetardoCadaDias(integerInput(e.target.value))}
                    disabled={!retardoHabilitado}
                  />
                </label>

                <label>
                  Abandono a los
                  <input
                    type="text"
                    inputMode="numeric"
                    value={abandonoDias}
                    onChange={(e) => setAbandonoDias(integerInput(e.target.value))}
                    disabled={!retardoHabilitado}
                  />
                </label>
              </div>

              <label className="cfg-check-row">
                <input
                  type="checkbox"
                  checked={abandonoSiSuperaCosto}
                  onChange={(e) => setAbandonoSiSuperaCosto(e.target.checked)}
                  disabled={!retardoHabilitado}
                />
                <span>Tambien considerar abandono si el cargo acumulado supera el costo del servicio</span>
              </label>

              <div className="cfg-servicios-policy-preview">
                <strong>Vista previa automatica</strong>
                <p>{politicaRetardoPreview}</p>
              </div>

              <small className="cfg-pos-help">
                Esta politica se mostrara automaticamente en la Hoja de servicio y tambien en el PDF.
              </small>
            </div>
          </div>
        </>
      )}

      <div className="cfg-pos-card cfg-servicios-card" id="canjes">
        <div className="cfg-servicios-head">
          <div>
            <h3>Canjes</h3>
            <p>Elige productos del inventario POS y define cuantos puntos cuesta cada uno.</p>
          </div>
          <button
            type="button"
            className="cfg-ticket-test-btn"
            onClick={addCanje}
            disabled={canjesDeshabilitados}
          >
            + Agregar canje
          </button>
        </div>

        <div className="cfg-ticket-block cfg-ticket-block-wide">
          <h4>Programa de canjes</h4>
          <label className="cfg-check-row">
            <input
              type="checkbox"
              checked={canjesDeshabilitados}
              onChange={(e) => setCanjesDeshabilitados(e.target.checked)}
            />
            <span>Deshabilitar canjes y ocultar su vista en POS y Clientes</span>
          </label>

          <div className="cfg-empresa-preview">
            <strong>Estado actual:</strong>{" "}
            {mostrarCanjesEnVistas ? "Visible en POS y Clientes" : "Oculto en POS y Clientes"}
          </div>

              <small className="cfg-pos-help">
                Cuando actives este ajuste, el catalogo se conserva pero los puntos, metas y canjes
                dejan de mostrarse. La busqueda y el registro de clientes siguen disponibles.
              </small>
        </div>

        <div className="cfg-servicios-canje-summary">
          <span>{canjesActivos.length} canjes activos</span>
          <span>{productosDisponibles.length} productos disponibles en POS</span>
        </div>

        <div className="cfg-servicios-canje-list">
          {canjes.map((item, index) => {
            const producto = productosMap.get(item.productId);
            return (
              <div key={item.id} className="cfg-servicios-canje-row">
                <div className="cfg-servicios-canje-order">{index + 1}</div>

                <div className="cfg-servicios-canje-fields">
                  <label>
                    Producto del inventario
                    <select
                      value={item.productId}
                      onChange={(e) => updateCanje(item.id, { productId: e.target.value })}
                      disabled={canjesDeshabilitados}
                    >
                      <option value="">Seleccionar producto</option>
                      {productosDisponibles.map((productoItem) => (
                        <option key={productoItem.id} value={productoItem.id}>
                          {productoItem.nombre || productoItem.nombreProducto || productoItem.codigo || productoItem.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Cantidad de puntos
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.puntos}
                      onChange={(e) => updateCanje(item.id, { puntos: integerInput(e.target.value) })}
                      placeholder="Ej. 250"
                      disabled={canjesDeshabilitados}
                    />
                  </label>

                  <label className="cfg-check-row cfg-servicios-canje-check">
                    <input
                      type="checkbox"
                      checked={item.activo !== false}
                      onChange={(e) => updateCanje(item.id, { activo: e.target.checked })}
                      disabled={canjesDeshabilitados}
                    />
                    Activo
                  </label>
                </div>

                <div className="cfg-servicios-canje-preview">
                  <strong>{producto?.nombre || producto?.nombreProducto || "Sin producto"}</strong>
                  <span>
                    {producto
                      ? `Precio POS: $${Number(producto?.precioVenta || producto?.precio || 0).toFixed(2)}`
                      : "Selecciona un producto del inventario"}
                  </span>
                  <span>
                    {producto
                      ? `Stock actual: ${Number(producto?.stock || 0)}`
                      : "Aun no hay producto vinculado"}
                  </span>
                </div>

                <button
                  type="button"
                  className="cfg-servicios-remove-btn"
                  onClick={() => removeCanje(item.id)}
                  disabled={canjesDeshabilitados}
                >
                  Quitar
                </button>
              </div>
            );
          })}
        </div>

        <small className="cfg-pos-help">
          {mostrarCanjesEnVistas
            ? "Este catalogo sera el que aparezca en clientes como canjes sugeridos y disponibles."
            : "El catalogo sigue guardado, pero permanecera oculto mientras el programa este deshabilitado."}
        </small>
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

        {mensaje ? <small className="cfg-pos-saved">{mensaje}</small> : null}
        {errorDetalle ? <small className="cfg-pos-help">Detalle: {errorDetalle}</small> : null}
      </div>
    </section>
  );
}
