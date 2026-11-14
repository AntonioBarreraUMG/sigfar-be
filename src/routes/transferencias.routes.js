import { Router } from 'express';
import { withConnection, withTransaction } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/authorization.js';
import { positiveId, enumField, pagination, objectBody } from '../utils/validation.js';
import { badRequest, forbidden } from '../utils/errors.js';
import { apiRows } from '../utils/rows.js';
import { validarNuevaTransferencia, ESTADOS_TRANSFERENCIA } from '../utils/transferencias.js';
import {
  consultarTransferencia,
  registrarTransferencia,
  despacharTransferencia,
  recibirTransferencia,
  SELECT_HEADER,
} from '../services/transferencias.js';

function soloCuerpoVacio(req) {
  if (req.body === undefined) return;
  const body = objectBody(req.body);
  if (Object.keys(body).length > 0)
    throw badRequest('Este cambio de estado no admite campos JSON.');
}

export function makeTransferenciasRouter(authenticate) {
  const router = Router();
  router.use(authenticate, requireRole(ROLES.ADMIN, ROLES.ENCARGADO));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { offset, limit } = pagination(req.query);
      const conditions = [];
      const binds = { offset, limit };
      if (req.usuario.ROL === ROLES.ENCARGADO) {
        // Una sucursal solo ve las transferencias en las que participa.
        binds.sucursal = req.usuario.ID_SUCURSAL;
        conditions.push('(t.id_sucursal_origen=:sucursal OR t.id_sucursal_destino=:sucursal)');
        if (
          req.query.id_sucursal !== undefined &&
          positiveId(req.query.id_sucursal, 'id_sucursal') !== binds.sucursal
        ) {
          throw forbidden();
        }
      } else if (req.query.id_sucursal !== undefined) {
        binds.sucursal = positiveId(req.query.id_sucursal, 'id_sucursal');
        conditions.push('(t.id_sucursal_origen=:sucursal OR t.id_sucursal_destino=:sucursal)');
      }
      if (req.query.estado !== undefined) {
        binds.estado = enumField(req.query.estado, 'estado', ESTADOS_TRANSFERENCIA);
        conditions.push('t.estado=:estado');
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `
      ${SELECT_HEADER} ${where}
      ORDER BY t.fecha_registro DESC, t.id_transferencia DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `,
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
      const id = positiveId(req.params.id, 'id_transferencia');
      const data = await withConnection((conn) => consultarTransferencia(conn, id));
      if (
        req.usuario.ROL === ROLES.ENCARGADO &&
        data.id_sucursal_origen !== req.usuario.ID_SUCURSAL &&
        data.id_sucursal_destino !== req.usuario.ID_SUCURSAL
      )
        throw forbidden();
      res.json({ datos: data });
    }),
  );

  router.post(
    '/',
    requireRole(ROLES.ENCARGADO),
    asyncHandler(async (req, res) => {
      const data = validarNuevaTransferencia(req.body);
      // Validacion de rol y origen tambien se hace dentro del servicio.
      const created = await withTransaction((conn) =>
        registrarTransferencia(conn, req.usuario, data),
      );
      res.status(201).json({ datos: created });
    }),
  );

  router.post(
    '/:id/despachar',
    requireRole(ROLES.ENCARGADO),
    asyncHandler(async (req, res) => {
      soloCuerpoVacio(req);
      const id = positiveId(req.params.id, 'id_transferencia');
      const result = await withTransaction((conn) => despacharTransferencia(conn, req.usuario, id));
      res.json({ datos: result });
    }),
  );

  router.post(
    '/:id/recibir',
    requireRole(ROLES.ENCARGADO),
    asyncHandler(async (req, res) => {
      soloCuerpoVacio(req);
      const id = positiveId(req.params.id, 'id_transferencia');
      const result = await withTransaction((conn) => recibirTransferencia(conn, req.usuario, id));
      res.json({ datos: result });
    }),
  );

  return router;
}
