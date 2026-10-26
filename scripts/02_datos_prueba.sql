-- DBeaver / Oracle XE | 02: Datos de demostracion (ALT+X, una sola vez).
-- SIGFAR | 02_datos_prueba.sql
-- Datos FICTICIOS y minimos para comprobar el prototipo universitario.
-- Requiere 01_esquema.sql. Ejecutar UNA VEZ sobre esquema vacio.
-- Usuario de demostracion: correos @sigfar.test; contrasena comun: Demo2026!
-- Los hashes son scrypt de Node.js (N=16384,r=8,p=1), salts hex de 16 bytes,
-- salida hex de 64 bytes. No usar credenciales de demostracion en produccion.

INSERT ALL
 INTO rol (id_rol, nombre) VALUES (1, 'ADMIN_CENTRAL')
 INTO rol (id_rol, nombre) VALUES (2, 'ENCARGADO')
 INTO rol (id_rol, nombre) VALUES (3, 'COORD_ENTREGAS')
SELECT 1 FROM dual;

INSERT ALL
 INTO sucursal (id_sucursal,codigo,nombre,tipo,departamento,municipio,direccion,tiempo_entrega_min,activa)
  VALUES (1,'GUA-001','Farmacia Centro Guatemala','CENTRO_COMERCIAL','Guatemala','Guatemala','Centro comercial ficticio, zona 1',40,'S')
 INTO sucursal (id_sucursal,codigo,nombre,tipo,departamento,municipio,direccion,tiempo_entrega_min,activa)
  VALUES (2,'QUE-001','Farmacia Centro Xela','CENTRO_COMERCIAL','Quetzaltenango','Quetzaltenango','Centro comercial ficticio, zona 3',50,'S')
 INTO sucursal (id_sucursal,codigo,nombre,tipo,departamento,municipio,direccion,tiempo_entrega_min,activa)
  VALUES (3,'ESC-001','Stand Farmacia Escuintla','GASOLINERA','Escuintla','Escuintla','Gasolinera ficticia, carretera principal',30,'S')
SELECT 1 FROM dual;

INSERT ALL
 INTO usuario (id_usuario,id_rol,id_sucursal,nombre,correo,clave_hash,activo) VALUES
  (1,1,NULL,'Administracion Demo','admin@sigfar.test',
  'scrypt$16384$8$1$956fc5f3f7b3dbdc820abe8711285bee$a7fd4526b11c5da43470445d0644d735c45a418cf123ebcfbb3f6a3a3703bca78103b5cab71e3c2ecb401656c6a9716184e2405dbfb74e52f842205f0b813a06','S')
 INTO usuario (id_usuario,id_rol,id_sucursal,nombre,correo,clave_hash,activo) VALUES
  (2,2,1,'Encargado Guatemala Demo','guatemala@sigfar.test',
  'scrypt$16384$8$1$0a9301eb3315e2f42daf62803b59e5c5$dcb5375f3a194eca77124c79394371c97e6746fa8d25715d9ddce1b91132e06c1fcbe3b96d1e40d5eedee057f60f86d667a2f45784832fa7aafca27a0830d8df','S')
 INTO usuario (id_usuario,id_rol,id_sucursal,nombre,correo,clave_hash,activo) VALUES
  (3,2,2,'Encargado Quetzaltenango Demo','quetzaltenango@sigfar.test',
  'scrypt$16384$8$1$e85ae7bba245f020122c65fbcd854870$de8f0c186711d98f5e27ea37e4ab88a0b8d8d94b35e45ee65002fdb5fbc1305ad44cdeafc2627ad55437262b622616d27ff09f5ef20922e47301b05b780b9bec','S')
 INTO usuario (id_usuario,id_rol,id_sucursal,nombre,correo,clave_hash,activo) VALUES
  (4,2,3,'Encargado Escuintla Demo','escuintla@sigfar.test',
  'scrypt$16384$8$1$4681403fc3d4ed143c36380eea001880$03708d2a7cb9f06556b68cafb53c932c398a6a52312cab8d49b4c5d8acffedd5393d5b3db6d9ff37851f88e294feca410931ad164e14817a386c646265cfb654','S')
 INTO usuario (id_usuario,id_rol,id_sucursal,nombre,correo,clave_hash,activo) VALUES
  (5,3,NULL,'Coordinacion Demo','entregas@sigfar.test',
  'scrypt$16384$8$1$c2bbe8f38fd93531ac566d0e7d790f58$999e623f444b79baf7990646d808e2ba42faa88f9dd8a35bf8327c58b3ada18306330f5198363d43ba16d9e111622d6519317300f1cf61191e131c2944a895a2','S')
SELECT 1 FROM dual;

