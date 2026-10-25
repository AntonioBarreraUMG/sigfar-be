# Consulta de solo lectura: no crea ni modifica registros.
# Uso: .\ejemplos\prueba-administracion-lectura.ps1
param(
  [string]$BaseUrl = 'http://127.0.0.1:3000/api/v1',
  [string]$Correo = 'admin@sigfar.test'
)
$ErrorActionPreference = 'Stop'
$clave = Read-Host "Contrasena de $Correo" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave)
try { $textoClave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
try {
  $body = @{ correo=$Correo; clave=$textoClave } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType 'application/json' -Body $body
} finally { $textoClave = $null }
$headers = @{ Authorization = "Bearer $($login.token)" }

Write-Host "`n=== Movimientos de efectivo ===" -ForegroundColor Cyan
(Invoke-RestMethod -Uri "$BaseUrl/efectivo/movimientos?limite=10" -Headers $headers).datos | Format-Table
Write-Host "`n=== Resumen de efectivo (GTQ) ===" -ForegroundColor Cyan
(Invoke-RestMethod -Uri "$BaseUrl/efectivo/resumen" -Headers $headers).totales | Format-List
Write-Host "`n=== Gastos de planilla ===" -ForegroundColor Cyan
(Invoke-RestMethod -Uri "$BaseUrl/planillas?limite=10" -Headers $headers).datos | Format-Table
Write-Host "`n=== Resumen planilla (GTQ) ===" -ForegroundColor Cyan
(Invoke-RestMethod -Uri "$BaseUrl/planillas/resumen" -Headers $headers).totales | Format-List
Write-Host "`n=== Activos fijos ===" -ForegroundColor Cyan
(Invoke-RestMethod -Uri "$BaseUrl/activos?limite=10" -Headers $headers).datos | Format-Table
Write-Host "`n=== Valor de activos vigentes (GTQ) ===" -ForegroundColor Cyan
(Invoke-RestMethod -Uri "$BaseUrl/activos/resumen" -Headers $headers).totales | Format-List
Write-Host "`nConsultas realizadas (no alteraron datos)." -ForegroundColor Green
