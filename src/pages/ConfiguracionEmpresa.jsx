import { useEffect, useState } from "react";
import useEmpresaConfig from "../hooks/useEmpresaConfig";
import { actualizarNombreEmpresa } from "../js/services/configure_empresa";

export default function ConfiguracionEmpresa() {
  const { nombreEmpresa } = useEmpresaConfig();
  const [nombre, setNombre] = useState(nombreEmpresa);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");

  useEffect(() => {
    setNombre(nombreEmpresa);
  }, [nombreEmpresa]);

  const handleGuardar = async () => {
    if (guardando) return;

    try {
      setGuardando(true);
      setErrorDetalle("");
      await actualizarNombreEmpresa(nombre);
      setMensaje("Nombre actualizado en todo el sistema.");
      window.setTimeout(() => setMensaje(""), 2500);
    } catch (error) {
      console.error("No se pudo guardar la empresa:", error);
      setMensaje("No se pudo guardar el nombre.");
      setErrorDetalle(String(error?.code || error?.message || "Error desconocido"));
      window.setTimeout(() => setMensaje(""), 2500);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="cfg-pos-wrap">
      <div className="cfg-pos-page-head">
        <h2>Empresa</h2>
        <p>El nombre configurado aqui se refleja en navbar, POS, tickets y PDFs.</p>
      </div>

      <div className="cfg-pos-card cfg-empresa-card">
        <div className="cfg-ticket-block cfg-ticket-block-wide">
          <h4>Nombre del negocio</h4>
          <label htmlFor="empresa-nombre">Nombre visible del sistema</label>
          <input
            id="empresa-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. LuisITRepair"
            maxLength={80}
          />

          <div className="cfg-empresa-preview">
            <strong>Vista previa:</strong> {String(nombre || "").trim() || nombreEmpresa}
          </div>

          <button
            type="button"
            className="cfg-ticket-test-btn"
            onClick={handleGuardar}
            disabled={guardando}
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>

          {mensaje ? <small className="cfg-pos-saved">{mensaje}</small> : null}
          {errorDetalle ? <small className="cfg-pos-help">Detalle: {errorDetalle}</small> : null}
        </div>
      </div>
    </section>
  );
}
