import { oracledb } from '../db/oracle.js';
import { guardarAuditoria } from './auditoria.js';
import { autorizarTransferencia, validarEstadoTransferencia, validarDisponibilidad } from '../utils/transferencias.js';
import { conflict, notFound } from '../utils/errors.js';
import { apiRow, apiRows } from '../utils/rows.js';

const SELECT_HEADER = `
  SELECT t.id_transferencia, t.id_sucursal_origen, t.id_sucursal_destino,
         so.nombre AS nombre_origen, sd.nombre AS nombre_destino,
         t.id_usuario_registro, t.id_usuario_despacho, t.id_usuario_recepcion,
         t.estado, t.fecha_registro, t.fecha_despacho, t.fecha_recepcion
  FROM transferencia t
  JOIN sucursal so ON so.id_sucursal = t.id_sucursal_origen
  JOIN sucursal sd ON sd.id_sucursal = t.id_sucursal_destino`;

export async function consultarTransferencia(conn, id) {
  const found = (await conn.execute(`${SELECT_HEADER} WHERE t.id_transferencia=:id`, { id })).rows[0];
  if (!found) throw notFound('Transferencia no encontrada.');
  const details = (await conn.execute(`
    SELECT dt.id_detalle_transferencia, dt.id_transferencia, dt.id_medicamento,
           m.codigo AS codigo_medicamento, m.nombre AS medicamento, dt.cantidad
    FROM detalle_transferencia dt
    JOIN medicamento m ON m.id_medicamento = dt.id_medicamento
    WHERE dt.id_transferencia=:id ORDER BY dt.id_medicamento`, { id })).rows;
  return { ...apiRow(found), detalles: apiRows(details) };
}

async function bloquearTransferencia(conn, id) {
  // NOWAIT: dos peticiones concurrentes nunca ejecutan ambas la misma transicion.
  const row = (await conn.execute(`SELECT id_transferencia, id_sucursal_origen,
    id_sucursal_destino, estado FROM transferencia WHERE id_transferencia=:id
    FOR UPDATE NOWAIT`, { id })).rows[0];
  if (!row) throw notFound('Transferencia no encontrada.');
  return row;
}

async function obtenerDetalles(conn, id) {
  const detalles = (await conn.execute(`
    SELECT id_detalle_transferencia, id_medicamento, cantidad
    FROM detalle_transferencia WHERE id_transferencia=:id ORDER BY id_medicamento`, { id })).rows;
  if (!detalles.length) throw conflict('La transferencia no contiene medicamentos.');
  return detalles;
}

async function verificarSucursalActiva(conn, id) {
  const row = (await conn.execute(`SELECT id_sucursal FROM sucursal
    WHERE id_sucursal=:id AND activa='S'`, { id })).rows[0];
  if (!row) throw notFound(`Sucursal ${id} no encontrada o inactiva.`);
}

export async function registrarTransferencia(conn, usuario, data) {
  autorizarTransferencia(usuario, { ID_SUCURSAL_ORIGEN: data.id_sucursal_origen }, 'REGISTRAR');
  await verificarSucursalActiva(conn, data.id_sucursal_origen);
  await verificarSucursalActiva(conn, data.id_sucursal_destino);
  for (const d of data.detalles) {
    const medicamento = (await conn.execute(`SELECT id_medicamento FROM medicamento
      WHERE id_medicamento=:id AND activo='S'`, { id: d.id_medicamento })).rows[0];
    if (!medicamento) throw notFound(`Medicamento ${d.id_medicamento} inexistente o inactivo.`);
  }
  const inserted = await conn.execute(`INSERT INTO transferencia (
    id_sucursal_origen, id_sucursal_destino, id_usuario_registro, estado
  ) VALUES (:origen,:destino,:usuario,'REGISTRADA')
  RETURNING id_transferencia INTO :newId`, {
    origen: data.id_sucursal_origen, destino: data.id_sucursal_destino,
    usuario: usuario.ID_USUARIO, newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
  });
  const id = inserted.outBinds.newId[0];
  for (const d of data.detalles) {
    await conn.execute(`INSERT INTO detalle_transferencia
      (id_transferencia, id_medicamento, cantidad) VALUES (:id,:med,:cant)`, {
      id, med: d.id_medicamento, cant: d.cantidad
    });
  }
  await guardarAuditoria(conn, {
    usuarioId: usuario.ID_USUARIO, sucursalId: data.id_sucursal_origen,
    entidad: 'TRANSFERENCIA', registroId: id, accion: 'REGISTRAR',
    despues: { estado: 'REGISTRADA', ...data }
  });
  return consultarTransferencia(conn, id);
}

