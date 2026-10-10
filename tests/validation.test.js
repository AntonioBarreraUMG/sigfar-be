import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedFields, positiveId, nonNegativeCount, pagination, textField, enumField } from '../src/utils/validation.js';

test('IDs enteros Oracle validos y rechazo de inyeccion', () => {
  assert.equal(positiveId('1000'), 1000);
  for (const invalid of ['0', '-1', '1 OR 1=1', '1.1', '01', null, {}, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => positiveId(invalid));
  }
});
test('cantidades no permiten negativos ni fracciones', () => {
  assert.equal(nonNegativeCount(0, 'cantidad'), 0);
  assert.equal(nonNegativeCount(12, 'cantidad'), 12);
  for (const invalid of [-1, 1.5, '2', Infinity, null]) assert.throws(() => nonNegativeCount(invalid, 'cantidad'));
});
test('paginas acotadas y valores de texto', () => {
  assert.deepEqual(pagination({ limite: '10', desde: '5' }), { limit: 10, offset: 5 });
  assert.throws(() => pagination({ limite: '1000' }));
  assert.equal(textField(' Guatemala ', 'nombre', 120), 'Guatemala');
  assert.throws(() => textField(' ', 'nombre', 120));
});
test('permite solo campos aprobados y valores de catalogo', () => {
  assert.throws(() => allowedFields({ codigo: 'A', admin: true }, ['codigo']));
  assert.equal(enumField('GASOLINERA', 'tipo', ['CENTRO_COMERCIAL', 'GASOLINERA']), 'GASOLINERA');
  assert.throws(() => enumField('OTRO', 'tipo', ['CENTRO_COMERCIAL', 'GASOLINERA']));
});