INSERT ALL
 INTO medicamento (id_medicamento,codigo,nombre,presentacion) VALUES (1,'MED-001','Paracetamol 500 mg','Caja de 10 tabletas')
 INTO medicamento (id_medicamento,codigo,nombre,presentacion) VALUES (2,'MED-002','Ibuprofeno 400 mg','Caja de 10 tabletas')
 INTO medicamento (id_medicamento,codigo,nombre,presentacion) VALUES (3,'MED-003','Sales de rehidratacion oral','Sobre')
 INTO medicamento (id_medicamento,codigo,nombre,presentacion) VALUES (4,'MED-004','Omeprazol 20 mg','Caja de 14 capsulas')
SELECT 1 FROM dual;

-- Saldos finales despues de las transferencias y solicitudes ficticias de abajo.
-- Guatemala: inicial 50,25,30,18; transf salientes 5,3; despacho entrega 2,1.
-- Quetzaltenango: inicial 18,12,20,8; transf entrantes 5,3; reserva activa 4 del medicamento 3.
-- Escuintla: inicial 12,8,10,4; transf en transito 2 del medicamento 3.
INSERT ALL
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (1,1,43,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (1,2,22,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (1,3,30,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (1,4,17,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (2,1,23,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (2,2,15,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (2,3,20,4)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (2,4,8,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (3,1,12,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (3,2,8,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (3,3,8,0)
 INTO inventario_sucursal (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada) VALUES (3,4,4,0)
SELECT 1 FROM dual;

INSERT INTO transferencia (
  id_transferencia,id_sucursal_origen,id_sucursal_destino,id_usuario_registro,
  id_usuario_despacho,id_usuario_recepcion,estado,fecha_registro,fecha_despacho,fecha_recepcion
) VALUES (
  1,1,2,2,2,3,'RECIBIDA',SYSTIMESTAMP - INTERVAL '10' DAY,
  SYSTIMESTAMP - INTERVAL '9' DAY,SYSTIMESTAMP - INTERVAL '8' DAY
);
INSERT INTO transferencia (
  id_transferencia,id_sucursal_origen,id_sucursal_destino,id_usuario_registro,
  id_usuario_despacho,estado,fecha_registro,fecha_despacho
) VALUES (
  2,3,1,4,4,'EN_TRANSITO',SYSTIMESTAMP - INTERVAL '3' DAY,
  SYSTIMESTAMP - INTERVAL '2' DAY
);

INSERT ALL
 INTO detalle_transferencia (id_detalle_transferencia,id_transferencia,id_medicamento,cantidad) VALUES (1,1,1,5)
 INTO detalle_transferencia (id_detalle_transferencia,id_transferencia,id_medicamento,cantidad) VALUES (2,1,2,3)
 INTO detalle_transferencia (id_detalle_transferencia,id_transferencia,id_medicamento,cantidad) VALUES (3,2,3,2)
SELECT 1 FROM dual;

-- Solicitud 1: completada tardia (plazo estimado 80 minutos; entrega real a 110 minutos).
INSERT INTO solicitud_entrega (
  id_solicitud,id_usuario_registro,id_sucursal_asignada,cliente_nombre,cliente_telefono,
  departamento_entrega,municipio_entrega,direccion_entrega,forma_pago,estado,
  fecha_solicitud,fecha_confirmacion,fecha_despacho,fecha_estimada_entrega,fecha_entrega_real
) VALUES (
  1,5,1,'Cliente Ficticio Uno','5550-0001','Guatemala','Guatemala',
  'Direccion ficticia zona 1','EFECTIVO','ENTREGADA',
  SYSTIMESTAMP - INTERVAL '2' DAY,
  SYSTIMESTAMP - INTERVAL '2' DAY + NUMTODSINTERVAL(10,'MINUTE'),
  SYSTIMESTAMP - INTERVAL '2' DAY + NUMTODSINTERVAL(30,'MINUTE'),
  SYSTIMESTAMP - INTERVAL '2' DAY + NUMTODSINTERVAL(80,'MINUTE'),
  SYSTIMESTAMP - INTERVAL '2' DAY + NUMTODSINTERVAL(110,'MINUTE')
);
-- Solicitud 2: confirmada con 4 unidades reservadas en Quetzaltenango.
INSERT INTO solicitud_entrega (
  id_solicitud,id_usuario_registro,id_sucursal_asignada,cliente_nombre,cliente_telefono,
  departamento_entrega,municipio_entrega,direccion_entrega,forma_pago,estado,
  fecha_solicitud,fecha_confirmacion,fecha_estimada_entrega
) VALUES (
  2,5,2,'Cliente Ficticio Dos','5550-0002','Quetzaltenango','Quetzaltenango',
  'Direccion ficticia zona 3','TARJETA','CONFIRMADA',
  SYSTIMESTAMP - NUMTODSINTERVAL(30,'MINUTE'),
  SYSTIMESTAMP - NUMTODSINTERVAL(20,'MINUTE'),
  SYSTIMESTAMP + NUMTODSINTERVAL(30,'MINUTE')
);

INSERT ALL
 INTO detalle_solicitud (id_detalle_solicitud,id_solicitud,id_medicamento,cantidad) VALUES (1,1,1,2)
 INTO detalle_solicitud (id_detalle_solicitud,id_solicitud,id_medicamento,cantidad) VALUES (2,1,4,1)
 INTO detalle_solicitud (id_detalle_solicitud,id_solicitud,id_medicamento,cantidad) VALUES (3,2,3,4)
SELECT 1 FROM dual;

INSERT ALL
 INTO reserva_inventario (id_reserva,id_detalle_solicitud,id_sucursal,cantidad,estado,fecha_reserva)
  VALUES (1,1,1,2,'CONSUMIDA',SYSTIMESTAMP - INTERVAL '2' DAY + NUMTODSINTERVAL(10,'MINUTE'))
 INTO reserva_inventario (id_reserva,id_detalle_solicitud,id_sucursal,cantidad,estado,fecha_reserva)
  VALUES (2,2,1,1,'CONSUMIDA',SYSTIMESTAMP - INTERVAL '2' DAY + NUMTODSINTERVAL(10,'MINUTE'))
 INTO reserva_inventario (id_reserva,id_detalle_solicitud,id_sucursal,cantidad,estado,fecha_reserva)
  VALUES (3,3,2,4,'ACTIVA',SYSTIMESTAMP - NUMTODSINTERVAL(20,'MINUTE'))
SELECT 1 FROM dual;

-- Las 12 existencias iniciales sucedieron antes de los movimientos posteriores.
INSERT ALL
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (1,1,1,2,'INICIAL',50,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (2,1,2,2,'INICIAL',25,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (3,1,3,2,'INICIAL',30,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (4,1,4,2,'INICIAL',18,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (5,2,1,3,'INICIAL',18,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (6,2,2,3,'INICIAL',12,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (7,2,3,3,'INICIAL',20,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (8,2,4,3,'INICIAL',8,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (9,3,1,4,'INICIAL',12,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (10,3,2,4,'INICIAL',8,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (11,3,3,4,'INICIAL',10,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,tipo,cantidad,motivo,fecha_movimiento) VALUES (12,3,4,4,'INICIAL',4,'Carga inicial ficticia',SYSTIMESTAMP - INTERVAL '12' DAY)
SELECT 1 FROM dual;

-- Despacho y recepcion completos de transferencia 1; transferencia 2 sigue en transito.
INSERT ALL
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,id_detalle_transferencia,tipo,cantidad,fecha_movimiento)
  VALUES (13,1,1,2,1,'TRANSFERENCIA_SALIDA',5,SYSTIMESTAMP - INTERVAL '9' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,id_detalle_transferencia,tipo,cantidad,fecha_movimiento)
  VALUES (14,1,2,2,2,'TRANSFERENCIA_SALIDA',3,SYSTIMESTAMP - INTERVAL '9' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,id_detalle_transferencia,tipo,cantidad,fecha_movimiento)
  VALUES (15,2,1,3,1,'TRANSFERENCIA_ENTRADA',5,SYSTIMESTAMP - INTERVAL '8' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,id_detalle_transferencia,tipo,cantidad,fecha_movimiento)
  VALUES (16,2,2,3,2,'TRANSFERENCIA_ENTRADA',3,SYSTIMESTAMP - INTERVAL '8' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,id_detalle_transferencia,tipo,cantidad,fecha_movimiento)
  VALUES (17,3,3,4,3,'TRANSFERENCIA_SALIDA',2,SYSTIMESTAMP - INTERVAL '2' DAY)
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,id_detalle_solicitud,tipo,cantidad,fecha_movimiento)
  VALUES (18,1,1,2,1,'ENTREGA_SALIDA',2,SYSTIMESTAMP - INTERVAL '2' DAY + NUMTODSINTERVAL(30,'MINUTE'))
 INTO movimiento_inventario (id_movimiento,id_sucursal,id_medicamento,id_usuario,id_detalle_solicitud,tipo,cantidad,fecha_movimiento)
  VALUES (19,1,4,2,2,'ENTREGA_SALIDA',1,SYSTIMESTAMP - INTERVAL '2' DAY + NUMTODSINTERVAL(30,'MINUTE'))
SELECT 1 FROM dual;

INSERT ALL
 INTO movimiento_efectivo (id_movimiento_efectivo,id_sucursal,id_usuario,tipo,concepto,monto,fecha_movimiento)
  VALUES (1,1,2,'INGRESO','Ingreso de efectivo ficticio',1500.00,SYSTIMESTAMP - INTERVAL '1' DAY)
 INTO movimiento_efectivo (id_movimiento_efectivo,id_sucursal,id_usuario,tipo,concepto,monto,fecha_movimiento)
  VALUES (2,1,2,'EGRESO','Egreso operativo ficticio',150.00,SYSTIMESTAMP - INTERVAL '1' DAY)
 INTO movimiento_efectivo (id_movimiento_efectivo,id_sucursal,id_usuario,tipo,concepto,monto,fecha_movimiento)
  VALUES (3,2,3,'INGRESO','Ingreso de efectivo ficticio',800.00,SYSTIMESTAMP - INTERVAL '1' DAY)
 INTO movimiento_efectivo (id_movimiento_efectivo,id_sucursal,id_usuario,tipo,concepto,monto,fecha_movimiento)
  VALUES (4,3,4,'EGRESO','Egreso operativo ficticio',100.00,SYSTIMESTAMP - INTERVAL '1' DAY)
SELECT 1 FROM dual;

INSERT ALL
 INTO gasto_planilla (id_gasto_planilla,id_sucursal,id_usuario,periodo,monto_total)
  VALUES (1,1,2,TO_CHAR(CURRENT_DATE,'YYYY-MM'),7000.00)
 INTO gasto_planilla (id_gasto_planilla,id_sucursal,id_usuario,periodo,monto_total)
  VALUES (2,2,3,TO_CHAR(CURRENT_DATE,'YYYY-MM'),5500.00)
 INTO gasto_planilla (id_gasto_planilla,id_sucursal,id_usuario,periodo,monto_total)
  VALUES (3,3,4,TO_CHAR(CURRENT_DATE,'YYYY-MM'),3800.00)
SELECT 1 FROM dual;

INSERT ALL
 INTO activo_fijo (id_activo,id_sucursal,id_usuario_registro,codigo,descripcion,valor,estado)
  VALUES (1,1,2,'AF-001','Mostrador ficticio',4500.00,'VIGENTE')
 INTO activo_fijo (id_activo,id_sucursal,id_usuario_registro,codigo,descripcion,valor,estado)
  VALUES (2,2,3,'AF-002','Equipo de computo ficticio',3500.00,'VIGENTE')
 INTO activo_fijo (id_activo,id_sucursal,id_usuario_registro,codigo,descripcion,valor,estado)
  VALUES (3,3,4,'AF-003','Estanteria ficticia',1800.00,'VIGENTE')
SELECT 1 FROM dual;

-- En la aplicacion, el backend insertara bitacora para CADA operacion relevante.
-- Aqui se siembran solo eventos representativos, no todo el historial.
INSERT ALL
 INTO registro_auditoria (id_auditoria,id_usuario,id_sucursal,entidad,id_registro,accion,datos_nuevos,fecha_evento)
  VALUES (1,2,1,'TRANSFERENCIA',1,'REGISTRAR',TO_CLOB('{"estado":"REGISTRADA"}'),SYSTIMESTAMP - INTERVAL '10' DAY)
 INTO registro_auditoria (id_auditoria,id_usuario,id_sucursal,entidad,id_registro,accion,datos_anteriores,datos_nuevos,fecha_evento)
  VALUES (2,2,1,'TRANSFERENCIA',1,'DESPACHAR',TO_CLOB('{"estado":"REGISTRADA"}'),TO_CLOB('{"estado":"EN_TRANSITO"}'),SYSTIMESTAMP - INTERVAL '9' DAY)
 INTO registro_auditoria (id_auditoria,id_usuario,id_sucursal,entidad,id_registro,accion,datos_anteriores,datos_nuevos,fecha_evento)
  VALUES (3,3,2,'TRANSFERENCIA',1,'RECIBIR',TO_CLOB('{"estado":"EN_TRANSITO"}'),TO_CLOB('{"estado":"RECIBIDA"}'),SYSTIMESTAMP - INTERVAL '8' DAY)
 INTO registro_auditoria (id_auditoria,id_usuario,id_sucursal,entidad,id_registro,accion,datos_nuevos,fecha_evento)
  VALUES (4,2,1,'MOVIMIENTO_EFECTIVO',1,'REGISTRAR',TO_CLOB('{"tipo":"INGRESO","monto":1500}'),SYSTIMESTAMP - INTERVAL '1' DAY)
 INTO registro_auditoria (id_auditoria,id_usuario,id_sucursal,entidad,id_registro,accion,datos_nuevos,fecha_evento)
  VALUES (5,5,2,'SOLICITUD_ENTREGA',2,'CONFIRMAR',TO_CLOB('{"estado":"CONFIRMADA"}'),SYSTIMESTAMP - NUMTODSINTERVAL(20,'MINUTE'))
SELECT 1 FROM dual;

COMMIT;
