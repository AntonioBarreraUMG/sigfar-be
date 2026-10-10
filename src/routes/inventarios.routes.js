import { Router } from 'express';
import { withConnection, withTransaction, oracledb } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES, scopeSucursal, scopeWriteSucursal } from '../utils/authorization.js';
import { allowedFields, enumField, nonNegativeCount, pagination, positiveId, textField } from '../utils/validation.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { guardarAuditoria } from '../services/auditoria.js';
import { apiRow, apiRows } from '../utils/rows.js';

const MOV_TYPES = ['INICIAL', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA'];
const LIMIT = 'ORDER BY i.id_sucursal, i.id_medicamento OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY';

function validateMovement(body) {
  allowedFields(body, ['id_sucursal', 'id_medicamento', 'tipo', 'cantidad', 'motivo'], { partial: true });
  const missing = ['id_sucursal', 'id_medicamento', 'tipo', 'cantidad'].filter(k => !(k in body));
  if (missing.length) throw badRequest(`Faltan campos: ${missing.join(', ')}.`);
  const result = {
    id_sucursal: positiveId(body.id_sucursal, 'id_sucursal'),
    id_medicamento: positiveId(body.id_medicamento, 'id_medicamento'),
    tipo: enumField(body.tipo, 'tipo', MOV_TYPES),
    cantidad: nonNegativeCount(body.cantidad, 'cantidad')
  };
  if (!result.cantidad) throw badRequest('cantidad debe ser mayor que cero.');
  if (body.motivo !== undefined) result.motivo = textField(body.motivo, 'motivo', 250);
  else result.motivo = null;
  if (result.tipo !== 'INICIAL' && !result.motivo) throw badRequest('Un ajuste requiere motivo.');
  return result;
}

async function verifyActive(conn, table, idColumn, id) {
  const sql = table === 'sucursal'
    ? 'SELECT id_sucursal FROM sucursal WHERE id_sucursal=:id AND activa=\'S\''
    : 'SELECT id_medicamento FROM medicamento WHERE id_medicamento=:id AND activo=\'S\'';
  const result = await conn.execute(sql, { id });
  if (!result.rows.length) throw notFound(table === 'sucursal' ? 'Sucursal inexistente o inactiva.' : 'Medicamento inexistente o inactivo.');
}

export function makeInventariosRouter(authenticate) {
  const router = Router();
  router.use(authenticate);

  // Todos los roles necesitan consultar disponibilidad; ENCARGADO solo consulta su sucursal.
  router.get('/', asyncHandler(async (req, res) => {
    const { limit, offset } = pagination(req.query);
    const binds = { limit, offset };
    const conditions = [];
    if (req.usuario.ROL === ROLES.ENCARGADO) {
      if (req.query.id_sucursal !== undefined) scopeSucursal(req.usuario, req.query.id_sucursal);
      binds.id_sucursal = req.usuario.ID_SUCURSAL;
      conditions.push('i.id_sucursal = :id_sucursal');
    } else if (req.query.id_sucursal !== undefined) {
      binds.id_sucursal = positiveId(req.query.id_sucursal, 'id_sucursal');
      conditions.push('i.id_sucursal = :id_sucursal');
    }
    if (req.query.id_medicamento !== undefined) {
      binds.id_medicamento = positiveId(req.query.id_medicamento, 'id_medicamento');
      conditions.push('i.id_medicamento = :id_medicamento');
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await withConnection(async conn => (await conn.execute(`
      SELECT i.id_sucursal, s.codigo AS codigo_sucursal, s.nombre AS sucursal,
             i.id_medicamento, m.codigo AS codigo_medicamento, m.nombre AS medicamento,
             m.presentacion, i.cantidad_existente, i.cantidad_reservada,
             (i.cantidad_existente - i.cantidad_reservada) AS cantidad_disponible
      FROM inventario_sucursal i
      JOIN sucursal s ON s.id_sucursal = i.id_sucursal
      JOIN medicamento m ON m.id_medicamento = i.id_medicamento
      ${where}
      ${LIMIT}
    `, binds)).rows);
    res.json({ datos: apiRows(rows), paginacion: { desde: offset, limite: limit } });
  }));

  router.get('/movimientos', requireRole(ROLES.ADMIN, ROLES.ENCARGADO), asyncHandler(async (req, res) => {
    const { offset, limit } = pagination(req.query);
    const binds = { offset, limit };
    const conditions = [];
    if (req.usuario.ROL === ROLES.ENCARGADO) {
      if (req.query.id_sucursal !== undefined) scopeSucursal(req.usuario, req.query.id_sucursal);
      binds.id_sucursal = req.usuario.ID_SUCURSAL;
      conditions.push('mi.id_sucursal = :id_sucursal');
    } else if (req.query.id_sucursal !== undefined) {
      binds.id_sucursal = positiveId(req.query.id_sucursal, 'id_sucursal');
      conditions.push('mi.id_sucursal = :id_sucursal');
    }
    if (req.query.id_medicamento !== undefined) {
      binds.id_medicamento = positiveId(req.query.id_medicamento, 'id_medicamento');
      conditions.push('mi.id_medicamento = :id_medicamento');
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await withConnection(async conn => (await conn.execute(`
      SELECT mi.id_movimiento, mi.id_sucursal, mi.id_medicamento, mi.id_usuario,
             mi.tipo, mi.cantidad, mi.motivo, mi.fecha_movimiento,
             m.nombre AS medicamento, s.nombre AS sucursal
      FROM movimiento_inventario mi
      JOIN medicamento m ON m.id_medicamento = mi.id_medicamento
      JOIN sucursal s ON s.id_sucursal = mi.id_sucursal
      ${where}
      ORDER BY mi.fecha_movimiento DESC, mi.id_movimiento DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `, binds)).rows);
    res.json({ datos: apiRows(rows), paginacion: { desde: offset, limite: limit } });
  }));

  router.post('/movimientos', requireRole(ROLES.ENCARGADO), asyncHandler(async (req, res) => {
    const data = validateMovement(req.body);
    scopeWriteSucursal(req.usuario, data.id_sucursal);
    const output = await withTransaction(async conn => {
      await verifyActive(conn, 'sucursal', 'id_sucursal', data.id_sucursal);
      await verifyActive(conn, 'medicamento', 'id_medicamento', data.id_medicamento);
      const old = (await conn.execute(`SELECT cantidad_existente, cantidad_reservada
        FROM inventario_sucursal WHERE id_sucursal=:suc AND id_medicamento=:med FOR UPDATE`,
        { suc: data.id_sucursal, med: data.id_medicamento })).rows[0];
      let newExistence;
      let reserved = old?.CANTIDAD_RESERVADA ?? 0;
      if (data.tipo === 'INICIAL') {
        if (old) throw conflict('El inventario inicial ya existe; registra un ajuste.');
        newExistence = data.cantidad;
        await conn.execute(`INSERT INTO inventario_sucursal
          (id_sucursal,id_medicamento,cantidad_existente,cantidad_reservada)
          VALUES (:suc,:med,:cantidad,0)`, { suc: data.id_sucursal, med: data.id_medicamento, cantidad: data.cantidad });
      } else {
        if (!old) throw notFound('Primero debes registrar el inventario inicial del medicamento en la sucursal.');
        if (data.tipo === 'AJUSTE_SALIDA' && old.CANTIDAD_EXISTENTE - reserved < data.cantidad) {
          throw conflict('Existencias disponibles insuficientes (se respetan las reservas).');
        }
        newExistence = old.CANTIDAD_EXISTENTE + (data.tipo === 'AJUSTE_ENTRADA' ? data.cantidad : -data.cantidad);
        await conn.execute(`UPDATE inventario_sucursal SET cantidad_existente=:cantidad
          WHERE id_sucursal=:suc AND id_medicamento=:med`,
        { cantidad: newExistence, suc: data.id_sucursal, med: data.id_medicamento });
      }
      const inserted = await conn.execute(`INSERT INTO movimiento_inventario
        (id_sucursal, id_medicamento, id_usuario, tipo, cantidad, motivo)
        VALUES (:suc,:med,:usu,:tipo,:cantidad,:motivo)
        RETURNING id_movimiento INTO :newId`, {
        suc: data.id_sucursal, med: data.id_medicamento, usu: req.usuario.ID_USUARIO,
        tipo: data.tipo, cantidad: data.cantidad, motivo: data.motivo,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      });
      const idMovimiento = inserted.outBinds.newId[0];
      const before = old ? { cantidad_existente: old.CANTIDAD_EXISTENTE, cantidad_reservada: reserved } : null;
      const after = { cantidad_existente: newExistence, cantidad_reservada: reserved };
      await guardarAuditoria(conn, {
        usuarioId: req.usuario.ID_USUARIO,
        sucursalId: data.id_sucursal,
        entidad: 'MOVIMIENTO_INVENTARIO', registroId: idMovimiento,
        accion: data.tipo, antes: before,
        despues: { ...data, id_movimiento: idMovimiento, ...after }
      });
      return { id_movimiento: idMovimiento, ...data, ...after, cantidad_disponible: newExistence - reserved };
    });
    res.status(201).json({ datos: output });
  }));
  return router;
}
