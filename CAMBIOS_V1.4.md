# SIGFAR — Cambios v1.4 (auditoría centralizada)

Esta entrega incorpora únicamente consultas de lectura sobre `REGISTRO_AUDITORIA`, sin cambios a las 15 tablas, datos iniciales ni reglas de negocio anteriores.

## Rutas nuevas

Las rutas requieren `Authorization: Bearer <token>` **del rol `ADMIN_CENTRAL`**. Usuarios sin token reciben HTTP 401; encargados y coordinadores reciben HTTP 403. El acceso queda bloqueado en el servidor.

| Verbo | Ruta | Resultado |
|---|---|---|
| GET | `/api/v1/auditoria/registros` | Lista paginada de eventos, sin CLOB; incluye `total` y `paginacion`. |
| GET | `/api/v1/auditoria/registros/:id` | Detalle, con valores anteriores y nuevos (JSON). |
| GET | `/api/v1/auditoria/resumen` | Total de eventos y agrupaciones por entidad y sucursal. |

Filtros admitidos para `registros` y `resumen`: `id_sucursal`, `id_usuario`, `entidad`, `accion`, `id_registro`, `fecha_desde`, `fecha_hasta`. En `registros` también `limite` (1 a 100; por defecto 50) y `desde` (desplazamiento desde 0). `resumen` admite esos parámetros pero ignora la paginación, de forma que muestra todos los registros del filtro.

Las fechas se interpretan como días completos en horario de Guatemala UTC-06:00. En la respuesta, `fecha_evento` se serializa según la configuración de fechas de Oracle y del driver.

## Ejemplos de respuesta (ilustrativos, no son datos consultados en tu Oracle)

`GET /api/v1/auditoria/registros?entidad=TRANSFERENCIA&limite=2`

```json
{
  "total": 3,
  "datos": [
    { "id_auditoria": 3, "id_usuario": 3, "usuario": "Encargado ejemplo", "correo_usuario": "demo@sigfar.test", "id_sucursal": 2, "sucursal": "Farmacia ejemplo", "entidad": "TRANSFERENCIA", "id_registro": 1, "accion": "RECIBIR", "fecha_evento": "2026-10-15T16:00:00.000Z" }
  ],
  "paginacion": { "desde": 0, "limite": 2 }
}
```

`GET /api/v1/auditoria/registros/3`

```json
{
  "datos": {
    "id_auditoria": 3,
    "id_usuario": 3,
    "usuario": "Encargado ejemplo",
    "correo_usuario": "demo@sigfar.test",
    "id_sucursal": 2,
    "sucursal": "Farmacia ejemplo",
    "entidad": "TRANSFERENCIA",
    "id_registro": 1,
    "accion": "RECIBIR",
    "fecha_evento": "2026-10-15T16:00:00.000Z",
    "datos_anteriores": { "estado": "EN_TRANSITO" },
    "datos_nuevos": { "estado": "RECIBIDA" }
  }
}
```

Si un evento global no corresponde a una sucursal, `id_sucursal` y `sucursal` se devuelven como `null`. Los filtros deben escribirse en mayúsculas (por ejemplo `TRANSFERENCIA` y `DESPACHAR`). La consulta de detalle no permite modificar, eliminar ni reescribir eventos.

## Validación local recomendada

1. Con la BD Oracle XE `XEPDB1` ya funcionando, ejecutar `npm run check:syntax`, `npm test`, `npm run db:check` y `npm run dev`.
2. Probar `./ejemplos/prueba-auditoria-lectura.ps1` desde PowerShell.
3. Comparar `total`, `por_entidad` y `por_sucursal` con `ejemplos/verificar-auditoria-dbeaver.sql`.
4. Intentar acceder con un token del coordinador a `GET /api/v1/auditoria/registros`: debe responder 403.
5. Consultar `/api/v1/auditoria/registros/9999999999` (sin evento): debe responder 404.

**Importante:** tras realizar pruebas de módulos anteriores el número de eventos ya no coincide con el juego original. Eso es esperado. No ejecutar de nuevo la carga de datos ni restablecer las tablas.

**Límite:** las pruebas unitarias no reemplazan la ejecución contra Oracle XE en tu computadora.
