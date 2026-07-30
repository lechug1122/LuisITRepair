import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight, FiX } from "react-icons/fi";
import restaurantePromo from "../assets/modal_restaurante.png";
import "../css/restaurante-promo.css";

const STORAGE_KEY = "cajalibre_restaurante_promo_v1";

function getWeekKey(date = new Date()) {
  const monday = new Date(date);
  const day = (monday.getDay() + 6) % 7;
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

function readSchedule() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSchedule(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // El modal funciona durante la sesión aunque el almacenamiento esté bloqueado.
  }
}

export default function RestaurantePromoModal({ enabled = true }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const demoMode = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("demoRestaurante") === "1";

  useEffect(() => {
    if (demoMode) {
      setVisible(true);
      return undefined;
    }
    if (!enabled) return undefined;
    const now = new Date();
    const weekKey = getWeekKey(now);
    const stored = readSchedule();
    if (stored?.weekKey === weekKey && stored?.shown === true) return undefined;

    let scheduledAt = stored?.weekKey === weekKey ? Number(stored.scheduledAt) : 0;
    if (!scheduledAt) {
      const endOfWeek = new Date(now);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - ((endOfWeek.getDay() + 6) % 7)));
      endOfWeek.setHours(0, 0, 0, 0);
      const remaining = Math.max(60000, endOfWeek.getTime() - now.getTime());
      scheduledAt = now.getTime() + Math.floor(Math.random() * remaining);
      saveSchedule({ weekKey, scheduledAt, shown: false });
    }

    const show = () => {
      setVisible(true);
      saveSchedule({ weekKey, scheduledAt, shown: true });
    };
    if (scheduledAt <= Date.now()) {
      show();
      return undefined;
    }
    const timer = window.setTimeout(show, Math.min(scheduledAt - Date.now(), 2147483647));
    return () => window.clearTimeout(timer);
  }, [demoMode, enabled]);

  if (!visible) return null;
  return (
    <div className="restaurant-promo-backdrop" role="presentation" onClick={() => setVisible(false)}>
      <section className="restaurant-promo-modal" role="dialog" aria-modal="true" aria-label="Prueba el modo Restaurante" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="restaurant-promo-close" aria-label="Cerrar promoción" onClick={() => setVisible(false)}><FiX /></button>
        <img src={restaurantePromo} alt="Haz que tu restaurante sea más sencillo de controlar" />
        <footer>
          <div><strong>¿Tienes un restaurante?</strong><span>Activa mesas, comandas, cocina y caja desde la configuración de tu empresa.</span></div>
          <button type="button" onClick={() => { setVisible(false); navigate("/configuracion/empresa"); }}>Probar Restaurante <FiArrowRight /></button>
        </footer>
      </section>
    </div>
  );
}
