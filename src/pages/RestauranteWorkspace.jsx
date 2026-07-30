import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FiAlertTriangle, FiBell, FiCalendar, FiCheck, FiChevronRight, FiClock, FiCoffee, FiCreditCard,
  FiDollarSign, FiDownload, FiEdit2, FiEye, FiFileText, FiGrid, FiMapPin, FiMinus, FiPhone, FiPlus, FiPrinter, FiSearch, FiShoppingBag, FiUser, FiUsers, FiX,
} from "react-icons/fi";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import useImpresorasConfig from "../hooks/useImpresorasConfig";
import { descontarStock, obtenerProductos } from "../js/services/POS_firebase";
import ModalPago from "../components/modal_pago";
import { imprimirTicketVenta } from "../components/print_ticket_venta";
import { generarPdfCorteCajaDia } from "../js/services/pdf_corte_caja";
import { obtenerResumenCajaHoy } from "../js/services/corte_caja_firestore";
import {
  asignarMesaOrdenRestaurante,
  actualizarEstadoOrdenRestaurante,
  actualizarEstadoReservacionRestaurante,
  cancelarOrdenesRestaurante,
  cerrarTurnoRestaurante,
  cobrarOrdenesRestaurante,
  crearOrdenRestaurante,
  escucharReservacionesRestaurante,
  obtenerTurnoActivoRestaurante,
  escucharOperacionRestaurante,
  escucharOrdenesRestaurante,
  escucharGruposMesasRestaurante,
  guardarPlatillosAgotadosRestaurante,
  guardarGruposMesasRestaurante,
  guardarReservacionRestaurante,
  iniciarTurnoRestaurante,
} from "../js/services/restaurante_firestore";
import "../css/restaurante.css";

function normalizeRole(raw = "") {
  const role = String(raw).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!role.trim()) return "";
  if (role.includes("meser")) return "mesero";
  if (role.includes("cocin") || role.includes("chef")) return "cocina";
  if (role.includes("caj")) return "caja";
  if (role.includes("reserv")) return "reservas";
  return "administrador";
}

