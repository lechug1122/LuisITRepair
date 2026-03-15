# hoja_service-app

Aplicacion de taller/servicio tecnico construida con React + Vite + Firebase.
El frontend principal vive en `src/`, el backend activo de Cloud Functions vive en
`functions/`, y hay artefactos legacy/aislados dentro del repo.

## Scripts principales

- `npm run dev`: levanta Vite en desarrollo.
- `npm run build`: compila el frontend para produccion.
- `npm run lint`: ejecuta ESLint sobre el frontend principal.
- `npm run preview`: sirve el build localmente.

## Estructura rapida

- `src/`: frontend principal.
- `functions/`: Cloud Functions TypeScript activas para proxys/API.
- `dataconnect/`: esquema y ejemplos de Firebase Data Connect.
- `public/`: archivos estaticos publicados por Vite/Firebase Hosting.
- `docs/`: documentacion operativa y auditorias del proyecto.
- `luisit_repair/`: subproyecto legacy separado del despliegue actual.

## Documentacion agregada

- `docs/INVENTARIO_ARCHIVOS.md`: que hace cada archivo mantenido a mano.
- `docs/AUDITORIA_CODIGO.md`: hallazgos de codigo inactivo, artefactos legacy y deuda tecnica detectada.

## Nota de mantenimiento

El `lint` raiz ahora ignora codigo generado y subproyectos externos al frontend principal
(`functions/**`, `luisit_repair/**`, `src/dataconnect-generated/**`) para que los reportes
apunten al codigo que realmente se mantiene desde esta app.
