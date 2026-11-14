import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validarSolicitud,
  validarDisponibilidad,
  validarConfirmacion,
  autorizarSolicitud,
  exigirEstado,
  comprobarDisponible,
  validarCuerpoVacio,
  calcularTardia,
  crearConsultaDisponibilidad,
} from '../src/utils/entregas.js';
import { ROLES } from '../src/utils/authorization.js';

const coordinator = { ROL: ROLES.COORD, ID_SUCURSAL: null };
const admin = { ROL: ROLES.ADMIN, ID_SUCURSAL: null };
const guatemala = { ROL: ROLES.ENCARGADO, ID_SUCURSAL: 1 };
const xela = { ROL: ROLES.ENCARGADO, ID_SUCURSAL: 2 };
const solicitud = { ID_SUCURSAL_ASIGNADA: 1 };
const muestra = {
  cliente_nombre: 'Cliente de prueba',
  cliente_telefono: '5555-1000',
  departamento_entrega: 'Guatemala',
  municipio_entrega: 'Guatemala',
  direccion_entrega: 'Direccion ficticia',
  detalles: [
    { id_medicamento: 4, cantidad: 2 },
    { id_medicamento: 1, cantidad: 3 },
  ],
};

test('solicitud valida, normaliza y ordena los medicamentos sin mutar el cuerpo', () => {
  const valid = validarSolicitud(muestra);
  assert.deepEqual(
    valid.detalles.map((d) => d.id_medicamento),
    [1, 4],
  );
  assert.deepEqual(
    muestra.detalles.map((d) => d.id_medicamento),
    [4, 1],
  );
});

test('requiere datos de cliente, ubicacion y medicamentos sin otros campos', () => {
  assert.throws(() => validarSolicitud({ ...muestra, total: '40' }), { status: 400 });
  assert.throws(() => validarSolicitud({ ...muestra, cliente_nombre: ' ' }), { status: 400 });
  assert.throws(() => validarSolicitud({ ...muestra, direccion_entrega: '' }), { status: 400 });
  assert.throws(() => validarSolicitud({ ...muestra, cliente_telefono: 'a'.repeat(21) }), {
    status: 400,
  });
});

test('rechaza detalles vacios, repetidos o excesivos', () => {
  assert.throws(() => validarSolicitud({ ...muestra, detalles: [] }), { status: 400 });
  assert.throws(
    () => validarSolicitud({ ...muestra, detalles: [muestra.detalles[0], muestra.detalles[0]] }),
    { status: 400 },
  );
  assert.throws(
    () =>
      validarSolicitud({
        ...muestra,
        detalles: Array.from({ length: 21 }, (_, i) => ({ id_medicamento: i + 1, cantidad: 1 })),
      }),
    { status: 400 },
  );
});

test('rechaza cantidades invalidas, ids inyectados o campos no autorizados', () => {
  for (const cantidad of [0, -2, 2.5, '2', null]) {
    assert.throws(
      () => validarSolicitud({ ...muestra, detalles: [{ id_medicamento: 1, cantidad }] }),
      { status: 400 },
    );
  }
  assert.throws(
    () => validarSolicitud({ ...muestra, detalles: [{ id_medicamento: '1 OR 1=1', cantidad: 2 }] }),
    { status: 400 },
  );
  assert.throws(
    () =>
      validarSolicitud({ ...muestra, detalles: [{ id_medicamento: 1, cantidad: 2, precio: 5 }] }),
    { status: 400 },
  );
});

test('consulta de disponibilidad no necesita informacion personal', () => {
  const result = validarDisponibilidad({
    departamento_entrega: 'Escuintla',
    municipio_entrega: 'Escuintla',
    detalles: [{ id_medicamento: 1, cantidad: 1 }],
  });
  assert.equal(result.detalles[0].cantidad, 1);
  assert.throws(() => validarDisponibilidad({ ...result, cliente_nombre: 'No permitido' }), {
    status: 400,
  });
});

test('confirmacion exige sucursal y forma de pago sin ejecutar cobros', () => {
  assert.deepEqual(validarConfirmacion({ id_sucursal: 1, forma_pago: 'EFECTIVO' }), {
    id_sucursal: 1,
    forma_pago: 'EFECTIVO',
  });
  assert.throws(() => validarConfirmacion({ id_sucursal: 1, forma_pago: 'TRANSFERENCIA' }), {
    status: 400,
  });
  assert.throws(() => validarConfirmacion({ id_sucursal: 0, forma_pago: 'TARJETA' }), {
    status: 400,
  });
  assert.throws(() => validarConfirmacion({ id_sucursal: 1, forma_pago: 'TARJETA', monto: 20 }), {
    status: 400,
  });
});

