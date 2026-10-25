# Esta prueba modifica la base de datos REAL del usuario SIGFAR (no la elimina).
# Ejecutar SOLO con -ConfirmarCambios, en el entorno academico y tras realizar respaldo.
param(
  [switch]$ConfirmarCambios,
  [string]$ApiBase = 'http://127.0.0.1:3000/api/v1'
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmarCambios) {
  Write-Host 'NO se modificaron datos. Para ejecutar: .\ejemplos\prueba-transferencias.ps1 -ConfirmarCambios'
  exit 1
}
function Login([string]$Correo) {
  $body = @{ correo = $Correo; clave = 'Demo2026!' } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$ApiBase/auth/login" -ContentType 'application/json' -Body $body
  return @{ Authorization = "Bearer $($login.token)" }
}
function Inventario([hashtable]$Header, [int]$Sucursal, [int]$Medicamento) {
  $url = "$ApiBase/inventarios?id_sucursal=$Sucursal&id_medicamento=$Medicamento"
  $result = Invoke-RestMethod -Uri $url -Headers $Header
  $rows = @($result.datos)
  if ($rows.Count -eq 0 -or $null -eq $rows[0]) { return 0 }
  return [int]$rows[0].cantidad_existente
}

$hOrigen = Login 'guatemala@sigfar.test'
$hDestino = Login 'quetzaltenango@sigfar.test'
$origen = (Invoke-RestMethod -Uri "$ApiBase/auth/me" -Headers $hOrigen).usuario.id_sucursal
$destino = (Invoke-RestMethod -Uri "$ApiBase/auth/me" -Headers $hDestino).usuario.id_sucursal
if (-not $origen -or -not $destino -or $origen -eq $destino) { throw 'No hay dos sucursales validas para las cuentas demo.' }
$stocks = (Invoke-RestMethod -Uri "$ApiBase/inventarios?id_sucursal=$origen" -Headers $hOrigen).datos
$elegible = $stocks | Where-Object { $_.cantidad_disponible -ge 1 } | Select-Object -First 1
if (-not $elegible) { throw 'Origen no tiene medicamentos disponibles para la prueba.' }
$med = [int]$elegible.id_medicamento
$antesOrigen = Inventario $hOrigen $origen $med
$antesDestino = Inventario $hDestino $destino $med

Write-Host "Transferencia academica de 1 unidad: sucursal $origen -> $destino, medicamento $med"
$payload = @{
  id_sucursal_origen = [int]$origen
  id_sucursal_destino = [int]$destino
  detalles = @(@{ id_medicamento = $med; cantidad = 1 })
} | ConvertTo-Json -Depth 6
$nueva = Invoke-RestMethod -Method Post -Uri "$ApiBase/transferencias" -Headers $hOrigen -ContentType 'application/json' -Body $payload
$id = $nueva.datos.id_transferencia
if ($nueva.datos.estado -ne 'REGISTRADA') { throw 'Error: no quedo REGISTRADA.' }
if ((Inventario $hOrigen $origen $med) -ne $antesOrigen) { throw 'Registrar altero existencias.' }

$despacho = Invoke-RestMethod -Method Post -Uri "$ApiBase/transferencias/$id/despachar" -Headers $hOrigen
if ($despacho.datos.estado -ne 'EN_TRANSITO') { throw 'Error: no quedo EN_TRANSITO.' }
if ((Inventario $hOrigen $origen $med) -ne ($antesOrigen - 1)) { throw 'Despacho no desconto una unidad.' }
if ((Inventario $hDestino $destino $med) -ne $antesDestino) { throw 'Destino aumento antes de la recepcion.' }

$recepcion = Invoke-RestMethod -Method Post -Uri "$ApiBase/transferencias/$id/recibir" -Headers $hDestino
if ($recepcion.datos.estado -ne 'RECIBIDA') { throw 'Error: no quedo RECIBIDA.' }
if ((Inventario $hDestino $destino $med) -ne ($antesDestino + 1)) { throw 'Recepcion no incremento una unidad.' }

$rechazoDuplicado = $false
try { $null = Invoke-RestMethod -Method Post -Uri "$ApiBase/transferencias/$id/recibir" -Headers $hDestino }
catch {
  if ([int]$_.Exception.Response.StatusCode -eq 409) { $rechazoDuplicado = $true }
  else { throw }
}
if (-not $rechazoDuplicado) { throw 'Recepcion repetida no fue rechazada con HTTP 409.' }
if ((Inventario $hDestino $destino $med) -ne ($antesDestino + 1)) { throw 'Recepcion duplicada cambio el stock.' }

Write-Host "OK: transferencia $id REGISTRADA -> EN_TRANSITO -> RECIBIDA"
Write-Host 'OK: sin cambio al registrar; origen -1 al despachar; destino +1 al recibir; segunda recepcion 409.'
Write-Host "La prueba AGREGO una transferencia real de demostracion con ID $id; no repetir innecesariamente."
