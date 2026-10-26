import test from 'node:test';
import assert from 'node:assert/strict';
import { construirFiltrosAuditoria, interpretarSnapshot, formatearDetalleAuditoria } from '../src/utils/auditoria.js';
import { pagination } from '../src/utils/validation.js';

const filtros = {
  id_sucursal: '2', id_usuario: '3', entidad: 'TRANSFERENCIA', accion: 'RECIBIR',
  id_registro: '17', fecha_desde: '2026-10-01', fecha_hasta: '2026-10-31'
};

test('auditoria permite consultas sin filtros de toda la empresa', () => {
  assert.deepEqual(construirFiltrosAuditoria({}), { where: '', binds: {} });
});
test('auditoria enlaza todos los filtros con binds sin interpolar datos externos', () => {
  const result = construirFiltrosAuditoria(filtros);
  assert.match(result.where, /a.id_sucursal = :idSucursal/);
  assert.match(result.where, /a.id_usuario = :idUsuario/);
  assert.match(result.where, /a.id_registro = :idRegistro/);
  assert.match(result.where, /a.entidad = :entidad/);
  assert.match(result.where, /a.accion = :accion/);
  assert.match(result.where, /TO_TIMESTAMP_TZ/);
  assert.deepEqual(result.binds, {
    idSucursal: 2, idUsuario: 3, idRegistro: 17, entidad: 'TRANSFERENCIA', accion: 'RECIBIR',
    fechaDesde: '2026-10-01', fechaHasta: '2026-10-31'
  });
  assert.doesNotMatch(result.where, /TRANSFERENCIA/);
});
test('auditoria reconoce parametros de paginacion sin incluirlos como filtros SQL', () => {
  const f = construirFiltrosAuditoria({ desde: '10', limite: '20', accion: 'REGISTRAR' });
  assert.equal(f.binds.accion, 'REGISTRAR');
  assert.equal(f.binds.limite, undefined);
  assert.deepEqual(pagination({ desde: '10', limite: '20' }), { limit: 20, offset: 10 });
});
test('auditoria rechaza parametros desconocidos y estructuras invalidas', () => {
  for (const item of [{ sort: 'id' }, { tabla: 'usuario' }, [], null, 'filtro']) {
    assert.throws(() => construirFiltrosAuditoria(item), { status: 400 });
  }
});
test('auditoria rechaza valores numericos invalidos', () => {
  for (const value of ['0', '-1', '1 OR 1=1', '', {}, ['1'], '1.0']) {
    assert.throws(() => construirFiltrosAuditoria({ id_sucursal: value }), { status: 400 });
    assert.throws(() => construirFiltrosAuditoria({ id_registro: value }), { status: 400 });
  }
});
test('auditoria valida entidades y acciones como codigos normalizados', () => {
  for (const value of ['foo', "TRANSF' OR '1'='1", 'SELECT * FROM USUARIO', '_INVALIDO', '', 'A'.repeat(61)]) {
    assert.throws(() => construirFiltrosAuditoria({ entidad: value }), { status: 400 });
  }
  for (const value of ['modificar', '', 'B'.repeat(41), 'DESPACHAR; DROP TABLE']) {
    assert.throws(() => construirFiltrosAuditoria({ accion: value }), { status: 400 });
  }
  assert.equal(construirFiltrosAuditoria({ accion: 'AJUSTE_ENTRADA' }).binds.accion, 'AJUSTE_ENTRADA');
});
test('auditoria valida fecha y rango sin ignorar errores de calendario', () => {
  assert.throws(() => construirFiltrosAuditoria({ fecha_desde: '2026-02-30' }), { status: 400 });
  assert.throws(() => construirFiltrosAuditoria({ fecha_desde: '2026-11-02', fecha_hasta: '2026-11-01' }), { status: 400 });
  assert.match(construirFiltrosAuditoria({ fecha_hasta: '2026-10-25' }).where, /INTERVAL '1' DAY/);
});
test('auditoria interpreta snapshots JSON y conserva texto historico no JSON', () => {
  assert.deepEqual(interpretarSnapshot('{"estado":"RECIBIDA","cant":3}'), { estado: 'RECIBIDA', cant: 3 });
  assert.equal(interpretarSnapshot('Registro legacy'), 'Registro legacy');
  assert.equal(interpretarSnapshot(null), null);
  assert.equal(interpretarSnapshot(undefined), null);
  assert.throws(() => interpretarSnapshot({ estado: 'RECIBIDA' }), TypeError);
});
test('auditoria entrega formato estable de detalle con objetos antes y despues', () => {
  assert.deepEqual(formatearDetalleAuditoria({
    ID_AUDITORIA: 99, ENTIDAD: 'TRANSFERENCIA', ACCION: 'RECIBIR',
    DATOS_ANTERIORES: '{"estado":"EN_TRANSITO"}',
    DATOS_NUEVOS: '{"estado":"RECIBIDA"}'
  }), {
    id_auditoria: 99, entidad: 'TRANSFERENCIA', accion: 'RECIBIR',
    datos_anteriores: { estado: 'EN_TRANSITO' }, datos_nuevos: { estado: 'RECIBIDA' }
  });
  assert.equal(formatearDetalleAuditoria(null), null);
});
