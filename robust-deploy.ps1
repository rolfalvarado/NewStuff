# Robust Deployment Script for Next.js on EC2
# Implements: Local Build -> Secure Upload -> Zero-Downtime Reload -> Health Check

$ErrorActionPreference = "Stop"

# --- Configuration ---
$SERVER_KEY = "C:\llave\linuxdesa02.pem"
$SERVER_USER = "ubuntu"
$SERVER_IP = "ec2-44-212-189-160.compute-1.amazonaws.com"
$SERVER_HOST = "$SERVER_USER@$SERVER_IP"
$REMOTE_DIR = "/home/ubuntu"
$APP_DIR = "stuff" # Assuming the app lives in 'stuff' or similar, but the previous script just deployed to root. 
# Based on previous script, it seems to deploy to root files or expects them in a specific structure. 
# The previous script unzipped to `deploy-package` and then `mv deploy-package/* .`. 
# This implies the app runs from the home directory `~`. This is messy but we must respect it or clean it up.
# Safer approach: Deploy to `~/app` and update PM2 to point there. 
# BUT, changing paths might break existing absolute paths. 
# Let's stick to the current behavior but make it safer:
# 1. Upload to `~/deploy-staging`
# 2. Copy files selectively to `~/` (or wherever they live)
# 3. Reload.

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ROBUST DEPLOYMENT v1.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------
# 1. LOCAL BUILD
# ------------------------------------------------------------------
Write-Host "1. Building Project..." -ForegroundColor Cyan

# Clean previous build artifacts
if (Test-Path ".next") { Remove-Item ".next" -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path "deploy-package") { Remove-Item "deploy-package" -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path "deploy-package.zip") { Remove-Item "deploy-package.zip" -Force -ErrorAction SilentlyContinue }

# Run Build
Write-Host "   Running 'npm run build'..." -ForegroundColor Gray
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed! Fix errors before deploying."; exit 1 }

# ------------------------------------------------------------------
# 2. PACKAGE
# ------------------------------------------------------------------
Write-Host "2. Packaging..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "deploy-package" | Out-Null

# Copy essential files
$filesToCopy = @(".next", "public", "package.json", "package-lock.json", "next.config.js", "pm2.config.js", "scripts", "dynamodb_local", "requirements.txt")
foreach ($item in $filesToCopy) {
    if (Test-Path $item) {
        Copy-Item $item -Destination "deploy-package\$item" -Recurse
    }
}

# Clean unnecessary files from package
# Remove local database file if it exists in the copy to avoid overwriting production data logic
if (Test-Path "deploy-package\dynamodb_local\shared-local-instance.db") {
    Remove-Item "deploy-package\dynamodb_local\shared-local-instance.db" -Force
}

# Compress
# Compress using Node.js script to ensure correct path separators (Forward Slashes)
# Compress-Archive on Windows uses Backslashes which fails on Linux unzip
Write-Host "   Zipping with Node.js..." -ForegroundColor Gray
node scripts/zip-deploy.js
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Zipping failed!"
    exit 1 
}

# ------------------------------------------------------------------
# 3. UPLOAD
# ------------------------------------------------------------------
Write-Host "3. Uploading to EC2..." -ForegroundColor Yellow
$scpCommand = "scp -i $SERVER_KEY deploy-package.zip ${SERVER_HOST}:${REMOTE_DIR}/deploy-package.zip"
Invoke-Expression $scpCommand
if ($LASTEXITCODE -ne 0) { Write-Error "Upload failed!"; exit 1 }

# ------------------------------------------------------------------
# 4. REMOTE DEPLOY & RELOAD
# ------------------------------------------------------------------
Write-Host "4. Deploying on Server..." -ForegroundColor Yellow

$remoteScript = @'
set -e

echo "[REMOTE] 1. Preparing staging area..."
sudo apt-get update && sudo apt-get install -y zip
sudo rm -rf ~/deploy-staging
mkdir -p ~/deploy-staging
cd ~/deploy-staging
unzip -q -o ~/deploy-package.zip

echo "[REMOTE] 2. Installing dependencies..."
npm ci --omit=dev --no-audit

echo "[REMOTE] 3. Copying files to app directory..."
# Copy specific directories/files to home, excluding the database file
cp -r .next ~/
cp -r public ~/
cp -r scripts ~/
cp -r dynamodb_local ~/  2>/dev/null || true
cp package.json ~/
cp package-lock.json ~/
cp next.config.js ~/
cp pm2.config.js ~/

# Move node_modules (faster than copy)
echo "[REMOTE] Moving node_modules..."
rm -rf ~/node_modules
mv node_modules ~/

# Preserve the production database
if [ -f ~/dynamodb_local/shared-local-instance.db ]; then
    echo "Database preserved."
fi

echo "[REMOTE] 4. Reloading PM2 (Zero Downtime)..."
cd ~
pm2 startOrReload pm2.config.js --update-env
pm2 save

echo "[REMOTE] 5. Cleaning up..."
rm ~/deploy-package.zip
rm -rf ~/deploy-staging

echo "[REMOTE] Deployment complete!"
'@

# Execute Remote Script
# We send the script as a here-string to ssh to avoid quoting hell
$remoteScript = $remoteScript -replace "`r`n", "`n"
$remoteScriptBytes = [System.Text.Encoding]::UTF8.GetBytes($remoteScript)
$remoteScriptBase64 = [Convert]::ToBase64String($remoteScriptBytes)
# We decode and run on the other side
$sshCmd = "echo '$remoteScriptBase64' | base64 --decode | bash"
ssh -i $SERVER_KEY $SERVER_HOST $sshCmd

if ($LASTEXITCODE -ne 0) { 
    Write-Error "Remote deployment command failed!"
    exit 1 
}

# ------------------------------------------------------------------
# 5. VERIFICATION
# ------------------------------------------------------------------
Write-Host "5. Verifying Health..." -ForegroundColor Magenta

# Check endpoints for 200 OK
# We check internal localhost on the server to bypass any external firewall issues for the check itself
$healthCheckScript = @'
#!/bin/bash
echo "Checking Next.js (Port 3000)..."
http_code_app=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)

echo "Checking DynamoDB (Port 8000)..."
http_code_db=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000 2>/dev/null || echo "000")

if [ "$http_code_app" == "200" ] || [ "$http_code_app" == "307" ]; then
    echo "✅ App is responding (HTTP $http_code_app)"
else
    echo "❌ App failed check (HTTP $http_code_app)"
    exit 1
fi

# DynamoDB check is a bit looser as it's a database
if [ "$http_code_db" != "000" ]; then
     echo "✅ DynamoDB is reachable (HTTP $http_code_db)"
else
     echo "❌ DynamoDB unreachable"
     exit 1
fi

echo "Checking PM2 Status..."
pm2 list
'@

# Encode script to base64 to avoid shell escaping issues
$healthCheckScript = $healthCheckScript -replace "`r`n", "`n"
$healthCheckBytes = [System.Text.Encoding]::UTF8.GetBytes($healthCheckScript)
$healthCheckBase64 = [Convert]::ToBase64String($healthCheckBytes)
ssh -i $SERVER_KEY $SERVER_HOST "echo '$healthCheckBase64' | base64 --decode | bash"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS: Deployment Verified & Live!" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "WARNING: Health checks failed. Check server logs." -ForegroundColor Red
    Write-Host "You may need to run 'pm2 logs' on the server."
}
