import oracledb from 'oracledb';

// Modo Thin predeterminado: no requiere instalar Oracle Instant Client.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let pool;
export async function initPool(settings) {
  if (pool) throw new Error('Ya se inicializo el pool.');
  pool = await oracledb.createPool(settings);
}
export function getPool() {
  if (!pool) throw new Error('Pool Oracle no inicializado.');
  return pool;
}
export async function withConnection(callback) {
  const connection = await getPool().getConnection();
  try {
    return await callback(connection);
  } finally {
    await connection.close();
  }
}
export async function withTransaction(callback) {
  return withConnection(async (connection) => {
    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('No fue posible hacer rollback:', rollbackError.message);
      }
      throw error;
    }
  });
}
export async function closePool() {
  if (pool) {
    const toClose = pool;
    pool = undefined;
    await toClose.close(5);
  }
}
export { oracledb };
