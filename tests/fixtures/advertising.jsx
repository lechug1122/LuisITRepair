import React from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { createRoot } from "react-dom/client";
import useAutorizacionActual, { AutorizacionProvider } from "../../src/hooks/useAutorizacionActual";
import Advertising from "../../src/components/Advertising";
import PremiumBadge from "../../src/components/PremiumBadge";
import "../../src/css/home.css";
function Consumer() { const { isPremium } = useAutorizacionActual(); return <span data-plan>{isPremium ? "premium" : "free"}</span>; }
function Dashboard() {
  const { isPremium } = useAutorizacionActual();
  return <div className={`home-page ${isPremium ? "premium-layout" : "free-layout"}`}>
    <div className="home-header"><div className="home-hero-panel"><h2>Bienvenido, IVAN</h2>{isPremium && <PremiumBadge size="sm" />}</div></div>
    <div className="kpi-grid">{["Ingresos del mes", "Tickets hoy", "Cobrado hoy", "Clientes"].map(label => <div className="kpi-card" key={label}>{label}</div>)}</div>
    <Consumer /><Advertising placement="dashboard" />
  </div>;
}
createRoot(document.getElementById("root")).render(<AutorizacionProvider><Dashboard /><Consumer /></AutorizacionProvider>);
