import { Router } from 'express';
import { withConnection, withTransaction, oracledb } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/authorization.js';
import {
  allowedFields,
  positiveId,
  textField,
  flagField,
  pagination,
} from '../utils/validation.js';
import { badRequest, notFound } from '../utils/errors.js';
import { guardarAuditoria } from '../services/auditoria.js';
import { apiRow, apiRows } from '../utils/rows.js';

const SELECT_FIELDS = 'id_medicamento, codigo, nombre, presentacion, activo';
const FIELDS = ['codigo', 'nombre', 'presentacion', 'activo'];
function validate(body, patch = false) {
  allowedFields(body, FIELDS, { partial: true });
  if (!patch && ['codigo', 'nombre', 'presentacion'].some((f) => !(f in body)))
    throw badRequest('codigo, nombre y presentacion son obligatorios.');
  const obj = {};
  for (const [field, value] of Object.entries(body)) {
    if (field === 'codigo') obj.codigo = textField(value, field, 30).toUpperCase();
    else if (field === 'nombre') obj.nombre = textField(value, field, 150);
    else if (field === 'presentacion') obj.presentacion = textField(value, field, 100);
    else if (field === 'activo') obj.activo = flagField(value, field);
  }
  return obj;
}
export function makeMedicamentosRouter(authenticate) {
  const router = Router();
  router.use(authenticate);
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { offset, limit } = pagination(req.query);
      const binds = { offset, limit };
      let where = '';
      if (req.query.activo !== undefined) {
        binds.activo = flagField(req.query.activo, 'activo');
        where = 'WHERE activo = :activo';
      }
      const rows = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `SELECT ${SELECT_FIELDS} FROM medicamento ${where}
      ORDER BY id_medicamento OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
              binds,
            )
          ).rows,
      );
      res.json({ datos: apiRows(rows), paginacion: { desde: offset, limite: limit } });
    }),
  );
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id);
      const row = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `SELECT ${SELECT_FIELDS} FROM medicamento WHERE id_medicamento=:id`,
              { id },
            )
          ).rows[0],
      );
      if (!row) throw notFound('Medicamento no encontrado.');
      res.json({ datos: apiRow(row) });
    }),
  );
  router.post(
    '/',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const obj = { activo: 'S', ...validate(req.body) };
      const row = await withTransaction(async (conn) => {
        const result = await conn.execute(
          `INSERT INTO medicamento (codigo,nombre,presentacion,activo)
        VALUES (:codigo,:nombre,:presentacion,:activo) RETURNING id_medicamento INTO :newId`,
          { ...obj, newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
        );
        const id = result.outBinds.newId[0];
        const actual = (
          await conn.execute(`SELECT ${SELECT_FIELDS} FROM medicamento WHERE id_medicamento=:id`, {
            id,
          })
        ).rows[0];
        await guardarAuditoria(conn, {
          usuarioId: req.usuario.ID_USUARIO,
          entidad: 'MEDICAMENTO',
          registroId: id,
          accion: 'CREAR',
          despues: apiRow(actual),
        });
        return actual;
      });
      res.status(201).json({ datos: apiRow(row) });
    }),
  );
  router.patch(
    '/:id',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id);
      const obj = validate(req.body, true);
      const row = await withTransaction(async (conn) => {
        const prev = (
          await conn.execute(
            `SELECT ${SELECT_FIELDS} FROM medicamento WHERE id_medicamento=:id FOR UPDATE`,
            { id },
          )
        ).rows[0];
        if (!prev) throw notFound('Medicamento no encontrado.');
        const setSql = Object.keys(obj)
          .map((f) => `${f} = :${f}`)
          .join(', ');
        await conn.execute(`UPDATE medicamento SET ${setSql} WHERE id_medicamento=:id`, {
          id,
          ...obj,
        });
        const actual = (
          await conn.execute(`SELECT ${SELECT_FIELDS} FROM medicamento WHERE id_medicamento=:id`, {
            id,
          })
        ).rows[0];
        await guardarAuditoria(conn, {
          usuarioId: req.usuario.ID_USUARIO,
          entidad: 'MEDICAMENTO',
          registroId: id,
          accion: 'MODIFICAR',
          antes: apiRow(prev),
          despues: apiRow(actual),
        });
        return actual;
      });
      res.json({ datos: apiRow(row) });
    }),
  );
  return router;
}
