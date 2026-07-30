import Home from "./home";
import RestauranteWorkspace from "./RestauranteWorkspace";
import useEmpresaConfig from "../hooks/useEmpresaConfig";

export default function HomeGateway() {
  const { tipoNegocioActivo } = useEmpresaConfig();
  if (tipoNegocioActivo?.id === "restaurante") return <RestauranteWorkspace />;
  return <Home />;
}
