import React from "react";
import "../css/updateModal.css";

function UpdateModal({ onClose }) {
  return (
    <div className="update-overlay">
      <div className="update-modal">

        <h2>🚀 Nueva Actualización Disponible</h2>

        <p className="update-description">
          Hemos mejorado el sistema para brindarte mayor seguridad,
          control y rendimiento.
        </p>

        <div className="update-section">
          <h4>✨ Nuevas Funciones</h4>
          <ul className="update-list">
            <li>Monitoreo de empleados activos en tiempo real</li>
            <li>Control de acceso basado en roles</li>
            <li>Bloqueo automático de usuarios inactivos</li>
            <li>Panel de estadísticas optimizado</li>
            <li>Control de sesión (en línea / fuera de línea)</li>
            <li>Creación y gestión de usuarios por el administrador</li>
          </ul>
        </div>

        <div className="update-support">
          <p>
            🛠 Si detectas algún error repórtalo a:
          </p>
          <strong>luisitrepairhuatusco@gmail.com</strong>
        </div>

        <button className="update-btn" onClick={onClose}>
          Entendido
        </button>

      </div>
    </div>
  );
}

export default UpdateModal;