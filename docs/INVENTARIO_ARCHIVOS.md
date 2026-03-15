# Inventario de archivos

Inventario manual del repo con foco en archivos mantenidos a mano al 2026-03-11.

## Criterio

- `activo`: participa en el flujo actual de build, runtime o despliegue.
- `aislado`: existe en el repo pero no forma parte del flujo principal.
- `inactivo`: no tiene referencias detectadas desde la app principal.
- `generado`: salida automatica; no conviene editarlo manualmente.

## Raiz del repo

- `package.json` `[activo]`: scripts del frontend principal y dependencias React/Vite/Firebase.
- `package-lock.json` `[activo]`: lockfile del frontend principal.
- `vite.config.js` `[activo]`: configuracion Vite y proxy local para `/api/ml/search`.
- `eslint.config.js` `[activo]`: reglas de lint del frontend principal.
- `firebase.json` `[activo]`: hosting de `dist`, rewrites a Cloud Functions y build predeploy.
- `firestore.rules` `[activo]`: reglas de seguridad Firestore.
- `firestore.indexes.json` `[activo]`: indices declarativos Firestore.
- `index.html` `[activo]`: shell HTML principal de Vite.
- `README.md` `[activo]`: resumen operativo del repo y enlaces a esta documentacion.

## Carpeta `public/`

- Sin artefactos legacy pendientes despues de la limpieza actual.

## Carpeta `docs/`

- `docs/Cuestionario_Opinion_Usuario_Test_Sistema.docx` `[aislado]`: documento externo de evaluacion; no es parte del runtime.
- `docs/INVENTARIO_ARCHIVOS.md` `[activo]`: inventario de archivos del repo.
- `docs/AUDITORIA_CODIGO.md` `[activo]`: auditoria de codigo inactivo y deuda tecnica.

## Carpeta `dataconnect/`

- `dataconnect/dataconnect.yaml` `[aislado]`: configuracion base de Firebase Data Connect.
- `dataconnect/seed_data.gql` `[aislado]`: datos de semilla para Data Connect.
- `dataconnect/schema/schema.gql` `[aislado]`: esquema GraphQL/connector de Data Connect.
- `dataconnect/example/connector.yaml` `[aislado]`: ejemplo de generacion del SDK.
- `dataconnect/example/queries.gql` `[aislado]`: queries de ejemplo para Data Connect.
- `src/dataconnect-generated/**` `[generado]`: SDK generado localmente y consumido como paquete `@dataconnect/generated`.

## Carpeta `functions/`

- `functions/package.json` `[activo]`: toolchain y scripts del backend TypeScript de Cloud Functions.
- `functions/package-lock.json` `[activo]`: lockfile del backend `functions/`.
- `functions/tsconfig.json` `[activo]`: compilacion TypeScript principal.
- `functions/tsconfig.dev.json` `[activo]`: variante de compilacion para desarrollo.
- `functions/src/index.ts` `[activo]`: Cloud Functions publicas `mlSearch` y `googleImageSearch`.
- `functions/src/genkit-sample.ts` `[aislado]`: ejemplo de Genkit/Gemini sin integracion con el frontend actual.
- `functions/lib/**` `[generado]`: JavaScript compilado desde `functions/src`.

## Carpeta `luisit_repair/`

- `luisit_repair/package.json` `[aislado]`: subproyecto legacy de Firebase Functions separado del deploy actual.
- `luisit_repair/package-lock.json` `[aislado]`: lockfile del subproyecto legacy.
- `luisit_repair/index.js` `[aislado]`: scaffold base de Functions sin endpoints reales.

## Frontend `src/`

### Nucleo

- `src/main.jsx` `[activo]`: bootstrap de React, tema/apariencia y titulo del documento.
- `src/App.jsx` `[activo]`: router principal, rutas publicas, privadas y permisos.

### Assets y datos locales

- `src/assets/logo.png` `[activo]`: logo usado en login, tickets, PDFs y configuracion.
- `src/assets/404_not_found.png` `[activo]`: ilustracion usada por la pagina 404.
- `src/csv/mindfactory_done.csv` `[activo]`: dataset auxiliar consumido por `src/pages/Hoja_service.jsx`.
- `src/csv/mindfactory_updated.csv` `[activo]`: dataset auxiliar consumido por `src/pages/Hoja_service.jsx`.

### Inicializacion

- `src/initializer/firebase.js` `[activo]`: inicializacion compartida de Firebase Auth/Firestore.
- `src/initializer/config.js` `[inactivo]`: helper de `localStorage` para `appConfig`; no tiene consumidores detectados.

### Layout

- `src/layout/Mainlayout.jsx` `[activo]`: layout autenticado principal con navbar, notificaciones y presencia.

### Componentes

