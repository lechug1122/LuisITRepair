import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import {
  collection,
  addDoc,
  getDocs
} from "firebase/firestore";
import { db } from "../firebase";

export default function reportes() {

  const [ventas, setVentas] = useState([]);
  const [totalVenta, setTotalVenta] = useState("");

  const obtenerVentas = async () => {
    const querySnapshot = await getDocs(collection(db, "ventas"));
    const lista = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setVentas(lista);
  };

  useEffect(() => {
    obtenerVentas();
  }, []);

  const registrarVenta = async () => {
    await addDoc(collection(db, "ventas"), {
      total: Number(totalVenta),
      fecha: new Date()
    });

    setTotalVenta("");
    obtenerVentas();
  };

  return (
    <Layout>
      <h1>🛒 Ventas</h1>

      <div className="card">
        <input
          type="number"
          placeholder="Total Venta"
          value={totalVenta}
          onChange={(e) => setTotalVenta(e.target.value)}
        />
        <button onClick={registrarVenta}>
          Registrar Venta
        </button>
      </div>

      <table className="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map(v => (
            <tr key={v.id}>
              <td>{new Date(v.fecha.seconds * 1000).toLocaleDateString()}</td>
              <td>${v.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  );
}
