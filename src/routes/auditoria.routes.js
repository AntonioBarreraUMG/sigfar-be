import { Router } from 'express';
import { withConnection, oracledb } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/authorization.js';
import { positiveId, pagination } from '../utils/validation.js';
import { notFound } from '../utils/errors.js';
import { apiRows } from '../utils/rows.js';
import { construirFiltrosAuditoria, formatearDetalleAuditoria } from '../utils/auditoria.js';

// La bitacora es una consulta exclusiva de ADMIN_CENTRAL. Sin endpoints de escritura.
export function makeAuditoriaRouter(authenticate) {
  const router = Router();
  router.use(authenticate, requireRole(ROLES.ADMIN));

  // Mantener '/registros' antes que cualquier ruta dinamica.
  router.get('/registros', asyncHandler(async (req, res) => {
    const { limit, offset } = pagination(req.query);
    const { where, binds } = construirFiltrosAuditoria(req.query);
    const respuesta = await withConnection(async conn => {
      const conteo = await conn.execute(`
        SELECT COUNT(*) AS total FROM registro_auditoria a ${where}
      `, binds);
      const registros = await conn.execute(`
        SELECT a.id_auditoria, a.id_usuario, u.nombre AS usuario, u.correo AS correo_usuario,
               a.id_sucursal, s.nombre AS sucursal, a.entidad, a.id_registro,
               a.accion, a.fecha_evento
        FROM registro_auditoria a
        JOIN usuario u ON u.id_usuario = a.id_usuario
        LEFT JOIN sucursal s ON s.id_sucursal = a.id_sucursal
        ${where}
        ORDER BY a.fecha_evento DESC, a.id_auditoria DESC
        OFFSET :offset ROWS FETCH NEXT :limite ROWS ONLY
      `, { ...binds, offset, limite: limit });
      return { total: conteo.rows[0].TOTAL, datos: apiRows(registros.rows) };
    });
    res.json({ ...respuesta, paginacion: { desde: offset, limite: limit } });
  }));

  // Resumen historico basado en los mismos filtros que la lista.
  // Incluye los registros globales sin sucursal (catalogo de medicamentos, etc.).
  router.get('/resumen', asyncHandler(async (req, res) => {
    const { where, binds } = construirFiltrosAuditoria(req.query);
    const resumen = await withConnection(async conn => {
      const total = await conn.execute(`SELECT COUNT(*) AS total
        FROM registro_auditoria a ${where}`, binds);
      const entidades = await conn.execute(`SELECT a.entidad, COUNT(*) AS cantidad
        FROM registro_auditoria a ${where}
        GROUP BY a.entidad ORDER BY cantidad DESC, a.entidad`, binds);
      const sucursales = await conn.execute(`SELECT a.id_sucursal, s.nombre AS sucursal,
          COUNT(*) AS cantidad
        FROM registro_auditoria a
        LEFT JOIN sucursal s ON s.id_sucursal = a.id_sucursal
        ${where}
        GROUP BY a.id_sucursal, s.nombre
        ORDER BY cantidad DESC, a.id_sucursal NULLS LAST`, binds);
      return {
        total: total.rows[0].TOTAL,
        por_entidad: apiRows(entidades.rows),
        por_sucursal: apiRows(sucursales.rows)
      };
    });
    res.json({ datos: resumen });
  }));

  router.get('/registros/:id', asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id, 'id_auditoria');
    const fila = await withConnection(async conn => (await conn.execute(`
      SELECT a.id_auditoria, a.id_usuario, u.nombre AS usuario, u.correo AS correo_usuario,
        a.id_sucursal, s.nombre AS sucursal, a.entidad, a.id_registro, a.accion,
        a.fecha_evento, a.datos_anteriores, a.datos_nuevos
      FROM registro_auditoria a
      JOIN usuario u ON u.id_usuario = a.id_usuario
      LEFT JOIN sucursal s ON s.id_sucursal = a.id_sucursal
      WHERE a.id_auditoria = :id
    `, { id }, {
      fetchInfo: {
        DATOS_ANTERIORES: { type: oracledb.STRING },
        DATOS_NUEVOS: { type: oracledb.STRING }
      }
    })).rows[0]);
    if (!fila) throw notFound('Registro de auditoria no encontrado.');
    res.json({ datos: formatearDetalleAuditoria(fila) });
  }));
  return router;
}
