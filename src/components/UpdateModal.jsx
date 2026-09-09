import React, { useEffect, useMemo, useState } from "react";
import quickActionsUpdateImage from "../assets/actualizacion-acciones-rapidas.svg";
import "../css/updateModal.css";

function UpdateModal({ onClose }) {
  const [index, setIndex] = useState(0);

  const slides = [
    {
      title: "Versión 2.2: llega CajaLibre Premium",
      content: (
        <>
          <p className="slide-lead">
            CajaLibre estrena suscripción. El plan gratuito sigue igual de
            completo: Premium es una forma voluntaria de apoyar el proyecto y
            obtener algunas ventajas extra.
          </p>

          <ul>
            <li>⭐ Nueva suscripción CajaLibre Premium, opcional y por negocio.</li>
            <li>🚫 Premium quita los anuncios de todo el sistema.</li>
            <li>👥 Usuarios ilimitados para todo tu equipo.</li>
            <li>🖼️ Personaliza el sistema con el logo de tu negocio.</li>
            <li>💙 CajaLibre Free continúa siendo gratuito, siempre.</li>
          </ul>
        </>
      ),
    },
    {
      title: "¿Qué incluye CajaLibre Premium?",
      content: (
        <>
          <p className="slide-lead">
            Una sola suscripción por negocio, sin límite de usuarios.
          </p>

          <p className="update-premium-price">
            $300 <span>MXN / mes</span>
          </p>

          <ul className="update-premium-list">
            <li>
              <strong>🚫 Sin publicidad.</strong> Disfruta del sistema sin anuncios.
            </li>
            <li>
              <strong>💬 Soporte preferente.</strong> Atención más rápida y personalizada.
            </li>
            <li>
              <strong>🖼️ Logo de tu negocio.</strong> Personaliza CajaLibre con el logo de tu negocio.
            </li>
            <li>
              <strong>🧩 Funciones adicionales.</strong> Accede a nuevas herramientas y funciones adicionales.
            </li>
            <li>
              <strong>👥 Usuarios ilimitados.</strong> Todo tu equipo, sin restricciones.
            </li>
          </ul>

          <p className="update-premium-note">
            Actívala desde <strong>Configuración → Mi suscripción</strong>. Puedes
            cancelarla cuando quieras y conservas Premium hasta que termine el
            periodo que ya pagaste. Si prefieres seguir en el plan gratuito, no
            tienes que hacer nada.
          </p>
        </>
      ),
    },
    {
      title: "Una experiencia más rápida y ordenada",
      content: (
        <>
          <p className="slide-lead">
            Renovamos las pantallas que más utilizas para que vender, consultar
            servicios y trabajar con tu inventario sea mucho más sencillo.
          </p>

          <ul>
            <li>🛒 Nuevo diseño del Punto de Venta, más limpio y fácil de utilizar.</li>
            <li>⚡ Nuevo menú de Acciones rápidas con atajos de teclado F1–F7.</li>
            <li>📊 Nueva plantilla para importar y exportar el inventario en Excel.</li>
            <li>🔧 Nuevo diseño del apartado de Servicios para localizar trabajos rápidamente.</li>
            <li>🧾 Nuevo diseño del Detalle del servicio, con la información mejor organizada.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Nuevo menú de Acciones rápidas en el Punto de Venta",
      content: (
        <>
          <p className="slide-lead">
            La barra de opciones ya no ocupa espacio en la pantalla. Ahora todas
            esas herramientas están organizadas dentro de un solo menú.
          </p>

          <figure className="update-feature-figure">
            <img
              src={quickActionsUpdateImage}
              alt="Menú de Acciones rápidas con las opciones Venta extra, Promociones, Pagar servicio, Pagar fiado, Abonar servicio, Descuento manual y Agregar cliente"
            />
            <figcaption>
              El menú muestra junto a cada acción la tecla que puedes utilizar.
            </figcaption>
          </figure>

          <section className="update-how-to" aria-labelledby="quick-actions-how-to">
            <h3 id="quick-actions-how-to">¿Cómo funciona?</h3>
            <ol>
              <li><strong>Con el mouse:</strong> pulsa “Acciones rápidas” y elige una opción.</li>
              <li><strong>Con el teclado:</strong> usa F1–F7 sin abrir primero el menú.</li>
              <li><strong>Para clientes:</strong> pulsa F7 y se abrirá el formulario para agregar uno.</li>
            </ol>
          </section>
        </>
      ),
    },
    {
      title: "Nueva versión para restaurantes",
      content: (
        <>
          <p className="slide-lead">
            CajaLibre ahora también puede adaptarse a restaurantes, cafeterías y
            negocios de comida.
          </p>

          <ul>
            <li>🍽️ Administración de mesas y cuentas abiertas.</li>
            <li>📝 Creación y seguimiento de comandas.</li>
            <li>👨‍🍳 Control de pedidos enviados a preparación.</li>
            <li>🥡 Pedidos para comer en el lugar o para llevar.</li>
            <li>💰 Cobro de cuentas directamente desde el punto de venta.</li>
            <li>📋 Organización de productos por categorías.</li>
          </ul>
        </>
      ),
    },

    {
      title: "Tickets listos para impresoras de 80 mm",
      content: (
        <>
          <p className="slide-lead">
            Tus ventas ahora pueden generar tickets preparados para impresoras
            térmicas utilizadas en mostradores, tiendas y restaurantes.
          </p>

          <ul>
            <li>🧾 Formato optimizado para papel térmico de 80 mm.</li>

            <li>
              🛒 Información de productos, cantidades y total de la venta.
            </li>

            <li>💳 Método de pago registrado en el ticket.</li>

            <li>🏪 Datos principales de tu negocio.</li>

            <li>
              ⚡ Impresión rápida para agilizar la atención al cliente.
            </li>
          </ul>
        </>
      ),
    },

    {
      title: "Fiado: controla quién te debe",
      content: (
        <>
          <p className="slide-lead">
            Lleva un mejor control de las ventas a crédito y consulta rápidamente
            cuánto debe cada cliente.
          </p>

          <ul>
            <li>💳 Crear cuentas de fiado para tus clientes.</li>
            <li>💰 Consultar el saldo pendiente de cada cuenta.</li>
            <li>📥 Registrar abonos y pagos realizados.</li>
            <li>📜 Consultar movimientos e historial de la cuenta.</li>
            <li>⏰ Identificar cuentas pendientes o vencidas.</li>

            <li>
              ✅ Mantener un historial incluso después de liquidar la deuda.
            </li>
          </ul>
        </>
      ),
    },

    {
      title: "Descuentos y promociones",
      content: (
        <>
          <p className="slide-lead">
            Crea promociones para atraer clientes y ofrecer mejores precios sin
            complicar el proceso de venta.
          </p>

          <ul>
            <li>🏷️ Descuentos por porcentaje o cantidad.</li>

            <li>
              📦 Promociones aplicadas a productos específicos.
            </li>

            <li>
              🗂️ Promociones para categorías completas.
            </li>

            <li>
              🛒 Promociones aplicadas a varios productos.
            </li>

            <li>
              🎁 Ofertas como "Compra 2 y llévate el tercero gratis".
            </li>

            <li>
              🔥 Promociones como "Compra 2 y obtén descuento en el tercero".
            </li>
          </ul>
        </>
      ),
    },

    {
      title: "Todo tu negocio en un solo sistema",
      content: (
        <>
          <p className="slide-lead">
            CajaLibre conecta las diferentes áreas de tu negocio para mantener
            toda la información organizada desde un solo lugar.
          </p>

          <ul>
            <li>🛒 Punto de venta para productos y servicios.</li>

            <li>
              📦 Inventario con stock, costos y precios de venta.
            </li>

            <li>
              👥 Clientes con historial de compras y servicios.
            </li>

            <li>⭐ Programa de puntos y recompensas.</li>

            <li>
              🔧 Hoja de servicio y seguimiento por folio para talleres.
            </li>

            <li>
              🍽️ Herramientas especiales para restaurantes.
            </li>
          </ul>
        </>
      ),
    },

    {
      title: "Más control para tu negocio",
      content: (
        <>
          <p className="slide-lead">
            Consulta lo que sucede en tu negocio y mantén organizada la operación
            diaria.
          </p>

          <ul>
            <li>📊 Reportes de ventas y movimientos.</li>
            <li>💵 Cortes de caja.</li>
            <li>📉 Registro de egresos.</li>
            <li>👨‍💼 Empleados, roles y permisos.</li>
            <li>🔔 Notificaciones y configuraciones del negocio.</li>

            <li>
              📱 Diseño adaptado para computadora, tablet y celular.
            </li>
          </ul>
        </>
      ),
    },

    {
      title: "Los anuncios ayudan a mantener CajaLibre",
      content: (
        <>
          <p className="slide-lead">
            CajaLibre continúa siendo un proyecto gratuito. Los anuncios ayudan a
            cubrir parte de los gastos necesarios para mantener el sistema y seguir
            agregando nuevas herramientas.
          </p>

          <ul>
            <li>💙 Usar CajaLibre continúa siendo gratuito.</li>

            <li>
              📢 Algunos apartados pueden mostrar anuncios dentro del sistema.
            </li>

            <li>
              ☕ Los anuncios ayudan a mantener servidores, servicios y desarrollo.
            </li>

            <li>
              🚀 Este apoyo permite seguir agregando nuevas funcionalidades.
            </li>

            <li>
              🔐 No se solicitan datos bancarios para utilizar CajaLibre.
            </li>

            <li>
              ⭐ Con CajaLibre Premium el sistema se muestra sin anuncios.
            </li>

            <li>
              📣 Las próximas novedades se comunicarán desde este panel.
            </li>
          </ul>
        </>
      ),
    },

    {
      title: "Gracias por ser parte de CajaLibre 💙",
      content: (
        <>
          <p className="slide-lead">
            Cada negocio que utiliza CajaLibre ayuda a que el proyecto siga
            creciendo. Seguiremos trabajando para ofrecer herramientas útiles,
            sencillas y accesibles.
          </p>

          <ul>
            <li>🍽️ Más herramientas para restaurantes.</li>
            <li>🏪 Mejoras para tiendas y comercios.</li>

            <li>
              🔧 Nuevas funciones para talleres y servicios técnicos.
            </li>

            <li>
              📊 Más reportes y herramientas administrativas.
            </li>

            <li>
              💙 Y muchas mejoras que iremos agregando poco a poco.
            </li>
          </ul>
        </>
      ),
    },
  ];

  const slideVisuals = [
    {
      icon: "⭐",
      label: "CajaLibre 2.2",
      accent: "amber",
      description: "Llega la suscripción Premium",
    },
    {
      icon: "💎",
      label: "Premium",
      accent: "amber",
      description: "Ventajas de la suscripción",
    },
    {
      icon: "✨",
      label: "Mejoras recientes",
      accent: "blue",
      description: "Más claridad para vender y trabajar",
    },
    {
      icon: "⚡",
      label: "Punto de Venta",
      accent: "orange",
      description: "Tus herramientas en un solo menú",
    },
    {
      icon: "📊",
      label: "Administración",
      accent: "indigo",
      description: "Más control y organización",
    },

    {
      icon: "🧾",
      label: "Tickets 80 mm",
      accent: "purple",
      description: "Impresión preparada para tu negocio",
    },

    {
      icon: "💳",
      label: "Fiado",
      accent: "green",
      description: "Controla cuentas y pagos",
    },

    {
      icon: "🏷️",
      label: "Promociones",
      accent: "pink",
      description: "Nuevas formas de vender",
    },

    {
      icon: "🛒",
      label: "Todo en uno",
      accent: "cyan",
      description: "Tu negocio conectado",
    },

    {
      icon: "📊",
      label: "Administración",
      accent: "indigo",
      description: "Más control y organización",
    },

    {
      icon: "💙",
      label: "Proyecto gratuito",
      accent: "blue",
      description: "Los anuncios apoyan CajaLibre",
    },

    {
      icon: "✨",
      label: "Gracias",
      accent: "purple",
      description: "Seguimos creciendo contigo",
    },
  ];

  const totalSlides = slides.length;

  const currentVisual = slideVisuals[index];

  const progress = useMemo(() => {
    return Math.round(((index + 1) / totalSlides) * 100);
  }, [index, totalSlides]);

  const nextSlide = () => {
    setIndex((prev) => {
      if (prev < totalSlides - 1) {
        return prev + 1;
      }

      return prev;
    });
  };

  const prevSlide = () => {
    setIndex((prev) => {
      if (prev > 0) {
        return prev - 1;
      }

      return prev;
    });
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowRight") {
        setIndex((prev) => {
          if (prev < totalSlides - 1) {
            return prev + 1;
          }

          return prev;
        });
      }

      if (event.key === "ArrowLeft") {
        setIndex((prev) => {
          if (prev > 0) {
            return prev - 1;
          }

          return prev;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, totalSlides]);

  return (
    <div className="update-overlay" onClick={onClose}>
      <div
        className="update-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Novedades de CajaLibre"
      >
        {/* BOTÓN CERRAR */}
        <button
          type="button"
          className="update-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>

        {/* PANEL IZQUIERDO */}
        <aside
          className={`update-visual update-visual-${currentVisual.accent}`}
        >
          <div className="visual-top">
            <div className="cajalibre-brand">
              <div className="brand-icon">
                <span>🛒</span>
              </div>

              <div className="brand-copy">
                <strong>CajaLibre</strong>
                <span>Punto de Venta</span>
              </div>
            </div>

            <span className="version-badge">
              Versión 2.2
            </span>
          </div>

          <div className="visual-center">
            <div className="visual-icon">
              {currentVisual.icon}
            </div>

            <span className="visual-label">
              {currentVisual.label}
            </span>

            <h3>
              {currentVisual.description}
            </h3>

            <p>
              Nuevas herramientas pensadas para facilitar la operación de tu
              negocio.
            </p>
          </div>

          <div className="visual-footer">
            <div className="visual-free">
              <span className="visual-free-dot" />

              Servicio gratuito
            </div>

            <span>
              Hecho para pequeños negocios
            </span>
          </div>
        </aside>

        {/* PANEL DERECHO */}
        <section className="update-main">
          {/* HEADER */}
          <header className="update-header">
            <div className="update-header-copy">
              <span className="update-eyebrow">
                ✨ Novedades de CajaLibre
              </span>

              <div className="update-step-mobile">
                Actualización {index + 1} de {totalSlides}
              </div>
            </div>

            <span className="update-step">
              {index + 1} / {totalSlides}
            </span>
          </header>

          {/* BARRA DE PROGRESO */}
          <div className="update-progress" aria-hidden="true">
            <span
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          {/* CONTENIDO DEL SLIDE */}
          <div
            className="slider-content"
            key={index}
          >
            <div className="slide-title-row">
              <div
                className={`mini-icon mini-${currentVisual.accent}`}
              >
                {currentVisual.icon}
              </div>

              <div className="slide-title-copy">
                <span className="slide-category">
                  {currentVisual.label}
                </span>

                <h2>
                  {slides[index].title}
                </h2>
              </div>
            </div>

            <div className="slide-body">
              {slides[index].content}
            </div>
          </div>

          {/* FOOTER */}
          <footer className="update-footer">
            <div className="slider-dots">
              {slides.map((slide, i) => (
                <button
                  type="button"
                  key={slide.title}
                  title={slide.title}
                  aria-label={`Ir a actualización ${i + 1}`}
                  className={
                    i === index
                      ? "dot active"
                      : "dot"
                  }
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>

            <div className="slider-controls">
              <button
                type="button"
                className="update-prev"
                onClick={prevSlide}
                disabled={index === 0}
              >
                <span>←</span>
                Anterior
              </button>

              {index < totalSlides - 1 ? (
                <button
                  type="button"
                  className="update-next"
                  onClick={nextSlide}
                >
                  Siguiente
                  <span>→</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="update-next finish"
                  onClick={onClose}
                >
                  Listo
                  <span>✓</span>
                </button>
              )}
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

export default UpdateModal;
