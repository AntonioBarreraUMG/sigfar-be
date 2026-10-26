# MODIFICA Oracle XE. Requiere -ConfirmarCambios.
# Crea dos solicitudes ficticias. La primera se confirma/cancela (libera reserva),
# y la segunda se confirma/despacha/entrega (descuenta una unidad).
# Usuario coordinador de entregas para registros y encargado de Guatemala para despacho.
param(
  [switch]$ConfirmarCambios,
  [string]$BaseUrl = 'http://127.0.0.1:3000/api/v1',
  [string]$CorreoCoord = 'entregas@sigfar.test',
  [string]$CorreoEncargado = 'guatemala@sigfar.test'
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmarCambios) { throw 'La prueba modifica datos. Ejecuta con -ConfirmarCambios si deseas continuar.' }

function Login($correo) {
  $clave = Read-Host "Contrasena de $correo" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave)
  try { $texto = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  try {
    $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType 'application/json' `
      -Body (@{ correo=$correo; clave=$texto } | ConvertTo-Json)
  } finally { $texto = $null }
  return @{ Authorization = "Bearer $($login.token)" }
}
function JsonPost($path, $header, $body) {
  if ($null -eq $body) { $json = '{}' } else { $json = ($body | ConvertTo-Json -Depth 8 -Compress) }
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/$path" -Headers $header -ContentType 'application/json' -Body $json
}

$hCoord = Login $CorreoCoord
$hEncargado = Login $CorreoEncargado
$payload = @{
  cliente_nombre = 'Cliente Ficticio Test v1.3'; cliente_telefono = '5550-9898';
  departamento_entrega = 'Guatemala'; municipio_entrega = 'Guatemala';
  direccion_entrega = 'Direccion ficticia para pruebas de SIGFAR';
  detalles = @(@{ id_medicamento = 1; cantidad = 1 })
}

Write-Host "`n1. Confirmar y cancelar una solicitud (reserva liberada)" -ForegroundColor Cyan
$solicitudCancelacion = (JsonPost 'solicitudes' $hCoord $payload).datos.id_solicitud
JsonPost "solicitudes/$solicitudCancelacion/confirmar" $hCoord @{ id_sucursal = 1; forma_pago = 'EFECTIVO' } | Out-Null
$cancelada = (JsonPost "solicitudes/$solicitudCancelacion/cancelar" $hCoord $null).datos
if ($cancelada.estado -ne 'CANCELADA' -or $cancelada.detalles[0].estado_reserva -ne 'LIBERADA') {
  throw 'No se verifico la cancelacion y liberacion de reserva.'
}
Write-Host "Solicitud ${solicitudCancelacion}: CANCELADA, reserva LIBERADA." -ForegroundColor Green

Write-Host "`n2. Confirmar, despachar y entregar (una unidad consumida)" -ForegroundColor Cyan
$solicitudEntrega = (JsonPost 'solicitudes' $hCoord $payload).datos.id_solicitud
$opc = (Invoke-RestMethod -Method Get -Uri "$BaseUrl/solicitudes/$solicitudEntrega/opciones" -Headers $hCoord).datos.opciones
if (-not ($opc | Where-Object { $_.id_sucursal -eq 1 })) { throw 'Guatemala ya no tiene disponibilidad suficiente.' }
JsonPost "solicitudes/$solicitudEntrega/confirmar" $hCoord @{ id_sucursal = 1; forma_pago = 'TARJETA' } | Out-Null
$despachada = (JsonPost "solicitudes/$solicitudEntrega/despachar" $hEncargado $null).datos
if ($despachada.estado -ne 'DESPACHADA' -or $despachada.detalles[0].estado_reserva -ne 'CONSUMIDA') {
  throw 'No se verifico el despacho y consumo de reserva.'
}
$final = (JsonPost "solicitudes/$solicitudEntrega/entregar" $hCoord $null).datos
if ($final.estado -ne 'ENTREGADA') { throw 'No se verifico el cierre de la entrega.' }
Write-Host "Solicitud ${solicitudEntrega}: ENTREGADA. Una unidad descontada." -ForegroundColor Green
Write-Host "`nNOTA: Los cambios permanecen en Oracle. Ejecuta verificar-entregas-dbeaver.sql." -ForegroundColor Yellow
