import { useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { auth } from "../initializer/firebase";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { hasAnalyticsAccess } from "../js/services/analytics_access";
import ConfiguracionSuscripciones from "./ConfiguracionSuscripciones";
import ConfiguracionAnalitica from "./ConfiguracionAnalitica";
import "../css/configuracion_administracion.css";

export default function ConfiguracionAdministracion() {
  const { superAdmin, accesoAnalitica } = useAutorizacionActual();
  const analyticsAccess = hasAnalyticsAccess({
    superAdmin,
    accesoAnalitica,
    email: auth.currentUser?.email,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const requestedTab = searchParams.get("vista");
  const requestedAnalytics =
    requestedTab === "analitica" || location.pathname === "/configuracion/analitica";
  const initialTab = superAdmin && !requestedAnalytics ? "negocios" : "analitica";
  const [activeTab, setActiveTab] = useState(initialTab);
  const visibleTab = superAdmin ? activeTab : "analitica";

  const changeTab = (tab) => {
    setActiveTab(tab);
    setSearchParams(tab === "analitica" ? { vista: "analitica" } : {});
  };

  return (
    <section className="cfg-admin-hub">
      <header className="cfg-admin-hub-head">
        <div>
          <span>Administración central</span>
          <h1>Superadmin y Analítica</h1>
          <p>Gestión de negocios, actividad, rendimiento y salud del sistema.</p>
        </div>
        <nav aria-label="Secciones administrativas">
          {superAdmin && (
            <button
              type="button"
              className={visibleTab === "negocios" ? "active" : ""}
              onClick={() => changeTab("negocios")}
            >
              Negocios
            </button>
          )}
          {analyticsAccess && (
            <button
              type="button"
              className={visibleTab === "analitica" ? "active" : ""}
              onClick={() => changeTab("analitica")}
            >
              Analítica
            </button>
          )}
        </nav>
      </header>

      <div className="cfg-admin-hub-content">
        {visibleTab === "negocios" && superAdmin ? (
          <ConfiguracionSuscripciones />
        ) : (
          <ConfiguracionAnalitica />
        )}
      </div>
    </section>
  );
}
