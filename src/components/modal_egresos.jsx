import React, { useState, useEffect } from "react";
import "../css/modal_egresos.css";

const TIPOS_EGRESOS = [
  { id: "factura", label: "Factura", emoji: "🧾" },
  { id: "boleta_venta", label: "Boleta de venta", emoji: "🛒" },
  { id: "nota_credito", label: "Nota de crédito", emoji: "➕" },
  { id: "nota_debito", label: "Nota de débito", emoji: "➖" },
  { id: "otro", label: "Otro", emoji: "📝" },
];

export default function ModalEgresos({
  mostrar,
  onClose,
  egresos = [],
  onAgregarEgreso,
  onEliminarEgreso,
  onEditarEgreso,
  totalEgresos = 0,
}) {
  const [tipoSeleccionado, setTipoSeleccionado] = useState("factura");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [egresoEditable, setEgresoEditable] = useState(null);

  const limpiarFormulario = () => {
    setMonto("");
    setDescripcion("");
    setEgresoEditable(null);
  };

  const handleAgregar = () => {
    const montoNum = Number(String(monto).replace(/,/g, ""));
    if (!montoNum || montoNum <= 0) {
      alert("Ingresa un monto válido mayor a 0");
      return;
    }
    if (!descripcion.trim()) {
      alert("Ingresa una descripción");
      return;
    }

    if (egresoEditable) {
      // Modo edición
      onEditarEgreso(egresoEditable.id, {
        tipo: tipoSeleccionado,
        monto: montoNum,
        descripcion: descripcion.trim(),
      });
      setEgresoEditable(null);
    } else {
      // Modo agregar
      onAgregarEgreso({
        tipo: tipoSeleccionado,
        monto: montoNum,
        descripcion: descripcion.trim(),
      });
    }

    limpiarFormulario();
    setTipoSeleccionado("factura");
  };

  const handleEditar = (egreso) => {
    setEgresoEditable(egreso);
    setTipoSeleccionado(egreso.tipo);
    setMonto(String(egreso.monto));
    setDescripcion(egreso.descripcion);
  };

  const handleCancelarEdicion = () => {
    limpiarFormulario();
    setTipoSeleccionado("factura");
  };

  useEffect(() => {
    if (!mostrar) {
      limpiarFormulario();
      setTipoSeleccionado("factura");
    }
  }, [mostrar]);

  if (!mostrar) return null;

  return (
    <div className="modal-overlay-egresos">
      <div className="modal-egresos-container">
        <div className="modal-egresos-header">
          <h2>📊 Registrar Egresos</h2>
          <button className="btn-cerrar" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="egresos-contenido">
          {/* Lado izquierdo - Formulario */}
          <div className="egresos-form-side">
            <div className="form-seccion">
              <h3>Nuevo egreso</h3>

              {/* Seleccionar tipo */}
              <div className="tipos-selector">
                {TIPOS_EGRESOS.map((tipo) => (
                  <button
                    key={tipo.id}
                    className={`tipo-btn ${tipoSeleccionado === tipo.id ? "activo" : ""}`}
                    onClick={() => setTipoSeleccionado(tipo.id)}
                    title={tipo.label}
                  >
                    <span className="emoji">{tipo.emoji}</span>
                    <span className="label">{tipo.label}</span>
                  </button>
                ))}
              </div>

              {/* Monto */}
              <div className="form-group">
                <label>Monto $</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="input-monto"
                />
              </div>

              {/* Descripción */}
              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  placeholder="Detalle del egreso..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="input-descripcion"
                  rows="3"
                />
              </div>

              {/* Botones de acción */}
              <div className="form-acciones">
                <button
                  className="btn-agregar"
                  onClick={handleAgregar}
                  disabled={!monto.trim() || !descripcion.trim()}
                >
                  {egresoEditable ? "💾 Actualizar" : "➕ Agregar egreso"}
                </button>
                {egresoEditable && (
                  <button className="btn-cancelar" onClick={handleCancelarEdicion}>
                    ✕ Cancelar edición
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Lado derecho - Listado y totales */}
          <div className="egresos-list-side">
            <div className="egresos-total">
              <div className="total-label">Total egresos</div>
              <div className="total-monto">${totalEgresos.toFixed(2)}</div>
            </div>

            <div className="egresos-listado">
              <h3>Registrados hoy</h3>
              {egresos.length === 0 ? (
                <p className="sin-egresos">📭 Sin egresos registrados</p>
              ) : (
                <div className="egresos-items">
                  {egresos.map((egreso) => {
                    const tipoObj = TIPOS_EGRESOS.find((t) => t.id === egreso.tipo);
                    return (
                      <div key={egreso.id} className="egreso-item">
                        <div className="egreso-header">
                          <div className="egreso-tipo">
                            <span className="emoji">{tipoObj?.emoji || "📝"}</span>
                            <span className="tipo-label">{tipoObj?.label || egreso.tipo}</span>
                          </div>
                          <div className="egreso-monto">${egreso.monto.toFixed(2)}</div>
                        </div>
                        <div className="egreso-descripcion">{egreso.descripcion}</div>
                        <div className="egreso-acciones">
                          <button
                            className="btn-editar"
                            onClick={() => handleEditar(egreso)}
                            title="Editar"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn-eliminar"
                            onClick={() => onEliminarEgreso(egreso.id)}
                            title="Eliminar"
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-egresos-footer">
          <button className="btn-cerrar-modal" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
