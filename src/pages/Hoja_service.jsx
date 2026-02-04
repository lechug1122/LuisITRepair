import { useEffect, useMemo, useState } from "react";
import "../css/hoja_service.css";
import doneCsv from "../csv/mindfactory_done.csv?raw";
import updatedCsv from "../csv/mindfactory_updated.csv?raw";
import { guardarServicio } from "../js/services/servicios_firestore";
import { useNavigate } from "react-router-dom";


import {
  cargarCatalogoEquiposDesdeTextos,
  obtenerSpecsPorModelo,
} from "../js/models_equipos";
import { generarPdfHojaServicio } from "../js/services/pdf_hoja_servicio";

const initialForm = {
  // Cliente
  nombre: "",
  direccion: "",
  telefono: "",

  // Dispositivo
  tipoDispositivo: "",
  marca: "",
  modelo: "",

  // Laptop/PC
  procesador: "",
  ram: "",
  disco: "",
  estadoPantalla: "Funciona bien",
  estadoTeclado: "Funciona bien",
  estadoMouse: "Funciona bien",
  funciona: "Sí",
  enciendeEquipo: "Sí",
  contrasenaEquipo: "",

  // Impresora
  tipoImpresora: "Inyección de tinta",
  imprime: "Sí",
  condicionesImpresora: "",

  // Monitor
  tamanoMonitor: "",
  colores: "Sí",
  condicionesMonitor: "",

  // Otros
  trabajo: "",
  costo: "",
  precioDespues: false,
};

