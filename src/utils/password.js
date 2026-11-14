import { scrypt as scryptCallback, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);

// Formato EXACTO usado en 02_datos_prueba.sql: scrypt$N$r$p$saltHex$hashHex.
export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || !storedHash || typeof storedHash !== 'string') return false;
  const chunks = storedHash.split('$');
  if (chunks.length !== 6 || chunks[0] !== 'scrypt') return false;
  const [, n, r, p, saltHex, hashHex] = chunks;
  const N = Number(n);
  const rParam = Number(r);
  const pParam = Number(p);
  // Restricciones para impedir parámetros scrypt controlados por entradas arbitrarias.
  if (
    N !== 16384 ||
    rParam !== 8 ||
    pParam !== 1 ||
    !/^[a-f0-9]{32}$/i.test(saltHex) ||
    !/^[a-f0-9]{128}$/i.test(hashHex)
  )
    return false;
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N,
    r: rParam,
    p: pParam,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(derived, expected);
}

// Nuevos usuarios y restablecimientos usan el MISMO formato que las cuentas iniciales.
// No registrar la contraseña ni el hash en logs, respuestas o auditoría.
export function validateNewPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 || !value.trim()) {
    throw new Error('La contraseña debe contener entre 12 y 128 caracteres.');
  }
  return value;
}

export async function hashPassword(password) {
  validateNewPassword(password);
  const salt = randomBytes(16);
  const hashed = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hashed.toString('hex')}`;
}
