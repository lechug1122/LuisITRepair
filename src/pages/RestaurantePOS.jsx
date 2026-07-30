import { CajaView } from "./RestauranteWorkspace";
import Layout from "../components/Layout";
import useAutorizacionActual from "../hooks/useAutorizacionActual";

export default function RestaurantePOS() {
  const { uid, nombre, cuentaPrincipalUid } = useAutorizacionActual();
  return (
    <Layout restaurantMode>
      <div className="rest-page rest-pos-page">
        <CajaView
          posOnly
          tenantId={cuentaPrincipalUid || uid}
          actorUid={uid}
          actorNombre={nombre}
        />
      </div>
    </Layout>
  );
}
