# SIGFAR v1.2 — Módulos administrativo y financiero

Esta entrega es una **actualización completa** de SIGFAR v1.1: incluye los módulos anteriores sin cambiar Oracle XE, junto con las rutas nuevas para efectivo, planillas y activos fijos.

## Lo añadido

- `src/routes/efectivo.routes.js`: movimientos, consulta individual y flujo neto consolidado.
- `src/routes/planillas.routes.js`: registro mensual, consulta, totales y corrección auditada.
- `src/routes/activos.routes.js`: alta, consulta, valoración y cambio de estado.
- `src/services/administracion.js`: operaciones escritas dentro de transacciones y auditoría.
- `src/utils/administracion.js`: validación de importes, fechas, períodos, permisos y filtros seguros.
- `tests/administracion.test.js`: 10 pruebas nuevas; suite completa 29 pruebas.
- `ejemplos/prueba-administracion-lectura.ps1`: prueba de consultas sin modificar datos.
- `ejemplos/prueba-administracion-cambios.ps1`: prueba de escritura solo con `-ConfirmarCambios`.
- `ejemplos/verificar-administracion-dbeaver.sql`: verificaciones dinámicas de solo lectura.

## Aplicación de la actualización

**No ejecutes SQL de creación ni de carga de datos.** Detén Node.js, haz copia del proyecto actual y copia los archivos de este ZIP sobre tu carpeta anterior, **sin reemplazar `.env`**. Instala dependencias con `npm install` solo si hacen falta.

```powershell
npm run check:syntax
npm test
npm run db:check
npm run dev
.\ejemplos\prueba-administracion-lectura.ps1
```

Los importes JSON de entrada deben ser cadenas como `"125.50"`. El API devuelve números del tipo `NUMBER(14,2)`.

**Validación efectuada:** sintaxis de 32 archivos JavaScript; 29/29 pruebas unitarias; verificación del ZIP. La integración real HTTP/Oracle debe probarse en tu computadora, ya conectada a `XEPDB1`.

Consulta `LEEME.md`, sección **Iteración 3**, para la lista completa de rutas, permisos, filtros, pruebas opcionales y ejemplos.
