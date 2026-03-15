import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './index.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { applyAparienciaFromStorage } from "./js/services/apariencia_config";
import { auth } from "./initializer/firebase";
import { readEmpresaConfigCache, syncEmpresaDocumentTitle } from "./js/services/configure_empresa";

// Aplica la apariencia antes del primer render para que el tema impacte todas las rutas.
applyAparienciaFromStorage();
syncEmpresaDocumentTitle(readEmpresaConfigCache());
auth.onAuthStateChanged((user) => {
  applyAparienciaFromStorage(user?.uid || null);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
