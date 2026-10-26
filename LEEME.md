# SIGFAR — Backend académico (Node.js + Express + Oracle XE)

**Iteración 5 (v1.4):** autenticación, sucursales, medicamentos, inventario, transferencias, efectivo, planillas, activos fijos y solicitudes/entregas y consulta centralizada de auditoría. Usa **directamente** las 15 tablas ya instaladas y verificadas en DBeaver: no contiene SQL de creación, migraciones ni modificaciones del esquema. Requiere la BD Oracle XE funcionando en **tu propia computadora**, servicio `XEPDB1`.


## Iteración 5: consulta centralizada de auditoría (v1.4)

Además de todas las rutas anteriores, la versión v1.4 incorpora **tres endpoints de solo lectura**, restringidos al rol `ADMIN_CENTRAL`:

- `GET /api/v1/auditoria/registros` — listado paginado (`?limite=20&desde=0`).
- `GET /api/v1/auditoria/registros/:id` — detalle con datos anteriores y posteriores, si existen.
- `GET /api/v1/auditoria/resumen` — total y agrupaciones por entidad y por sucursal.

Filtros: `id_sucursal`, `id_usuario`, `entidad`, `accion`, `id_registro`, `fecha_desde`, `fecha_hasta` (fechas `AAAA-MM-DD` en UTC-06:00). Ejemplo:

```text
GET /api/v1/auditoria/registros?id_sucursal=1&entidad=TRANSFERENCIA&fecha_desde=2026-10-01&limite=10
```

**Prueba de solo lectura en PowerShell:**

```powershell
.\ejemplos\prueba-auditoria-lectura.ps1
```

Para contrastar los resultados sin escribir en Oracle, abre `ejemplos/verificar-auditoria-dbeaver.sql` en DBeaver. El administrador puede consultar todas las sucursales; encargados y coordinadores no pueden leer la bitácora centralizada (HTTP 403). No hay operaciones de edición o borrado para este recurso.

Consulta `CAMBIOS_V1.4.md` para los parámetros, respuestas y casos de prueba. **La actualización no requiere scripts SQL, migraciones ni reinicialización de datos**. Mantén tu `.env` actual al actualizar desde v1.3 o v1.3.1.

## Requisitos

- Node.js **20 o superior**, recomendado Node.js 22 LTS, y npm.
- Oracle XE (ya instalado y funcional), escuchando en `127.0.0.1:1521` y servicio `XEPDB1`.
- Un usuario normal de Oracle que vea las 15 tablas SIGFAR en el **esquema actual** (el mismo que usaste en DBeaver para verificar 32/32). No usar `SYS` o `SYSTEM`.
- Conexión a Internet al ejecutar `npm install` para instalar dependencias npm. No se requiere Oracle Instant Client: se utiliza el modo **Thin** de `oracledb`.

## Instalación en Windows (PowerShell) o en cualquier terminal

