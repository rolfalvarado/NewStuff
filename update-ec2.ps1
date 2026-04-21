# update-ec2.ps1
# Script para desplegar cambios de Next.js al servidor EC2 sin tocar la base de datos

$EC2_USER = "ubuntu"
$EC2_HOST = "ec2-44-212-189-160.compute-1.amazonaws.com"
$PEM_KEY = "C:\llave\linuxdesa02.pem"
$REMOTE_PATH = "/home/ubuntu/deploy-package"
$LOCAL_STUFF = "C:\stuff"
$ZIP_NAME = "update-files.zip"

Write-Host "--- Iniciando Despliegue a EC2 ---" -ForegroundColor Cyan

# 1. Limpieza y Build Local
Write-Host "[1/4] Limpiando carpetas y generando build de Next.js..." -ForegroundColor Yellow
Set-Location $LOCAL_STUFF

# Forzamos limpieza de .next local para asegurar que tome los cambios del TSX
if (Test-Path ".next") { Remove-Item ".next" -Recurse -Force }

npm run build
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Error en el build de Next.js. El despliegue se ha cancelado."
    exit $LASTEXITCODE 
}

# 2. Preparar el paquete ZIP
Write-Host "[2/4] Preparando paquete de actualización..." -ForegroundColor Yellow
if (Test-Path $ZIP_NAME) { Remove-Item $ZIP_NAME -Force }

$TEMP_DEPLOY = "C:\stuff\temp_deploy"
if (Test-Path $TEMP_DEPLOY) { Remove-Item $TEMP_DEPLOY -Recurse -Force }
New-Item -Path $TEMP_DEPLOY -ItemType Directory | Out-Null

Write-Host "Copiando archivos de build..." -ForegroundColor Gray
# Copia completa de .next (esencial para que se vean los cambios)
Copy-Item ".next" $TEMP_DEPLOY -Recurse -Force
Copy-Item "public" $TEMP_DEPLOY -Recurse -Force
Copy-Item "scripts" $TEMP_DEPLOY -Recurse -Force
Copy-Item "next.config.js" $TEMP_DEPLOY -Force
Copy-Item "package.json" $TEMP_DEPLOY -Force
Copy-Item "pm2.config.js" $TEMP_DEPLOY -Force

Write-Host "Comprimiendo..." -ForegroundColor Gray
Compress-Archive -Path "$TEMP_DEPLOY\*" -DestinationPath $ZIP_NAME -Force
Remove-Item $TEMP_DEPLOY -Recurse -Force

# 3. Subir el ZIP al servidor
Write-Host "[3/4] Subiendo archivos al servidor EC2..." -ForegroundColor Yellow
scp -i $PEM_KEY -o StrictHostKeyChecking=no $ZIP_NAME "$($EC2_USER)@$($EC2_HOST):$REMOTE_PATH/"
if ($LASTEXITCODE -ne 0) { Write-Error "Error al subir el archivo via SCP."; exit 1 }

# 4. Comandos Remotos: Limpieza Profunda y Reinicio
Write-Host "[4/4] Aplicando cambios en servidor remoto..." -ForegroundColor Yellow
$SSH_COMMANDS = @"
cd $REMOTE_PATH
# Detenemos para liberar archivos
pm2 stop next-app
# Borramos .next antiguo para asegurar el cambio
rm -rf .next
unzip -o $ZIP_NAME
rm $ZIP_NAME
# Reiniciamos la app
pm2 start next-app
"@

ssh -i $PEM_KEY -o StrictHostKeyChecking=no "$($EC2_USER)@$($EC2_HOST)" $SSH_COMMANDS

Write-Host "✅ ¡Despliegue completado con éxito!" -ForegroundColor Green
Write-Host "Sitio en vivo: http://$EC2_HOST:3000" -ForegroundColor Cyan
