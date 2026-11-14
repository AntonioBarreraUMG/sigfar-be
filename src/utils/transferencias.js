import { badRequest, forbidden, conflict } from './errors.js';
import { allowedFields, positiveId, nonNegativeCount } from './validation.js';
import { ROLES } from './authorization.js';

const HEADER_FIELDS = ['id_sucursal_origen', 'id_sucursal_destino', 'detalles'];
const ITEM_FIELDS = ['id_medicamento', 'cantidad'];
export const ESTADOS_TRANSFERENCIA = Object.freeze(['REGISTRADA', 'EN_TRANSITO', 'RECIBIDA']);

// Prototipo: un comprobante contiene entre 1 y 50 renglones distintos.
export function validarNuevaTransferencia(body) {
  allowedFields(body, HEADER_FIELDS);
  const origen = positiveId(body.id_sucursal_origen, 'id_sucursal_origen');
  const destino = positiveId(body.id_sucursal_destino, 'id_sucursal_destino');
  if (origen === destino) throw badRequest('La sucursal de origen y destino deben ser diferentes.');
  if (!Array.isArray(body.detalles) || body.detalles.length < 1 || body.detalles.length > 50) {
    throw badRequest('detalles debe ser un arreglo de 1 a 50 medicamentos.');
  }
  const usados = new Set();
  const detalles = body.detalles.map((item, index) => {
    allowedFields(item, ITEM_FIELDS);
    const id_medicamento = positiveId(item.id_medicamento, `detalles[${index}].id_medicamento`);
    const cantidad = nonNegativeCount(item.cantidad, `detalles[${index}].cantidad`);
    if (cantidad === 0) throw badRequest(`detalles[${index}].cantidad debe ser mayor que cero.`);
    if (usados.has(id_medicamento))
      throw badRequest('Un medicamento no puede repetirse en la misma transferencia.');
    usados.add(id_medicamento);
    return { id_medicamento, cantidad };
  });
  // Orden estable para bloqueos de inventario y menor riesgo de deadlocks.
  detalles.sort((a, b) => a.id_medicamento - b.id_medicamento);
  return { id_sucursal_origen: origen, id_sucursal_destino: destino, detalles };
}

// Las escrituras solo las efectua el encargado de la sucursal pertinente.
export function autorizarTransferencia(usuario, t, accion) {
  if (usuario.ROL !== ROLES.ENCARGADO) throw forbidden();
  const id = accion === 'RECIBIR' ? t.ID_SUCURSAL_DESTINO : t.ID_SUCURSAL_ORIGEN;
  if (usuario.ID_SUCURSAL !== id) throw forbidden();
}

export function validarEstadoTransferencia(actual, requerido, accion) {
  if (actual !== requerido)
    throw conflict(`No es posible ${accion}: estado actual ${actual}; se requiere ${requerido}.`);
}

export function validarDisponibilidad(existente, reservada, solicitada) {
  if (existente === undefined || existente === null)
    throw conflict('No existe inventario inicial para uno de los medicamentos de origen.');
  if (existente - reservada < solicitada)
    throw conflict('Existencias disponibles insuficientes; se respetan las reservas de entregas.');
}
