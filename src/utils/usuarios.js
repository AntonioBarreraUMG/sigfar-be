import { badRequest } from './errors.js';
import { ROLES } from './authorization.js';
import { allowedFields, enumField, flagField, positiveId, textField } from './validation.js';

export const USER_ROLES = [ROLES.ADMIN, ROLES.ENCARGADO, ROLES.COORD];
export const USER_PUBLIC_FIELDS = `u.id_usuario, u.nombre, u.correo, u.id_rol,
  r.nombre AS rol, u.id_sucursal, s.nombre AS sucursal_nombre, u.activo`;

export function parseUsuario(body, { create = false } = {}) {
  const permitted = create
    ? ['nombre', 'correo', 'rol', 'id_sucursal', 'activo', 'clave']
    : ['nombre', 'correo', 'rol', 'id_sucursal', 'activo'];
  allowedFields(body, permitted, { partial: true });
  if (create) {
    const required = ['nombre', 'correo', 'rol', 'clave'];
    const missing = required.filter((key) => !(key in body));
    if (missing.length) throw badRequest(`Faltan campos: ${missing.join(', ')}.`);
  }
  const parsed = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'nombre') parsed.nombre = textField(value, key, 120);
    if (key === 'correo') {
      const correo = textField(value, key, 150).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw badRequest('El correo no es válido.');
      parsed.correo = correo;
    }
    if (key === 'rol') parsed.rol = enumField(value, key, USER_ROLES);
    if (key === 'id_sucursal') parsed.id_sucursal = value === null ? null : positiveId(value, key);
    if (key === 'activo') parsed.activo = flagField(value, key);
    if (key === 'clave') {
      if (typeof value !== 'string' || value.length < 12 || value.length > 128 || !value.trim()) {
        throw badRequest('La contraseña debe contener entre 12 y 128 caracteres.');
      }
      parsed.clave = value;
    }
  }
  return parsed;
}

export function resolverAsignacion({ rol, id_sucursal }) {
  if (rol === ROLES.ENCARGADO) {
    if (id_sucursal === null || id_sucursal === undefined)
      throw badRequest('El encargado debe tener una sucursal asignada.');
    return id_sucursal;
  }
  if (id_sucursal !== null && id_sucursal !== undefined)
    throw badRequest('Este rol no debe tener una sucursal asignada.');
  return null;
}

export function impedirAutoBloqueo(actorId, targetId, before, after) {
  if (Number(actorId) !== Number(targetId)) return;
  if (before.ROL === ROLES.ADMIN && (after.rol !== ROLES.ADMIN || after.activo !== 'S')) {
    throw badRequest('No puedes desactivar tu propia cuenta ni quitarte el rol de administrador.');
  }
}
