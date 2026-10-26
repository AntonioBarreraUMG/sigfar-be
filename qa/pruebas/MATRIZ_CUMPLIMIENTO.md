# SIGFAR — Informe de cumplimiento y auditoría técnica

**Fecha de evaluación:** 2026-10-25  
**Base evaluada:** documento “Proyecto del Área de Análisis y Desarrollo”, UMG (una página), esquema DBeaver `01_esquema.sql` y backend v1.4 (`SIGFAR_Backend_v1.4_Auditoria_OracleXE.zip`).  
**Objeto de esta fase:** únicamente el software, sin producir los artefactos documentales académicos.

## Dictamen

- **Cobertura de código:** se identifican rutas y servicios para los 17 requerimientos funcionales definidos durante este proyecto.
- **Evidencia local ya aportada por el usuario:** 32/32 verificaciones SQL en DBeaver, conexión backend-Oracle y comprobación manual de inventario, transferencias, finanzas, entregas y auditoría.
- **Evidencia obtenida al revisar los archivos en esta etapa:** 52/52 pruebas unitarias ejecutadas con Node.js 22, 39 archivos JS sin error sintáctico y 21/21 verificaciones estáticas nuevas satisfactorias.
- **Aún sin demostrar aquí:** batería funcional HTTP completa, integridad ante concurrencia en Oracle real, objetivo de rendimiento con datos/infraestructura reales, frontend React y uso de la nube.
- **Conclusión:** **backend funcional con cobertura implementada, en espera de pruebas integrales automatizadas**; no declarar cumplimiento completo del proyecto todavía.

### Matriz de requerimientos funcionales

| ID | Alcance validado en código | Evidencia/Pruebas automatizadas | Estado |
|---|---|---|---|
| RF-01 | Autenticación scrypt/JWT, roles, restricción de sucursal | F-002 a F-005, F-SEC-001, tests unitarios | Implementado; E2E pendiente |
| RF-02 | Alta, consulta y modificación de sucursales | F-006, F-019 | Implementado; E2E pendiente |
| RF-03 | Alta, consulta y modificación de medicamentos | F-007, F-020 | Implementado; E2E pendiente |
| RF-04 | Inventario inicial y ajustes registrados | F-009, F-021 | Implementado; E2E pendiente |
| RF-05 | Existencias por sucursal, reservadas y disponibles | F-008, F-021, F-022 | Implementado; E2E pendiente |
| RF-06 | Registrar transferencias entre sucursales | F-010, F-022 | Implementado; E2E pendiente |
| RF-07 | Despachar y recibir con saldos consistentes | F-022, F-CON-001 | Implementado; E2E y concurrencia pendientes |
| RF-08 | Registrar ingresos y egresos de efectivo | F-011, F-023 | Implementado; E2E pendiente |
| RF-09 | Consultar flujo de efectivo y total por empresa | F-011, F-023 | Implementado; E2E pendiente |
| RF-10 | Activos fijos, valor, cambios y baja | F-013, F-025 | Implementado; E2E pendiente |
| RF-11 | Gastos de planilla por sucursal y período | F-012, F-024 | Implementado; E2E pendiente |
| RF-12 | Solicitud y detalle de medicamentos | F-014, F-026, F-028 | Implementado; E2E pendiente |
| RF-13 | Elegibilidad por ubicación y existencia | F-015, F-026, F-029 | Implementado; E2E pendiente |
| RF-14 | Asignar sucursal, forma de pago y ETA | F-015, F-026 | Implementado; E2E pendiente |
| RF-15 | Estados, reservas, cancelación, despacho, entrega y tardanza | F-014, F-027, F-028 | Implementado; E2E pendiente |
| RF-16 | Bitácora central, filtros, detalle y resumen | F-016, F-017, F-030 | Implementado; E2E pendiente |
| RF-17 | API REST de disponibilidad/solicitudes preparada para integración futura | F-015, F-026 | Interfaz API implementada; integración externa no requerida ahora |

### Requerimientos no funcionales y de tecnología

