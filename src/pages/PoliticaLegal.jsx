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
            Ver aviso de cookies
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
        <li>Preferencias de la interfaz y, en el plan gratuito, información publicitaria y de medición del proveedor de anuncios.</li>
      </ul>
      <h2>3. Finalidades</h2>
      <p>Utilizamos la información para prestar y proteger el servicio, autenticar usuarios, guardar configuraciones, atender soporte, prevenir abuso, mejorar la plataforma, cumplir obligaciones aplicables y, en el plan gratuito, mostrar y medir publicidad.</p>
      <h2>4. Publicidad de terceros</h2>
      <p>El plan gratuito puede mostrar anuncios servidos por Adsterra. El proveedor puede colocar o leer cookies, usar balizas web, direcciones IP u otros identificadores para mostrar, limitar y medir anuncios, así como para detectar fraude. Los anuncios se cargan dentro de un marco aislado en un dominio independiente, sin acceso a tu sesión ni a los datos de tu negocio en CajaLibre.</p>
      <p>Puedes consultar el <a href="https://adsterra.com/privacy-policy/" target="_blank" rel="noreferrer">aviso de privacidad de Adsterra</a>. CajaLibre Premium no muestra anuncios.</p>
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
        <li><strong>Publicidad y medición:</strong> el proveedor de anuncios puede usar cookies o identificadores para servir, limitar y medir anuncios y detectar fraude. Forman parte del plan gratuito.</li>
      </ul>
      <h2>Proveedores</h2>
      <p>La publicidad la sirve Adsterra desde un dominio independiente del sistema. Consulta su <a href="https://adsterra.com/privacy-policy/" target="_blank" rel="noreferrer">aviso de privacidad</a> para conocer las tecnologías que utiliza.</p>
      <h2>Cómo desactivar la publicidad</h2>
      <p>Los anuncios y las cookies que utiliza el proveedor forman parte del plan gratuito y ayudan a sostener el proyecto: no pueden desactivarse por separado dentro del plan gratuito. Para usar CajaLibre sin anuncios y sin esas cookies, puedes activar CajaLibre Premium desde Configuración.</p>
      <p>También puedes bloquear o borrar cookies de terceros desde tu navegador, o instalar un bloqueador de anuncios. En ese caso el espacio publicitario queda vacío y CajaLibre sigue funcionando con normalidad.</p>
      <h2>Navegador</h2>
      <p>Los navegadores permiten borrar o bloquear cookies. Si bloqueas las necesarias, algunas funciones de autenticación o preferencias podrían dejar de funcionar correctamente.</p>
    </LegalLayout>
  );
}
