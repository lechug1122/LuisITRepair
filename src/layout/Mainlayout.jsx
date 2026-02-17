import Navbar from "../components/Navbar";
import { Outlet } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { suscribirNotificacionesGlobales } from "../js/services/realtime_notifications";
import { autoCerrarCortesPendientes } from "../js/services/corte_caja_firestore";
import "../css/notificaciones_globales.css";

export default function MainLayout() {
  const [notificaciones, setNotificaciones] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const audioCtxRef = useRef(null);

  const reproducirSonido = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        audioCtxRef.current = new AudioCtx();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // noop
    }
  };

  useEffect(() => {
    autoCerrarCortesPendientes().catch((e) =>
      console.error("autoCerrarCortesPendientes error:", e)
    );

    const t = setInterval(() => {
      autoCerrarCortesPendientes().catch((e) =>
        console.error("autoCerrarCortesPendientes interval error:", e)
      );
    }, 60 * 60 * 1000);

    const unsubscribe = suscribirNotificacionesGlobales((nueva) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const noti = { ...nueva, id, leida: false };

      setNotificaciones((prev) => [noti, ...prev].slice(0, 50));
      setToasts((prev) => [noti, ...prev].slice(0, 4));
      reproducirSonido();

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((n) => n.id !== id));
      }, 9000);
    });

    return () => {
      clearInterval(t);
      unsubscribe();
    };
  }, []);

  function togglePanelNotificaciones() {
    setPanelAbierto((prev) => {
      const nuevo = !prev;
      if (!prev) {
        setNotificaciones((list) => list.map((n) => ({ ...n, leida: true })));
      }
      return nuevo;
    });
  }

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return (
    <>
      <Navbar
        panelAbierto={panelAbierto}
        togglePanelNotificaciones={togglePanelNotificaciones}
        notificaciones={notificaciones}
        noLeidas={noLeidas}
      />
      <main className="container-fluid px-0" style={{ marginTop: "64px" }}>
        <Outlet />
      </main>

      <div className="global-toast-stack no-print">
        {toasts.map((n) => (
          <div key={n.id} className={`global-toast ${n.nivel || "baja"}`}>
            <div className="global-toast-icon">{"\u{1F514}"}</div>
            <div className="global-toast-content">
              <p className="global-toast-title">{n.titulo}</p>
              <p className="global-toast-detail">{n.detalle}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
