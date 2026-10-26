# Verificacion de SOLO LECTURA del modulo de auditoria. No modifica Oracle XE.
# Ejecutar desde la carpeta SIGFAR_Backend.
# Uso: .\ejemplos\prueba-auditoria-lectura.ps1
param(
  [string]$BaseUrl = 'http://127.0.0.1:3000/api/v1',
  [string]$Correo = 'admin@sigfar.test'
)
$ErrorActionPreference = 'Stop'
$claveSegura = Read-Host "Contrasena de $Correo" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($claveSegura)
try { $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
try {
  $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType 'application/json' `
    -Body (@{ correo = $Correo; clave = $clave } | ConvertTo-Json)
} finally { $clave = $null }
$headers = @{ Authorization = "Bearer $($login.token)" }

Write-Host "`n=== Auditoria: primeros 10 registros (mas recientes) ===" -ForegroundColor Cyan
$lista = Invoke-RestMethod -Method Get -Uri "$BaseUrl/auditoria/registros?limite=10&desde=0" -Headers $headers
$lista.datos | Select-Object id_auditoria, entidad, accion, sucursal, usuario, fecha_evento | Format-Table -AutoSize
Write-Host "Total de registros: $($lista.total)" -ForegroundColor Green

Write-Host "`n=== Resumen centralizado ===" -ForegroundColor Cyan
$resumen = (Invoke-RestMethod -Method Get -Uri "$BaseUrl/auditoria/resumen" -Headers $headers).datos
Write-Host "Total: $($resumen.total)" -ForegroundColor Green
$resumen.por_entidad | Format-Table entidad, cantidad
$resumen.por_sucursal | Format-Table id_sucursal, sucursal, cantidad

Write-Host "`n=== Filtro de transferencias ===" -ForegroundColor Cyan
(Invoke-RestMethod -Method Get -Uri "$BaseUrl/auditoria/registros?entidad=TRANSFERENCIA&limite=10" -Headers $headers).datos |
  Select-Object id_auditoria, id_registro, accion, fecha_evento | Format-Table

if ($lista.datos.Count -gt 0) {
  $id = $lista.datos[0].id_auditoria
  Write-Host "`n=== Detalle del registro $id ===" -ForegroundColor Cyan
  (Invoke-RestMethod -Method Get -Uri "$BaseUrl/auditoria/registros/$id" -Headers $headers).datos |
    Format-List id_auditoria, entidad, accion, id_registro, usuario, sucursal, fecha_evento, datos_anteriores, datos_nuevos
}
Write-Host "`nPrueba finalizada. No se modificaron datos." -ForegroundColor Green
