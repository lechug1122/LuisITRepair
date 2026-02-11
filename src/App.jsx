import { Routes, Route } from "react-router-dom";
import MainLayout from "./layout/Mainlayout";
import Servicios from "./pages/servicios_pendientes";
import HojaServicio from "./pages/Hoja_service";
import Status from "./pages/status";
import StatusDetalle from "./pages/status_detalle";
import Login from "./pages/login";
import ServicioDetalle from "./pages/servicio_detalle";
import ProtectedRoute from "./components/ProtectedRoute";
import Ticket from "./pages/tickets";
import StatusScan from "./pages/status_scan";
import Clientes from "./pages/Clientes";
import ClienteDetalle from "./pages/ClienteDetalle";
import NotFound from "./pages/NotFound";
import Home from "./pages/home";
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
        <Route path="/" element={<HojaServicio />} />
        <Route path="/home" element={<Home />} />
        <Route path="/hoja_servicio" element={<HojaServicio />} />
        <Route path="/servicios" element={<Servicios />} />
        <Route path="/servicios/:folio" element={<ServicioDetalle />} />
        <Route path="/ticket/:folio" element={<Ticket />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:id" element={<ClienteDetalle />} />
      </Route>

      <Route
        path="*"
        element={<NotFound />}
      />
    </Routes>
  );
}
