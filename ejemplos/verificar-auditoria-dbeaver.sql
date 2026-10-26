-- SIGFAR v1.4 - Oracle XE / DBeaver - SOLO LECTURA
-- Ejecutar sentencias individualmente (Ctrl+Enter) o como script (Alt+X).
-- No se usan instrucciones SQL*Plus ni se modifica el esquema.

-- 1. Cantidad total de eventos auditables registrados.
SELECT COUNT(*) AS total_eventos FROM registro_auditoria;

-- 2. Eventos por entidad (comparable con GET /api/v1/auditoria/resumen).
SELECT entidad, COUNT(*) AS cantidad
FROM registro_auditoria
GROUP BY entidad
ORDER BY cantidad DESC, entidad;

-- 3. Eventos por sucursal, incluyendo eventos globales sin sucursal asignada.
SELECT a.id_sucursal, s.nombre AS sucursal, COUNT(*) AS cantidad
FROM registro_auditoria a
LEFT JOIN sucursal s ON s.id_sucursal = a.id_sucursal
GROUP BY a.id_sucursal, s.nombre
ORDER BY cantidad DESC, a.id_sucursal NULLS LAST;

-- 4. Diez operaciones mas recientes con usuario responsable.
SELECT a.id_auditoria, a.entidad, a.id_registro, a.accion,
       a.id_usuario, u.nombre AS usuario, a.id_sucursal, s.nombre AS sucursal,
       a.fecha_evento
FROM registro_auditoria a
JOIN usuario u ON u.id_usuario = a.id_usuario
LEFT JOIN sucursal s ON s.id_sucursal = a.id_sucursal
ORDER BY a.fecha_evento DESC, a.id_auditoria DESC
FETCH FIRST 10 ROWS ONLY;

-- 5. Eventos de transferencia. Al crear operaciones nuevas el total cambiara.
SELECT id_auditoria, id_sucursal, id_usuario, id_registro, accion, fecha_evento
FROM registro_auditoria
WHERE entidad = 'TRANSFERENCIA'
ORDER BY fecha_evento DESC, id_auditoria DESC;

-- 6. Comprobaciones relacionales: ambas deben devolver cero.
SELECT COUNT(*) AS eventos_usuario_sin_relacion
FROM registro_auditoria a LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
WHERE u.id_usuario IS NULL;

SELECT COUNT(*) AS eventos_sucursal_sin_relacion
FROM registro_auditoria a LEFT JOIN sucursal s ON s.id_sucursal = a.id_sucursal
WHERE a.id_sucursal IS NOT NULL AND s.id_sucursal IS NULL;
