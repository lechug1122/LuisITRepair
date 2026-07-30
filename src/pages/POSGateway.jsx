import POS from "./POS";
import RestaurantePOS from "./RestaurantePOS";
import useEmpresaConfig from "../hooks/useEmpresaConfig";

export default function POSGateway() {
  const { tipoNegocioActivo } = useEmpresaConfig();
  if (tipoNegocioActivo?.id === "restaurante") return <RestaurantePOS />;
  return <POS />;
}
