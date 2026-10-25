import { oracledb } from '../db/oracle.js';
import { guardarAuditoria } from './auditoria.js';
import { apiRow, apiRows } from '../utils/rows.js';
import { autorizarSolicitud, comprobarDisponible, exigirEstado, crearConsultaDisponibilidad } from '../utils/entregas.js';
import { conflict, notFound } from '../utils/errors.js';

export const SELECT_SOLICITUD = `
  SELECT se.id_solicitud, se.id_usuario_registro, se.id_sucursal_asignada,
         s.nombre AS sucursal_asignada, se.cliente_nombre, se.cliente_telefono,
         se.departamento_entrega, se.municipio_entrega, se.direccion_entrega,
         se.forma_pago, se.estado, se.fecha_solicitud, se.fecha_confirmacion,
         se.fecha_despacho, se.fecha_estimada_entrega, se.fecha_entrega_real,
         CASE WHEN (se.estado = 'ENTREGADA' AND se.fecha_entrega_real > se.fecha_estimada_entrega)
                   OR (se.estado IN ('CONFIRMADA','DESPACHADA') AND SYSTIMESTAMP > se.fecha_estimada_entrega)
              THEN 'S' ELSE 'N' END AS tardia
  FROM solicitud_entrega se
  LEFT JOIN sucursal s ON s.id_sucursal = se.id_sucursal_asignada`;

export async function consultarSolicitud(conn, id) {
  const row = (await conn.execute(`${SELECT_SOLICITUD} WHERE se.id_solicitud=:id`, { id })).rows[0];
  if (!row) throw notFound('Solicitud no encontrada.');
  const detalles = (await conn.execute(`
    SELECT d.id_detalle_solicitud, d.id_medicamento, m.codigo AS codigo_medicamento,
           m.nombre AS medicamento, d.cantidad, r.id_reserva, r.estado AS estado_reserva,
           r.id_sucursal AS sucursal_reserva, r.cantidad AS cantidad_reservada
    FROM detalle_solicitud d JOIN medicamento m ON m.id_medicamento = d.id_medicamento
    LEFT JOIN reserva_inventario r ON r.id_detalle_solicitud = d.id_detalle_solicitud
    WHERE d.id_solicitud=:id ORDER BY d.id_medicamento`, { id })).rows;
  return { ...apiRow(row), detalles: apiRows(detalles) };
}

async function bloquearSolicitud(conn, id) {
  const row = (await conn.execute(`
    SELECT id_solicitud, id_sucursal_asignada, estado, departamento_entrega, municipio_entrega
    FROM solicitud_entrega WHERE id_solicitud=:id FOR UPDATE NOWAIT`, { id })).rows[0];
  if (!row) throw notFound('Solicitud no encontrada.');
  return row;
}

async function obtenerDetalles(conn, id) {
  const rows = (await conn.execute(`SELECT d.id_detalle_solicitud, d.id_medicamento, d.cantidad
    FROM detalle_solicitud d WHERE d.id_solicitud=:id ORDER BY d.id_medicamento`, { id })).rows;
  if (!rows.length) throw conflict('La solicitud no tiene medicamentos.');
  return rows;
}

// Reutilizable para el operador interno y para una futura integracion con portal/call center.
// Las claves de parametros se construyen a partir de indices controlados, nunca de SQL del cliente.
export async function consultarSucursalesElegibles(conn, data) {
  const { sql, binds } = crearConsultaDisponibilidad(data);
  const rows = (await conn.execute(sql, binds)).rows;
  return apiRows(rows);
}

export async function registrarSolicitud(conn, usuario, data) {
  autorizarSolicitud(usuario, null, 'CREAR');
  const inserted = await conn.execute(`INSERT INTO solicitud_entrega (
    id_usuario_registro, cliente_nombre, cliente_telefono,
    departamento_entrega, municipio_entrega, direccion_entrega, estado
  ) VALUES (:usuario,:nombre,:telefono,:departamento,:municipio,:direccion,'PENDIENTE')
  RETURNING id_solicitud INTO :newId`, {
    usuario: usuario.ID_USUARIO, nombre: data.cliente_nombre, telefono: data.cliente_telefono,
    departamento: data.departamento_entrega, municipio: data.municipio_entrega,
    direccion: data.direccion_entrega,
    newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
  });
  const id = inserted.outBinds.newId[0];
  for (const d of data.detalles) {
    await conn.execute(`INSERT INTO detalle_solicitud (id_solicitud,id_medicamento,cantidad)
      VALUES (:id,:med,:cant)`, { id, med: d.id_medicamento, cant: d.cantidad });
  }
  await guardarAuditoria(conn, { usuarioId: usuario.ID_USUARIO,
    entidad: 'SOLICITUD_ENTREGA', registroId: id, accion: 'REGISTRAR',
    despues: { estado: 'PENDIENTE', ubicacion: {
      departamento: data.departamento_entrega, municipio: data.municipio_entrega
    }, detalles: data.detalles } });
  return consultarSolicitud(conn, id);
}

