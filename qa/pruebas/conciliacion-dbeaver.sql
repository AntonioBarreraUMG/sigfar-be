-- SIGFAR QA / DBeaver / Oracle XE: SOLO LECTURA.
-- Ejecutar en el esquema que utiliza el backend de QA, DESPUÉS de las pruebas HTTP.
-- Los seis resultados de inconsistencias esperados son cero.

-- 1. Existencias reales vs. suma algebraica del historial.
SELECT '01_SALDO_VS_HISTORIAL' AS comprobacion, COUNT(*) AS inconsistencias
FROM inventario_sucursal i
WHERE i.cantidad_existente <> NVL((
    SELECT SUM(CASE
      WHEN mi.tipo IN ('INICIAL','AJUSTE_ENTRADA','TRANSFERENCIA_ENTRADA') THEN mi.cantidad
      WHEN mi.tipo IN ('AJUSTE_SALIDA','TRANSFERENCIA_SALIDA','ENTREGA_SALIDA') THEN -mi.cantidad
      ELSE 0 END)
    FROM movimiento_inventario mi
    WHERE mi.id_sucursal = i.id_sucursal AND mi.id_medicamento = i.id_medicamento
),0);

-- 2. Inventario reservado vs. suma de reservas activas.
SELECT '02_RESERVADO_VS_RESERVAS_ACTIVAS' AS comprobacion, COUNT(*) AS inconsistencias
FROM inventario_sucursal i
WHERE i.cantidad_reservada <> NVL((
    SELECT SUM(r.cantidad)
    FROM reserva_inventario r
    JOIN detalle_solicitud d ON d.id_detalle_solicitud = r.id_detalle_solicitud
    WHERE r.id_sucursal = i.id_sucursal AND d.id_medicamento = i.id_medicamento
      AND r.estado = 'ACTIVA'
),0);

-- 3. Reservas activas sin saldo correspondiente.
SELECT '03_RESERVA_SIN_INVENTARIO' AS comprobacion, COUNT(*) AS inconsistencias
FROM reserva_inventario r
JOIN detalle_solicitud d ON d.id_detalle_solicitud = r.id_detalle_solicitud
WHERE r.estado = 'ACTIVA'
  AND NOT EXISTS (
    SELECT 1 FROM inventario_sucursal i
    WHERE i.id_sucursal = r.id_sucursal AND i.id_medicamento = d.id_medicamento
  );

-- 4. Cada detalle despachado/recibido tiene exactamente el movimiento esperado.
SELECT '04_TRANSFERENCIAS_VS_MOVIMIENTOS' AS comprobacion, COUNT(*) AS inconsistencias
FROM (
 SELECT t.estado,
   (SELECT COUNT(*) FROM movimiento_inventario mi
    WHERE mi.id_detalle_transferencia = dt.id_detalle_transferencia
      AND mi.tipo = 'TRANSFERENCIA_SALIDA') AS salidas,
   (SELECT COUNT(*) FROM movimiento_inventario mi
    WHERE mi.id_detalle_transferencia = dt.id_detalle_transferencia
      AND mi.tipo = 'TRANSFERENCIA_ENTRADA') AS entradas
 FROM transferencia t
 JOIN detalle_transferencia dt ON dt.id_transferencia = t.id_transferencia
)
WHERE (estado = 'REGISTRADA' AND (salidas <> 0 OR entradas <> 0))
   OR (estado = 'EN_TRANSITO' AND (salidas <> 1 OR entradas <> 0))
   OR (estado = 'RECIBIDA' AND (salidas <> 1 OR entradas <> 1));

-- 5. Reservas consistentes con el estado de la solicitud.
SELECT '05_SOLICITUD_VS_RESERVA' AS comprobacion, COUNT(*) AS inconsistencias
FROM reserva_inventario r
JOIN detalle_solicitud d ON d.id_detalle_solicitud = r.id_detalle_solicitud
JOIN solicitud_entrega s ON s.id_solicitud = d.id_solicitud
WHERE (s.estado = 'CONFIRMADA' AND r.estado <> 'ACTIVA')
   OR (s.estado IN ('DESPACHADA','ENTREGADA') AND r.estado <> 'CONSUMIDA')
   OR (s.estado = 'CANCELADA' AND r.estado <> 'LIBERADA');

-- 6. Para cada entrega despachada/entregada hay una sola salida por detalle.
SELECT '06_ENTREGA_VS_MOVIMIENTO' AS comprobacion, COUNT(*) AS inconsistencias
FROM detalle_solicitud d
JOIN solicitud_entrega s ON s.id_solicitud = d.id_solicitud
WHERE s.estado IN ('DESPACHADA','ENTREGADA')
  AND (SELECT COUNT(*) FROM movimiento_inventario m
       WHERE m.id_detalle_solicitud = d.id_detalle_solicitud
         AND m.tipo = 'ENTREGA_SALIDA') <> 1;

-- Totales VARIABLES después de pruebas de escritura: no comparar con el fixture original.
SELECT 'INVENTARIO_EXISTENTE' AS concepto, SUM(cantidad_existente) AS total
FROM inventario_sucursal
UNION ALL
SELECT 'INVENTARIO_RESERVADO', SUM(cantidad_reservada) FROM inventario_sucursal
UNION ALL
SELECT 'EN_TRANSITO', NVL(SUM(dt.cantidad),0)
FROM detalle_transferencia dt JOIN transferencia t ON t.id_transferencia=dt.id_transferencia
WHERE t.estado='EN_TRANSITO'
UNION ALL
SELECT 'FLUJO_NETO_GTQ', NVL(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END),0)
FROM movimiento_efectivo
UNION ALL
SELECT 'GASTOS_PLANILLA_GTQ', NVL(SUM(monto_total),0) FROM gasto_planilla
UNION ALL
SELECT 'ACTIVOS_VIGENTES_GTQ', NVL(SUM(valor),0) FROM activo_fijo WHERE estado='VIGENTE';
