-- SIGFAR v1.3 | Verificacion SOLO LECTURA en DBeaver / Oracle XE.
-- Ejecutar sentencia por sentencia (Ctrl+Enter) o como script (Alt+X).
-- No recrea tablas, no inserta ni modifica registros.

-- 1. Solicitudes y estados, con marca de retraso.
SELECT se.id_solicitud, se.estado, se.id_sucursal_asignada, se.forma_pago,
       se.fecha_estimada_entrega, se.fecha_entrega_real,
       CASE WHEN (se.estado = 'ENTREGADA' AND se.fecha_entrega_real > se.fecha_estimada_entrega)
               OR (se.estado IN ('CONFIRMADA','DESPACHADA') AND SYSTIMESTAMP > se.fecha_estimada_entrega)
            THEN 'S' ELSE 'N' END AS tardia
FROM solicitud_entrega se ORDER BY se.id_solicitud;

-- 2. Detalles y reservas (cada detalle puede tener una reserva).
SELECT se.id_solicitud, se.estado AS estado_solicitud,
       d.id_medicamento, d.cantidad AS cantidad_solicitada,
       r.estado AS estado_reserva, r.id_sucursal AS sucursal_reserva, r.cantidad AS cantidad_reservada
FROM solicitud_entrega se JOIN detalle_solicitud d ON d.id_solicitud = se.id_solicitud
LEFT JOIN reserva_inventario r ON r.id_detalle_solicitud = d.id_detalle_solicitud
ORDER BY se.id_solicitud, d.id_medicamento;

-- 3. Errores de conciliacion: reservas ACTIVA frente a cantidad_reservada del saldo.
-- Debe mostrar CERO filas si todos los movimientos han sido consistentes.
SELECT i.id_sucursal, i.id_medicamento,
       i.cantidad_reservada AS saldo_reservado, NVL(r.total_reservado, 0) AS detalle_reservado
FROM inventario_sucursal i
LEFT JOIN (
  SELECT r.id_sucursal, d.id_medicamento, SUM(r.cantidad) AS total_reservado
  FROM reserva_inventario r JOIN detalle_solicitud d
    ON d.id_detalle_solicitud = r.id_detalle_solicitud
  WHERE r.estado = 'ACTIVA' GROUP BY r.id_sucursal, d.id_medicamento
) r ON r.id_sucursal = i.id_sucursal AND r.id_medicamento = i.id_medicamento
WHERE i.cantidad_reservada <> NVL(r.total_reservado, 0);

-- 4. Errores: reservas activas que carecen de registro de inventario.
-- Debe mostrar CERO filas.
SELECT r.id_reserva, r.id_sucursal, d.id_medicamento
FROM reserva_inventario r
JOIN detalle_solicitud d ON d.id_detalle_solicitud = r.id_detalle_solicitud
LEFT JOIN inventario_sucursal i
  ON i.id_sucursal = r.id_sucursal AND i.id_medicamento = d.id_medicamento
WHERE r.estado = 'ACTIVA' AND i.id_sucursal IS NULL;

-- 5. Despachos de entrega duplicados para un mismo detalle.
-- Debe mostrar CERO filas.
SELECT id_detalle_solicitud, COUNT(*) AS salidas
FROM movimiento_inventario WHERE tipo = 'ENTREGA_SALIDA'
GROUP BY id_detalle_solicitud HAVING COUNT(*) > 1;

-- 6. Conciliacion fisica: saldos existentes frente al historial de entradas/salidas.
-- Debe mostrar CERO filas si no hay inconsistencias.
SELECT i.id_sucursal, i.id_medicamento, i.cantidad_existente,
       NVL(m.calculada, 0) AS saldo_calculado
FROM inventario_sucursal i
LEFT JOIN (
  SELECT id_sucursal, id_medicamento,
         SUM(CASE WHEN tipo IN ('INICIAL','AJUSTE_ENTRADA','TRANSFERENCIA_ENTRADA') THEN cantidad
                  ELSE -cantidad END) AS calculada
  FROM movimiento_inventario GROUP BY id_sucursal, id_medicamento
) m ON m.id_sucursal=i.id_sucursal AND m.id_medicamento=i.id_medicamento
WHERE i.cantidad_existente <> NVL(m.calculada,0);

-- 7. Auditoria de solicitudes y entregas; incluye el historial de demostracion.
SELECT a.id_auditoria, a.fecha_evento, a.id_usuario, a.id_sucursal,
       a.id_registro AS id_solicitud, a.accion
FROM registro_auditoria a WHERE a.entidad = 'SOLICITUD_ENTREGA'
ORDER BY a.id_auditoria DESC;
