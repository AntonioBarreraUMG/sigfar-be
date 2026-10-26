-- SIGFAR | 03_verificacion.sql | DBeaver + Oracle XE
-- Un UNICO SELECT; no requiere PL/SQL, DBMS_OUTPUT ni comandos de SQL*Plus.
-- Ejecutar despues de 01_esquema.sql y 02_datos_prueba.sql.
-- Esperados corresponden EXCLUSIVAMENTE a la carga ficticia original.
-- Resultado correcto: la columna ESTADO debe contener OK en TODAS las filas.
WITH pruebas (orden, prueba, esperado, obtenido) AS (
    SELECT 1, 'Tablas SIGFAR', 15, (
      SELECT COUNT(*) FROM user_tables WHERE table_name IN ('ROL','SUCURSAL','USUARIO','MEDICAMENTO','INVENTARIO_SUCURSAL','TRANSFERENCIA','DETALLE_TRANSFERENCIA','SOLICITUD_ENTREGA','DETALLE_SOLICITUD','MOVIMIENTO_INVENTARIO','MOVIMIENTO_EFECTIVO','GASTO_PLANILLA','ACTIVO_FIJO','RESERVA_INVENTARIO','REGISTRO_AUDITORIA')
    ) FROM dual
    UNION ALL
    SELECT 2, 'Claves foraneas', 30, (
      SELECT COUNT(*) FROM user_constraints WHERE constraint_type='R' AND table_name IN ('ROL','SUCURSAL','USUARIO','MEDICAMENTO','INVENTARIO_SUCURSAL','TRANSFERENCIA','DETALLE_TRANSFERENCIA','SOLICITUD_ENTREGA','DETALLE_SOLICITUD','MOVIMIENTO_INVENTARIO','MOVIMIENTO_EFECTIVO','GASTO_PLANILLA','ACTIVO_FIJO','RESERVA_INVENTARIO','REGISTRO_AUDITORIA')
    ) FROM dual
    UNION ALL
    SELECT 3, 'Indices de consulta', 11, (
      SELECT COUNT(*) FROM user_indexes WHERE index_name IN ('IX_MOV_INV_SUCURSAL_FECHA','IX_MOV_INV_MEDICAMENTO','IX_TRA_ORIGEN_ESTADO','IX_TRA_DESTINO_ESTADO','IX_MOV_EFE_SUCURSAL_FECHA','IX_SOL_ESTADO_FECHA','IX_SUC_UBICACION','IX_AUDIT_SUCURSAL_FECHA','IX_AUDIT_ENTIDAD_REGISTRO','IX_DET_TRA_MED','IX_DET_SOL_MED')
    ) FROM dual
    UNION ALL
    SELECT 4, 'Roles', 3, (
      SELECT COUNT(*) FROM rol
    ) FROM dual
    UNION ALL
    SELECT 5, 'Sucursales', 3, (
      SELECT COUNT(*) FROM sucursal
    ) FROM dual
    UNION ALL
    SELECT 6, 'Usuarios', 5, (
      SELECT COUNT(*) FROM usuario
    ) FROM dual
    UNION ALL
    SELECT 7, 'Medicamentos', 4, (
      SELECT COUNT(*) FROM medicamento
    ) FROM dual
    UNION ALL
    SELECT 8, 'Filas de inventario', 12, (
      SELECT COUNT(*) FROM inventario_sucursal
    ) FROM dual
    UNION ALL
    SELECT 9, 'Transferencias', 2, (
      SELECT COUNT(*) FROM transferencia
    ) FROM dual
    UNION ALL
    SELECT 10, 'Detalles de transferencia', 3, (
      SELECT COUNT(*) FROM detalle_transferencia
    ) FROM dual
    UNION ALL
    SELECT 11, 'Movimientos inventario', 19, (
      SELECT COUNT(*) FROM movimiento_inventario
    ) FROM dual
    UNION ALL
    SELECT 12, 'Solicitudes de entrega', 2, (
      SELECT COUNT(*) FROM solicitud_entrega
    ) FROM dual
    UNION ALL
    SELECT 13, 'Detalles de solicitud', 3, (
      SELECT COUNT(*) FROM detalle_solicitud
    ) FROM dual
    UNION ALL
    SELECT 14, 'Reservas', 3, (
      SELECT COUNT(*) FROM reserva_inventario
    ) FROM dual
    UNION ALL
    SELECT 15, 'Movimientos efectivo', 4, (
      SELECT COUNT(*) FROM movimiento_efectivo
    ) FROM dual
    UNION ALL
    SELECT 16, 'Gastos de planilla', 3, (
      SELECT COUNT(*) FROM gasto_planilla
    ) FROM dual
    UNION ALL
    SELECT 17, 'Activos fijos', 3, (
      SELECT COUNT(*) FROM activo_fijo
    ) FROM dual
    UNION ALL
    SELECT 18, 'Auditorias muestra', 5, (
      SELECT COUNT(*) FROM registro_auditoria
    ) FROM dual
    UNION ALL
    SELECT 19, 'Unidades en sucursales', 210, (
      SELECT NVL(SUM(cantidad_existente),0) FROM inventario_sucursal
    ) FROM dual
    UNION ALL
    SELECT 20, 'Unidades reservadas', 4, (
      SELECT NVL(SUM(cantidad_reservada),0) FROM inventario_sucursal
    ) FROM dual
    UNION ALL
    SELECT 21, 'Unidades disponibles', 206, (
      SELECT NVL(SUM(cantidad_existente-cantidad_reservada),0) FROM inventario_sucursal
    ) FROM dual
    UNION ALL
    SELECT 22, 'Saldos versus historial (errores)', 0, (
      SELECT COUNT(*) FROM (
       SELECT id_sucursal,id_medicamento,
       SUM(CASE WHEN tipo IN ('INICIAL','AJUSTE_ENTRADA','TRANSFERENCIA_ENTRADA')
                THEN cantidad ELSE -cantidad END) AS calculado
       FROM movimiento_inventario
       GROUP BY id_sucursal,id_medicamento
      ) historia
      FULL OUTER JOIN inventario_sucursal inv
       ON inv.id_sucursal = historia.id_sucursal AND inv.id_medicamento = historia.id_medicamento
      WHERE historia.id_sucursal IS NULL OR inv.id_sucursal IS NULL
       OR historia.calculado <> inv.cantidad_existente
    ) FROM dual
    UNION ALL
    SELECT 23, 'Reservas versus inventario (errores)', 0, (
      SELECT COUNT(*) FROM inventario_sucursal inv
      LEFT JOIN (
       SELECT r.id_sucursal, ds.id_medicamento,
       SUM(CASE WHEN r.estado='ACTIVA' THEN r.cantidad ELSE 0 END) AS reservada
       FROM reserva_inventario r JOIN detalle_solicitud ds ON ds.id_detalle_solicitud=r.id_detalle_solicitud
       GROUP BY r.id_sucursal,ds.id_medicamento
      ) r ON r.id_sucursal=inv.id_sucursal AND r.id_medicamento=inv.id_medicamento
      WHERE inv.cantidad_reservada <> NVL(r.reservada,0)
    ) FROM dual
    UNION ALL
    SELECT 24, 'Reservas sin inventario (errores)', 0, (
      SELECT COUNT(*) FROM reserva_inventario r
      JOIN detalle_solicitud ds ON ds.id_detalle_solicitud=r.id_detalle_solicitud
      LEFT JOIN inventario_sucursal inv
       ON inv.id_sucursal=r.id_sucursal AND inv.id_medicamento=ds.id_medicamento
      WHERE inv.id_sucursal IS NULL OR r.cantidad <> ds.cantidad
    ) FROM dual
    UNION ALL
    SELECT 25, 'Transferencias inconsistentes (errores)', 0, (
      SELECT COUNT(*) FROM (
       SELECT dt.id_detalle_transferencia,dt.cantidad,t.estado,
       NVL((SELECT SUM(mi.cantidad) FROM movimiento_inventario mi
            WHERE mi.id_detalle_transferencia=dt.id_detalle_transferencia
              AND mi.tipo='TRANSFERENCIA_SALIDA'),0) AS salidas,
       NVL((SELECT SUM(mi.cantidad) FROM movimiento_inventario mi
            WHERE mi.id_detalle_transferencia=dt.id_detalle_transferencia
              AND mi.tipo='TRANSFERENCIA_ENTRADA'),0) AS entradas
       FROM detalle_transferencia dt
       JOIN transferencia t ON t.id_transferencia=dt.id_transferencia
      ) resumen
      WHERE salidas <> cantidad OR (estado='RECIBIDA' AND entradas<>cantidad)
       OR (estado='EN_TRANSITO' AND entradas<>0)
    ) FROM dual
    UNION ALL
    SELECT 26, 'Unidades en transito', 2, (
      SELECT NVL(SUM(dt.cantidad),0) FROM detalle_transferencia dt
      JOIN transferencia t ON t.id_transferencia=dt.id_transferencia
      WHERE t.estado='EN_TRANSITO'
    ) FROM dual
    UNION ALL
    SELECT 27, 'Unidades iniciales', 215, (
      SELECT NVL(SUM(cantidad),0) FROM movimiento_inventario WHERE tipo='INICIAL'
    ) FROM dual
    UNION ALL
    SELECT 28, 'Unidades entregadas', 3, (
      SELECT NVL(SUM(cantidad),0) FROM movimiento_inventario WHERE tipo='ENTREGA_SALIDA'
    ) FROM dual
    UNION ALL
    SELECT 29, 'Entregas tardias', 1, (
      SELECT COUNT(*) FROM solicitud_entrega WHERE estado='ENTREGADA' AND fecha_entrega_real>fecha_estimada_entrega
    ) FROM dual
    UNION ALL
    SELECT 30, 'Flujo neto efectivo GTQ', 2050, (
      SELECT NVL(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END),0) FROM movimiento_efectivo
    ) FROM dual
    UNION ALL
    SELECT 31, 'Total gastos planilla GTQ', 16300, (
      SELECT NVL(SUM(monto_total),0) FROM gasto_planilla
    ) FROM dual
    UNION ALL
    SELECT 32, 'Total activos vigentes GTQ', 9800, (
      SELECT NVL(SUM(valor),0) FROM activo_fijo WHERE estado='VIGENTE'
    ) FROM dual
)
SELECT orden, prueba, esperado, obtenido,
       CASE WHEN esperado=obtenido THEN 'OK' ELSE 'ERROR' END AS estado
FROM pruebas
ORDER BY orden;