export async function opcionesSolicitud(conn, id, usuario) {
  const solicitud = await consultarSolicitud(conn, id);
  autorizarSolicitud(usuario, { ID_SUCURSAL_ASIGNADA: solicitud.id_sucursal_asignada }, 'LEER');
  const opciones = await consultarSucursalesElegibles(conn, {
    departamento_entrega: solicitud.departamento_entrega,
    municipio_entrega: solicitud.municipio_entrega,
    detalles: solicitud.detalles.map(d => ({ id_medicamento: d.id_medicamento, cantidad: d.cantidad }))
  });
  return { id_solicitud: id, estado: solicitud.estado, opciones };
}

export async function confirmarSolicitud(conn, usuario, id, data) {
  const solicitud = await bloquearSolicitud(conn, id);
  autorizarSolicitud(usuario, solicitud, 'CONFIRMAR');
  exigirEstado(solicitud.ESTADO, 'PENDIENTE', 'confirmar');
  const sucursal = (await conn.execute(`SELECT id_sucursal, tiempo_entrega_min
    FROM sucursal WHERE id_sucursal=:id AND activa='S'
    AND UPPER(TRIM(departamento))=UPPER(TRIM(:departamento))
    AND UPPER(TRIM(municipio))=UPPER(TRIM(:municipio))
    FOR UPDATE NOWAIT`, {
    id: data.id_sucursal, departamento: solicitud.DEPARTAMENTO_ENTREGA,
    municipio: solicitud.MUNICIPIO_ENTREGA
  })).rows[0];
  if (!sucursal) throw conflict('La sucursal no esta activa o no cubre la ubicacion de entrega.');
  const detalles = await obtenerDetalles(conn, id);
  for (const d of detalles) {
    const medicamento = (await conn.execute(`SELECT id_medicamento FROM medicamento
      WHERE id_medicamento=:id AND activo='S'`, { id: d.ID_MEDICAMENTO })).rows[0];
    if (!medicamento) throw conflict('La solicitud contiene un medicamento inactivo o inexistente.');
    const binds = { suc: data.id_sucursal, med: d.ID_MEDICAMENTO, cant: d.CANTIDAD };
    const inventario = (await conn.execute(`SELECT cantidad_existente, cantidad_reservada
      FROM inventario_sucursal WHERE id_sucursal=:suc AND id_medicamento=:med
      FOR UPDATE NOWAIT`, { suc: binds.suc, med: binds.med })).rows[0];
    comprobarDisponible(inventario?.CANTIDAD_EXISTENTE, inventario?.CANTIDAD_RESERVADA, d.CANTIDAD);
    const updated = await conn.execute(`UPDATE inventario_sucursal
      SET cantidad_reservada=cantidad_reservada+:cant
      WHERE id_sucursal=:suc AND id_medicamento=:med
      AND cantidad_existente-cantidad_reservada >= :cant`, binds);
    if (updated.rowsAffected !== 1) throw conflict('La disponibilidad cambio mientras se confirmaba la solicitud.');
    await conn.execute(`INSERT INTO reserva_inventario
      (id_detalle_solicitud,id_sucursal,cantidad,estado)
      VALUES (:detalle,:suc,:cant,'ACTIVA')`, { detalle: d.ID_DETALLE_SOLICITUD, suc: binds.suc, cant: binds.cant });
  }
  const updated = await conn.execute(`UPDATE solicitud_entrega
    SET estado='CONFIRMADA', id_sucursal_asignada=:suc,
        forma_pago=:pago, fecha_confirmacion=SYSTIMESTAMP,
        fecha_estimada_entrega=SYSTIMESTAMP+NUMTODSINTERVAL(:minutos,'MINUTE')
    WHERE id_solicitud=:id AND estado='PENDIENTE'`, {
    suc: data.id_sucursal, pago: data.forma_pago, minutos: sucursal.TIEMPO_ENTREGA_MIN, id
  });
  if (updated.rowsAffected !== 1) throw conflict('La solicitud ya fue confirmada por otro usuario.');
  await guardarAuditoria(conn, { usuarioId: usuario.ID_USUARIO, sucursalId: data.id_sucursal,
    entidad: 'SOLICITUD_ENTREGA', registroId: id, accion: 'CONFIRMAR',
    antes: { estado: 'PENDIENTE' }, despues: { estado: 'CONFIRMADA',
      id_sucursal_asignada: data.id_sucursal, forma_pago: data.forma_pago,
      tiempo_entrega_min: sucursal.TIEMPO_ENTREGA_MIN } });
  return consultarSolicitud(conn, id);
}

