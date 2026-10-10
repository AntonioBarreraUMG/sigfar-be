import { readConfig } from '../src/config/env.js';
import { initPool, withConnection, closePool } from '../src/db/oracle.js';
try {
  const cfg = readConfig();
  await initPool(cfg.oracle);
  await withConnection(async conn => {
    const info = (await conn.execute(`SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS esquema,
      SYS_CONTEXT('USERENV','CON_NAME') AS pdb FROM dual`)).rows[0];
    const tabs = (await conn.execute(`SELECT COUNT(*) AS total FROM user_tables
      WHERE table_name IN ('ROL','USUARIO','SUCURSAL','MEDICAMENTO','INVENTARIO_SUCURSAL',
      'MOVIMIENTO_INVENTARIO','TRANSFERENCIA','DETALLE_TRANSFERENCIA','MOVIMIENTO_EFECTIVO',
      'GASTO_PLANILLA','ACTIVO_FIJO','SOLICITUD_ENTREGA','DETALLE_SOLICITUD',
      'RESERVA_INVENTARIO','REGISTRO_AUDITORIA')`)).rows[0].TOTAL;
    const roles = (await conn.execute(`SELECT COUNT(*) AS total FROM rol`)).rows[0].TOTAL;
    console.log(`Conexion Oracle OK | ${cfg.oracle.connectString}`);
    console.log(`Esquema: ${info.ESQUEMA} | PDB: ${info.PDB}`);
    console.log(`Tablas SIGFAR: ${tabs}/15 | Roles: ${roles}`);
    if (info.PDB.toUpperCase() !== (process.env.DB_SERVICE || 'XEPDB1').toUpperCase()) {
      console.warn('AVISO: nombre de contenedor diferente al servicio indicado. Comprueba tu conexion.');
    }
    if (tabs !== 15 || roles !== 3) throw new Error('Conectado, pero el esquema no coincide con los scripts de SIGFAR.');
  });
  await closePool();
} catch (error) {
  console.error('FALLO comprobacion Oracle:', error.message);
  await closePool().catch(() => {});
  process.exitCode = 1;
}
