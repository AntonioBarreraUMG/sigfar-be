-- SIGFAR Backend v1.2: consultas de SOLO LECTURA para DBeaver/Oracle XE.
-- Ejecutar desde el esquema SIGFAR. No depende de montos fijos de la muestra.

-- 1. Flujo de efectivo consolidado.
SELECT NVL(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE 0 END),0) AS ingresos_gtq,
       NVL(SUM(CASE WHEN tipo='EGRESO' THEN monto ELSE 0 END),0) AS egresos_gtq,
       NVL(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END),0) AS flujo_neto_gtq
FROM movimiento_efectivo;

-- 2. Flujo de efectivo por sucursal.
SELECT s.id_sucursal, s.nombre,
       NVL(SUM(CASE WHEN m.tipo='INGRESO' THEN m.monto ELSE 0 END),0) AS ingresos_gtq,
       NVL(SUM(CASE WHEN m.tipo='EGRESO' THEN m.monto ELSE 0 END),0) AS egresos_gtq,
       NVL(SUM(CASE WHEN m.tipo='INGRESO' THEN m.monto ELSE -m.monto END),0) AS flujo_neto_gtq
FROM sucursal s LEFT JOIN movimiento_efectivo m ON m.id_sucursal=s.id_sucursal
GROUP BY s.id_sucursal, s.nombre
ORDER BY s.id_sucursal;

-- 3. Planilla consolidada y por sucursal.
SELECT s.id_sucursal, s.nombre, NVL(SUM(p.monto_total),0) AS gasto_planilla_gtq
FROM sucursal s LEFT JOIN gasto_planilla p ON p.id_sucursal=s.id_sucursal
GROUP BY s.id_sucursal, s.nombre
ORDER BY s.id_sucursal;

-- 4. Activos vigentes: valor consolidado y por sucursal.
SELECT s.id_sucursal, s.nombre, COUNT(a.id_activo) AS activos_vigentes,
       NVL(SUM(a.valor),0) AS valor_activos_gtq
FROM sucursal s LEFT JOIN activo_fijo a
  ON a.id_sucursal=s.id_sucursal AND a.estado='VIGENTE'
GROUP BY s.id_sucursal, s.nombre
ORDER BY s.id_sucursal;

-- 5. Comprobaciones de integridad. Cada contador debe ser cero.
SELECT 'Planillas duplicadas por sucursal y periodo' AS comprobacion, COUNT(*) AS errores
FROM (SELECT id_sucursal, periodo FROM gasto_planilla GROUP BY id_sucursal, periodo HAVING COUNT(*)>1)
UNION ALL
SELECT 'Movimientos con importe no positivo', COUNT(*) FROM movimiento_efectivo WHERE monto<=0
UNION ALL
SELECT 'Planillas con importe negativo', COUNT(*) FROM gasto_planilla WHERE monto_total<0
UNION ALL
SELECT 'Activos con valor negativo', COUNT(*) FROM activo_fijo WHERE valor<0
UNION ALL
SELECT 'Activos con estado desconocido', COUNT(*) FROM activo_fijo WHERE estado NOT IN ('VIGENTE','BAJA');

-- 6. Auditoria de los registros creados desde el backend; IDs >=1000.
-- Se evita exigir auditoria de toda la carga inicial, que pudo haberse insertado mediante SQL directo.
SELECT 'Efectivo sin auditoria de registro' AS comprobacion, COUNT(*) AS errores
FROM movimiento_efectivo m WHERE m.id_movimiento_efectivo>=1000 AND NOT EXISTS (
  SELECT 1 FROM registro_auditoria a WHERE a.entidad='MOVIMIENTO_EFECTIVO'
    AND a.accion='REGISTRAR' AND a.id_registro=m.id_movimiento_efectivo)
UNION ALL
SELECT 'Planillas sin auditoria de registro', COUNT(*) FROM gasto_planilla p
WHERE p.id_gasto_planilla>=1000 AND NOT EXISTS (
  SELECT 1 FROM registro_auditoria a WHERE a.entidad='GASTO_PLANILLA'
    AND a.accion='REGISTRAR' AND a.id_registro=p.id_gasto_planilla)
UNION ALL
SELECT 'Activos sin auditoria de registro', COUNT(*) FROM activo_fijo f
WHERE f.id_activo>=1000 AND NOT EXISTS (
  SELECT 1 FROM registro_auditoria a WHERE a.entidad='ACTIVO_FIJO'
    AND a.accion='REGISTRAR' AND a.id_registro=f.id_activo);

-- 7. Historial administrativo (los ultimos 30 eventos).
SELECT a.id_auditoria, a.fecha_evento, a.entidad, a.accion,
       a.id_registro, a.id_sucursal, u.correo AS usuario
FROM registro_auditoria a JOIN usuario u ON u.id_usuario=a.id_usuario
WHERE a.entidad IN ('MOVIMIENTO_EFECTIVO','GASTO_PLANILLA','ACTIVO_FIJO')
ORDER BY a.fecha_evento DESC, a.id_auditoria DESC
FETCH FIRST 30 ROWS ONLY;
