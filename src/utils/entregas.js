import { ROLES } from './authorization.js';
import { badRequest, conflict, forbidden } from './errors.js';
import {
  allowedFields,
  enumField,
  nonNegativeCount,
  objectBody,
  positiveId,
  textField,
} from './validation.js';

export const ESTADOS_SOLICITUD = Object.freeze([
  'PENDIENTE',
  'CONFIRMADA',
  'DESPACHADA',
  'ENTREGADA',
  'CANCELADA',
]);
export const FORMAS_PAGO = Object.freeze(['EFECTIVO', 'TARJETA']);

export function validarDetalles(detalles) {
  if (!Array.isArray(detalles) || !detalles.length || detalles.length > 20) {
    throw badRequest('detalles debe contener entre 1 y 20 medicamentos.');
  }
  const vistos = new Set();
  const salida = detalles.map((detalle, i) => {
    allowedFields(detalle, ['id_medicamento', 'cantidad']);
    const id_medicamento = positiveId(detalle.id_medicamento, `detalles[${i}].id_medicamento`);
    const cantidad = nonNegativeCount(detalle.cantidad, `detalles[${i}].cantidad`);
    if (!cantidad) throw badRequest('La cantidad solicitada debe ser mayor que cero.');
    if (vistos.has(id_medicamento))
      throw badRequest('No se permite repetir un medicamento en la misma solicitud.');
    vistos.add(id_medicamento);
    return { id_medicamento, cantidad };
  });
  return salida.sort((a, b) => a.id_medicamento - b.id_medicamento);
}

export function validarDisponibilidad(body) {
  allowedFields(body, ['departamento_entrega', 'municipio_entrega', 'detalles']);
  return {
    departamento_entrega: textField(body.departamento_entrega, 'departamento_entrega', 80),
    municipio_entrega: textField(body.municipio_entrega, 'municipio_entrega', 80),
    detalles: validarDetalles(body.detalles),
  };
}

export function validarSolicitud(body) {
  allowedFields(body, [
    'cliente_nombre',
    'cliente_telefono',
    'departamento_entrega',
    'municipio_entrega',
    'direccion_entrega',
    'detalles',
  ]);
  return {
    cliente_nombre: textField(body.cliente_nombre, 'cliente_nombre', 120),
    cliente_telefono: textField(body.cliente_telefono, 'cliente_telefono', 20),
    direccion_entrega: textField(body.direccion_entrega, 'direccion_entrega', 250),
    ...validarDisponibilidad({
      departamento_entrega: body.departamento_entrega,
      municipio_entrega: body.municipio_entrega,
      detalles: body.detalles,
    }),
  };
}

export function validarConfirmacion(body) {
  allowedFields(body, ['id_sucursal', 'forma_pago']);
  return {
    id_sucursal: positiveId(body.id_sucursal, 'id_sucursal'),
    forma_pago: enumField(body.forma_pago, 'forma_pago', FORMAS_PAGO),
  };
}

export function validarCuerpoVacio(body) {
  if (body === undefined) return;
  if (Object.keys(objectBody(body)).length)
    throw badRequest('Esta operacion no admite datos en el cuerpo JSON.');
}

export function autorizarSolicitud(usuario, solicitud, accion) {
  if (accion === 'CREAR' || accion === 'CONFIRMAR' || accion === 'CANCELAR') {
    if (usuario.ROL !== ROLES.COORD) throw forbidden();
    return;
  }
  if (accion === 'DESPACHAR') {
    if (usuario.ROL !== ROLES.ENCARGADO || usuario.ID_SUCURSAL !== solicitud?.ID_SUCURSAL_ASIGNADA)
      throw forbidden();
    return;
  }
  if (accion === 'ENTREGAR') {
    if (
      usuario.ROL === ROLES.COORD ||
      (usuario.ROL === ROLES.ENCARGADO && usuario.ID_SUCURSAL === solicitud?.ID_SUCURSAL_ASIGNADA)
    )
      return;
    throw forbidden();
  }
  if (accion === 'LEER') {
    if (
      [ROLES.COORD, ROLES.ADMIN].includes(usuario.ROL) ||
      (usuario.ROL === ROLES.ENCARGADO && usuario.ID_SUCURSAL === solicitud?.ID_SUCURSAL_ASIGNADA)
    )
      return;
    throw forbidden();
  }
  throw forbidden();
}

export function exigirEstado(actual, esperado, accion) {
  if (actual !== esperado)
    throw conflict(
      `Solo se puede ${accion} una solicitud en estado ${esperado}. Estado actual: ${actual}.`,
    );
}

export function comprobarDisponible(existente, reservado, requerido) {
  if (
    !Number.isSafeInteger(existente) ||
    !Number.isSafeInteger(reservado) ||
    existente - reservado < requerido
  ) {
    throw conflict('Inventario disponible insuficiente para confirmar esta solicitud.');
  }
}

export function calcularTardia(estado, estimada, real, ahora = new Date()) {
  if (!estimada || !['CONFIRMADA', 'DESPACHADA', 'ENTREGADA'].includes(estado)) return false;
  const fechaComparacion = estado === 'ENTREGADA' ? real : ahora;
  return Boolean(
    fechaComparacion && new Date(fechaComparacion).getTime() > new Date(estimada).getTime(),
  );
}

// Solo identificadores de parametros generados localmente; valores de usuario en binds.
export function crearConsultaDisponibilidad(data) {
  const binds = { departamento: data.departamento_entrega, municipio: data.municipio_entrega };
  if (!data.detalles.length || data.detalles.length > 20)
    throw badRequest('Cantidad de medicamentos no permitida.');
  const partes = data.detalles.map((d, i) => {
    binds[`med${i}`] = d.id_medicamento;
    binds[`cant${i}`] = d.cantidad;
    return `SELECT :med${i} AS id_medicamento, :cant${i} AS cantidad FROM dual`;
  });
  const sql = `
    WITH requeridos AS (${partes.join(' UNION ALL ')})
    SELECT s.id_sucursal, s.codigo, s.nombre, s.departamento, s.municipio,
           s.tiempo_entrega_min
    FROM sucursal s
    WHERE s.activa = 'S'
      AND UPPER(TRIM(s.departamento)) = UPPER(TRIM(:departamento))
      AND UPPER(TRIM(s.municipio)) = UPPER(TRIM(:municipio))
      AND NOT EXISTS (
        SELECT 1 FROM requeridos r
        LEFT JOIN medicamento m ON m.id_medicamento = r.id_medicamento
        LEFT JOIN inventario_sucursal i
          ON i.id_sucursal = s.id_sucursal AND i.id_medicamento = r.id_medicamento
        WHERE m.id_medicamento IS NULL OR m.activo <> 'S'
           OR i.id_sucursal IS NULL
           OR i.cantidad_existente - i.cantidad_reservada < r.cantidad
      )
    ORDER BY s.tiempo_entrega_min, s.id_sucursal`;
  return { sql, binds };
}