async function reservasActivas(conn, id, sucursal) {
  const rows = (await conn.execute(`SELECT r.id_reserva, r.id_detalle_solicitud,
    d.id_medicamento, d.cantidad, r.cantidad AS cantidad_reserva,
    r.id_sucursal, r.estado FROM detalle_solicitud d
    JOIN reserva_inventario r ON r.id_detalle_solicitud=d.id_detalle_solicitud
    WHERE d.id_solicitud=:id ORDER BY d.id_medicamento`, { id })).rows;
  const detalles = await obtenerDetalles(conn, id);
  if (rows.length !== detalles.length || rows.some(r =>
    r.ESTADO !== 'ACTIVA' || r.ID_SUCURSAL !== sucursal || r.CANTIDAD_RESERVA !== r.CANTIDAD)) {
    throw conflict('La solicitud no tiene reservas activas consistentes.');
  }
  return rows;
}

export async function despacharSolicitud(conn, usuario, id) {
  const solicitud = await bloquearSolicitud(conn, id);
  autorizarSolicitud(usuario, solicitud, 'DESPACHAR');
  exigirEstado(solicitud.ESTADO, 'CONFIRMADA', 'despachar');
  const reservas = await reservasActivas(conn, id, solicitud.ID_SUCURSAL_ASIGNADA);
  for (const r of reservas) {
    const binds = { suc: solicitud.ID_SUCURSAL_ASIGNADA, med: r.ID_MEDICAMENTO, cant: r.CANTIDAD };
    const saldo = (await conn.execute(`SELECT cantidad_existente, cantidad_reservada
      FROM inventario_sucursal WHERE id_sucursal=:suc AND id_medicamento=:med
      FOR UPDATE NOWAIT`, { suc: binds.suc, med: binds.med })).rows[0];
    if (!saldo || saldo.CANTIDAD_EXISTENTE < r.CANTIDAD || saldo.CANTIDAD_RESERVADA < r.CANTIDAD) {
      throw conflict('El inventario reservado ya no es consistente.');
    }
    const updated = await conn.execute(`UPDATE inventario_sucursal
      SET cantidad_existente=cantidad_existente-:cant,
          cantidad_reservada=cantidad_reservada-:cant
      WHERE id_sucursal=:suc AND id_medicamento=:med AND cantidad_existente>=:cant
        AND cantidad_reservada>=:cant`, binds);
    if (updated.rowsAffected !== 1) throw conflict('No se pudo descontar el inventario reservado.');
    const reserva = await conn.execute(`UPDATE reserva_inventario SET estado='CONSUMIDA'
      WHERE id_reserva=:id AND estado='ACTIVA'`, { id: r.ID_RESERVA });
    if (reserva.rowsAffected !== 1) throw conflict('La reserva ya no esta activa.');
    await conn.execute(`INSERT INTO movimiento_inventario
      (id_sucursal,id_medicamento,id_usuario,id_detalle_solicitud,tipo,cantidad,motivo)
      VALUES (:suc,:med,:usuario,:detalle,'ENTREGA_SALIDA',:cant,:motivo)`, {
      ...binds, usuario: usuario.ID_USUARIO, detalle: r.ID_DETALLE_SOLICITUD,
      motivo: `Despacho solicitud ${id}`
    });
  }
  const updated = await conn.execute(`UPDATE solicitud_entrega SET estado='DESPACHADA',
    fecha_despacho=SYSTIMESTAMP WHERE id_solicitud=:id AND estado='CONFIRMADA'`, { id });
  if (updated.rowsAffected !== 1) throw conflict('La solicitud cambio de estado durante el despacho.');
  await guardarAuditoria(conn, { usuarioId: usuario.ID_USUARIO, sucursalId: solicitud.ID_SUCURSAL_ASIGNADA,
    entidad: 'SOLICITUD_ENTREGA', registroId: id, accion: 'DESPACHAR',
    antes: { estado: 'CONFIRMADA' }, despues: { estado: 'DESPACHADA',
      detalles: reservas.map(r => ({ id_medicamento: r.ID_MEDICAMENTO, cantidad: r.CANTIDAD })) } });
  return consultarSolicitud(conn, id);
}

