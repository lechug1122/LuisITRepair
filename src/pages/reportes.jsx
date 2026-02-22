import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import Layout from "../components/Layout";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../initializer/firebase";
import { auth } from "../initializer/firebase";
import { generarPdfCorteCajaDia } from "../js/services/pdf_corte_caja";
import {
  cerrarCajaHoy,
  obtenerCorteCajaDia,
  listarCortesCaja,
} from "../js/services/corte_caja_firestore";
import {
  guardarEgreso,
  obtenerEgresosDia,
  eliminarEgreso,
  actualizarEgreso,
} from "../js/services/egresos_firestore";
import ModalEgresos from "../components/modal_egresos";
import "../css/reportes.css";

const money = (value) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ymd = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

const DENOMINACIONES = [
  1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5,
];

export default function Reportes() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cerrandoCaja, setCerrandoCaja] = useState(false);
  const [cajaCerradaHoy, setCajaCerradaHoy] = useState(false);
  const [mostrarModalCierre, setMostrarModalCierre] = useState(false);
  const [corteHoyDetalle, setCorteHoyDetalle] = useState(null);
  const [fondoInicialCaja, setFondoInicialCaja] = useState("");
  const [denominaciones, setDenominaciones] = useState({});
  const [retiros, setRetiros] = useState([]);
  const [notasCorte, setNotasCorte] = useState("");
  const [cortesHistorial, setCortesHistorial] = useState([]);
  const [filtroCajero, setFiltroCajero] = useState("");
  const [fechaCorteDesde, setFechaCorteDesde] = useState("");
  const [fechaCorteHasta, setFechaCorteHasta] = useState("");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return ymd(d);
  });
  const [fechaHasta, setFechaHasta] = useState(() => ymd(new Date()));
  const [mostrarModalEgresos, setMostrarModalEgresos] = useState(false);
  const [egresos, setEgresos] = useState([]);
  const [cargandoEgresos, setCargandoEgresos] = useState(false);

  // Estados para calendario y filtros visuales
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [fijarCalendario, setFijarCalendario] = useState(() => {
    try {
      return localStorage.getItem("reportes_calendar_pinned") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    obtenerVentas();
    cargarEstadoCorteHoy();
    cargarHistorialCortes();
    cargarEgresosDia();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("reportes_calendar_pinned", fijarCalendario ? "1" : "0");
    } catch (e) {
      console.error("Error saving calendar state:", e);
    }
  }, [fijarCalendario]);

  const cambiarFecchaAlSeleccionarDia = (fecha) => {
    const f = ymd(fecha);
    setFechaDesde(f);
    setFechaHasta(f);
    setSelectedDate(fecha);
  };

  const toggleFijarCalendario = () => {
    setFijarCalendario((prev) => {
      const next = !prev;
      if (next) setMostrarCalendario(true);
      return next;
    });
  };

  const cargarEstadoCorteHoy = async () => {
    const corte = await obtenerCorteCajaDia();
    setCajaCerradaHoy(!!(corte && corte.cerrado));
    setCorteHoyDetalle(corte || null);
    if (corte?.fondoInicialCaja !== undefined && corte?.fondoInicialCaja !== null) {
      setFondoInicialCaja(String(corte.fondoInicialCaja));
    }
    if (Array.isArray(corte?.denominaciones)) {
      const map = {};
      corte.denominaciones.forEach((d) => {
        map[String(d.valor)] = Number(d.cantidad || 0);
      });
      setDenominaciones(map);
    }
    if (Array.isArray(corte?.retiros)) {
      setRetiros(
        corte.retiros.map((r, idx) => ({
          id: `r-${idx}-${Date.now()}`,
          tipo: String(r?.tipo || "retiro"),
          monto: String(r?.monto ?? ""),
          motivo: String(r?.motivo || ""),
          usuario: String(r?.usuario || ""),
        }))
      );
    }
    if (corte?.notasCorte) setNotasCorte(String(corte.notasCorte));
  };

  const cargarHistorialCortes = async () => {
    const data = await listarCortesCaja();
    setCortesHistorial(Array.isArray(data) ? data : []);
  };

  const cargarEgresosDia = async () => {
    try {
      setCargandoEgresos(true);
      const datos = await obtenerEgresosDia();
      setEgresos(Array.isArray(datos?.egresos) ? datos.egresos : []);
    } catch (err) {
      console.error("Error cargando egresos:", err);
    } finally {
      setCargandoEgresos(false);
    }
  };

  const handleAgregarEgreso = async (egreso) => {
    try {
      await guardarEgreso({
        ...egreso,
        usuario: auth.currentUser?.email || "sin_usuario",
      });
      await cargarEgresosDia();
    } catch (err) {
      console.error("Error agregando egreso:", err);
      alert("No se pudo agregar el egreso");
    }
  };

  const handleEliminarEgreso = async (egresoId) => {
    if (!confirm("¿Confirmas que quieres eliminar este egreso?")) return;
    try {
      await eliminarEgreso(egresoId);
      await cargarEgresosDia();
    } catch (err) {
      console.error("Error eliminando egreso:", err);
      alert("No se pudo eliminar el egreso");
    }
  };

  const handleEditarEgreso = async (egresoId, actualizacion) => {
    try {
      await actualizarEgreso(egresoId, actualizacion);
      await cargarEgresosDia();
    } catch (err) {
      console.error("Error editando egreso:", err);
      alert("No se pudo editar el egreso");
    }
  };

  const obtenerVentas = async () => {
    setLoading(true);
    const querySnapshot = await getDocs(collection(db, "ventas"));
    const lista = querySnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    setVentas(lista);
    setLoading(false);
  };

  const totalEgresos = useMemo(() => {
    return egresos.reduce((acc, e) => acc + Number(e.monto || 0), 0);
  }, [egresos]);

  const updateDenominacion = (valor, cantidad) => {
    const key = String(valor);
    setDenominaciones((prev) => ({
      ...prev,
      [key]: Math.max(0, Number(cantidad || 0)),
    }));
  };

  const agregarMovimiento = (tipo = "retiro") => {
    setRetiros((prev) => [
      ...prev,
      {
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tipo,
        monto: "",
        motivo: "",
        usuario: auth.currentUser?.email || "",
      },
    ]);
  };

  const updateRetiro = (id, patch) => {
    setRetiros((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const eliminarRetiro = (id) => {
    setRetiros((prev) => prev.filter((r) => r.id !== id));
  };

  const handleCorteCaja = async () => {
    if (cerrandoCaja) return;
    if (fondoInicialNum <= 0) {
      alert("Captura el fondo de caja de apertura antes de cerrar.");
      return;
    }

    try {
      setCerrandoCaja(true);
      const res = await cerrarCajaHoy(ventas, {
        efectivoContado: Number(totalDenominaciones || 0),
        fondoInicialCaja: Number(fondoInicialNum || 0),
        denominaciones: DENOMINACIONES.map((valor) => ({
          valor,
          cantidad: Number(denominaciones[String(valor)] || 0),
        })),
        retiros: retirosValidos,
        cajero: {
          uid: auth.currentUser?.uid || "",
          email: auth.currentUser?.email || "",
          nombre: auth.currentUser?.displayName || "",
        },
        notasCorte,
      });
      setCajaCerradaHoy(true);
      setCorteHoyDetalle(res.corte || null);
      await cargarHistorialCortes();

      if (res.yaCerrado) {
        alert("La caja de hoy ya estaba cerrada. Se descargara el PDF del corte.");
      } else {
        alert("Caja cerrada correctamente. No se podran registrar mas ventas hoy.");
      }

      await generarPdfCorteCajaDia(ventas, {
        corte: res.corte || null,
        fechaKey: res?.corte?.fechaKey || ymd(new Date()),
      });
      setMostrarModalCierre(false);
    } catch (err) {
      console.error("Error cerrando caja:", err);
      alert("No se pudo cerrar la caja.");
    } finally {
      setCerrandoCaja(false);
    }
  };

  const handleBotonCorte = async () => {
    if (cajaCerradaHoy) {
      await generarPdfCorteCajaDia(ventas, {
        corte: corteHoyDetalle || null,
        fechaKey: ymd(new Date()),
      });
      return;
    }
    setMostrarModalCierre(true);
  };

  const handleDescargarCorteHistorial = async (corte) => {
    const key = String(corte?.fechaKey || "");
    if (!key) return;
    const ventasDia = ventas.filter((v) => {
      const fecha = toDate(v.fecha);
      return fecha && ymd(fecha) === key;
    });
    await generarPdfCorteCajaDia(ventasDia, {
      corte: corte || null,
      fechaKey: key,
    });
  };

  const ventasFiltradas = useMemo(() => {
    const desde = fechaDesde ? new Date(`${fechaDesde}T00:00:00`) : null;
    const hasta = fechaHasta ? new Date(`${fechaHasta}T23:59:59`) : null;
    const txt = filtroTexto.trim().toLowerCase();

    return ventas.filter((v) => {
      const fecha = toDate(v.fecha);
      if (!fecha) return false;
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;

      if (!txt) return true;
      const id = String(v.id || "").toLowerCase();
      const tipo = String(v.tipoPago || "").toLowerCase();
      const productos = (v.productos || []).map((p) => String(p?.nombre || "").toLowerCase()).join(" ");
      return id.includes(txt) || tipo.includes(txt) || productos.includes(txt);
    });
  }, [ventas, fechaDesde, fechaHasta, filtroTexto]);

  const kpis = useMemo(() => {
    const total = ventasFiltradas.reduce((acc, v) => acc + Number(v.total || 0), 0);
    const tickets = ventasFiltradas.length;
    const promedio = tickets > 0 ? total / tickets : 0;

    const hoyIni = startOfToday();
    const hoyFin = endOfToday();
    const ventasHoy = ventas.filter((v) => {
      const f = toDate(v.fecha);
      return f && f >= hoyIni && f <= hoyFin;
    });
    const totalHoy = ventasHoy.reduce((acc, v) => acc + Number(v.total || 0), 0);

    let unidades = 0;
    ventasFiltradas.forEach((v) => {
      (v.productos || []).forEach((p) => {
        unidades += Number(p?.cantidad || 0);
      });
    });

    const iva = ventasFiltradas.reduce((acc, v) => acc + Number(v.iva || 0), 0);
    return { total, tickets, promedio, totalHoy, unidades, iva };
  }, [ventas, ventasFiltradas]);

  const ventasPorDia = useMemo(() => {
    const map = new Map();
    ventasFiltradas.forEach((v) => {
      const f = toDate(v.fecha);
      if (!f) return;
      const key = ymd(f);
      const curr = map.get(key) || 0;
      map.set(key, curr + Number(v.total || 0));
    });

    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([fecha, total]) => ({ fecha, total: Number(total.toFixed(2)) }));
  }, [ventasFiltradas]);

  const topProductos = useMemo(() => {
    const map = new Map();
    ventasFiltradas.forEach((v) => {
      (v.productos || []).forEach((p) => {
        // Detectar si es un servicio
        const esServicio = p?.tipo?.toLowerCase() === "servicio" || 
                          ["lap", "laptop", "computadora", "impresora", "reparación", "servicio"].some(
                            (s) => String(p?.nombre || "").toLowerCase().includes(s)
                          );
        
        const nombre = esServicio ? `🔧 Servicios` : (p?.nombre || "Sin nombre");
        const cantidad = Number(p?.cantidad || 0);
        const importe = Number(p?.precioVenta || 0) * cantidad;
        const curr = map.get(nombre) || { cantidad: 0, importe: 0 };
        map.set(nombre, {
          cantidad: curr.cantidad + cantidad,
          importe: curr.importe + importe,
        });
      });
    });

    return [...map.entries()]
      .map(([nombre, val]) => ({ nombre, ...val }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);
  }, [ventasFiltradas]);

  const utilidadPorProducto = useMemo(() => {
    const map = new Map();
    ventasFiltradas.forEach((v) => {
      (v.productos || []).forEach((p) => {
        const nombre = p?.nombre || "Sin nombre";
        const cantidad = Number(p?.cantidad || 0);
        const venta = Number(p?.precioVenta || 0);
        const compra = Number(p?.precioCompra || 0);
        const utilidad = (venta - compra) * cantidad;
        const curr = map.get(nombre) || 0;
        map.set(nombre, curr + utilidad);
      });
    });

    return [...map.entries()]
      .map(([nombre, utilidad]) => ({ nombre, utilidad: Number(utilidad.toFixed(2)) }))
      .sort((a, b) => b.utilidad - a.utilidad)
      .slice(0, 10);
  }, [ventasFiltradas]);

  const metodosPago = useMemo(() => {
    const resumen = { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0 };

    ventasFiltradas.forEach((v) => {
      const detalle = v?.pagoDetalle || {};
      const tipo = String(v?.tipoPago || "").toLowerCase();

      resumen.efectivo += Number(detalle.efectivo || (tipo === "efectivo" ? v.total : 0) || 0);
      resumen.tarjeta += Number(detalle.tarjeta || (tipo === "tarjeta" ? v.total : 0) || 0);
      resumen.transferencia += Number(
        detalle.transferencia || (tipo === "transferencia" ? v.total : 0) || 0
      );

      if (!["efectivo", "tarjeta", "transferencia"].includes(tipo)) {
        resumen.otros += Number(v.total || 0);
      }
    });

    return [
      { name: "Efectivo", value: Number(resumen.efectivo.toFixed(2)) },
      { name: "Tarjeta", value: Number(resumen.tarjeta.toFixed(2)) },
      { name: "Transferencia", value: Number(resumen.transferencia.toFixed(2)) },
      { name: "Otros", value: Number(resumen.otros.toFixed(2)) },
    ].filter((x) => x.value > 0);
  }, [ventasFiltradas]);

  const coloresPie = ["#16a34a", "#2563eb", "#9333ea", "#f59e0b"];
  const ventasHoy = useMemo(() => {
    const ini = startOfToday();
    const fin = endOfToday();
    return ventas.filter((v) => {
      const f = toDate(v.fecha);
      return f && f >= ini && f <= fin;
    });
  }, [ventas]);

  const efectivoEsperadoHoy = useMemo(() => {
    return ventasHoy.reduce((acc, v) => {
      const tipo = String(v?.tipoPago || "").toLowerCase();
      const detalle = v?.pagoDetalle || {};
      const efectivo = Number(detalle.efectivo || (tipo === "efectivo" ? v.total : 0) || 0);
      return acc + efectivo;
    }, 0);
  }, [ventasHoy]);

  const fondoInicialNum = Number(String(fondoInicialCaja || "").replace(/,/g, "").trim()) || 0;

  const totalDenominaciones = useMemo(() => {
    return DENOMINACIONES.reduce((acc, valor) => {
      const cantidad = Number(denominaciones[String(valor)] || 0);
      return acc + valor * cantidad;
    }, 0);
  }, [denominaciones]);

  const retirosValidos = useMemo(() => {
    return retiros
      .map((r) => ({
        tipo: String(r?.tipo || "retiro"),
        monto: Number(String(r?.monto || "").replace(/,/g, "")),
        motivo: String(r?.motivo || "").trim(),
        usuario: String(r?.usuario || "").trim() || auth.currentUser?.email || "sin_usuario",
      }))
      .filter((r) => Number.isFinite(r.monto) && r.monto > 0);
  }, [retiros]);

  const totalRetiros = useMemo(() => {
    return retirosValidos.reduce((acc, r) => acc + Number(r.monto || 0), 0);
  }, [retirosValidos]);

  const cajaFinalEsperada = fondoInicialNum + efectivoEsperadoHoy - totalRetiros;
  const diferenciaContado = totalDenominaciones - efectivoEsperadoHoy;
  const aperturaPendiente = !cajaCerradaHoy && fondoInicialNum <= 0;

  const cortesHistorialFiltrado = useMemo(() => {
    const cajeroQ = filtroCajero.trim().toLowerCase();
    return cortesHistorial.filter((c) => {
      const f = String(c?.fechaKey || "");
      if (fechaCorteDesde && f < fechaCorteDesde) return false;
      if (fechaCorteHasta && f > fechaCorteHasta) return false;

      if (!cajeroQ) return true;
      const byEmail = String(c?.cajero?.email || "").toLowerCase();
      const byNombre = String(c?.cajero?.nombre || "").toLowerCase();
      const byUid = String(c?.cajero?.uid || "").toLowerCase();
      return byEmail.includes(cajeroQ) || byNombre.includes(cajeroQ) || byUid.includes(cajeroQ);
    });
  }, [cortesHistorial, filtroCajero, fechaCorteDesde, fechaCorteHasta]);

  return (
    <Layout>
      <div className={`reportes-page ${fijarCalendario ? "calendar-layout-pinned" : ""}`}>
      
        <div className="reportes-header">
          <h1>Reportes</h1>
          <div className="reportes-header-actions">

            <button
              className="btn-refresh"
              onClick={async () => {
                await Promise.all([obtenerVentas(), cargarEstadoCorteHoy(), cargarHistorialCortes(), cargarEgresosDia()]);
              }}
              type="button"
            >
              Actualizar
            </button>
            <button
              className="btn-egresos"
              type="button"
              onClick={() => setMostrarModalEgresos(true)}
              title="Registrar egresos"
            >
              📊 Egresos
            </button>
            <button
              className="btn-corte"
              type="button"
              onClick={handleBotonCorte}
              disabled={cerrandoCaja}
            >
              {cajaCerradaHoy ? "Descargar corte de hoy (PDF)" : "Cerrar caja de hoy + PDF"}
            </button>
          </div>
        </div>

        {aperturaPendiente && (
          <div className="apertura-alert">
            Fondo de caja apertura pendiente. Capturalo antes de cerrar la caja de hoy.
          </div>
        )}
     

        <div className="reportes-kpis">
          <div className="kpi-card">
            <small>Ventas hoy</small>
            <b>{money(kpis.totalHoy)}</b>
          </div>
          <div className="kpi-card">
            <small>Total periodo</small>
            <b>{money(kpis.total)}</b>
          </div>
          <div className="kpi-card">
            <small>Tickets</small>
            <b>{kpis.tickets}</b>
          </div>
          <div className="kpi-card">
            <small>Ticket promedio</small>
            <b>{money(kpis.promedio)}</b>
          </div>
          <div className="kpi-card">
            <small>Unidades vendidas</small>
            <b>{kpis.unidades}</b>
          </div>
          <div className="kpi-card">
            <small>IVA total</small>
            <b>{money(kpis.iva)}</b>
          </div>
        </div>

        <div className="reportes-grid">
          <div className="chart-card">
            <h3>Ventas por dia (ultimos 30 dias)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={ventasPorDia}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" />
                <YAxis />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} name="Total" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>Top productos (unidades)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProductos}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nombre" hide />
                <YAxis />
                <Tooltip formatter={(v) => v} />
                <Legend />
                <Bar dataKey="cantidad" fill="#16a34a" name="Unidades" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>Metodo de pago</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={metodosPago} dataKey="value" nameKey="name" outerRadius={95} label>
                  {metodosPago.map((entry, idx) => (
                    <Cell key={entry.name} fill={coloresPie[idx % coloresPie.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>Utilidad estimada por producto</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={utilidadPorProducto}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nombre" hide />
                <YAxis />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Bar dataKey="utilidad" fill="#9333ea" name="Utilidad" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
 
        <div className="tabla-reportes-wrap">
          <h3>Historial de cortes (fecha y cajero)</h3>
          <div className="historial-cortes-filtros">
            <input
              type="date"
              value={fechaCorteDesde}
              onChange={(e) => setFechaCorteDesde(e.target.value)}
            />
            <input
              type="date"
              value={fechaCorteHasta}
              onChange={(e) => setFechaCorteHasta(e.target.value)}
            />
            <input
              placeholder="Filtrar por cajero (email/nombre)"
              value={filtroCajero}
              onChange={(e) => setFiltroCajero(e.target.value)}
            />
          </div>

          {cortesHistorialFiltrado.length === 0 ? (
            <p>Sin cortes para el filtro actual.</p>
          ) : (
            <table className="tabla-reportes">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cajero</th>
                  <th>Tickets</th>
                  <th>IVA</th>
                  <th>Efectivo esperado</th>
                  <th>Contado</th>
                  <th>Diferencia</th>
                  <th>Documento</th>
                </tr>
              </thead>
              <tbody>
                {cortesHistorialFiltrado.map((c) => (
                  <tr key={c.id}>
                    <td>{c.fechaKey || "-"}</td>
                    <td>{c?.cajero?.email || c?.cajero?.nombre || "-"}</td>
                    <td>{Number(c?.resumen?.tickets || 0)}</td>
                    <td>{money(c?.resumen?.iva || 0)}</td>
                    <td>{money(c?.conteoEfectivo?.esperado || 0)}</td>
                    <td>{c?.conteoEfectivo?.contado == null ? "-" : money(c?.conteoEfectivo?.contado)}</td>
                    <td>{c?.conteoEfectivo?.diferencia == null ? "-" : money(c?.conteoEfectivo?.diferencia)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-refresh btn-documento-corte"
                        onClick={() => handleDescargarCorteHistorial(c)}
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
  <div className="reportes-buscador">
      
          <div className="filtro-texto-wrap">
            <label>Buscar</label>
            <input
              placeholder="ID venta, metodo o producto..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
          </div>
        </div>
        <div className="tabla-reportes-wrap">
          <h3>Detalle de ventas</h3>
          {loading && <p>Cargando...</p>}
          {!loading && ventasFiltradas.length === 0 && <p>Sin resultados en el filtro actual.</p>}

          {!loading && ventasFiltradas.length > 0 && (
            <table className="tabla-reportes">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Metodo</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {ventasFiltradas
                  .slice()
                  .sort((a, b) => (toDate(b.fecha)?.getTime() || 0) - (toDate(a.fecha)?.getTime() || 0))
                  .map((v) => (
                    <tr key={v.id}>
                      <td>{v.id}</td>
                      <td>{toDate(v.fecha)?.toLocaleString("es-MX") || "-"}</td>
                      <td>{money(v.total)}</td>
                      <td>{v.tipoPago || "-"}</td>
                      <td>
                        {(v.productos || [])
                          .map((p) => `${p.nombre} x${p.cantidad}`)
                          .slice(0, 3)
                          .join(" | ")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {mostrarModalCierre && (
          <div className="corte-modal-overlay">
            <div className="corte-modal">
              <h2>Cerrar caja de hoy</h2>
              <p className="corte-modal-sub">
                Completa el arqueo de caja. Al confirmar se cerrara el dia y se generara el PDF.
              </p>

              <div className="conteo-caja-grid">
                <div>
                  <label>Fondo inicial</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fondoInicialCaja}
                    onChange={(e) => setFondoInicialCaja(e.target.value)}
                  />
                </div>
                <div>
                  <label>Efectivo esperado</label>
                  <div className="conteo-caja-value">{money(efectivoEsperadoHoy)}</div>
                </div>
                <div>
                  <label>Caja final esperada</label>
                  <div className="conteo-caja-value">{money(cajaFinalEsperada)}</div>
                </div>
              </div>

              <div className="denominaciones-wrap">
                <h4>Denominaciones</h4>
                <div className="denominaciones-grid">
                  {DENOMINACIONES.map((valor) => (
                    <div key={`modal-den-${valor}`} className="den-item">
                      <label>{money(valor)}</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={denominaciones[String(valor)] || ""}
                        onChange={(e) => updateDenominacion(valor, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="conteo-caja-grid">
                <div>
                  <label>Total contado</label>
                  <div className="conteo-caja-value">{money(totalDenominaciones)}</div>
                </div>
                <div>
                  <label>Diferencia</label>
                  <div className={`conteo-caja-value ${diferenciaContado < 0 ? "neg" : "pos"}`}>
                    {money(diferenciaContado)}
                  </div>
                </div>
                <div>
                  <label>Total retiros/gastos</label>
                  <div className="conteo-caja-value">{money(totalRetiros)}</div>
                </div>
              </div>

              <div className="retiros-wrap">
                <div className="retiros-head">
                  <h4>Retiros / Gastos</h4>
                  <div className="reportes-header-actions">
                    <button
                      className="btn-refresh"
                      type="button"
                      onClick={() => agregarMovimiento("retiro")}
                    >
                      + Retiro
                    </button>
                    <button
                      className="btn-refresh"
                      type="button"
                      onClick={() => agregarMovimiento("gasto")}
                    >
                      + Gasto
                    </button>
                    <button
                      className="btn-refresh"
                      type="button"
                      onClick={() => agregarMovimiento("vale")}
                    >
                      + Vale
                    </button>
                  </div>
                </div>
                {retiros.length === 0 && <p className="conteo-caja-hint">Sin retiros registrados.</p>}
                {retiros.map((r) => (
                  <div key={`modal-${r.id}`} className="retiro-row">
                    <select value={r.tipo} onChange={(e) => updateRetiro(r.id, { tipo: e.target.value })}>
                      <option value="retiro">Retiro</option>
                      <option value="gasto">Gasto</option>
                      <option value="vale">Vale</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Monto"
                      value={r.monto}
                      onChange={(e) => updateRetiro(r.id, { monto: e.target.value })}
                    />
                    <input
                      placeholder="Motivo"
                      value={r.motivo}
                      onChange={(e) => updateRetiro(r.id, { motivo: e.target.value })}
                    />
                    <input
                      placeholder="Usuario"
                      value={r.usuario}
                      onChange={(e) => updateRetiro(r.id, { usuario: e.target.value })}
                    />
                    <button className="btn-corte" type="button" onClick={() => eliminarRetiro(r.id)}>
                      Quitar
                    </button>
                  </div>
                ))}
              </div>

              <div className="conteo-caja-notas">
                <label>Notas del corte</label>
                <input value={notasCorte} onChange={(e) => setNotasCorte(e.target.value)} />
              </div>

              <div className="corte-modal-actions">
                <button
                  className="btn-corte"
                  type="button"
                  onClick={handleCorteCaja}
                  disabled={cerrandoCaja}
                >
                  {cerrandoCaja ? "Cerrando..." : "Confirmar cierre y generar PDF"}
                </button>
                <button
                  className="btn-refresh"
                  type="button"
                  onClick={() => setMostrarModalCierre(false)}
                  disabled={cerrandoCaja}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <ModalEgresos
          mostrar={mostrarModalEgresos}
          onClose={() => setMostrarModalEgresos(false)}
          egresos={egresos}
          onAgregarEgreso={handleAgregarEgreso}
          onEliminarEgreso={handleEliminarEgreso}
          onEditarEgreso={handleEditarEgreso}
          totalEgresos={totalEgresos}
        />

        <button
          className={`calendar-side-tab ${mostrarCalendario || fijarCalendario ? "open" : ""}`}
          onClick={() => setMostrarCalendario((v) => !v)}
        >
          {"\u{1F4C5}"} Calendario
        </button>

        {(mostrarCalendario || fijarCalendario) && (
          <aside className={`calendar-side-drawer ${fijarCalendario ? "pinned" : ""}`}>
            <div className="calendar-side-actions">
              <button className="btn-light" onClick={() => setMostrarCalendario(false)}>
                {"\u{1F441}"} Ocultar
              </button>
              <button className="btn-light" onClick={toggleFijarCalendario}>
                {fijarCalendario ? "\u{1F4CD} Desfijar" : "\u{1F4CC} Fijar"}
              </button>
            </div>

            <div className="calendar-box side">
              <h4>Selecciona un día</h4>
              <Calendar
                onChange={cambiarFecchaAlSeleccionarDia}
                value={selectedDate}
              />
            </div>

            <div className="panel-card side">
              <div className="panel-header">
                <h4>
                  Reportes para{" "}
                  {selectedDate.toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h4>
              </div>
              {ventasFiltradas.length === 0 ? (
                <p className="sin-resultados">No hay ventas para esta fecha.</p>
              ) : (
                <div className="ventas-resumen-calendario">
                  <div className="resumen-dia">
                    <span className="label">Total ventas:</span>
                    <span className="valor">{money(ventasFiltradas.reduce((acc, v) => acc + Number(v.total || 0), 0))}</span>
                  </div>
                  <div className="resumen-dia">
                    <span className="label">Tickets:</span>
                    <span className="valor">{ventasFiltradas.length}</span>
                  </div>
                  <div className="resumen-dia">
                    <span className="label">Ticket promedio:</span>
                    <span className="valor">
                      {money(ventasFiltradas.length > 0 ? ventasFiltradas.reduce((acc, v) => acc + Number(v.total || 0), 0) / ventasFiltradas.length : 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </Layout>
  );
}
