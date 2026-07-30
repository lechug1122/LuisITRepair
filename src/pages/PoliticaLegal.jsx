import { Link, useNavigate } from "react-router-dom";
import "../css/legal.css";

function LegalLayout({ title, children }) {
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  return (
    <main className="legal-page">
      <article className="legal-card">
        <div className="legal-header-actions">
          <button type="button" className="legal-back" onClick={goBack}>← Regresar</button>
          <Link className="legal-brand" to="/">CajaLibre</Link>
        </div>
        <p className="legal-updated">Última actualización: 26 de julio de 2026</p>
        <h1>{title}</h1>
        {children}
        <nav className="legal-links" aria-label="Información legal">
          <Link to="/privacidad">Privacidad</Link>
          <Link to="/cookies">Cookies</Link>
          <a href="mailto:cajalibre.puntodeventa@gmail.com">Contacto</a>
          <button type="button" onClick={() => window.dispatchEvent(new Event("cajalibre:cookie-settings"))}>
            Cambiar preferencias
          </button>
        </nav>
      </article>
    </main>
  );
}

export function PoliticaPrivacidad() {
  return (
    <LegalLayout title="Política de privacidad">
      <p>CajaLibre es una plataforma web de punto de venta y administración para pequeños negocios. Esta política explica qué información tratamos, con qué finalidad y qué opciones tienes.</p>
      <h2>1. Responsable y contacto</h2>
      <p>El responsable del sitio CajaLibre puede ser contactado en <a href="mailto:cajalibre.puntodeventa@gmail.com">cajalibre.puntodeventa@gmail.com</a>. Para ejercer derechos de acceso, rectificación, cancelación, oposición o solicitar información sobre tus datos, escribe a ese correo.</p>
      <h2>2. Información que podemos tratar</h2>
      <ul>
        <li>Datos de cuenta y contacto, como nombre, correo y datos del negocio.</li>
        <li>Información operativa que el usuario registra para utilizar el sistema.</li>
        <li>Datos técnicos, como dirección IP, navegador, dispositivo, registros de seguridad y actividad.</li>
        <li>Preferencias de cookies y, con autorización, información publicitaria y de medición.</li>
      </ul>
      <h2>3. Finalidades</h2>
      <p>Utilizamos la información para prestar y proteger el servicio, autenticar usuarios, guardar configuraciones, atender soporte, prevenir abuso, mejorar la plataforma, cumplir obligaciones aplicables y, cuando exista consentimiento, mostrar y medir publicidad.</p>
      <h2>4. Google AdSense y terceros</h2>
      <p>Este sitio utiliza Google AdSense. Google y otros proveedores pueden colocar o leer cookies, usar balizas web, direcciones IP u otros identificadores para mostrar, limitar y medir anuncios. Google puede utilizar cookies publicitarias para mostrar anuncios basados en visitas anteriores a este u otros sitios.</p>
      <p>Puedes administrar la personalización en <a href="https://adssettings.google.com/" target="_blank" rel="noreferrer">Configuración de anuncios de Google</a> y conocer <a href="https://policies.google.com/technologies/partner-sites?hl=es" target="_blank" rel="noreferrer">cómo usa Google los datos en sitios de sus socios</a>.</p>
      <h2>5. Conservación y transferencias</h2>
      <p>Conservamos la información durante el tiempo necesario para prestar el servicio, protegerlo y cumplir obligaciones. Algunos proveedores tecnológicos pueden procesar datos fuera de México bajo sus propias salvaguardas contractuales y legales.</p>
      <h2>6. Seguridad y menores</h2>
      <p>Aplicamos medidas razonables para proteger la información. Ningún sistema es totalmente infalible. El servicio está dirigido a negocios y personas con capacidad legal y no busca recopilar deliberadamente datos de menores.</p>
      <h2>7. Cambios</h2>
      <p>Podemos actualizar esta política por cambios legales, técnicos o del servicio. Publicaremos la fecha de actualización en esta página.</p>
    </LegalLayout>
  );
}

export function PoliticaCookies() {
  return (
    <LegalLayout title="Política de cookies">
      <p>Las cookies y tecnologías similares permiten recordar información en el navegador. Algunas son necesarias para prestar CajaLibre; otras se utilizan únicamente con autorización.</p>
      <h2>Categorías utilizadas</h2>
      <ul>
        <li><strong>Necesarias:</strong> inicio de sesión, seguridad, preferencias de interfaz y funcionamiento del sistema.</li>
        <li><strong>Publicidad y medición:</strong> Google AdSense puede usar cookies o identificadores para servir, limitar y medir anuncios, detectar fraude y, si autorizas, personalizarlos.</li>
      </ul>
      <h2>Proveedores</h2>
      <p>Google puede usar dominios como google.com o doubleclick.net para tecnologías publicitarias. Consulta la <a href="https://policies.google.com/technologies/cookies?hl=es" target="_blank" rel="noreferrer">información de cookies de Google</a> y sus <a href="https://adssettings.google.com/" target="_blank" rel="noreferrer">controles de anuncios</a>.</p>
      <h2>Administrar el consentimiento</h2>
      <p>Puedes aceptar o rechazar las cookies opcionales desde el aviso y cambiar tu decisión posteriormente. Rechazarlas no impide el funcionamiento básico, aunque Google podría mostrar anuncios limitados o no personalizados donde corresponda.</p>
      <h2>Navegador</h2>
      <p>Los navegadores permiten borrar o bloquear cookies. Si bloqueas las necesarias, algunas funciones de autenticación o preferencias podrían dejar de funcionar correctamente.</p>
    </LegalLayout>
  );
}
