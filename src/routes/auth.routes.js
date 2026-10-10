import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { withConnection } from '../db/oracle.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { verifyPassword } from '../utils/password.js';
import { objectBody } from '../utils/validation.js';
import { HttpError } from '../utils/errors.js';
import { apiRow } from '../utils/rows.js';

export function makeAuthRouter({ jwtSecret, jwtExpiresIn, authenticate }) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Espera antes de volver a intentar iniciar sesion.' } }
  });
  router.post('/login', limiter, asyncHandler(async (req, res) => {
    const body = objectBody(req.body);
    const correo = typeof body.correo === 'string' ? body.correo.trim().toLowerCase() : '';
    const clave = body.clave;
    if (!/^.{1,150}@.{1,150}$/.test(correo) || typeof clave !== 'string' || !clave || clave.length > 256) {
      throw new HttpError(400, 'VALIDACION', 'Correo y clave validos son obligatorios.');
    }
    const usuario = await withConnection(async conn => {
      const result = await conn.execute(`
        SELECT u.id_usuario, u.nombre, u.correo, u.id_sucursal, u.clave_hash, r.nombre AS rol
        FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
        WHERE LOWER(u.correo) = :correo AND u.activo = 'S'
      `, { correo });
      return result.rows[0];
    });
    if (!usuario || !(await verifyPassword(clave, usuario.CLAVE_HASH))) {
      throw new HttpError(401, 'CREDENCIALES_INVALIDAS', 'Credenciales incorrectas.');
    }
    const token = jwt.sign({}, jwtSecret, {
      algorithm: 'HS256', subject: String(usuario.ID_USUARIO), issuer: 'sigfar', expiresIn: jwtExpiresIn
    });
    const { CLAVE_HASH: ignored, ...safeUser } = usuario;
    res.json({ token, tipo: 'Bearer', usuario: apiRow(safeUser) });
  }));
  router.get('/me', authenticate, (req, res) => res.json({ usuario: apiRow(req.usuario) }));
  return router;
}