1. Descomprime el paquete y abre una terminal en la carpeta `SIGFAR_Backend`.
2. Ejecuta `npm install`.
3. Copia `.env.example` a `.env` (PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`).
4. Edita **.env**. Debes configurar:

```dotenv
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=1521
DB_SERVICE=XEPDB1
DB_USER=SIGFAR
DB_PASSWORD=TU_CONTRASENA_REAL_DE_ORACLE
JWT_SECRET=COLOCA_UN_SECRETO_ALEATORIO_MUY_LARGO_DE_AL_MENOS_32_CARACTERES
CORS_ORIGIN=http://localhost:5173
```

`DB_USER` es solo un ejemplo. Usa **exactamente** el usuario/esquema con el que DBeaver muestra las 15 tablas, aunque su nombre no sea `SIGFAR`. No copies ni compartas el contenido de `.env`.

**Generar JWT_SECRET en PowerShell (desde cualquier carpeta, con Node instalado):**

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

5. Comprueba Oracle (consulta, **no altera** datos):

```powershell
npm run db:check
```

Resultado esperado: `Conexion Oracle OK`, `PDB: XEPDB1`, `Tablas SIGFAR: 15/15`, `Roles: 3`.

6. Ejecuta pruebas unitarias locales (sin tocar Oracle):

```powershell
npm test
```

7. Inicia el servidor:

```powershell
npm run dev
```

O sin recarga automática: `npm start`. Al iniciar se muestra la URL de salud:
`http://127.0.0.1:3000/api/v1/health`.

> Si la conexión falla, revisa que Oracle XE esté iniciado, que DBeaver conecte a `XEPDB1`, que el puerto sea 1521 y que el usuario de `.env` sea el propietario del esquema. DBeaver es un cliente SQL: Node se conecta directamente a Oracle, no a DBeaver.

## Credenciales de la base de prueba

**Solo académicas** (precargadas por `02_datos_prueba.sql`): todas usan la contraseña `Demo2026!`.

| Usuario | Rol | Alcance |
|---|---|---|
| `admin@sigfar.test` | ADMIN_CENTRAL | Consulta todas las sucursales e inventarios; administra sucursales y catálogo. |
| `guatemala@sigfar.test` | ENCARGADO | Consulta y ajusta inventario de sucursal 1. |
| `quetzaltenango@sigfar.test` | ENCARGADO | Sucursal 2. |
| `escuintla@sigfar.test` | ENCARGADO | Sucursal 3. |
| `entregas@sigfar.test` | COORD_ENTREGAS | Registra solicitudes, consulta disponibilidad y confirma/cancela entregas. |

## API — rutas ya implementadas

Prefijo: `http://127.0.0.1:3000/api/v1`. Las rutas excepto salud y login exigen cabecera `Authorization: Bearer <TOKEN>`.

| Método | Ruta | Permisos | Uso |
|---|---|---|---|
| GET | `/health` | Público | Comprobar HTTP (no verifica Oracle). |
| POST | `/auth/login` | Público, limitado a 10 intentos/15 min por IP | Autenticación y token JWT. |
| GET | `/auth/me` | Autenticado | Usuario actual. |
| GET | `/sucursales` | Todos (encargado: solo su sucursal) | Listar. |
| GET | `/sucursales/:id` | Todos (según alcance) | Consultar detalle. |
| POST | `/sucursales` | ADMIN_CENTRAL | Registrar. |
| PATCH | `/sucursales/:id` | ADMIN_CENTRAL | Modificar. |
| GET | `/medicamentos` | Todos | Listar. |
| GET | `/medicamentos/:id` | Todos | Consultar detalle. |
| POST | `/medicamentos` | ADMIN_CENTRAL | Registrar. |
| PATCH | `/medicamentos/:id` | ADMIN_CENTRAL | Modificar. |
| GET | `/inventarios` | Todos (encargado: solo su sucursal) | Existente, reservado, disponible. |
| GET | `/inventarios/movimientos` | ADMIN_CENTRAL, ENCARGADO (solo su sucursal) | Historial. |
| POST | `/inventarios/movimientos` | ENCARGADO de la sucursal | Carga inicial o ajuste justificado. |
| GET | `/transferencias` | ADMIN_CENTRAL o ENCARGADO participante | Listar transferencias; filtro opcional `estado` e `id_sucursal`. |
| GET | `/transferencias/:id` | ADMIN_CENTRAL o ENCARGADO participante | Cabecera y renglones de la transferencia. |
| POST | `/transferencias` | ENCARGADO de la sucursal de origen | Registrar transferencia pendiente sin cambiar inventario. |
| POST | `/transferencias/:id/despachar` | ENCARGADO de origen | Descontar existencias disponibles y dejar `EN_TRANSITO`. |
| POST | `/transferencias/:id/recibir` | ENCARGADO de destino | Agregar las existencias y dejar `RECIBIDA`. |

Consultas de lista aceptan `?limite=50&desde=0` (límite máximo 100). Los inventarios y movimientos también aceptan `?id_sucursal=1&id_medicamento=2` (sujetos al rol); el catálogo acepta `?activo=S`; sucursales, `?activa=S`.

Los nombres JSON son **snake_case en minúsculas**, al igual que los ejemplos de abajo.

## Prueba inmediata de solo lectura

Con el backend ejecutándose, utiliza el archivo `ejemplos/pruebas-lectura.ps1` desde PowerShell:

```powershell
.\ejemplos\pruebas-lectura.ps1
```

O prueba primero el inicio de sesión en PowerShell:

```powershell
$body = @{ correo = 'admin@sigfar.test'; clave = 'Demo2026!' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/auth/login' -ContentType 'application/json' -Body $body
$h = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/v1/inventarios' -Headers $h
```

En una base **sin modificaciones posteriores** deberían aparecer 3 sucursales, 4 medicamentos, 12 filas de inventario, 210 unidades existentes, 4 reservadas y 206 disponibles.

## Ejemplos de escritura: modifican datos de la BD (OPCIONALES)

### Crear un medicamento (administrador)

```http
POST /api/v1/medicamentos
Authorization: Bearer <token_admin>
Content-Type: application/json

{
  "codigo": "MED-ACA-005",
  "nombre": "Medicamento ficticio nuevo",
  "presentacion": "Caja de demostracion"
}
```

### Registrar su inventario inicial (encargado Guatemala)

```http
POST /api/v1/inventarios/movimientos
Authorization: Bearer <token_encargado_guatemala>
Content-Type: application/json

{
  "id_sucursal": 1,
  "id_medicamento": 1000,
  "tipo": "INICIAL",
  "cantidad": 10,
  "motivo": "Inventario inicial de demostracion"
}
```

`1000` es el **primer identificador automático esperado** en una instalación limpia del esquema. **Utiliza el ID real devuelto por POST /medicamentos**, porque puede ser distinto.

### Ajustar existencias ya inicializadas

```http
POST /api/v1/inventarios/movimientos
Authorization: Bearer <token_encargado_guatemala>
Content-Type: application/json

{
  "id_sucursal": 1,
  "id_medicamento": 1,
  "tipo": "AJUSTE_ENTRADA",
  "cantidad": 2,
  "motivo": "Ajuste academico de demostracion"
}
```

La escritura del saldo, el movimiento histórico y el registro de auditoría se realizan dentro de **la misma transacción**. Los ajustes de salida no pueden superar `cantidad_existente - cantidad_reservada`. No se permite escribir inventarios de otra sucursal con token de encargado.

**Atención**: `03_verificacion.sql` de DBeaver compara contra cifras fijas del juego original. Después de una escritura legítima, algunas filas de esa verificación pueden dejar de mostrar `OK`. Esto no significa pérdida de integridad: utiliza las verificaciones de conciliación (pruebas 22 a 25) y ajusta las expectativas de conteos/totales a la nueva situación. Nunca ejecutes otra vez `02_datos_prueba.sql` sobre datos existentes.

## Estructura

```text
SIGFAR_Backend/
  src/
    app.js
    server.js
    config/env.js
    db/oracle.js
    middleware/auth.js
    middleware/async-handler.js
    routes/auth.routes.js
    routes/sucursales.routes.js
    routes/medicamentos.routes.js
    routes/inventarios.routes.js
    services/auditoria.js
    utils/errors.js
    utils/authorization.js
    utils/password.js
    utils/rows.js
    utils/validation.js
  scripts/
    comprobar-oracle.js
    revisar-sintaxis.js
  tests/
  ejemplos/pruebas-lectura.ps1
  .env.example
  .gitignore
  package.json
  LEEME.md
```

## Seguridad y reglas de integridad

- Las consultas y escrituras usan **parámetros vinculados** de Oracle. Nunca se introduce SQL procedente de una petición sin pasar por lista blanca.
- Autenticación por JWT firmado; cada petición protegida consulta si el usuario sigue activo y su rol vigente.
- Las contraseñas de prueba se verifican usando el formato `scrypt` ya cargado en Oracle; no se almacenan contraseñas en el backend.
- El encargado solo puede escribir inventario en su sucursal y nunca reducir existencias reservadas.
- Cambios en sucursales, medicamentos e inventarios generan registros de auditoría en una transacción atómica.
- Se devuelven errores sin exponer consultas SQL, contraseñas ni detalles internos de Oracle.
- Backend inicial escucha en **127.0.0.1**, apropiado para uso local. Más adelante se adaptará la configuración al servicio en la nube que exige la universidad.

## Iteración 2 — Transferencias entre sucursales

No se modificó ninguna tabla, índice, dato ficticio ni estructura del esquema Oracle verificado en DBeaver. El módulo nuevo usa **TRANSFERENCIA**, **DETALLE_TRANSFERENCIA**, **INVENTARIO_SUCURSAL**, **MOVIMIENTO_INVENTARIO** y **REGISTRO_AUDITORIA**, ya existentes.

### Actualizar una instalación local que ya funciona

1. Si `npm run dev` está funcionando, detén el servidor con `Ctrl+C`.
2. **Conserva tu archivo `.env` actual** (no lo compartas ni lo reemplaces). Opcionalmente haz una copia de respaldo de la carpeta existente.
3. Descomprime el nuevo ZIP. Copia la carpeta `src`, `tests`, `ejemplos`, `LEEME.md` y `package.json` del paquete nuevo sobre las correspondientes de tu backend anterior. El ZIP **no incluye** `.env` ni `node_modules`.
4. Si ya instalaste las dependencias, son las mismas de la iteración anterior: normalmente no necesitas reinstalarlas. Si empiezas de cero, ejecuta `npm install`.
5. Ejecuta `npm run check:syntax`, `npm test`, `npm run db:check` y `npm run dev`.
6. Primero prueba con GET `/api/v1/transferencias` usando el administrador; deben verse al menos las dos transferencias ficticias anteriores. No deberían modificarse los inventarios.

### Contrato de transferencia

**Registrar:** `POST /api/v1/transferencias`, con token de `guatemala@sigfar.test` (encargado de sucursal 1) y JSON:

```json
{
  "id_sucursal_origen": 1,
  "id_sucursal_destino": 2,
  "detalles": [
    { "id_medicamento": 1, "cantidad": 1 },
    { "id_medicamento": 2, "cantidad": 1 }
  ]
}
```

La respuesta HTTP `201` contiene `datos.id_transferencia` y `datos.estado = "REGISTRADA"`. Los IDs 1 y 2 corresponden a la base ficticia inicial. Para una instalación modificada, utiliza IDs reales obtenidos de `/sucursales` y `/medicamentos`.

**Despachar:** `POST /api/v1/transferencias/ID_NUEVO/despachar` con token del **encargado de origen**, sin cuerpo. La API valida `cantidad_existente - cantidad_reservada`, bloquea los saldos y registra un `TRANSFERENCIA_SALIDA` por medicamento. La cabecera cambia a `EN_TRANSITO`.

**Recibir:** `POST /api/v1/transferencias/ID_NUEVO/recibir` con token del **encargado de destino**, sin cuerpo. Se incrementan sus existencias, incluso si antes no tenía un registro de inventario para ese medicamento; se registra `TRANSFERENCIA_ENTRADA` y la cabecera cambia a `RECIBIDA`.

En cada cambio, movimiento, actualización de inventario y auditoría se ejecutan en **una única transacción Oracle**. Si una operación falla, se revierten sus cambios. Una segunda petición de despacho/recepción, o una solicitud sin existencias suficientes, devuelve HTTP `409` sin alterar los saldos. Una transferencia registrada **no** descuenta stock hasta ser despachada.

**Permisos:** el administrador puede consultar todas; un encargado consulta transferencias de su sucursal, pero solo **crea/despacha desde el origen** y **recibe en el destino**. El coordinador de entregas no gestiona transferencias.

**Estados del modelo académico:** `REGISTRADA` → `EN_TRANSITO` → `RECIBIDA`. No se agregó cancelación, devolución, recepción parcial ni gestión avanzada de transporte porque no forma parte del alcance definido.

**Pruebas con datos reales:** desde la carpeta del backend y con el servidor ejecutándose:

```powershell
.\ejemplos\prueba-transferencias.ps1 -ConfirmarCambios
```

Este comando **escribe datos en la BD**: crea y completa una transferencia de 1 unidad entre las sucursales de Guatemala y Quetzaltenango, y comprueba que se rechace una segunda recepción. Úsalo únicamente con datos ficticios, cuando quieras realizar la prueba de punta a punta; no se ejecuta como parte de `npm test`. Si una etapa falla, las etapas anteriores que ya se confirmaron pueden permanecer registradas.

También se incluyen consultas **solo lectura** `ejemplos/verificar-transferencias-dbeaver.sql` para comprobar el historial de movimientos, el inventario y la auditoría desde DBeaver. La consulta de inconsistencias debe devolver **cero filas**.

**Importante:** los 32 controles anteriores en `03_verificacion.sql` usan cifras iniciales fijas. Después de crear cualquier transferencia legítima los totales podrían cambiar, aunque la base de datos siga siendo coherente. Utiliza las verificaciones dinámicas para las nuevas operaciones.

### Ejemplo de consulta de solo lectura (PowerShell)

```powershell
$body = @{ correo='admin@sigfar.test'; clave='Demo2026!' } | ConvertTo-Json
$token = (Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/v1/auth/login' -ContentType 'application/json' -Body $body).token
$h = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/v1/transferencias?limite=20' -Headers $h
```

## Alcance actual y pendiente

**Realizado en código:** rutas HTTP para autenticación, gestión básica de sucursales/medicamentos, movimientos iniciales/ajustes de inventario y transferencias completas (registro, despacho y recepción), con control de acceso y auditoría. Este código **no se ha ejecutado contra tu Oracle local desde aquí**. Por eso se incluye `npm run db:check` y pruebas API para tu entorno.

**Pendiente de iteraciones desde la versión 1.1:** flujo de efectivo; gastos de planilla; activos fijos; solicitudes y coordinación de entregas; consultas centralizadas de auditoría; conexión con React; despliegue en la nube. Todos esos procesos ya tienen tablas; no hay que crear módulos fuera del documento universitario.

No es un sistema de farmacia de producción: no procesa pagos, recetas, facturación, tratamientos médicos ni datos reales de pacientes.

---

## Iteración 3 — Efectivo, gastos de planilla y activos fijos (v1.2)

**Alcance:** se incorpora únicamente el control de efectivo, gasto agregado por período y valoración de activos que exige el documento universitario. Se reutilizan las tablas existentes `MOVIMIENTO_EFECTIVO`, `GASTO_PLANILLA`, `ACTIVO_FIJO`, `SUCURSAL`, `USUARIO` y `REGISTRO_AUDITORIA`. **No se modifica el esquema de Oracle XE ni se reinstalan los datos anteriores.** Transferencias, inventarios, autenticación y demás rutas siguen disponibles.

### Actualizar v1.1 sin perder la configuración

1. Haz copia de tu carpeta local del backend y detén el servidor (`Ctrl+C`).
2. Descomprime el nuevo paquete. Copia **`src/`, `tests/`, `ejemplos/`, `LEEME.md` y `package.json`** sobre las carpetas de la versión anterior.
3. **Conserva tu `.env` actual y no lo compartas.** No copies un archivo `.env` ni una carpeta `node_modules` desde el ZIP (no están incluidos).
4. No ejecutes nuevamente `01_esquema.sql` ni `02_datos_prueba.sql` en DBeaver.
5. En la carpeta del backend ejecuta:

```powershell
npm run check:syntax
npm test
npm run db:check
npm run dev
```

La conexión ya configurada seguirá apuntando a `127.0.0.1:1521/XEPDB1` mediante tu `.env`.

### API nueva (prefijo `/api/v1`)

Los endpoints exigen JWT. `ADMIN_CENTRAL` consulta **todas** las sucursales; `ENCARGADO` consulta y escribe **solo en su sucursal**; `COORD_ENTREGAS` no accede a módulos administrativos.

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| GET | `/efectivo/movimientos` | Admin / encargado | Historial paginado. |
| GET | `/efectivo/movimientos/:id` | Admin / encargado | Detalle de movimiento, respetando sucursal. |
| GET | `/efectivo/resumen` | Admin / encargado | Ingresos, egresos y flujo neto por sucursal y global según acceso. |
| POST | `/efectivo/movimientos` | Encargado | Registrar entrada o salida de efectivo. |
| GET | `/planillas` | Admin / encargado | Consultar gastos por sucursal y mes. |
| GET | `/planillas/:id` | Admin / encargado | Detalle según sucursal. |
| GET | `/planillas/resumen` | Admin / encargado | Suma de gastos por sucursal / empresa. |
| POST | `/planillas` | Encargado | Registrar monto total del período. |
| PATCH | `/planillas/:id` | Encargado | Corregir **solo el monto**, conservando historial en auditoría. |
| GET | `/activos` | Admin / encargado | Consultar activos de sucursal / empresa. |
| GET | `/activos/:id` | Admin / encargado | Detalle según sucursal. |
| GET | `/activos/resumen` | Admin / encargado | Valor de activos **VIGENTES** por defecto; filtro estado disponible. |
| POST | `/activos` | Encargado | Registrar activo y valor declarado. |
| PATCH | `/activos/:id` | Encargado | Corregir descripción, valor y/o cambiar estado VIGENTE / BAJA. |

Las listas aceptan `?limite=50&desde=0` (máximo 100) y `?id_sucursal=N` (solo admin puede consultar una sucursal ajena). Los movimientos de efectivo aceptan `?tipo=INGRESO` o `EGRESO` y fechas inclusivas `?fecha_desde=2026-10-01&fecha_hasta=2026-10-31`. Las fechas se interpretan en **hora de Guatemala UTC-06:00**. Planillas acepta `?periodo_desde=2026-01&periodo_hasta=2026-12`, y activos `?estado=VIGENTE` o `BAJA`.

Los totales monetarios se devuelven en **GTQ**. El flujo neto es `ingresos - egresos`; **no** representa saldo bancario ni conciliación contable. La planilla no crea automáticamente un movimiento de efectivo: se evita registrar gastos dos veces sin una función contable que el prototipo no contempla. No se calculan salarios individuales ni depreciación de activos. Los activos en estado BAJA no forman parte del valor vigente consolidado.

**Importante, precisión de dinero:** los importes en las **peticiones** deben ser *cadenas* decimales JSON con punto y máximo 2 decimales, p. ej. `"125.50"`, no un número JSON `125.50`. Se convierten en centavos enteros antes de enviarse a Oracle. `monto` de efectivo debe ser mayor que cero; `monto_total` de planilla y `valor` de activo pueden ser cero. Máximo 12 cifras enteras, 2 decimales. Los importes **en las respuestas** provienen de `NUMBER(14,2)` y aparecen como números JSON según el driver.

### Ejemplos de peticiones JSON

**Efectivo**, `POST /api/v1/efectivo/movimientos`:

```json
{ "id_sucursal": 1, "tipo": "INGRESO", "concepto": "Ingreso ficticio de caja", "monto": "125.50" }
```

**Planilla**, `POST /api/v1/planillas`:

```json
{ "id_sucursal": 1, "periodo": "2027-01", "monto_total": "1200.00" }
```

Para corregirla sin duplicarla: `PATCH /api/v1/planillas/ID` con `{ "monto_total": "1250.00" }`. El período es único por sucursal; un segundo POST en el mismo período recibe `409 DUPLICADO`.

**Activo fijo**, `POST /api/v1/activos`:

```json
{ "id_sucursal": 1, "codigo": "ACA-ACT-001", "descripcion": "Computadora de prueba", "valor": "3500.00" }
```

Para dar de baja sin eliminar historial: `PATCH /api/v1/activos/ID` con `{ "estado": "BAJA" }`.

### Pruebas desde tu PC

**A. Solo lectura, recomendada primero:** con el backend en ejecución, abre otra terminal PowerShell:

```powershell
.\ejemplos\prueba-administracion-lectura.ps1
```

Solicitará la contraseña de `admin@sigfar.test` y consultará los tres módulos sin modificar la BD.

**B. En DBeaver (solo lectura):** abre `ejemplos/verificar-administracion-dbeaver.sql`. Incluye los totales globales, valores por sucursal, verificaciones de importes, duplicados y auditoría de datos creados desde el backend. Los contadores de errores deben ser cero. No usa resultados numéricos fijos: las cifras cambian al registrar movimientos legítimos.

**C. Escritura de prueba, opcional y con cambios reales:**

```powershell
.\ejemplos\prueba-administracion-cambios.ps1 -ConfirmarCambios -PeriodoPlanilla 2027-01
```

Esta prueba **crea** un movimiento, un gasto de planilla y un activo; **corrige** el gasto y **da de baja** el activo. Solicita la contraseña del encargado. El período indicado debe estar libre para la sucursal (UNIQUE). Si se ejecuta varias veces, elige otro período. **No es una transacción global**: si una etapa falla, los pasos anteriores ya registrados permanecerán en la base y podrán auditarse. No se ejecuta dentro de `npm test`.

### Diseño y restricciones

- Las escrituras se ejecutan mediante `withTransaction` junto con su auditoría. Una falla en la misma transacción realiza `ROLLBACK`.
- Solo se permite registrar en sucursales activas. Las consultas históricas siguen visibles aunque la sucursal posteriormente se desactive.
- No hay operaciones `DELETE` ni edición de movimientos de efectivo: los registros conservan su trazabilidad; cualquier corrección requiere otra entrada o salida documentada.
- La corrección de planillas y activos utiliza `FOR UPDATE NOWAIT` para serializar modificaciones simultáneas.
- Los códigos de activos y pares `(sucursal, período)` de planillas son únicos por restricciones de Oracle; duplicados devuelven `409`.
- Las consultas usan parámetros vinculados y listas blancas de campos, sin interpolar valores del cliente en SQL.
- **Pruebas locales efectuadas aquí:** sintaxis JavaScript y pruebas unitarias sin Oracle; **pendiente:** ejecución HTTP real y pruebas de Oracle en tu computadora.

### Estado después de v1.2

**Implementado en código:** autenticación, sucursales, medicamentos, inventario, transferencias, efectivo, gastos de planilla, activos y registro técnico de auditoría. **Pendiente:** consulta centralizada de auditoría; interfaz React; despliegue en nube. No se agregaron pagos electrónicos, contabilidad, compras, nómina individual ni depreciaciones.


---

## Actualizacion v1.3: solicitudes y entregas de medicamentos

El paquete v1.3 es **completo** e incluye todos los archivos de v1.2. Para actualizar tu instalacion validada:

1. Deten Node (`Ctrl+C`) y guarda una copia del backend actual.
2. Extrae el ZIP v1.3 y copia sus archivos al proyecto local, **sin sobrescribir tu `.env`**.
3. Ejecuta `npm run check:syntax`, `npm test`, `npm run db:check` y `npm run dev`.
4. **No ejecutes nuevamente los scripts SQL de creacion ni de datos ficticios.** El esquema Oracle XE no cambia.
5. Desde otra terminal PowerShell, ejecuta `.\ejemplos\prueba-entregas-lectura.ps1`.

### API de solicitudes (prefijo `/api/v1`)

Todos estos endpoints exigen autenticacion JWT. Para el flujo principal, `COORD_ENTREGAS` crea/consulta/confirma/cancela, y `ENCARGADO` despacha unicamente entregas asignadas a su sucursal. El coordinador o encargado asignado marca como entregada. `ADMIN_CENTRAL` solo consulta.

| Metodo | Endpoint | Rol | Operacion |
|---|---|---|---|
| GET | `/solicitudes` | Admin / Coord / Encargado asignado | Lista por rol, filtro `estado`, `id_sucursal`, paginacion. |
| GET | `/solicitudes/:id` | Admin / Coord / Encargado asignado | Cabecera, detalles y reservas. |
| POST | `/solicitudes/disponibilidad` | Admin / Coord | Busca sucursales elegibles sin crear solicitud. |
| POST | `/solicitudes` | Coord | Crea solicitud en `PENDIENTE`, con medicamentos. |
| GET | `/solicitudes/:id/opciones` | Admin / Coord | Busca sucursales con cobertura y stock suficiente. |
| POST | `/solicitudes/:id/confirmar` | Coord | Asigna farmacia, pago, reserva unidades y calcula tiempo estimado. |
| POST | `/solicitudes/:id/despachar` | Encargado de sucursal asignada | Descuenta unidades, consume reservas y deja `DESPACHADA`. |
| POST | `/solicitudes/:id/entregar` | Coord / Encargado asignado | Marca `ENTREGADA`, registra fecha real y permite identificar retraso. |
| POST | `/solicitudes/:id/cancelar` | Coord | Solo antes de despacho. Libera reservas activas si estaba confirmada. |

#### Ejemplo: nueva solicitud

`POST /api/v1/solicitudes` autenticado como `entregas@sigfar.test`:

```json
{
  "cliente_nombre": "Cliente Ficticio",
  "cliente_telefono": "5555-1000",
  "departamento_entrega": "Guatemala",
  "municipio_entrega": "Guatemala",
  "direccion_entrega": "Direccion ficticia zona 1",
  "detalles": [
    { "id_medicamento": 1, "cantidad": 2 },
    { "id_medicamento": 4, "cantidad": 1 }
  ]
}
```

Con el `id_solicitud` de la respuesta, ejecuta `GET /api/v1/solicitudes/:id/opciones`. Para confirmar:

```json
{ "id_sucursal": 1, "forma_pago": "EFECTIVO" }
```

`POST /api/v1/solicitudes/:id/confirmar` solo admite estos dos campos. Las otras transiciones (`/despachar`, `/entregar`, `/cancelar`) reciben `{}` o cuerpo vacio. `estado` no se puede cambiar arbitrariamente.

La consulta de disponibilidad **sin registrar pedido** usa `POST /api/v1/solicitudes/disponibilidad` con:

```json
{
  "departamento_entrega": "Guatemala",
  "municipio_entrega": "Guatemala",
  "detalles": [{ "id_medicamento": 1, "cantidad": 1 }]
}
```

Retorna farmacias que cubren el mismo departamento y municipio, tienen stock suficiente para **todos** los medicamentos y están activas. La consulta considera `cantidad_existente - cantidad_reservada`. Los tiempos estimados se miden en minutos configurados por farmacia, no son predicciones de trafico.

### Integridad de inventario y estados

```text
PENDIENTE -> CONFIRMADA -> DESPACHADA -> ENTREGADA
     |             |
     +-> CANCELADA <-+
```

- Al confirmar se bloquean la solicitud y los inventarios implicados (`FOR UPDATE NOWAIT`), se reservan todas las cantidades y se actualiza el estado con una sola transaccion.
- Al despachar se consumen las reservas y se registran movimientos `ENTREGA_SALIDA`; el estado se actualiza con los movimientos en una transaccion unica.
- Al cancelar antes de despachar se liberan todas las reservas sin registrar salida de medicamento.
- No se puede confirmar dos veces, despachar dos veces, cancelar despues de despachar ni marcar entregada sin despacho.
- Se genera bitacora `REGISTRO_AUDITORIA` para registro y cada transicion.
- Campo `tardia` (`S`/`N`) en consultas: para `ENTREGADA` compara fecha real con estimada; para `CONFIRMADA` y `DESPACHADA` compara la hora actual con estimada.
- Las solicitudes demo precargadas siguen disponibles; el sistema reutiliza las mismas 15 tablas.

### Comprobaciones locales

**A. Solo lectura** (recomendada primero):

```powershell
.\ejemplos\prueba-entregas-lectura.ps1
```

**B. DBeaver (solo lectura):** abre `ejemplos/verificar-entregas-dbeaver.sql`. Las consultas de conciliacion #3-#6 deben devolver **cero filas**; los restantes bloques muestran historiales.

**C. Prueba de escritura opcional, sobre tus datos ficticios:**

```powershell
.\ejemplos\prueba-entregas-cambios.ps1 -ConfirmarCambios
```

Pide credenciales de coordinador y encargado, crea dos solicitudes nuevas: una se confirma y cancela (libera reserva); la otra se confirma, despacha y entrega (consume una unidad). **Modifica los datos de Oracle XE permanentemente.** No esta incluida en `npm test`. Si falla a mitad de camino, las operaciones confirmadas ya permanecen y se pueden consultar en la API/DBeaver.

**IMPORTANTE:** las verificaciones de sintaxis y tests sin Oracle no reemplazan probar las operaciones reales contra `XEPDB1` en tu equipo. Si no existe una sucursal elegible o los datos demo cambiaron, ajusta los ejemplos de prueba, no reinicies los datos de produccion.

### Alcance

No se implementan portal web para clientes, interfaz de telefonia, mapa/GPS, rutas optimizadas, pagos reales ni facturacion. Esta API deja disponible la informacion minima para futura integracion sin desarrollar esos sistemas externos. El siguiente componente pendiente es la **consulta centralizada de auditoria**; despues se abordara React.
