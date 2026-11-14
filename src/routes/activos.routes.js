import { Router } from 'express';
import { withConnection, withTransaction } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/authorization.js';
import { positiveId, enumField, pagination } from '../utils/validation.js';
import { notFound } from '../utils/errors.js';
import { apiRow, apiRows } from '../utils/rows.js';
import {
  condicionesSql,
  condicionSucursal,
  validarLecturaSucursal,
  validarActivoNuevo,
  validarActualizacionActivo,
} from '../utils/administracion.js';
import {
  registrarActivo,
  actualizarActivo,
  ACTIVO_FIJO_SELECT,
} from '../services/administracion.js';

function filtros(query, usuario, { soloVigentes = false } = {}) {
  const estado = { condiciones: [], binds: {} };
  const solicitado = query.estado ?? (soloVigentes ? 'VIGENTE' : undefined);
  if (solicitado !== undefined) {
    estado.binds.estado = enumField(solicitado, 'estado', ['VIGENTE', 'BAJA']);
    estado.condiciones.push('a.estado=:estado');
  }
  return condicionesSql(condicionSucursal(usuario, query.id_sucursal, 'a'), estado);
}

export function makeActivosRouter(authenticate) {
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
      SELECT a.id_activo, a.id_sucursal, a.id_usuario_registro, a.codigo,
        a.descripcion, a.valor, a.estado, a.fecha_registro, s.nombre AS sucursal
      FROM activo_fijo a JOIN sucursal s ON s.id_sucursal=a.id_sucursal
      ${where}
      ORDER BY a.id_activo DESC
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
      const { where, binds } = filtros(req.query, req.usuario, { soloVigentes: true });
      const rows = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `
      SELECT CASE WHEN GROUPING(a.id_sucursal)=1 THEN 'TOTAL' ELSE 'SUCURSAL' END AS nivel,
        a.id_sucursal, s.nombre AS sucursal, COUNT(*) AS cantidad_activos,
        NVL(SUM(a.valor),0) AS valor_total
      FROM activo_fijo a JOIN sucursal s ON s.id_sucursal=a.id_sucursal
      ${where}
      GROUP BY GROUPING SETS ((a.id_sucursal, s.nombre), ())
      ORDER BY nivel, a.id_sucursal`,
              binds,
            )
          ).rows,
      );
      const datos = apiRows(rows);
      res.json({
        moneda: 'GTQ',
        estado: binds.estado ?? 'VIGENTE',
        totales: datos.find((r) => r.nivel === 'TOTAL') ?? null,
        por_sucursal: datos.filter((r) => r.nivel === 'SUCURSAL'),
      });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id, 'id_activo');
      const row = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `SELECT ${ACTIVO_FIJO_SELECT}
      FROM activo_fijo WHERE id_activo=:id`,
              { id },
            )
          ).rows[0],
      );
      if (!row) throw notFound('Activo fijo no encontrado.');
      validarLecturaSucursal(req.usuario, row.ID_SUCURSAL);
      res.json({ datos: apiRow(row) });
    }),
  );

  router.post(
    '/',
    requireRole(ROLES.ENCARGADO),
    asyncHandler(async (req, res) => {
      const data = validarActivoNuevo(req.body);
      const registro = await withTransaction((conn) => registrarActivo(conn, req.usuario, data));
      res.status(201).json({ datos: registro });
    }),
  );

  router.patch(
    '/:id',
    requireRole(ROLES.ENCARGADO),
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id, 'id_activo');
      const data = validarActualizacionActivo(req.body);
      const actualizado = await withTransaction((conn) =>
        actualizarActivo(conn, req.usuario, id, data),
      );
      res.json({ datos: actualizado });
    }),
  );
  return router;
}
