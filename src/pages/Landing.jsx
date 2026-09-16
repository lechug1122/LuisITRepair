import { createElement, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import {
  FiArrowRight, FiBarChart2, FiBox, FiBriefcase, FiCheck, FiChevronDown,
  FiClipboard, FiCoffee, FiCreditCard, FiDollarSign, FiEye, FiEyeOff, FiFileText,
  FiHeart, FiLock, FiMail, FiMenu, FiMonitor,
  FiPackage, FiPrinter, FiScissors, FiShoppingBag, FiShoppingCart, FiSmartphone,
  FiStar, FiTool, FiTrendingUp, FiUser, FiUsers, FiX, FiZap
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import { auth } from "../initializer/firebase";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import {
  LIMITE_USUARIOS_GRATUITO,
  PLAN_FREE_RESUMEN,
  PLAN_PREMIUM_RESUMEN,
} from "../js/services/plan_features";
import {
  RUTA_LOGIN,
  registrarRedireccion,
  resolverRutaSesion,
} from "../js/services/ruta_sesion";
import AppFooter from "../components/AppFooter";
import logo from "../assets/logo.png";
import "../css/landing.css";

const WHATSAPP_NUMBER = "522731159520";
const whatsappUrl = (message) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

const features = [
  [FiShoppingCart, "Punto de venta", "Registra ventas con rapidez y genera tickets."],
  [FiBox, "Inventario", "Controla existencias, entradas y productos bajos."],
  [FiPackage, "Productos precargados", "Más de 6,000 productos mexicanos listos para usar."],
  [FiUsers, "Clientes", "Conserva datos, historial de compras y adeudos."],
  [FiTool, "Servicios técnicos", "Gestiona equipos, diagnósticos, reparaciones y entregas."],
  [FiClipboard, "Cortes de caja", "Controla entradas, salidas, retiros y diferencias."],
  [FiBarChart2, "Reportes", "Consulta ventas, ganancias y productos más vendidos."],
  [FiUser, "Empleados", "Crea usuarios y asigna permisos por función."],
  [FiZap, "Código de barras", "Escanea productos y agiliza cada cobro."],
  [FiPrinter, "Tickets", "Personaliza e imprime comprobantes de venta."],
  [FiDollarSign, "Control de egresos", "Registra gastos y conoce el flujo real de tu caja."],
  [FiMonitor, "Todos tus dispositivos", "Trabaja desde computadora, tablet o celular."]
];

const businesses = [
  [FiCoffee, "Restaurantes", "Administra mesas, comandas, cocina, cuentas abiertas, cobros y reportes desde una sola plataforma."],
  [FiShoppingCart, "Tiendas de abarrotes", "Comienza con más de 6,000 productos mexicanos precargados y vende en segundos."],
  [FiFileText, "Papelerías", "Registra fácilmente artículos sin código de barras y encuentra cada producto rápidamente."],
  [FiHeart, "Farmacias", "Controla existencias, precios y productos con inventario bajo desde un solo lugar."],
  [FiTool, "Ferreterías", "Organiza miles de piezas, medidas y precios sin perder el control de tu inventario."],
  [FiTool, "Talleres automotrices", "Administra clientes, vehículos, diagnósticos, reparaciones y entregas pendientes."],
  [FiMonitor, "Talleres informáticos", "Da seguimiento a equipos, fallas, anticipos, reparaciones y estatus de servicio."],
  [FiShoppingBag, "Boutiques", "Controla prendas por modelo, talla y color mientras agilizas cada venta."],
  [FiPackage, "Refaccionarias", "Localiza piezas rápidamente y mantén actualizado el inventario de tu mostrador."],
  [FiBriefcase, "Negocios de servicios", "Cotiza, cobra y conserva el historial de cada cliente y servicio realizado."]
];

// El detalle fino de cada plan vive en plan_features.js; aqui solo va el
// resumen comercial, con el precio tomado de ese mismo modulo para que la
// portada nunca anuncie una cantidad distinta a la de la pantalla de pago.
const planes = [
  {
    nombre: "Free",
    precio: PLAN_FREE_RESUMEN.precio,
    periodo: "MXN · para siempre",
    resumen: "Para comenzar y administrar las operaciones esenciales de tu negocio.",
    incluye: [
      "Punto de venta, cobros e impresión de tickets",
      "Inventario, productos y catálogo precargado",
      "Clientes, fiados y servicios",
      "Reportes y cierre de caja",
      `Hasta ${LIMITE_USUARIOS_GRATUITO} usuarios`,
      "Centro de ayuda y soporte por ticket"
    ],
    cta: "Comenzar gratis"
  },
  {
    nombre: "Premium",
    destacado: true,
    precio: PLAN_PREMIUM_RESUMEN.precio,
    periodo: "MXN / mes por negocio",
    resumen: "Para negocios que necesitan más usuarios, personalización y control.",
    incluye: [
      "Todo lo del plan gratuito",
      "Usuarios ilimitados y logo de tu negocio",
      "Tickets personalizables y sin publicidad",
      "Arqueo de caja e historial completo de cortes",
      "Restaurante sin límites de pisos y mesas, con reservaciones",
      "Rastreo de servicios por código QR y soporte preferente"
    ],
    cta: "Conocer Premium"
  }
];

const faqs = [
  ["¿Puedo usar CajaLibre gratis?", `Sí. El plan Free no tiene mensualidad ni límite de tiempo e incluye punto de venta, inventario, clientes, servicios, reportes y cierre de caja para hasta ${LIMITE_USUARIOS_GRATUITO} usuarios. Premium cuesta ${PLAN_PREMIUM_RESUMEN.precio} MXN al mes por negocio y agrega usuarios ilimitados, personalización y herramientas avanzadas.`],
  ["¿Qué pasa si no pago Premium?", "Nada se detiene. Tu negocio sigue operando con el plan gratuito y conservas tu información; solo quedan fuera las funciones exclusivas de Premium hasta que decidas activarlo."],
  ["¿CajaLibre funciona para restaurantes?", "Sí. Incluye operación por mesas, comandas para cocina, cuentas abiertas, cobros, historial, cortes de caja y reportes. También puedes asignar accesos para meseros, cocina y caja."],
  ["¿Necesito instalar un programa?", "No. CajaLibre funciona desde el navegador en computadora, tablet y celular. Solo necesitas una conexión a internet."],
  ["¿Mis datos están seguros?", "Aplicamos controles de acceso y cada negocio administra sus propios usuarios. También recomendamos contraseñas únicas y mantener tus dispositivos protegidos."],
  ["¿Puedo usar lectores de código de barras?", "Sí. CajaLibre está preparado para agilizar ventas usando códigos de barras y lectores compatibles con tu dispositivo."],
  ["¿Ofrecen soporte o capacitación?", "Sí. La instalación, configuración, capacitación y asesoría personalizada son servicios opcionales que pueden tener un costo."],
];

function Brand({ footer = false }) {
  return <span className={`landing-brand ${footer ? "footer-brand" : ""}`}>
    <span className="brand-mark"><img src={logo} alt="" /></span>
    <span>Caja<span>Libre</span></span>
  </span>;
}

function LoginModal({ onClose }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const close = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    document.body.classList.add("landing-modal-open");
    return () => {
      document.removeEventListener("keydown", close);
      document.body.classList.remove("landing-modal-open");
    };
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMessage("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate("/home");
    } catch {
      setMessage("No pudimos iniciar sesión. Verifica tu correo y contraseña.");
    } finally { setBusy(false); }
  };

  const recover = async () => {
    if (!email.trim()) return setMessage("Escribe tu correo para enviarte el enlace.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Te enviamos un enlace para restablecer tu contraseña.");
    } catch { setMessage("No fue posible enviar el enlace. Verifica el correo."); }
  };

  return <div className="login-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <button className="modal-close" onClick={onClose} aria-label="Cerrar"><FiX /></button>
      <div className="modal-icon"><FiLock /></div>
      <h2 id="login-title">Bienvenido de nuevo</h2>
      <p>Ingresa a tu espacio de trabajo en CajaLibre.</p>
      <form onSubmit={submit}>
        <label>Correo electrónico</label>
        <div className="input-wrap"><FiMail /><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@negocio.com" autoFocus /></div>
        <label>Contraseña</label>
        <div className="input-wrap"><FiLock /><input type={show ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Tu contraseña" />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>{show ? <FiEyeOff /> : <FiEye />}</button>
        </div>
        <button className="recover" type="button" onClick={recover}>¿Olvidaste tu contraseña?</button>
        {message && <div className="login-message" role="status">{message}</div>}
        <button className="primary-btn modal-submit" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"} <FiArrowRight /></button>
      </form>
      <div className="modal-register">¿Todavía no tienes cuenta? <Link to="/login" state={{ register: true }}>Crear cuenta gratis</Link></div>
    </div>
  </div>;
}

function DashboardMockup() {
  return <div className="device-stage" aria-label="Vista previa de CajaLibre en computadora, tablet y celular">
    <div className="glow glow-one" /><div className="glow glow-two" />
    <div className="desktop-device">
      <div className="screen">
        <div className="mock-sidebar"><div className="mini-logo">CL</div>{[1,2,3,4,5,6].map(i => <i key={i} />)}</div>
        <div className="mock-main">
          <div className="mock-top"><b>Resumen del negocio</b><span>Hoy</span></div>
          <div className="mock-stats"><div><small>Ventas</small><b>$8,450</b></div><div><small>Productos</small><b>1,248</b></div><div><small>Clientes</small><b>386</b></div></div>
          <div className="mock-chart"><span /><span /><span /><span /><span /><span /><span /></div>
          <div className="mock-rows">{[1,2,3].map(i => <i key={i} />)}</div>
        </div>
      </div><div className="desktop-base" />
    </div>
    <div className="tablet-device"><div className="tablet-head">Productos <span>+</span></div><div className="product-grid">{[1,2,3,4,5,6].map(i => <i key={i}><FiPackage /></i>)}</div></div>
    <div className="phone-device"><div className="phone-notch" /><small>Total</small><b>$ 320.00</b><div className="phone-lines">{[1,2,3].map(i => <i key={i} />)}</div><div className="keypad">{[1,2,3,4,5,6,7,8,9].map(i => <i key={i}>{i}</i>)}</div></div>
  </div>;
}

export default function Landing() {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [login, setLogin] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const { loading, uid, accesoPermitido, motivoAcceso } = useAutorizacionActual();

  useEffect(() => {
    // La portada no decide por su cuenta: pregunta el destino de la sesion.
    // Antes mandaba a /home a cualquier usuario autenticado, aunque la guardia
    // de ruta lo regresara enseguida.
    if (loading || !uid) return;

    const destino = resolverRutaSesion({ loading, uid, accesoPermitido, motivoAcceso });
    // Sin destino (cargando, error) o con destino al propio login, la portada
    // publica se queda como esta.
    if (!destino.ruta || destino.ruta === RUTA_LOGIN) return;

    registrarRedireccion("Landing", "/", destino.ruta, destino.motivo);
    navigate(destino.ruta, { replace: true });
  }, [accesoPermitido, loading, motivoAcceso, navigate, uid]);

  const scroll = (id) => { setMenu(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };
  const register = <Link className="primary-btn" to="/login" state={{ register: true }}>Crear cuenta gratis <FiArrowRight /></Link>;

  return <div className="landing-page">
    <header className="landing-header">
      <div className="landing-container nav-content">
        <button className="brand-button" onClick={() => scroll("inicio")}><Brand /></button>
        <nav className={menu ? "open" : ""} aria-label="Navegación principal">
          <button onClick={() => scroll("inicio")}>Inicio</button><button onClick={() => scroll("funciones")}>Funciones</button>
          <button onClick={() => scroll("negocios")}>Negocios</button><button onClick={() => scroll("como-funciona")}>Cómo funciona</button>
          <button onClick={() => scroll("planes")}>Planes</button>
          <button onClick={() => scroll("preguntas")}>Preguntas frecuentes</button>
          <div className="mobile-actions"><button className="outline-btn" onClick={() => { setLogin(true); setMenu(false); }}>Iniciar sesión</button>{register}</div>
        </nav>
        <div className="nav-actions"><button className="outline-btn" onClick={() => setLogin(true)}>Iniciar sesión</button>{register}</div>
        <button className="menu-button" onClick={() => setMenu(!menu)} aria-label="Abrir menú">{menu ? <FiX /> : <FiMenu />}</button>
      </div>
    </header>

    <main>
      <section id="inicio" className="hero">
        <div className="landing-container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><FiTrendingUp /> Crece con orden y claridad</div>
            <h1>El <span>punto de venta</span> para tiendas, servicios y restaurantes</h1>
            <p>Administra ventas, inventario, clientes y empleados; o controla mesas, comandas, cocina, cuentas y caja desde un solo lugar.</p>
            <p className="hero-plan-note">Empieza gratis con las funciones esenciales y cambia a Premium cuando tu negocio necesite más.</p>
            <div className="catalog-callout"><FiPackage /><span><b>Más de 6,000 productos mexicanos precargados</b><small>para comenzar a vender más rápido.</small></span></div>
            <div className="hero-actions">{register}<button className="secondary-btn" onClick={() => scroll("planes")}>Ver planes</button></div>
            <div className="trust-row"><span><FiCheck /> Plan gratis sin mensualidad</span><span><FiCheck /> Fácil de usar</span><span><FiCheck /> Acceso multidispositivo</span></div>
          </div>
          <DashboardMockup />
        </div>
      </section>

      <section className="problem-section">
        <div className="landing-container problem-grid">
          <div className="before-after">
            <div className="old-tools"><span>Ventas: $ ?<br/>Inventario…</span><FiX/><FiCreditCard/></div>
            <FiArrowRight className="flow-arrow"/>
            <div className="new-tool"><FiMonitor/><span><FiCheck/></span></div>
          </div>
          <div className="section-copy"><span className="section-kicker">Menos errores, más control</span><h2>Deja atrás la libreta, la calculadora y los registros manuales</h2>
            <p>Llevar un negocio manualmente puede hacerte perder tiempo, dinero y productos sin que te des cuenta.</p>
            <p>Con CajaLibre registras ventas, controlas lo que entra y sale, consultas ganancias y conoces el estado real de tu negocio desde una sola plataforma.</p>
            <div className="mini-proof"><FiCheck /> Una interfaz clara, diseñada para comenzar rápidamente.</div>
          </div>
        </div>
      </section>

      <section id="funciones" className="section features-section"><div className="landing-container">
        <div className="section-heading"><span className="section-kicker">Todo en un solo lugar</span><h2>Las herramientas que tu negocio necesita</h2><p>Convierte tareas diarias en procesos simples, medibles y fáciles de controlar.</p></div>
        <div className="feature-grid">{features.map(([iconComponent, title, text]) => <article className="feature-card" key={title}><span className="icon-box">{createElement(iconComponent)}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div></section>

      <section id="negocios" className="section business-section"><div className="landing-container">
        <div className="section-heading light"><span className="section-kicker">Flexible por naturaleza</span><h2>Hecho para negocios como el tuyo</h2><p>Configura CajaLibre según tu operación, productos y forma de atender.</p></div>
        <div className="business-grid">{businesses.map(([iconComponent, name, description]) => <Link key={name} className={`business-card${name === "Restaurantes" ? " restaurant-business-card" : ""}`} to="/login" state={{ register: true, businessType: name }} aria-label={`Crear una cuenta para ${name}`}>{createElement(iconComponent)}<h3>{name}</h3><p>{description}</p><span>Comenzar gratis <FiArrowRight /></span></Link>)}</div>
      </div></section>

      <section id="como-funciona" className="section steps-section"><div className="landing-container">
        <div className="section-heading"><span className="section-kicker">Comienza hoy</span><h2>Tu negocio bajo control en tres pasos</h2><p>No necesitas experiencia previa ni procesos complicados.</p></div>
        <div className="steps-grid"><article><b>01</b><span><FiUser /></span><h3>Crea tu cuenta</h3><p>Regístrate gratuitamente con los datos básicos de tu negocio.</p></article><article><b>02</b><span><FiTool /></span><h3>Configura tu negocio</h3><p>Agrega usuarios, productos, impresoras y la información de tus tickets.</p></article><article><b>03</b><span><FiShoppingCart /></span><h3>Comienza a vender</h3><p>Registra ventas, controla inventario y consulta el rendimiento en tiempo real.</p></article></div>
        <div className="steps-cta">{register}</div>
      </div></section>

      <section id="planes" className="section pricing-section"><div className="landing-container">
        <div className="section-heading"><span className="section-kicker">Precios claros</span><h2>Un plan para cada etapa de tu negocio</h2><p>Comienza sin costo y activa Premium solo cuando tu operación lo pida.</p></div>
        <div className="pricing-grid">{planes.map((plan) => <article className={`pricing-card${plan.destacado ? " featured" : ""}`} key={plan.nombre}>
          {plan.destacado && <span className="pricing-badge"><FiStar /> Recomendado</span>}
          <h3>{plan.nombre}</h3>
          <p className="pricing-summary">{plan.resumen}</p>
          <div className="pricing-price"><b>{plan.precio}</b><small>{plan.periodo}</small></div>
          <ul>{plan.incluye.map((item) => <li key={item}><FiCheck /> {item}</li>)}</ul>
          <Link className={plan.destacado ? "primary-btn" : "secondary-btn"} to="/login" state={{ register: true }}>{plan.cta} <FiArrowRight /></Link>
        </article>)}</div>
        <p className="pricing-note">Premium se activa desde tu cuenta cuando lo necesites. Puedes seguir usando el plan gratuito el tiempo que quieras.</p>
      </div></section>

      <section id="preguntas" className="section faq-section"><div className="landing-container faq-layout">
        <div className="faq-intro"><span className="section-kicker">Resolvemos tus dudas</span><h2>Preguntas frecuentes</h2><p>Lo esencial antes de comenzar con CajaLibre.</p><button className="secondary-btn" onClick={() => setLogin(true)}>Probar CajaLibre</button></div>
        <div className="faq-list">{faqs.map(([q,a], i) => <article className={openFaq === i ? "open" : ""} key={q}><button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}><span>{q}</span><FiChevronDown /></button><div><p>{a}</p></div></article>)}</div>
      </div></section>

      <section className="final-cta"><div className="landing-container"><div><span>Tu siguiente venta puede ser más simple.</span><h2>Empieza a administrar tu negocio con CajaLibre</h2></div>{register}</div></section>
    </main>

    <AppFooter variant="landing" onNavigateSection={scroll} />
    <a href={whatsappUrl("Hola, me gustaría recibir información sobre CajaLibre.")} target="_blank" rel="noreferrer" className="whatsapp-float" aria-label="Contactar por WhatsApp"><FaWhatsapp /></a>
    {login && <LoginModal onClose={() => setLogin(false)} />}
  </div>;
}
