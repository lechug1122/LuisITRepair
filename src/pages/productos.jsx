import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import "../css/productos.css";
import {
  obtenerProductos,
  crearProducto,
  actualizarProducto,
  eliminarProductoDB
} from "../js/services/POS_firebase";

const productoVacio = {
  nombre: "",
  codigo: "",
  categoria: "",
  tipo: "producto",
  precioCompra: "",
  precioVenta: "",
  stock: "",
  stockMinimo: "",
  compatible: "",
  generaPuntos: true,
  activo: true
};

export default function Productos() {
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState(productoVacio);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);

  useEffect(() => {
    cargarProductos();
  }, []);

  const cargarProductos = async () => {
    const data = await obtenerProductos();
    setProductos(data);
  };

  const normalizarCodigo = (value) => String(value ?? "").trim().toLowerCase();

  const existeCodigoRegistrado = (codigo, idActual = null) => {
    const codigoNormalizado = normalizarCodigo(codigo);
    if (!codigoNormalizado) return false;

    return productos.some((p) => {
      const mismoCodigo = normalizarCodigo(p.codigo) === codigoNormalizado;
      const otroProducto = idActual ? p.id !== idActual : true;
      return mismoCodigo && otroProducto;
    });
  };

  const validarCodigoUnico = () => {
    if (!form.codigo) return;

    if (existeCodigoRegistrado(form.codigo, modoEdicion ? form.id : null)) {
      alert("Ese codigo ya esta dado de alta.");
    }
  };

  const calcularMargen = (compra, venta) => {
    if (!compra || !venta) return 0;
    return (((venta - compra) / compra) * 100).toFixed(1);
  };

  const abrirNuevoProducto = () => {
    setForm(productoVacio);
    setModoEdicion(false);
    setMostrarModal(true);
  };

  const editarProducto = (producto) => {
    setForm(producto);
    setModoEdicion(true);
    setMostrarModal(true);
  };

  const editarPorCodigo = () => {
    const codigo = prompt("Ingresa el codigo de barras del producto a modificar:");
    if (!codigo) return;

    const codigoNormalizado = normalizarCodigo(codigo);
    const producto = productos.find((p) => normalizarCodigo(p.codigo) === codigoNormalizado);

    if (!producto) {
      alert("No se encontro un producto con ese codigo.");
      return;
    }

    editarProducto(producto);
  };

  const guardarProducto = async () => {
    if (!form.nombre || !form.precioVenta || !form.codigo) {
      alert("Nombre, codigo y precio venta son obligatorios.");
      return;
    }

    if (existeCodigoRegistrado(form.codigo, modoEdicion ? form.id : null)) {
      alert("Ese codigo ya esta dado de alta.");
      return;
    }

    try {
      if (modoEdicion) {
        await actualizarProducto(form.id, form);
      } else {
        await crearProducto(form);
      }

      setMostrarModal(false);
      setModoEdicion(false);
      setForm(productoVacio);
      cargarProductos();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const eliminarProducto = async (id) => {
    if (!id) return;
    if (!confirm("Estas seguro de eliminar este producto?")) return;

    await eliminarProductoDB(id);
    cargarProductos();
  };

  return (
    <Layout>
      <div className="productos-container">
        <div className="header-productos">
          <h1>Productos</h1>
          <div className="acciones-header-productos">
            <button
              className="btn-accion-header btn-modificar-codigo"
              onClick={editarPorCodigo}
              type="button"
            >
              Modificar por codigo
            </button>
            <button
              className="btn-accion-header btn-nuevo"
              onClick={abrirNuevoProducto}
              type="button"
            >
              + Nuevo Producto
            </button>
          </div>
        </div>

        <table className="tabla-productos">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Codigo</th>
              <th>Categoria</th>
              <th>Compra</th>
              <th>Venta</th>
              <th>Margen</th>
              <th>Stock</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{p.codigo}</td>
                <td>{p.categoria}</td>
                <td>${p.precioCompra}</td>
                <td>${p.precioVenta}</td>
                <td className="margen">{calcularMargen(p.precioCompra, p.precioVenta)}%</td>
                <td>{p.stock}</td>
                <td>{p.activo ? <span className="activo">Activo</span> : <span className="inactivo">Inactivo</span>}</td>
                <td>
                  <div className="acciones-tabla">
                    <button
                      type="button"
                      className="btn-accion-tabla btn-editar"
                      onClick={() => editarProducto(p)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn-accion-tabla btn-eliminar"
                      onClick={() => eliminarProducto(p.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {mostrarModal && (
          <div className="modal-overlay">
            <div className="modal-center">
              <h2 className="modal-title">{modoEdicion ? "Editar producto" : "Nuevo producto"}</h2>

              <div className="form-grid">
                <input
                  placeholder="Nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />

                <input
                  placeholder="Codigo de barras"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  onBlur={validarCodigoUnico}
                />

                <input
                  placeholder="Categoria"
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                />

                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  <option value="producto">Producto</option>
                  <option value="refaccion">Refaccion</option>
                  <option value="servicio">Servicio</option>
                </select>

                <input
                  type="number"
                  placeholder="Precio compra"
                  value={form.precioCompra}
                  onChange={(e) => setForm({ ...form, precioCompra: Number(e.target.value) })}
                />

                <input
                  type="number"
                  placeholder="Precio venta"
                  value={form.precioVenta}
                  onChange={(e) => setForm({ ...form, precioVenta: Number(e.target.value) })}
                />

                <input
                  type="number"
                  placeholder="Stock"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                />

                <input
                  type="number"
                  placeholder="Stock minimo"
                  value={form.stockMinimo}
                  onChange={(e) => setForm({ ...form, stockMinimo: Number(e.target.value) })}
                />

                <input
                  placeholder="Compatible con"
                  value={form.compatible}
                  onChange={(e) => setForm({ ...form, compatible: e.target.value })}
                />
              </div>

              <div className="modal-buttons">
                <button className="btn-modal btn-guardar" onClick={guardarProducto} type="button">
                  Guardar
                </button>
                <button
                  className="btn-modal btn-cancelar"
                  onClick={() => {
                    setMostrarModal(false);
                    setModoEdicion(false);
                    setForm(productoVacio);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
