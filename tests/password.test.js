import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPassword } from '../src/utils/password.js';

// Misma muestra ficticia cargada en Oracle con 02_datos_prueba.sql.
const hashDemoAdmin =
  'scrypt$16384$8$1$956fc5f3f7b3dbdc820abe8711285bee$a7fd4526b11c5da43470445d0644d735c45a418cf123ebcfbb3f6a3a3703bca78103b5cab71e3c2ecb401656c6a9716184e2405dbfb74e52f842205f0b813a06';

test('valida hash scrypt del usuario demo de Oracle', async () => {
  assert.equal(await verifyPassword('Demo2026!', hashDemoAdmin), true);
  assert.equal(await verifyPassword('demo2026!', hashDemoAdmin), false);
  assert.equal(await verifyPassword('ContraseñaIncorrecta', hashDemoAdmin), false);
});
test('rechaza hashes incompletos o parametros de scrypt inseguros', async () => {
  assert.equal(await verifyPassword('a', null), false);
  assert.equal(await verifyPassword('a', 'bcrypt$no'), false);
  assert.equal(await verifyPassword('a', hashDemoAdmin.replace('16384', '99999999')), false);
});
