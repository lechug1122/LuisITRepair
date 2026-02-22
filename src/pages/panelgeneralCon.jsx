import React from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";

function PanelGeneral() {
  const navigate = useNavigate();

  const cards = [
    { key: "empresa", title: "Empresa", desc: "Datos, logo, RFC, dirección", action: "Configurar", path: "empresa" },
    { key: "empleados", title: "Empleados", desc: "Registrar, roles, permisos", action: "Gestionar", path: "empleados", badge: 12 },
    { key: "pos", title: "POS y Facturación", desc: "Tickets, IVA, plantillas", action: "Configurar", path: "pos" },
    { key: "inventario", title: "Inventario", desc: "Productos, categorías, stock", action: "Gestionar", path: "inventario" },
    { key: "servicios", title: "Servicios", desc: "Tipos, estados, garantías", action: "Gestionar", path: "servicios" },
    { key: "metodos", title: "Métodos de Pago", desc: "Efectivo, Tarjeta, Transferencia", action: "Configurar", path: "metodos" },
    { key: "impresoras", title: "Impresoras", desc: "Tickets, escáner, formatos", action: "Configurar", path: "impresoras" },
    { key: "apariencia", title: "Apariencia", desc: "Tema, idioma, formatos", action: "Configurar", path: "apariencia", highlight: true },
    { key: "notificaciones", title: "Notificaciones", desc: "Alertas, email, SMS", action: "Configurar", path: "notificaciones" },
    { key: "respaldo", title: "Respaldos", desc: "Base de datos, nube", action: "Respaldar Ahora", path: "respaldos", primary: true },
    { key: "seguridad", title: "Seguridad", desc: "Usuarios, sesiones, logs", action: "Configurar", path: "seguridad" },
    { key: "integraciones", title: "Integraciones", desc: "WhatsApp, Correo, API", action: "Conectar", path: "integraciones" },
  ];

  return (
    <>
      <div className="cfg-header">
        <h1>Configuración del Sistema</h1>
        <p>Administra todos los parámetros de tu negocio</p>
        <input className="cfg-search" placeholder="Buscar configuración..." />
      </div>

      <div className="cfg-grid">
        {cards.map((c) => (
          <div
            key={c.key}
            className={`cfg-card ${c.highlight ? "highlight" : ""}`}
          >
            {c.badge && <span className="badge">{c.badge}</span>}

            <div className="cfg-card-body">
              <div className="cfg-card-icon">
                <Icon name={c.key} />
              </div>

              <div className="cfg-card-info">
                <h4>{c.title}</h4>
                <p>{c.desc}</p>
              </div>
            </div>

            <button
              className={`btn ${
                c.primary
                  ? "btn-success"
                  : c.action === "Gestionar"
                  ? "btn-primary-blue"
                  : "btn-outline"
              }`}
              onClick={() => navigate(`/configuracion/${c.path}`)}
            >
              {c.action}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default PanelGeneral;