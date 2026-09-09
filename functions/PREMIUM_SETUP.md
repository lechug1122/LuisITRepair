# Mercado Pago: suscripción Premium

La aplicación crea una suscripción mensual de 300 MXN. El cliente autoriza el
cobro en Mercado Pago y el webhook confirma el pago antes de activar Premium en
`negocios/{uid}` (`premium: true`, `planActual` y `cobrosAutomaticos`). Si la
suscripción se cancela o pausa, el webhook revoca Premium. PayPal está pendiente.

## Credenciales

El secreto debe pertenecer a la cuenta vendedora de CajaLibre en Mercado Pago.
El correo del comprador se usa para asociar la autorización de la suscripción.

Guardar las credenciales del vendedor, sin escribirlas en archivos:

```powershell
firebase.cmd functions:secrets:set MERCADOPAGO_ACCESS_TOKEN --project cajalibre-b4ca5
```

## Publicación de las funciones

Desde la raíz del repositorio:

```powershell
npm.cmd --prefix functions run build
firebase.cmd deploy --only functions:crearSuscripcionMercadoPago,functions:consultarSuscripcionMercadoPago,functions:mercadoPagoWebhook --project cajalibre-b4ca5
```

## Webhook (activación automática, sin depender de "Consultar estado")

`mercadoPagoWebhook` recibe notificaciones de Mercado Pago y activa o revoca
Premium automáticamente. Siempre vuelve a consultar el recurso por su ID
contra la API (nunca confía en el cuerpo de la notificación) y valida la
firma HMAC antes de procesar nada.

1. Guardar la clave secreta del webhook, sin escribirla en archivos:
   ```powershell
   firebase.cmd functions:secrets:set MERCADOPAGO_WEBHOOK_SECRET --project cajalibre-b4ca5
   ```
2. Desplegar (ver comando arriba). La URL pública queda en:
   `https://southamerica-east1-cajalibre-b4ca5.cloudfunctions.net/mercadoPagoWebhook`
3. En el panel de Developers de la cuenta **vendedora** (la misma
   aplicación donde sacaste el Access Token), ir a la sección **Webhooks**,
   pegar esa URL y activar los eventos de **Pagos** y **Suscripciones**
   (`subscription_preapproval`). Mercado Pago genera ahí una "Clave secreta":
   esa es la que va en el paso 1 (si ya guardaste el secreto antes de tener
   esta clave, vuelve a correr el comando con el valor correcto y redeploy).
4. Mercado Pago suele ofrecer un botón para **simular una notificación** de
   prueba desde ese mismo panel — úsalo para confirmar que el webhook
   responde 200 antes de esperar a un pago real de prueba.

El frontend puede probarse con `npm.cmd run dev`. La URL de regreso de Mercado
Pago es `https://cajalibre.com.mx/configuracion/pago-premium?proveedor=mercadopago`.
Si el frontend todavía no está publicado, regresar al servidor local después
de autorizar y pulsar «Consultar estado».

## Comprobaciones

- Las suscripciones se guardan en `premium_subscriptions`, sin acceso del cliente.
- Importe fijo del servidor: 300 MXN, cada mes.
- Reutiliza la suscripción pendiente y bloquea intentos ambiguos para evitar duplicados.
- Si un intento falla, revisar en Mercado Pago por `external_reference` antes
   de corregir el registro con Admin SDK. No borrar intentos sin reconciliarlos.
- Ningún parámetro de regreso prueba que hubo un pago por sí solo; la función
   vuelve a consultar `/v1/payments/search` por `external_reference` antes de
  activar Premium, nunca confía en el query string.
- El estado `authorized` por sí solo no concede Premium: se exige además un
  pago con `status == "approved"` asociado a esa suscripción.

## Pendiente antes de producción

Antes de publicar: probar el webhook de principio a fin, reembolsos, PayPal,
pruebas de extremo a extremo y confirmar el tratamiento del IVA.

Referencias:
- https://www.mercadopago.com.mx/developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- https://firebase.google.com/docs/functions/config-env
