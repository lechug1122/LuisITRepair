import { useEffect, useMemo, useState } from "react";
import { collection, getCountFromServer, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../initializer/firebase";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { decorarNegocio } from "../js/services/superadmin_negocios";
import { ACTIVIDAD_NIVELES } from "../js/services/actividad_negocio";
import { TIPOS_NEGOCIO_PRESET } from "../js/services/tipos_negocio";
import "../css/configuracion_analitica.css";
import "../css/superadmin.css";

/**
 * Analítica de CajaLibre como plataforma.
 *
 * PRIVACIDAD: esta pantalla no lee ni una sola colección operativa. Antes
 * suscribía collectionGroup de `ventas`, `clientes`, `productos` y `servicios`,
 * lo que descargaba al navegador la operación comercial completa de todos los
 * negocios. Ahora solo lee `negocios` (una página acotada) y agregaciones de
 * conteo: adopción, planes, actividad y configuración. Nunca dinero.
 */

// Tope de negocios que se traen para las gráficas. Las cifras globales salen
// de agregaciones; esta muestra solo alimenta las distribuciones.
const MUESTRA_MAX = 500;

const ETIQUETAS_TIPO = Object.fromEntries(
  (TIPOS_NEGOCIO_PRESET || []).map((tipo) => [tipo.id, tipo.nombre || tipo.id]),
);

function Barras({ datos, vacio }) {
  const total = datos.reduce((suma, item) => suma + item.valor, 0);
  if (!total) return <div className="analytics-empty">{vacio}</div>;

  return (
    <div className="analytics-bars">
      {datos.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <i><b style={{ width: `${Math.round((item.valor / total) * 100)}%` }} /></i>
          <span className="sa-num">{item.valor}</span>
        </div>
      ))}
    </div>
  );
}

