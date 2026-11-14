import test from 'node:test';
import assert from 'node:assert/strict';
import {
  montoEnCentavos,
  periodoValido,
  fechaValida,
  validarRango,
  validarMovimientoEfectivo,
  validarGastoPlanilla,
  validarCorreccionPlanilla,
  validarActivoNuevo,
  validarActualizacionActivo,
  validarLecturaSucursal,
  validarEscrituraSucursal,
  condicionSucursal,
  filtrosFechas,
  filtrosPeriodos,
  condicionesSql,
} from '../src/utils/administracion.js';
import { ROLES } from '../src/utils/authorization.js';

const admin = { ROL: ROLES.ADMIN, ID_SUCURSAL: null };
const encargado = { ROL: ROLES.ENCARGADO, ID_SUCURSAL: 2 };
const coordinador = { ROL: ROLES.COORD, ID_SUCURSAL: null };
const efectivo = {
  id_sucursal: 2,
  tipo: 'INGRESO',
  concepto: 'Movimiento academico',
  monto: '105.50',
};
const planilla = { id_sucursal: 2, periodo: '2026-10', monto_total: '15000.00' };
const activo = {
  id_sucursal: 2,
  codigo: 'EQ-ACA-9',
  descripcion: 'Computadora de prueba',
  valor: '5000.00',
};

test('los importes decimales se convierten a centavos exactos', () => {
  assert.equal(montoEnCentavos('12.34', 'monto'), 1234);
  assert.equal(montoEnCentavos('0.01', 'monto'), 1);
  assert.equal(montoEnCentavos('999999999999.99', 'monto'), 99999999999999);
  assert.equal(montoEnCentavos('0', 'valor', { permitirCero: true }), 0);
  assert.equal(montoEnCentavos('8.5', 'valor'), 850);
});
test('rechaza montos con flotantes, signo, separadores, precision excesiva y ceros en efectivo', () => {
  for (const invalid of [
    12.5,
    -1,
    '-3',
    '0',
    '1.234',
    '1,20',
    '1e3',
    '1000000000000.00',
    'NaN',
    '',
    null,
  ]) {
    assert.throws(() => montoEnCentavos(invalid, 'monto'), { status: 400 });
  }
});
test('efectivo exige campos y tipos permitidos', () => {
  assert.deepEqual(validarMovimientoEfectivo(efectivo), {
    id_sucursal: 2,
    tipo: 'INGRESO',
    concepto: 'Movimiento academico',
    montoCentavos: 10550,
  });
  assert.throws(() => validarMovimientoEfectivo({ ...efectivo, tipo: 'AJUSTE' }), { status: 400 });
  assert.throws(() => validarMovimientoEfectivo({ ...efectivo, id_usuario: 1 }), { status: 400 });
  assert.throws(() => validarMovimientoEfectivo({ ...efectivo, monto: '0.00' }), { status: 400 });
});
test('valida gasto de planilla por mes sin nomina detallada', () => {
  assert.equal(validarGastoPlanilla(planilla).montoCentavos, 1500000);
  assert.equal(validarCorreccionPlanilla({ monto_total: '0.00' }).montoCentavos, 0);
  assert.throws(() => validarCorreccionPlanilla({ monto_total: '0', periodo: '2026-10' }), {
    status: 400,
  });
  for (const p of ['2026-00', '2026-13', '2026-1', '2026-10-25', '2026-AB', null]) {
    assert.throws(() => periodoValido(p), { status: 400 });
  }
});
test('valida registro y cambios de activos sin expandir el alcance', () => {
  assert.deepEqual(validarActivoNuevo(activo), {
    id_sucursal: 2,
    codigo: 'EQ-ACA-9',
    descripcion: 'Computadora de prueba',
    valorCentavos: 500000,
  });
  assert.deepEqual(validarActualizacionActivo({ estado: 'BAJA', valor: '0.00' }), {
    estado: 'BAJA',
    valorCentavos: 0,
  });
  assert.throws(() => validarActualizacionActivo({ codigo: 'ALTERAR' }), { status: 400 });
  assert.throws(() => validarActualizacionActivo({ id_sucursal: 3 }), { status: 400 });
  assert.throws(() => validarActualizacionActivo({ estado: 'DESCARTADO' }), { status: 400 });
});
test('verifica fechas calendario reales incluyendo anos bisiestos', () => {
  assert.equal(fechaValida('2024-02-29', 'fecha'), '2024-02-29');
  for (const d of [
    '2025-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-11',
    '2026-10-1',
    '2026-10-25T00:00:00',
  ]) {
    assert.throws(() => fechaValida(d, 'fecha'), { status: 400 });
  }
  assert.throws(() => validarRango('2026-10', '2026-09'), { status: 400 });
});
test('administrador consulta cualquier sucursal o empresa, encargado solo propia', () => {
  assert.equal(validarLecturaSucursal(admin, undefined), undefined);
  assert.equal(validarLecturaSucursal(admin, '3'), 3);
  assert.equal(validarLecturaSucursal(encargado, undefined), 2);
  assert.equal(validarLecturaSucursal(encargado, '2'), 2);
  assert.throws(() => validarLecturaSucursal(encargado, '3'), { status: 403 });
  assert.throws(() => validarLecturaSucursal(coordinador, undefined), { status: 403 });
});
test('solo encargado de sucursal propia puede registrar o corregir', () => {
  assert.equal(validarEscrituraSucursal(encargado, '2'), 2);
  for (const user of [admin, coordinador]) {
    assert.throws(() => validarEscrituraSucursal(user, 2), { status: 403 });
  }
  assert.throws(() => validarEscrituraSucursal(encargado, 3), { status: 403 });
});
test('filtros SQL usan unicamente expresiones fijas y binds seguros', () => {
  const a = condicionSucursal(encargado, undefined, 'e');
  const f = filtrosFechas(
    { fecha_desde: '2026-10-01', fecha_hasta: '2026-10-25' },
    'e.fecha_movimiento',
  );
  const z = condicionesSql(a, f);
  assert.match(z.where, /e.id_sucursal = :idSucursal/);
  assert.match(z.where, /TO_TIMESTAMP_TZ/);
  assert.deepEqual(z.binds, { idSucursal: 2, fechaDesde: '2026-10-01', fechaHasta: '2026-10-25' });
  assert.throws(
    () =>
      filtrosFechas({ fecha_desde: '2026-11-01', fecha_hasta: '2026-10-25' }, 'e.fecha_movimiento'),
    { status: 400 },
  );
  const p = filtrosPeriodos({ periodo_desde: '2026-08', periodo_hasta: '2026-10' }, 'p.periodo');
  assert.deepEqual(p.binds, { periodoDesde: '2026-08', periodoHasta: '2026-10' });
});
test('ninguna sucursal es filtrada para ADMIN_CENTRAL sin filtro', () => {
  const z = condicionesSql(condicionSucursal(admin, undefined, 'e'));
  assert.equal(z.where, '');
  assert.deepEqual(z.binds, {});
});