- `src/components/Icon.jsx` `[activo]`: wrapper de iconos usado por el panel general de configuracion.
- `src/components/Layout.jsx` `[activo]`: layout lateral heredado, usado por POS/productos/reportes.
- `src/components/modal_apertura_caja.jsx` `[activo]`: modal para apertura de caja en POS.
- `src/components/modal_comparador_precios.jsx` `[activo]`: modal de comparador con sugerencia automatica y busqueda manual.
- `src/components/modal_egresos.jsx` `[activo]`: modal para registrar egresos en reportes/corte.
- `src/components/modal_pago.jsx` `[activo]`: modal de cobro para el POS.
- `src/components/modal_selector_producto.jsx` `[activo]`: selector modal de productos para POS.
- `src/components/modal_selector_servicio.jsx` `[activo]`: selector modal de servicios listos para cobrar.
- `src/components/Navbar.jsx` `[activo]`: barra superior del layout autenticado.
- `src/components/PageLoader.jsx` `[activo]`: loader reutilizable para pantallas con carga.
- `src/components/paneladminservicio.jsx` `[activo]`: panel administrativo incrustado en tickets/servicios.
- `src/components/PermissionRoute.jsx` `[activo]`: guard de permisos por ruta.
- `src/components/POSMobileScanner.jsx` `[activo]`: scanner movil con camara para POS.
- `src/components/print_label.jsx` `[activo]`: impresion de etiquetas/labels.
- `src/components/print_ticket_venta.jsx` `[activo]`: plantilla HTML/impresion de ticket de venta.
- `src/components/ProtectedRoute.jsx` `[activo]`: guard de autenticacion.
- `src/components/UpdateModal.jsx` `[activo]`: modal de actualizacion/version dentro de configuracion.

### Hooks

- `src/hooks/useAutorizacionActual.js` `[activo]`: estado del usuario autenticado y su matriz de permisos.
- `src/hooks/useEmpresaConfig.js` `[activo]`: suscripcion/config cache de identidad de empresa.
- `src/hooks/useMonedaConfig.js` `[activo]`: suscripcion de moneda y helpers de formateo.
- `src/hooks/useNotificacionesConfig.js` `[activo]`: carga/suscripcion de notificaciones configurables.
- `src/hooks/usePresenciaEmpleado.js` `[activo]`: presencia/heartbeat de empleados conectados.
- `src/hooks/useServiciosConfig.js` `[activo]`: carga/suscripcion de configuracion de servicios.

### Modelos y utilidades

- `src/js/models_equipos.js` `[activo]`: catalogo/modelos auxiliares para hoja de servicio.
- `src/js/utils_folio.js` `[activo]`: helpers para folios e indices relacionados.
- `src/js/utils/status_map.js` `[activo]`: metadata visual y de pasos para estados del servicio.

### Servicios

- `src/js/services/apariencia_config.js` `[activo]`: tema, densidad, contraste y preferencias visuales.
- `src/js/services/autorizacion.js` `[activo]`: lectura de autorizacion actual desde Firebase.
- `src/js/services/clientes_firestore.js` `[activo]`: CRUD y consultas de clientes.
- `src/js/services/comparador_marketplaces.js` `[activo]`: comparador de mercado y sugerencias de precio; hoy se usa sobre todo la parte local/simulada.
- `src/js/services/configure_empresa.js` `[activo]`: configuracion de empresa, branding y titulo.
- `src/js/services/configure_notificaciones.js` `[activo]`: configuracion persistente de notificaciones.
- `src/js/services/configure_servicios.js` `[activo]`: configuracion persistente de catalogo/flujo de servicios.
- `src/js/services/corte_caja_firestore.js` `[activo]`: persistencia y consultas de cortes de caja.
- `src/js/services/egresos_firestore.js` `[activo]`: persistencia de egresos diarios y relacion con cortes.
- `src/js/services/estado_config.js` `[activo]`: normalizacion/configuracion del catalogo de estados.
- `src/js/services/facturacion_config.js` `[activo]`: configuracion de facturacion para POS.
- `src/js/services/google_image_search.js` `[inactivo]`: wrapper del endpoint `/api/google-image/search`; no tiene consumidores en el frontend.
- `src/js/services/home.js` `[activo]`: KPIs y notificaciones agregadas para dashboard.
- `src/js/services/home_charts_firestore.js` `[activo]`: series/datos para graficas del home.
- `src/js/services/moneda_config.js` `[activo]`: configuracion de moneda, cache y formateo monetario.
- `src/js/services/pdf_corte_caja.js` `[activo]`: generacion de PDF para corte de caja.
- `src/js/services/pdf_hoja_servicio.js` `[activo]`: generacion de PDF para hoja de servicio.
- `src/js/services/permisos.js` `[activo]`: catalogo/base de permisos.
- `src/js/services/POS_firebase.js` `[activo]`: operaciones Firestore del punto de venta y productos.
- `src/js/services/pos_sync_firestore.js` `[activo]`: sincronizacion de escaneos entre POS movil y POS principal.
- `src/js/services/realtime_notifications.js` `[activo]`: feed y listeners de notificaciones en tiempo real.
- `src/js/services/servicios_firestore.js` `[activo]`: CRUD principal de servicios, folios y boletas.
- `src/js/services/ticket_config.js` `[activo]`: configuracion de ticket impreso.

