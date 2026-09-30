$api = "http://localhost:3000/dev"

# Ejecuta una llamada HTTP e imprime la respuesta como JSON.
# Si el servidor responde 4xx/5xx, imprime el codigo y el mensaje de error.
function Llamar($metodo, $url, $body) {
  $p = @{ Method = $metodo; Uri = $url }
  if ($body) { $p.ContentType = 'application/json'; $p.Body = $body }
  try {
    Invoke-RestMethod @p | ConvertTo-Json -Compress
  } catch {
    "ERROR " + $_.Exception.Response.StatusCode.value__ + ": " + $_.ErrorDetails.Message
  }
}

# Ejecuta una consulta SQL dentro del contenedor
function Sql($q) {
  docker exec cupo-db psql -U cupo -d cupo_vehicular -c $q
}

Write-Host "== 0. Base limpia =="
docker compose down -v
docker compose up -d
Start-Sleep -Seconds 12

Write-Host ""
Write-Host "== 1. Crear, actualizar cupo y acreditar =="
Llamar Post "$api/colaboradores" '{"cedula":"0912345678","cupoMensual":200}'
Llamar Post "$api/colaboradores" '{"cedula":"0923456789","cupoMensual":300}'
Llamar Put  "$api/colaboradores/0912345678/cupo" '{"cupoMensual":250}'
Llamar Post "$api/colaboradores/0912345678/acreditar"
Llamar Post "$api/colaboradores/0923456789/acreditar"

Write-Host ""
Write-Host "== 2. Sincronizar GasClub (dos veces) =="
Write-Host "Esperado 1.a vez: importados=4, ignoradosSinColaborador=6"
Llamar Post "$api/sincronizar/gasclub"
Write-Host "Esperado 2.a vez: importados=0"
Llamar Post "$api/sincronizar/gasclub"

Write-Host ""
Write-Host "== 3. Registrar factura, aprobar a mano, sincronizar =="
Write-Host "Esperado: 201, id 11, saldo 144.50"
Llamar Post "$api/facturas" '{"cedula":"0912345678","numeroFactura":"001-001-000000999","rucProveedor":"1790012345001","total":50}'
Sql "UPDATE sgr_facturas SET estado = 'Aprobado' WHERE id = 11;"
Write-Host "Esperado 1.a vez: importadas=5, actualizadas=1"
Llamar Post "$api/sincronizar/facturas"
Write-Host "Esperado 2.a vez: importadas=0, actualizadas=0"
Llamar Post "$api/sincronizar/facturas"

Write-Host ""
Write-Host "== 4. Casos negativos =="
Write-Host "Esperado 409 (factura duplicada)"
Llamar Post "$api/facturas" '{"cedula":"0912345678","numeroFactura":"001-001-000000999","rucProveedor":"1790012345001","total":10}'
Write-Host "Esperado 422 (saldo insuficiente)"
Llamar Post "$api/facturas" '{"cedula":"0912345678","numeroFactura":"001-001-000001000","rucProveedor":"1790012345001","total":1000}'
Write-Host "Esperado 404 (colaborador inexistente)"
Llamar Post "$api/facturas" '{"cedula":"0999999999","numeroFactura":"001-001-000001001","rucProveedor":"1790012345001","total":10}'
Write-Host "Esperado 400 (cedula invalida)"
Llamar Post "$api/colaboradores" '{"cedula":"123","cupoMensual":100}'
Write-Host "Esperado 409 (colaborador duplicado)"
Llamar Post "$api/colaboradores" '{"cedula":"0912345678","cupoMensual":100}'

Write-Host ""
Write-Host "== Saldos finales (esperado: 0912345678 = -81.00, 0923456789 = 92.75) =="
Sql "SELECT cedula, SUM(CASE WHEN tipo='ACREDITACION' THEN monto ELSE -monto END) AS saldo FROM movimientos GROUP BY cedula ORDER BY cedula;"