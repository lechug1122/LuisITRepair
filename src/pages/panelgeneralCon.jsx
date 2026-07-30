import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import Icon from "../components/Icon";
import useAutorizacionActual from "../hooks/useAutorizacionActual";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { auth, db } from "../initializer/firebase";
import { hasAnalyticsAccess } from "../js/services/analytics_access";

function PanelGeneral() {
  const navigate = useNavigate();
  const { serviciosHabilitados, tipoNegocioActivo } = useEmpresaConfig();
  const esRestaurante = tipoNegocioActivo?.id === "restaurante";
  const { superAdmin, accesoAnalitica, cuentaPrincipalUid, uid } = useAutorizacionActual();
  const analyticsAccess = hasAnalyticsAccess({
    superAdmin,
    accesoAnalitica,
    email: auth.currentUser?.email,
  });
  const [empleadosCount, setEmpleadosCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const ownerBase = cuentaPrincipalUid || uid;
  const empleadosCountVisible = ownerBase ? empleadosCount : 0;
  const esAdministradorNegocio =
    superAdmin !== true &&
    String(uid || "").trim() !== "" &&
    String(uid || "").trim() === String(cuentaPrincipalUid || "").trim();

  useEffect(() => {
    if (!ownerBase) return undefined;

    const unsub = onSnapshot(
      query(collection(db, "empleados"), where("cuentaPrincipalUid", "==", ownerBase)),
      (snap) => {
        setEmpleadosCount(snap.size || 0);
      },
      () => setEmpleadosCount(0),
    );

    return () => unsub();
  }, [ownerBase]);

  const cards = useMemo(
    () => [
      { key: "empresa", title: "Empresa", desc: "Datos, logo, RFC, direccion", action: "Configurar", path: "empresa" },
      ...(!esRestaurante
        ? [{ key: "proveedores", title: "Proveedores", desc: "Contactos, compras, marcas y credito", action: "Gestionar", path: "proveedores" }]
        : []),
      { key: "empleados", title: "Empleados", desc: "Registrar, roles, permisos", action: "Gestionar", path: "empleados", badge: empleadosCountVisible },
      ...(analyticsAccess
        ? [{
          key: "administracion",
          title: "Administracion",
          desc: superAdmin
            ? "Negocios, usuarios, analitica, errores y exportaciones"
            : "Analitica, actividad, errores y exportaciones",
          action: superAdmin ? "Administrar" : "Ver analitica",
          path: "suscripciones",
          highlight: true,
        }]
        : []),
      ...(esAdministradorNegocio
        ? [{
          key: "suscripciones",
          title: "Mi Plan",
          desc: "Plan gratuito, usuarios y equipos registrados",
          action: "Ver detalle",
          path: "mi-suscripcion",
          highlight: true,
        }]
        : []),
      { key: "pos", title: "POS y Facturacion", desc: "Tickets, IVA, plantillas", action: "Configurar", path: "pos" },
      ...(esRestaurante
        ? [{
          key: "restaurante",
          title: "Restaurante",
          desc: "Operacion, mesas, comandas y limites de cuentas",
          action: "Configurar",
          path: "restaurante",
        }]
        : []),
      {
        key: "inventario",
        title: esRestaurante ? "Platillos" : "Inventario",
        desc: esRestaurante
          ? "Carta del restaurante: platillos, categorias y precios"
          : "Mismo inventario del POS: productos, categorias y stock",
        action: "Gestionar",
        path: "inventario",
        icon: esRestaurante ? "platillos" : "inventario",
      },
      ...(!esRestaurante ? [{
        key: "servicios",
        title: serviciosHabilitados ? "Servicios" : "Canjes y fidelidad",
        desc: serviciosHabilitados
          ? "Tipos, estados, garantias y canjes"
          : "Programa de puntos, canjes y recompensas del cliente",
        action: "Gestionar",
        path: "servicios",
      }] : []),
      {
        key: "metodos",
        title: "Metodos de Pago",
        desc: "Moneda, Tarjeta, Transferencia, Mercado Pago y PayPal",
        action: "Configurar",
        path: "metodos",
      },
      { key: "apariencia", title: "Apariencia", desc: "Tema, idioma, formatos", action: "Configurar", path: "apariencia", highlight: true },
      { key: "notificaciones", title: "Notificaciones", desc: "Alertas, email, SMS", action: "Configurar", path: "notificaciones" },
      { key: "impresoras", title: "Impresoras", desc: "Autoimpresion, ticket y flujo de cobro", action: "Configurar", path: "impresoras" },
      {
        key: "donacion",
        title: "Donacion",
        desc: "PayPal, Mercado Pago y apoyo voluntario al sistema",
        action: "Abrir",
        path: "donacion",
        primary: true,
      },
      // { key: "respaldo", title: "Respaldos", desc: "Base de datos, nube", action: "Respaldar Ahora", path: "respaldos", primary: true },
      // { key: "seguridad", title: "Seguridad", desc: "Usuarios, sesiones, logs", action: "Configurar", path: "seguridad" },
      // { key: "integraciones", title: "Integraciones", desc: "WhatsApp, Correo, API", action: "Conectar", path: "integraciones" },
    ],
    [analyticsAccess, empleadosCountVisible, esAdministradorNegocio, esRestaurante, serviciosHabilitados, superAdmin],
  );

  const normalizeText = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const cardsFiltradas = useMemo(() => {
    const query = normalizeText(searchTerm);
    if (!query) return cards;

    return cards.filter((c) => {
      const joined = normalizeText(`${c.title} ${c.desc} ${c.action} ${c.path}`);
      return joined.includes(query);
    });
  }, [cards, searchTerm]);

  const abrirPrimerResultado = () => {
    if (!cardsFiltradas.length) return;
    navigate(`/configuracion/${cardsFiltradas[0].path}`);
  };

  return (
    <>
      <div className="cfg-header">
        <h1>Configuracion del Sistema</h1>
        <p>Administra todos los parametros de tu negocio</p>
        <input
          className="cfg-search"
          placeholder="Buscar configuracion..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") abrirPrimerResultado();
          }}
        />
      </div>

      <div className="cfg-grid">
        {cardsFiltradas.map((c) => (
          <div
            key={c.key}
            className={`cfg-card ${c.highlight ? "highlight" : ""}`}
          >
            {typeof c.badge === "number" && <span className="badge">{c.badge}</span>}

            <div className="cfg-card-body">
              <div className={`cfg-card-icon icon-${c.key}`}>
                <Icon name={c.icon || c.key} />
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

        {cardsFiltradas.length === 0 && (
          <div className="cfg-grid-empty">
            No se encontraron coincidencias para "{searchTerm}".
          </div>
        )}
      </div>
    </>
  );
}

export default PanelGeneral;
