import { badRequest } from './errors.js';

export function objectBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Envía un objeto JSON valido.');
  return body;
}
export function positiveId(value, field = 'id') {
  if (typeof value !== 'string' && typeof value !== 'number') throw badRequest(`${field} debe ser entero positivo.`);
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 9999999999 || !Number.isSafeInteger(Number(value))) {
    throw badRequest(`${field} debe ser entero positivo valido.`);
  }
  return Number(value);
}
export function nonNegativeCount(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 9999999999) {
    throw badRequest(`${field} debe ser un entero no negativo.`);
  }
  return value;
}
export function textField(value, field, max, { min = 1 } = {}) {
  if (typeof value !== 'string') throw badRequest(`${field} debe ser texto.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw badRequest(`${field} debe tener entre ${min} y ${max} caracteres.`);
  return normalized;
}
export function enumField(value, field, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw badRequest(`${field}: valor no permitido. Opciones: ${allowed.join(', ')}.`);
  return value;
}
export function flagField(value, field) { return enumField(value, field, ['S', 'N']); }
export function allowedFields(body, allowed, { partial = false } = {}) {
  objectBody(body);
  if (!Object.keys(body).length) throw badRequest('No se proporcionaron campos.');
  const unknown = Object.keys(body).filter(x => !allowed.includes(x));
  if (unknown.length) throw badRequest(`Campos no permitidos: ${unknown.join(', ')}.`);
  if (!partial) {
    const missing = allowed.filter(key => !(key in body));
    if (missing.length) throw badRequest(`Campos obligatorios: ${missing.join(', ')}.`);
  }
}
export function pagination(query) {
  function intParam(value, name, fallback, maximum) {
    if (value === undefined) return fallback;
    const n = Number(value);
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(n) || n < 0 || n > maximum) {
      throw badRequest(`${name} debe ser entero entre 0 y ${maximum}.`);
    }
    return n;
  }
  return { limit: Math.max(1, intParam(query.limite, 'limite', 50, 100)), offset: intParam(query.desde, 'desde', 0, 1000000) };
}