test('coordinador registra, confirma, cancela y puede marcar entrega', () => {
  for (const accion of ['CREAR', 'CONFIRMAR', 'CANCELAR', 'ENTREGAR', 'LEER']) {
    assert.doesNotThrow(() => autorizarSolicitud(coordinator, solicitud, accion));
  }
  assert.throws(() => autorizarSolicitud(coordinator, solicitud, 'DESPACHAR'), { status: 403 });
});

test('encargado solo puede consultar, despachar y entregar solicitudes asignadas', () => {
  for (const accion of ['LEER', 'DESPACHAR', 'ENTREGAR']) {
    assert.doesNotThrow(() => autorizarSolicitud(guatemala, solicitud, accion));
    assert.throws(() => autorizarSolicitud(xela, solicitud, accion), { status: 403 });
  }
  for (const accion of ['CREAR', 'CONFIRMAR', 'CANCELAR']) {
    assert.throws(() => autorizarSolicitud(guatemala, solicitud, accion), { status: 403 });
  }
});

test('administrador supervisa las solicitudes sin modificar entregas', () => {
  assert.doesNotThrow(() => autorizarSolicitud(admin, solicitud, 'LEER'));
  for (const accion of ['CREAR', 'CONFIRMAR', 'CANCELAR', 'DESPACHAR', 'ENTREGAR']) {
    assert.throws(() => autorizarSolicitud(admin, solicitud, accion), { status: 403 });
  }
});

test('transiciones ilegales y despachos repetidos son conflictos', () => {
  assert.doesNotThrow(() => exigirEstado('PENDIENTE', 'PENDIENTE', 'confirmar'));
  assert.doesNotThrow(() => exigirEstado('CONFIRMADA', 'CONFIRMADA', 'despachar'));
  assert.doesNotThrow(() => exigirEstado('DESPACHADA', 'DESPACHADA', 'entregar'));
  assert.throws(() => exigirEstado('DESPACHADA', 'CONFIRMADA', 'despachar'), { status: 409 });
  assert.throws(() => exigirEstado('ENTREGADA', 'DESPACHADA', 'entregar'), { status: 409 });
});

test('reservas se respetan para comprobar existencias disponibles', () => {
  assert.doesNotThrow(() => comprobarDisponible(10, 4, 6));
  assert.throws(() => comprobarDisponible(10, 4, 7), { status: 409 });
  assert.throws(() => comprobarDisponible(undefined, undefined, 1), { status: 409 });
});

test('cambios de estado no aceptan informacion arbitraria', () => {
  assert.doesNotThrow(() => validarCuerpoVacio(undefined));
  assert.doesNotThrow(() => validarCuerpoVacio({}));
  assert.throws(() => validarCuerpoVacio({ estado: 'ENTREGADA' }), { status: 400 });
});

test('detecta tarde segun reloj o fecha real, no en pendientes ni canceladas', () => {
  const estimada = '2026-10-25T12:00:00Z';
  assert.equal(
    calcularTardia('CONFIRMADA', estimada, null, new Date('2026-10-25T12:01:00Z')),
    true,
  );
  assert.equal(
    calcularTardia('DESPACHADA', estimada, null, new Date('2026-10-25T11:59:00Z')),
    false,
  );
  assert.equal(calcularTardia('ENTREGADA', estimada, '2026-10-25T12:10:00Z'), true);
  assert.equal(calcularTardia('ENTREGADA', estimada, '2026-10-25T11:59:00Z'), false);
  assert.equal(
    calcularTardia('PENDIENTE', estimada, null, new Date('2026-10-26T12:00:00Z')),
    false,
  );
});

test('consulta SQL de elegibilidad utiliza binds y sin interpolar datos de usuario', () => {
  const input = validarDisponibilidad({
    departamento_entrega: "Guatemala' OR '1'='1",
    municipio_entrega: 'Guatemala',
    detalles: [
      { id_medicamento: 2, cantidad: 4 },
      { id_medicamento: 1, cantidad: 2 },
    ],
  });
  const { sql, binds } = crearConsultaDisponibilidad(input);
  assert.equal(binds.departamento, input.departamento_entrega);
  assert.equal(binds.med0, 1);
  assert.equal(binds.cant1, 4);
  assert.ok(!sql.includes(input.departamento_entrega));
  assert.match(sql, /cantidad_existente - i\.cantidad_reservada < r\.cantidad/);
  assert.match(sql, /s\.activa = 'S'/);
  assert.match(sql, /m\.activo <> 'S'/);
});
