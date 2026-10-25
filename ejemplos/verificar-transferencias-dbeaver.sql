-- DBeaver + Oracle XE: comprobaciones dinamicas, solo SELECT (no modifica datos).
-- 1. Transferencias y sucursales involucradas
SELECT t.id_transferencia, t.estado,
       so.codigo AS origen, sd.codigo AS destino,
       t.fecha_registro, t.fecha_despacho, t.fecha_recepcion
FROM transferencia t
JOIN sucursal so ON so.id_sucursal = t.id_sucursal_origen
JOIN sucursal sd ON sd.id_sucursal = t.id_sucursal_destino
ORDER BY t.id_transferencia DESC;

-- 2. Movimientos vinculados con cada detalle
SELECT dt.id_transferencia, dt.id_detalle_transferencia,
       dt.id_medicamento, dt.cantidad,
       SUM(CASE WHEN mi.tipo = 'TRANSFERENCIA_SALIDA' THEN mi.cantidad ELSE 0 END) AS unidades_salida,
       SUM(CASE WHEN mi.tipo = 'TRANSFERENCIA_ENTRADA' THEN mi.cantidad ELSE 0 END) AS unidades_entrada
FROM detalle_transferencia dt
LEFT JOIN movimiento_inventario mi ON mi.id_detalle_transferencia = dt.id_detalle_transferencia
GROUP BY dt.id_transferencia, dt.id_detalle_transferencia, dt.id_medicamento, dt.cantidad
ORDER BY dt.id_transferencia DESC, dt.id_medicamento;

-- 3. Debe devolver CERO filas: totales de salida/entrada incongruentes con estados.
WITH conteo AS (
  SELECT dt.id_transferencia, dt.id_detalle_transferencia, dt.cantidad,
         COUNT(CASE WHEN mi.tipo='TRANSFERENCIA_SALIDA' THEN 1 END) AS n_salida,
         SUM(CASE WHEN mi.tipo='TRANSFERENCIA_SALIDA' THEN mi.cantidad ELSE 0 END) AS c_salida,
         COUNT(CASE WHEN mi.tipo='TRANSFERENCIA_ENTRADA' THEN 1 END) AS n_entrada,
         SUM(CASE WHEN mi.tipo='TRANSFERENCIA_ENTRADA' THEN mi.cantidad ELSE 0 END) AS c_entrada
  FROM detalle_transferencia dt
  LEFT JOIN movimiento_inventario mi ON mi.id_detalle_transferencia = dt.id_detalle_transferencia
  GROUP BY dt.id_transferencia, dt.id_detalle_transferencia, dt.cantidad
)
SELECT t.id_transferencia, c.id_detalle_transferencia, t.estado,
       c.cantidad, c.n_salida, c.c_salida, c.n_entrada, c.c_entrada
FROM conteo c JOIN transferencia t ON t.id_transferencia = c.id_transferencia
WHERE (t.estado='REGISTRADA' AND (c.n_salida<>0 OR c.n_entrada<>0))
   OR (t.estado='EN_TRANSITO' AND (c.n_salida<>1 OR c.c_salida<>c.cantidad OR c.n_entrada<>0))
   OR (t.estado='RECIBIDA' AND (c.n_salida<>1 OR c.c_salida<>c.cantidad OR c.n_entrada<>1 OR c.c_entrada<>c.cantidad));

-- 4. Debe devolver CERO filas: saldo de cada inventario no coincide con historial.
WITH movimientos AS (
  SELECT id_sucursal, id_medicamento,
    SUM(CASE WHEN tipo IN ('INICIAL','AJUSTE_ENTRADA','TRANSFERENCIA_ENTRADA') THEN cantidad ELSE -cantidad END) AS esperado
  FROM movimiento_inventario GROUP BY id_sucursal, id_medicamento
)
SELECT i.id_sucursal, i.id_medicamento, i.cantidad_existente, m.esperado
FROM inventario_sucursal i
LEFT JOIN movimientos m ON m.id_sucursal=i.id_sucursal AND m.id_medicamento=i.id_medicamento
WHERE m.esperado IS NULL OR i.cantidad_existente <> m.esperado;

-- 5. Auditoria de las tres transiciones (resultados aumentan con las pruebas API)
SELECT id_registro AS id_transferencia, accion, id_usuario, id_sucursal, fecha_evento
FROM registro_auditoria WHERE entidad='TRANSFERENCIA'
ORDER BY fecha_evento DESC;
