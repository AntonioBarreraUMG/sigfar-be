import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validarNuevaTransferencia,
  autorizarTransferencia,
  validarEstadoTransferencia,
  validarDisponibilidad,
} from '../src/utils/transferencias.js';
import { ROLES } from '../src/utils/authorization.js';

const encargadoOrigen = { ROL: ROLES.ENCARGADO, ID_SUCURSAL: 1 };
const encargadoDestino = { ROL: ROLES.ENCARGADO, ID_SUCURSAL: 2 };
const transferencia = { ID_SUCURSAL_ORIGEN: 1, ID_SUCURSAL_DESTINO: 2 };
const correcta = {
  id_sucursal_origen: 1,
  id_sucursal_destino: 2,
  detalles: [
    { id_medicamento: 3, cantidad: 2 },
    { id_medicamento: 1, cantidad: 5 },
  ],
};

test('valida y ordena los detalles antes de bloquear inventarios', () => {
  const result = validarNuevaTransferencia(correcta);
  assert.deepEqual(
    result.detalles.map((d) => d.id_medicamento),
    [1, 3],
  );
  assert.deepEqual(
    correcta.detalles.map((d) => d.id_medicamento),
    [3, 1],
  ); // no muta cuerpo HTTP
});
test('rechaza la misma sucursal en origen y destino', () => {
  assert.throws(() => validarNuevaTransferencia({ ...correcta, id_sucursal_destino: 1 }), {
    status: 400,
  });
});
test('rechaza medicamentos repetidos y transferencia vacia', () => {
  assert.throws(
    () =>
      validarNuevaTransferencia({
        ...correcta,
        detalles: [correcta.detalles[0], correcta.detalles[0]],
      }),
    { status: 400 },
  );
  assert.throws(() => validarNuevaTransferencia({ ...correcta, detalles: [] }), { status: 400 });
});
test('rechaza cantidades cero, negativas, fraccionarias o campos extra', () => {
  for (const cantidad of [0, -1, 1.25, '5']) {
    assert.throws(
      () => validarNuevaTransferencia({ ...correcta, detalles: [{ id_medicamento: 1, cantidad }] }),
      { status: 400 },
    );
  }
  assert.throws(() => validarNuevaTransferencia({ ...correcta, observacion: 'extra' }), {
    status: 400,
  });
  assert.throws(
    () =>
      validarNuevaTransferencia({
        ...correcta,
        detalles: [{ id_medicamento: 1, cantidad: 1, otro: true }],
      }),
    { status: 400 },
  );
});
test('rechaza IDs invalidos e inyeccion', () => {
  assert.throws(() => validarNuevaTransferencia({ ...correcta, id_sucursal_destino: '1 OR 1=1' }), {
    status: 400,
  });
  assert.throws(
    () =>
      validarNuevaTransferencia({ ...correcta, detalles: [{ id_medicamento: 0, cantidad: 1 }] }),
    { status: 400 },
  );
});
test('solo el encargado de origen puede registrar y despachar', () => {
  assert.doesNotThrow(() => autorizarTransferencia(encargadoOrigen, transferencia, 'REGISTRAR'));
  assert.doesNotThrow(() => autorizarTransferencia(encargadoOrigen, transferencia, 'DESPACHAR'));
  assert.throws(() => autorizarTransferencia(encargadoDestino, transferencia, 'DESPACHAR'), {
    status: 403,
  });
});
test('solo el encargado de destino puede recibir', () => {
  assert.doesNotThrow(() => autorizarTransferencia(encargadoDestino, transferencia, 'RECIBIR'));
  assert.throws(() => autorizarTransferencia(encargadoOrigen, transferencia, 'RECIBIR'), {
    status: 403,
  });
});
test('administrador y coordinador no modifican transferencias', () => {
  for (const rol of [ROLES.ADMIN, ROLES.COORD]) {
    assert.throws(
      () => autorizarTransferencia({ ROL: rol, ID_SUCURSAL: null }, transferencia, 'DESPACHAR'),
      { status: 403 },
    );
  }
});
test('evita despachar dos veces y recibir dos veces por transicion', () => {
  assert.doesNotThrow(() => validarEstadoTransferencia('REGISTRADA', 'REGISTRADA', 'despachar'));
  assert.doesNotThrow(() => validarEstadoTransferencia('EN_TRANSITO', 'EN_TRANSITO', 'recibir'));
  assert.throws(() => validarEstadoTransferencia('EN_TRANSITO', 'REGISTRADA', 'despachar'), {
    status: 409,
  });
  assert.throws(() => validarEstadoTransferencia('RECIBIDA', 'EN_TRANSITO', 'recibir'), {
    status: 409,
  });
});
test('comprueba saldo descontando reservas y rechaza inventario inexistente', () => {
  assert.doesNotThrow(() => validarDisponibilidad(20, 5, 15));
  assert.throws(() => validarDisponibilidad(20, 5, 16), { status: 409 });
  assert.throws(() => validarDisponibilidad(undefined, undefined, 1), { status: 409 });
});
