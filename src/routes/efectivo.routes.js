import { Router } from 'express';
import { withConnection, withTransaction } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/authorization.js';
import { positiveId, enumField, pagination } from '../utils/validation.js';
import { notFound } from '../utils/errors.js';
import { apiRow, apiRows } from '../utils/rows.js';
import { condicionesSql, condicionSucursal, filtrosFechas, validarLecturaSucursal, validarMovimientoEfectivo } from '../utils/administracion.js';
import { registrarEfectivo, MOVIMIENTO_EFECTIVO_SELECT } from '../services/administracion.js';

function filtros(query, usuario) {
  const tipo = { condiciones: [], binds: {} };
  if (query.tipo !== undefined) {
    tipo.binds.tipo = enumField(query.tipo, 'tipo', ['INGRESO', 'EGRESO']);
    tipo.condiciones.push('e.tipo=:tipo');
  }
  return condicionesSql(condicionSucursal(usuario, query.id_sucursal, 'e'), filtrosFechas(query, 'e.fecha_movimiento'), tipo);
}

export function makeEfectivoRouter(authenticate) {
  const router = Router();
  router.use(authenticate, requireRole(ROLES.ADMIN, ROLES.ENCARGADO));

  router.get('/movimientos', asyncHandler(async (req, res) => {
    const { offset, limit } = pagination(req.query);
    const { where, binds } = filtros(req.query, req.usuario);
    const rows = await withConnection(async conn => (await conn.execute(`
      SELECT e.id_movimiento_efectivo, e.id_sucursal, e.id_usuario, e.tipo,
        e.concepto, e.monto, e.fecha_movimiento, s.nombre AS sucursal
      FROM movimiento_efectivo e JOIN sucursal s ON s.id_sucursal=e.id_sucursal
      ${where}
      ORDER BY e.fecha_movimiento DESC, e.id_movimiento_efectivo DESC
      OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY`, { ...binds, offset, limite: limit })).rows);
    res.json({ datos: apiRows(rows), paginacion: { desde: offset, limite: limit } });
  }));

  router.get('/resumen', asyncHandler(async (req, res) => {
    const { where, binds } = filtros(req.query, req.usuario);
    const rows = await withConnection(async conn => (await conn.execute(`
      SELECT CASE WHEN GROUPING(e.id_sucursal)=1 THEN 'TOTAL' ELSE 'SUCURSAL' END AS nivel,
        e.id_sucursal, s.nombre AS sucursal, COUNT(*) AS cantidad_movimientos,
        NVL(SUM(CASE WHEN e.tipo='INGRESO' THEN e.monto ELSE 0 END),0) AS ingresos,
        NVL(SUM(CASE WHEN e.tipo='EGRESO' THEN e.monto ELSE 0 END),0) AS egresos,
        NVL(SUM(CASE WHEN e.tipo='INGRESO' THEN e.monto ELSE -e.monto END),0) AS flujo_neto
      FROM movimiento_efectivo e JOIN sucursal s ON s.id_sucursal=e.id_sucursal
      ${where}
      GROUP BY GROUPING SETS ((e.id_sucursal, s.nombre), ())
      ORDER BY nivel, e.id_sucursal`, binds)).rows);
    const datos = apiRows(rows);
    res.json({ moneda: 'GTQ', totales: datos.find(r => r.nivel === 'TOTAL') ?? null,
      por_sucursal: datos.filter(r => r.nivel === 'SUCURSAL') });
  }));

  router.get('/movimientos/:id', asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id, 'id_movimiento_efectivo');
    const row = await withConnection(async conn => (await conn.execute(`SELECT ${MOVIMIENTO_EFECTIVO_SELECT}
      FROM movimiento_efectivo WHERE id_movimiento_efectivo=:id`, { id })).rows[0]);
    if (!row) throw notFound('Movimiento de efectivo no encontrado.');
    validarLecturaSucursal(req.usuario, row.ID_SUCURSAL);
    res.json({ datos: apiRow(row) });
  }));

  router.post('/movimientos', requireRole(ROLES.ENCARGADO), asyncHandler(async (req, res) => {
    const data = validarMovimientoEfectivo(req.body);
    const registro = await withTransaction(conn => registrarEfectivo(conn, req.usuario, data));
    res.status(201).json({ datos: registro });
  }));
  return router;
}
