import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { applyAparienciaFromStorage } from "./js/services/apariencia_config";
import { auth } from "./initializer/firebase";

applyAparienciaFromStorage();
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
