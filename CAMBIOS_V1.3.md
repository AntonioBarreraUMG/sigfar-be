# SIGFAR v1.3 — Solicitudes y entregas

Esta version agrega el flujo minimo de coordinacion y entrega de medicamentos sobre el backend v1.2.
**No hay migraciones ni modificaciones de las 15 tablas existentes de Oracle XE.**

## Cambios

- `src/routes/solicitudes.routes.js`: endpoints para consultas, registro y cambios de estado.
- `src/services/entregas.js`: consultas de disponibilidad por departamento/municipio, seleccion de sucursal, reservas atomicas, despacho, cierre y cancelacion.
- `src/utils/entregas.js`: validacion, autorizacion, estados, formas de pago y construccion de consultas parametrizadas.
- `src/app.js`: montaje de rutas `/api/v1/solicitudes`.
- `tests/entregas.test.js`: 14 pruebas unitarias adicionales (43 en total).
- `ejemplos/prueba-entregas-lectura.ps1`: comprobacion segura sin cambios.
- `ejemplos/prueba-entregas-cambios.ps1`: flujo real opcional y explicito, modifica datos de prueba.
- `ejemplos/verificar-entregas-dbeaver.sql`: conciliacion de movimientos, reservas y saldos.

## Decisiones de alcance

- La cobertura de una farmacia corresponde a su municipio/departamento registrados; no hay GPS ni mapas.
- La sucursal elegida debe tener todos los medicamentos disponibles al confirmar.
- El tiempo estimado es la hora de confirmacion mas `sucursal.tiempo_entrega_min`.
- Se reserva al confirmar, se descuenta la existencia al despachar y se libera la reserva al cancelar antes de despachar.
- El metodo de pago es solo informativo. No hay facturacion, cobro electronico ni caja automatica.
- No existe portal publico ni call center telefonico implementado: la API interna permite preparar una futura integracion.
- La entrega real la puede marcar el coordinador o el encargado de la sucursal asignada.

## Pruebas y estado

- `npm run check:syntax` y `npm test` ejecutados localmente sin conexion a Oracle.
- Las pruebas en `DBeaver`/Oracle XE y HTTP contra tu instalacion local siguen pendientes.
- La prueba opcional `prueba-entregas-cambios.ps1 -ConfirmarCambios` crea dos solicitudes: una se cancela y otra se entrega, por lo que deja movimientos persistentes.