### Paginas

- `src/pages/ClienteDetalle.jsx` `[activo]`: detalle de cliente, historial y acciones relacionadas.
- `src/pages/Clientes.jsx` `[activo]`: listado y gestion basica de clientes.
- `src/pages/Configuracion.jsx` `[activo]`: contenedor de configuracion y tablero de resumen.
- `src/pages/ConfiguracionApariencia.jsx` `[activo]`: UI para tema, contraste y preferencias visuales.
- `src/pages/ConfiguracionEmpresa.jsx` `[activo]`: identidad de empresa y datos visibles de negocio.
- `src/pages/ConfiguracionMetodosPago.jsx` `[activo]`: seleccion de moneda/base para cobros y tickets.
- `src/pages/ConfiguracionNotificaciones.jsx` `[activo]`: toggles/configuracion de notificaciones globales.
- `src/pages/ConfiguracionPOS.jsx` `[activo]`: opciones de ticket, facturacion y POS.
- `src/pages/ConfiguracionServicios.jsx` `[activo]`: gestion de configuracion del modulo de servicios.
- `src/pages/empleados.jsx` `[activo]`: administracion de empleados y permisos.
- `src/pages/Hoja_service.jsx` `[activo]`: alta/edicion de hoja de servicio.
- `src/pages/home.jsx` `[activo]`: dashboard principal con KPIs y graficas.
- `src/pages/login.jsx` `[activo]`: pantalla de acceso/autenticacion.
- `src/pages/NotFound.jsx` `[activo]`: pagina 404.
- `src/pages/panelgeneralCon.jsx` `[activo]`: panel general dentro de configuracion.
- `src/pages/POS.jsx` `[activo]`: flujo completo del punto de venta.
- `src/pages/productos.jsx` `[activo]`: catalogo y gestion de inventario/productos.
- `src/pages/reportes.jsx` `[activo]`: reportes, cortes, egresos y vistas analiticas.
- `src/pages/servicio_detalle.jsx` `[activo]`: detalle profundo y seguimiento de un servicio.
- `src/pages/servicios_pendientes.jsx` `[activo]`: bandeja/listado de servicios.
- `src/pages/status.jsx` `[activo]`: consulta publica de estado.
- `src/pages/status_detalle.jsx` `[activo]`: detalle publico por folio.
- `src/pages/status_scan.jsx` `[activo]`: escaneo publico para consultar servicios.
- `src/pages/tickets.jsx` `[activo]`: vista de ticket/administracion de servicio con impresion.

### Estilos

- `src/css/clientes.css` `[activo]`: estilos de `Clientes.jsx` y `ClienteDetalle.jsx`.
- `src/css/configuracion.css` `[activo]`: estilos globales del modulo de configuracion.
- `src/css/empleados.css` `[activo]`: estilos de la pagina de empleados.
- `src/css/hoja_service.css` `[activo]`: estilos de la hoja de servicio.
- `src/css/home.css` `[activo]`: estilos del dashboard principal.
- `src/css/login.scss` `[activo]`: estilos del login.
- `src/css/modal_comparador_precios.css` `[activo]`: estilos del comparador de precios.
- `src/css/modal_egresos.css` `[activo]`: estilos del modal de egresos.
- `src/css/modal_pago.css` `[activo]`: estilos compartidos de cobro/apertura de caja.
- `src/css/modal_selector_producto.css` `[activo]`: estilos del selector de productos.
- `src/css/modal_selector_servicio.css` `[activo]`: estilos del selector de servicios.
- `src/css/notfound.css` `[activo]`: estilos de la pagina 404.
- `src/css/notificaciones_globales.css` `[activo]`: estilos del centro de notificaciones del layout principal.
- `src/css/page_loader.css` `[activo]`: estilos del loader reutilizable.
- `src/css/pos.css` `[activo]`: estilos compartidos del layout lateral y POS.
- `src/css/pos_mobile_scanner.css` `[activo]`: estilos del scanner movil POS.
- `src/css/productos.css` `[activo]`: estilos de productos.
- `src/css/reportes.css` `[activo]`: estilos de reportes y corte de caja.
- `src/css/servicio_detalle.css` `[activo]`: estilos del detalle de servicio.
- `src/css/servicios.css` `[activo]`: estilos del listado de servicios.
- `src/css/status.css` `[activo]`: estilos de status publico y detalle.
- `src/css/status_scan.css` `[activo]`: estilos del escaner publico.
- `src/css/ticket.css` `[activo]`: estilos de tickets/impresion.
- `src/css/updateModal.css` `[activo]`: estilos del modal de actualizacion.
