// Oracle devuelve columnas en mayusculas; la API usa snake_case minusculo.
export function apiRow(row) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
}
export function apiRows(rows) { return rows.map(apiRow); }