| Código | Evaluación |
|---|---|
| RNF-01: React | **Pendiente:** la interfaz no se ha desarrollado. |
| RNF-02: Node.js/Express | **Verificado por inspección:** backend Express modular disponible. |
| RNF-03: Oracle XE | **Verificado por usuario:** conexión real en XEPDB1 y 15 tablas. |
| RNF-04: nube | **Pendiente:** instalación actual local; falta desplegar con servicio cloud. |
| RNF-05: seguridad | **Parcial:** JWT, hash scrypt, roles y permisos implementados; falta E2E negativo y revisar configuración al desplegar. |
| RNF-06: consistencia transaccional | **Parcial:** commits/rollbacks y locks en código; faltan E2E y competencia real (`--concurrencia`). |
| RNF-07: auditabilidad | **Parcial:** bitácora registrada en transacciones; probar filtros y exactitud de snapshots E2E. |
| RNF-08: interfaz en español | **Pendiente:** backend usa respuestas en español; interfaz React no construida. |
| RNF-09: respuesta usual <= 3 s | **Pendiente de medición:** caso F-PERF-001 sobre backend local. |
| RNF-10: HTTP/JSON | **Implementado:** rutas REST y respuestas JSON; HTTPS deberá configurarse en nube. |
| RNF-11: datos ficticios | **Verificado por juego de prueba:** 3 sucursales, 4 medicamentos, operaciones ficticias. |

## Correspondencia con el enunciado universitario

- **Sí se aborda en software:** inventarios por localidad; flujo de efectivo auditable; movimientos entre farmacias; planilla; valor de activos; coordinación de entregas; consulta de stock por municipio, forma de pago y estimación de entrega; arquitectura preparada para futura atención por portal/call center.
- **No está terminado para entrega universitaria:** frontend React o Angular, utilización demostrable de un servicio cloud.
- **Fuera de este encargo centrado en software, pero presente en el enunciado completo:** visión de negocio, visión del sistema, arquitectura del negocio con RUP, tres factibilidades y evidencias documentales. No deben marcarse como entregados.

## Observaciones de diseño y riesgos

1. **Las 32 verificaciones SQL son sobre el estado del juego ficticio original.** Tras escrituras válidas, algunas métricas fijas dejan de coincidir; eso no demuestra inconsistencia. Revisar conciliación y nuevos valores.
2. **No hay evidencia de estrés, múltiples usuarios simultáneos o infraestructura cloud.** Las pruebas opcionales de concurrencia ayudan a comprobar las transacciones más sensibles.
3. **La disponibilidad se resuelve con el municipio exacto y el tiempo configurado de sucursal.** Es una simplificación académica intencionada; no es cálculo de ruta ni hora garantizada con tráfico real.
4. **El dinero en la API se registra en quetzales y con dos decimales.** El flujo neto es un reporte de movimientos registrados, no conciliación bancaria ni caja física.
5. **El futuro portal/call center no tiene que construirse:** la API existente es la preparación mínima acordada; exigir pruebas de integración reales requiere un sistema externo que todavía no existe.
6. **Las pruebas de escritura no son reversibles automáticamente.** Se recomienda un esquema de QA separado para no alterar el juego que ya fue validado.
7. **No se han observado faltantes funcionales mayores por inspección**, pero la ausencia de fallos en revisión estática no descarta fallos de comportamiento. El criterio de aceptación es 0 fallas en el modo E2E completo y revisión de los resultados en Oracle.

## Condiciones para pasar a React

1. `npm test` y `npm run check:syntax` sin errores.
2. `npm run db:check` sobre tu Oracle XE.
3. Pruebas funcionales de lectura contra tu instancia: 0 fallidas.
4. Pruebas funcionales de escritura y de conciliación en esquema QA: 0 fallidas; competencia concurrente recomendada.
5. Inspeccionar reportes `resultado-funcional.json` y `resultado-funcional.md`; corregir cualquier problema real detectado antes de programar la interfaz.
6. Desarrollar React únicamente con los endpoints existentes. El servicio cloud sigue como etapa posterior.
