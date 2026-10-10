# SIGFAR: pruebas de solo lectura (Windows PowerShell 5.1+ / PowerShell 7+).
# Debes ejecutar npm start en otra terminal. Usa la misma base Oracle de DBeaver.
$base = 'http://127.0.0.1:3000/api/v1'
Write-Host '--- Estado HTTP ---'
Invoke-RestMethod "$base/health" | ConvertTo-Json -Depth 4

$credenciales = @{ correo = 'admin@sigfar.test'; clave = 'Demo2026!' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body $credenciales
$headers = @{ Authorization = "Bearer $($login.token)" }
Write-Host '--- Usuario autenticado ---'
Invoke-RestMethod "$base/auth/me" -Headers $headers | ConvertTo-Json -Depth 4
Write-Host '--- Sucursales ---'
Invoke-RestMethod "$base/sucursales" -Headers $headers | ConvertTo-Json -Depth 5
Write-Host '--- Medicamentos ---'
Invoke-RestMethod "$base/medicamentos" -Headers $headers | ConvertTo-Json -Depth 5
Write-Host '--- Inventario: 12 filas de ejemplo ---'
$inventario = Invoke-RestMethod "$base/inventarios" -Headers $headers
$inventario.datos | Format-Table id_sucursal, id_medicamento, cantidad_existente, cantidad_reservada, cantidad_disponible
Write-Host '--- Movimientos ---'
$movs = Invoke-RestMethod "$base/inventarios/movimientos?limite=5" -Headers $headers
$movs.datos | Format-Table id_movimiento, id_sucursal, id_medicamento, tipo, cantidad
Write-Host 'Listo. No se ha modificado la base de datos.'
