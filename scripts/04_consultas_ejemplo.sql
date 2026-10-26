-- DBeaver / Oracle XE | 04: Consultas (CTRL+ENTER sobre cada SELECT).
-- SIGFAR | 04_consultas_ejemplo.sql
-- Consultas de lectura para la demostracion. No alteran informacion.
COLUMN sucursal FORMAT A24
COLUMN medicamento FORMAT A32
COLUMN estado FORMAT A15
COLUMN tipo FORMAT A14
COLUMN departamento FORMAT A18
COLUMN municipio FORMAT A18

-- === 1. Inventario y disponibilidad por sucursal ===
SELECT s.codigo AS sucursal, m.codigo AS medicamento_codigo,
       m.nombre AS medicamento,
       i.cantidad_existente, i.cantidad_reservada,
       (i.cantidad_existente - i.cantidad_reservada) AS cantidad_disponible
FROM inventario_sucursal i
JOIN sucursal s ON s.id_sucursal = i.id_sucursal
JOIN medicamento m ON m.id_medicamento = i.id_medicamento
ORDER BY s.codigo, m.codigo;

-- === 2. Transferencias y estado de recepcion ===
SELECT t.id_transferencia, so.codigo AS origen, sd.codigo AS destino,
       t.estado, t.fecha_despacho, t.fecha_recepcion
FROM transferencia t
JOIN sucursal so ON so.id_sucursal = t.id_sucursal_origen
JOIN sucursal sd ON sd.id_sucursal = t.id_sucursal_destino
ORDER BY t.id_transferencia;

-- === 3. Flujo de efectivo registrado por sucursal ===
SELECT s.codigo AS sucursal,
       NVL(SUM(CASE WHEN e.tipo='INGRESO' THEN e.monto ELSE 0 END),0) AS ingresos,
       NVL(SUM(CASE WHEN e.tipo='EGRESO' THEN e.monto ELSE 0 END),0) AS egresos,
       NVL(SUM(CASE WHEN e.tipo='INGRESO' THEN e.monto ELSE -e.monto END),0) AS flujo_neto
FROM sucursal s
LEFT JOIN movimiento_efectivo e ON e.id_sucursal=s.id_sucursal
GROUP BY s.codigo
ORDER BY s.codigo;

-- === 4. Planilla por periodo ===
SELECT s.codigo AS sucursal, p.periodo, p.monto_total
FROM gasto_planilla p
JOIN sucursal s ON s.id_sucursal=p.id_sucursal
ORDER BY p.periodo, s.codigo;

-- === 5. Valor de activos vigentes por sucursal ===
SELECT s.codigo AS sucursal,
       NVL(SUM(CASE WHEN a.estado='VIGENTE' THEN a.valor ELSE 0 END),0) AS valor_activos
FROM sucursal s
LEFT JOIN activo_fijo a ON a.id_sucursal=s.id_sucursal
GROUP BY s.codigo
ORDER BY s.codigo;

-- === 6. Farmacias elegibles para un pedido hipotetico en Guatemala ===
-- Se solicitan 2 cajas de MED-001 y 1 caja de MED-004.
-- La cobertura academica es por municipio; no se calculan rutas GPS.
WITH solicitado AS (
  SELECT 1 AS id_medicamento, 2 AS cantidad FROM dual
  UNION ALL SELECT 4, 1 FROM dual
)
SELECT s.codigo AS sucursal, s.departamento, s.municipio,
       s.tiempo_entrega_min
FROM sucursal s
CROSS JOIN solicitado pedido
LEFT JOIN inventario_sucursal i
  ON i.id_sucursal=s.id_sucursal AND i.id_medicamento=pedido.id_medicamento
WHERE s.activa='S' AND s.departamento='Guatemala' AND s.municipio='Guatemala'
GROUP BY s.codigo,s.departamento,s.municipio,s.tiempo_entrega_min
HAVING COUNT(*)=SUM(CASE WHEN (i.cantidad_existente-i.cantidad_reservada)>=pedido.cantidad
                       THEN 1 ELSE 0 END)
ORDER BY s.tiempo_entrega_min;

-- === 7. Entregas tardias o pendientes fuera de plazo ===
SELECT id_solicitud, estado, fecha_estimada_entrega, fecha_entrega_real,
       CASE WHEN estado='ENTREGADA' THEN 'ENTREGADA_TARDE' ELSE 'PENDIENTE_TARDE' END AS tipo_retraso
FROM solicitud_entrega
WHERE (estado='ENTREGADA' AND fecha_entrega_real > fecha_estimada_entrega)
   OR (estado IN ('CONFIRMADA','DESPACHADA') AND fecha_estimada_entrega < SYSTIMESTAMP)
ORDER BY id_solicitud;

-- === 8. Auditoria por usuario, sucursal y evento ===
SELECT a.id_auditoria, u.correo, s.codigo AS sucursal, a.entidad, a.accion, a.fecha_evento
FROM registro_auditoria a
JOIN usuario u ON u.id_usuario=a.id_usuario
LEFT JOIN sucursal s ON s.id_sucursal=a.id_sucursal
ORDER BY a.fecha_evento DESC;

