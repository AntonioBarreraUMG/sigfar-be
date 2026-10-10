import { Router } from 'express';
import { withConnection, withTransaction, oracledb } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES, scopeSucursal } from '../utils/authorization.js';
import { allowedFields, positiveId, textField, enumField, flagField, nonNegativeCount, pagination } from '../utils/validation.js';
import { badRequest, notFound } from '../utils/errors.js';
import { guardarAuditoria } from '../services/auditoria.js';
import { apiRow, apiRows } from '../utils/rows.js';

const SELECT_FIELDS = `id_sucursal, codigo, nombre, tipo, departamento, municipio, direccion, tiempo_entrega_min, activa`;
const FIELDS = ['codigo', 'nombre', 'tipo', 'departamento', 'municipio', 'direccion', 'tiempo_entrega_min', 'activa'];
const REQUIRED = FIELDS.filter(f => f !== 'activa');

function validate(body, patch = false) {
  allowedFields(body, FIELDS, { partial: true });
  if (!patch) {
    const missing = REQUIRED.filter(f => !(f in body));
    if (missing.length) throw badRequest(`Faltan campos: ${missing.join(', ')}.`);
  }
  const fields = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'codigo') fields.codigo = textField(value, key, 20).toUpperCase();
    else if (key === 'nombre') fields.nombre = textField(value, key, 120);
    else if (key === 'tipo') fields.tipo = enumField(value, key, ['CENTRO_COMERCIAL', 'GASOLINERA']);
    else if (key === 'departamento' || key === 'municipio') fields[key] = textField(value, key, 80);
    else if (key === 'direccion') fields.direccion = textField(value, key, 250);
    else if (key === 'activa') fields.activa = flagField(value, key);
    else if (key === 'tiempo_entrega_min') {
      fields.tiempo_entrega_min = nonNegativeCount(value, key);
      if (!fields.tiempo_entrega_min || fields.tiempo_entrega_min > 99999) throw badRequest('tiempo_entrega_min debe ser de 1 a 99999.');
    }
  }
  return fields;
}

export function makeSucursalesRouter(authenticate) {
  const router = Router();
  router.use(authenticate);
  router.get('/', asyncHandler(async (req, res) => {
    const { offset, limit } = pagination(req.query);
    let where = 'WHERE 1=1';
    const binds = { offset, limit };
    if (req.usuario.ROL === ROLES.ENCARGADO) {
      where += ' AND id_sucursal = :sucursal';
      binds.sucursal = req.usuario.ID_SUCURSAL;
    }
    if (req.query.activa !== undefined) {
      binds.activa = flagField(req.query.activa, 'activa');
      where += ' AND activa = :activa';
    }
    const rows = await withConnection(async conn => (await conn.execute(`
      SELECT ${SELECT_FIELDS} FROM sucursal ${where}
      ORDER BY id_sucursal OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `, binds)).rows);
    res.json({ datos: apiRows(rows), paginacion: { desde: offset, limite: limit } });
  }));
  router.get('/:id', asyncHandler(async (req, res) => {
    const id = scopeSucursal(req.usuario, req.params.id);
    const row = await withConnection(async conn => (await conn.execute(`SELECT ${SELECT_FIELDS} FROM sucursal WHERE id_sucursal = :id`, { id })).rows[0]);
    if (!row) throw notFound('Sucursal no encontrada.');
    res.json({ datos: apiRow(row) });
  }));
  router.post('/', requireRole(ROLES.ADMIN), asyncHandler(async (req, res) => {
    const obj = { activa: 'S', ...validate(req.body) };
    const row = await withTransaction(async conn => {
      const result = await conn.execute(`
        INSERT INTO sucursal (codigo,nombre,tipo,departamento,municipio,direccion,tiempo_entrega_min,activa)
        VALUES (:codigo,:nombre,:tipo,:departamento,:municipio,:direccion,:tiempo_entrega_min,:activa)
        RETURNING id_sucursal INTO :newId
      `, { ...obj, newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      const id = result.outBinds.newId[0];
      const actual = (await conn.execute(`SELECT ${SELECT_FIELDS} FROM sucursal WHERE id_sucursal=:id`, { id })).rows[0];
      await guardarAuditoria(conn, { usuarioId: req.usuario.ID_USUARIO, sucursalId: id, entidad: 'SUCURSAL', registroId: id, accion: 'CREAR', despues: apiRow(actual) });
      return actual;
    });
    res.status(201).json({ datos: apiRow(row) });
  }));
  router.patch('/:id', requireRole(ROLES.ADMIN), asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id);
    const fields = validate(req.body, true);
    const row = await withTransaction(async conn => {
      const prev = (await conn.execute(`SELECT ${SELECT_FIELDS} FROM sucursal WHERE id_sucursal=:id FOR UPDATE`, { id })).rows[0];
      if (!prev) throw notFound('Sucursal no encontrada.');
      const binds = { id, ...fields };
      const setSql = Object.keys(fields).map(f => `${f} = :${f}`).join(', ');
      await conn.execute(`UPDATE sucursal SET ${setSql} WHERE id_sucursal = :id`, binds);
      const actual = (await conn.execute(`SELECT ${SELECT_FIELDS} FROM sucursal WHERE id_sucursal=:id`, { id })).rows[0];
      await guardarAuditoria(conn, { usuarioId: req.usuario.ID_USUARIO, sucursalId: id, entidad: 'SUCURSAL', registroId: id, accion: 'MODIFICAR', antes: apiRow(prev), despues: apiRow(actual) });
      return actual;
    });
    res.json({ datos: apiRow(row) });
  }));
  return router;
}
