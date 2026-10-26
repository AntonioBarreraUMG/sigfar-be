# SIGFAR — Pruebas funcionales automatizadas (backend v1.4)

Este paquete **NO modifica** el backend. Compara la versión v1.4 y su esquema Oracle XE con los requerimientos; permite probar la API por HTTP con Node.js >=20, sin nuevas dependencias. Compatible con PowerShell y DBeaver.

## Archivos

- `pruebas/estaticas.mjs`: valida estructura SQL y presencia de rutas, autenticación, transacciones y auditoría; **no se conecta a Oracle**.
- `pruebas/funcionales.mjs`: pruebas HTTP reales. Por defecto es **solo lectura**. Admite un modo completo que modifica datos de prueba y comprueba los procesos de extremo a extremo.
- `MATRIZ_CUMPLIMIENTO.md`: evaluación del enunciado y requisitos RF/RNF.
- `resultados/resultado-estatico.json`: resultado de la revisión estática efectuada para el código v1.4.

## A. Ejecutar las pruebas existentes del backend

Desde tu carpeta `SIGFAR_Backend`:

```powershell
npm test
npm run check:syntax
npm run db:check
```

## B. Ejecutar el conjunto de solo lectura (seguro para tu base actual)

1. Arranca tu backend v1.4, por ejemplo con `npm run dev`.
2. Abre PowerShell en la carpeta raíz de este paquete.
3. Configura, si lo necesitas, la URL y la contraseña de los **usuarios ficticios** de prueba:

```powershell
$env:SIGFAR_QA_URL = 'http://127.0.0.1:3000/api/v1'
$env:SIGFAR_QA_CLAVE = 'Demo2026!'
node .\pruebas\funcionales.mjs
```

Este modo prueba salud, autenticación (incluyendo denegaciones), roles, consultas de sucursales/medicamentos/inventario, transferencias, efectivo, planillas, activos, solicitudes, disponibilidad, auditoría, entradas inválidas, segregación por sucursal y rendimiento de una consulta local (objetivo 3000 ms).

Los resultados se guardan en `resultados/resultado-funcional.json` y `resultados/resultado-funcional.md`. **El valor de retorno será 1 si alguna prueba falla.**

Requisitos del modo lectura: que los cuatro usuarios ficticios sigan activos, que tengan las mismas contraseñas conocidas y que existan datos de demostración. Si has cambiado usuarios, configura estas variables:

```powershell
$env:SIGFAR_QA_ADMIN = 'admin@sigfar.test'
$env:SIGFAR_QA_ENCARGADO_1 = 'guatemala@sigfar.test'
$env:SIGFAR_QA_ENCARGADO_2 = 'quetzaltenango@sigfar.test'
$env:SIGFAR_QA_COORD = 'entregas@sigfar.test'
```

## C. Pruebas completas de escritura y conciliación (OBLIGATORIAMENTE en una COPIA QA)

**No ejecutar estas pruebas en el esquema que quieres conservar sin alteraciones.** Las pruebas crean sucursales, medicamentos, movimientos de inventario, transferencias, efectivo, planillas, activos, entregas y eventos de auditoría. Los cambios permanecen en Oracle para permitir su inspección; NO hay operaciones de borrado ni limpieza automática.

Pasos recomendados:

1. En DBeaver crea un **segundo usuario/esquema** de Oracle XE, por ejemplo `SIGFAR_QA`, dentro de `XEPDB1`, con los permisos necesarios para crear y usar sus propias tablas. No compartas aquí la contraseña de ese usuario.
2. Conéctate al nuevo esquema en DBeaver y ejecuta allí los scripts originales `01_esquema.sql` y `02_datos_prueba.sql` **una sola vez**. Nunca ejecutes estos scripts sobre el esquema existente con datos.
3. Realiza una copia de la carpeta del backend v1.4, modifica el `.env` de la copia para usar `DB_USER=SIGFAR_QA`, su contraseña y `PORT=3001` manteniendo `DB_SERVICE=XEPDB1`, e inicia ese backend QA. La conexión debe apuntar al nuevo esquema, no al original.
4. Desde este paquete usa:

```powershell
$env:SIGFAR_QA_URL = 'http://127.0.0.1:3001/api/v1'
$env:SIGFAR_QA_CLAVE = 'Demo2026!'
node .\pruebas\funcionales.mjs --completo --confirmar-escrituras --entorno-qa
```

Para incorporar **dos pruebas adicionales de concurrencia** (doble despacho y doble confirmación):

```powershell
node .\pruebas\funcionales.mjs --completo --confirmar-escrituras --entorno-qa --concurrencia
```

`--entorno-qa` es una declaración explícita del operador, **no verifica automáticamente** qué esquema de Oracle utiliza el servidor. Compruébalo manualmente ANTES de ejecutar las escrituras. No uses los dos comandos de escritura de forma consecutiva si solo deseas una ejecución: cada uno crea nuevos registros.

El script utiliza los encargados de dos sucursales distintas, y crea un medicamento único para evitar depender de los saldos anteriores. Detecta valores duplicados, cambios de estado inválidos, acceso desde otra sucursal, exactitud de importes monetarios y generación de eventos de auditoría. Se recomienda comenzar con un esquema QA recién cargado.

## D. Revisión estática reproducible

La carpeta `pruebas/estaticas.mjs` necesita las rutas al backend y al script DBeaver de creación, a través de variables de entorno (puedes usar rutas absolutas):

```powershell
$env:SIGFAR_QA_BACKEND = 'C:\ruta\SIGFAR_Backend'
$env:SIGFAR_QA_ESQUEMA = 'C:\ruta\SIGFAR_DBeaver_OracleXE\01_esquema.sql'
node .\pruebas\estaticas.mjs
```

Este chequeo es estático: puede confirmar la presencia de código, **no que el endpoint responda correctamente**. Su resultado debe combinarse con las pruebas HTTP completas.

## E. Criterios de aprobación

- Pruebas unitarias del backend: 52/52.
- Revisión estática de esta entrega: 21/21.
- Pruebas funcionales HTTP: **no ejecutadas en el entorno de creación**, deben dar 0 fallidas en tu computadora.
- Pruebas de concurrencia: opcionales, recomendadas en un esquema QA aislado.
- La aprobación del backend **no** significa aprobación completa del enunciado: aún faltan React y despliegue en nube.

**Seguridad:** evita enviar archivos `.env`, contraseñas o JWT de sesión. Comparte solamente los resultados JSON/Markdown, que no incluyen las credenciales.

## F. Conciliación final en DBeaver

Después de ejecutar el modo completo, abre `pruebas/conciliacion-dbeaver.sql` en DBeaver, conectado **al esquema QA**. Los seis contadores de inconsistencias deben ser `0`. El bloque final muestra importes y saldos actuales, no totales fijos del juego inicial. Este archivo es de solo lectura.

**Atención al límite de intentos de login:** el backend v1.4 limita los inicios de sesión a 10 intentos por IP cada 15 minutos. Si vuelves a ejecutar los tests varias veces seguidas, pueden aparecer respuestas HTTP 429 por ese límite. Espera a que se reinicie la ventana y no interpretes ese resultado como un fallo del control de credenciales.
