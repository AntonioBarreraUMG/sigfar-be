import { readConfig } from './config/env.js';
import { initPool, closePool, withConnection } from './db/oracle.js';
import { makeApp } from './app.js';

let server;
try {
  const config = readConfig();
  await initPool(config.oracle);
  const dbInfo = await withConnection(async conn => (await conn.execute(`
    SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS esquema,
           SYS_CONTEXT('USERENV','CON_NAME') AS contenedor FROM dual
  `)).rows[0]);
  console.log(`Oracle conectado: ${config.oracle.connectString} | esquema=${dbInfo.ESQUEMA} | contenedor=${dbInfo.CONTENEDOR}`);
  server = makeApp(config).listen(config.port, '127.0.0.1', () => {
    console.log(`SIGFAR API lista en http://127.0.0.1:${config.port}/api/v1/health`);
  });
} catch (error) {
  console.error('No se pudo iniciar SIGFAR:', error.message);
  await closePool().catch(() => {});
  process.exitCode = 1;
}

async function stop() {
  if (server) {
    server.close(async error => {
      if (error) console.error('Error al detener HTTP:', error.message);
      await closePool().catch(err => console.error(err.message));
      process.exit(error ? 1 : 0);
    });
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
