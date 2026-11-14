import { Router } from 'express';
import { withConnection, withTransaction } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/authorization.js';
import { forbidden } from '../utils/errors.js';
import { apiRows } from '../utils/rows.js';
import { enumField, pagination, positiveId } from '../utils/validation.js';
import {
  autorizarSolicitud,
  ESTADOS_SOLICITUD,
  validarCuerpoVacio,
  validarConfirmacion,
  validarDisponibilidad,
  validarSolicitud,
} from '../utils/entregas.js';
import {
  SELECT_SOLICITUD,
  cancelarSolicitud,
  confirmarSolicitud,
  consultarSolicitud,
  consultarSucursalesElegibles,
  despacharSolicitud,
  entregarSolicitud,
  opcionesSolicitud,
  registrarSolicitud,
} from '../services/entregas.js';

export function makeSolicitudesRouter(authenticate) {
  const router = Router();
  router.use(authenticate);

  // Consulta sin escritura: punto de integracion futuro del call center.
  router.post(
    '/disponibilidad',
    requireRole(ROLES.COORD, ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const data = validarDisponibilidad(req.body);
      const opciones = await withConnection((conn) => consultarSucursalesElegibles(conn, data));
      res.json({
        datos: {
          departamento_entrega: data.departamento_entrega,
          municipio_entrega: data.municipio_entrega,
          opciones,
        },
      });
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { offset, limit } = pagination(req.query);
      const binds = { offset, limit };
      const conditions = [];
      if (req.usuario.ROL === ROLES.ENCARGADO) {
        binds.sucursal = req.usuario.ID_SUCURSAL;
        conditions.push('se.id_sucursal_asignada=:sucursal');
        if (
          req.query.id_sucursal !== undefined &&
          positiveId(req.query.id_sucursal, 'id_sucursal') !== binds.sucursal
        ) {
          throw forbidden();
        }
      } else if (req.query.id_sucursal !== undefined) {
        binds.sucursal = positiveId(req.query.id_sucursal, 'id_sucursal');
        conditions.push('se.id_sucursal_asignada=:sucursal');
      }
      if (req.query.estado !== undefined) {
        binds.estado = enumField(req.query.estado, 'estado', ESTADOS_SOLICITUD);
        conditions.push('se.estado=:estado');
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `
      ${SELECT_SOLICITUD} ${where}
      ORDER BY se.fecha_solicitud DESC, se.id_solicitud DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
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
      const id = positiveId(req.params.id, 'id_solicitud');
      const data = await withConnection((conn) => consultarSolicitud(conn, id));
      autorizarSolicitud(req.usuario, { ID_SUCURSAL_ASIGNADA: data.id_sucursal_asignada }, 'LEER');
      res.json({ datos: data });
    }),
  );

  router.get(
    '/:id/opciones',
    requireRole(ROLES.COORD, ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id, 'id_solicitud');
      const data = await withConnection((conn) => opcionesSolicitud(conn, id, req.usuario));
      res.json({ datos: data });
    }),
  );

  router.post(
    '/',
    requireRole(ROLES.COORD),
    asyncHandler(async (req, res) => {
      const data = validarSolicitud(req.body);
      const created = await withTransaction((conn) => registrarSolicitud(conn, req.usuario, data));
      res.status(201).json({ datos: created });
    }),
  );

  router.post(
    '/:id/confirmar',
    requireRole(ROLES.COORD),
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id, 'id_solicitud');
      const data = validarConfirmacion(req.body);
      const result = await withTransaction((conn) =>
        confirmarSolicitud(conn, req.usuario, id, data),
      );
      res.json({ datos: result });
    }),
  );

  router.post(
    '/:id/despachar',
    requireRole(ROLES.ENCARGADO),
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id, 'id_solicitud');
      validarCuerpoVacio(req.body);
      const result = await withTransaction((conn) => despacharSolicitud(conn, req.usuario, id));
      res.json({ datos: result });
    }),
  );

  router.post(
    '/:id/entregar',
    requireRole(ROLES.ENCARGADO, ROLES.COORD),
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id, 'id_solicitud');
      validarCuerpoVacio(req.body);
      const result = await withTransaction((conn) => entregarSolicitud(conn, req.usuario, id));
      res.json({ datos: result });
    }),
  );

  router.post(
    '/:id/cancelar',
    requireRole(ROLES.COORD),
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id, 'id_solicitud');
      validarCuerpoVacio(req.body);
      const result = await withTransaction((conn) => cancelarSolicitud(conn, req.usuario, id));
      res.json({ datos: result });
    }),
  );
  return router;
}
