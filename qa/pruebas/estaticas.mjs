#!/usr/bin/env node
// Validación estática de la entrega v1.4; NO equivale a ejecutar Oracle ni la API.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const BACK=resolve(process.env.SIGFAR_QA_BACKEND || './SIGFAR_Backend');
const SCHEMA=resolve(process.env.SIGFAR_QA_ESQUEMA || './01_esquema.sql');
const base=join(BACK,'src');
const checks=[];
async function check(nombre,fn){
  try{await fn();checks.push({nombre,estado:'OK'});console.log(`OK ${nombre}`)}
  catch(e){checks.push({nombre,estado:'ERROR',detalle:String(e.message)});console.error(`ERROR ${nombre}: ${e.message}`)}
}
const sql=await readFile(SCHEMA,'utf8');
await check('Estructura de 15 tablas',()=>assert.equal((sql.match(/\bCREATE\s+TABLE\s+\w+/gi)||[]).length,15));
await check('Declaración de 30 FK',()=>assert.equal((sql.match(/\bFOREIGN\s+KEY\s*\(/gi)||[]).length,30));
await check('Índices de consulta (11)',()=>assert.equal((sql.match(/\bCREATE\s+INDEX\s+\w+/gi)||[]).length,11));
const names=['rol','usuario','sucursal','medicamento','inventario_sucursal','movimiento_inventario','transferencia','detalle_transferencia','movimiento_efectivo','gasto_planilla','activo_fijo','solicitud_entrega','detalle_solicitud','reserva_inventario','registro_auditoria'];
await check('Están las 15 entidades previstas',()=>names.forEach(n=>assert.match(sql,new RegExp(`CREATE\\s+TABLE\\s+${n}\\s*\\(`,'i'))));
const expected={
  'auth':['/login','/me'],
  'sucursales':['/:id','/'],
  'medicamentos':['/:id','/'],
  'inventarios':['/movimientos','/'],
  'transferencias':['/:id/despachar','/:id/recibir','/:id'],
  'efectivo':['/movimientos','/resumen','/movimientos/:id'],
  'planillas':['/resumen','/:id','/'],
  'activos':['/resumen','/:id','/'],
  'solicitudes':['/disponibilidad','/:id/opciones','/:id/confirmar','/:id/despachar','/:id/entregar','/:id/cancelar'],
  'auditoria':['/registros','/resumen','/registros/:id']
};
for(const [name,routes] of Object.entries(expected)){
  await check(`Rutas montadas ${name}`,async()=>{
    const route=await readFile(join(base,'routes',`${name}.routes.js`),'utf8');
    const app=await readFile(join(base,'app.js'),'utf8');
    assert.ok(app.includes(`/api/v1/${name}`));
    for(const path of routes) assert.ok(route.includes(`'${path}'`),`${name}: falta ${path}`);
  });
}
await check('Auditoría solo de lectura por API',async()=>{
  const code=await readFile(join(base,'routes/auditoria.routes.js'),'utf8');
  assert.match(code,/requireRole\(ROLES.ADMIN\)/);
  assert.ok(!/router\.(post|patch|put|delete)\(/i.test(code));
});
await check('Transacciones disponibles para escrituras',async()=>{
  const code=await readFile(join(base,'db/oracle.js'),'utf8');
  assert.match(code,/await connection\.commit\(\)/);
  assert.match(code,/await connection\.rollback\(\)/);
});
await check('Control de reserva e inventario disponible',async()=>{
  const code=await readFile(join(base,'services/entregas.js'),'utf8');
  assert.ok(code.includes('cantidad_reservada=cantidad_reservada+:cant'));
  assert.ok(code.includes('cantidad_reservada=cantidad_reservada-:cant'));
  assert.ok(code.includes("estado='CONSUMIDA'"));
  assert.ok(code.includes("estado='LIBERADA'"));
});
await check('Registro de movimientos de transferencia',async()=>{
  const code=await readFile(join(base,'services/transferencias.js'),'utf8');
  assert.ok(code.includes('TRANSFERENCIA_SALIDA'));
  assert.ok(code.includes('TRANSFERENCIA_ENTRADA'));
  assert.ok(code.includes('guardarAuditoria'));
});
await check('Registro de auditoría en cambios administrativos',async()=>{
  const code=await readFile(join(base,'services/administracion.js'),'utf8');
  for(const x of ['MOVIMIENTO_EFECTIVO','GASTO_PLANILLA','ACTIVO_FIJO','guardarAuditoria'])assert.ok(code.includes(x));
});
await check('Configuración Oracle XEPDB1 incluida',async()=>{
  const env=await readFile(join(BACK,'.env.example'),'utf8');
  assert.match(env,/DB_SERVICE=XEPDB1/);
});
await check('Pruebas unitarias existentes',async()=>{
  const files=await readdir(join(BACK,'tests'));
  assert.ok(files.filter(f=>f.endsWith('.test.js')).length>=8);
});
const errors=checks.filter(x=>x.estado==='ERROR');
const output={tipo:'estatico',fecha:new Date().toISOString(),total:checks.length,ok:checks.length-errors.length,errores:errors.length,pruebas:checks};
const dest=resolve(process.env.SIGFAR_QA_RESULTADOS || './resultados');
await mkdir(dest,{recursive:true});
await writeFile(join(dest,'resultado-estatico.json'),JSON.stringify(output,null,2)+'\n');
console.log(`\n${output.ok}/${output.total} verificaciones estáticas. Resultados: ${dest}`);
process.exitCode=errors.length?1:0;
