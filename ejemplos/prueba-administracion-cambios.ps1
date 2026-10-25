# MODIFICA DATOS DE PRUEBA EN ORACLE XE: NO ejecutar sin -ConfirmarCambios.
# Ejemplo: .\ejemplos\prueba-administracion-cambios.ps1 -ConfirmarCambios -PeriodoPlanilla 2027-01
param(
  [switch]$ConfirmarCambios,
  [string]$PeriodoPlanilla = '2027-01',
  [string]$BaseUrl = 'http://127.0.0.1:3000/api/v1',
  [string]$Correo = 'guatemala@sigfar.test'
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmarCambios) {
  throw 'Esta prueba ESCRIBE en la base de datos. Vuelve a ejecutarla con -ConfirmarCambios sobre datos ficticios.'
}
$clave = Read-Host "Contrasena de $Correo" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave)
try { $textoClave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
try {
  $body = @{ correo=$Correo; clave=$textoClave } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType 'application/json' -Body $body
} finally { $textoClave = $null }
if ($login.usuario.rol -ne 'ENCARGADO') { throw 'Se requiere un usuario con rol ENCARGADO.' }
$idSucursal = [int]$login.usuario.id_sucursal
$headers = @{ Authorization = "Bearer $($login.token)" }
function Enviar([string]$method, [string]$ruta, [object]$obj) {
  $json = $obj | ConvertTo-Json -Depth 5
  return Invoke-RestMethod -Method $method -Uri "$BaseUrl$ruta" -Headers $headers -ContentType 'application/json' -Body $json
}

Write-Host "Sucursal de prueba: $idSucursal" -ForegroundColor Cyan
$efectivo = Enviar 'Post' '/efectivo/movimientos' @{
  id_sucursal=$idSucursal; tipo='INGRESO'; concepto='Prueba academica modulo efectivo'; monto='12.50'
}
Write-Host "Movimiento efectivo ID: $($efectivo.datos.id_movimiento_efectivo)" -ForegroundColor Green

# NOTA: existe restriccion UNIQUE(id_sucursal, periodo).
# Si ya registraste el periodo indicado, cambia -PeriodoPlanilla antes de ejecutar.
$planilla = Enviar 'Post' '/planillas' @{
  id_sucursal=$idSucursal; periodo=$PeriodoPlanilla; monto_total='125.75'
}
$idPlanilla = $planilla.datos.id_gasto_planilla
Write-Host "Planilla ID: $idPlanilla" -ForegroundColor Green
$planillaNueva = Enviar 'Patch' "/planillas/$idPlanilla" @{ monto_total='126.00' }
if ([decimal]$planillaNueva.datos.monto_total -ne [decimal]126) { throw 'No se aplico la correccion de planilla.' }

$codigo = 'ACA-' + ([Guid]::NewGuid().ToString('N').Substring(0,12)).ToUpper()
$activo = Enviar 'Post' '/activos' @{
  id_sucursal=$idSucursal; codigo=$codigo; descripcion='Equipo academico de prueba'; valor='99.99'
}
$idActivo = $activo.datos.id_activo
Write-Host "Activo ID: $idActivo; codigo $codigo" -ForegroundColor Green
$activoBaja = Enviar 'Patch' "/activos/$idActivo" @{ estado='BAJA' }
if ($activoBaja.datos.estado -ne 'BAJA') { throw 'No se aplico el estado BAJA.' }

Write-Host "Prueba de escritura completada. Comprueba la bitacora con verificar-administracion-dbeaver.sql." -ForegroundColor Green
Write-Host 'Advertencia: los registros quedan guardados como datos de demostracion; la prueba no los elimina.' -ForegroundColor Yellow
