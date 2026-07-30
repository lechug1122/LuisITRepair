import mascotaCafe from "../assets/mascota-cafe-sin-texto.png";

const DONATION_OPTIONS = [
  {
    key: "paypal",
    title: "PayPal",
    description: "Apoya CajaLibre con una donacion directa desde PayPal.",
    button: "Donar con PayPal",
    url: "https://paypal.me/CajaLibre",
  },
  {
    key: "mercadopago",
    title: "Mercado Pago",
    description: "Apoya CajaLibre con una donacion directa desde Mercado Pago.",
    button: "Donar con Mercado Pago",
    url: "https://link.mercadopago.com.mx/cajalibre",
  },
  {
    key: "transferencia",
    title: "Transferencia bancaria",
    description: "Solicita los datos bancarios directamente por WhatsApp.",
    button: "Solicitar datos por WhatsApp",
    url: "https://wa.me/522731430147?text=Hola%2C%20quiero%20apoyar%20a%20CajaLibre%20mediante%20transferencia%20bancaria.%20%C2%BFMe%20pueden%20compartir%20los%20datos%3F",
  },
];

export default function ConfiguracionDonacion() {
  return (
    <section className="cfg-donation-wrap">
      <div className="cfg-header">
        <h1>Donacion</h1>
        <p>Apoya el desarrollo de CajaLibre sin convertirlo en un servicio de pago.</p>
      </div>

      <div className="cfg-pos-card cfg-donation-hero">
        <div className="cfg-donation-image-panel">
          <img
            src={mascotaCafe}
            alt="Mascota de CajaLibre con cafe"
            className="cfg-donation-image"
          />
        </div>

        <div className="cfg-donation-copy">
          <span className="cfg-sus-model-kicker">CajaLibre gratuito</span>
          <h2>Dale un cafecito al programador para mejorar el sistema</h2>
          <p>
            CajaLibre sigue funcionando gratis. Tu donacion es opcional y ayuda a mantener,
            corregir y mejorar el sistema para todos los negocios que lo usan.
          </p>

          <div className="cfg-donation-actions">
            {DONATION_OPTIONS.map((option) => (
              <a
                key={option.key}
                className={`cfg-donation-btn ${option.key}`}
                href={option.url}
                target="_blank"
                rel="noreferrer"
              >
                {option.button}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="cfg-pos-card cfg-donation-note">
        <strong>Importante</strong>
        <p>
          Donar no activa cobros automaticos, no cambia tu plan y no solicita datos bancarios
          dentro de CajaLibre. Cualquier apoyo es voluntario.
        </p>
      </div>
    </section>
  );
}