export default function ConfiguracionAnalitica() {
  const { superAdmin } = useAutorizacionActual();
  const [negocios, setNegocios] = useState([]);
  const [usuariosTotal, setUsuariosTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!superAdmin) return undefined;
    let cancelado = false;

    Promise.all([
      getDocs(query(collection(db, "negocios"), orderBy("createdAt", "desc"), limit(MUESTRA_MAX))),
      getCountFromServer(collection(db, "autorizados")),
    ])
      .then(([snapNegocios, snapUsuarios]) => {
        if (cancelado) return;
        const ahora = Date.now();
        setNegocios(snapNegocios.docs.map((item) => decorarNegocio(item.data(), item.id, ahora)));
        setUsuariosTotal(snapUsuarios.data().count || 0);
        setError("");
      })
      .catch(() => {
        if (cancelado) return;
        setNegocios([]);
        setError("No se pudo cargar la analítica de la plataforma.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => { cancelado = true; };
  }, [superAdmin]);

  const metricas = useMemo(() => {
    const premium = negocios.filter((item) => item.plan.esPremium).length;
    const bloqueados = negocios.filter((item) => item.estado === "bloqueado"
      || item.estado === "suspendido").length;
    const incompletos = negocios.filter((item) => !item.setupCompleto).length;
    const activos = negocios.filter((item) => ["frecuente", "activo"].includes(item.actividad.id)).length;

    // Altas por mes (últimos 6 meses con datos).
    const porMes = new Map();
    negocios.forEach((item) => {
      const fecha = item.createdAt?.toDate?.() || (item.createdAt ? new Date(item.createdAt) : null);
      if (!fecha || Number.isNaN(fecha.getTime())) return;
      const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
      porMes.set(clave, (porMes.get(clave) || 0) + 1);
    });

    const porActividad = ACTIVIDAD_NIVELES
      .filter((nivel) => nivel.id !== "desconocido")
      .map((nivel) => ({
        label: nivel.label,
        valor: negocios.filter((item) => item.actividad.id === nivel.id).length,
      }));

    const porTipo = new Map();
    negocios.forEach((item) => {
      const clave = item.tipoNegocioId || "sin_definir";
      porTipo.set(clave, (porTipo.get(clave) || 0) + 1);
    });

    return {
      total: negocios.length,
      premium,
      free: negocios.length - premium,
      bloqueados,
      incompletos,
      activos,
      inactivos: negocios.length - activos,
      terminosPendientes: negocios.filter((item) => !item.terminosAceptados).length,
      altasPorMes: [...porMes.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([clave, valor]) => ({ label: clave, valor })),
      porActividad,
      porTipo: [...porTipo.entries()]
        .map(([clave, valor]) => ({
          label: ETIQUETAS_TIPO[clave] || (clave === "sin_definir" ? "Sin definir" : clave),
          valor,
        }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 8),
    };
  }, [negocios]);

  if (!superAdmin) {
    return (
      <div className="admin-analytics">
        <div className="sa-error">
          Solo el superadministrador de CajaLibre puede consultar la analítica global.
        </div>
      </div>
    );
  }

  const kpis = [
    { label: "Negocios registrados", valor: metricas.total },
    { label: "Free", valor: metricas.free },
    { label: "Premium", valor: metricas.premium },
    { label: "Usuarios registrados", valor: usuariosTotal },
    { label: "Negocios activos", valor: metricas.activos },
    { label: "Negocios inactivos", valor: metricas.inactivos },
  ];

  const retencion = metricas.total
    ? Math.round((metricas.activos / metricas.total) * 100)
    : 0;

  return (
    <div className="admin-analytics">
      <header className="analytics-header">
        <div>
          <span className="analytics-eyebrow">Plataforma</span>
          <h1>Analítica de CajaLibre</h1>
          <p>
            Adopción, planes y salud de las cuentas. No incluye información
            comercial de los negocios: ni ventas, ni ingresos, ni clientes.
          </p>
        </div>
      </header>

      {error ? <div className="sa-error">{error}</div> : null}

      <div className="sa-stats">
        {kpis.map((kpi) => (
          <article
            key={kpi.label}
            className={`sa-stat ${cargando ? "sa-stat-skeleton" : ""}`.trim()}
          >
            <span>{kpi.label}</span>
            <strong>{cargando ? "" : kpi.valor.toLocaleString("es-MX")}</strong>
          </article>
        ))}
      </div>

      <div className="analytics-grid">
        <section className="analytics-card">
          <h2>Negocios nuevos por mes</h2>
          <Barras datos={metricas.altasPorMes} vacio="Todavía no hay altas registradas." />
        </section>

        <section className="analytics-card">
          <h2>Free vs Premium</h2>
          <Barras
            datos={[
              { label: "Free", valor: metricas.free },
              { label: "Premium", valor: metricas.premium },
            ]}
            vacio="Sin negocios registrados."
          />
        </section>

        <section className="analytics-card">
          <h2>Nivel de actividad</h2>
          <Barras datos={metricas.porActividad} vacio="Sin datos de actividad." />
        </section>

        <section className="analytics-card">
          <h2>Tipos de negocio</h2>
          <Barras datos={metricas.porTipo} vacio="Sin tipos de negocio configurados." />
        </section>

        <section className="analytics-card">
          <h2>Salud de las cuentas</h2>
          <div className="analytics-retention">
            <div>
              <strong>{retencion}%</strong>
              <span>Negocios con uso reciente</span>
            </div>
            <div>
              <strong>{metricas.incompletos}</strong>
              <span>Configuración incompleta</span>
            </div>
            <div>
              <strong>{metricas.terminosPendientes}</strong>
              <span>Términos pendientes</span>
            </div>
            <div>
              <strong>{metricas.bloqueados}</strong>
              <span>Negocios bloqueados</span>
            </div>
          </div>
        </section>

        <section className="analytics-card">
          <h2>Alcance de la muestra</h2>
          <p className="sa-note">
            Las gráficas se calculan sobre los {MUESTRA_MAX} negocios más recientes
            para no descargar la colección completa. Los totales de usuarios
            provienen de una agregación en el servidor, no de leer documentos.
          </p>
        </section>
      </div>
    </div>
  );
}
