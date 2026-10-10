import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeSucursal, scopeWriteSucursal, ROLES } from '../src/utils/authorization.js';

const encargado = { ROL: ROLES.ENCARGADO, ID_SUCURSAL: 2 };
const admin = { ROL: ROLES.ADMIN, ID_SUCURSAL: null };
const coord = { ROL: ROLES.COORD, ID_SUCURSAL: null };

test('encargado solo puede leer y escribir en su sucursal', () => {
  assert.equal(scopeSucursal(encargado, 2), 2);
  assert.equal(scopeWriteSucursal(encargado, 2), 2);
  assert.throws(() => scopeSucursal(encargado, 1), { status: 403 });
  assert.throws(() => scopeWriteSucursal(encargado, 1), { status: 403 });
});
test('administrador y coordinador pueden consultar otras sucursales sin escribir inventario', () => {
  assert.equal(scopeSucursal(admin, 1), 1);
  assert.equal(scopeSucursal(coord, 3), 3);
  assert.throws(() => scopeWriteSucursal(admin, 1), { status: 403 });
  assert.throws(() => scopeWriteSucursal(coord, 1), { status: 403 });
});
