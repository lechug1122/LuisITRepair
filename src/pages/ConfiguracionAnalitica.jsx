import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../initializer/firebase";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { auth } from "../initializer/firebase";
import { hasAnalyticsAccess } from "../js/services/analytics_access";
import "../css/configuracion_analitica.css";

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, withTime = true) {
  const date = toDate(value);
  if (!date) return "Sin actividad";
  return date.toLocaleString("es-MX", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" });
}

function formatDuration(milliseconds = 0) {
  const minutes = Math.round(Number(milliseconds || 0) / 60000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours} h${remaining ? ` ${remaining} min` : ""}`;
}

function businessId(item = {}) {
  return String(item.negocioId || item.cuentaPrincipalUid || item.uid || item.id || "").trim();
}

function eventMillis(event) {
  return toDate(event.createdAt || event.clientAt)?.getTime() || 0;
}

async function exportRows(filename, sheets) {
  const XLSX = await import("xlsx-js-style");
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    const safeRows = rows.length ? rows : [{ mensaje: "Sin datos" }];
    const sheet = XLSX.utils.json_to_sheet(safeRows);
    sheet["!cols"] = Object.keys(safeRows[0] || {}).map((key) => ({
      wch: Math.min(45, Math.max(12, key.length + 2)),
    }));
    XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  });
  XLSX.writeFile(workbook, filename);
}

function normalizeExportItem(item, nameByBusiness) {
  const normalized = {};
  Object.entries(item).forEach(([key, value]) => {
    if (typeof value === "object" && value !== null) {
      normalized[key] = toDate(value)?.toISOString() || JSON.stringify(value);
    } else {
      normalized[key] = value;
    }
  });
  normalized.negocio = nameByBusiness[businessId(item)] || businessId(item);
  return normalized;
}

export default function ConfiguracionAnalitica() {
  const { superAdmin, accesoAnalitica } = useAutorizacionActual();
  const [days, setDays] = useState(30);
  const [businessFilter, setBusinessFilter] = useState("todos");
  const [negocios, setNegocios] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [configuraciones, setConfiguraciones] = useState([]);
  const [sesionesDispositivo, setSesionesDispositivo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let loaded = 0;
    const done = () => {
      loaded += 1;
      if (loaded >= 9) setLoading(false);
    };
    const subscriptions = [
      onSnapshot(collection(db, "negocios"), (snap) => {
        setNegocios(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        done();
      }, done),
      onSnapshot(collection(db, "autorizados"), (snap) => {
        setUsuarios(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        done();
      }, done),
      onSnapshot(
        query(collection(db, "analitica_eventos"), orderBy("createdAt", "desc"), limit(2000)),
        (snap) => {
          setEventos(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
          done();
        },
        done,
      ),
      onSnapshot(collection(db, "productos"), (snap) => {
        setProductos(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        done();
      }, done),
      onSnapshot(collection(db, "ventas"), (snap) => {
        setVentas(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        done();
      }, done),
      onSnapshot(collection(db, "clientes"), (snap) => {
        setClientes(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        done();
      }, done),
      onSnapshot(collection(db, "servicios"), (snap) => {
        setServicios(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        done();
      }, done),
      onSnapshot(collection(db, "configuracion"), (snap) => {
        setConfiguraciones(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        done();
      }, done),
      onSnapshot(collection(db, "sesiones_dispositivo"), (snap) => {
        setSesionesDispositivo(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        done();
      }, done),
    ];
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, []);

  const eventosFiltrados = useMemo(() => {
    const since = now - days * 86400000;
    return eventos.filter((event) => {
      if (eventMillis(event) < since) return false;
      return businessFilter === "todos" || businessId(event) === businessFilter;
    });
  }, [businessFilter, days, eventos, now]);

  const nameByBusiness = useMemo(() => {
    const map = {};
    negocios.forEach((business) => {
      map[businessId(business)] =
        business.nombre || business.nombreEmpresa || business.correo || business.id;
    });
    usuarios.forEach((user) => {
      const id = businessId(user);
      if (id && !map[id] && (user.esCuentaPrincipal || user.uid === id || user.id === id)) {
        map[id] = user.nombre || user.correo || id;
      }
    });
    return map;
  }, [negocios, usuarios]);

  const businessRows = useMemo(() => {
    const ids = new Set([
      ...negocios.map(businessId),
      ...usuarios.map(businessId),
      ...eventosFiltrados.map(businessId),
    ].filter(Boolean));

    return [...ids].map((id) => {
      const events = eventosFiltrados.filter((event) => businessId(event) === id);
      const users = usuarios.filter((user) => businessId(user) === id);
      const views = events.filter((event) => event.tipo === "vista_pagina");
      const durations = events.filter((event) => event.tipo === "tiempo_pagina");
      const latestEvent = [...events].sort((a, b) => eventMillis(b) - eventMillis(a))[0] || null;
      const activeWorkers = new Set(
        events
          .filter((event) => event.tipo === "vista_pagina")
          .map((event) => event.uid)
          .filter(Boolean),
      ).size;
      const lastValues = [
        ...events.map(eventMillis),
        ...users.map((user) => toDate(user.lastActive)?.getTime() || 0),
      ];
      return {
        id,
        nombre: nameByBusiness[id] || id,
        usuarios: users.length,
        trabajadoresActivos: activeWorkers,
        ingresos: new Set(views.map((event) => event.sessionId).filter(Boolean)).size,
        vistas: views.length,
        tiempoMs: durations.reduce((sum, event) => sum + Number(event.duracionMs || 0), 0),
        errores: events.filter((event) => event.tipo === "error").length,
        ultimaActividad: Math.max(0, ...lastValues),
        ultimaAccion:
          latestEvent?.tipo === "click"
            ? latestEvent.elemento || "Clic"
            : latestEvent?.ruta || latestEvent?.tipo || "Sin actividad registrada",
      };
    }).sort((a, b) => b.ultimaActividad - a.ultimaActividad);
  }, [eventosFiltrados, nameByBusiness, negocios, usuarios]);

  const routeRows = useMemo(() => {
    const map = {};
    eventosFiltrados.forEach((event) => {
      if (!["vista_pagina", "tiempo_pagina"].includes(event.tipo)) return;
      const route = event.ruta || "/";
      if (!map[route]) map[route] = { ruta: route, vistas: 0, tiempoMs: 0 };
      if (event.tipo === "vista_pagina") map[route].vistas += 1;
      if (event.tipo === "tiempo_pagina") map[route].tiempoMs += Number(event.duracionMs || 0);
    });
    return Object.values(map).sort((a, b) => b.tiempoMs - a.tiempoMs).slice(0, 12);
  }, [eventosFiltrados]);

  const clickRows = useMemo(() => {
    const map = {};
    eventosFiltrados.filter((event) => event.tipo === "click").forEach((event) => {
      const key = `${event.ruta || "/"}|${event.elemento || "Elemento"}`;
      if (!map[key]) map[key] = { ruta: event.ruta || "/", elemento: event.elemento || "Elemento", total: 0 };
      map[key].total += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 12);
  }, [eventosFiltrados]);

  const errors = useMemo(
    () => eventosFiltrados.filter((event) => event.tipo === "error").slice(0, 30),
    [eventosFiltrados],
  );

  const previousEvents = useMemo(() => {
    const end = now - days * 86400000;
    const start = end - days * 86400000;
    return eventos.filter((event) => {
      const time = eventMillis(event);
      if (time < start || time >= end) return false;
      return businessFilter === "todos" || businessId(event) === businessFilter;
    });
  }, [businessFilter, days, eventos, now]);

  const comparison = (current, previous) => {
    if (!previous) return current ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const uniqueSessions = (items) =>
    new Set(items.filter((event) => event.tipo === "vista_pagina").map((event) => event.sessionId).filter(Boolean)).size;

  const retention = useMemo(() => {
    const rows = businessRows.map((row) => {
      const inactiveDays = row.ultimaActividad
        ? Math.floor((now - row.ultimaActividad) / 86400000)
        : 999;
      return { ...row, inactiveDays };
    });
    return {
      activos7: rows.filter((row) => row.inactiveDays <= 7).length,
      riesgo15: rows.filter((row) => row.inactiveDays > 7 && row.inactiveDays <= 15).length,
      inactivos30: rows.filter((row) => row.inactiveDays > 30).length,
      nunca: rows.filter((row) => !row.ultimaActividad).length,
    };
  }, [businessRows, now]);

  const operationalByBusiness = useMemo(() => {
    const countBy = (items, id) => items.filter((item) => businessId(item) === id).length;
    return businessRows.map((row) => ({
      ...row,
      productos: countBy(productos, row.id),
      ventas: countBy(ventas, row.id),
      clientes: countBy(clientes, row.id),
      servicios: countBy(servicios, row.id),
      configurado: configuraciones.some((item) => businessId(item) === row.id),
      dispositivos: sesionesDispositivo.filter((item) => businessId(item) === row.id).length,
    }));
  }, [businessRows, clientes, configuraciones, productos, servicios, sesionesDispositivo, ventas]);

  const funnel = useMemo(() => {
    const total = operationalByBusiness.length;
    return [
      { label: "Negocios registrados", value: total },
      { label: "Configuración creada", value: operationalByBusiness.filter((row) => row.configurado).length },
      { label: "Primer producto", value: operationalByBusiness.filter((row) => row.productos > 0).length },
      { label: "Primer cliente", value: operationalByBusiness.filter((row) => row.clientes > 0).length },
      { label: "Primera venta", value: operationalByBusiness.filter((row) => row.ventas > 0).length },
      { label: "Regresó al sistema", value: operationalByBusiness.filter((row) => row.ingresos > 1).length },
    ].map((step) => ({ ...step, percent: total ? Math.round((step.value / total) * 100) : 0 }));
  }, [operationalByBusiness]);

  const groupedErrors = useMemo(() => {
    const map = {};
    eventosFiltrados.filter((event) => event.tipo === "error").forEach((event) => {
      const key = event.mensaje || "Error sin mensaje";
      if (!map[key]) map[key] = { mensaje: key, total: 0, negocios: new Set(), ultima: 0, rutas: new Set() };
      map[key].total += 1;
      map[key].negocios.add(businessId(event));
      map[key].rutas.add(event.ruta || "/");
      map[key].ultima = Math.max(map[key].ultima, eventMillis(event));
    });
    return Object.values(map)
      .map((item) => ({ ...item, negociosTotal: item.negocios.size, rutasTexto: [...item.rutas].join(", ") }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [eventosFiltrados]);

  const performanceRows = useMemo(() => {
    const map = {};
    eventosFiltrados.filter((event) => event.tipo === "rendimiento").forEach((event) => {
      const route = event.ruta || "/";
      if (!map[route]) map[route] = { ruta: route, total: 0, count: 0, max: 0 };
      const duration = Number(event.duracionMs || 0);
      map[route].total += duration;
      map[route].count += 1;
      map[route].max = Math.max(map[route].max, duration);
    });
    return Object.values(map)
      .map((row) => ({ ...row, average: row.count ? Math.round(row.total / row.count) : 0 }))
      .sort((a, b) => b.average - a.average);
  }, [eventosFiltrados]);

  const moduleRows = useMemo(() => {
    const modules = [
      ["Inicio", /^\/home/],
      ["Servicios", /^\/(servicios|hoja_servicio)/],
      ["Clientes", /^\/clientes/],
      ["Punto de venta", /^\/POS/i],
      ["Productos", /^\/(productos|configuracion\/inventario)/],
      ["Reportes", /^\/reportes/],
      ["Configuración", /^\/configuracion/],
    ];
    const viewsByModule = modules.map(([label, matcher]) => ({
      label,
      value: eventosFiltrados.filter((event) => event.tipo === "vista_pagina" && matcher.test(event.ruta || "")).length,
    }));
    const max = Math.max(1, ...viewsByModule.map((item) => item.value));
    return viewsByModule.map((item) => ({ ...item, percent: Math.round((item.value / max) * 100) }));
  }, [eventosFiltrados]);

  const inventory = useMemo(() => {
    const scoped = productos.filter((product) => businessFilter === "todos" || businessId(product) === businessFilter);
    const stock = (product) => Number(product.stock ?? product.cantidad ?? product.existencia ?? 0);
    const price = (product) => Number(product.precioVenta ?? product.precio ?? 0);
    return {
      total: scoped.length,
      sinStock: scoped.filter((product) => stock(product) <= 0).length,
      bajoStock: scoped.filter((product) => stock(product) > 0 && stock(product) <= Number(product.stockMinimo || 5)).length,
      valor: scoped.reduce((sum, product) => sum + stock(product) * price(product), 0),
    };
  }, [businessFilter, productos]);

  const alerts = useMemo(() => {
    const list = [];
    if (retention.inactivos30) list.push({ tone: "danger", text: `${retention.inactivos30} negocios llevan más de 30 días inactivos.` });
    if (retention.riesgo15) list.push({ tone: "warning", text: `${retention.riesgo15} negocios están en riesgo de abandono.` });
    if (groupedErrors[0]?.total >= 3) list.push({ tone: "danger", text: `El error “${groupedErrors[0].mensaje}” se repitió ${groupedErrors[0].total} veces.` });
    const slow = performanceRows.find((row) => row.average > 3000);
    if (slow) list.push({ tone: "warning", text: `${slow.ruta} tarda en promedio ${(slow.average / 1000).toFixed(1)} segundos.` });
    if (inventory.sinStock) list.push({ tone: "info", text: `${inventory.sinStock} productos están sin stock en el alcance seleccionado.` });
    if (!list.length) list.push({ tone: "success", text: "No se detectaron alertas importantes en el periodo." });
    return list;
  }, [groupedErrors, inventory.sinStock, performanceRows, retention]);

  const selectedBusiness = businessFilter === "todos"
    ? null
    : operationalByBusiness.find((row) => row.id === businessFilter) || null;

  const views = eventosFiltrados.filter((event) => event.tipo === "vista_pagina");
  const totalTime = eventosFiltrados
    .filter((event) => event.tipo === "tiempo_pagina")
    .reduce((sum, event) => sum + Number(event.duracionMs || 0), 0);
  const activeUsers = usuarios.filter((user) => {
    const last = toDate(user.lastActive)?.getTime() || 0;
    return user.online === true && now - last < 10 * 60000;
  }).length;
  const previousViews = previousEvents.filter((event) => event.tipo === "vista_pagina").length;
  const sessionDelta = comparison(uniqueSessions(eventosFiltrados), uniqueSessions(previousEvents));
  const viewsDelta = comparison(views.length, previousViews);
  const totalErrors = eventosFiltrados.filter((event) => event.tipo === "error").length;

  const exportAnalytics = async () => {
    await exportRows(`analitica-cajalibre-${new Date().toISOString().slice(0, 10)}.xlsx`, {
      Negocios: businessRows.map((row) => ({
        negocio: row.nombre,
        id: row.id,
        usuarios: row.usuarios,
        trabajadores_activos: row.trabajadoresActivos,
        sesiones: row.ingresos,
        vistas: row.vistas,
        tiempo: formatDuration(row.tiempoMs),
        errores: row.errores,
        ultima_actividad: row.ultimaActividad ? formatDate(row.ultimaActividad) : "Sin actividad",
        ultima_accion: row.ultimaAccion,
      })),
      Paginas: routeRows.map((row) => ({
        ruta: row.ruta,
        vistas: row.vistas,
        tiempo_total: formatDuration(row.tiempoMs),
      })),
      Clics: clickRows,
      Errores: groupedErrors.map((error) => ({
        mensaje: error.mensaje,
        repeticiones: error.total,
        negocios_afectados: error.negociosTotal,
        rutas: error.rutasTexto,
        ultima_aparicion: formatDate(error.ultima),
      })),
      Eventos_error: errors.map((error) => ({
        fecha: formatDate(error.createdAt || error.clientAt),
        negocio: nameByBusiness[businessId(error)] || businessId(error),
        ruta: error.ruta,
        mensaje: error.mensaje,
        archivo: error.archivo || "",
        linea: error.linea || "",
      })),
      Operacion: operationalByBusiness.map((row) => ({
        negocio: row.nombre,
        productos: row.productos,
        ventas: row.ventas,
        clientes: row.clientes,
        servicios: row.servicios,
        dispositivos: row.dispositivos,
        configurado: row.configurado ? "Sí" : "No",
      })),
      Rendimiento: performanceRows.map((row) => ({
        ruta: row.ruta,
        promedio_ms: row.average,
        maximo_ms: row.max,
        muestras: row.count,
      })),
    });
  };

  const exportProducts = async () => {
    const filtered = productos.filter(
      (product) => businessFilter === "todos" || businessId(product) === businessFilter,
    );
    const rows = filtered.map((product) => normalizeExportItem(product, nameByBusiness));
    await exportRows(`productos-cajalibre-${new Date().toISOString().slice(0, 10)}.xlsx`, {
      Productos: rows,
    });
  };

  const exportOperationalDatabase = async () => {
    const scoped = (items) => items
      .filter((item) => businessFilter === "todos" || businessId(item) === businessFilter)
      .map((item) => normalizeExportItem(item, nameByBusiness));
    await exportRows(`base-operativa-cajalibre-${new Date().toISOString().slice(0, 10)}.xlsx`, {
      Productos: scoped(productos),
      Ventas: scoped(ventas),
      Clientes: scoped(clientes),
      Servicios: scoped(servicios),
    });
  };

  if (!hasAnalyticsAccess({ superAdmin, accesoAnalitica, email: auth.currentUser?.email })) {
    return <div className="analytics-empty">No tienes acceso al panel de analítica.</div>;
  }

  return (
    <section className="admin-analytics">
      <header className="analytics-header">
        <div>
          <span className="analytics-eyebrow">Superadministración</span>
          <h1>Analítica del sistema</h1>
          <p>Uso por negocio, páginas visitadas, tiempo, clics y errores técnicos.</p>
        </div>
        <div className="analytics-actions">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
          <select value={businessFilter} onChange={(event) => setBusinessFilter(event.target.value)}>
            <option value="todos">Todos los negocios</option>
            {businessRows.map((row) => <option key={row.id} value={row.id}>{row.nombre}</option>)}
          </select>
          <button type="button" onClick={exportAnalytics}>Descargar análisis</button>
          <button type="button" className="secondary" onClick={exportProducts}>Descargar productos</button>
          <button type="button" className="secondary" onClick={exportOperationalDatabase}>Base operativa</button>
        </div>
      </header>

      {loading ? <p className="analytics-empty">Cargando datos administrativos...</p> : (
        <>
          <div className="analytics-alerts">
            {alerts.map((alert, index) => <div key={`${alert.text}-${index}`} className={alert.tone}>{alert.text}</div>)}
          </div>

          <div className="analytics-kpis">
            <article><span>Negocios</span><strong>{businessRows.length}</strong></article>
            <article><span>Usuarios en línea</span><strong>{activeUsers}</strong></article>
            <article><span>Sesiones</span><strong>{uniqueSessions(eventosFiltrados)}</strong><small className={sessionDelta >= 0 ? "up" : "down"}>{sessionDelta >= 0 ? "+" : ""}{sessionDelta.toFixed(0)}%</small></article>
            <article><span>Vistas</span><strong>{views.length}</strong><small className={viewsDelta >= 0 ? "up" : "down"}>{viewsDelta >= 0 ? "+" : ""}{viewsDelta.toFixed(0)}%</small></article>
            <article><span>Tiempo registrado</span><strong>{formatDuration(totalTime)}</strong></article>
            <article className={totalErrors ? "danger" : ""}><span>Errores</span><strong>{totalErrors}</strong></article>
          </div>

          <div className="analytics-grid analytics-grid-3">
            <article className="analytics-card">
              <h2>Retención y abandono</h2>
              <div className="analytics-retention">
                <div><strong>{retention.activos7}</strong><span>Activos en 7 días</span></div>
                <div><strong>{retention.riesgo15}</strong><span>En riesgo</span></div>
                <div><strong>{retention.inactivos30}</strong><span>Inactivos +30 días</span></div>
                <div><strong>{retention.nunca}</strong><span>Sin actividad</span></div>
              </div>
            </article>
            <article className="analytics-card">
              <h2>Estado del inventario</h2>
              <div className="analytics-retention">
                <div><strong>{inventory.total}</strong><span>Productos</span></div>
                <div><strong>{inventory.sinStock}</strong><span>Sin stock</span></div>
                <div><strong>{inventory.bajoStock}</strong><span>Stock bajo</span></div>
                <div><strong>{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(inventory.valor)}</strong><span>Valor estimado</span></div>
              </div>
            </article>
            <article className="analytics-card">
              <h2>Dispositivos de acceso</h2>
              <div className="analytics-device-split">
                {["escritorio", "movil"].map((device) => {
                  const value = eventosFiltrados.filter((event) => event.tipo === "vista_pagina" && event.dispositivo === device).length;
                  return <div key={device}><strong>{value}</strong><span>{device === "movil" ? "Móvil" : "Escritorio"}</span></div>;
                })}
              </div>
            </article>
          </div>

          {selectedBusiness && (
            <div className="analytics-card analytics-business-detail">
              <div><span>Detalle del negocio</span><h2>{selectedBusiness.nombre}</h2><small>{selectedBusiness.id}</small></div>
              <div><span>Última actividad</span><strong>{selectedBusiness.ultimaActividad ? formatDate(selectedBusiness.ultimaActividad) : "Nunca"}</strong></div>
              <div><span>Tiempo de uso</span><strong>{formatDuration(selectedBusiness.tiempoMs)}</strong></div>
              <div><span>Operación</span><strong>{selectedBusiness.ventas} ventas · {selectedBusiness.productos} productos</strong></div>
              <div><span>Base</span><strong>{selectedBusiness.clientes} clientes · {selectedBusiness.servicios} servicios</strong></div>
              <div><span>Actividad general</span><strong>{selectedBusiness.trabajadoresActivos} de {selectedBusiness.usuarios} activos</strong><small>{selectedBusiness.ultimaAccion}</small></div>
            </div>
          )}

          <div className="analytics-grid">
            <article className="analytics-card">
              <h2>Embudo de adopción</h2>
              <div className="analytics-funnel">
                {funnel.map((step) => (
                  <div key={step.label}>
                    <span style={{ width: `${Math.max(step.percent, 8)}%` }}><b>{step.label}</b><strong>{step.value} · {step.percent}%</strong></span>
                  </div>
                ))}
              </div>
            </article>
            <article className="analytics-card">
              <h2>Adopción por módulo</h2>
              <div className="analytics-bars">
                {moduleRows.map((module) => (
                  <div key={module.label}><span>{module.label}</span><i><b style={{ width: `${module.percent}%` }} /></i><strong>{module.value}</strong></div>
                ))}
              </div>
            </article>
          </div>

          <div className="analytics-card analytics-wide">
            <h2>Actividad por negocio</h2>
            <div className="analytics-table-wrap">
              <table>
                <thead><tr><th>Negocio</th><th>Trabajadores activos</th><th>Sesiones</th><th>Vistas</th><th>Tiempo</th><th>Última acción</th><th>Última actividad</th></tr></thead>
                <tbody>
                  {businessRows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.nombre}</strong><small>{row.id}</small></td>
                      <td>{row.trabajadoresActivos} de {row.usuarios}</td><td>{row.ingresos}</td><td>{row.vistas}</td>
                      <td>{formatDuration(row.tiempoMs)}</td><td>{row.ultimaAccion}</td>
                      <td>{row.ultimaActividad ? formatDate(row.ultimaActividad) : "Sin actividad"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="analytics-grid">
            <article className="analytics-card">
              <h2>Páginas con más tiempo</h2>
              <div className="analytics-ranking">
                {routeRows.map((row) => <div key={row.ruta}><span><strong>{row.ruta}</strong><small>{row.vistas} vistas</small></span><b>{formatDuration(row.tiempoMs)}</b></div>)}
                {!routeRows.length && <p>La actividad comenzará a aparecer con el uso del sistema.</p>}
              </div>
            </article>
            <article className="analytics-card">
              <h2>Clics más frecuentes</h2>
              <div className="analytics-ranking">
                {clickRows.map((row) => <div key={`${row.ruta}-${row.elemento}`}><span><strong>{row.elemento}</strong><small>{row.ruta}</small></span><b>{row.total}</b></div>)}
                {!clickRows.length && <p>Todavía no hay clics registrados.</p>}
              </div>
            </article>
          </div>

          <div className="analytics-grid">
            <article className="analytics-card">
              <h2>Errores agrupados por impacto</h2>
              <div className="analytics-ranking">
                {groupedErrors.map((error) => (
                  <div key={error.mensaje}>
                    <span><strong>{error.mensaje}</strong><small>{error.negociosTotal} negocios · {error.rutasTexto}</small></span>
                    <b>{error.total}</b>
                  </div>
                ))}
                {!groupedErrors.length && <p>No hay errores agrupados en el periodo.</p>}
              </div>
            </article>
            <article className="analytics-card">
              <h2>Rendimiento por página</h2>
              <div className="analytics-ranking">
                {performanceRows.map((row) => (
                  <div key={row.ruta}>
                    <span><strong>{row.ruta}</strong><small>{row.count} mediciones · máximo {(row.max / 1000).toFixed(1)} s</small></span>
                    <b className={row.average > 3000 ? "metric-danger" : ""}>{(row.average / 1000).toFixed(1)} s</b>
                  </div>
                ))}
                {!performanceRows.length && <p>Las mediciones aparecerán en los próximos accesos.</p>}
              </div>
            </article>
          </div>

          <div className="analytics-card analytics-wide">
            <h2>Errores recientes</h2>
            <div className="analytics-table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Negocio</th><th>Ruta</th><th>Mensaje</th></tr></thead>
                <tbody>
                  {errors.map((error) => <tr key={error.id}><td>{formatDate(error.createdAt || error.clientAt)}</td><td>{nameByBusiness[businessId(error)] || businessId(error)}</td><td>{error.ruta}</td><td>{error.mensaje}</td></tr>)}
                  {!errors.length && <tr><td colSpan="4">No hay errores registrados en este periodo.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
