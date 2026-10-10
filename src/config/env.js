import 'dotenv/config';

function positiveInt(value, name, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} debe ser un entero positivo.`);
  }
  return parsed;
}

export function readConfig(env = process.env) {
  const password = env.DB_PASSWORD?.trim();
  const jwtSecret = env.JWT_SECRET ?? '';
  if (!env.DB_USER?.trim()) throw new Error('Falta DB_USER en .env.');
  if (!password || password === 'CAMBIAR_CONTRASENA_DEL_USUARIO_ORACLE') {
    throw new Error('Configura DB_PASSWORD en .env.');
  }
  if (jwtSecret.length < 32 || jwtSecret.startsWith('REEMPLAZAR_')) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres aleatorios.');
  }
  const poolMin = positiveInt(env.DB_POOL_MIN, 'DB_POOL_MIN', 1);
  const poolMax = positiveInt(env.DB_POOL_MAX, 'DB_POOL_MAX', 5);
  if (poolMax < poolMin) throw new Error('DB_POOL_MAX debe ser >= DB_POOL_MIN.');
  const port = positiveInt(env.PORT, 'PORT', 3000);
  const dbPort = positiveInt(env.DB_PORT, 'DB_PORT', 1521);
  if (port > 65535 || dbPort > 65535) throw new Error('Puerto fuera de rango.');
  return Object.freeze({
    port,
    oracle: {
      user: env.DB_USER.trim(),
      password,
      connectString: `${env.DB_HOST?.trim() || '127.0.0.1'}:${dbPort}/${env.DB_SERVICE?.trim() || 'XEPDB1'}`,
      poolMin,
      poolMax,
      poolIncrement: 1
    },
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
    corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(x => x.trim()).filter(Boolean),
    nodeEnv: env.NODE_ENV || 'development'
  });
}
