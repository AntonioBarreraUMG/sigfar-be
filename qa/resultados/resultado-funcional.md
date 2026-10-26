# Resultados funcionales SIGFAR

Fecha: 2026-10-26T03:41:31.787Z
Modo: escritura
Resultado: 38/38 OK

| ID | Requisitos | Caso | Resultado |
|---|---|---|---|
| F-001 | RNF-02 | HTTP salud | OK |
| F-002 | RF-01 | Rechaza acceso sin token | OK |
| F-003 | RF-01 | Rechaza token inválido | OK |
| F-004 | RF-01 | Inicio de sesión con credenciales incorrectas | OK |
| F-LOGIN-ADMIN | RF-01 | Inicio de sesión admin | OK |
| F-LOGIN-ORIGEN | RF-01 | Inicio de sesión origen | OK |
| F-LOGIN-DESTINO | RF-01 | Inicio de sesión destino | OK |
| F-LOGIN-COORD | RF-01 | Inicio de sesión coord | OK |
| F-005 | RF-01 | Consulta /auth/me por rol | OK |
| F-006 | RF-02 | Sucursales: listado, detalle y alcance | OK |
| F-007 | RF-03 | Medicamentos: catálogo y detalle | OK |
| F-008 | RF-05 | Inventario: existencia-reserva=disponible | OK |
| F-009 | RF-04,RF-05 | Historial movimientos inventario | OK |
| F-010 | RF-06,RF-07 | Transferencias: listado y detalle | OK |
| F-011 | RF-08,RF-09 | Efectivo: movimientos y resumen | OK |
| F-012 | RF-11 | Planillas: períodos y totales | OK |
| F-013 | RF-10 | Activos: detalle y valorización | OK |
| F-014 | RF-12,RF-15 | Solicitudes: listado y detalle | OK |
| F-015 | RF-13,RF-14,RF-17 | API de disponibilidad para integración | OK |
| F-016 | RF-16 | Auditoría: registros, filtros, resumen y detalle | OK |
| F-017 | RF-16 | Auditoría inmutable por API | OK |
| F-018 | RNF-05 | Validación de paginación y entradas incorrectas | OK |
| F-SEC-001 | RF-01,RNF-05 | Encargado no puede consultar finanzas de otra sucursal | OK |
| F-PERF-001 | RNF-09 | Consulta de inventario en el tiempo objetivo local | OK |
| F-019 | RF-02 | Sucursales: alta, detalle y modificación | OK |
| F-020 | RF-03 | Medicamentos: alta, modificación y lectura | OK |
| F-021 | RF-04,RF-05 | Inventario inicial en dos sucursales y ajustes | OK |
| F-022 | RF-06,RF-07 | Transferencia: creación, permisos, despacho, recepción | OK |
| F-023 | RF-08,RF-09 | Efectivo: ingreso, egreso y cálculo del flujo | OK |
| F-024 | RF-11 | Planilla: registro, periodo único y corrección auditada | OK |
| F-025 | RF-10 | Activo fijo: registro, actualización, baja y valorización | OK |
| F-026 | RF-12,RF-13,RF-14 | Solicitud: elegibilidad, confirmación y reserva | OK |
| F-027 | RF-13,RF-15 | Solicitud: cancelar y liberar reserva | OK |
| F-028 | RF-12,RF-15 | Solicitud: confirmar, despachar y entregar sin duplicados | OK |
| F-029 | RF-13 | Solicitud sin existencias: rechaza confirmación | OK |
| F-030 | RF-16 | Auditoría: trazabilidad real de las nuevas operaciones | OK |
| F-CON-001 | RF-06,RF-07,RNF-06 | Dos despachos simultáneos: solo uno se confirma | OK |
| F-CON-002 | RF-13,RNF-06 | Doble confirmación concurrente: una única reserva | OK |


**Nota:** Las escrituras quedan almacenadas en Oracle; no hay limpieza destructiva.
