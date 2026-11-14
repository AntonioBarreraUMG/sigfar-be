import { forbidden } from './errors.js';
import { positiveId } from './validation.js';
export const ROLES = Object.freeze({
  ADMIN: 'ADMIN_CENTRAL',
  ENCARGADO: 'ENCARGADO',
  COORD: 'COORD_ENTREGAS',
});
export function scopeSucursal(usuario, requestedId) {
  const id = positiveId(requestedId, 'id_sucursal');
  if (usuario.ROL === ROLES.ENCARGADO && usuario.ID_SUCURSAL !== id) throw forbidden();
  return id;
}
export function scopeWriteSucursal(usuario, requestedId) {
  const id = positiveId(requestedId, 'id_sucursal');
  if (usuario.ROL !== ROLES.ENCARGADO || usuario.ID_SUCURSAL !== id) throw forbidden();
  return id;
}
