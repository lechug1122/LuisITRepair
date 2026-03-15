# Auditoria de codigo

Auditoria estatica hecha el 2026-03-11 sobre el frontend principal.

## Metodo

- Se reviso el grafo de imports dentro de `src/`.
- Se corrio `npm run lint` despues de acotar ESLint al frontend principal.
- Se marcaron por separado archivos activos, aislados, inactivos y generados.

## Cambio aplicado a la auditoria

- `eslint.config.js` ahora ignora `functions/**`, `luisit_repair/**` y `src/dataconnect-generated/**`.
- Motivo: esos directorios mezclaban codigo compilado, generado o de otro subproyecto y hacian ruido en el lint raiz.

## Eliminado en esta pasada

- `README.mdgit`
- `public/index.html`
- `public/vite.svg`
- `public/plantillas/plantilla.xlsx`
- `src/assets/react.svg`
- `src/index.css`
- `src/js/services/plantilla_boleta.js`
- `src/pages/ventas.jsx`

## Codigo/archivos sin uso claro

### Inactivos dentro del frontend principal

- `src/js/services/google_image_search.js`: cliente del rewrite `/api/google-image/search` sin llamadas desde el frontend actual.
- `src/initializer/config.js`: helper local de `appConfig` sin consumidores detectados. No lo borre porque el archivo ya tenia cambios locales.

### Artefactos aislados o legacy fuera del flujo principal

- `functions/src/genkit-sample.ts`: ejemplo de Genkit sin enlace al frontend ni a `firebase.json`.
- `luisit_repair/**`: subproyecto legacy de Functions que no esta declarado como `source` en `firebase.json`.

## Exportaciones sin consumidores detectados

No rompen runtime por si solas, pero ensucian la API interna y hacen mas dificil saber que sirve de verdad.

- `src/js/services/comparador_marketplaces.js`
  - `buildMercadoLibreSearchLink`
  - `buildGoogleShoppingSearchLink`
  - `buildGoogleSearchLink`
  - `buscarComparativaPrecios`
  - `calcularComparativa`
- `src/js/services/configure_servicios.js`
  - `obtenerServiciosConfig`
- `src/js/services/egresos_firestore.js`
  - `copiarEgresosAlCorte`
- `src/js/services/estado_config.js`
  - `getEstadosOrdenados`
- `src/js/services/facturacion_config.js`
  - `DEFAULT_FACTURACION_CONFIG`
- `src/js/services/home.js`
  - `obtenerTodosServicios`
- `src/js/services/moneda_config.js`
  - `obtenerMoneda`
- `src/js/services/servicios_firestore.js`
  - `guardarOActualizarPorFolio`
- `src/js/services/ticket_config.js`
  - `DEFAULT_TICKET_CONFIG`
- `src/js/utils/status_map.js`
  - `statusInfo2`

## Problemas reales detectados por lint

Estos no son "codigo muerto", pero si deuda tecnica activa.

### Errores

- `src/pages/ConfiguracionPOS.jsx`: usa `aplicaIVA` sin definir.
- `src/pages/productos.jsx`: llama `cargarProductos()` antes de declarar la funcion.
- `src/pages/Configuracion.jsx`: inicializa estado con `Date.now()` dentro del render.
- `src/pages/ConfiguracionApariencia.jsx`: hace `setState` sincronico dentro de `useEffect`.
- `src/pages/Hoja_service.jsx`: hace `setState` sincronico dentro de `useEffect` en dos puntos.
- `src/pages/status_detalle.jsx`: hace `setState` sincronico dentro de `useEffect`.
- `src/components/POSMobileScanner.jsx`: hace `setState` sincronico dentro de `useEffect`.
- `src/components/modal_egresos.jsx`: hace `setState` sincronico dentro de `useEffect`.
- `src/js/services/home.js`: tiene `Boolean(...)` redundante.
- `src/pages/POS.jsx`: tiene `Boolean(...)` redundante.
- `src/pages/home.jsx`: tiene `Boolean(...)` redundante.

### Warnings

- `src/components/paneladminservicio.jsx`: dependencias faltantes en `useEffect`.
- `src/pages/POS.jsx`: dependencias faltantes y cleanup fragil con `ref.current`.
- `src/pages/servicio_detalle.jsx`: dependencia faltante en `useEffect`.

## Priorizacion recomendada

1. Decidir si `src/initializer/config.js` y `src/js/services/google_image_search.js` se archivan o se integran; hoy siguen sin consumidores.
2. Resolver los errores actuales de lint antes de seguir agregando funcionalidad.
3. Reducir exportaciones no usadas para que la API interna del proyecto sea mas clara.
