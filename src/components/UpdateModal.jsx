import React, { useEffect, useMemo, useState } from "react";
import "../css/updateModal.css";

function UpdateModal({ onClose }) {
  const [index, setIndex] = useState(0);

  const slides = [
    {
      title: "Todo tu negocio en un solo sistema",
      content: (
        <>
          <p className="slide-lead">
            Administra ventas, servicios, inventario y clientes desde una sola plataforma lista
            para trabajar todos los dias.
          </p>
          <ul>
            <li>Hoja de servicio y seguimiento por folio para talleres y negocios tecnicos.</li>
            <li>Punto de venta para cobrar productos, servicios y tickets desde el mismo sistema.</li>
            <li>Inventario con stock, precios, categorias, codigos y proveedores.</li>
            <li>Clientes con historial completo de compras y servicios.</li>
          </ul>
        </>
      ),
    },
    {
      title: "POS listo para vender",
      content: (
        <>
          <p className="slide-lead">
            Cobra mas rapido en mostrador y manten cada venta conectada con clientes, inventario y
            reportes.
          </p>
          <ul>
            <li>Alta rapida de clientes desde POS con nombre, telefono y direccion.</li>
            <li>Cobro con metodos de pago configurables para cada negocio.</li>
            <li>Tickets e impresion silenciosa para agilizar la atencion.</li>
            <li>Comparador de precios y flujo comercial adaptado para tienda o taller.</li>
            <li>POS movil responsive con selector Escaner/POS y modales optimizados para celular.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Inventario inteligente",
      content: (
        <>
          <p className="slide-lead">
            Captura productos mas rapido y manten actualizados existencias, costos y precios de
            venta.
          </p>
          <ul>
            <li>Autocompletado por codigo de barras con base precargada de miles de productos.</li>
            <li>Control de stock, costo, precio de venta y datos principales del articulo.</li>
            <li>Registro de proveedor principal para mejorar compras y seguimiento.</li>
            <li>El mismo inventario alimenta POS, clientes y operaciones del negocio.</li>
            <li>Selector de inventario y productos ajustado para verse completo en pantalla movil.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Clientes, puntos y seguimiento",
      content: (
        <>
          <p className="slide-lead">
            Fideliza a tus clientes y manten a la mano su historial para vender mejor en cada
            visita.
          </p>
          <ul>
            <li>Fichas de clientes con compras registradas, ultima compra y total acumulado.</li>
            <li>Historial de tickets y productos comprados por cada cliente.</li>
            <li>Programa de puntos y canjes para premiar compras recurrentes.</li>
            <li>Consulta de estatus y seguimiento de servicios por folio.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Control administrativo completo",
      content: (
        <>
          <p className="slide-lead">
            Ten visibilidad del negocio y organiza la operacion diaria con herramientas de control
            reales.
          </p>
          <ul>
            <li>Reportes de ventas, cortes de caja y registro de egresos.</li>
            <li>Empleados, roles y permisos para controlar accesos por puesto.</li>
            <li>Notificaciones, impresoras y configuraciones adaptadas a tu negocio.</li>
            <li>Modo taller tecnico o tienda comercial dentro de la misma plataforma.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Todo esto por solo $400 al mes",
      content: (
        <>
          <p className="slide-lead">
            Un solo sistema para ordenar tu negocio, vender mas rapido y tener mejor control sin
            complicarte.
          </p>
          <ul>
            <li>Incluye POS, inventario, clientes, servicios, reportes y configuracion.</li>
            <li>Ideal para talleres, telefonia, refacciones, mostrador y tiendas comerciales.</li>
            <li>Pagas solo $400 al mes por usar todas las funciones del sistema.</li>
            <li>Mas control, mas orden y mejor atencion al cliente desde un mismo lugar.</li>
          </ul>
        </>
      ),
    },
  ];

  const totalSlides = slides.length;
  const progress = useMemo(
    () => Math.round(((index + 1) / totalSlides) * 100),
    [index, totalSlides],
  );

  const nextSlide = () => {
    setIndex((prev) => (prev < totalSlides - 1 ? prev + 1 : prev));
  };

  const prevSlide = () => {
    setIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        setIndex((prev) => (prev < totalSlides - 1 ? prev + 1 : prev));
      }
      if (e.key === "ArrowLeft") {
        setIndex((prev) => (prev > 0 ? prev - 1 : prev));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, totalSlides]);

  return (
    <div className="update-overlay" onClick={onClose}>
      <div className="update-modal slider" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="update-close" onClick={onClose} aria-label="Cerrar">
          X
        </button>

        <div className="update-head">
          <div className="update-head-copy">
            <span className="update-chip">Promocion del sistema</span>
            <span className="update-caption">Abril 2026 - Todas las funciones por $400 al mes</span>
          </div>
          <span className="update-step">
            {index + 1}/{totalSlides}
          </span>
        </div>

        <div className="update-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="slider-content">
          <h2>{slides[index].title}</h2>
          <div className="slide-body">{slides[index].content}</div>
        </div>

        <div className="slider-controls">
          <button type="button" onClick={prevSlide} disabled={index === 0}>
            Anterior
          </button>

          {index < totalSlides - 1 ? (
            <button type="button" className="update-next" onClick={nextSlide}>
              Siguiente
            </button>
          ) : (
            <button type="button" className="update-next" onClick={onClose}>
              Finalizar
            </button>
          )}
        </div>

        <div className="slider-dots">
          {slides.map((slide, i) => (
            <button
              type="button"
              key={slide.title}
              title={slide.title}
              className={i === index ? "dot active" : "dot"}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default UpdateModal;
