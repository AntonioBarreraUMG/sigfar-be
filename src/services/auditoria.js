import { oracledb } from '../db/oracle.js';

function jsonClob(value) {
  return value === null || value === undefined
    ? { val: null, type: oracledb.CLOB }
    : { val: JSON.stringify(value), type: oracledb.CLOB };
}

// Debe ejecutarse en la MISMA conexion y transaccion que el cambio.
export async function guardarAuditoria(
  conn,
  { usuarioId, sucursalId = null, entidad, registroId, accion, antes = null, despues = null },
) {
  await conn.execute(
    `
    INSERT INTO registro_auditoria
      (id_usuario, id_sucursal, entidad, id_registro, accion, datos_anteriores, datos_nuevos)
    VALUES (:usuarioId, :sucursalId, :entidad, :registroId, :accion, :antes, :despues)
  `,
    {
      usuarioId,
      sucursalId,
      entidad,
      registroId,
      accion,
      antes: jsonClob(antes),
      despues: jsonClob(despues),
    },
  );
}
