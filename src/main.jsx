import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './index.css'

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

// Retira el antiguo service worker publicitario de Moetag en navegadores que lo conservaron.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(
      registrations
        .filter((registration) => {
          const scriptUrl = registration.active?.scriptURL
            || registration.waiting?.scriptURL
            || registration.installing?.scriptURL
            || "";
          return new URL(scriptUrl, window.location.origin).pathname === "/sw.js";
        })
        .map((registration) => registration.unregister()),
    ))
    .catch(() => {
      // La limpieza no debe impedir que la aplicacion inicie.
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
