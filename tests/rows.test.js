import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRow, apiRows } from '../src/utils/rows.js';

test('serializa nombre de columnas Oracle con claves minusculas', () => {
  assert.deepEqual(apiRow({ ID_SUCURSAL: 2, CANTIDAD_RESERVADA: 4 }), { id_sucursal: 2, cantidad_reservada: 4 });
  assert.deepEqual(apiRows([]), []);
  assert.equal(apiRow(null), null);
});
