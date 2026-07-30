import { createElement, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiArrowRight,
  FiBarChart2,
  FiBox,
  FiCheckCircle,
  FiFileText,
  FiHeadphones,
  FiHelpCircle,
  FiMail,
  FiMonitor,
  FiPlay,
  FiSearch,
  FiShoppingBag,
  FiUsers,
  FiVolume2,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import AppFooter from "../components/AppFooter";
import logo from "../assets/logo.png";
import "../css/centro-ayuda.css";

const WHATSAPP_URL =
  "https://wa.me/522731430147?text=" +
  encodeURIComponent("Hola, necesito ayuda para utilizar CajaLibre.");

const CATEGORIES = [
  {
    id: "primeros-pasos",
    title: "Primeros pasos",
    description: "Todo lo necesario para comenzar a usar CajaLibre.",
    icon: FiMonitor,
    tone: "blue",
  },
  {
    id: "ventas",
    title: "Ventas y punto de venta",
    description: "Aprende a realizar ventas, usar el POS y gestionar tickets.",
    icon: FiShoppingBag,
    tone: "green",
  },
  {
    id: "inventario",
    title: "Inventario",
    description: "Control de productos, existencias y movimientos.",
    icon: FiBox,
    tone: "orange",
  },
  {
    id: "clientes",
    title: "Clientes y proveedores",
    description: "Gestiona tu base de clientes y proveedores fácilmente.",
    icon: FiUsers,
    tone: "purple",
  },
  {
    id: "reportes",
    title: "Reportes",
    description: "Consulta y genera reportes para tu negocio.",
    icon: FiBarChart2,
    tone: "yellow",
  },
];

const ARTICLES = [
  {
    id: "crear-primera-venta",
    category: "ventas",
    title: "¿Cómo crear mi primera venta?",
    summary: "Abre el Punto de venta, agrega productos al carrito y selecciona Realizar venta.",
    steps: [
      "Entra a Punto de venta desde el menú principal.",
      "Escanea un código o busca el producto por nombre.",
      "Comprueba cantidades, precios y total.",
      "Pulsa Realizar venta, elige la forma de pago y confirma.",
    ],
    destination: "/POS",
    destinationLabel: "Ir al Punto de venta",
  },
  {
    id: "agregar-productos",
    category: "inventario",
    title: "Agregar productos a mi inventario",
    summary: "Registra productos, precio, código de barras y existencias desde Inventario.",
    steps: [
      "Abre Configuración y entra a Inventario.",
      "Pulsa agregar producto.",
      "Captura nombre, código, precio, costo y existencias.",
      "Guarda el producto para comenzar a venderlo.",
    ],
    destination: "/configuracion/inventario",
    destinationLabel: "Abrir Inventario",
  },
  {
    id: "imprimir-tickets",
    category: "ventas",
    title: "Imprimir tickets desde CajaLibre",
    summary: "Configura tu impresora y activa la impresión al cobrar.",
    steps: [
      "Entra a Configuración e Impresoras.",
      "Selecciona el tipo y ancho de papel.",
      "Activa Imprimir al cobrar.",
      "Realiza una venta de prueba y revisa el ticket.",
    ],
    destination: "/configuracion/impresoras",
    destinationLabel: "Configurar impresoras",
  },
  {
    id: "corte-caja",
    category: "reportes",
    title: "Realizar un corte de caja",
    summary: "Consulta ventas, entradas, salidas y diferencias del turno.",
    steps: [
      "Entra al inicio del sistema.",
      "Abre el módulo de corte de caja.",
      "Verifica efectivo, tarjeta, transferencias y egresos.",
      "Confirma el cierre después de revisar las diferencias.",
    ],
    destination: "/home",
    destinationLabel: "Ir al inicio",
  },
  {
    id: "gestionar-usuarios",
    category: "primeros-pasos",
    title: "¿Cómo invitar y gestionar usuarios?",
    summary: "Crea trabajadores y asigna permisos según sus responsabilidades.",
    steps: [
      "Abre Configuración y entra a Empleados.",
      "Pulsa agregar empleado.",
      "Captura sus datos y una contraseña temporal.",
      "Selecciona el rol y revisa sus permisos antes de guardar.",
    ],
    destination: "/configuracion/empleados",
    destinationLabel: "Gestionar empleados",
  },
  {
    id: "registrar-cliente",
    category: "clientes",
    title: "Registrar y consultar clientes",
    summary: "Guarda datos de contacto y consulta compras, puntos y servicios.",
    steps: [
      "Abre Clientes desde el menú.",
      "Pulsa agregar cliente y captura sus datos.",
      "Guarda el registro.",
      "Selecciona al cliente para consultar su historial.",
    ],
    destination: "/clientes",
    destinationLabel: "Abrir Clientes",
  },
  {
    id: "novedades-cajalibre",
    category: "primeros-pasos",
    title: "Novedades de CajaLibre",
    summary: "Consulta las mejoras más recientes disponibles en el sistema.",
    steps: [
      "Revisa el apartado Actualizaciones desde el pie de página del sistema.",
      "Lee la descripción de cada versión y sus cambios principales.",
      "Recarga CajaLibre cuando se publique una actualización.",
      "Contacta a soporte si una función nueva no aparece en tu cuenta.",
    ],
    destination: "/home",
    destinationLabel: "Entrar a CajaLibre",
  },
];

export default function CentroAyuda() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const categoryId = searchParams.get("categoria") || "";
  const articleId = searchParams.get("articulo") || "";

  const selectedCategory = CATEGORIES.find((category) => category.id === categoryId) || null;
  const selectedArticle = ARTICLES.find((article) => article.id === articleId) || null;
  const normalizedSearch = search.trim().toLocaleLowerCase("es");

  const visibleArticles = useMemo(() => {
    return ARTICLES.filter((article) => {
      if (selectedCategory && article.category !== selectedCategory.id) return false;
      if (!normalizedSearch) return true;
      return `${article.title} ${article.summary}`
        .toLocaleLowerCase("es")
        .includes(normalizedSearch);
    });
  }, [normalizedSearch, selectedCategory]);

  const openCategory = (id) => {
    setSearchParams({ categoria: id });
    document.getElementById("articulos-ayuda")?.scrollIntoView({ behavior: "smooth" });
  };

  const openArticle = (id) => {
    const params = {};
    if (categoryId) params.categoria = categoryId;
    params.articulo = id;
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="help-page">
      <header className="help-header">
        <div className="help-container help-nav">
          <Link to="/" className="help-brand">
            <img src={logo} alt="" />
            <strong>Caja<span>Libre</span></strong>
          </Link>
          <nav aria-label="Navegación del centro de ayuda">
            <Link to="/">Inicio</Link>
            <Link className="active" to="/ayuda">Centro de ayuda</Link>
            <Link to="/status">Estado del servicio</Link>
            <a href="#contacto">Contacto</a>
          </nav>
          <Link className="help-app-button" to="/login">Ir a CajaLibre <FiArrowRight /></Link>
        </div>
      </header>

      {selectedArticle ? (
        <main className="help-article-main">
          <article className="help-article help-container">
            <button
              type="button"
              className="help-back"
              onClick={() => setSearchParams(categoryId ? { categoria: categoryId } : {})}
            >
              <FiArrowLeft /> Volver al Centro de ayuda
            </button>
            <span className="help-article-kicker">Guía de CajaLibre</span>
            <h1>{selectedArticle.title}</h1>
            <p className="help-article-summary">{selectedArticle.summary}</p>
            <ol>
              {selectedArticle.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <Link className="help-primary-link" to={selectedArticle.destination}>
              {selectedArticle.destinationLabel} <FiArrowRight />
            </Link>
          </article>
        </main>
      ) : (
        <main>
          <section className="help-hero">
            <div className="help-container help-hero-grid">
              <div>
                <span className="help-eyebrow"><FiHelpCircle /> Soporte CajaLibre</span>
                <h1>Centro de ayuda de CajaLibre</h1>
                <p>Encuentra respuestas, guías y recursos para aprovechar al máximo CajaLibre.</p>
                <label className="help-search">
                  <FiSearch />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Busca artículos, guías o temas..."
                  />
                </label>
              </div>
              <div className="help-device" aria-hidden="true">
                <div className="help-laptop">
                  <div className="help-screen">
                    <i /><i /><i />
                    <span />
                    <b />
                  </div>
                  <div className="help-laptop-base" />
                </div>
                <div className="help-phone"><span /><i /><i /><i /></div>
              </div>
            </div>
          </section>

          <section className="help-content help-container">
            <h2>Explora por categoría</h2>
            <div className="help-categories">
              {CATEGORIES.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={`help-category${selectedCategory?.id === category.id ? " selected" : ""}`}
                  onClick={() => openCategory(category.id)}
                >
                  <i className={`tone-${category.tone}`}>{createElement(category.icon)}</i>
                  <strong>{category.title}</strong>
                  <p>{category.description}</p>
                  <span>Ver artículos <FiArrowRight /></span>
                </button>
              ))}
            </div>

            <div className="help-main-grid" id="articulos-ayuda">
              <section className="help-popular">
                <div className="help-section-title">
                  <h2>{selectedCategory ? selectedCategory.title : normalizedSearch ? "Resultados" : "Artículos populares"}</h2>
                  {(selectedCategory || normalizedSearch) && (
                    <button type="button" onClick={() => { setSearch(""); setSearchParams({}); }}>
                      Ver todos
                    </button>
                  )}
                </div>
                {visibleArticles.length > 0 ? visibleArticles.map((article) => (
                  <button type="button" className="help-article-row" key={article.id} onClick={() => openArticle(article.id)}>
                    <i><FiFileText /></i>
                    <span>{article.title}</span>
                    <FiArrowRight />
                  </button>
                )) : (
                  <div className="help-no-results">No encontramos artículos con esa búsqueda.</div>
                )}
              </section>

              <aside className="help-contact" id="contacto">
                <h2>¿Necesitas más ayuda?</h2>
                <div>
                  <i><FiHeadphones /></i>
                  <section>
                    <strong>Estamos aquí para ayudarte</strong>
                    <p>Nuestro equipo de soporte está listo para resolver tus dudas.</p>
                    <a className="primary" href="mailto:cajalibre.puntodeventa@gmail.com"><FiMail /> Enviar un mensaje</a>
                    <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"><FaWhatsapp /> Iniciar chat por WhatsApp</a>
                  </section>
                </div>
              </aside>
            </div>

            <div className="help-resource-grid">
              <Link to="/status" className="help-resource">
                <i><FiCheckCircle /></i>
                <span><strong>Estado del servicio</strong><small>Consulta el avance de una reparación con su folio o código QR.</small></span>
                <b>Consultar</b>
              </Link>
              <button type="button" className="help-resource" onClick={() => openCategory("primeros-pasos")}>
                <i><FiPlay /></i>
                <span><strong>Guías paso a paso</strong><small>Aprende las funciones principales.</small></span>
                <FiArrowRight />
              </button>
              <button type="button" className="help-resource" onClick={() => openArticle("novedades-cajalibre")}>
                <i><FiVolume2 /></i>
                <span><strong>Novedades</strong><small>Conoce las mejoras recientes.</small></span>
                <FiArrowRight />
              </button>
            </div>
          </section>
        </main>
      )}

      <AppFooter compact />
    </div>
  );
}
