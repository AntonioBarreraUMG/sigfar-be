# SIGFAR — Scripts compatibles con DBeaver + Oracle XE

**Alcance:** prototipo universitario. **Modelo:** el mismo esquema de 15 tablas y datos ficticios del paquete anterior. **No es una migración automática.**

## Importante: DBeaver es el cliente, Oracle XE es el motor

Estos archivos usan SQL de Oracle Database XE 21c, pero evitan comandos que dependen de SQL*Plus/SQLcl (`SET`, `PROMPT`, `WHENEVER SQLERROR`, `@archivo`, `DBMS_OUTPUT` y el terminador `/` de bloques PL/SQL). Están diseñados para ejecutarse desde **SQL Editor -> Execute SQL Script (Alt+X)** de DBeaver, sin instalar SQL*Plus.

### Archivos

- `00_diagnostico.sql`: comprueba el usuario, PDB y si SIGFAR ya tiene tablas; **no modifica datos**.
- `01_esquema.sql`: crea 15 tablas y sus restricciones e índices; **solo sobre esquema vacío**.
- `02_datos_prueba.sql`: carga datos ficticios, **solo una vez** después del esquema.
- `03_verificacion.sql`: un `SELECT` que muestra `OK`/`ERROR` por cada comprobación, con valores esperados. **No modifica datos**.
- `04_consultas_ejemplo.sql`: consultas de muestra sobre todas las áreas funcionales. **No modifica datos**.

### Ejecutar desde DBeaver

1. Crear o abrir una conexión de tipo **Oracle**, apuntando a la **PDB** donde trabajará SIGFAR; en XE 21c suele ser `XEPDB1`, pero confirme su instalación. Utilice un esquema de trabajo propio con privilegios de `CREATE TABLE` y cuota de almacenamiento. No trabaje sobre `SYS` o `SYSTEM`.
2. Abrir cada archivo `.sql` con el editor SQL de esa conexión y ejecutar `00_diagnostico.sql`. Comprobar usuario, esquema y contenedor; la columna `TABLAS_SIGFAR_YA_EXISTENTES` debe indicar **0** para instalar el esquema desde cero.
3. Abrir `01_esquema.sql` y ejecutar el archivo **completo** con **Alt+X** (menú *SQL Editor -> Execute SQL Script*). Confirmar que no aparezcan errores de ejecución.
4. Abrir `02_datos_prueba.sql` y ejecutar **Alt+X**. Este archivo incluye `COMMIT` final. Si la carga falla y está en modo manual, hacer **Rollback** de las inserciones fallidas y corregir antes de intentar de nuevo. **No ejecutar dos veces si ya terminó bien**.
5. Abrir `03_verificacion.sql` y ejecutarlo con **Ctrl+Enter** (una consulta) o **Alt+X**. La tabla de resultados debe mostrar **OK en todas las filas**.
6. Abrir `04_consultas_ejemplo.sql` y ejecutar cada consulta por separado con **Ctrl+Enter**, o todas con **Alt+X** y revisar los diferentes resultados.

### Preferencias útiles de DBeaver

En `Window -> Preferences -> Editors -> SQL Editor -> SQL Processing`, mantener `;` como separador de sentencias; **Blank line is statement delimiter = Never**, y activar **Remove trailing query delimiter** si el driver de Oracle recibe el `;` como parte del SQL. En ajustes de *Scripts*, elegir **Error handling = Stop + rollback** (en lugar de *Ignore*) para impedir que continúe una carga tras un fallo. Para datos, usar el modo de transacción manual o `Commit type = At script end`; hay un `COMMIT` final explícito.

> **Atención:** en Oracle, los comandos DDL como `CREATE TABLE` realizan *commit implícito*. Una ejecución parcial de `01_esquema.sql` puede dejar tablas creadas aunque la opción sea *Stop + rollback*. **No se recomienda borrar tablas que ya contengan datos reales**. Trabaje con un esquema SIGFAR de demostración limpio.

### Si necesita crear el usuario SIGFAR

Hacerlo únicamente con un usuario administrador conectado a la **PDB correcta** (no al contenedor raíz). Cambiar la contraseña y adaptar el *tablespace* existente en su instalación:

```sql
CREATE USER sigfar IDENTIFIED BY "CAMBIAR_POR_CLAVE_SEGURA";
GRANT CREATE SESSION, CREATE TABLE TO sigfar;
ALTER USER sigfar QUOTA 100M ON USERS;
```

Después **abrir una conexión nueva como `SIGFAR`** y ejecutar los archivos allí. Si ya tiene un usuario/esquema funcional con privilegios, no es necesario crearlo.

## Comprobación del juego de datos

El archivo `03_verificacion.sql` muestra un conjunto de comprobaciones, incluidas las 15 tablas, 30 claves foráneas, 11 índices adicionales, 210 unidades existentes, 4 reservadas, 206 disponibles, 2 en tránsito, una entrega tardía, y los totales financieros ficticios. Se diseñó para el juego inicial sin modificaciones posteriores; cuando se agreguen operaciones nuevas, los totales esperados deberán actualizarse.

## Errores frecuentes

| Error / síntoma | Posible causa | Acción sugerida |
|---|---|---|
| `ORA-00900` cerca de `PROMPT`, `SET`, `WHENEVER` | Se está ejecutando el paquete antiguo desde el editor SQL | Usar estos archivos actualizados. |
| `ORA-00955` al crear una tabla | Alguna tabla ya existe (instalación previa/parcial) | Comprobar `00_diagnostico.sql`; usar un esquema limpio de prueba, sin borrar datos reales. |
| `ORA-00942` al cargar datos | El esquema no se creó, el usuario es incorrecto o se interrumpió `01` | Revisar la conexión y terminar de crear el esquema. |
| `ORA-01031` | Privilegios insuficientes | Solicitar `CREATE TABLE` y permisos apropiados en el esquema correcto. |
| `ORA-01950` | Usuario sin cuota en el tablespace | Asignar cuota de almacenamiento al usuario. |
| `ORA-65096` al crear usuario | Conexión al contenedor raíz CDB | Usar la conexión a la PDB. |
| `ORA-00001` al insertar datos ficticios | La carga ya se ejecutó o quedó parcialmente insertada | Evitar repetir la carga; revisar transacciones y esquema. |
| Verificación muestra `ERROR` | Datos incompletos, modificados o esquema incorrecto | Revisar el esperado/obtenido de cada fila. |

## Credenciales de prueba

Los cinco usuarios ficticios mantienen la contraseña **`Demo2026!`** exclusivamente para la demostración. Sus hashes siguen en formato `scrypt$N$r$p$saltHex$hashHex`, compatibles con la verificación futura de Node.js. No se usan contraseñas en texto plano ni datos reales.

## Alcance sin cambios

El modelo conserva exclusivamente sucursales, inventario de medicamentos, transferencias, efectivo, gasto agregado de planilla, activos fijos, solicitudes y entregas, acceso y auditoría. No se agregaron módulos de facturación, compras, proveedores, contabilidad general ni integración bancaria.

**Validación realizada:** controles estáticos de archivos, sentencias, claves, índices y comparaciones del conjunto de pruebas. **No se realizó una ejecución real en un servidor Oracle XE desde este entorno**; ese paso debe validarse desde su conexión DBeaver.
