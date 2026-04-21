# Test Script for FTP Backup (Windows)
# This script backs up the DynamoDB local database and uploads it to FTP

$ErrorActionPreference = "Stop"

# --- CONFIGURATION ---
$DB_SOURCE = "c:\stuff\dynamodb_local\shared-local-instance.db"
$BACKUP_DIR = "c:\stuff\backups"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmm"
$BACKUP_NAME = "dynamodb_backup_$TIMESTAMP.zip"
$TEMP_COPY = Join-Path $BACKUP_DIR "shared-local-instance.db"
$ZIP_PATH = Join-Path $BACKUP_DIR $BACKUP_NAME

# FTP Settings
$FTP_HOST = "ftp.livedrive.com"
$FTP_USER = "vespinoza@una.cl"
$FTP_PASS = "Soporte_una18"
$FTP_URL = "ftp://$FTP_HOST/$BACKUP_NAME"

Write-Host "============================" -ForegroundColor Cyan
Write-Host "  STARTING FTP BACKUP TEST  " -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

# 1. Create backup directory if it doesn't exist
if (!(Test-Path $BACKUP_DIR)) {
    Write-Host "Creating backup directory: $BACKUP_DIR" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
}

# 2. Copy the database file (Copy-Item is safer while the file might be in use)
Write-Host "Step 1: Copying database file..." -ForegroundColor Cyan
Copy-Item -Path $DB_SOURCE -Destination $TEMP_COPY -Force

# 3. Compress the file
Write-Host "Step 2: Compressing backup..." -ForegroundColor Cyan
if (Test-Path $ZIP_PATH) { Remove-Item $ZIP_PATH -Force }
# Compress only the copied file, not the whole directory to avoid recursive issues
Compress-Archive -Path $TEMP_COPY -DestinationPath $ZIP_PATH

# 4. Upload to FTP using curl
Write-Host "Step 3: Uploading to FTP ($FTP_HOST)..." -ForegroundColor Cyan
# Using -u for credentials to handle special characters in password
# -T specifies the file to upload
& curl.exe --fail -u "$($FTP_USER):$($FTP_PASS)" -T "$ZIP_PATH" "$FTP_URL"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Upload successful!" -ForegroundColor Green
}
else {
    Write-Host "FTP Upload failed (Exit Code: $LASTEXITCODE). Please check credentials or host availability." -ForegroundColor Red
}

# 5. Cleanup temporary copy (keeping the zip in the Backups folder as requested)
Write-Host "Step 4: Cleaning up temporary files..." -ForegroundColor Cyan
if (Test-Path $TEMP_COPY) { Remove-Item $TEMP_COPY }

Write-Host ""
Write-Host "Process completed successfully." -ForegroundColor Green
Write-Host "Backup saved locally at: $ZIP_PATH"
Write-Host "Backup uploaded to FTP as: $BACKUP_NAME"