export default function HojaServicio() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);

  // ✅ estado para catálogo desde CSV
  const [marcasModelos, setMarcasModelos] = useState({});
  const [modelosData, setModelosData] = useState({});

  // ✅ tus marcas (igual que antes)
  const marcas = useMemo(
    () => ["Apple", "MSI", "Lenovo", "Acer", "Dell", "Ateck", "Asus", "HP"],
    [],
  );

  // ✅ cargar CSVs una sola vez
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const { marcasModelos, modelosData } =
          await cargarCatalogoEquiposDesdeTextos({
            marcas,
            csvTexts: [doneCsv, updatedCsv],
          });

        if (!alive) return;
        setMarcasModelos(marcasModelos);
        setModelosData(modelosData);
      } catch (err) {
        console.error("Error cargando catalogo:", err);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [marcas]);

  // ✅ modelos filtrados por marca seleccionada
  const modelos = useMemo(() => {
    return marcasModelos[form.marca] || [];
  }, [marcasModelos, form.marca]);

  const cpuOpciones = useMemo(
    () => [
      "Intel Core i3",
      "Intel Core i5",
      "Intel Core i7",
      "AMD Ryzen 5",
      "AMD Ryzen 7",
    ],
    [],
  );
  const ramOpciones = useMemo(() => ["4 GB", "8 GB", "16 GB", "32 GB"], []);
  const discoOpciones = useMemo(
    () => ["HDD 500 GB", "HDD 1 TB", "SSD 256 GB", "SSD 512 GB", "SSD 1 TB"],
    [],
  );

  const showLaptopPC =
    form.tipoDispositivo === "laptop" || form.tipoDispositivo === "pc";
  const showImpresora = form.tipoDispositivo === "impresora";
  const showMonitor = form.tipoDispositivo === "monitor";

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };

      // si cambia marca, limpia modelo + specs
      if (name === "marca") {
        next.modelo = "";
        next.procesador = "";
        next.ram = "";
        next.disco = "";
        return next;
      }

      // si cambia modelo, autollenar
      if (name === "modelo") {
        const specs = obtenerSpecsPorModelo(modelosData, next.marca, value);

        if (specs) {
          next.procesador = specs.procesador;
          next.ram = specs.ram;
          next.disco = specs.disco;
        }
      }

      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
    await generarPdfHojaServicio(form);
    
    const res = await guardarServicio(form); // { id, folio }
    navigate(`/ticket/${res.folio}`);


    // opcional: reset form
    setForm(initialForm);
  } catch (err) {
    console.error("Error guardando en Firebase:", err);
    alert("❌ No se pudo guardar. Revisa consola y reglas de Firestore.");
  }
    
  }

  return (
    <div className="container- hoja-page">
      <div className="row justify-content-center">
        {/* 🔥 AQUI ESTA EL ANCHO DEL RECTANGULO BLANCO */}
        <div className="col-8">
          <div className="card shadow-lg border-0">
            <div className="card-body p-4 p-md-5">
              <h2 className="text-center mb-4">Registro de Servicio Técnico</h2>

              <form id="formRegistro" onSubmit={handleSubmit}>
                {/* Datos del Cliente */}
                <div>
                  <label>Nombre del Cliente:</label>
                  <input
                    type="text"
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <label>Dirección:</label>
                  <input
                    type="text"
                    name="direccion"
                    value={form.direccion}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label>Teléfono:</label>
                  <input
                    type="text"
                    name="telefono"
                    value={form.telefono}
                    onChange={handleChange}
                  />
                </div>

                {/* Selección del dispositivo */}
                <div className="full">
                  <label>Tipo de Dispositivo:</label>
                  <select
                    id="tipoDispositivo"
                    name="tipoDispositivo"
                    value={form.tipoDispositivo}
                    onChange={handleChange}
                    required
                  >
                    <option value="">-- Selecciona --</option>
                    <option value="laptop">Laptop</option>
                    <option value="pc">Computadora de Escritorio</option>
                    <option value="impresora">Impresora</option>
                    <option value="monitor">Monitor</option>
                  </select>
                </div>

                {/* Marca */}
                <div>
                  <label>Marca:</label>
                  <input
                    list="listaMarcas"
                    name="marca"
                    id="marcaInput"
                    placeholder="Escribe o selecciona"
                    value={form.marca}
                    onChange={handleChange}
                  />
                  <datalist id="listaMarcas">
                    {marcas.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                {/* Modelo */}
                <div>
                  <label>Modelo:</label>
                  <input
                    list="listaModelos"
                    name="modelo"
                    id="modeloInput"
                    placeholder="Selecciona un modelo"
                    value={form.modelo}
                    onChange={handleChange}
                  />
                  <datalist id="listaModelos">
                    {modelos.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                {/* Campos específicos Laptop/PC */}
                {showLaptopPC && (
                  <div id="camposLaptopPC" className="full">
                    <fieldset className="fieldset-equipo">
                      <legend>Características Laptop/PC</legend>

                      <div>
                        <div>
                          <label>Procesador:</label>
                          <input
                            type="text"
                            id="procesador"
                            name="procesador"
                            list="cpuOpciones"
                            value={form.procesador}
                            onChange={handleChange}
                          />
                          <datalist id="cpuOpciones">
                            {cpuOpciones.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label>Memoria RAM:</label>
                          <input
                            type="text"
                            id="ram"
                            name="ram"
                            list="ramOpciones"
                            value={form.ram}
                            onChange={handleChange}
                          />
                          <datalist id="ramOpciones">
                            {ramOpciones.map((r) => (
                              <option key={r} value={r} />
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label>Disco Duro:</label>
                          <input
                            type="text"
                            id="disco"
                            name="disco"
                            list="discoOpciones"
                            value={form.disco}
                            onChange={handleChange}
                          />
                          <datalist id="discoOpciones">
                            {discoOpciones.map((d) => (
                              <option key={d} value={d} />
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label>Pantalla:</label>
                          <select
                            id="estadoPantalla"
                            name="estadoPantalla"
                            value={form.estadoPantalla}
                            onChange={handleChange}
                          >
                            <option value="Funciona bien">Funciona bien</option>
                            <option value="Con detalles">
                              Con detalles (rayas, manchas, etc.)
                            </option>
                            <option value="Dañada">Dañada / No funciona</option>
                          </select>
                        </div>

                        <div>
                          <label>Teclado:</label>
                          <select
                            id="estadoTeclado"
                            name="estadoTeclado"
                            value={form.estadoTeclado}
                            onChange={handleChange}
                          >
                            <option value="Funciona bien">Funciona bien</option>
                            <option value="Algunas teclas no funcionan">
                              Solo algunas teclas no funcionan
                            </option>
                            <option value="La mayoría no funciona">
                              La mayoría no funciona
                            </option>
                            <option value="No funciona">No funciona</option>
                          </select>
                        </div>

                        <div>
                          <label>Mouse/Touchpad:</label>
                          <select
                            id="estadoMouse"
                            name="estadoMouse"
                            value={form.estadoMouse}
                            onChange={handleChange}
                          >
                            <option value="Funciona bien">Funciona bien</option>
                            <option value="A veces falla">A veces falla</option>
                            <option value="No funciona">No funciona</option>
                          </select>
                        </div>

                        <div>
                          <label>¿Funciona Correctamente?:</label>
                          <select
                            name="funciona"
                            value={form.funciona}
                            onChange={handleChange}
                          >
                            <option>Sí</option>
                            <option>No</option>
                          </select>
                        </div>

                        <div>
                          <label>¿Enciende el equipo?:</label>
                          <select
                            name="enciendeEquipo"
                            id="enciendeEquipo"
                            value={form.enciendeEquipo}
                            onChange={handleChange}
                          >
                            <option>Sí</option>
                            <option>No</option>
                          </select>
                        </div>

                        <div>
                          <label>Contraseña del equipo (si aplica):</label>
                          <input
                            type="text"
                            name="contrasenaEquipo"
                            placeholder="Dejar en blanco si no aplica"
                            id="contrasenaEquipo"
                            value={form.contrasenaEquipo}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    </fieldset>
                  </div>
                )}

                {/* Campos específicos Impresora */}
                {showImpresora && (
                  <div id="camposImpresora" className="full">
                    <fieldset
                      style={{
                        border: "2px solid #3f87a6",
                        borderRadius: 10,
                        padding: 15,
                      }}
                    >
                      <legend style={{ color: "#3f87a6", fontWeight: "bold" }}>
                        Características Impresora
                      </legend>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 15,
                        }}
                      >
                        <div>
                          <label>Tipo de Impresora:</label>
                          <select
                            name="tipoImpresora"
                            value={form.tipoImpresora}
                            onChange={handleChange}
                          >
                            <option>Inyección de tinta</option>
                            <option>Láser</option>
                            <option>Multifuncional</option>
                          </select>
                        </div>

                        <div>
                          <label>¿Imprime correctamente?</label>
                          <select
                            name="imprime"
                            value={form.imprime}
                            onChange={handleChange}
                          >
                            <option>Sí</option>
                            <option>No</option>
                          </select>
                        </div>

                        <div className="full">
                          <label>Condiciones físicas:</label>
                          <textarea
                            name="condicionesImpresora"
                            value={form.condicionesImpresora}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    </fieldset>
                  </div>
                )}

                {/* Campos específicos Monitor */}
                {showMonitor && (
                  <div id="camposMonitor" className="full">
                    <fieldset
                      style={{
                        border: "2px solid #3f87a6",
                        borderRadius: 10,
                        padding: 15,
                      }}
                    >
                      <legend style={{ color: "#3f87a6", fontWeight: "bold" }}>
                        Características Monitor
                      </legend>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 15,
                        }}
                      >
                        <div>
                          <label>Tamaño (pulgadas):</label>
                          <input
                            type="text"
                            name="tamanoMonitor"
                            value={form.tamanoMonitor}
                            onChange={handleChange}
                          />
                        </div>

                        <div>
                          <label>¿Colores correctos?:</label>
                          <select
                            name="colores"
                            value={form.colores}
                            onChange={handleChange}
                          >
                            <option>Sí</option>
                            <option>No</option>
                          </select>
                        </div>

                        <div className="full">
                          <label>Condiciones físicas:</label>
                          <textarea
                            name="condicionesMonitor"
                            value={form.condicionesMonitor}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    </fieldset>
                  </div>
                )}

                {/* Otros */}
                <div className="full">
                  <label>Trabajo a Realizar:</label>
                  <textarea
                    name="trabajo"
                    value={form.trabajo}
                    onChange={handleChange}
                  />
                </div>

                <div className="full costo-row">
                  <label htmlFor="costo" className="me-3">
                    Costo estimado:
                  </label>

                  <input
                    type="number"
                    name="costo"
                    id="costo"
                    min="0"
                    step="0.01"
                    value={form.costo}
                    onChange={handleChange}
                    className="me-3"
                    style={{ width: 140 }}
                    disabled={form.precioDespues}
                  />

                  <div className="form-check ms-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="precioDespues"
                      name="precioDespues"
                      checked={form.precioDespues}
                      onChange={handleChange}
                    />
                    <label className="form-check-label" htmlFor="precioDespues">
                      Precio se define después del mantenimiento
                    </label>
                  </div>
                </div>

                <button type="submit">Guardar Registro y Generar PDF</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
