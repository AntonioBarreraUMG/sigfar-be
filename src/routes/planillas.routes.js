import { Router } from 'express';
import { withConnection, withTransaction } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/authorization.js';
import { positiveId, pagination } from '../utils/validation.js';
import { notFound } from '../utils/errors.js';
import { apiRow, apiRows } from '../utils/rows.js';
import {
  condicionesSql,
  condicionSucursal,
  filtrosPeriodos,
  validarLecturaSucursal,
  validarGastoPlanilla,
  validarCorreccionPlanilla,
} from '../utils/administracion.js';
import {
  registrarPlanilla,
  corregirPlanilla,
  GASTO_PLANILLA_SELECT,
} from '../services/administracion.js';

function filtros(query, usuario) {
  return condicionesSql(
    condicionSucursal(usuario, query.id_sucursal, 'p'),
    filtrosPeriodos(query, 'p.periodo'),
  );
}

export function makePlanillasRouter(authenticate) {
  const router = Router();
  router.use(authenticate, requireRole(ROLES.ADMIN, ROLES.ENCARGADO));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { offset, limit } = pagination(req.query);
      const { where, binds } = filtros(req.query, req.usuario);
      const rows = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `
      SELECT p.id_gasto_planilla, p.id_sucursal, p.id_usuario, p.periodo,
        p.monto_total, p.fecha_registro, s.nombre AS sucursal
      FROM gasto_planilla p JOIN sucursal s ON s.id_sucursal=p.id_sucursal
      ${where}
      ORDER BY p.periodo DESC, p.id_gasto_planilla DESC
      OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`,
              { ...binds, offset, limite: limit },
            )
          ).rows,
      );
      res.json({ datos: apiRows(rows), paginacion: { desde: offset, limite: limit } });
    }),
  );

  router.get(
    '/resumen',
    asyncHandler(async (req, res) => {
      const { where, binds } = filtros(req.query, req.usuario);
      const rows = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `
      SELECT CASE WHEN GROUPING(p.id_sucursal)=1 THEN 'TOTAL' ELSE 'SUCURSAL' END AS nivel,
        p.id_sucursal, s.nombre AS sucursal, COUNT(*) AS periodos_registrados,
        NVL(SUM(p.monto_total),0) AS total_planilla
      FROM gasto_planilla p JOIN sucursal s ON s.id_sucursal=p.id_sucursal
      ${where}
      GROUP BY GROUPING SETS ((p.id_sucursal, s.nombre), ())
      ORDER BY nivel, p.id_sucursal`,
              binds,
            )
          ).rows,
      );
      const datos = apiRows(rows);
      res.json({
        moneda: 'GTQ',
        totales: datos.find((r) => r.nivel === 'TOTAL') ?? null,
        por_sucursal: datos.filter((r) => r.nivel === 'SUCURSAL'),
      });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id, 'id_gasto_planilla');
      const row = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `SELECT ${GASTO_PLANILLA_SELECT}
      FROM gasto_planilla WHERE id_gasto_planilla=:id`,
              { id },
            )
          ).rows[0],
      );
      if (!row) throw notFound('Gasto de planilla no encontrado.');
      validarLecturaSucursal(req.usuario, row.ID_SUCURSAL);
      res.json({ datos: apiRow(row) });
    }),
  );

  router.post(
    '/',
    requireRole(ROLES.ENCARGADO),
    asyncHandler(async (req, res) => {
      const data = validarGastoPlanilla(req.body);
      const registro = await withTransaction((conn) => registrarPlanilla(conn, req.usuario, data));
      res.status(201).json({ datos: registro });
    }),
  );

  router.patch(
    '/:id',
    requireRole(ROLES.ENCARGADO),
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id, 'id_gasto_planilla');
      const data = validarCorreccionPlanilla(req.body);
      const actualizado = await withTransaction((conn) =>
        corregirPlanilla(conn, req.usuario, id, data),
      );
      res.json({ datos: actualizado });
    }),
  );
  return router;
}