function restauranteDate(value) {
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const date = value instanceof Date ? value : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function restauranteDateKey(value) {
  const date = restauranteDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function restauranteDateTime(value) {
  const date = restauranteDate(value);
  if (!date) return "Sin fecha";
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Header({ icon, role, subtitle, badge }) {
  return (
    <header className="rest-role-header">
      <div className="rest-role-icon">{icon}</div>
      <div><span>{role}</span><p>{subtitle}</p></div>
      {badge ? <button type="button" className="rest-bell"><FiBell /><b>{badge}</b></button> : null}
    </header>
  );
}

function TurnoButton({ tenantId, actorUid, actorNombre, rol, resumen = {} }) {
  const [turno, setTurno] = useState(null);
  const [procesandoTurno, setProcesandoTurno] = useState(false);
  const [errorTurno, setErrorTurno] = useState("");
  useEffect(() => {
    let active = true;
    obtenerTurnoActivoRestaurante(tenantId, actorUid)
      .then((item) => { if (active) setTurno(item); })
      .catch((error) => { if (active) setErrorTurno(error?.message || "No se pudo consultar el turno."); });
    return () => { active = false; };
  }, [actorUid, tenantId]);
  const toggleTurno = async () => {
    if (procesandoTurno) return;
    setProcesandoTurno(true);
    setErrorTurno("");
    try {
      if (turno?.id) {
        await cerrarTurnoRestaurante(turno.id, resumen);
        setTurno(null);
      } else {
        const nuevoTurno = await iniciarTurnoRestaurante({ rol, actorUid, actorNombre }, tenantId);
        setTurno(nuevoTurno);
      }
    } catch (error) {
      setErrorTurno(error?.message || "No se pudo actualizar el turno.");
    } finally {
      setProcesandoTurno(false);
    }
  };
  return (
    <div className="rest-shift-control">
      <button type="button" className={turno ? "open" : ""} disabled={procesandoTurno} onClick={toggleTurno}>
        <FiClock /> {procesandoTurno ? "Procesando..." : turno ? "Cerrar mi turno" : "Iniciar mi turno"}
      </button>
      {errorTurno && <small>{errorTurno}</small>}
    </div>
  );
}

function MeseroView({ restauranteConfig, tenantId, actorUid, actorNombre }) {
  const pisos = restauranteConfig?.pisos?.length
    ? restauranteConfig.pisos
    : [{ id: "piso-1", nombre: "Piso 1", cantidadMesas: 12 }];
  const [pisoActivoId, setPisoActivoId] = useState(pisos[0].id);
  const [paginaMesas, setPaginaMesas] = useState(0);
  const [selectedTable, setSelectedTable] = useState(2);
  const [estadosMesas, setEstadosMesas] = useState({});
  const [cart, setCart] = useState([]);
  const [pedidosPorMesa, setPedidosPorMesa] = useState({});
  const [menu, setMenu] = useState([]);
  const [productosInventario, setProductosInventario] = useState([]);
  const [catalogoMesero, setCatalogoMesero] = useState("carta");
  const [platilloPersonalizando, setPlatilloPersonalizando] = useState(null);
  const [menuDelDiaSeleccionado, setMenuDelDiaSeleccionado] = useState(null);
  const [ingredientesSeleccionados, setIngredientesSeleccionados] = useState([]);
  const [cartIdEditando, setCartIdEditando] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("__all__");
  const [busquedaCarta, setBusquedaCarta] = useState("");
  const [cartaVisible, setCartaVisible] = useState(true);
  const [notasPorMesa, setNotasPorMesa] = useState({});
  const [notasAbiertas, setNotasAbiertas] = useState(false);
  const [enviandoOrden, setEnviandoOrden] = useState(false);
  const [mensajeOrden, setMensajeOrden] = useState("");
  const [ordenesSincronizadas, setOrdenesSincronizadas] = useState([]);
  const [notificacionLista, setNotificacionLista] = useState(null);
  const [operacionRestaurante, setOperacionRestaurante] = useState({ platillosAgotados: [] });
  const [gruposMesas, setGruposMesas] = useState([]);
  const [modalUnirMesas, setModalUnirMesas] = useState(false);
  const [mesasParaUnir, setMesasParaUnir] = useState([]);
  const [guardandoGrupoMesas, setGuardandoGrupoMesas] = useState(false);
  const [errorGrupoMesas, setErrorGrupoMesas] = useState("");
  const [pedidoCajaAsignando, setPedidoCajaAsignando] = useState(null);
  const [asignandoMesaPedido, setAsignandoMesaPedido] = useState(false);
  const [modalPedidosCaja, setModalPedidosCaja] = useState(false);
  const [reservacionesMesas, setReservacionesMesas] = useState([]);
  const [relojReservaciones, setRelojReservaciones] = useState(() => Date.now());
  const estadosOrdenesRef = useRef(new Map());
  const cargaOrdenesMeseroRef = useRef(true);
  const audioMeseroRef = useRef(null);
  const menusSugeridosMesasRef = useRef(new Set());
  const reservacionesActualizandoRef = useRef(new Set());
  const pisoActivo = pisos.find((piso) => piso.id === pisoActivoId) || pisos[0];
  const mesaKey = (numero, pisoId = pisoActivo.id) => `${pisoId}:${numero}`;
  const mesaSeleccionadaKey = mesaKey(selectedTable);
  const grupoMesaSeleccionada = gruposMesas.find(
    (grupo) => grupo.mesaKeys?.includes(mesaSeleccionadaKey),
  ) || null;
  const cuentaMesaKeys = grupoMesaSeleccionada?.mesaKeys?.length
    ? grupoMesaSeleccionada.mesaKeys
    : [mesaSeleccionadaKey];
  const cuentaMesaKey = grupoMesaSeleccionada?.principalMesaKey || mesaSeleccionadaKey;
  const etiquetaCuenta = grupoMesaSeleccionada?.etiqueta
    || `Mesa ${String(selectedTable).padStart(2, "0")}`;
  const resolverCuentaKey = (key) => (
    gruposMesas.find((grupo) => grupo.mesaKeys?.includes(key))?.principalMesaKey || key
  );
  const reservacionesPorMesa = useMemo(() => {
    const result = new Map();
    reservacionesMesas.forEach((reserva) => {
      const fecha = new Date(reserva.fechaHora || "").getTime();
      if (
        !reserva.mesaKey
        || !Number.isFinite(fecha)
        || !["reservada", "espera"].includes(reserva.estado)
        || relojReservaciones < fecha - 30 * 60 * 1000
        || relojReservaciones > fecha + 30 * 60 * 1000
      ) return;
      result.set(reserva.mesaKey, reserva);
    });
    return result;
  }, [relojReservaciones, reservacionesMesas]);
  const tables = Array.from({ length: pisoActivo.cantidadMesas }, (_, index) => {
    const key = mesaKey(index + 1);
    const baseStatus = estadosMesas[key] || "libre";
    const reservacion = reservacionesPorMesa.get(key);
    return {
      number: index + 1,
      status: reservacion && baseStatus === "libre" ? "agendada" : baseStatus,
      reservacion,
    };
  });
  const paginarMesas = tables.length > 12;
  const mesasPorPagina = Math.min(12, tables.length);
  const totalPaginas = Math.max(1, Math.ceil(tables.length / Math.max(1, mesasPorPagina)));
  const paginaActual = Math.min(paginaMesas, totalPaginas - 1);
  const inicioMesas = paginaActual * mesasPorPagina;
  const mesasVisibles = tables.slice(inicioMesas, inicioMesas + mesasPorPagina);
  const total = cart.reduce((sum, item) => sum + Number(item.precio || 0), 0);
  const menusDelDiaActivos = menu.filter((item) => item.menuDelDia);
  const menuDisponible = useMemo(
    () => menu.filter((item) => !item.menuDelDia && !operacionRestaurante.platillosAgotados?.includes(String(item.id))),
    [menu, operacionRestaurante.platillosAgotados],
  );
  const menuPorCategoria = useMemo(() => {
    const grupos = new Map();
    menuDisponible.forEach((item) => {
      const categoria = String(item.categoria || "").trim() || "Sin categoría";
      if (!grupos.has(categoria)) grupos.set(categoria, []);
      grupos.get(categoria).push(item);
    });
    return Array.from(grupos, ([categoria, platillos]) => ({ categoria, platillos }));
  }, [menuDisponible]);
  const categoriasCarta = useMemo(
    () => menuPorCategoria.map(({ categoria }) => categoria),
    [menuPorCategoria],
  );
  const categoriaSeleccionada = categoriaActiva === "__all__" || categoriasCarta.includes(categoriaActiva)
    ? categoriaActiva
    : "__all__";
  const platillosVisibles = useMemo(() => {
    const termino = busquedaCarta.trim().toLocaleLowerCase("es");
    return menuDisponible.filter((item) => {
      const coincideCategoria = categoriaSeleccionada === "__all__" || item.categoria === categoriaSeleccionada;
      if (!coincideCategoria) return false;
      if (!termino) return true;
      return `${item.nombre} ${item.categoria} ${(item.ingredientes || []).join(" ")}`
        .toLocaleLowerCase("es")
        .includes(termino);
    });
  }, [busquedaCarta, categoriaSeleccionada, menuDisponible]);
  const productosVisiblesMesero = useMemo(() => {
    const termino = busquedaCarta.trim().toLocaleLowerCase("es");
    return productosInventario.filter((item) => {
      if (!termino) return true;
      return `${item.nombre} ${item.categoria || ""} ${item.codigo || ""} ${item.codigoBarras || ""}`
        .toLocaleLowerCase("es")
        .includes(termino);
    });
  }, [busquedaCarta, productosInventario]);
  const notaMesa = notasPorMesa[cuentaMesaKey] || "";
  const ordenesMesa = ordenesSincronizadas.filter(
    (order) => {
      const keysOrden = Array.isArray(order.mesaKeys) && order.mesaKeys.length
        ? order.mesaKeys
        : [order.mesaKey];
      return (
        keysOrden.some((key) => cuentaMesaKeys.includes(key))
        && !["cancelada", "cobrada"].includes(order.status)
      );
    },
  );
  const pedidosCajaSinMesa = ordenesSincronizadas.filter(
    (order) => order.tipoServicio === "comer_aqui"
      && order.mesaAsignada !== true
      && !["cancelada", "cobrada"].includes(order.status),
  );
  const actualizarNotaMesa = (nota) => {
    setNotasPorMesa((current) => ({ ...current, [cuentaMesaKey]: nota }));
  };
  const avisarOrdenLista = useCallback((order) => {
    setNotificacionLista(order);
    if (typeof window === "undefined") return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = audioMeseroRef.current || new AudioContext();
      audioMeseroRef.current = context;
      const start = context.currentTime;
      [880, 1175, 1320].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const time = start + (index * 0.12);
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.2, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(time);
        oscillator.stop(time + 0.11);
      });
    } catch {
      // El navegador puede requerir una interacción previa para habilitar audio.
    }
  }, []);
  const agregarAlCarrito = (item, ingredientes = []) => {
    const ingredientesBase = Array.isArray(item.ingredientes) ? item.ingredientes : [];
    const incluidos = ingredientesBase.filter((ingrediente) => ingredientes.includes(ingrediente));
    const excluidos = ingredientesBase.filter((ingrediente) => !ingredientes.includes(ingrediente));
    setCart((list) => [...list, {
      ...item,
      cartId: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ingredientesIncluidos: incluidos,
      ingredientesExcluidos: excluidos,
    }]);
    setEstadosMesas((current) => ({
      ...current,
      ...Object.fromEntries(cuentaMesaKeys.map((key) => [key, "ocupada"])),
    }));
  };
  const agregarPlatillo = (item) => {
    if (item.menuDelDia) {
      setMenuDelDiaSeleccionado([item]);
      return;
    }
    const ingredientes = Array.isArray(item.ingredientes) ? item.ingredientes : [];
    if (!ingredientes.length) {
      agregarAlCarrito(item);
      return;
    }
    setPlatilloPersonalizando(item);
    setCartIdEditando("");
    setIngredientesSeleccionados([...ingredientes]);
  };
  const toggleIngrediente = (ingrediente) => {
    setIngredientesSeleccionados((current) =>
      current.includes(ingrediente)
        ? current.filter((item) => item !== ingrediente)
        : [...current, ingrediente]);
  };
  const confirmarPlatillo = () => {
    if (!platilloPersonalizando) return;
    if (cartIdEditando) {
      const ingredientesBase = platilloPersonalizando.ingredientes || [];
      setCart((current) => current.map((item) => (
        item.cartId === cartIdEditando
          ? {
            ...item,
            ingredientesIncluidos: ingredientesBase.filter((ingrediente) =>
              ingredientesSeleccionados.includes(ingrediente)),
            ingredientesExcluidos: ingredientesBase.filter((ingrediente) =>
              !ingredientesSeleccionados.includes(ingrediente)),
          }
          : item
      )));
      setPlatilloPersonalizando(null);
      setIngredientesSeleccionados([]);
      setCartIdEditando("");
      return;
    }
    agregarAlCarrito(platilloPersonalizando, ingredientesSeleccionados);
    setPlatilloPersonalizando(null);
    setIngredientesSeleccionados([]);
  };
  const quitarDelCarrito = (cartId) => {
    setCart((current) => current.filter((item) => item.cartId !== cartId));
  };
  const editarIngredientes = (item) => {
    if (!item.ingredientes?.length) return;
    setPlatilloPersonalizando(item);
    setCartIdEditando(item.cartId);
    setIngredientesSeleccionados(
      item.ingredientesIncluidos?.length || item.ingredientesExcluidos?.length
        ? [...(item.ingredientesIncluidos || [])]
        : [...item.ingredientes],
    );
  };
  const seleccionarMesa = (numero) => {
    const nuevaMesaKey = resolverCuentaKey(mesaKey(numero));
    const sugerirMenu = () => {
      const pedidoGuardado = pedidosPorMesa[nuevaMesaKey] || [];
      const tieneOrdenActiva = ordenesSincronizadas.some((order) => {
        const keys = Array.isArray(order.mesaKeys) && order.mesaKeys.length ? order.mesaKeys : [order.mesaKey];
        return keys.includes(nuevaMesaKey) && !["cancelada", "cobrada"].includes(order.status);
      });
      if (!menusDelDiaActivos.length || pedidoGuardado.length || tieneOrdenActiva || menusSugeridosMesasRef.current.has(nuevaMesaKey)) return;
      menusSugeridosMesasRef.current.add(nuevaMesaKey);
      setMenuDelDiaSeleccionado(menusDelDiaActivos);
    };
    if (numero === selectedTable) {
      if (!cart.length) sugerirMenu();
      return;
    }
    const mesaActualKey = cuentaMesaKey;
    setPedidosPorMesa((current) => ({
      ...current,
      [mesaActualKey]: cart,
    }));
    setSelectedTable(numero);
    setCart(pedidosPorMesa[nuevaMesaKey] || []);
    setPlatilloPersonalizando(null);
    setCartIdEditando("");
    setIngredientesSeleccionados([]);
    setNotasAbiertas(false);
    sugerirMenu();
  };
  const seleccionarPiso = (pisoId) => {
    if (pisoId === pisoActivo.id) return;
    const mesaActualKey = cuentaMesaKey;
    const nuevaMesaKey = resolverCuentaKey(`${pisoId}:1`);
    setPedidosPorMesa((current) => ({
      ...current,
      [mesaActualKey]: cart,
    }));
    setPisoActivoId(pisoId);
    setPaginaMesas(0);
    setSelectedTable(1);
    setCart(pedidosPorMesa[nuevaMesaKey] || []);
    setPlatilloPersonalizando(null);
    setCartIdEditando("");
    setIngredientesSeleccionados([]);
    setNotasAbiertas(false);
  };
  const abrirUnionMesas = () => {
    setMesasParaUnir(
      (grupoMesaSeleccionada?.mesaKeys || [])
        .filter((key) => key !== mesaSeleccionadaKey),
    );
    setErrorGrupoMesas("");
    setModalUnirMesas(true);
  };
  const toggleMesaParaUnir = (key) => {
    setErrorGrupoMesas("");
    setMesasParaUnir((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  };
  const confirmarUnionMesas = async () => {
    if (!mesasParaUnir.length || guardandoGrupoMesas) {
      setErrorGrupoMesas("Selecciona al menos una mesa adicional.");
      return;
    }
    const mesaKeysGrupo = [mesaSeleccionadaKey, ...mesasParaUnir];
    const numeros = mesaKeysGrupo.map((key) => Number(key.split(":").pop()) || 0);
    const nuevoGrupo = {
      id: grupoMesaSeleccionada?.id || `grupo_${Date.now()}`,
      principalMesaKey: grupoMesaSeleccionada?.principalMesaKey || mesaSeleccionadaKey,
      mesaKeys: mesaKeysGrupo,
      etiqueta: `Mesas ${numeros.map((numero) => String(numero).padStart(2, "0")).join(" + ")}`,
    };
    const siguientes = [
      ...gruposMesas.filter(
        (grupo) => grupo.id !== grupoMesaSeleccionada?.id
          && !grupo.mesaKeys?.some((key) => mesaKeysGrupo.includes(key)),
      ),
      nuevoGrupo,
    ];
    setGuardandoGrupoMesas(true);
    try {
      await guardarGruposMesasRestaurante(siguientes, tenantId);
      const carritoUnido = [
        ...cart,
        ...mesasParaUnir.flatMap((key) => pedidosPorMesa[resolverCuentaKey(key)] || []),
      ];
      setPedidosPorMesa((current) => ({
        ...current,
        [nuevoGrupo.principalMesaKey]: carritoUnido,
      }));
      setCart(carritoUnido);
      setGruposMesas(siguientes);
      setEstadosMesas((current) => ({
        ...current,
        ...Object.fromEntries(mesaKeysGrupo.map((key) => [
          key,
          ordenesMesa.length ? "orden" : carritoUnido.length ? "ocupada" : "libre",
        ])),
      }));
      setModalUnirMesas(false);
    } catch (error) {
      setErrorGrupoMesas(error?.message || "No se pudieron unir las mesas.");
    } finally {
      setGuardandoGrupoMesas(false);
    }
  };
  const separarMesas = async () => {
    if (!grupoMesaSeleccionada || guardandoGrupoMesas) return;
    if (ordenesMesa.length || cart.length) {
      setMensajeOrden("No se pueden separar mesas con pedidos pendientes.");
      return;
    }
    const siguientes = gruposMesas.filter((grupo) => grupo.id !== grupoMesaSeleccionada.id);
    setGuardandoGrupoMesas(true);
    try {
      await guardarGruposMesasRestaurante(siguientes, tenantId);
      setGruposMesas(siguientes);
      setEstadosMesas((current) => ({
        ...current,
        ...Object.fromEntries(grupoMesaSeleccionada.mesaKeys.map((key) => [key, "libre"])),
      }));
      setMensajeOrden("Las mesas se separaron correctamente.");
    } catch (error) {
      setMensajeOrden(error?.message || "No se pudieron separar las mesas.");
    } finally {
      setGuardandoGrupoMesas(false);
    }
  };
  const asignarPedidoCajaAMesa = async (numero) => {
    if (!pedidoCajaAsignando || asignandoMesaPedido) return;
    const keySeleccionada = mesaKey(numero);
    const grupo = gruposMesas.find((item) => item.mesaKeys?.includes(keySeleccionada));
    const principalKey = grupo?.principalMesaKey || keySeleccionada;
    const mesaKeys = grupo?.mesaKeys?.length ? grupo.mesaKeys : [keySeleccionada];
    const etiqueta = grupo?.etiqueta || `Mesa ${String(numero).padStart(2, "0")}`;
    setAsignandoMesaPedido(true);
    setMensajeOrden("");
    try {
      await asignarMesaOrdenRestaurante(pedidoCajaAsignando.id, {
        pisoId: pisoActivo.id,
        pisoNombre: pisoActivo.nombre,
        mesaNumero: numero,
        mesaKey: principalKey,
        mesaKeys,
        mesaEtiqueta: etiqueta,
        actorUid,
        actorNombre,
      });
      setSelectedTable(numero);
      setEstadosMesas((current) => ({
        ...current,
        ...Object.fromEntries(mesaKeys.map((key) => [key, "orden"])),
      }));
      setPedidoCajaAsignando(null);
      setMensajeOrden(`${pedidoCajaAsignando.mesaEtiqueta || "Pedido de Caja"} asignado a ${etiqueta}.`);
    } catch (error) {
      setMensajeOrden(error?.message || "No se pudo asignar la mesa.");
    } finally {
      setAsignandoMesaPedido(false);
    }
  };
  const enviarOrden = async () => {
    if (!cart.length || enviandoOrden) return;
    const key = cuentaMesaKey;
    setEnviandoOrden(true);
    setMensajeOrden("");
    try {
      await crearOrdenRestaurante({
        pisoId: pisoActivo.id,
        pisoNombre: pisoActivo.nombre,
        mesaNumero: selectedTable,
        mesaKey: key,
        mesaKeys: cuentaMesaKeys,
        mesaEtiqueta: etiquetaCuenta,
        items: cart.map((item) => ({
          productoId: String(item.id || ""),
          nombre: String(item.nombre || ""),
          precio: Number(item.precio || 0),
          cantidad: 1,
          categoria: String(item.categoria || ""),
          esInventario: item.esInventario === true,
          menuDelDia: item.menuDelDia === true,
          platillosMenu: Array.isArray(item.platillosMenu) ? item.platillosMenu : [],
          ingredientesIncluidos: item.ingredientesIncluidos || [],
          ingredientesExcluidos: item.ingredientesExcluidos || [],
        })),
        nota: notaMesa,
        total,
        creadaPorUid: actorUid,
        creadaPorNombre: actorNombre,
      }, tenantId);
      setPedidosPorMesa((current) => ({ ...current, [key]: [] }));
      setCart([]);
      setEstadosMesas((current) => ({
        ...current,
        ...Object.fromEntries(cuentaMesaKeys.map((mesaGrupoKey) => [mesaGrupoKey, "orden"])),
      }));
      setMensajeOrden("Orden enviada a cocina.");
    } catch (error) {
      console.error("No se pudo enviar la orden a cocina:", error);
      setMensajeOrden("No se pudo enviar la orden. Intenta nuevamente.");
    } finally {
      setEnviandoOrden(false);
    }
  };
  useEffect(() => {
    let active = true;
    obtenerProductos()
      .then((products) => {
        if (!active) return;
        const dishes = products
          .filter((item) => item.tipo === "platillo" && item.activo !== false)
          .filter((item) => !item.menuDelDia || item.fechaMenu === restauranteDateKey(new Date()))
          .map((item) => ({
            id: item.id,
            nombre: item.nombre,
            precio: Number(item.precioVenta || 0),
            categoria: item.categoria || "Otros",
            ingredientes: item.ingredientesHabilitados ? item.ingredientes || [] : [],
            menuDelDia: item.menuDelDia === true,
            platillosMenu: Array.isArray(item.platillosMenu) ? item.platillosMenu : [],
          }));
        const inventory = products
          .filter((item) => item.tipo !== "platillo" && item.activo !== false && Number(item.stock || 0) > 0)
          .map((item) => ({
            ...item,
            precio: Number(item.precioVenta || item.precio || 0),
            categoria: item.categoria || "Productos",
            ingredientes: [],
            esInventario: true,
          }));
        setMenu(dishes);
        setProductosInventario(inventory);
        setCart([]);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => escucharOrdenesRestaurante(
    tenantId,
    (orders) => {
      setOrdenesSincronizadas(orders);
      if (!cargaOrdenesMeseroRef.current) {
        const readyOrder = orders.find(
          (order) => order.status === "lista"
            && estadosOrdenesRef.current.get(order.id)
            && estadosOrdenesRef.current.get(order.id) !== "lista",
        );
        if (readyOrder) avisarOrdenLista(readyOrder);
      }
      cargaOrdenesMeseroRef.current = false;
      estadosOrdenesRef.current = new Map(orders.map((order) => [order.id, order.status]));
      const activeTables = {};
      orders.forEach((order) => {
        if (!["cancelada", "cobrada"].includes(order.status)) {
          const keys = Array.isArray(order.mesaKeys) && order.mesaKeys.length
            ? order.mesaKeys
            : [order.mesaKey].filter(Boolean);
          keys.forEach((key) => {
            activeTables[key] = "orden";
          });
        }
      });
      setEstadosMesas((current) => ({
        ...Object.fromEntries(
          Object.entries(current).map(([key, status]) => [
            key,
            status === "orden" && !activeTables[key] ? "libre" : status,
          ]),
        ),
        ...activeTables,
      }));
    },
    (error) => console.error("No se pudieron sincronizar las mesas:", error),
  ), [avisarOrdenLista, tenantId]);
  useEffect(() => escucharGruposMesasRestaurante(
    tenantId,
    setGruposMesas,
    (error) => console.error("No se pudieron sincronizar los grupos de mesas:", error),
  ), [tenantId]);
  useEffect(() => escucharReservacionesRestaurante(
    tenantId,
    setReservacionesMesas,
    (error) => console.error("No se pudieron sincronizar las reservaciones:", error),
  ), [tenantId]);
  useEffect(() => {
    const timer = window.setInterval(() => setRelojReservaciones(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const mesasConOrden = new Set();
    ordenesSincronizadas
      .filter((order) => !["cancelada", "cobrada"].includes(order.status))
      .forEach((order) => {
        const keys = Array.isArray(order.mesaKeys) && order.mesaKeys.length
          ? order.mesaKeys
          : [order.mesaKey].filter(Boolean);
        keys.forEach((key) => mesasConOrden.add(key));
      });

    reservacionesMesas.forEach((reserva) => {
      if (!reserva.id || !reserva.mesaKey || !["reservada", "espera"].includes(reserva.estado)) return;
      const fecha = new Date(reserva.fechaHora || "").getTime();
      if (!Number.isFinite(fecha)) return;
      const siguienteEstado = mesasConOrden.has(reserva.mesaKey)
        ? "sentada"
        : relojReservaciones > fecha + 30 * 60 * 1000
          ? "no_asistio"
          : "";
      if (!siguienteEstado || reservacionesActualizandoRef.current.has(reserva.id)) return;
      reservacionesActualizandoRef.current.add(reserva.id);
      actualizarEstadoReservacionRestaurante(reserva.id, siguienteEstado)
        .catch((error) => console.error("No se pudo actualizar la reservación:", error))
        .finally(() => reservacionesActualizandoRef.current.delete(reserva.id));
    });
  }, [ordenesSincronizadas, relojReservaciones, reservacionesMesas]);
  useEffect(() => escucharOperacionRestaurante(
    tenantId,
    setOperacionRestaurante,
    (error) => console.error("No se pudo sincronizar la disponibilidad de platillos:", error),
  ), [tenantId]);
  useEffect(() => {
    const agotados = new Set(operacionRestaurante.platillosAgotados || []);
    if (!agotados.size) return;
    setCart((current) => current.filter((item) => !agotados.has(String(item.id))));
    setPedidosPorMesa((current) => Object.fromEntries(
      Object.entries(current).map(([key, items]) => [
        key,
        (items || []).filter((item) => !agotados.has(String(item.id))),
      ]),
    ));
  }, [operacionRestaurante.platillosAgotados]);
  return (
    <section className="rest-workspace rest-mesero-dashboard">
      <Header icon={<FiUsers />} role="MESERO" subtitle="Gestión de mesas y toma de pedidos" />
      <div className="rest-two-columns">
        <article className="rest-panel">
          <div className="rest-panel-title rest-table-map-heading">
            <div><strong>MAPA DE MESAS</strong><small><i className="green" /> Libre <i className="purple" /> Agendada <i className="orange" /> Ocupada <i className="blue" /> En orden</small></div>
            {pedidosCajaSinMesa.length > 0 && (
              <button type="button" className="rest-counter-orders-trigger" onClick={() => setModalPedidosCaja(true)}>
                <FiShoppingBag />
                <span>Pedidos de Caja</span>
                <b>{pedidosCajaSinMesa.length}</b>
              </button>
            )}
          </div>
          {pisos.length > 1 && <div className="rest-floor-tabs">{pisos.map((piso) => <button type="button" className={piso.id === pisoActivo.id ? "active" : ""} key={piso.id} onClick={() => seleccionarPiso(piso.id)}>{piso.nombre}</button>)}</div>}
          <div className="rest-table-map">
            {mesasVisibles.map((table) => {
              const key = mesaKey(table.number);
              const grupo = gruposMesas.find((item) => item.mesaKeys?.includes(key));
              return <button type="button" key={table.number} onClick={() => seleccionarMesa(table.number)} className={`rest-table ${table.status} ${selectedTable === table.number ? "selected" : ""} ${grupo ? "grouped" : ""}`} title={table.reservacion ? `${table.reservacion.clienteNombre} · ${table.reservacion.fechaHora?.replace("T", " ")}` : ""}><span>{String(table.number).padStart(2, "0")}</span><small>{grupo ? "UNIDA" : table.status === "agendada" ? "AGENDADA" : table.status === "ocupada" ? "4p" : table.status === "orden" ? "2p" : ""}</small></button>;
            })}
          </div>
          {paginarMesas && <div className="rest-table-pagination"><button type="button" disabled={paginaActual === 0} onClick={() => setPaginaMesas((page) => Math.max(0, page - 1))}>‹ Anteriores</button><span>Mesas {inicioMesas + 1}–{Math.min(inicioMesas + mesasPorPagina, tables.length)} de {tables.length}</span><button type="button" disabled={paginaActual >= totalPaginas - 1} onClick={() => setPaginaMesas((page) => Math.min(totalPaginas - 1, page + 1))}>Siguientes ›</button></div>}
          <div className="rest-table-summary">
            <strong>{etiquetaCuenta}</strong>
            <span>{grupoMesaSeleccionada ? `${cuentaMesaKeys.length} mesas unidas` : "4 personas"}</span>
            <div className="rest-table-group-actions">
              <button type="button" onClick={abrirUnionMesas}><FiUsers /> {grupoMesaSeleccionada ? "Editar unión" : "Unir mesas"}</button>
              {grupoMesaSeleccionada && <button type="button" className="danger" disabled={guardandoGrupoMesas} onClick={separarMesas}>Separar</button>}
            </div>
          </div>
        </article>
        <article className="rest-panel">
          <div className="rest-panel-title rest-card-heading">
            <div><strong>{catalogoMesero === "carta" ? "CARTA" : "PRODUCTOS"}</strong><small>{catalogoMesero === "carta" ? `${menuPorCategoria.length} categorías` : `${productosInventario.length} con existencia`}</small></div>
            <button type="button" className="rest-card-toggle" aria-expanded={cartaVisible} onClick={() => setCartaVisible((visible) => !visible)}>
              {cartaVisible ? "Ocultar carta" : "Mostrar carta"}
              <FiChevronRight />
            </button>
          </div>
          {cartaVisible && (
            <div className="rest-card-content">
              <div className="rest-catalog-switch" role="tablist" aria-label="Tipo de catálogo">
                <button type="button" className={catalogoMesero === "carta" ? "active" : ""} onClick={() => { setCatalogoMesero("carta"); setBusquedaCarta(""); }}>Carta</button>
                <button type="button" className={catalogoMesero === "productos" ? "active" : ""} onClick={() => { setCatalogoMesero("productos"); setBusquedaCarta(""); }}>Productos</button>
              </div>
              <label className="rest-menu-search">
                <FiSearch />
                <input type="search" value={busquedaCarta} onChange={(event) => setBusquedaCarta(event.target.value)} placeholder={catalogoMesero === "carta" ? "Buscar platillo o ingrediente..." : "Buscar producto o escanear código de barras..."} />
                {busquedaCarta && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBusquedaCarta("")}><FiX /></button>}
              </label>
              {catalogoMesero === "carta" && <nav className="rest-category-strip" aria-label="Categorías de la carta">
                <button type="button" className={categoriaSeleccionada === "__all__" ? "active" : ""} onClick={() => setCategoriaActiva("__all__")}>
                  <span>Todos</span>
                  <b>{menuDisponible.length}</b>
                </button>
                {menuPorCategoria.map(({ categoria, platillos }) => (
                  <button type="button" className={categoria === categoriaSeleccionada ? "active" : ""} key={categoria} onClick={() => setCategoriaActiva(categoria)}>
                    <span>{categoria}</span>
                    <b>{platillos.length}</b>
                  </button>
                ))}
              </nav>}
              <div className="rest-selected-category">
                <strong>{catalogoMesero === "carta" ? (categoriaSeleccionada === "__all__" ? "Todos los platillos" : categoriaSeleccionada) : "Productos de inventario"}</strong>
                <span>{catalogoMesero === "carta" ? platillosVisibles.length : productosVisiblesMesero.length} disponibles</span>
              </div>
              {(catalogoMesero === "carta" ? platillosVisibles : productosVisiblesMesero).length ? (
                <div className="rest-menu-grid">
                  {(catalogoMesero === "carta" ? platillosVisibles : productosVisiblesMesero).map((item) => (
                    <button type="button" className="rest-menu-item" key={item.id} aria-label={`Agregar ${item.nombre}`} onClick={() => agregarPlatillo(item)}>
                      <strong>{item.nombre}</strong>
                      <span>${Number(item.precio || 0).toFixed(2)}</span>
                      {item.esInventario && <small>Stock: {Number(item.stock || 0)} · {item.codigoBarras || item.codigo || "Sin código"}</small>}
                      {item.ingredientes?.length ? <small>{item.ingredientes.join(", ")}</small> : null}
                    </button>
                  ))}
                </div>
              ) : <p className="rest-menu-empty">No se encontraron elementos disponibles.</p>}
            </div>
          )}
          {cart.length > 0 && (
            <div className="rest-order-draft">
              <strong>Pedido de {etiquetaCuenta.toLowerCase()}</strong>
              {cart.map((item) => (
                <div key={item.cartId}>
                  <span>
                    <b>{item.nombre}</b>
                    {item.ingredientesExcluidos?.length > 0 && (
                      <small>Sin: {item.ingredientesExcluidos.join(", ")}</small>
                    )}
                  </span>
                  <strong>${Number(item.precio || 0).toFixed(2)}</strong>
                  <div className="rest-order-item-actions">
                    {item.ingredientes?.length > 0 && (
                      <button type="button" className="edit" aria-label={`Editar ingredientes de ${item.nombre}`} title="Editar ingredientes" onClick={() => editarIngredientes(item)}>
                        <FiEdit2 />
                        <span>Ingredientes</span>
                      </button>
                    )}
                    <button type="button" className="remove" aria-label={`Quitar ${item.nombre}`} title="Eliminar platillo" onClick={() => quitarDelCarrito(item.cartId)}><FiX /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {ordenesMesa.length > 0 && (
            <section className="rest-sent-orders">
              <header>
                <strong>Órdenes enviadas</strong>
                <span>{ordenesMesa.length}</span>
              </header>
              {ordenesMesa.map((order, orderIndex) => (
                <details key={order.id} open={orderIndex === ordenesMesa.length - 1}>
                  <summary>
                    <span>Comanda {orderIndex + 1} · {formatOrderTime(order.createdAt)}</span>
                    <b className={order.status}>{order.status === "nueva" ? "En cocina" : order.status === "preparando" ? "Preparando" : "Lista"}</b>
                  </summary>
                  <div>
                    {order.atendidaPorNombre && <p className="rest-order-cook"><span>👨‍🍳 Cocina</span><strong>{order.atendidaPorNombre}</strong></p>}
                    {(order.items || []).map((item, itemIndex) => (
                      <p key={`${order.id}-sent-${itemIndex}`}>
                        <span>{item.cantidad || 1} × {item.nombre}</span>
                        <strong>${(Number(item.precio || 0) * Number(item.cantidad || 1)).toFixed(2)}</strong>
                        {item.ingredientesExcluidos?.length > 0 && <small>Sin: {item.ingredientesExcluidos.join(", ")}</small>}
                      </p>
                    ))}
                    {order.nota && <em>📎 {order.nota}</em>}
                  </div>
                </details>
              ))}
            </section>
          )}
          <button type="button" className="rest-order-button" disabled={!cart.length || enviandoOrden} onClick={enviarOrden}><FiShoppingBag /> {enviandoOrden ? "Enviando..." : `Enviar orden (${cart.length})`} <strong>${total.toFixed(2)}</strong><FiChevronRight /></button>
          {mensajeOrden && <p className={`rest-order-message ${mensajeOrden.startsWith("No ") ? "error" : ""}`}>{mensajeOrden}</p>}
          <button
            type="button"
            className={`rest-table-notes-tab ${notasAbiertas ? "open" : ""} ${notaMesa.trim() ? "has-note" : ""}`}
            aria-expanded={notasAbiertas}
            aria-controls="rest-table-notes"
            onClick={() => setNotasAbiertas((open) => !open)}
          >
            <span aria-hidden="true">📎</span>
            Nota de mesa
            {notaMesa.trim() && <b aria-label="Esta mesa tiene una nota" />}
          </button>
          <aside id="rest-table-notes" className={`rest-table-notes ${notasAbiertas ? "open" : ""}`} aria-hidden={!notasAbiertas}>
            <header>
              <div>
                <small>Indicaciones para cocina</small>
                <strong>{etiquetaCuenta}</strong>
              </div>
              <button type="button" className="rest-notes-close" aria-label="Cerrar notas" onClick={() => setNotasAbiertas(false)}>
                <span>Cerrar</span>
                <FiX />
              </button>
            </header>
            <label htmlFor="rest-table-note">Nota del pedido</label>
            <textarea
              id="rest-table-note"
              maxLength={300}
              rows={5}
              value={notaMesa}
              onChange={(event) => actualizarNotaMesa(event.target.value)}
              placeholder="Ej. La sopa no muy caliente..."
            />
            <footer>
              <span>{notaMesa.length}/300</span>
              {notaMesa && <button type="button" onClick={() => actualizarNotaMesa("")}>Limpiar</button>}
              <button type="button" className="primary" onClick={() => setNotasAbiertas(false)}>Listo</button>
            </footer>
          </aside>
        </article>
      </div>
      {modalUnirMesas && (
        <div className="rest-ingredient-backdrop" role="presentation" onClick={() => setModalUnirMesas(false)}>
          <section className="rest-ingredient-modal rest-table-group-modal" role="dialog" aria-modal="true" aria-labelledby="rest-table-group-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>Cuenta y comanda compartidas</small>
                <h2 id="rest-table-group-title">Unir con mesa {String(selectedTable).padStart(2, "0")}</h2>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setModalUnirMesas(false)}><FiX /></button>
            </header>
            <p>Selecciona las mesas que atenderán juntas. Todas compartirán los pedidos y aparecerán como un solo grupo.</p>
            <div className="rest-table-group-options">
              {tables
                .filter((table) => table.number !== selectedTable)
                .map((table) => {
                  const key = mesaKey(table.number);
                  const grupoAjeno = gruposMesas.find(
                    (grupo) => grupo.id !== grupoMesaSeleccionada?.id && grupo.mesaKeys?.includes(key),
                  );
                  return (
                    <label key={key} className={mesasParaUnir.includes(key) ? "selected" : ""}>
                      <input type="checkbox" checked={mesasParaUnir.includes(key)} disabled={Boolean(grupoAjeno)} onChange={() => toggleMesaParaUnir(key)} />
                      <span>Mesa {String(table.number).padStart(2, "0")}</span>
                      <small>{grupoAjeno ? "Ya pertenece a otro grupo" : table.status === "libre" ? "Libre" : "Con actividad"}</small>
                    </label>
                  );
                })}
            </div>
            {errorGrupoMesas && <p className="rest-table-group-error">{errorGrupoMesas}</p>}
            <footer>
              <button type="button" className="soft" onClick={() => setModalUnirMesas(false)}>Cancelar</button>
              <button type="button" disabled={guardandoGrupoMesas} onClick={confirmarUnionMesas}>
                {guardandoGrupoMesas ? "Guardando..." : "Confirmar unión"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {modalPedidosCaja && (
        <div className="rest-ingredient-backdrop" role="presentation" onClick={() => setModalPedidosCaja(false)}>
          <section className="rest-ingredient-modal rest-counter-orders-modal" role="dialog" aria-modal="true" aria-labelledby="rest-counter-orders-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>Pedidos realizados en Punto de venta</small>
                <h2 id="rest-counter-orders-title">Pedidos de Caja sin mesa</h2>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setModalPedidosCaja(false)}><FiX /></button>
            </header>
            <p>Selecciona el pedido del cliente para indicar en qué mesa se sentó.</p>
            <div className="rest-counter-orders-list">
              {pedidosCajaSinMesa.map((order) => (
                <button type="button" key={order.id} onClick={() => {
                  setModalPedidosCaja(false);
                  setPedidoCajaAsignando(order);
                }}>
                  <span>
                    <strong>{order.mesaEtiqueta || "Pedido de Caja"}</strong>
                    <small>{order.clienteNombre || "Cliente sin nombre"} · {(order.items || []).reduce((sum, item) => sum + Number(item.cantidad || 1), 0)} platillos</small>
                  </span>
                  <em>Asignar mesa <FiChevronRight /></em>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {pedidoCajaAsignando && (
        <div className="rest-ingredient-backdrop" role="presentation" onClick={() => setPedidoCajaAsignando(null)}>
          <section className="rest-ingredient-modal rest-assign-table-modal" role="dialog" aria-modal="true" aria-labelledby="rest-assign-table-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>{pedidoCajaAsignando.clienteNombre || "Cliente de Caja"}</small>
                <h2 id="rest-assign-table-title">¿En qué mesa se sentó?</h2>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setPedidoCajaAsignando(null)}><FiX /></button>
            </header>
            <p>Selecciona la mesa para vincular el pedido y su cuenta.</p>
            <div className="rest-assign-table-grid">
              {tables.map((table) => (
                <button type="button" disabled={asignandoMesaPedido} className={table.status} key={table.number} onClick={() => asignarPedidoCajaAMesa(table.number)}>
                  <strong>{String(table.number).padStart(2, "0")}</strong>
                  <small>{table.status === "libre" ? "Libre" : table.status === "orden" ? "Con cuenta" : "Ocupada"}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {notificacionLista && (
        <aside className="rest-ready-notification" role="status">
          <div>
            <span>✓</span>
            <p><strong>Orden lista</strong>{notificacionLista.mesaEtiqueta || `Mesa ${String(notificacionLista.mesaNumero || 0).padStart(2, "0")}`} · {notificacionLista.atendidaPorNombre || "Cocina"}</p>
          </div>
          <button type="button" aria-label="Cerrar notificación" onClick={() => setNotificacionLista(null)}><FiX /></button>
        </aside>
      )}
      {menuDelDiaSeleccionado && (
        <div className="rest-ingredient-backdrop" role="presentation" onClick={() => setMenuDelDiaSeleccionado(null)}>
          <section className="rest-ingredient-modal rest-daily-menu-modal" role="dialog" aria-modal="true" aria-labelledby="rest-daily-menu-title" onClick={(event) => event.stopPropagation()}>
            <header><div><small>Recomendación del día</small><h2 id="rest-daily-menu-title">¿Deseas agregar un menú?</h2></div><button type="button" aria-label="Cerrar" onClick={() => setMenuDelDiaSeleccionado(null)}><FiX /></button></header>
            <p>Estas opciones están disponibles hoy. Elige una o continúa con la carta.</p>
            <div className="rest-daily-menu-options">{menuDelDiaSeleccionado.map((dailyMenu) => <article key={dailyMenu.id}><div><h3>{dailyMenu.nombre}</h3><strong>${Number(dailyMenu.precio || 0).toFixed(2)}</strong></div><div className="rest-daily-menu-items">{dailyMenu.platillosMenu?.map((item) => <div key={item.id}><FiCheck /><span>{item.nombre}</span></div>)}</div><button type="button" onClick={() => { agregarAlCarrito(dailyMenu); setMenuDelDiaSeleccionado(null); }}>Elegir este menú</button></article>)}</div>
            <footer><button type="button" className="soft" onClick={() => setMenuDelDiaSeleccionado(null)}>Continuar sin menú</button></footer>
          </section>
        </div>
      )}
      {platilloPersonalizando && (
        <div className="rest-ingredient-backdrop" role="presentation" onClick={() => { setPlatilloPersonalizando(null); setCartIdEditando(""); }}>
          <section className="rest-ingredient-modal" role="dialog" aria-modal="true" aria-labelledby="rest-ingredient-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>{cartIdEditando ? "Editar ingredientes" : "Personalizar platillo"}</small>
                <h2 id="rest-ingredient-title">{platilloPersonalizando.nombre}</h2>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => { setPlatilloPersonalizando(null); setCartIdEditando(""); }}><FiX /></button>
            </header>
            <p>Todos los ingredientes están incluidos. Desmarca los que el cliente no desea.</p>
            <div className="rest-ingredient-list">
              {platilloPersonalizando.ingredientes.map((ingrediente) => (
                <label key={ingrediente} className={ingredientesSeleccionados.includes(ingrediente) ? "selected" : ""}>
                  <input
                    type="checkbox"
                    checked={ingredientesSeleccionados.includes(ingrediente)}
                    onChange={() => toggleIngrediente(ingrediente)}
                  />
                  <span>{ingrediente}</span>
                  <b>{ingredientesSeleccionados.includes(ingrediente) ? "Incluido" : "Sin ingrediente"}</b>
                </label>
              ))}
            </div>
            <footer>
              <button type="button" className="soft" onClick={() => { setPlatilloPersonalizando(null); setCartIdEditando(""); }}>Cancelar</button>
              <button type="button" onClick={confirmarPlatillo}>{cartIdEditando ? "Guardar cambios" : "Agregar al pedido"}</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function formatOrderTime(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : null;
  return date
    ? date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : "Ahora";
}

function CocinaView({ tenantId, actorUid, actorNombre }) {
  const [orders, setOrders] = useState([]);
  const [operacion, setOperacion] = useState({
    limiteCocineroActivo: false,
    maxPlatillosPorCocinero: 10,
    platillosAgotados: [],
  });
  const [platillos, setPlatillos] = useState([]);
  const [modalDisponibilidad, setModalDisponibilidad] = useState(false);
  const [guardandoDisponibilidad, setGuardandoDisponibilidad] = useState(false);
  const [filter, setFilter] = useState("todas");
  const [actualizandoId, setActualizandoId] = useState("");
  const [syncError, setSyncError] = useState("");
  const [sonidoActivo, setSonidoActivo] = useState(true);
  const [notaOrdenAbierta, setNotaOrdenAbierta] = useState("");
  const [relojCocina, setRelojCocina] = useState(() => Date.now());
  const ordenesConocidasRef = useRef(new Set());
  const cargaInicialRef = useRef(true);
  const audioContextRef = useRef(null);
  useEffect(() => {
    const timer = window.setInterval(() => setRelojCocina(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const minutosOrden = (order) => {
    const inicio = restauranteDate(order.preparacionIniciadaAt || order.createdAt);
    return inicio ? Math.max(0, Math.floor((relojCocina - inicio.getTime()) / 60000)) : 0;
  };
  const reproducirNuevaOrden = useCallback(() => {
    if (!sonidoActivo || typeof window === "undefined") return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = audioContextRef.current || new AudioContext();
      audioContextRef.current = context;
      const start = context.currentTime;
      [0, 0.16].forEach((delay, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = index === 0 ? 740 : 980;
        gain.gain.setValueAtTime(0.0001, start + delay);
        gain.gain.exponentialRampToValueAtTime(0.22, start + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.13);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start + delay);
        oscillator.stop(start + delay + 0.14);
      });
    } catch {
      // Algunos navegadores requieren una interacción previa para reproducir audio.
    }
  }, [sonidoActivo]);
  useEffect(() => escucharOrdenesRestaurante(
    tenantId,
    (items) => {
      const activeItems = items.filter((item) => !["cancelada", "cobrada"].includes(item.status));
      const currentIds = new Set(activeItems.map((item) => item.id));
      if (!cargaInicialRef.current) {
        const hasNewOrder = activeItems.some(
          (item) => item.status === "nueva" && !ordenesConocidasRef.current.has(item.id),
        );
        if (hasNewOrder) reproducirNuevaOrden();
      }
      cargaInicialRef.current = false;
      ordenesConocidasRef.current = currentIds;
      setOrders(activeItems);
      setSyncError("");
    },
    (error) => {
      console.error("No se pudieron cargar las órdenes de cocina:", error);
      setSyncError("No se pudieron sincronizar las órdenes.");
    },
  ), [tenantId, reproducirNuevaOrden]);
  useEffect(() => escucharOperacionRestaurante(
    tenantId,
    setOperacion,
    (error) => setSyncError(error?.message || "No se pudo cargar la configuración de cocina."),
  ), [tenantId]);
  useEffect(() => {
    let active = true;
    obtenerProductos()
      .then((items) => {
        if (!active) return;
        setPlatillos(items.filter((item) => item.tipo === "platillo" && item.activo !== false));
      })
      .catch((error) => setSyncError(error?.message || "No se pudieron cargar los platillos."));
    return () => { active = false; };
  }, []);
  const ordenesDelCocinero = orders.filter(
    (order) => order.status === "nueva"
      || !order.atendidaPorUid
      || order.atendidaPorUid === actorUid,
  );
  const visible = filter === "todas"
    ? ordenesDelCocinero
    : ordenesDelCocinero.filter((order) => order.status === filter);
  const platillosActivosCocinero = orders
    .filter((order) => order.status === "preparando" && order.atendidaPorUid === actorUid)
    .reduce(
      (total, order) => total + (order.items || [])
        .reduce((subtotal, item) => subtotal + Number(item.cantidad || 1), 0),
      0,
    );
  const togglePlatilloAgotado = async (productoId) => {
    if (guardandoDisponibilidad) return;
    const id = String(productoId);
    const actuales = operacion.platillosAgotados || [];
    const siguientes = actuales.includes(id)
      ? actuales.filter((item) => item !== id)
      : [...actuales, id];
    setGuardandoDisponibilidad(true);
    setSyncError("");
    try {
      await guardarPlatillosAgotadosRestaurante(siguientes, tenantId);
      setOperacion((current) => ({ ...current, platillosAgotados: siguientes }));
    } catch (error) {
      setSyncError(error?.message || "No se pudo cambiar la disponibilidad.");
    } finally {
      setGuardandoDisponibilidad(false);
    }
  };
  const advance = async (order) => {
    if (!order?.id || order.status === "lista" || actualizandoId) return;
    const nextStatus = order.status === "nueva" ? "preparando" : "lista";
    if (nextStatus === "preparando" && operacion.limiteCocineroActivo) {
      const platillosOrden = (order.items || [])
        .reduce((total, item) => total + Number(item.cantidad || 1), 0);
      if (platillosActivosCocinero + platillosOrden > operacion.maxPlatillosPorCocinero) {
        setSyncError(
          `No puedes tomar esta comanda: quedarías con ${platillosActivosCocinero + platillosOrden} platillos y tu límite es ${operacion.maxPlatillosPorCocinero}.`,
        );
        return;
      }
    }
    setActualizandoId(order.id);
    try {
      await actualizarEstadoOrdenRestaurante(order.id, nextStatus, {
        actorUid,
        actorNombre,
      });
    } catch (error) {
      console.error("No se pudo actualizar la orden:", error);
      const cuotaAgotada =
        error?.code === "resource-exhausted"
        || String(error?.message || "").toLowerCase().includes("quota exceeded");
      setSyncError(
        cuotaAgotada
          ? "Firestore alcanzó su límite de uso. Espera a que se restablezca la cuota o amplía el plan de Firebase."
          : error?.message || "No se pudo actualizar la orden. Intenta nuevamente.",
      );
    } finally {
      setActualizandoId("");
    }
  };
  return (
    <section className="rest-workspace">
      <Header icon={<FiCoffee />} role="COCINA" subtitle="Comandas sincronizadas en tiempo real" badge={orders.filter((o) => o.status === "nueva").length} />
      <div className="rest-kitchen-toolbar">
        <div className="rest-tabs">{[["nueva", "Nuevas"], ["preparando", "En preparación"], ["lista", "Listas"], ["todas", "Todas"]].map(([key, label]) => <button type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)} key={key}>{label} ({key === "todas" ? ordenesDelCocinero.length : ordenesDelCocinero.filter((o) => o.status === key).length})</button>)}</div>
        <button type="button" className={`rest-sound-toggle ${sonidoActivo ? "active" : ""}`} onClick={() => {
          setSonidoActivo((active) => !active);
          if (!audioContextRef.current && typeof window !== "undefined") {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioContextRef.current = new AudioContext();
          }
        }}>
          <FiBell /> Sonido {sonidoActivo ? "activado" : "apagado"}
        </button>
        <button type="button" className="rest-availability-toggle" onClick={() => setModalDisponibilidad(true)}>
          <FiShoppingBag /> Disponibilidad
          {operacion.platillosAgotados?.length > 0 && <b>{operacion.platillosAgotados.length}</b>}
        </button>
      </div>
      {operacion.limiteCocineroActivo && (
        <div className="rest-cook-capacity">
          <span>Carga del cocinero</span>
          <strong>{platillosActivosCocinero} / {operacion.maxPlatillosPorCocinero} platillos</strong>
          <i><b style={{ width: `${Math.min(100, (platillosActivosCocinero / operacion.maxPlatillosPorCocinero) * 100)}%` }} /></i>
        </div>
      )}
      {syncError && <p className="rest-kitchen-message error">{syncError}</p>}
      {!visible.length && !syncError && <p className="rest-kitchen-empty">No hay órdenes en esta sección.</p>}
      <div className="rest-orders">
        {visible.map((order, index) => (
          <article className={`rest-order ${order.status} ${minutosOrden(order) >= operacion.minutosAlertaCocina && order.status !== "lista" ? "late" : ""}`} key={order.id}>
            <header>
              <div><small>Orden #{index + 1}</small><strong>{order.mesaEtiqueta || `Mesa ${String(order.mesaNumero || 0).padStart(2, "0")}`}</strong></div>
              <span>{minutosOrden(order) >= operacion.minutosAlertaCocina && order.status !== "lista" ? <><FiAlertTriangle /> Retraso · {minutosOrden(order)} min</> : `${formatOrderTime(order.createdAt)} · ${minutosOrden(order)} min`}</span>
            </header>
            <b>{order.pisoNombre || "Restaurante"} · {order.items?.length || 0} platillos</b>
            <div>
              {(order.items || []).map((item, itemIndex) => (
                <p key={`${order.id}-${itemIndex}`}>
                  <span>{item.cantidad || 1}</span>
                  <span>
                    <strong>{item.nombre}</strong>
                    {item.menuDelDia && item.platillosMenu?.length > 0 && <small className="rest-kitchen-daily-menu">Incluye: {item.platillosMenu.map((platillo) => platillo.nombre).join(" · ")}</small>}
                    {item.ingredientesExcluidos?.length > 0 && <small>Sin: {item.ingredientesExcluidos.join(", ")}</small>}
                  </span>
                </p>
              ))}
              {order.nota && (
                <div className="rest-kitchen-note">
                  <button type="button" onClick={() => setNotaOrdenAbierta((current) => current === order.id ? "" : order.id)}>
                    📎 Nota de mesa
                  </button>
                  {notaOrdenAbierta === order.id && <em>{order.nota}</em>}
                </div>
              )}
            </div>
            <footer>
              <small>{order.status === "nueva" ? "Pendiente de iniciar" : order.status === "preparando" ? `Preparando: ${order.atendidaPorNombre || actorNombre || "Cocinero"}` : "Terminada"}</small>
              <button type="button" disabled={order.status === "lista" || actualizandoId === order.id} onClick={() => advance(order)}>
                {actualizandoId === order.id ? "Actualizando..." : order.status === "nueva" ? "Iniciar preparación" : order.status === "preparando" ? "Marcar como lista" : "Orden lista"} <FiCheck />
              </button>
            </footer>
          </article>
        ))}
      </div>
      {modalDisponibilidad && (
        <div className="rest-ingredient-backdrop" role="presentation" onClick={() => setModalDisponibilidad(false)}>
          <section className="rest-ingredient-modal rest-availability-modal" role="dialog" aria-modal="true" aria-labelledby="rest-availability-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>Disponibilidad de hoy</small>
                <h2 id="rest-availability-title">Platillos agotados</h2>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setModalDisponibilidad(false)}><FiX /></button>
            </header>
            <p>Desactiva temporalmente lo que se agotó. El mesero dejará de verlo inmediatamente y la lista se restablecerá mañana.</p>
            <div className="rest-availability-list">
              {platillos.map((platillo) => {
                const agotado = operacion.platillosAgotados?.includes(String(platillo.id));
                return (
                  <button type="button" className={agotado ? "sold-out" : ""} disabled={guardandoDisponibilidad} key={platillo.id} onClick={() => togglePlatilloAgotado(platillo.id)}>
                    <span><strong>{platillo.nombre}</strong><small>{platillo.categoria || "Sin categoría"}</small></span>
                    <b>{agotado ? "Agotado" : "Disponible"}</b>
                  </button>
                );
              })}
              {!platillos.length && <p>No hay platillos registrados.</p>}
            </div>
            <footer>
              <button type="button" onClick={() => setModalDisponibilidad(false)}>Listo</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

export function CajaView({ posOnly = false, tenantId = "", actorUid = "", actorNombre = "" }) {
  const [searchParams] = useSearchParams();
  const { imprimirAlCobrar } = useImpresorasConfig();
  const vista = posOnly ? (searchParams.get("cuenta") || "nueva") : "abiertas";
  const [mostrarPago, setMostrarPago] = useState(false);
  const [tipoPago, setTipoPago] = useState("efectivo");
  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoTarjeta, setMontoTarjeta] = useState(0);
  const [propinaMonto, setPropinaMonto] = useState(0);
  const [referenciaPago, setReferenciaPago] = useState("");
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [catalogoCaja, setCatalogoCaja] = useState("carta");
  const [operacion, setOperacion] = useState({ platillosAgotados: [] });
  const [cart, setCart] = useState([]);
  const [platilloParaLlevar, setPlatilloParaLlevar] = useState(null);
  const [menuDelDiaCaja, setMenuDelDiaCaja] = useState(null);
  const [ingredientesParaLlevar, setIngredientesParaLlevar] = useState([]);
  const [lineaParaLlevarEditando, setLineaParaLlevarEditando] = useState("");
  const [tipoServicioCaja, setTipoServicioCaja] = useState("comer_aqui");
  const [clienteNombreCaja, setClienteNombreCaja] = useState("");
  const [busquedaMenuCaja, setBusquedaMenuCaja] = useState("");
  const [cuentaSeleccionadaKey, setCuentaSeleccionadaKey] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorCobro, setErrorCobro] = useState("");
  const [historialBusqueda, setHistorialBusqueda] = useState("");
  const [historialFecha, setHistorialFecha] = useState("");
  const [historialMetodo, setHistorialMetodo] = useState("todos");
  const [historialDetalle, setHistorialDetalle] = useState(null);
  const [reimprimiendoId, setReimprimiendoId] = useState("");
  const [imprimiendoPrecuenta, setImprimiendoPrecuenta] = useState(false);

  useEffect(() => escucharOrdenesRestaurante(
    tenantId,
    setOrders,
    (error) => setMensaje(error?.message || "No se pudieron cargar las cuentas."),
  ), [tenantId]);
  useEffect(() => escucharOperacionRestaurante(tenantId, setOperacion), [tenantId]);
  useEffect(() => {
    let active = true;
    obtenerProductos().then((items) => {
      if (!active) return;
      const menuCargado = items
        .filter((item) => item.activo !== false)
        .filter((item) => !item.menuDelDia || item.fechaMenu === restauranteDateKey(new Date()))
        .filter((item) => item.tipo === "platillo"
          ? !operacion.platillosAgotados?.includes(String(item.id))
          : Number(item.stock || 0) > 0)
        .map((item) => ({
          ...item,
          precio: Number(item.precioVenta || item.precio || 0),
          ingredientes: item.tipo === "platillo" ? item.ingredientes || [] : [],
          esInventario: item.tipo !== "platillo",
        }));
      setMenu(menuCargado);
      if (vista === "nueva") {
        const menusDelDia = menuCargado.filter((item) => item.menuDelDia);
        setMenuDelDiaCaja(menusDelDia.length ? menusDelDia : null);
      }
    }).catch(() => setMenu([]));
    return () => { active = false; };
  }, [operacion.platillosAgotados, vista]);

  const cuentasAbiertas = useMemo(() => {
    const groups = new Map();
    orders
      .filter((order) => !["cancelada", "cobrada"].includes(order.status))
      .forEach((order) => {
        const key = order.mesaKey || order.id;
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            etiqueta: order.mesaEtiqueta || `Mesa ${String(order.mesaNumero || 0).padStart(2, "0")}`,
            orders: [],
            items: [],
            total: 0,
            clienteNombre: order.clienteNombre || "",
            creadaPorNombre: order.creadaPorNombre || "",
          });
        }
        const account = groups.get(key);
        account.orders.push(order);
        account.items.push(...(order.items || []));
        account.total += Number(order.total || 0);
      });
    return [...groups.values()].map((account) => ({
      ...account,
      listaParaCobrar: account.orders.every((order) => order.status === "lista"),
    }));
  }, [orders]);
  const historialCuentas = useMemo(() => {
    const groups = new Map();
    orders
      .filter((order) => order.status === "cobrada")
      .forEach((order) => {
        const key = String(order.ventaId || order.id);
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            ventaId: String(order.ventaId || ""),
            mesaEtiqueta: order.mesaEtiqueta || "Sin mesa",
            clienteNombre: order.clienteNombre || "Público general",
            tipoServicio: order.tipoServicio || "mesa",
            items: [],
            orders: [],
            subtotal: 0,
            total: Number(order.totalCobradoCuenta || 0),
            propina: Number(order.propina || 0),
            metodoPago: order.metodoPago || "Sin especificar",
            referenciaPago: order.referenciaPago || "",
            meseroNombre: order.creadaPorNombre || "Sin asignar",
            cajeroNombre: order.cobradaPorNombre || "Sin asignar",
            cobradaAt: order.cobradaAt || order.updatedAt,
          });
        }
        const account = groups.get(key);
        account.orders.push(order);
        account.items.push(...(order.items || []));
        account.subtotal += Number(order.total || 0);
        if (!account.total) account.total = account.subtotal + account.propina;
      });
    return [...groups.values()].sort(
      (a, b) => (restauranteDate(b.cobradaAt)?.getTime() || 0) - (restauranteDate(a.cobradaAt)?.getTime() || 0),
    );
  }, [orders]);
  const historialFiltrado = useMemo(() => {
    const queryText = historialBusqueda.trim().toLocaleLowerCase("es");
    return historialCuentas.filter((account) => {
      if (historialFecha && restauranteDateKey(account.cobradaAt) !== historialFecha) return false;
      if (
        historialMetodo !== "todos"
        && String(account.metodoPago).toLocaleLowerCase("es") !== historialMetodo
      ) return false;
      if (!queryText) return true;
      const searchable = [
        account.ventaId,
        account.mesaEtiqueta,
        account.clienteNombre,
        account.meseroNombre,
        account.cajeroNombre,
        ...account.items.map((item) => item.nombre),
      ].join(" ").toLocaleLowerCase("es");
      return searchable.includes(queryText);
    });
  }, [historialBusqueda, historialCuentas, historialFecha, historialMetodo]);
  const historialResumen = useMemo(() => ({
    cuentas: historialFiltrado.length,
    platillos: historialFiltrado.reduce(
      (sum, account) => sum + account.items.reduce((itemSum, item) => itemSum + Number(item.cantidad || 1), 0),
      0,
    ),
    propinas: historialFiltrado.reduce((sum, account) => sum + Number(account.propina || 0), 0),
    total: historialFiltrado.reduce((sum, account) => sum + Number(account.total || 0), 0),
  }), [historialFiltrado]);
  const cancelaciones = useMemo(
    () => orders.filter((order) => order.status === "cancelada").sort(
      (a, b) => (restauranteDate(b.canceladaAt)?.getTime() || 0) - (restauranteDate(a.canceladaAt)?.getTime() || 0),
    ),
    [orders],
  );
  const cuentaSeleccionada = cuentasAbiertas.find(
    (account) => account.key === cuentaSeleccionadaKey,
  ) || cuentasAbiertas[0] || null;
  const totalCarrito = cart.reduce(
    (sum, item) => sum + Number(item.precio || 0) * Number(item.cantidad || 1),
    0,
  );
  const montoPagoActivo = tipoPago === "tarjeta" ? montoTarjeta : montoEfectivo;
  const totalCuentaConPropina = Number(cuentaSeleccionada?.total || 0) + Number(propinaMonto || 0);
  const cambioPago = Number(montoPagoActivo || 0) - totalCuentaConPropina;
  const menuCajaVisible = menu.filter((item) => (
    !item.menuDelDia
    && (catalogoCaja === "carta" ? item.tipo === "platillo" : item.tipo !== "platillo")
    && (!busquedaMenuCaja.trim()
    || `${item.nombre} ${item.categoria || ""} ${item.codigo || ""} ${item.codigoBarras || ""}`
      .toLocaleLowerCase("es")
      .includes(busquedaMenuCaja.trim().toLocaleLowerCase("es")))
  ));

  const agregarParaLlevar = (platillo, ingredientesElegidos = null) => {
    if (platillo.menuDelDia && ingredientesElegidos === null) {
      setMenuDelDiaCaja([platillo]);
      return;
    }
    const ingredientesBase = Array.isArray(platillo.ingredientes) ? platillo.ingredientes : [];
    if (ingredientesElegidos === null && ingredientesBase.length) {
      setPlatilloParaLlevar(platillo);
      setIngredientesParaLlevar([...ingredientesBase]);
      setLineaParaLlevarEditando("");
      return;
    }
    const incluidos = ingredientesBase.filter((item) => (ingredientesElegidos || []).includes(item));
    const excluidos = ingredientesBase.filter((item) => !(ingredientesElegidos || []).includes(item));
    const varianteKey = `${platillo.id}:${excluidos.join("|")}`;
    setCart((current) => {
      const found = current.find((item) => item.varianteKey === varianteKey);
      if (found) {
        return current.map((item) => item.varianteKey === varianteKey
          ? { ...item, cantidad: Number(item.cantidad || 1) + 1 }
          : item);
      }
      return [...current, {
        id: platillo.id,
        cartId: `${platillo.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        varianteKey,
        nombre: platillo.nombre,
        precio: Number(platillo.precioVenta ?? platillo.precio ?? 0),
        categoria: platillo.categoria || "",
        cantidad: 1,
        menuDelDia: platillo.menuDelDia === true,
        platillosMenu: Array.isArray(platillo.platillosMenu) ? platillo.platillosMenu : [],
        ingredientes: ingredientesBase,
        ingredientesIncluidos: incluidos,
        ingredientesExcluidos: excluidos,
      }];
    });
  };
  const cambiarCantidad = (cartId, delta) => {
    setCart((current) => current
      .map((item) => item.cartId === cartId
        ? { ...item, cantidad: Number(item.cantidad || 1) + delta }
        : item)
      .filter((item) => item.cantidad > 0));
  };
  const toggleIngredienteParaLlevar = (ingrediente) => {
    setIngredientesParaLlevar((current) => current.includes(ingrediente)
      ? current.filter((item) => item !== ingrediente)
      : [...current, ingrediente]);
  };
  const confirmarIngredientesParaLlevar = () => {
    if (!platilloParaLlevar) return;
    if (lineaParaLlevarEditando) {
      const base = platilloParaLlevar.ingredientes || [];
      setCart((current) => current.map((item) => item.cartId === lineaParaLlevarEditando
        ? {
          ...item,
          ingredientesIncluidos: base.filter((ingrediente) => ingredientesParaLlevar.includes(ingrediente)),
          ingredientesExcluidos: base.filter((ingrediente) => !ingredientesParaLlevar.includes(ingrediente)),
          varianteKey: `${item.id}:${base.filter((ingrediente) => !ingredientesParaLlevar.includes(ingrediente)).join("|")}`,
        }
        : item));
    } else {
      agregarParaLlevar(platilloParaLlevar, ingredientesParaLlevar);
    }
    setPlatilloParaLlevar(null);
    setIngredientesParaLlevar([]);
    setLineaParaLlevarEditando("");
  };
  const editarIngredientesParaLlevar = (item) => {
    setPlatilloParaLlevar(item);
    setLineaParaLlevarEditando(item.cartId);
    setIngredientesParaLlevar([...(item.ingredientesIncluidos || [])]);
  };
  const enviarParaLlevar = async () => {
    if (!cart.length || procesando) return;
    setProcesando(true);
    setMensaje("");
    const folio = String(Date.now()).slice(-5);
    const esComerAqui = tipoServicioCaja === "comer_aqui";
    const orderKey = esComerAqui ? `pendiente:${folio}` : `llevar:${folio}`;
    try {
      await crearOrdenRestaurante({
        pisoId: esComerAqui ? "mesa-pendiente" : "para-llevar",
        pisoNombre: esComerAqui ? "Mesa pendiente" : "Para llevar",
        mesaNumero: 0,
        mesaKey: orderKey,
        mesaKeys: [orderKey],
        mesaEtiqueta: esComerAqui ? `Pedido #${folio} · Mesa pendiente` : `Para llevar #${folio}`,
        tipoServicio: tipoServicioCaja,
        clienteNombre: clienteNombreCaja.trim(),
        mesaAsignada: !esComerAqui,
        items: cart.map((item) => ({
          productoId: String(item.id),
          nombre: item.nombre,
          precio: Number(item.precio || 0),
          cantidad: Number(item.cantidad || 1),
          categoria: item.categoria || "",
          esInventario: item.esInventario === true,
          menuDelDia: item.menuDelDia === true,
          platillosMenu: Array.isArray(item.platillosMenu) ? item.platillosMenu : [],
          ingredientesIncluidos: item.ingredientesIncluidos || [],
          ingredientesExcluidos: item.ingredientesExcluidos || [],
        })),
        total: totalCarrito,
        creadaPorUid: actorUid,
        creadaPorNombre: actorNombre,
      }, tenantId);
      setCart([]);
      setClienteNombreCaja("");
      const menusDelDia = menu.filter((item) => item.menuDelDia);
      setMenuDelDiaCaja(menusDelDia.length ? menusDelDia : null);
      setMensaje(
        esComerAqui
          ? `Pedido #${folio} enviado. El mesero asignará la mesa cuando el cliente se siente.`
          : `Pedido para llevar #${folio} enviado a cocina.`,
      );
    } catch (error) {
      setMensaje(error?.message || "No se pudo enviar el pedido.");
    } finally {
      setProcesando(false);
    }
  };
  const cobrarCuenta = async () => {
    if (!cuentaSeleccionada || !cuentaSeleccionada.listaParaCobrar || procesando) return;
    if (Number(montoPagoActivo || 0) < totalCuentaConPropina) {
      setErrorCobro("El monto recibido es menor al total.");
      return;
    }
    setProcesando(true);
    setMensaje("");
    setErrorCobro("");
    try {
      const fechaVenta = new Date();
      const productosVenta = cuentaSeleccionada.items.map((item) => ({
        id: String(item.productoId || ""),
        productoId: String(item.productoId || ""),
        nombre: String(item.nombre || "Platillo"),
        cantidad: Number(item.cantidad || 1),
        precioVenta: Number(item.precio || 0),
        categoria: String(item.categoria || ""),
        ingredientesIncluidos: item.ingredientesIncluidos || [],
        ingredientesExcluidos: item.ingredientesExcluidos || [],
      }));
      const ventaPayload = {
        origen: "restaurante",
        tipoServicio: cuentaSeleccionada.orders[0]?.tipoServicio || "mesa",
        mesaEtiqueta: cuentaSeleccionada.etiqueta,
        clienteNombre: cuentaSeleccionada.clienteNombre || "Público general",
        subtotal: cuentaSeleccionada.total,
        iva: 0,
        propina: Number(propinaMonto || 0),
        total: totalCuentaConPropina,
        totalProductos: cuentaSeleccionada.total,
        tipoPago,
        pagoDetalle: {
          efectivo: tipoPago === "efectivo" ? Number(montoEfectivo || 0) : 0,
          tarjeta: tipoPago === "tarjeta" ? Number(montoTarjeta || 0) : 0,
          referenciaTarjeta: tipoPago === "tarjeta" ? referenciaPago.trim() : null,
        },
        fecha: fechaVenta,
        productos: productosVenta,
        atendioUid: actorUid,
        atendioNombre: actorNombre,
      };
      const { ventaId } = await cobrarOrdenesRestaurante(
        cuentaSeleccionada.orders.map((order) => order.id),
        {
          ventaData: ventaPayload,
          metodoPago: tipoPago === "tarjeta" ? "Tarjeta" : "Efectivo",
          referenciaPago: tipoPago === "tarjeta" ? referenciaPago.trim() : "",
          total: totalCuentaConPropina,
          propina: Number(propinaMonto || 0),
          actorUid,
          actorNombre,
        },
      );
      const inventarioVendido = productosVenta.reduce((result, item) => {
        const original = cuentaSeleccionada.items.find(
          (linea) => String(linea.productoId || "") === String(item.productoId || ""),
        );
        if (!original?.esInventario) return result;
        result[item.productoId] = (result[item.productoId] || 0) + Number(item.cantidad || 1);
        return result;
      }, {});
      await Promise.all(Object.entries(inventarioVendido).map(([productoId, cantidad]) => {
        const producto = menu.find((item) => String(item.id) === productoId);
        return descontarStock(productoId, Math.max(0, Number(producto?.stock || 0) - cantidad));
      }));
      setCuentaSeleccionadaKey("");
      setMostrarPago(false);
      setMontoEfectivo(0);
      setMontoTarjeta(0);
      setPropinaMonto(0);
      setReferenciaPago("");
      setMensaje(`Cuenta cobrada correctamente. Venta ${ventaId}.`);

      if (imprimirAlCobrar) {
        try {
          await imprimirTicketVenta({
            ventaId,
            fecha: fechaVenta,
            atendio: actorNombre || "Personal de restaurante",
            cliente: {
              nombre: cuentaSeleccionada.clienteNombre || "Público general",
              telefono: "-",
            },
            tipoPago,
            referenciaTarjeta: tipoPago === "tarjeta" ? referenciaPago.trim() : "",
            productos: productosVenta.map((item) => ({
              ...item,
              nombre: item.ingredientesExcluidos?.length
                ? `${item.nombre} (Sin: ${item.ingredientesExcluidos.join(", ")})`
                : item.nombre,
            })),
            estado: `Pagado · ${cuentaSeleccionada.etiqueta}`,
            subtotal: cuentaSeleccionada.total,
            aplicaIVA: false,
            iva: 0,
            total: cuentaSeleccionada.total,
            propina: Number(propinaMonto || 0),
            totalCobro: totalCuentaConPropina,
          });
        } catch (printError) {
          console.error("La venta se cobró, pero no se pudo imprimir el ticket:", printError);
          setMensaje(`Venta ${ventaId} cobrada. No se pudo imprimir el ticket; puedes reimprimirlo desde el historial.`);
        }
      }
    } catch (error) {
      const detalle = error?.message || "No se pudo cobrar la cuenta.";
      setErrorCobro(detalle);
      setMensaje(detalle);
    } finally {
      setProcesando(false);
    }
  };
  const cerrarModalCobro = () => {
    if (procesando) return;
    setMostrarPago(false);
    setErrorCobro("");
    setMontoEfectivo(0);
    setMontoTarjeta(0);
    setPropinaMonto(0);
    setReferenciaPago("");
  };
  const cancelarCuenta = async () => {
    if (!cuentaSeleccionada || procesando) return;
    const motivo = window.prompt("Motivo de la cancelación (obligatorio):", "");
    if (motivo === null) return;
    if (motivo.trim().length < 3) {
      setMensaje("Escribe un motivo válido para cancelar.");
      return;
    }
    if (!window.confirm(`¿Cancelar definitivamente ${cuentaSeleccionada.etiqueta}?`)) return;
    setProcesando(true);
    setMensaje("");
    try {
      await cancelarOrdenesRestaurante(
        cuentaSeleccionada.orders.map((order) => order.id),
        { motivo, actorUid, actorNombre },
      );
      setCuentaSeleccionadaKey("");
      setMensaje(`Cuenta cancelada. Motivo: ${motivo.trim()}`);
    } catch (error) {
      setMensaje(error?.message || "No se pudo cancelar la cuenta.");
    } finally {
      setProcesando(false);
    }
  };
  const imprimirPrecuenta = async () => {
    if (!cuentaSeleccionada || imprimiendoPrecuenta) return;
    setImprimiendoPrecuenta(true);
    setMensaje("");
    try {
      await imprimirTicketVenta({
        ventaId: `PRE-${String(cuentaSeleccionada.key || Date.now()).replace(/[^a-z0-9-]/gi, "").slice(-16)}`,
        fecha: new Date(),
        atendio: cuentaSeleccionada.creadaPorNombre || actorNombre || "Personal de restaurante",
        cliente: { nombre: cuentaSeleccionada.clienteNombre || "Cliente general", telefono: "-" },
        productos: cuentaSeleccionada.items.map((item) => ({
          ...item,
          nombre: item.ingredientesExcluidos?.length
            ? `${item.nombre} (Sin: ${item.ingredientesExcluidos.join(", ")})`
            : item.nombre,
          precioVenta: Number(item.precio || item.precioVenta || 0),
          cantidad: Number(item.cantidad || 1),
        })),
        subtotal: Number(cuentaSeleccionada.total || 0),
        aplicaIVA: false,
        iva: 0,
        total: Number(cuentaSeleccionada.total || 0),
        totalCobro: Number(cuentaSeleccionada.total || 0),
        precuenta: true,
      });
    } catch (error) {
      setMensaje(error?.message || "No se pudo imprimir la precuenta.");
    } finally {
      setImprimiendoPrecuenta(false);
    }
  };
  const reimprimirCuentaHistorial = async (account) => {
    if (!account || reimprimiendoId) return;
    setReimprimiendoId(account.key);
    setMensaje("");
    try {
      await imprimirTicketVenta({
        ventaId: account.ventaId || account.key,
        fecha: restauranteDate(account.cobradaAt) || new Date(),
        atendio: account.cajeroNombre,
        cliente: { nombre: account.clienteNombre, telefono: "-" },
        tipoPago: String(account.metodoPago).toLowerCase().includes("tarjeta") ? "tarjeta" : "efectivo",
        referenciaTarjeta: account.referenciaPago,
        productos: account.items.map((item) => ({
          ...item,
          precioVenta: Number(item.precio || item.precioVenta || 0),
          nombre: item.ingredientesExcluidos?.length
            ? `${item.nombre} (Sin: ${item.ingredientesExcluidos.join(", ")})`
            : item.nombre,
        })),
        estado: `Pagado · ${account.mesaEtiqueta}`,
        subtotal: account.subtotal,
        aplicaIVA: false,
        iva: 0,
        total: account.subtotal,
        propina: account.propina,
        totalCobro: account.total,
      });
    } catch (error) {
      setMensaje(error?.message || "No se pudo reimprimir el ticket.");
    } finally {
      setReimprimiendoId("");
    }
  };

  return (
    <section className={`rest-workspace${posOnly ? " rest-cash-only" : ""}`}>
      {!posOnly && <Header icon={<FiDollarSign />} role="PUNTO DE VENTA" subtitle="Cobros y pedidos para llevar" />}

      {vista === "nueva" && (
        <section className="rest-new-order">
          <header className="rest-new-order-header">
            <div>
              <span>Nueva cuenta</span>
              <h2>¿Cómo se entregará el pedido?</h2>
            </div>
            <div className="rest-service-selector">
              <button type="button" className={tipoServicioCaja === "comer_aqui" ? "active" : ""} onClick={() => setTipoServicioCaja("comer_aqui")}><FiUsers /><span><strong>Comer aquí</strong><small>El mesero asignará la mesa</small></span></button>
              <button type="button" className={tipoServicioCaja === "para_llevar" ? "active" : ""} onClick={() => setTipoServicioCaja("para_llevar")}><FiShoppingBag /><span><strong>Para llevar</strong><small>Entrega directa en Caja</small></span></button>
            </div>
            <label className="rest-customer-name"><FiUsers /><span><small>Nombre del cliente</small><input type="text" maxLength={60} value={clienteNombreCaja} onChange={(event) => setClienteNombreCaja(event.target.value)} placeholder="Ej. Carlos (opcional)" /></span></label>
          </header>
          <div className="rest-takeaway-layout">
            <article className="rest-panel rest-menu-catalog">
              <div className="rest-panel-title"><strong>{catalogoCaja === "carta" ? "CARTA" : "PRODUCTOS"}</strong><small>{menuCajaVisible.length} disponibles</small></div>
              <div className="rest-catalog-switch" role="tablist" aria-label="Tipo de catálogo">
                <button type="button" className={catalogoCaja === "carta" ? "active" : ""} onClick={() => { setCatalogoCaja("carta"); setBusquedaMenuCaja(""); }}>Carta</button>
                <button type="button" className={catalogoCaja === "productos" ? "active" : ""} onClick={() => { setCatalogoCaja("productos"); setBusquedaMenuCaja(""); }}>Productos</button>
              </div>
              <label className="rest-menu-search rest-counter-search"><FiSearch /><input type="search" value={busquedaMenuCaja} onChange={(event) => setBusquedaMenuCaja(event.target.value)} placeholder={catalogoCaja === "carta" ? "Buscar platillo o categoría..." : "Buscar producto o escanear código de barras..."} />{busquedaMenuCaja && <button type="button" onClick={() => setBusquedaMenuCaja("")}><FiX /></button>}</label>
              <div className="rest-takeaway-menu">
                {menuCajaVisible.map((item) => (
                  <button type="button" key={item.id} onClick={() => agregarParaLlevar(item)}>
                    <small>{item.categoria || "Sin categoría"}</small>
                    <strong>{item.nombre}</strong>
                    {item.ingredientes?.length > 0 && <em>Personalizable</em>}
                    {item.esInventario && <em>Stock: {Number(item.stock || 0)} · {item.codigoBarras || item.codigo || "Sin código"}</em>}
                    <span>${Number(item.precioVenta ?? item.precio ?? 0).toFixed(2)}</span>
                    <i><FiPlus /></i>
                  </button>
                ))}
              </div>
            </article>
            <article className="rest-panel rest-takeaway-cart">
              <div className="rest-panel-title"><strong>{tipoServicioCaja === "comer_aqui" ? "PEDIDO · COMER AQUÍ" : "PEDIDO · PARA LLEVAR"}</strong><small>{cart.reduce((sum, item) => sum + item.cantidad, 0)} productos</small></div>
              {clienteNombreCaja.trim() && <div className="rest-order-customer"><FiUsers /><span><small>Cliente</small><strong>{clienteNombreCaja.trim()}</strong></span></div>}
              {!cart.length && <div className="rest-new-order-empty"><FiShoppingBag /><strong>El pedido está vacío</strong><span>Selecciona platillos de la carta para comenzar.</span></div>}
              {cart.map((item) => (
                <div className="rest-takeaway-line" key={item.cartId}>
                  <span>
                    <strong>{item.nombre}</strong>
                    <small>${Number(item.precio).toFixed(2)} c/u</small>
                    {item.ingredientesExcluidos?.length > 0 && <small className="removed">Sin: {item.ingredientesExcluidos.join(", ")}</small>}
                    {item.ingredientes?.length > 0 && <button type="button" className="rest-takeaway-edit" onClick={() => editarIngredientesParaLlevar(item)}><FiEdit2 /> Ingredientes</button>}
                  </span>
                  <div className="rest-takeaway-quantity">
                    <button type="button" aria-label={`Quitar una unidad de ${item.nombre}`} onClick={() => cambiarCantidad(item.cartId, -1)}><FiMinus /></button>
                    <b>{item.cantidad}</b>
                    <button type="button" aria-label={`Agregar una unidad de ${item.nombre}`} onClick={() => cambiarCantidad(item.cartId, 1)}><FiPlus /></button>
                  </div>
                  <strong>${(Number(item.precio) * item.cantidad).toFixed(2)}</strong>
                </div>
              ))}
              <footer className="rest-new-order-total"><div><span>Total</span><strong>${totalCarrito.toFixed(2)}</strong></div><button type="button" disabled={!cart.length || procesando} onClick={enviarParaLlevar}><FiShoppingBag /> {procesando ? "Enviando..." : tipoServicioCaja === "comer_aqui" ? "Enviar · Mesa pendiente" : "Enviar pedido"}</button></footer>
            </article>
          </div>
        </section>
      )}

      {vista === "abiertas" && (
        <div className="rest-open-accounts-layout">
          <article className="rest-panel rest-open-account-list">
            <div className="rest-panel-title"><strong>CUENTAS ABIERTAS</strong><small>{cuentasAbiertas.length}</small></div>
            {!cuentasAbiertas.length && <p className="rest-kitchen-empty">No hay mesas pendientes de cobro.</p>}
            {cuentasAbiertas.map((account) => (
              <button type="button" className={cuentaSeleccionada?.key === account.key ? "active" : ""} key={account.key} onClick={() => setCuentaSeleccionadaKey(account.key)}>
                <span>
                  <strong>{account.etiqueta}</strong>
                  <small>{account.items.length} {account.items.length === 1 ? "partida" : "partidas"}</small>
                  <em className={account.listaParaCobrar ? "ready" : "preparing"}>
                    {account.listaParaCobrar ? "Lista para cobrar" : "En preparación"}
                  </em>
                </span>
                <b>${account.total.toFixed(2)}</b>
              </button>
            ))}
          </article>
          {cuentaSeleccionada && (
            <>
              <article className="rest-panel rest-cash rest-account-summary">
                <div className="rest-panel-title"><strong>RESUMEN DE CUENTA</strong><span>{cuentaSeleccionada.items.length} partidas</span></div>
                <header>
                  <div><small>Cuenta seleccionada</small><h2>{cuentaSeleccionada.etiqueta}</h2></div>
                  <em className={cuentaSeleccionada.listaParaCobrar ? "ready" : "preparing"}>{cuentaSeleccionada.listaParaCobrar ? "Lista para cobrar" : "En preparación"}</em>
                </header>
                <div className="rest-account-items">
                  {cuentaSeleccionada.items.map((item, index) => <p className="rest-line" key={`${item.productoId}-${index}`}><span><b>{item.cantidad || 1}</b>{item.nombre}</span><strong>${(Number(item.precio || 0) * Number(item.cantidad || 1)).toFixed(2)}</strong></p>)}
                </div>
                <footer><span>Total de la cuenta</span><div className="rest-total">${cuentaSeleccionada.total.toFixed(2)}</div></footer>
              </article>
              <article className="rest-panel rest-service-details">
                <div className="rest-panel-title"><strong>DETALLES DEL SERVICIO</strong></div>
                <div className="rest-service-account-icon"><FiUsers /></div>
                <h3>{cuentaSeleccionada.clienteNombre || "Cliente general"}</h3>
                <p>{cuentaSeleccionada.etiqueta}</p>
                <dl>
                  <div><dt>Estado</dt><dd className={cuentaSeleccionada.listaParaCobrar ? "ready" : "preparing"}>{cuentaSeleccionada.listaParaCobrar ? "Lista para cobrar" : "En preparación"}</dd></div>
                  <div><dt>Comandas</dt><dd>{cuentaSeleccionada.orders.length}</dd></div>
                  <div><dt>Productos</dt><dd>{cuentaSeleccionada.items.reduce((sum, item) => sum + Number(item.cantidad || 1), 0)}</dd></div>
                  <div><dt>Registró</dt><dd>{cuentaSeleccionada.creadaPorNombre || "Personal de restaurante"}</dd></div>
                </dl>
                <div className="rest-service-total"><span>Total pendiente</span><strong>${cuentaSeleccionada.total.toFixed(2)}</strong></div>
                <button type="button" className="rest-print-prebill" disabled={imprimiendoPrecuenta} onClick={imprimirPrecuenta}>
                  <FiPrinter /> {imprimiendoPrecuenta ? "Imprimiendo..." : "Imprimir precuenta"}
                </button>
                <button type="button" className="rest-cancel-account" disabled={procesando} onClick={cancelarCuenta}>
                  <FiX /> Cancelar cuenta
                </button>
                <button
                  type="button"
                  className="rest-open-payment"
                  disabled={!cuentaSeleccionada.listaParaCobrar || procesando}
                  onClick={() => {
                    setTipoPago("efectivo");
                    setMontoEfectivo(0);
                    setMontoTarjeta(cuentaSeleccionada.total);
                    setPropinaMonto(0);
                    setReferenciaPago("");
                    setErrorCobro("");
                    setMostrarPago(true);
                  }}
                >
                  <FiCreditCard /> {cuentaSeleccionada.listaParaCobrar ? "Abrir cobro" : "Esperando a Cocina"}
                </button>
              </article>
            </>
          )}
        </div>
      )}

      {vista === "historial" && (
        <section className="rest-history">
          <header className="rest-history-header">
            <div><span>Operación del restaurante</span><h2>Historial de cuentas</h2><p>Consulta ventas cobradas y recupera sus tickets.</p></div>
            <FiClock />
          </header>
          <div className="rest-history-kpis">
            <article><span>Cuentas</span><strong>{historialResumen.cuentas}</strong></article>
            <article><span>Platillos</span><strong>{historialResumen.platillos}</strong></article>
            <article><span>Propinas</span><strong>${historialResumen.propinas.toFixed(2)}</strong></article>
            <article><span>Total cobrado</span><strong>${historialResumen.total.toFixed(2)}</strong></article>
          </div>
          <div className="rest-history-filters">
            <label><FiSearch /><input type="search" value={historialBusqueda} onChange={(event) => setHistorialBusqueda(event.target.value)} placeholder="Cuenta, mesa, cliente, mesero o platillo..." /></label>
            <input type="date" value={historialFecha} onChange={(event) => setHistorialFecha(event.target.value)} />
            <select value={historialMetodo} onChange={(event) => setHistorialMetodo(event.target.value)}>
              <option value="todos">Todos los métodos</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
            {(historialBusqueda || historialFecha || historialMetodo !== "todos") && <button type="button" onClick={() => { setHistorialBusqueda(""); setHistorialFecha(""); setHistorialMetodo("todos"); }}>Limpiar</button>}
          </div>
          <div className="rest-history-table-wrap">
            <table className="rest-history-table">
              <thead><tr><th>Fecha</th><th>Cuenta</th><th>Cliente</th><th>Mesero</th><th>Cajero</th><th>Pago</th><th>Propina</th><th>Total</th><th>Acciones</th></tr></thead>
              <tbody>
                {historialFiltrado.map((account) => (
                  <tr key={account.key}>
                    <td><strong>{restauranteDateKey(account.cobradaAt) || "-"}</strong><small>{restauranteDate(account.cobradaAt)?.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) || ""}</small></td>
                    <td><strong>{account.mesaEtiqueta}</strong><small>{account.ventaId ? `Venta ${account.ventaId.slice(0, 8)}` : "Cuenta cobrada"}</small></td>
                    <td>{account.clienteNombre}</td>
                    <td>{account.meseroNombre}</td>
                    <td>{account.cajeroNombre}</td>
                    <td><span className="rest-history-payment">{account.metodoPago}</span></td>
                    <td>${account.propina.toFixed(2)}</td>
                    <td><b>${account.total.toFixed(2)}</b></td>
                    <td><div className="rest-history-actions"><button type="button" title="Ver detalle" onClick={() => setHistorialDetalle(account)}><FiEye /></button><button type="button" title="Reimprimir ticket" disabled={reimprimiendoId === account.key} onClick={() => reimprimirCuentaHistorial(account)}><FiPrinter /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!historialFiltrado.length && <div className="rest-history-empty"><FiClock /><strong>No se encontraron cuentas</strong><span>Prueba con otros filtros o cobra una cuenta nueva.</span></div>}
          </div>
          <section className="rest-cancellations-log">
            <h3>Cancelaciones auditadas</h3>
            {!cancelaciones.length && <p>Sin cancelaciones registradas.</p>}
            {cancelaciones.map((order) => (
              <article key={order.id}>
                <strong>{order.mesaEtiqueta || "Cuenta"}</strong>
                <span>{order.cancelacionMotivo || "Sin motivo"}</span>
                <small>{order.canceladaPorNombre || "Sin responsable"} · {restauranteDateTime(order.canceladaAt)}</small>
              </article>
            ))}
          </section>
        </section>
      )}
      {vista === "reservaciones" && <ReservasView tenantId={tenantId} />}
      {vista === "corte" && <div className="rest-pos-placeholder"><FiDollarSign /><h2>Corte de caja</h2><p>Consulta y realiza el corte desde el módulo de reportes.</p></div>}
      {vista === "mas" && <div className="rest-pos-placeholder"><FiGrid /><h2>Más opciones</h2><p>Próximamente habrá más herramientas de punto de venta.</p></div>}
      {mensaje && <p className={`rest-order-message ${mensaje.startsWith("No ") || mensaje.includes("menor") ? "error" : ""}`}>{mensaje}</p>}
      {historialDetalle && (
        <div className="rest-ingredient-backdrop" role="presentation" onClick={() => setHistorialDetalle(null)}>
          <section className="rest-ingredient-modal rest-history-detail" role="dialog" aria-modal="true" aria-labelledby="rest-history-detail-title" onClick={(event) => event.stopPropagation()}>
            <header><div><small>Venta {historialDetalle.ventaId?.slice(0, 10) || historialDetalle.key.slice(0, 10)}</small><h2 id="rest-history-detail-title">{historialDetalle.mesaEtiqueta}</h2></div><button type="button" aria-label="Cerrar" onClick={() => setHistorialDetalle(null)}><FiX /></button></header>
            <div className="rest-history-detail-meta">
              <div><span>Fecha y hora</span><strong>{restauranteDateTime(historialDetalle.cobradaAt)}</strong></div>
              <div><span>Cliente</span><strong>{historialDetalle.clienteNombre}</strong></div>
              <div><span>Mesero</span><strong>{historialDetalle.meseroNombre}</strong></div>
              <div><span>Cajero</span><strong>{historialDetalle.cajeroNombre}</strong></div>
              <div><span>Método de pago</span><strong>{historialDetalle.metodoPago}</strong></div>
              {historialDetalle.referenciaPago && <div><span>Referencia</span><strong>{historialDetalle.referenciaPago}</strong></div>}
            </div>
            <div className="rest-history-detail-items">
              {historialDetalle.items.map((item, index) => <div key={`${item.productoId}-${index}`}><span><b>{Number(item.cantidad || 1)}×</b><strong>{item.nombre}</strong>{item.ingredientesExcluidos?.length > 0 && <small>Sin: {item.ingredientesExcluidos.join(", ")}</small>}</span><strong>${(Number(item.precio || 0) * Number(item.cantidad || 1)).toFixed(2)}</strong></div>)}
            </div>
            <dl className="rest-history-totals"><div><dt>Subtotal</dt><dd>${historialDetalle.subtotal.toFixed(2)}</dd></div><div><dt>Propina</dt><dd>${historialDetalle.propina.toFixed(2)}</dd></div><div><dt>Total</dt><dd>${historialDetalle.total.toFixed(2)}</dd></div></dl>
            <footer><button type="button" className="soft" onClick={() => setHistorialDetalle(null)}>Cerrar</button><button type="button" disabled={Boolean(reimprimiendoId)} onClick={() => reimprimirCuentaHistorial(historialDetalle)}><FiPrinter /> Reimprimir ticket</button></footer>
          </section>
        </div>
      )}
      <ModalPago
        mostrar={mostrarPago}
        onClose={cerrarModalCobro}
        total={cuentaSeleccionada?.total || 0}
        totalCobro={totalCuentaConPropina}
        habilitarPropina
        propinaMonto={propinaMonto}
        setPropinaMonto={(next) => {
          const propinaSegura = Math.max(0, Number(next || 0));
          setPropinaMonto(propinaSegura);
          if (tipoPago === "tarjeta") {
            setMontoTarjeta(Number(cuentaSeleccionada?.total || 0) + propinaSegura);
          }
        }}
        imprimirAlCobrar={imprimirAlCobrar}
        tipoPago={tipoPago}
        setTipoPago={(next) => {
          setTipoPago(next);
          if (next === "tarjeta" && cuentaSeleccionada) {
            setMontoTarjeta(totalCuentaConPropina);
          }
        }}
        montoEfectivo={montoEfectivo}
        setMontoEfectivo={setMontoEfectivo}
        montoTarjeta={montoTarjeta}
        setMontoTarjeta={setMontoTarjeta}
        referenciaPago={referenciaPago}
        setReferenciaPago={setReferenciaPago}
        cambio={cambioPago}
        confirmarVenta={cobrarCuenta}
        errorMensaje={errorCobro}
      />
      {menuDelDiaCaja && (
        <div className="rest-ingredient-backdrop" role="presentation" onClick={() => setMenuDelDiaCaja(null)}>
          <section className="rest-ingredient-modal rest-daily-menu-modal" role="dialog" aria-modal="true" aria-labelledby="rest-daily-menu-cash-title" onClick={(event) => event.stopPropagation()}>
            <header><div><small>Recomendación del día</small><h2 id="rest-daily-menu-cash-title">¿Deseas agregar un menú?</h2></div><button type="button" aria-label="Cerrar" onClick={() => setMenuDelDiaCaja(null)}><FiX /></button></header>
            <p>Estas opciones están disponibles hoy. Elige una o continúa con la carta.</p>
            <div className="rest-daily-menu-options">{menuDelDiaCaja.map((dailyMenu) => <article key={dailyMenu.id}><div><h3>{dailyMenu.nombre}</h3><strong>${Number(dailyMenu.precioVenta ?? dailyMenu.precio ?? 0).toFixed(2)}</strong></div><div className="rest-daily-menu-items">{dailyMenu.platillosMenu?.map((item) => <div key={item.id}><FiCheck /><span>{item.nombre}</span></div>)}</div><button type="button" onClick={() => { agregarParaLlevar(dailyMenu, []); setMenuDelDiaCaja(null); }}>Elegir este menú</button></article>)}</div>
            <footer><button type="button" className="soft" onClick={() => setMenuDelDiaCaja(null)}>Continuar sin menú</button></footer>
          </section>
        </div>
      )}
      {platilloParaLlevar && (
        <div className="rest-ingredient-backdrop" role="presentation" onClick={() => setPlatilloParaLlevar(null)}>
          <section className="rest-ingredient-modal" role="dialog" aria-modal="true" aria-labelledby="rest-takeaway-ingredient-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>{lineaParaLlevarEditando ? "Editar ingredientes" : "Personalizar pedido para llevar"}</small>
                <h2 id="rest-takeaway-ingredient-title">{platilloParaLlevar.nombre}</h2>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setPlatilloParaLlevar(null)}><FiX /></button>
            </header>
            <p>Desmarca los ingredientes que el cliente no desea.</p>
            <div className="rest-ingredient-list">
              {(platilloParaLlevar.ingredientes || []).map((ingrediente) => (
                <label key={ingrediente} className={ingredientesParaLlevar.includes(ingrediente) ? "selected" : ""}>
                  <input type="checkbox" checked={ingredientesParaLlevar.includes(ingrediente)} onChange={() => toggleIngredienteParaLlevar(ingrediente)} />
                  <span>{ingrediente}</span>
                  <b>{ingredientesParaLlevar.includes(ingrediente) ? "Incluido" : "Sin ingrediente"}</b>
                </label>
              ))}
            </div>
            <footer>
              <button type="button" className="soft" onClick={() => setPlatilloParaLlevar(null)}>Cancelar</button>
              <button type="button" onClick={confirmarIngredientesParaLlevar}>{lineaParaLlevarEditando ? "Guardar cambios" : "Agregar al pedido"}</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function ReservasView({ tenantId }) {
  const { empresa } = useEmpresaConfig();
  const [reservas, setReservas] = useState([]);
  const emptyForm = { id: "", clienteNombre: "", telefono: "", personas: 2, fechaHora: "", notas: "", estado: "reservada", mesaKey: "", mesaNumero: 0, mesaEtiqueta: "", pisoId: "", pisoNombre: "" };
  const [form, setForm] = useState(emptyForm);
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState("activas");
  const [modalMesas, setModalMesas] = useState(false);
  const mesasDisponibles = useMemo(() => {
    const pisos = empresa?.restaurante?.pisos?.length
      ? empresa.restaurante.pisos
      : [{ id: "piso-1", nombre: "Piso 1", cantidadMesas: 12 }];
    return pisos.flatMap((piso) => Array.from(
      { length: Math.max(1, Number(piso.cantidadMesas || 1)) },
      (_, index) => ({
        key: `${piso.id}:${index + 1}`,
        numero: index + 1,
        etiqueta: `Mesa ${String(index + 1).padStart(2, "0")}`,
        pisoId: piso.id,
        pisoNombre: piso.nombre,
      }),
    ));
  }, [empresa?.restaurante?.pisos]);
  useEffect(() => escucharReservacionesRestaurante(
    tenantId,
    setReservas,
    (error) => setMensaje(error?.message || "No se pudieron cargar las reservaciones."),
  ), [tenantId]);
  const guardar = async (event) => {
    event.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setMensaje("");
    try {
      await guardarReservacionRestaurante(form, tenantId);
      setForm(emptyForm);
      setMensaje(form.id ? "Reservación actualizada." : "Reservación guardada.");
    } catch (error) {
      setMensaje(error?.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };
  const elegirMesa = (mesaKey) => {
    const mesa = mesasDisponibles.find((item) => item.key === mesaKey);
    setForm((old) => ({
      ...old,
      mesaKey: mesa?.key || "",
      mesaNumero: mesa?.numero || 0,
      mesaEtiqueta: mesa?.etiqueta || "",
      pisoId: mesa?.pisoId || "",
      pisoNombre: mesa?.pisoNombre || "",
    }));
    if (mesa) setModalMesas(false);
  };
  const editarReserva = (reserva) => {
    setForm({
      ...emptyForm,
      ...reserva,
      id: reserva.id,
      personas: Number(reserva.personas || 1),
    });
    setMensaje("");
    document.querySelector(".rest-reservation-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const reservasVisibles = reservas.filter((reserva) => {
    if (filtro === "todas") return true;
    if (filtro === "espera") return reserva.estado === "espera";
    return !["cancelada", "no_asistio"].includes(reserva.estado);
  });
  const totalPersonas = reservasVisibles.reduce(
    (total, reserva) => total + Number(reserva.personas || 0),
    0,
  );
  return (
    <section className="rest-workspace rest-reservations">
      <Header icon={<FiCalendar />} role="RESERVACIONES" subtitle="Agenda y lista de espera" badge={reservas.filter((item) => item.estado === "espera").length} />
      <div className="rest-reservation-hero">
        <div>
          <span>ORGANIZA CADA MESA</span>
          <h1>Agenda de reservaciones</h1>
          <p>Registra llegadas, controla la lista de espera y mantén al equipo preparado.</p>
        </div>
        <div className="rest-reservation-stats">
          <article><FiCalendar /><span>En agenda<strong>{reservas.filter((item) => !["cancelada", "no_asistio"].includes(item.estado)).length}</strong></span></article>
          <article><FiClock /><span>En espera<strong>{reservas.filter((item) => item.estado === "espera").length}</strong></span></article>
          <article><FiUsers /><span>Personas<strong>{totalPersonas}</strong></span></article>
        </div>
      </div>
      <div className="rest-reservations-layout">
        <form className="rest-reservation-form" onSubmit={guardar}>
          <header><i><FiEdit2 /></i><div><small>{form.id ? "EDITANDO RESERVACIÓN" : "NUEVO REGISTRO"}</small><h2>{form.id ? "Editar reservación" : "Nueva reservación"}</h2><p>{form.id ? "Actualiza los datos o cambia la mesa asignada." : "Completa los datos para añadirla a la agenda."}</p></div></header>
          <div className="rest-reservation-fields">
            <label className="wide"><span><FiUser /> Cliente</span><input required placeholder="Nombre del cliente" value={form.clienteNombre} onChange={(e) => setForm((old) => ({ ...old, clienteNombre: e.target.value }))} /></label>
            <label><span><FiPhone /> Teléfono</span><input type="tel" placeholder="Número de contacto" value={form.telefono} onChange={(e) => setForm((old) => ({ ...old, telefono: e.target.value }))} /></label>
            <label><span><FiUsers /> Personas</span><input type="number" min="1" max="100" value={form.personas} onChange={(e) => setForm((old) => ({ ...old, personas: Number(e.target.value) || 1 }))} /></label>
            <label className="wide"><span><FiCalendar /> Fecha y hora</span><input required type="datetime-local" value={form.fechaHora} onChange={(e) => setForm((old) => ({ ...old, fechaHora: e.target.value }))} /></label>
            <div className={`wide rest-reservation-table-trigger${form.mesaKey ? " assigned" : ""}`}>
              <div><i><FiMapPin /></i><span><small>MESA ASIGNADA</small><strong>{form.mesaKey ? `${form.pisoNombre} · ${form.mesaEtiqueta}` : "Todavía sin asignar"}</strong></span></div>
              <button type="button" onClick={() => setModalMesas(true)}>{form.mesaKey ? "Cambiar mesa" : "Asignar mesa"} <FiChevronRight /></button>
            </div>
            <label className="wide"><span><FiClock /> Tipo</span><select value={form.estado} onChange={(e) => setForm((old) => ({ ...old, estado: e.target.value }))}><option value="reservada">Reservación</option><option value="espera">Lista de espera</option></select></label>
            <label className="wide"><span><FiFileText /> Notas</span><textarea rows="3" placeholder="Cumpleaños, ubicación preferida, indicaciones..." value={form.notas} onChange={(e) => setForm((old) => ({ ...old, notas: e.target.value }))} /></label>
          </div>
          <div className="rest-reservation-form-actions">
            {form.id && <button type="button" onClick={() => { setForm(emptyForm); setMensaje(""); }}><FiX /> Cancelar edición</button>}
            <button disabled={guardando} type="submit"><FiCalendar /> {guardando ? "Guardando..." : form.id ? "Guardar cambios" : "Agregar a la agenda"}</button>
          </div>
          {mensaje && <p className="rest-reservation-message">{mensaje}</p>}
          {modalMesas && (
            <div className="rest-ingredient-backdrop rest-table-picker-backdrop" role="presentation" onClick={() => setModalMesas(false)}>
              <section className="rest-ingredient-modal rest-table-picker-modal" role="dialog" aria-modal="true" aria-labelledby="rest-table-picker-title" onClick={(event) => event.stopPropagation()}>
                <header><div><small>RESERVACIÓN</small><h2 id="rest-table-picker-title">Asignar una mesa</h2><p>Selecciona la mesa que deseas apartar para el cliente.</p></div><button type="button" aria-label="Cerrar" onClick={() => setModalMesas(false)}><FiX /></button></header>
                <div className="rest-reservation-table-picker">
                  {[...new Set(mesasDisponibles.map((mesa) => mesa.pisoNombre))].map((pisoNombre) => (
                    <section key={pisoNombre}>
                      <strong>{pisoNombre}</strong>
                      <div>
                        {mesasDisponibles.filter((mesa) => mesa.pisoNombre === pisoNombre).map((mesa) => (
                          <button type="button" key={mesa.key} className={form.mesaKey === mesa.key ? "selected" : ""} aria-pressed={form.mesaKey === mesa.key} onClick={() => elegirMesa(mesa.key)}>
                            <FiMapPin /><b>{mesa.numero}</b><small>Mesa</small>{form.mesaKey === mesa.key && <FiCheck className="check" />}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
                <footer>
                  {form.mesaKey && <button type="button" className="soft" onClick={() => elegirMesa("")}><FiX /> Quitar asignación</button>}
                  <button type="button" onClick={() => setModalMesas(false)}>Listo</button>
                </footer>
              </section>
            </div>
          )}
        </form>
        <div className="rest-reservations-list">
          <header><div><small>PRÓXIMAS LLEGADAS</small><h2>Agenda</h2><p>{reservasVisibles.length} registros · {totalPersonas} personas</p></div><div className="rest-reservation-filters"><button className={filtro === "activas" ? "active" : ""} onClick={() => setFiltro("activas")}>Activas</button><button className={filtro === "espera" ? "active" : ""} onClick={() => setFiltro("espera")}>Espera</button><button className={filtro === "todas" ? "active" : ""} onClick={() => setFiltro("todas")}>Todas</button></div></header>
          {!reservasVisibles.length && <div className="rest-reservation-empty"><i><FiCalendar /></i><strong>La agenda está libre</strong><span>Las nuevas reservaciones y entradas a la lista de espera aparecerán aquí.</span></div>}
          {reservasVisibles.map((reserva) => (
            <article key={reserva.id} className={reserva.estado}>
              <i className="rest-reservation-avatar">{String(reserva.clienteNombre || "R").charAt(0).toUpperCase()}</i>
              <div><strong>{reserva.clienteNombre}</strong><span><FiUsers /> {reserva.personas} personas {reserva.telefono && <>· <FiPhone /> {reserva.telefono}</>}</span><small><FiCalendar /> {reserva.fechaHora?.replace("T", " ")} {reserva.notas && <>· {reserva.notas}</>}</small>{reserva.mesaEtiqueta && <b className="rest-reservation-table"><FiMapPin /> {reserva.pisoNombre} · {reserva.mesaEtiqueta}</b>}</div>
              <button type="button" className="rest-reservation-edit" title="Editar reservación" aria-label={`Editar reservación de ${reserva.clienteNombre}`} onClick={() => editarReserva(reserva)}><FiEdit2 /></button>
              <select aria-label={`Estado de la reservación de ${reserva.clienteNombre}`} value={reserva.estado} onChange={(e) => actualizarEstadoReservacionRestaurante(reserva.id, e.target.value)}>
                <option value="reservada">Reservada</option><option value="espera">En espera</option><option value="sentada">Mesa asignada</option><option value="cancelada">Cancelada</option><option value="no_asistio">No asistió</option>
              </select>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdminView({ tenantId, actorNombre, empresaNombre }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [syncError, setSyncError] = useState("");
  const [downloadingCut, setDownloadingCut] = useState(false);
  const [operacionConfig, setOperacionConfig] = useState({});

  useEffect(() => escucharOrdenesRestaurante(
    tenantId,
    (items) => {
      setOrders(items);
      setSyncError("");
    },
    (error) => setSyncError(error?.message || "No se pudo cargar el resumen del restaurante."),
  ), [tenantId]);
  useEffect(() => escucharOperacionRestaurante(tenantId, setOperacionConfig), [tenantId]);

  const todayKey = restauranteDateKey(new Date());
  const todayOrders = useMemo(
    () => orders.filter((order) => restauranteDateKey(order.cobradaAt || order.createdAt) === todayKey),
    [orders, todayKey],
  );
  const paidOrders = todayOrders.filter((order) => order.status === "cobrada");
  const activeOrders = todayOrders.filter((order) => !["cobrada", "cancelada"].includes(order.status));
  const salesById = useMemo(() => {
    const grouped = new Map();
    paidOrders.forEach((order) => {
      const key = order.ventaId || order.id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(order);
    });
    return Array.from(grouped.values());
  }, [paidOrders]);
  const totalSales = salesById.reduce(
    (sum, account) => sum + Number(account[0]?.totalCobradoCuenta || account.reduce((subtotal, order) => subtotal + Number(order.total || 0), 0)),
    0,
  );
  const tips = salesById.reduce((sum, account) => sum + Number(account[0]?.propina || 0), 0);
  const dishes = paidOrders.reduce(
    (sum, order) => sum + (order.items || []).reduce((subtotal, item) => subtotal + Number(item.cantidad || 1), 0),
    0,
  );
  const averageTicket = salesById.length ? totalSales / salesById.length : 0;
  const money = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const paymentTotals = salesById.reduce((result, account) => {
    const method = String(account[0]?.metodoPago || "Otro").trim() || "Otro";
    result[method] = (result[method] || 0) + Number(account[0]?.totalCobradoCuenta || 0);
    return result;
  }, {});
  const productTotals = paidOrders.reduce((result, order) => {
    (order.items || []).forEach((item) => {
      const name = String(item.nombre || "Platillo");
      result[name] = (result[name] || 0) + Number(item.cantidad || 1);
    });
    return result;
  }, {});
  const topProducts = Object.entries(productTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const waiterTotals = paidOrders.reduce((result, order) => {
    const name = String(order.creadaPorNombre || "Sin asignar");
    if (!result[name]) result[name] = { orders: 0, tables: new Set() };
    result[name].orders += 1;
    if (order.mesaEtiqueta || order.mesaNumero) result[name].tables.add(order.mesaEtiqueta || `Mesa ${order.mesaNumero}`);
    return result;
  }, {});
  const maxProduct = Math.max(1, ...topProducts.map(([, quantity]) => quantity));
  const metrics = [
    ["VENTAS DE HOY", money(totalSales), `${salesById.length} cuentas cobradas`],
    ["ÓRDENES ACTIVAS", activeOrders.length, activeOrders.length ? "En servicio ahora" : "Operación al día"],
    ["TICKET PROMEDIO", money(averageTicket), `${dishes} platillos vendidos`],
    ["PROPINAS", money(tips), "Separadas de las ventas"],
  ];
  const downloadCut = async () => {
    if (downloadingCut) return;
    setDownloadingCut(true);
    try {
      const summary = await obtenerResumenCajaHoy();
      await generarPdfCorteCajaDia(summary.ventasHoy || [], {
        corte: summary.corte || null,
        fechaKey: summary.fechaKey,
        negocioNombre: empresaNombre,
        restaurante: { orders, config: operacionConfig },
      });
    } catch (error) {
      setSyncError(error?.message || "No se pudo generar el corte del restaurante.");
    } finally {
      setDownloadingCut(false);
    }
  };

  return (
    <section className="rest-workspace rest-admin-dashboard">
      <header className="rest-admin-home-head">
        <div><small>Panel del administrador</small><h1>Hola, {actorNombre || "Administrador"}</h1><p>Resumen de la operación del restaurante en tiempo real.</p></div>
        <div className="rest-admin-actions">
          <button type="button" onClick={() => navigate("/POS")}>Abrir punto de venta</button>
          <button type="button" className="soft" onClick={downloadCut} disabled={downloadingCut}><FiDownload /> {downloadingCut ? "Generando..." : "Descargar corte"}</button>
          <button type="button" className="soft" onClick={() => navigate("/reportes")}>Ver reportes</button>
        </div>
      </header>
      {syncError && <p className="rest-sync-error">{syncError}</p>}
      <div className="rest-metrics">{metrics.map(([label, value, note]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div>
      <div className="rest-admin-quick">
        <button type="button" onClick={() => navigate("/home?vista=mesero")}><FiGrid /><strong>Mesas</strong><span>Estado y atención</span></button>
        <button type="button" onClick={() => navigate("/home?vista=cocina")}><FiCoffee /><strong>Cocina</strong><span>Comandas activas</span></button>
        <button type="button" onClick={() => navigate("/productos")}><FiShoppingBag /><strong>Platillos</strong><span>Carta y precios</span></button>
        <button type="button" onClick={() => navigate("/configuracion")}><FiEdit2 /><strong>Configuración</strong><span>Personaliza el negocio</span></button>
      </div>
      <div className="rest-admin-grid">
        <article className="rest-chart"><strong>PLATILLOS MÁS VENDIDOS HOY</strong>{topProducts.length ? topProducts.map(([name, quantity], index) => <p className="rest-ranked" key={name}><span>{index + 1}. {name} · {quantity}</span><i style={{ width: `${(quantity / maxProduct) * 100}%` }} /></p>) : <p className="rest-admin-empty">Aún no hay ventas registradas hoy.</p>}</article>
        <article className="rest-chart"><strong>MÉTODOS DE PAGO</strong>{Object.keys(paymentTotals).length ? Object.entries(paymentTotals).sort((a, b) => b[1] - a[1]).map(([method, total]) => <p className="rest-ranked" key={method}><span>{method} · {money(total)}</span><i style={{ width: `${totalSales ? (total / totalSales) * 100 : 0}%` }} /></p>) : <p className="rest-admin-empty">Sin cobros registrados.</p>}</article>
        <article className="rest-chart"><strong>ACTIVIDAD DE MESEROS</strong>{Object.keys(waiterTotals).length ? Object.entries(waiterTotals).map(([name, data]) => <div className="rest-admin-staff" key={name}><span><FiUsers /> {name}</span><b>{data.tables.size} mesas · {data.orders} órdenes</b></div>) : <p className="rest-admin-empty">Sin actividad registrada hoy.</p>}</article>
        <article className="rest-chart"><strong>OPERACIÓN ACTUAL</strong><div className="rest-admin-operation"><div><span>Nuevas</span><b>{activeOrders.filter((order) => order.status === "nueva").length}</b></div><div><span>Preparando</span><b>{activeOrders.filter((order) => order.status === "preparando").length}</b></div><div><span>Listas</span><b>{activeOrders.filter((order) => order.status === "lista").length}</b></div><div><span>Entregadas</span><b>{activeOrders.filter((order) => order.status === "entregada").length}</b></div></div></article>
      </div>
    </section>
  );
}

export default function RestauranteWorkspace() {
  const { rol, nombre, uid, cuentaPrincipalUid, puede } = useAutorizacionActual();
  const { empresa } = useEmpresaConfig();
  const role = useMemo(() => normalizeRole(rol), [rol]);
  const [searchParams] = useSearchParams();
  const requestedView = normalizeRole(searchParams.get("vista") || "");
  const allowedViews = useMemo(() => [
    puede("restaurante.mesero") && "mesero",
    puede("restaurante.cocina") && "cocina",
    puede("restaurante.caja") && "caja",
  ].filter(Boolean), [puede]);
  const preferredView = requestedView || role;
  const activeView = role === "administrador" && !requestedView
    ? "administrador"
    : allowedViews.includes(preferredView)
      ? preferredView
      : allowedViews[0] || "";
  return (
    <div className="rest-page">
      {activeView === "mesero" && <MeseroView restauranteConfig={empresa?.restaurante} tenantId={cuentaPrincipalUid || uid} actorUid={uid} actorNombre={nombre} />}
      {activeView === "cocina" && <CocinaView tenantId={cuentaPrincipalUid || uid} actorUid={uid} actorNombre={nombre} />}
      {activeView === "caja" && <CajaView tenantId={cuentaPrincipalUid || uid} actorUid={uid} actorNombre={nombre} />}
      {activeView === "administrador" && <AdminView tenantId={cuentaPrincipalUid || uid} actorNombre={nombre} empresaNombre={empresa?.nombre} />}
    </div>
  );
}
