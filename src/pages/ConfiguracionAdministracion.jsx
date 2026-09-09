import { useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { auth } from "../initializer/firebase";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import { hasAnalyticsAccess } from "../js/services/analytics_access";
import ConfiguracionSuscripciones from "./ConfiguracionSuscripciones";
import ConfiguracionAnalitica from "./ConfiguracionAnalitica";
import ConfiguracionVideosSoporte from "./ConfiguracionVideosSoporte";
import { FiActivity, FiBarChart2, FiBriefcase, FiVideo } from "react-icons/fi";
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
  const requestedVideos = requestedTab === "videos";
  const initialTab = superAdmin
    ? requestedAnalytics ? "analitica" : requestedVideos ? "videos" : "negocios"
    : "analitica";
  const [activeTab, setActiveTab] = useState(initialTab);
  const visibleTab = superAdmin ? activeTab : "analitica";

  const changeTab = (tab) => {
    setActiveTab(tab);
    setSearchParams(tab === "negocios" ? {} : { vista: tab });
  };

  return (
    <section className="cfg-admin-hub">
      <header className="cfg-admin-hub-head">
        <div>
          <span><FiActivity /> Administración central</span>
          <h1>Superadmin y Analítica</h1>
          <p>Gestión central de negocios, cuentas, actividad y salud de CajaLibre.</p>
        </div>
        <nav aria-label="Secciones administrativas">
          {superAdmin && (
            <button
              type="button"
              className={visibleTab === "negocios" ? "active" : ""}
              onClick={() => changeTab("negocios")}
            >
              <FiBriefcase /> <span>Negocios</span>
            </button>
          )}
          {analyticsAccess && (
            <button
              type="button"
              className={visibleTab === "analitica" ? "active" : ""}
              onClick={() => changeTab("analitica")}
            >
              <FiBarChart2 /> <span>Analítica</span>
            </button>
          )}
          {superAdmin && (
            <button
              type="button"
              className={visibleTab === "videos" ? "active" : ""}
              onClick={() => changeTab("videos")}
            >
              <FiVideo /> <span>Videos de soporte</span>
            </button>
          )}
        </nav>
      </header>

      <div className="cfg-admin-hub-content">
        {visibleTab === "negocios" && superAdmin && <ConfiguracionSuscripciones />}
        {visibleTab === "analitica" && <ConfiguracionAnalitica />}
        {visibleTab === "videos" && superAdmin && <ConfiguracionVideosSoporte />}
      </div>
    </section>
  );
}
