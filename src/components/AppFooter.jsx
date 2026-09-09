import { Link } from "react-router-dom";
import { FaFacebookF, FaWhatsapp } from "react-icons/fa";
import { FiInstagram, FiYoutube } from "react-icons/fi";
import logo from "../assets/logo.png";
import termsPdf from "../assets/Terminos_y_Condiciones_Caja_Libre.pdf";

const WHATSAPP_URL =
  "https://wa.me/522731430147?text=Hola%2C%20necesito%20ayuda%20con%20CajaLibre.";
const WHATSAPP_NUMBER = "522731430147";

const whatsappUrl = (message) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

const FOOTER_COLUMNS = [
  {
    title: "Sistema",
    links: [
      { label: "Punto de venta", to: "/POS" },
      { label: "Inventario", to: "/configuracion/inventario" },
      { label: "Clientes", to: "/clientes" },
      { label: "Reportes", to: "/reportes" },
    ],
  },
  {
    title: "Operación",
    links: [
      { label: "Servicios", to: "/servicios" },
      { label: "Corte de caja", to: "/home" },
      { label: "Proveedores", to: "/configuracion/proveedores" },
      { label: "Configuración", to: "/configuracion" },
    ],
  },
  {
    title: "Soporte",
    links: [
      { label: "Centro de ayuda", to: "/ayuda" },
      { label: "Privacidad", to: "/privacidad" },
      { label: "Cookies", to: "/cookies" },
      { label: "Actualizaciones", to: "/ayuda?articulo=novedades-cajalibre" },
      { label: "Contacto", href: "mailto:cajalibre.puntodeventa@gmail.com", sameTab: true },
    ],
  },
  {
    title: "Proyecto",
    links: [
      { label: "Términos y condiciones", href: termsPdf },
      { label: "Estado del servicio", to: "/status" },
    ],
  },
];

function LandingBrand() {
  return (
    <span className="landing-brand footer-brand">
      <span className="brand-mark"><img src={logo} alt="" /></span>
      <span>Caja<span>Libre</span></span>
    </span>
  );
}

function LandingFooter({ onNavigateSection }) {
  const year = new Date().getFullYear();
  const navigateSection = (sectionId) => {
    if (typeof onNavigateSection === "function") {
      onNavigateSection(sectionId);
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="landing-footer">
      <div className="landing-container footer-grid">
        <div className="footer-about">
          <LandingBrand />
          <p>Sistema web gratuito de punto de venta y administración para pequeños negocios.</p>
          <div className="socials">
            <a href="https://www.facebook.com/profile.php?id=61592592921476" target="_blank" rel="noreferrer" aria-label="Facebook"><FaFacebookF /></a>
            <a href="https://www.instagram.com/cajalibre.puntodeventa?utm_source=qr&igsh=MTY5aXh2MXEyZHl3Zg==" target="_blank" rel="noreferrer" aria-label="Instagram"><FiInstagram /></a>
            <a href="https://youtube.com/@cajalibrepuntodeventapaginaweb?si=8sDG4_wvGgAgDkc-" target="_blank" rel="noreferrer" aria-label="YouTube"><FiYoutube /></a>
            <a href={whatsappUrl("Hola, me gustaría recibir información sobre CajaLibre.")} target="_blank" rel="noreferrer" aria-label="WhatsApp"><FaWhatsapp /></a>
          </div>
        </div>
        <div>
          <h3>Proyecto</h3>
          <button type="button" onClick={() => navigateSection("inicio")}>Inicio</button>
          <button type="button" onClick={() => navigateSection("funciones")}>Funciones</button>
          <button type="button" onClick={() => navigateSection("negocios")}>Negocios</button>
          <button type="button" onClick={() => navigateSection("preguntas")}>Preguntas frecuentes</button>
        </div>
        <div>
          <h3>Contacto</h3>
          <a href="mailto:cajalibre.puntodeventa@gmail.com">cajalibre.puntodeventa@gmail.com</a>
          <a href={whatsappUrl("Hola, me gustaría recibir información sobre CajaLibre.")} target="_blank" rel="noreferrer">WhatsApp</a>
          <a href={whatsappUrl("Hola, necesito soporte o asesoría personalizada para CajaLibre.")} target="_blank" rel="noreferrer">Soporte y asesoría</a>
          <a href={whatsappUrl("Hola, quiero información sobre capacitación para usar CajaLibre.")} target="_blank" rel="noreferrer">Capacitación</a>
        </div>
        <div>
          <h3>Legal</h3>
          <Link to="/privacidad">Política de privacidad</Link>
          <Link to="/cookies">Política de cookies</Link>
          <a href={termsPdf} target="_blank" rel="noreferrer">Términos y condiciones</a>
        </div>
      </div>
      <div className="landing-container footer-bottom">
        <span>© {year} CajaLibre. Todos los derechos reservados.</span>
        <span>Hecho en México para pequeños negocios.</span>
      </div>
    </footer>
  );
}

export default function AppFooter({ compact = false, variant = "app", onNavigateSection }) {
  if (variant === "landing") {
    return <LandingFooter onNavigateSection={onNavigateSection} />;
  }

  const year = new Date().getFullYear();
  const openUpdates = () => window.dispatchEvent(new CustomEvent("cajalibre:open-updates"));

  return (
    <footer className={`app-footer app-footer-dark${compact ? " app-footer-compact" : ""}`}>
      <div className="app-footer-container">
        <div className="app-footer-main">
          <div className="app-footer-about">
            <div className="app-footer-brand">
              <span className="app-footer-logo"><img src={logo} alt="" /></span>
              <strong>Caja<span>Libre</span></strong>
            </div>
            <p>
              Sistema web gratuito de punto de venta y administración para pequeños
              negocios.
            </p>
            <div className="app-footer-social" aria-label="Redes sociales">
              <a href="https://www.facebook.com/profile.php?id=61592592921476" aria-label="Facebook"><FaFacebookF /></a>
              <a href="https://www.instagram.com/cajalibre.puntodeventa?utm_source=qr&igsh=MTY5aXh2MXEyZHl3Zg==" aria-label="Instagram"><FiInstagram /></a>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="WhatsApp"><FaWhatsapp /></a>
              <a href="https://youtube.com/@cajalibrepuntodeventapaginaweb?si=8sDG4_wvGgAgDkc-" aria-label="YouTube"><FiYoutube /></a>
            </div>
          </div>

          <div className="app-footer-columns">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title} className="app-footer-column">
                <strong>{column.title}</strong>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.action === "updates" ? (
                        <button type="button" className="app-footer-link-button" onClick={openUpdates}>
                          {link.label}
                        </button>
                      ) : link.href ? (
                        <a
                          href={link.href}
                          target={link.sameTab ? undefined : "_blank"}
                          rel={link.sameTab ? undefined : "noreferrer"}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link to={link.to}>{link.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="app-footer-bottom">
          <span>© {year} CajaLibre. Todos los derechos reservados.</span>
          <span>Hecho en México para pequeños negocios.</span>
        </div>
      </div>
    </footer>
  );
}
