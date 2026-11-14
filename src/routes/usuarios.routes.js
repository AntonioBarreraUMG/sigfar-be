import { Router } from 'express';
import { withConnection, withTransaction, oracledb } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/authorization.js';
import {
  USER_ROLES,
  USER_PUBLIC_FIELDS,
  parseUsuario,
  resolverAsignacion,
  impedirAutoBloqueo,
} from '../utils/usuarios.js';
import { pagination, positiveId, flagField, enumField, objectBody } from '../utils/validation.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';
import { guardarAuditoria } from '../services/auditoria.js';
import { apiRow, apiRows } from '../utils/rows.js';

const FROM = `FROM usuario u JOIN rol r ON r.id_rol = u.id_rol LEFT JOIN sucursal s ON s.id_sucursal = u.id_sucursal`;
const PUBLIC = `SELECT ${USER_PUBLIC_FIELDS} ${FROM}`;

async function buscarUsuario(conn, id, { locked = false } = {}) {
  if (locked) {
    // Bloquear la tabla base directamente: evita incompatibilidades de FOR UPDATE
    // sobre LEFT JOIN en algunas configuraciones Oracle.
    const lock = await conn.execute(
      'SELECT id_usuario FROM usuario WHERE id_usuario = :id FOR UPDATE NOWAIT',
      { id },
    );
    if (!lock.rows.length) return null;
  }
  const result = await conn.execute(`${PUBLIC} WHERE u.id_usuario = :id`, { id });
  return result.rows[0] || null;
}

async function buscarRolId(conn, rol) {
  const result = await conn.execute('SELECT id_rol FROM rol WHERE nombre = :rol', { rol });
  if (!result.rows.length) throw badRequest('Rol no configurado en Oracle XE.');
  return result.rows[0].ID_ROL;
}

async function validarSucursal(conn, id) {
  if (id === null) return;
  const result = await conn.execute('SELECT activa FROM sucursal WHERE id_sucursal = :id', { id });
  if (!result.rows.length || result.rows[0].ACTIVA !== 'S')
    throw badRequest('La sucursal asignada no existe o está inactiva.');
}

// En cambios de cuentas administrativas, bloqueamos la fila del rol ADMIN para serializar
// comprobaciones del último administrador activo entre solicitudes concurrentes.
async function bloquearAdministradores(conn) {
  const result = await conn.execute('SELECT id_rol FROM rol WHERE nombre = :rol FOR UPDATE', {
    rol: ROLES.ADMIN,
  });
  if (!result.rows.length) throw badRequest('Falta el rol de administrador en Oracle XE.');
  return result.rows[0].ID_ROL;
}

async function protegerUltimoAdministrador(conn, before, after, rolAdminId) {
  if (
    before.ROL !== ROLES.ADMIN ||
    before.ACTIVO !== 'S' ||
    (after.rol === ROLES.ADMIN && after.activo === 'S')
  )
    return;
  const result = await conn.execute(
    `SELECT COUNT(*) AS TOTAL FROM usuario WHERE id_rol = :id AND activo = 'S'`,
    { id: rolAdminId },
  );
  if (Number(result.rows[0].TOTAL) <= 1)
    throw conflict('Debe mantenerse al menos un administrador central activo.');
}

