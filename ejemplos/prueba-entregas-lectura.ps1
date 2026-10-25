# Prueba de SOLO LECTURA. No altera solicitudes ni inventarios.
# Uso: .\ejemplos\prueba-entregas-lectura.ps1
param(
  [string]$BaseUrl = 'http://127.0.0.1:3000/api/v1',
  [string]$Correo = 'entregas@sigfar.test'
)
$ErrorActionPreference = 'Stop'
$clave = Read-Host "Contrasena de $Correo" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave)
try { $texto = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
try {
  $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType 'application/json' `
    -Body (@{ correo=$Correo; clave=$texto } | ConvertTo-Json)
} finally { $texto = $null }
$h = @{ Authorization = "Bearer $($login.token)" }

Write-Host "`n=== Solicitudes registradas ===" -ForegroundColor Cyan
(Invoke-RestMethod -Method Get -Uri "$BaseUrl/solicitudes?limite=10" -Headers $h).datos |
  Select-Object id_solicitud, estado, cliente_nombre, id_sucursal_asignada, tardia | Format-Table

Write-Host "`n=== Opciones para solicitud ficticia 2 ===" -ForegroundColor Cyan
$opciones = Invoke-RestMethod -Method Get -Uri "$BaseUrl/solicitudes/2/opciones" -Headers $h
$opciones.datos.opciones | Format-Table id_sucursal, nombre, tiempo_entrega_min

Write-Host "`n=== Consulta de disponibilidad en Guatemala ===" -ForegroundColor Cyan
$disponibilidad = @{
  departamento_entrega = 'Guatemala'; municipio_entrega = 'Guatemala';
  detalles = @(@{ id_medicamento = 1; cantidad = 1 })
} | ConvertTo-Json -Depth 6
(Invoke-RestMethod -Method Post -Uri "$BaseUrl/solicitudes/disponibilidad" -Headers $h `
  -ContentType 'application/json' -Body $disponibilidad).datos.opciones | Format-Table
Write-Host "`nPrueba de lectura terminada: sin escrituras." -ForegroundColor Green
