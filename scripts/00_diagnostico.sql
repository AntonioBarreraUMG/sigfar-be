-- SIGFAR | 00_diagnostico.sql | DBeaver + Oracle XE
-- Ejecutar cada consulta con Ctrl+Enter o todo con Alt+X.
-- Antes de crear el esquema, confirme que usa el usuario apropiado dentro de la PDB.
SELECT
  USER AS usuario_conexion,
  SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS esquema_activo,
  SYS_CONTEXT('USERENV','CON_NAME') AS contenedor,
  SYS_CONTEXT('USERENV','DB_NAME') AS base_datos
FROM dual;

-- Si el contador es distinto de 0, NO ejecute 01_esquema.sql sobre este esquema sin revisar.
SELECT COUNT(*) AS tablas_sigfar_ya_existentes
FROM user_tables
WHERE table_name IN (
  'ROL','SUCURSAL','USUARIO','MEDICAMENTO','INVENTARIO_SUCURSAL',
  'TRANSFERENCIA','DETALLE_TRANSFERENCIA','SOLICITUD_ENTREGA',
  'DETALLE_SOLICITUD','MOVIMIENTO_INVENTARIO','MOVIMIENTO_EFECTIVO',
  'GASTO_PLANILLA','ACTIVO_FIJO','RESERVA_INVENTARIO','REGISTRO_AUDITORIA'
);
