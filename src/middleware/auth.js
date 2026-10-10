import jwt from 'jsonwebtoken';
import { withConnection } from '../db/oracle.js';
import { HttpError, forbidden } from '../utils/errors.js';
import { positiveId } from '../utils/validation.js';
import { ROLES } from '../utils/authorization.js';

export function authMiddleware(secret) {
  return async (req, res, next) => {
    try {
      const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
      if (!match) throw new HttpError(401, 'NO_AUTENTICADO', 'Falta token Bearer.');
      let decoded;
      try { decoded = jwt.verify(match[1], secret, { algorithms: ['HS256'], issuer: 'sigfar' }); }
      catch { throw new HttpError(401, 'TOKEN_INVALIDO', 'Token inválido o vencido.'); }
      const usuarioId = positiveId(decoded.sub, 'usuarioId');
      const usuario = await withConnection(async conn => {
        const result = await conn.execute(`
          SELECT u.id_usuario, u.nombre, u.correo, u.id_sucursal, r.nombre AS rol
          FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
          WHERE u.id_usuario = :id AND u.activo = 'S'
        `, { id: usuarioId });
        return result.rows[0];
      });
      if (!usuario) throw new HttpError(401, 'USUARIO_INACTIVO', 'Usuario inexistente o inactivo.');
      req.usuario = usuario;
      next();
    } catch (error) { next(error); }
  };
}
export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.usuario?.ROL) ? next() : next(forbidden());
}
