import { Routes, Route } from "react-router-dom";
import MainLayout from "./layout/Mainlayout";
import Servicios from "./pages/servicios_pendientes";
import HojaServicio from "./pages/Hoja_service";
import Status from "./pages/status";
import StatusDetalle from "./pages/status_detalle";
import Login from "./pages/login";
import ServicioDetalle from "./pages/servicio_detalle";
import ProtectedRoute from "./components/ProtectedRoute";
import PermissionRoute from "./components/PermissionRoute";
import ServiceModuleRoute from "./components/ServiceModuleRoute";
import Ticket from "./pages/tickets";
import StatusScan from "./pages/status_scan";
import Clientes from "./pages/Clientes";
import ClienteDetalle from "./pages/ClienteDetalle";
import NotFound from "./pages/NotFound";
import Home from "./pages/HomeGateway";
import POS from "./pages/POSGateway";
import Productos from "./pages/ProductosGateway";
import Reportes from "./pages/reportes";
import Configuracion from "./pages/Configuracion";
import ConfiguracionEmpresa from "./pages/ConfiguracionEmpresa";
import ConfiguracionPOS from "./pages/ConfiguracionPOS";
import ConfiguracionApariencia from "./pages/ConfiguracionApariencia";
import ConfiguracionServicios from "./pages/ConfiguracionServicios";
import ConfiguracionMetodosPago from "./pages/ConfiguracionMetodosPago";
import ConfiguracionNotificaciones from "./pages/ConfiguracionNotificaciones";
import ConfiguracionImpresoras from "./pages/ConfiguracionImpresoras";
import ConfiguracionProveedores from "./pages/ConfiguracionProveedores";
import ConfiguracionDonacion from "./pages/ConfiguracionDonacion";
import ConfiguracionAdministracion from "./pages/ConfiguracionAdministracion";
import ConfiguracionMiSuscripcion from "./pages/ConfiguracionMiSuscripcion";
import ConfiguracionRestaurante from "./pages/ConfiguracionRestaurante";
import TerminosCajaLibre from "./pages/TerminosCajaLibre";
import ConfiguracionInicial from "./pages/ConfiguracionInicial";
import NegocioBloqueado from "./pages/NegocioBloqueado";
import Empleados from "./pages/empleados";
import PanelGeneral from "./pages/panelgeneralCon";
import Landing from "./pages/Landing";
import CentroAyuda from "./pages/CentroAyuda";
import CookieConsent from "./components/CookieConsent";
import { PoliticaCookies, PoliticaPrivacidad } from "./pages/PoliticaLegal";

export default function App() {
  return (
    <>
    <Routes>
      {/* PUBLICO */}
      <Route path="/status" element={<Status />} />
      <Route path="/status/:folio" element={<StatusDetalle />} />
      <Route path="/login" element={<Login />} />
      <Route path="/ayuda" element={<CentroAyuda />} />
      <Route path="/" element={<Landing />} />
      <Route path="/privacidad" element={<PoliticaPrivacidad />} />
      <Route path="/cookies" element={<PoliticaCookies />} />
      <Route path="/status/scan" element={<StatusScan />} />

      <Route
        path="/terminos"
        element={
          <ProtectedRoute allowMotives={["terminos_pendientes"]}>
            <TerminosCajaLibre />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracion-inicial"
        element={
          <ProtectedRoute
            allowMotives={["configuracion_inicial_pendiente"]}
          >
            <ConfiguracionInicial />
          </ProtectedRoute>
        }
      />
      <Route
        path="/negocio-bloqueado"
        element={
          <ProtectedRoute allowMotives={["negocio_bloqueado"]}>
            <NegocioBloqueado />
          </ProtectedRoute>
        }
      />

      {/* PRIVADO (con navbar) */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/home" element={<Home />} />
        <Route
          path="/hoja_servicio"
          element={
            <ServiceModuleRoute>
              <PermissionRoute permission="servicios.crear">
                <HojaServicio />
              </PermissionRoute>
            </ServiceModuleRoute>
          }
        />
        <Route
          path="/servicios"
          element={
            <ServiceModuleRoute>
              <PermissionRoute permission="servicios.ver">
                <Servicios />
              </PermissionRoute>
            </ServiceModuleRoute>
          }
        />
        <Route
          path="/servicios/:folio"
          element={
            <ServiceModuleRoute>
              <PermissionRoute permission="servicios.ver">
                <ServicioDetalle />
              </PermissionRoute>
            </ServiceModuleRoute>
          }
        />
        <Route
          path="/ticket/:folio"
          element={(
            <ServiceModuleRoute>
              <Ticket />
            </ServiceModuleRoute>
          )}
        />
        <Route
          path="/clientes"
          element={
            <PermissionRoute permission="clientes.ver">
              <Clientes />
            </PermissionRoute>
          }
        />
        <Route
          path="/clientes/:id"
          element={
            <PermissionRoute permission="clientes.ver">
              <ClienteDetalle />
            </PermissionRoute>
          }
        />
        <Route
          path="/POS"
          element={
            <PermissionRoute permission="ventas.pos" permissionsAny={["restaurante.caja"]}>
              <POS />
            </PermissionRoute>
          }
        />
        <Route
          path="/productos"
          element={
            <PermissionRoute permission="productos.ver">
              <Productos />
            </PermissionRoute>
          }
        />
        <Route
          path="/reportes"
          element={
            <PermissionRoute permission="reportes.ver">
              <Reportes />
            </PermissionRoute>
          }
        />
        <Route
          path="/configuracion"
          element={
            <PermissionRoute permission="configuracion.ver" allowAnalyticsAccess>
              <Configuracion />
            </PermissionRoute>
          }
        >
          <Route index element={<PanelGeneral />} />
          <Route path="empresa" element={<ConfiguracionEmpresa />} />
          <Route
            path="empleados"
            element={
              <PermissionRoute permission="empleados.gestionar">
                <Empleados />
              </PermissionRoute>
            }
          />
          <Route path="pos" element={<ConfiguracionPOS />} />
          <Route path="restaurante" element={<ConfiguracionRestaurante />} />
          <Route
            path="suscripciones"
            element={
              <PermissionRoute requireAnalyticsAccess fallbackPath="/configuracion">
                <ConfiguracionAdministracion />
              </PermissionRoute>
            }
          />
          <Route
            path="analitica"
            element={
              <PermissionRoute requireAnalyticsAccess fallbackPath="/configuracion">
                <ConfiguracionAdministracion />
              </PermissionRoute>
            }
          />
          <Route
            path="mi-suscripcion"
            element={
              <PermissionRoute requireSubscriptionOwner fallbackPath="/configuracion">
                <ConfiguracionMiSuscripcion />
              </PermissionRoute>
            }
          />
          <Route
            path="inventario"
            element={
              <PermissionRoute permission="productos.ver">
                <Productos embedded />
              </PermissionRoute>
            }
          />
          <Route path="proveedores" element={<ConfiguracionProveedores />} />
          <Route path="servicios" element={<ConfiguracionServicios />} />
          <Route path="metodos" element={<ConfiguracionMetodosPago />} />
          <Route path="apariencia" element={<ConfiguracionApariencia />} />
          <Route path="notificaciones" element={<ConfiguracionNotificaciones />} />
          <Route path="impresoras" element={<ConfiguracionImpresoras />} />
          <Route path="donacion" element={<ConfiguracionDonacion />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    <CookieConsent />
    </>
  );
}
