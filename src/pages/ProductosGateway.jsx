import Productos from "./productos";
import Platillos from "./Platillos";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function ProductosGateway(props) {
  const { tipoNegocioActivo } = useEmpresaConfig();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  if (tipoNegocioActivo?.id === "restaurante") {
    return searchParams.get("catalogo") === "inventario"
      ? <div className="restaurant-inventory-view"><button type="button" className="restaurant-back-to-menu" onClick={() => navigate("/productos")}>← Volver a Platillos</button><Productos {...props} embedded /></div>
      : <Platillos {...props} embedded />;
  }
  return <Productos {...props} />;
}
