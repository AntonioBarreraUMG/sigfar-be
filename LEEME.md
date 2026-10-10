# SIGFAR — Backend académico (Node.js + Express + Oracle XE)

**Iteración 1:** autenticación, sucursales, medicamentos e inventario. Usa **directamente** las 15 tablas ya instaladas y verificadas en DBeaver: no contiene SQL de creación, migraciones ni modificaciones del esquema. Requiere la BD Oracle XE funcionando en **tu propia computadora**, servicio `XEPDB1`.

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
| `entregas@sigfar.test` | COORD_ENTREGAS | Consulta sucursales, medicamentos y disponibilidad; las entregas se implementarán en otra iteración. |

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

## Alcance actual y pendiente

**Realizado en código:** rutas HTTP para autenticación, gestión básica de sucursales/medicamentos y movimientos iniciales/ajustes de inventario, con control de acceso y auditoría. Este código **no se ha ejecutado contra tu Oracle local desde aquí**. Por eso se incluye `npm run db:check` y pruebas API para tu entorno.

**Pendiente de iteraciones:** transferencias; flujo de efectivo; gastos de planilla; activos fijos; solicitudes y coordinación de entregas; consultas centralizadas de auditoría; conexión con React; despliegue en la nube. Todos esos procesos ya tienen tablas; no hay que crear módulos fuera del documento universitario.

No es un sistema de farmacia de producción: no procesa pagos, recetas, facturación, tratamientos médicos ni datos reales de pacientes.