export async function entregarSolicitud(conn, usuario, id) {
  const solicitud = await bloquearSolicitud(conn, id);
  autorizarSolicitud(usuario, solicitud, 'ENTREGAR');
  exigirEstado(solicitud.ESTADO, 'DESPACHADA', 'entregar');
  const updated = await conn.execute(`UPDATE solicitud_entrega SET estado='ENTREGADA',
    fecha_entrega_real=SYSTIMESTAMP WHERE id_solicitud=:id AND estado='DESPACHADA'`, { id });
  if (updated.rowsAffected !== 1) throw conflict('La solicitud cambio de estado.');
  await guardarAuditoria(conn, { usuarioId: usuario.ID_USUARIO, sucursalId: solicitud.ID_SUCURSAL_ASIGNADA,
    entidad: 'SOLICITUD_ENTREGA', registroId: id, accion: 'ENTREGAR',
    antes: { estado: 'DESPACHADA' }, despues: { estado: 'ENTREGADA' } });
  return consultarSolicitud(conn, id);
}

export async function cancelarSolicitud(conn, usuario, id) {
  const solicitud = await bloquearSolicitud(conn, id);
  autorizarSolicitud(usuario, solicitud, 'CANCELAR');
  if (!['PENDIENTE', 'CONFIRMADA'].includes(solicitud.ESTADO)) {
    throw conflict('Solo se pueden cancelar solicitudes pendientes o confirmadas, antes de su despacho.');
  }
  if (solicitud.ESTADO === 'CONFIRMADA') {
    const reservas = await reservasActivas(conn, id, solicitud.ID_SUCURSAL_ASIGNADA);
    for (const r of reservas) {
      const binds = { suc: solicitud.ID_SUCURSAL_ASIGNADA, med: r.ID_MEDICAMENTO, cant: r.CANTIDAD };
      const saldo = (await conn.execute(`SELECT cantidad_existente,cantidad_reservada
        FROM inventario_sucursal WHERE id_sucursal=:suc AND id_medicamento=:med
        FOR UPDATE NOWAIT`, { suc: binds.suc, med: binds.med })).rows[0];
      if (!saldo || saldo.CANTIDAD_RESERVADA < r.CANTIDAD) throw conflict('Reservas e inventario inconsistentes.');
      const updated = await conn.execute(`UPDATE inventario_sucursal SET cantidad_reservada=cantidad_reservada-:cant
        WHERE id_sucursal=:suc AND id_medicamento=:med AND cantidad_reservada>=:cant`, binds);
      if (updated.rowsAffected !== 1) throw conflict('No se pudo liberar el inventario reservado.');
      const updatedReserva = await conn.execute(`UPDATE reserva_inventario SET estado='LIBERADA'
        WHERE id_reserva=:id AND estado='ACTIVA'`, { id: r.ID_RESERVA });
      if (updatedReserva.rowsAffected !== 1) throw conflict('No se pudo liberar una reserva.');
    }
  }
  const updated = await conn.execute(`UPDATE solicitud_entrega SET estado='CANCELADA'
    WHERE id_solicitud=:id AND estado IN ('PENDIENTE','CONFIRMADA')`, { id });
  if (updated.rowsAffected !== 1) throw conflict('La solicitud cambio de estado.');
  await guardarAuditoria(conn, { usuarioId: usuario.ID_USUARIO, sucursalId: solicitud.ID_SUCURSAL_ASIGNADA,
    entidad: 'SOLICITUD_ENTREGA', registroId: id, accion: 'CANCELAR',
    antes: { estado: solicitud.ESTADO }, despues: { estado: 'CANCELADA' } });
  return consultarSolicitud(conn, id);
}