export async function despacharTransferencia(conn, usuario, id) {
  const t = await bloquearTransferencia(conn, id);
  autorizarTransferencia(usuario, t, 'DESPACHAR');
  validarEstadoTransferencia(t.ESTADO, 'REGISTRADA', 'despachar');
  await verificarSucursalActiva(conn, t.ID_SUCURSAL_ORIGEN);
  await verificarSucursalActiva(conn, t.ID_SUCURSAL_DESTINO);
  const detalles = await obtenerDetalles(conn, id);
  // La cabecera queda bloqueada hasta COMMIT; cada saldo se bloquea por orden de medicamento.
  for (const d of detalles) {
    const binds = { suc: t.ID_SUCURSAL_ORIGEN, med: d.ID_MEDICAMENTO };
    const balance = (await conn.execute(`SELECT cantidad_existente, cantidad_reservada
      FROM inventario_sucursal WHERE id_sucursal=:suc AND id_medicamento=:med
      FOR UPDATE NOWAIT`, binds)).rows[0];
    validarDisponibilidad(balance?.CANTIDAD_EXISTENTE, balance?.CANTIDAD_RESERVADA, d.CANTIDAD);
    const update = await conn.execute(`UPDATE inventario_sucursal
      SET cantidad_existente=cantidad_existente-:cant
      WHERE id_sucursal=:suc AND id_medicamento=:med
        AND cantidad_existente-cantidad_reservada >= :cant`, { ...binds, cant: d.CANTIDAD });
    if (update.rowsAffected !== 1) throw conflict('Inventario modificado por otra operacion.');
    await conn.execute(`INSERT INTO movimiento_inventario
      (id_sucursal,id_medicamento,id_usuario,id_detalle_transferencia,tipo,cantidad,motivo)
      VALUES (:suc,:med,:usu,:detalle,'TRANSFERENCIA_SALIDA',:cant,:motivo)`, {
      ...binds, usu: usuario.ID_USUARIO, detalle: d.ID_DETALLE_TRANSFERENCIA,
      cant: d.CANTIDAD, motivo: `Despacho transferencia ${id}`
    });
  }
  const updated = await conn.execute(`UPDATE transferencia SET estado='EN_TRANSITO',
    id_usuario_despacho=:usuario, fecha_despacho=SYSTIMESTAMP
    WHERE id_transferencia=:id AND estado='REGISTRADA'`, { usuario: usuario.ID_USUARIO, id });
  if (updated.rowsAffected !== 1) throw conflict('Estado modificado por otra operacion.');
  await guardarAuditoria(conn, {
    usuarioId: usuario.ID_USUARIO, sucursalId: t.ID_SUCURSAL_ORIGEN,
    entidad: 'TRANSFERENCIA', registroId: id, accion: 'DESPACHAR',
    antes: { estado: 'REGISTRADA' },
    despues: { estado: 'EN_TRANSITO', detalles: detalles.map(d => ({ id_medicamento: d.ID_MEDICAMENTO, cantidad: d.CANTIDAD })) }
  });
  return consultarTransferencia(conn, id);
}

export async function recibirTransferencia(conn, usuario, id) {
  const t = await bloquearTransferencia(conn, id);
  autorizarTransferencia(usuario, t, 'RECIBIR');
  validarEstadoTransferencia(t.ESTADO, 'EN_TRANSITO', 'recibir');
  const detalles = await obtenerDetalles(conn, id);
  for (const d of detalles) {
    const binds = { suc: t.ID_SUCURSAL_DESTINO, med: d.ID_MEDICAMENTO, cant: d.CANTIDAD };
    // UPDATE primero: atiende saldos ya existentes y serializa incrementos simultaneos.
    const updated = await conn.execute(`UPDATE inventario_sucursal
      SET cantidad_existente=cantidad_existente+:cant
      WHERE id_sucursal=:suc AND id_medicamento=:med`, binds);
    if (updated.rowsAffected === 0) {
      try {
        await conn.execute(`INSERT INTO inventario_sucursal
          (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada)
          VALUES (:suc,:med,:cant,0)`, binds);
      } catch (error) {
        // Si otra transferencia creo esta pareja mientras esperabamos, incrementar
        // el saldo ya creado; NO duplicar el registro ni perder el movimiento.
        if (error.errorNum !== 1) throw error;
        const retry = await conn.execute(`UPDATE inventario_sucursal
          SET cantidad_existente=cantidad_existente+:cant
          WHERE id_sucursal=:suc AND id_medicamento=:med`, binds);
        if (retry.rowsAffected !== 1) throw conflict('No fue posible conciliar el inventario destino.');
      }
    } else if (updated.rowsAffected !== 1) {
      throw conflict('Existe mas de un inventario para sucursal y medicamento.');
    }
    await conn.execute(`INSERT INTO movimiento_inventario
      (id_sucursal,id_medicamento,id_usuario,id_detalle_transferencia,tipo,cantidad,motivo)
      VALUES (:suc,:med,:usu,:detalle,'TRANSFERENCIA_ENTRADA',:cant,:motivo)`, {
      ...binds, usu: usuario.ID_USUARIO, detalle: d.ID_DETALLE_TRANSFERENCIA,
      motivo: `Recepcion transferencia ${id}`
    });
  }
  const updated = await conn.execute(`UPDATE transferencia SET estado='RECIBIDA',
    id_usuario_recepcion=:usuario, fecha_recepcion=SYSTIMESTAMP
    WHERE id_transferencia=:id AND estado='EN_TRANSITO'`, { usuario: usuario.ID_USUARIO, id });
  if (updated.rowsAffected !== 1) throw conflict('Estado modificado por otra operacion.');
  await guardarAuditoria(conn, {
    usuarioId: usuario.ID_USUARIO, sucursalId: t.ID_SUCURSAL_DESTINO,
    entidad: 'TRANSFERENCIA', registroId: id, accion: 'RECIBIR',
    antes: { estado: 'EN_TRANSITO' }, despues: { estado: 'RECIBIDA', detalles: detalles.map(d => ({ id_medicamento: d.ID_MEDICAMENTO, cantidad: d.CANTIDAD })) }
  });
  return consultarTransferencia(conn, id);
}

export { SELECT_HEADER };
