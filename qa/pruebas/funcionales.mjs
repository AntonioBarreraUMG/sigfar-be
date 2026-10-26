#!/usr/bin/env node
/* SIGFAR QA: HTTP E2E con Node >= 20. Sin dependencias. No modifica datos por defecto.
 * --completo --confirmar-escrituras --entorno-qa para habilitar el flujo mutador.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const modoCompleto = process.argv.includes('--completo');
const escritura = process.argv.includes('--confirmar-escrituras');
const aislado = process.argv.includes('--entorno-qa');
if (modoCompleto && (!escritura || !aislado)) {
  console.error('Para pruebas de escritura usa: --completo --confirmar-escrituras --entorno-qa. Recomendado un ESQUEMA QA separado con los datos ficticios.');
  process.exit(2);
}
const BASE = (process.env.SIGFAR_QA_URL || 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const PASS = process.env.SIGFAR_QA_CLAVE || 'Demo2026!';
const users = {
  admin: process.env.SIGFAR_QA_ADMIN || 'admin@sigfar.test',
  origen: process.env.SIGFAR_QA_ENCARGADO_1 || 'guatemala@sigfar.test',
  destino: process.env.SIGFAR_QA_ENCARGADO_2 || 'quetzaltenango@sigfar.test',
  coord: process.env.SIGFAR_QA_COORD || 'entregas@sigfar.test'
};
const results = [];
const auth = {};
const estado = { ids: {}, sucursales: {}, antes: {} };
const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`.toUpperCase();
const uniqueCode = (prefix, max=30) => `${prefix}${stamp}`.slice(0,max);

async function req(method, path, { as, json } = {}) {
  const headers = {};
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (as && auth[as]) headers.Authorization = `Bearer ${auth[as]}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method, headers, body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = { texto: text.slice(0,300) }; }
    return { status: response.status, body };
  } finally { clearTimeout(timeout); }
}
function ok(response, status=200) {
  assert.equal(response.status, status, JSON.stringify(response.body).slice(0,500));
  return response.body;
}
function fails(response, statuses) {
  assert.ok(statuses.includes(response.status), `Esperado HTTP ${statuses.join('/')} y recibí ${response.status}: ${JSON.stringify(response.body).slice(0,250)}`);
  assert.ok(response.body?.error || response.status === 429, 'Error sin estructura esperada');
}
function num(v) { return Number(v); }
function amountToCents(v) { return Math.round(Number(v)*100); }
function pickRows(data) { assert.ok(Array.isArray(data?.datos), 'La API debe responder datos: []'); return data.datos; }
async function caseRun(code, reqs, name, fn) {
  const start=Date.now();
  try {
    await fn();
    results.push({ id:code, reqs, caso:name, estado:'OK', ms:Date.now()-start });
    console.log(`  OK ${code} ${name}`);
    return true;
  } catch (err) {
    results.push({ id:code, reqs, caso:name, estado:'ERROR', detalle:String(err?.message ?? err).slice(0,1200), ms:Date.now()-start });
    console.error(`ERROR ${code} ${name}: ${String(err?.message ?? err).slice(0,300)}`);
    return false;
  }
}
function requireContext(...props) {
  for(const prop of props) assert.notEqual(estado.ids[prop], undefined, `Falta preparar ${prop}; revisa los casos anteriores`);
}
function idRow(body, key) { const id=body?.datos?.[key]; assert.ok(Number.isSafeInteger(id) && id>0, `No se recibió ${key}: ${JSON.stringify(body).slice(0,250)}`); return id; }

console.log(`\nSIGFAR QA ${modoCompleto?'COMPLETA (MUTA DATOS)':'LECTURA (SIN ESCRITURAS)'}: ${BASE}\n`);
await caseRun('F-001','RNF-02','HTTP salud',async()=>{
  const b=ok(await req('GET','/health')); assert.equal(b.estado,'activo');
});
await caseRun('F-002','RF-01','Rechaza acceso sin token',async()=>{
  fails(await req('GET','/inventarios'),[401]);
});
await caseRun('F-003','RF-01','Rechaza token inválido',async()=>{
  // No utiliza credenciales reales: prueba únicamente el rechazo de token incorrecto.
  const r2=await fetch(`${BASE}/inventarios`,{headers:{Authorization:'Bearer prueba-token-invalido'}});
  assert.equal(r2.status,401);
});
await caseRun('F-004','RF-01','Inicio de sesión con credenciales incorrectas',async()=>{
  fails(await req('POST','/auth/login',{json:{correo:users.admin,clave:'Incorrecta123!' }}),[401]);
});
for (const [who, email] of Object.entries(users)) {
  await caseRun(`F-LOGIN-${who.toUpperCase()}`,'RF-01',`Inicio de sesión ${who}`,async()=>{
    const b=ok(await req('POST','/auth/login',{json:{correo:email,clave:PASS}}));
    assert.ok(typeof b.token==='string' && b.token.length>20);
    auth[who]=b.token;
  });
}
await caseRun('F-005','RF-01','Consulta /auth/me por rol',async()=>{
  for (const [k, role] of [['admin','ADMIN_CENTRAL'],['origen','ENCARGADO'],['destino','ENCARGADO'],['coord','COORD_ENTREGAS']]) {
    const b=ok(await req('GET','/auth/me',{as:k}));
    assert.equal(b.usuario.rol,role);
    if (k==='origen' || k==='destino') estado.ids[k+'Sucursal']=b.usuario.id_sucursal;
  }
  assert.notEqual(estado.ids.origenSucursal,estado.ids.destinoSucursal);
});
await caseRun('F-006','RF-02','Sucursales: listado, detalle y alcance',async()=>{
  const rows=pickRows(ok(await req('GET','/sucursales',{as:'admin'})));
  assert.ok(rows.length>=2);
  const id=estado.ids.origenSucursal;
  const suc=ok(await req('GET',`/sucursales/${id}`,{as:'admin'})).datos;
  assert.equal(suc.id_sucursal,id); estado.sucursales.origen=suc;
  const destino=ok(await req('GET',`/sucursales/${estado.ids.destinoSucursal}`,{as:'admin'})).datos;
  estado.sucursales.destino=destino;
  const propia=pickRows(ok(await req('GET','/sucursales',{as:'origen'})));
  assert.ok(propia.every(s=>s.id_sucursal===id));
  fails(await req('GET',`/sucursales/${estado.ids.destinoSucursal}`,{as:'origen'}),[403]);
});
await caseRun('F-007','RF-03','Medicamentos: catálogo y detalle',async()=>{
  const rows=pickRows(ok(await req('GET','/medicamentos',{as:'admin'})));
  assert.ok(rows.length>0);
  const d=ok(await req('GET',`/medicamentos/${rows[0].id_medicamento}`,{as:'coord'})).datos;
  assert.equal(d.id_medicamento,rows[0].id_medicamento);
});
await caseRun('F-008','RF-05','Inventario: existencia-reserva=disponible',async()=>{
  const rows=pickRows(ok(await req('GET','/inventarios?limite=100',{as:'admin'})));
  assert.ok(rows.length>0);
  for(const r of rows) assert.equal(num(r.cantidad_existente)-num(r.cantidad_reservada),num(r.cantidad_disponible));
  const id=estado.ids.origenSucursal;
  const propios=pickRows(ok(await req('GET','/inventarios?limite=100',{as:'origen'})));
  assert.ok(propios.every(r=>r.id_sucursal===id));
  fails(await req('GET',`/inventarios?id_sucursal=${estado.ids.destinoSucursal}`,{as:'origen'}),[403]);
});
await caseRun('F-009','RF-04,RF-05','Historial movimientos inventario',async()=>{
  pickRows(ok(await req('GET','/inventarios/movimientos',{as:'admin'})));
  fails(await req('GET','/inventarios/movimientos',{as:'coord'}),[403]);
});
await caseRun('F-010','RF-06,RF-07','Transferencias: listado y detalle',async()=>{
  const rows=pickRows(ok(await req('GET','/transferencias',{as:'admin'})));
  if (rows.length) {
    const detail=ok(await req('GET',`/transferencias/${rows[0].id_transferencia}`,{as:'admin'})).datos;
    assert.ok(Array.isArray(detail.detalles) && detail.detalles.length>0);
  }
  fails(await req('GET','/transferencias',{as:'coord'}),[403]);
});
await caseRun('F-011','RF-08,RF-09','Efectivo: movimientos y resumen',async()=>{
  const rows=pickRows(ok(await req('GET','/efectivo/movimientos',{as:'admin'})));
  if(rows.length) ok(await req('GET',`/efectivo/movimientos/${rows[0].id_movimiento_efectivo}`,{as:'admin'}));
  const b=ok(await req('GET','/efectivo/resumen',{as:'admin'}));
  assert.ok(b.totales && Array.isArray(b.por_sucursal));
  assert.equal(amountToCents(b.totales.ingresos)-amountToCents(b.totales.egresos),amountToCents(b.totales.flujo_neto));
  fails(await req('GET','/efectivo/resumen',{as:'coord'}),[403]);
});
await caseRun('F-012','RF-11','Planillas: períodos y totales',async()=>{
  const rows=pickRows(ok(await req('GET','/planillas',{as:'admin'})));
  if(rows.length) ok(await req('GET',`/planillas/${rows[0].id_gasto_planilla}`,{as:'admin'}));
  const b=ok(await req('GET','/planillas/resumen',{as:'admin'}));
  assert.ok(b.totales && Array.isArray(b.por_sucursal));
  fails(await req('GET','/planillas',{as:'coord'}),[403]);
});
await caseRun('F-013','RF-10','Activos: detalle y valorización',async()=>{
  const rows=pickRows(ok(await req('GET','/activos',{as:'admin'})));
  if(rows.length) ok(await req('GET',`/activos/${rows[0].id_activo}`,{as:'admin'}));
  const b=ok(await req('GET','/activos/resumen',{as:'admin'}));
  assert.ok(b.totales && Array.isArray(b.por_sucursal));
  fails(await req('GET','/activos',{as:'coord'}),[403]);
});
await caseRun('F-014','RF-12,RF-15','Solicitudes: listado y detalle',async()=>{
  const rows=pickRows(ok(await req('GET','/solicitudes',{as:'coord'})));
  if(rows.length) {
    const d=ok(await req('GET',`/solicitudes/${rows[0].id_solicitud}`,{as:'coord'})).datos;
    assert.ok(Array.isArray(d.detalles) && d.detalles.length>0);
  }
});
await caseRun('F-015','RF-13,RF-14,RF-17','API de disponibilidad para integración',async()=>{
  const suc=estado.sucursales.origen;
  const med=pickRows(ok(await req('GET','/medicamentos',{as:'coord'})))[0];
  const b=ok(await req('POST','/solicitudes/disponibilidad',{as:'coord',json:{
    departamento_entrega:suc.departamento, municipio_entrega:suc.municipio,
    detalles:[{id_medicamento:med.id_medicamento,cantidad:1}]
  }}));
  assert.ok(Array.isArray(b.datos.opciones));
  fails(await req('POST','/solicitudes/disponibilidad',{as:'origen',json:{
    departamento_entrega:suc.departamento,municipio_entrega:suc.municipio,
    detalles:[{id_medicamento:med.id_medicamento,cantidad:1}]
  }}),[403]);
});
await caseRun('F-016','RF-16','Auditoría: registros, filtros, resumen y detalle',async()=>{
  const b=ok(await req('GET','/auditoria/registros?limite=20',{as:'admin'}));
  assert.ok(Array.isArray(b.datos) && Number.isFinite(num(b.total)));
  if(b.datos.length){
    const d=ok(await req('GET',`/auditoria/registros/${b.datos[0].id_auditoria}`,{as:'admin'})).datos;
    assert.ok('datos_anteriores' in d && 'datos_nuevos' in d);
  }
  const resumen=ok(await req('GET','/auditoria/resumen',{as:'admin'})).datos;
  assert.ok(Array.isArray(resumen.por_entidad) && Array.isArray(resumen.por_sucursal));
  fails(await req('GET','/auditoria/registros',{as:'coord'}),[403]);
  fails(await req('GET','/auditoria/registros',{as:'origen'}),[403]);
});
await caseRun('F-017','RF-16','Auditoría inmutable por API',async()=>{
  fails(await req('POST','/auditoria/registros',{as:'admin',json:{entidad:'TEST'}}),[404,405]);
  fails(await req('DELETE','/auditoria/registros/1',{as:'admin'}),[404,405]);
});
await caseRun('F-018','RNF-05','Validación de paginación y entradas incorrectas',async()=>{
  fails(await req('GET','/inventarios?limite=abc',{as:'admin'}),[400]);
  fails(await req('GET','/auditoria/registros?entidad=TEST%27%20OR%201%3D1',{as:'admin'}),[400]);
  fails(await req('POST','/solicitudes/disponibilidad',{as:'coord',json:{
    departamento_entrega:'Guatemala', municipio_entrega:'Guatemala', detalles:[]
  }}),[400]);
});


await caseRun('F-SEC-001','RF-01,RNF-05','Encargado no puede consultar finanzas de otra sucursal',async()=>{
  const otra=estado.ids.destinoSucursal;
  for(const path of [`/efectivo/movimientos?id_sucursal=${otra}`,
    `/planillas?id_sucursal=${otra}`, `/activos?id_sucursal=${otra}`]) {
    fails(await req('GET',path,{as:'origen'}),[403]);
  }
});
await caseRun('F-PERF-001','RNF-09','Consulta de inventario en el tiempo objetivo local',async()=>{
  const max=Number(process.env.SIGFAR_QA_MAX_MS || 3000);
  const start=performance.now();
  ok(await req('GET','/inventarios?limite=50',{as:'admin'}));
  const duration=performance.now()-start;
  assert.ok(duration<=max,`Consulta demoró ${duration.toFixed(1)} ms; objetivo QA ${max} ms`);
});

if(modoCompleto){
  console.log('\n=== PRUEBAS DE ESCRITURA (CONSERVAN REGISTROS EN ORACLE) ===\n');
  await caseRun('F-019','RF-02','Sucursales: alta, detalle y modificación',async()=>{
    const b=ok(await req('POST','/sucursales',{as:'admin',json:{
      codigo:uniqueCode('QA-S-',20),nombre:'Sucursal QA SIGFAR',tipo:'CENTRO_COMERCIAL',
      departamento:'Guatemala',municipio:'Guatemala',direccion:'Ubicacion ficticia QA',tiempo_entrega_min:30
    }}),201);
    estado.ids.sucursalPrueba=idRow(b,'id_sucursal');
    const updated=ok(await req('PATCH',`/sucursales/${estado.ids.sucursalPrueba}`,{as:'admin',json:{nombre:'Sucursal QA Verificada'}}));
    assert.equal(updated.datos.nombre,'Sucursal QA Verificada');
    fails(await req('POST','/sucursales',{as:'origen',json:{codigo:uniqueCode('NO-',20)}}),[403]);
  });
  await caseRun('F-020','RF-03','Medicamentos: alta, modificación y lectura',async()=>{
    const b=ok(await req('POST','/medicamentos',{as:'admin',json:{codigo:uniqueCode('QA-MED-',30),nombre:'Medicina ficticia QA',presentacion:'Unidad'}}),201);
    estado.ids.med=idRow(b,'id_medicamento');
    const updated=ok(await req('PATCH',`/medicamentos/${estado.ids.med}`,{as:'admin',json:{nombre:'Medicamento QA Validado'}}));
    assert.equal(updated.datos.nombre,'Medicamento QA Validado');
    fails(await req('PATCH',`/medicamentos/${estado.ids.med}`,{as:'origen',json:{nombre:'Ilegal'}}),[403]);
  });
  await caseRun('F-021','RF-04,RF-05','Inventario inicial en dos sucursales y ajustes',async()=>{
    requireContext('med','origenSucursal','destinoSucursal');
    const med=estado.ids.med, suc=estado.ids.origenSucursal, dst=estado.ids.destinoSucursal;
    for(const [who,sucursal,cantidad] of [['origen',suc,12],['destino',dst,2]]){
      const b=ok(await req('POST','/inventarios/movimientos',{as:who,json:{id_sucursal:sucursal,id_medicamento:med,tipo:'INICIAL',cantidad}}),201);
      assert.equal(b.datos.cantidad_existente,cantidad);
    }
    ok(await req('POST','/inventarios/movimientos',{as:'origen',json:{id_sucursal:suc,id_medicamento:med,tipo:'AJUSTE_ENTRADA',cantidad:3,motivo:'QA entrada'}}),201);
    const b=ok(await req('POST','/inventarios/movimientos',{as:'origen',json:{id_sucursal:suc,id_medicamento:med,tipo:'AJUSTE_SALIDA',cantidad:2,motivo:'QA salida'}}),201);
    assert.equal(b.datos.cantidad_existente,13);
    fails(await req('POST','/inventarios/movimientos',{as:'origen',json:{id_sucursal:suc,id_medicamento:med,tipo:'AJUSTE_SALIDA',cantidad:99,motivo:'QA insuficiencia'}}),[409]);
    fails(await req('POST','/inventarios/movimientos',{as:'destino',json:{id_sucursal:suc,id_medicamento:med,tipo:'AJUSTE_ENTRADA',cantidad:1,motivo:'QA denegado'}}),[403]);
  });
  await caseRun('F-022','RF-06,RF-07','Transferencia: creación, permisos, despacho, recepción',async()=>{
    requireContext('med','origenSucursal','destinoSucursal');
    const suc=estado.ids.origenSucursal,dst=estado.ids.destinoSucursal,med=estado.ids.med;
    const b=ok(await req('POST','/transferencias',{as:'origen',json:{id_sucursal_origen:suc,id_sucursal_destino:dst,detalles:[{id_medicamento:med,cantidad:3}]}}),201);
    estado.ids.transferencia=idRow(b,'id_transferencia');
    assert.equal(b.datos.estado,'REGISTRADA');
    fails(await req('POST',`/transferencias/${estado.ids.transferencia}/despachar`,{as:'destino',json:{}}),[403]);
    const salida=ok(await req('POST',`/transferencias/${estado.ids.transferencia}/despachar`,{as:'origen',json:{}}));
    assert.equal(salida.datos.estado,'EN_TRANSITO');
    fails(await req('POST',`/transferencias/${estado.ids.transferencia}/despachar`,{as:'origen',json:{}}),[409]);
    fails(await req('POST',`/transferencias/${estado.ids.transferencia}/recibir`,{as:'origen',json:{}}),[403]);
    const llegada=ok(await req('POST',`/transferencias/${estado.ids.transferencia}/recibir`,{as:'destino',json:{}}));
    assert.equal(llegada.datos.estado,'RECIBIDA');
    fails(await req('POST',`/transferencias/${estado.ids.transferencia}/recibir`,{as:'destino',json:{}}),[409]);
    const inv1=pickRows(ok(await req('GET',`/inventarios?id_sucursal=${suc}&id_medicamento=${med}`,{as:'admin'})))[0];
    const inv2=pickRows(ok(await req('GET',`/inventarios?id_sucursal=${dst}&id_medicamento=${med}`,{as:'admin'})))[0];
    assert.equal(inv1.cantidad_existente,10);
    assert.equal(inv2.cantidad_existente,5);
  });
  await caseRun('F-023','RF-08,RF-09','Efectivo: ingreso, egreso y cálculo del flujo',async()=>{
    const suc=estado.ids.origenSucursal;
    const before=ok(await req('GET',`/efectivo/resumen?id_sucursal=${suc}`,{as:'admin'})).totales;
    for(const [tipo,monto] of [['INGRESO','125.50'],['EGRESO','20.10']]){
      const b=ok(await req('POST','/efectivo/movimientos',{as:'origen',json:{id_sucursal:suc,tipo,concepto:'Movimiento ficticio QA',monto}}),201);
      const id=idRow(b,'id_movimiento_efectivo');
      assert.equal(ok(await req('GET',`/efectivo/movimientos/${id}`,{as:'admin'})).datos.tipo,tipo);
    }
    const after=ok(await req('GET',`/efectivo/resumen?id_sucursal=${suc}`,{as:'admin'})).totales;
    assert.equal(amountToCents(after.flujo_neto)-amountToCents(before?.flujo_neto??0),10540);
    fails(await req('POST','/efectivo/movimientos',{as:'origen',json:{id_sucursal:suc,tipo:'INGRESO',concepto:'Inválido',monto:'12.345'}}),[400]);
  });
  await caseRun('F-024','RF-11','Planilla: registro, periodo único y corrección auditada',async()=>{
    const suc=estado.ids.origenSucursal;
    const listado=pickRows(ok(await req('GET','/planillas?limite=100',{as:'origen'})));
    const usados=new Set(listado.map(x=>x.periodo));
    let periodo=process.env.SIGFAR_QA_PERIODO;
    if (!periodo) {
      for(let year=2080;year<2100&&!periodo;year++) for(let month=1;month<=12;month++){
        const p=`${year}-${String(month).padStart(2,'0')}`;
        if(!usados.has(p)){periodo=p;break;}
      }
    }
    assert.ok(periodo && !usados.has(periodo),'No hay período de prueba libre, revisa SIGFAR_QA_PERIODO');
    const b=ok(await req('POST','/planillas',{as:'origen',json:{id_sucursal:suc,periodo,monto_total:'101.25'}}),201);
    const id=idRow(b,'id_gasto_planilla');
    estado.ids.planilla=id;
    const upd=ok(await req('PATCH',`/planillas/${id}`,{as:'origen',json:{monto_total:'107.75'}}));
    assert.equal(amountToCents(upd.datos.monto_total),10775);
    fails(await req('POST','/planillas',{as:'origen',json:{id_sucursal:suc,periodo,monto_total:'1.00'}}),[409]);
    fails(await req('PATCH',`/planillas/${id}`,{as:'destino',json:{monto_total:'999.99'}}),[403]);
  });
  await caseRun('F-025','RF-10','Activo fijo: registro, actualización, baja y valorización',async()=>{
    const suc=estado.ids.origenSucursal;
    const before=ok(await req('GET',`/activos/resumen?id_sucursal=${suc}`,{as:'admin'})).totales;
    const b=ok(await req('POST','/activos',{as:'origen',json:{id_sucursal:suc,codigo:uniqueCode('QA-ACT-',30),descripcion:'Mobiliario QA',valor:'75.30'}}),201);
    const id=idRow(b,'id_activo');
    const upd=ok(await req('PATCH',`/activos/${id}`,{as:'origen',json:{descripcion:'Mobiliario QA actualizado',valor:'80.70'}}));
    assert.equal(amountToCents(upd.datos.valor),8070);
    const during=ok(await req('GET',`/activos/resumen?id_sucursal=${suc}`,{as:'admin'})).totales;
    assert.equal(amountToCents(during.valor_total)-amountToCents(before?.valor_total??0),8070);
    const baja=ok(await req('PATCH',`/activos/${id}`,{as:'origen',json:{estado:'BAJA'}}));
    assert.equal(baja.datos.estado,'BAJA');
    const after=ok(await req('GET',`/activos/resumen?id_sucursal=${suc}`,{as:'admin'})).totales;
    assert.equal(amountToCents(after.valor_total),amountToCents(before?.valor_total??0));
  });
  await caseRun('F-026','RF-12,RF-13,RF-14','Solicitud: elegibilidad, confirmación y reserva',async()=>{
    requireContext('med','origenSucursal');
    const suc=estado.sucursales.origen,med=estado.ids.med;
    const payload={cliente_nombre:'Cliente académico QA',cliente_telefono:'55500000',
      departamento_entrega:suc.departamento,municipio_entrega:suc.municipio,
      direccion_entrega:'Dirección ficticia QA',detalles:[{id_medicamento:med,cantidad:2}]};
    estado.payloadSolicitud=payload;
    const opts=ok(await req('POST','/solicitudes/disponibilidad',{as:'coord',json:{
      departamento_entrega:suc.departamento,municipio_entrega:suc.municipio,detalles:payload.detalles
    }})).datos.opciones;
    assert.ok(opts.some(x=>x.id_sucursal===suc.id_sucursal),'La sucursal QA debería ser elegible');
    const b=ok(await req('POST','/solicitudes',{as:'coord',json:payload}),201);
    const id=idRow(b,'id_solicitud'); estado.ids.cancelarSolicitud=id;
    ok(await req('GET',`/solicitudes/${id}/opciones`,{as:'coord'}));
    const confirmed=ok(await req('POST',`/solicitudes/${id}/confirmar`,{as:'coord',json:{id_sucursal:suc.id_sucursal,forma_pago:'EFECTIVO'}})).datos;
    assert.equal(confirmed.estado,'CONFIRMADA');
    assert.ok(confirmed.fecha_estimada_entrega && confirmed.detalles[0].estado_reserva==='ACTIVA');
    fails(await req('POST',`/solicitudes/${id}/confirmar`,{as:'coord',json:{id_sucursal:suc.id_sucursal,forma_pago:'EFECTIVO'}}),[409]);
    fails(await req('POST',`/solicitudes/${id}/despachar`,{as:'destino',json:{}}),[403]);
    const inv=pickRows(ok(await req('GET',`/inventarios?id_sucursal=${suc.id_sucursal}&id_medicamento=${med}`,{as:'admin'})))[0];
    assert.equal(inv.cantidad_reservada,2);
  });
  await caseRun('F-027','RF-13,RF-15','Solicitud: cancelar y liberar reserva',async()=>{
    requireContext('cancelarSolicitud');
    const id=estado.ids.cancelarSolicitud;
    const before=pickRows(ok(await req('GET',`/inventarios?id_sucursal=${estado.ids.origenSucursal}&id_medicamento=${estado.ids.med}`,{as:'admin'})))[0];
    const b=ok(await req('POST',`/solicitudes/${id}/cancelar`,{as:'coord',json:{}})).datos;
    assert.equal(b.estado,'CANCELADA');
    assert.equal(b.detalles[0].estado_reserva,'LIBERADA');
    const after=pickRows(ok(await req('GET',`/inventarios?id_sucursal=${estado.ids.origenSucursal}&id_medicamento=${estado.ids.med}`,{as:'admin'})))[0];
    assert.equal(after.cantidad_reservada,before.cantidad_reservada-2);
    fails(await req('POST',`/solicitudes/${id}/despachar`,{as:'origen',json:{}}),[409]);
  });
  await caseRun('F-028','RF-12,RF-15','Solicitud: confirmar, despachar y entregar sin duplicados',async()=>{
    assert.ok(estado.payloadSolicitud);
    const b=ok(await req('POST','/solicitudes',{as:'coord',json:estado.payloadSolicitud}),201);
    const id=idRow(b,'id_solicitud'); estado.ids.entrega=id;
    const suc=estado.ids.origenSucursal,med=estado.ids.med;
    ok(await req('POST',`/solicitudes/${id}/confirmar`,{as:'coord',json:{id_sucursal:suc,forma_pago:'TARJETA'}}));
    const before=pickRows(ok(await req('GET',`/inventarios?id_sucursal=${suc}&id_medicamento=${med}`,{as:'admin'})))[0];
    const desp=ok(await req('POST',`/solicitudes/${id}/despachar`,{as:'origen',json:{}})).datos;
    assert.equal(desp.estado,'DESPACHADA');
    assert.equal(desp.detalles[0].estado_reserva,'CONSUMIDA');
    const after=pickRows(ok(await req('GET',`/inventarios?id_sucursal=${suc}&id_medicamento=${med}`,{as:'admin'})))[0];
    assert.equal(after.cantidad_existente,before.cantidad_existente-2);
    assert.equal(after.cantidad_reservada,before.cantidad_reservada-2);
    fails(await req('POST',`/solicitudes/${id}/despachar`,{as:'origen',json:{}}),[409]);
    const final=ok(await req('POST',`/solicitudes/${id}/entregar`,{as:'coord',json:{}})).datos;
    assert.equal(final.estado,'ENTREGADA'); assert.ok(final.fecha_entrega_real);
    fails(await req('POST',`/solicitudes/${id}/entregar`,{as:'coord',json:{}}),[409]);
  });
  await caseRun('F-029','RF-13','Solicitud sin existencias: rechaza confirmación',async()=>{
    const payload={...estado.payloadSolicitud,detalles:[{id_medicamento:estado.ids.med,cantidad:999999}]};
    const b=ok(await req('POST','/solicitudes',{as:'coord',json:payload}),201);
    const id=idRow(b,'id_solicitud');
    const options=ok(await req('GET',`/solicitudes/${id}/opciones`,{as:'coord'})).datos.opciones;
    assert.equal(options.length,0);
    fails(await req('POST',`/solicitudes/${id}/confirmar`,{as:'coord',json:{id_sucursal:estado.ids.origenSucursal,forma_pago:'EFECTIVO'}}),[409]);
    ok(await req('POST',`/solicitudes/${id}/cancelar`,{as:'coord',json:{}}));
  });
  await caseRun('F-030','RF-16','Auditoría: trazabilidad real de las nuevas operaciones',async()=>{
    requireContext('med','transferencia','planilla','entrega');
    for (const [entidad,id,expected] of [
      ['MEDICAMENTO',estado.ids.med,['CREAR','MODIFICAR']],
      ['TRANSFERENCIA',estado.ids.transferencia,['REGISTRAR','DESPACHAR','RECIBIR']],
      ['GASTO_PLANILLA',estado.ids.planilla,['REGISTRAR','CORREGIR']],
      ['SOLICITUD_ENTREGA',estado.ids.entrega,['REGISTRAR','CONFIRMAR','DESPACHAR','ENTREGAR']]
    ]){
      const b=ok(await req('GET',`/auditoria/registros?entidad=${entidad}&id_registro=${id}&limite=100`,{as:'admin'}));
      const acciones=new Set(b.datos.map(x=>x.accion));
      for(const act of expected) assert.ok(acciones.has(act),`${entidad} id ${id} sin auditoría ${act}`);
      assert.ok(Number(b.total)>=expected.length);
    }
  });
  if(process.argv.includes('--concurrencia')){
    await caseRun('F-CON-001','RF-06,RF-07,RNF-06','Dos despachos simultáneos: solo uno se confirma',async()=>{
      requireContext('med','origenSucursal','destinoSucursal');
      const b=ok(await req('POST','/transferencias',{as:'origen',json:{
        id_sucursal_origen:estado.ids.origenSucursal,id_sucursal_destino:estado.ids.destinoSucursal,
        detalles:[{id_medicamento:estado.ids.med,cantidad:1}]
      }}),201);
      const id=idRow(b,'id_transferencia');
      const statuses=await Promise.all([
        req('POST',`/transferencias/${id}/despachar`,{as:'origen',json:{}}),
        req('POST',`/transferencias/${id}/despachar`,{as:'origen',json:{}})
      ]);
      assert.deepEqual(statuses.map(x=>x.status).sort((a,b)=>a-b),[200,409]);
      ok(await req('POST',`/transferencias/${id}/recibir`,{as:'destino',json:{}}));
    });
    await caseRun('F-CON-002','RF-13,RNF-06','Doble confirmación concurrente: una única reserva',async()=>{
      assert.ok(estado.payloadSolicitud);
      const b=ok(await req('POST','/solicitudes',{as:'coord',json:{
        ...estado.payloadSolicitud,detalles:[{id_medicamento:estado.ids.med,cantidad:1}]
      }}),201);
      const id=idRow(b,'id_solicitud');
      const statuses=await Promise.all([
        req('POST',`/solicitudes/${id}/confirmar`,{as:'coord',json:{id_sucursal:estado.ids.origenSucursal,forma_pago:'EFECTIVO'}}),
        req('POST',`/solicitudes/${id}/confirmar`,{as:'coord',json:{id_sucursal:estado.ids.origenSucursal,forma_pago:'EFECTIVO'}})
      ]);
      assert.deepEqual(statuses.map(x=>x.status).sort((a,b)=>a-b),[200,409]);
      const d=ok(await req('GET',`/solicitudes/${id}`,{as:'coord'})).datos;
      assert.equal(d.detalles.length,1);
      assert.equal(d.detalles[0].cantidad_reservada,1);
      ok(await req('POST',`/solicitudes/${id}/cancelar`,{as:'coord',json:{}}));
    });
  }

}
const fin = { fecha: new Date().toISOString(), modo:modoCompleto?'escritura':'solo_lectura', url:BASE,
  advertencia:modoCompleto?'Las escrituras quedan almacenadas en Oracle; no hay limpieza destructiva.':'No se modificaron datos.',
  total:results.length, aprobadas:results.filter(r=>r.estado==='OK').length,
  fallidas:results.filter(r=>r.estado==='ERROR').length, resultados:results };
const folder=resolve(process.env.SIGFAR_QA_RESULTADOS || './resultados');
await mkdir(folder,{recursive:true});
await writeFile(resolve(folder,'resultado-funcional.json'),JSON.stringify(fin,null,2)+'\n','utf8');
const md=[`# Resultados funcionales SIGFAR`, '',`Fecha: ${fin.fecha}`,`Modo: ${fin.modo}`,`Resultado: ${fin.aprobadas}/${fin.total} OK`, '', '| ID | Requisitos | Caso | Resultado |', '|---|---|---|---|',
  ...results.map(r=>`| ${r.id} | ${r.reqs} | ${r.caso.replaceAll('|','/')} | ${r.estado} |`),
  '',...results.filter(r=>r.estado==='ERROR').flatMap(r=>[`### ${r.id}`, '', '```text',r.detalle,'```', '']),
  '',`**Nota:** ${fin.advertencia}`,''];
await writeFile(resolve(folder,'resultado-funcional.md'),md.join('\n'),'utf8');
console.log(`\nResultado: ${fin.aprobadas}/${fin.total} OK. Reportes: ${folder}\n`);
process.exitCode=fin.fallidas?1:0;
