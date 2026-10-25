import { oracledb } from '../db/oracle.js';
import { guardarAuditoria } from './auditoria.js';
import { apiRow } from '../utils/rows.js';
import { conflict, notFound } from '../utils/errors.js';
import { validarEscrituraSucursal } from '../utils/administracion.js';

export const MOVIMIENTO_EFECTIVO_SELECT = `id_movimiento_efectivo, id_sucursal, id_usuario,
  tipo, concepto, monto, fecha_movimiento`;
export const GASTO_PLANILLA_SELECT = `id_gasto_planilla, id_sucursal, id_usuario,
  periodo, monto_total, fecha_registro`;
export const ACTIVO_FIJO_SELECT = `id_activo, id_sucursal, id_usuario_registro,
  codigo, descripcion, valor, estado, fecha_registro`;

async function verificarSucursalActiva(conn, id) {
  const row = (await conn.execute(`SELECT id_sucursal FROM sucursal WHERE id_sucursal=:id AND activa='S'`, { id })).rows[0];
  if (!row) throw notFound('La sucursal no existe o esta inactiva.');
}

async function crearConId(conn, sql, binds, campoPk) {
  const result = await conn.execute(sql, {
    ...binds, newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
  });
  const id = result.outBinds?.newId?.[0];
  if (!id) throw conflict(`No fue posible obtener ${campoPk}.`);
  return id;
}

async function detalle(conn, tabla, campos, pk, id) {
  const result = await conn.execute(`SELECT ${campos} FROM ${tabla} WHERE ${pk}=:id`, { id });
  return apiRow(result.rows[0]);
}

export async function registrarEfectivo(conn, usuario, data) {
  validarEscrituraSucursal(usuario, data.id_sucursal);
  await verificarSucursalActiva(conn, data.id_sucursal);
  const id = await crearConId(conn, `INSERT INTO movimiento_efectivo
    (id_sucursal, id_usuario, tipo, concepto, monto)
    VALUES (:sucursal, :usuario, :tipo, :concepto, :centavos / 100)
    RETURNING id_movimiento_efectivo INTO :newId`, {
    sucursal: data.id_sucursal, usuario: usuario.ID_USUARIO, tipo: data.tipo,
    concepto: data.concepto, centavos: data.montoCentavos
  }, 'id_movimiento_efectivo');
  const nuevo = await detalle(conn, 'movimiento_efectivo', MOVIMIENTO_EFECTIVO_SELECT, 'id_movimiento_efectivo', id);
  await guardarAuditoria(conn, {
    usuarioId: usuario.ID_USUARIO, sucursalId: data.id_sucursal,
    entidad: 'MOVIMIENTO_EFECTIVO', registroId: id, accion: 'REGISTRAR', despues: nuevo
  });
  return nuevo;
}

export async function registrarPlanilla(conn, usuario, data) {
  validarEscrituraSucursal(usuario, data.id_sucursal);
  await verificarSucursalActiva(conn, data.id_sucursal);
  const id = await crearConId(conn, `INSERT INTO gasto_planilla
    (id_sucursal, id_usuario, periodo, monto_total)
    VALUES (:sucursal, :usuario, :periodo, :centavos / 100)
    RETURNING id_gasto_planilla INTO :newId`, {
    sucursal: data.id_sucursal, usuario: usuario.ID_USUARIO,
    periodo: data.periodo, centavos: data.montoCentavos
  }, 'id_gasto_planilla');
  const nuevo = await detalle(conn, 'gasto_planilla', GASTO_PLANILLA_SELECT, 'id_gasto_planilla', id);
  await guardarAuditoria(conn, {
    usuarioId: usuario.ID_USUARIO, sucursalId: data.id_sucursal,
    entidad: 'GASTO_PLANILLA', registroId: id, accion: 'REGISTRAR', despues: nuevo
  });
  return nuevo;
}

export async function corregirPlanilla(conn, usuario, id, data) {
  const prev = (await conn.execute(`SELECT ${GASTO_PLANILLA_SELECT}
    FROM gasto_planilla WHERE id_gasto_planilla=:id FOR UPDATE NOWAIT`, { id })).rows[0];
  if (!prev) throw notFound('Gasto de planilla no encontrado.');
  validarEscrituraSucursal(usuario, prev.ID_SUCURSAL);
  await conn.execute(`UPDATE gasto_planilla SET monto_total=:centavos / 100
    WHERE id_gasto_planilla=:id`, { centavos: data.montoCentavos, id });
  const nuevo = await detalle(conn, 'gasto_planilla', GASTO_PLANILLA_SELECT, 'id_gasto_planilla', id);
  await guardarAuditoria(conn, {
    usuarioId: usuario.ID_USUARIO, sucursalId: prev.ID_SUCURSAL,
    entidad: 'GASTO_PLANILLA', registroId: id, accion: 'CORREGIR',
    antes: apiRow(prev), despues: nuevo
  });
  return nuevo;
}

export async function registrarActivo(conn, usuario, data) {
  validarEscrituraSucursal(usuario, data.id_sucursal);
  await verificarSucursalActiva(conn, data.id_sucursal);
  const id = await crearConId(conn, `INSERT INTO activo_fijo
    (id_sucursal, id_usuario_registro, codigo, descripcion, valor, estado)
    VALUES (:sucursal, :usuario, :codigo, :descripcion, :centavos / 100, 'VIGENTE')
    RETURNING id_activo INTO :newId`, {
    sucursal: data.id_sucursal, usuario: usuario.ID_USUARIO, codigo: data.codigo,
    descripcion: data.descripcion, centavos: data.valorCentavos
  }, 'id_activo');
  const nuevo = await detalle(conn, 'activo_fijo', ACTIVO_FIJO_SELECT, 'id_activo', id);
  await guardarAuditoria(conn, {
    usuarioId: usuario.ID_USUARIO, sucursalId: data.id_sucursal,
    entidad: 'ACTIVO_FIJO', registroId: id, accion: 'REGISTRAR', despues: nuevo
  });
  return nuevo;
}

export async function actualizarActivo(conn, usuario, id, data) {
  const prev = (await conn.execute(`SELECT ${ACTIVO_FIJO_SELECT}
    FROM activo_fijo WHERE id_activo=:id FOR UPDATE NOWAIT`, { id })).rows[0];
  if (!prev) throw notFound('Activo fijo no encontrado.');
  validarEscrituraSucursal(usuario, prev.ID_SUCURSAL);
  const sets = [];
  const binds = { id };
  if (data.descripcion !== undefined) { sets.push('descripcion=:descripcion'); binds.descripcion = data.descripcion; }
  if (data.valorCentavos !== undefined) { sets.push('valor=:centavos / 100'); binds.centavos = data.valorCentavos; }
  if (data.estado !== undefined) { sets.push('estado=:estado'); binds.estado = data.estado; }
  if (!sets.length) throw conflict('No se informaron cambios para el activo.');
  await conn.execute(`UPDATE activo_fijo SET ${sets.join(', ')} WHERE id_activo=:id`, binds);
  const nuevo = await detalle(conn, 'activo_fijo', ACTIVO_FIJO_SELECT, 'id_activo', id);
  await guardarAuditoria(conn, {
    usuarioId: usuario.ID_USUARIO, sucursalId: prev.ID_SUCURSAL,
    entidad: 'ACTIVO_FIJO', registroId: id, accion: 'MODIFICAR',
    antes: apiRow(prev), despues: nuevo
  });
  return nuevo;
}
