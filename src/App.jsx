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
import Ticket from "./pages/tickets";
import StatusScan from "./pages/status_scan";
import Clientes from "./pages/Clientes";
import ClienteDetalle from "./pages/ClienteDetalle";
import NotFound from "./pages/NotFound";
import Home from "./pages/home";
import POS from "./pages/POS";
import Productos from "./pages/productos";
import Reportes from "./pages/reportes";
import Configuracion from "./pages/Configuracion";
import ConfiguracionPOS from "./pages/ConfiguracionPOS";
import ConfiguracionApariencia from "./pages/ConfiguracionApariencia";
import Empleados from "./pages/empleados";
import PanelGeneral from "./pages/panelgeneralCon";

export default function App() {
  return (
    <Routes>
      {/* PUBLICO */}
      <Route path="/status" element={<Status />} />
      <Route path="/status/:folio" element={<StatusDetalle />} />
      <Route path="/login" element={<Login />} />
      <Route path="/status/scan" element={<StatusScan />} />

      {/* PRIVADO (con navbar) */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route
          path="/hoja_servicio"
          element={
            <PermissionRoute permission="servicios.crear">
              <HojaServicio />
            </PermissionRoute>
          }
        />
        <Route
          path="/servicios"
          element={
            <PermissionRoute permission="servicios.ver">
              <Servicios />
            </PermissionRoute>
          }
        />
        <Route
          path="/servicios/:folio"
          element={
            <PermissionRoute permission="servicios.ver">
              <ServicioDetalle />
            </PermissionRoute>
          }
        />
        <Route path="/ticket/:folio" element={<Ticket />} />
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
            <PermissionRoute permission="ventas.pos">
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
            <PermissionRoute permission="configuracion.ver">
              <Configuracion />
            </PermissionRoute>
          }
        >
          <Route index element={<PanelGeneral />} />
          <Route
            path="empleados"
            element={
              <PermissionRoute permission="empleados.gestionar">
                <Empleados />
              </PermissionRoute>
            }
          />
          <Route path="pos" element={<ConfiguracionPOS />} />
          <Route path="apariencia" element={<ConfiguracionApariencia />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
