import { badRequest } from './errors.js';
import { positiveId } from './validation.js';
import { condicionesSql, filtrosFechas } from './administracion.js';

// Filtros de consulta. Los valores siempre se envian como bind variables a Oracle.
// Las expresiones SQL y nombres de columnas son constantes internas del backend.
const PARAMETROS = new Set([
  'desde', 'limite', 'id_sucursal', 'id_usuario', 'entidad',
  'accion', 'id_registro', 'fecha_desde', 'fecha_hasta'
]);

function etiqueta(valor, campo, longitud) {
  if (typeof valor !== 'string' || !new RegExp(`^[A-Z][A-Z0-9_]{0,${longitud - 1}}$`).test(valor)) {
    throw badRequest(`${campo} debe contener entre 1 y ${longitud} caracteres (A-Z, 0-9, guion bajo), comenzando con una letra.`);
  }
  return valor;
}

export function construirFiltrosAuditoria(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw badRequest('Filtros de auditoria invalidos.');
  }
  for (const key of Object.keys(query)) {
    if (!PARAMETROS.has(key)) throw badRequest(`Parametro no permitido: ${key}.`);
  }
  const condiciones = [];
  const binds = {};
  for (const [param, columna, bind] of [
    ['id_sucursal', 'a.id_sucursal', 'idSucursal'],
    ['id_usuario', 'a.id_usuario', 'idUsuario'],
    ['id_registro', 'a.id_registro', 'idRegistro']
  ]) {
    if (query[param] !== undefined) {
      binds[bind] = positiveId(query[param], param);
      condiciones.push(`${columna} = :${bind}`);
    }
  }
  for (const [param, columna] of [['entidad', 'a.entidad'], ['accion', 'a.accion']]) {
    if (query[param] !== undefined) {
      binds[param] = etiqueta(query[param], param, param === 'entidad' ? 60 : 40);
      condiciones.push(`${columna} = :${param}`);
    }
  }
  return condicionesSql({ condiciones, binds }, filtrosFechas(query, 'a.fecha_evento'));
}

// Los datos historicos pueden contener JSON almacenado por scripts academicos.
// Si un registro antiguo no contiene JSON valido, se conserva su texto original.
export function interpretarSnapshot(texto) {
  if (texto === null || texto === undefined) return null;
  if (typeof texto !== 'string') throw new TypeError('Oracle no devolvio el CLOB de auditoria como texto.');
  try { return JSON.parse(texto); }
  catch { return texto; }
}

export function formatearDetalleAuditoria(fila) {
  if (!fila) return null;
  const { DATOS_ANTERIORES, DATOS_NUEVOS, ...campos } = fila;
  return {
    ...Object.fromEntries(Object.entries(campos).map(([nombre, valor]) => [nombre.toLowerCase(), valor])),
    datos_anteriores: interpretarSnapshot(DATOS_ANTERIORES),
    datos_nuevos: interpretarSnapshot(DATOS_NUEVOS)
  };
}