export function makeUsuariosRouter(authenticate) {
  const router = Router();
  router.use(authenticate, requireRole(ROLES.ADMIN));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { offset, limit } = pagination(req.query);
      const binds = { offset, limit };
      let where = 'WHERE 1=1';
      if (req.query.activo !== undefined) {
        binds.activo = flagField(req.query.activo, 'activo');
        where += ' AND u.activo = :activo';
      }
      if (req.query.rol !== undefined) {
        binds.rol = enumField(req.query.rol, 'rol', USER_ROLES);
        where += ' AND r.nombre = :rol';
      }
      const rows = await withConnection(
        async (conn) =>
          (
            await conn.execute(
              `${PUBLIC} ${where}
      ORDER BY u.id_usuario OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
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
      const row = await withConnection((conn) => buscarUsuario(conn, id));
      if (!row) throw notFound('Usuario no encontrado.');
      res.json({ datos: apiRow(row) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const fields = parseUsuario(req.body, { create: true });
      const sucursalId = resolverAsignacion(fields);
      // Contraseña hasheada ANTES de abrir la transacción y sin persistir el texto original.
      const claveHash = await hashPassword(fields.clave);
      const row = await withTransaction(async (conn) => {
        await validarSucursal(conn, sucursalId);
        const rolId = await buscarRolId(conn, fields.rol);
        const insert = await conn.execute(
          `INSERT INTO usuario (id_rol,id_sucursal,nombre,correo,clave_hash,activo)
        VALUES (:rolId,:sucursalId,:nombre,:correo,:claveHash,:activo)
        RETURNING id_usuario INTO :newId`,
          {
            rolId,
            sucursalId,
            nombre: fields.nombre,
            correo: fields.correo,
            claveHash,
            activo: fields.activo ?? 'S',
            newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          },
        );
        const id = insert.outBinds.newId[0];
        const actual = await buscarUsuario(conn, id);
        await guardarAuditoria(conn, {
          usuarioId: req.usuario.ID_USUARIO,
          sucursalId,
          entidad: 'USUARIO',
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
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id);
      const changes = parseUsuario(req.body);
      const row = await withTransaction(async (conn) => {
        const rolAdminId = await bloquearAdministradores(conn);
        const before = await buscarUsuario(conn, id, { locked: true });
        if (!before) throw notFound('Usuario no encontrado.');
        const effective = {
          nombre: changes.nombre ?? before.NOMBRE,
          correo: changes.correo ?? before.CORREO,
          rol: changes.rol ?? before.ROL,
          activo: changes.activo ?? before.ACTIVO,
          id_sucursal: Object.hasOwn(changes, 'id_sucursal')
            ? changes.id_sucursal
            : before.ID_SUCURSAL,
        };
        // Si se cambia un encargado por un rol central, liberamos su sucursal automáticamente.
        if (
          changes.rol &&
          changes.rol !== ROLES.ENCARGADO &&
          !Object.hasOwn(changes, 'id_sucursal')
        )
          effective.id_sucursal = null;
        effective.id_sucursal = resolverAsignacion(effective);
        impedirAutoBloqueo(req.usuario.ID_USUARIO, id, before, effective);
        await protegerUltimoAdministrador(conn, before, effective, rolAdminId);
        // Sólo exigimos una sucursal activa al ASIGNAR o cambiar a un encargado activo.
        if (
          effective.rol === ROLES.ENCARGADO &&
          effective.activo === 'S' &&
          (changes.rol !== undefined || Object.hasOwn(changes, 'id_sucursal'))
        ) {
          await validarSucursal(conn, effective.id_sucursal);
        }
        const rolId = await buscarRolId(conn, effective.rol);
        await conn.execute(
          `UPDATE usuario SET id_rol=:rolId, id_sucursal=:sucursalId,
        nombre=:nombre, correo=:correo, activo=:activo WHERE id_usuario=:id`,
          {
            id,
            rolId,
            sucursalId: effective.id_sucursal,
            nombre: effective.nombre,
            correo: effective.correo,
            activo: effective.activo,
          },
        );
        const actual = await buscarUsuario(conn, id);
        await guardarAuditoria(conn, {
          usuarioId: req.usuario.ID_USUARIO,
          sucursalId: actual.ID_SUCURSAL,
          entidad: 'USUARIO',
          registroId: id,
          accion: 'MODIFICAR',
          antes: apiRow(before),
          despues: apiRow(actual),
        });
        return actual;
      });
      res.json({ datos: apiRow(row) });
    }),
  );

  router.post(
    '/:id/restablecer-clave',
    asyncHandler(async (req, res) => {
      const id = positiveId(req.params.id);
      const body = objectBody(req.body);
      if (Object.keys(body).length !== 1 || typeof body.clave_nueva !== 'string')
        throw badRequest('Debe enviar únicamente clave_nueva.');
      if (
        body.clave_nueva.length < 12 ||
        body.clave_nueva.length > 128 ||
        !body.clave_nueva.trim()
      ) {
        throw badRequest('La nueva contraseña debe tener entre 12 y 128 caracteres.');
      }
      const hash = await hashPassword(body.clave_nueva);
      await withTransaction(async (conn) => {
        const prev = await buscarUsuario(conn, id, { locked: true });
        if (!prev) throw notFound('Usuario no encontrado.');
        await conn.execute('UPDATE usuario SET clave_hash=:hash WHERE id_usuario=:id', {
          id,
          hash,
        });
        // Nunca almacenar la contraseña ni el hash en los registros de auditoría.
        await guardarAuditoria(conn, {
          usuarioId: req.usuario.ID_USUARIO,
          sucursalId: prev.ID_SUCURSAL,
          entidad: 'USUARIO',
          registroId: id,
          accion: 'RESTABLECER_CLAVE',
          despues: { id_usuario: id, clave_restablecida: true },
        });
      });
      res.json({ mensaje: 'Contraseña restablecida correctamente.' });
    }),
  );

  return router;
}
