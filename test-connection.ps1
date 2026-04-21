# Script de diagnóstico de conexión
# Ejecutar desde el otro computador

$serverIP = "192.168.100.2"
$port = 3000

Write-Host "=== Diagnóstico de Conexión ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Ping
Write-Host "1. Probando conectividad básica (ping)..." -ForegroundColor Yellow
try {
    $pingResult = Test-Connection -ComputerName $serverIP -Count 2 -Quiet
    if ($pingResult) {
        Write-Host "   ✓ Ping exitoso" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Ping falló" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Error en ping: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Puerto TCP
Write-Host "2. Probando conexión al puerto $port..." -ForegroundColor Yellow
try {
    $tcpTest = Test-NetConnection -ComputerName $serverIP -Port $port -WarningAction SilentlyContinue
    if ($tcpTest.TcpTestSucceeded) {
        Write-Host "   ✓ Puerto $port accesible" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Puerto $port NO accesible" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Error probando puerto: $_" -ForegroundColor Red
}

Write-Host ""

# Test 3: HTTP Request
Write-Host "3. Probando solicitud HTTP..." -ForegroundColor Yellow
try {
    $url = "http://${serverIP}:${port}"
    $response = Invoke-WebRequest -Uri $url -TimeoutSec 5 -UseBasicParsing
    Write-Host "   ✓ HTTP exitoso - Código: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ HTTP falló: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Fin del diagnóstico ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Si el puerto es accesible pero HTTP falla, intenta abrir en el navegador:" -ForegroundColor White
Write-Host "http://${serverIP}:${port}" -ForegroundColor Cyan
