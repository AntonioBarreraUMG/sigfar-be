import { allowedFields, enumField, positiveId, textField } from './validation.js';
import { badRequest, forbidden } from './errors.js';
import { ROLES } from './authorization.js';

// En la API los montos son CADENAS decimales, para evitar redondeos IEEE-754.
// Oracle recibe centavos enteros y calcula el importe exacto mediante :centavos / 100.
export function montoEnCentavos(value, field, { permitirCero = false } = {}) {
  if (typeof value !== 'string' || !/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) {
    throw badRequest(`${field} debe ser texto decimal sin comas, con maximo 12 enteros y 2 decimales; ejemplo: "125.50".`);
  }
  const [entero, decimal = ''] = value.split('.');
  const centavos = Number(entero) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || (!permitirCero && centavos === 0)) {
    throw badRequest(`${field} debe ser ${permitirCero ? 'no negativo' : 'mayor que cero'}.`);
  }
  return centavos;
}

export function periodoValido(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw badRequest('periodo debe tener el formato AAAA-MM.');
  }
  return value;
}

export function fechaValida(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${field} debe tener el formato AAAA-MM-DD.`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const diasMes = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > diasMes[m - 1]) {
    throw badRequest(`${field} no es una fecha valida.`);
  }
  return value;
}

export function validarRango(inicio, fin, nombre = 'rango') {
  if (inicio !== undefined && fin !== undefined && inicio > fin) {
    throw badRequest(`El inicio de ${nombre} no puede ser posterior al final.`);
  }
}

export function validarMovimientoEfectivo(body) {
  allowedFields(body, ['id_sucursal', 'tipo', 'concepto', 'monto'], { partial: false });
  return {
    id_sucursal: positiveId(body.id_sucursal, 'id_sucursal'),
    tipo: enumField(body.tipo, 'tipo', ['INGRESO', 'EGRESO']),
    concepto: textField(body.concepto, 'concepto', 250),
    montoCentavos: montoEnCentavos(body.monto, 'monto')
  };
}

export function validarGastoPlanilla(body) {
  allowedFields(body, ['id_sucursal', 'periodo', 'monto_total'], { partial: false });
  return {
    id_sucursal: positiveId(body.id_sucursal, 'id_sucursal'),
    periodo: periodoValido(body.periodo),
    montoCentavos: montoEnCentavos(body.monto_total, 'monto_total', { permitirCero: true })
  };
}

export function validarCorreccionPlanilla(body) {
  allowedFields(body, ['monto_total'], { partial: false });
  return { montoCentavos: montoEnCentavos(body.monto_total, 'monto_total', { permitirCero: true }) };
}

export function validarActivoNuevo(body) {
  allowedFields(body, ['id_sucursal', 'codigo', 'descripcion', 'valor'], { partial: false });
  return {
    id_sucursal: positiveId(body.id_sucursal, 'id_sucursal'),
    codigo: textField(body.codigo, 'codigo', 30).toUpperCase(),
    descripcion: textField(body.descripcion, 'descripcion', 200),
    valorCentavos: montoEnCentavos(body.valor, 'valor', { permitirCero: true })
  };
}

export function validarActualizacionActivo(body) {
  allowedFields(body, ['descripcion', 'valor', 'estado'], { partial: true });
  const cambio = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'descripcion') cambio.descripcion = textField(v, 'descripcion', 200);
    if (k === 'valor') cambio.valorCentavos = montoEnCentavos(v, 'valor', { permitirCero: true });
    if (k === 'estado') cambio.estado = enumField(v, 'estado', ['VIGENTE', 'BAJA']);
  }
  return cambio;
}

export function validarLecturaSucursal(usuario, solicitado) {
  if (usuario.ROL !== ROLES.ADMIN && usuario.ROL !== ROLES.ENCARGADO) throw forbidden();
  if (usuario.ROL === ROLES.ENCARGADO) {
    const propia = usuario.ID_SUCURSAL;
    if (propia === null || propia === undefined || (solicitado !== undefined && positiveId(solicitado, 'id_sucursal') !== propia)) throw forbidden();
    return propia;
  }
  return solicitado === undefined ? undefined : positiveId(solicitado, 'id_sucursal');
}

export function validarEscrituraSucursal(usuario, solicitada) {
  const id = positiveId(solicitada, 'id_sucursal');
  if (usuario.ROL !== ROLES.ENCARGADO || usuario.ID_SUCURSAL !== id) throw forbidden();
  return id;
}

// Construye solamente SQL de columna/tabla proveniente del codigo, nunca del cliente.
export function condicionSucursal(usuario, solicitada, alias) {
  const id = validarLecturaSucursal(usuario, solicitada);
  return id === undefined ? { condiciones: [], binds: {} } : {
    condiciones: [`${alias}.id_sucursal = :idSucursal`], binds: { idSucursal: id }
  };
}

export function filtrosFechas(query, columna) {
  const condiciones = [];
  const binds = {};
  if (query.fecha_desde !== undefined) {
    binds.fechaDesde = fechaValida(query.fecha_desde, 'fecha_desde');
    condiciones.push(`${columna} >= TO_TIMESTAMP_TZ(:fechaDesde || ' 00:00:00 -06:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM')`);
  }
  if (query.fecha_hasta !== undefined) {
    binds.fechaHasta = fechaValida(query.fecha_hasta, 'fecha_hasta');
    condiciones.push(`${columna} < TO_TIMESTAMP_TZ(:fechaHasta || ' 00:00:00 -06:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM') + INTERVAL '1' DAY`);
  }
  validarRango(binds.fechaDesde, binds.fechaHasta, 'fechas');
  return { condiciones, binds };
}

export function filtrosPeriodos(query, columna) {
  const condiciones = [];
  const binds = {};
  if (query.periodo_desde !== undefined) {
    binds.periodoDesde = periodoValido(query.periodo_desde);
    condiciones.push(`${columna} >= :periodoDesde`);
  }
  if (query.periodo_hasta !== undefined) {
    binds.periodoHasta = periodoValido(query.periodo_hasta);
    condiciones.push(`${columna} <= :periodoHasta`);
  }
  validarRango(binds.periodoDesde, binds.periodoHasta, 'periodos');
  return { condiciones, binds };
}

export function condicionesSql(...filters) {
  const condiciones = filters.flatMap(f => f.condiciones);
  return {
    where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    binds: Object.assign({}, ...filters.map(f => f.binds))
  };
}
