export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function badRequest(message) {
  return new HttpError(400, 'VALIDACION', message);
}
export function forbidden() {
  return new HttpError(403, 'SIN_PERMISO', 'No tienes permiso para esta operacion.');
}
export function notFound(message = 'Registro no encontrado.') {
  return new HttpError(404, 'NO_ENCONTRADO', message);
}
export function conflict(message) {
  return new HttpError(409, 'CONFLICTO', message);
}

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed')
    return res.status(400).json({
      error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la peticion no es JSON valido.' },
    });
  if (error.type === 'entity.too.large')
    return res.status(413).json({
      error: { codigo: 'CUERPO_EXCESIVO', mensaje: 'La peticion excede el tamano permitido.' },
    });
  // Espera de bloqueo: devolver conflicto; la transaccion llamante hace rollback.
  if ([54, 30006].includes(error.errorNum)) {
    return res.status(409).json({
      error: {
        codigo: 'OPERACION_EN_PROCESO',
        mensaje: 'El registro esta siendo modificado por otra operacion. Intenta nuevamente.',
      },
    });
  }
  // Oracle duplicate key o restricciones: no se publican detalles internos del esquema.
  if (error.errorNum === 1)
    return res.status(409).json({
      error: { codigo: 'DUPLICADO', mensaje: 'Ya existe un registro con esos datos unicos.' },
    });
  if ([2290, 2291, 2292, 1400, 12899, 1438].includes(error.errorNum)) {
    return res.status(400).json({
      error: {
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'La operacion incumple una restriccion de la base de datos.',
      },
    });
  }
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error(`[${new Date().toISOString()}]`, error);
  res.status(status).json({
    error: {
      codigo: error instanceof HttpError ? error.code : 'ERROR_INTERNO',
      mensaje:
        error instanceof HttpError ? error.message : 'No fue posible completar la operacion.',
    },
  });
}
