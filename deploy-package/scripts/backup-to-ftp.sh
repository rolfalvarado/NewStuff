#!/bin/bash
# Backup Script for EC2 (Linux)
# Compresses the DynamoDB local database and uploads it to FTP (Folder: stuff)

# --- CONFIGURATION ---
DB_SOURCE="/home/ubuntu/dynamodb_data/shared-local-instance.db"
BACKUP_DIR="/home/ubuntu/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M")
BACKUP_NAME="dynamodb_prod_$TIMESTAMP.zip"
TEMP_COPY="$BACKUP_DIR/shared-local-instance.db"
ZIP_PATH="$BACKUP_DIR/$BACKUP_NAME"

# FTP Settings
FTP_HOST="ftp.livedrive.com"
FTP_USER="vespinoza@una.cl"
FTP_PASS="Soporte_una18"
FTP_URL="ftp://$FTP_HOST/stuff/$BACKUP_NAME"

echo "============================"
echo "  STARTING EC2 BACKUP PROCESS  "
echo "  $(date)"
echo "============================"

# 1. Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
fi

# 2. Copy the database file (safe copy while in use)
echo "Step 1: Copying database file..."
cp "$DB_SOURCE" "$TEMP_COPY"

# 3. Compress the file
echo "Step 2: Compressing backup..."
# We use zip. If not installed, sudo apt-get install zip
zip -j "$ZIP_PATH" "$TEMP_COPY"

# 4. Upload to FTP using curl
echo "Step 3: Uploading to FTP ($FTP_HOST/stuff)..."
curl --fail -u "$FTP_USER:$FTP_PASS" -T "$ZIP_PATH" "$FTP_URL"

if [ $? -eq 0 ]; then
    echo "Upload successful!"
else
    echo "FTP Upload failed. Please check credentials or folder existence."
    exit 1
fi

# 5. Cleanup temporary files
echo "Step 4: Cleaning up temporary copy..."
rm "$TEMP_COPY"

# Optional: Remove old backups locally (keep last 7 days)
# find "$BACKUP_DIR" -name "dynamodb_prod_*.zip" -mtime +7 -delete

echo "Process completed successfully."
echo "Backup saved locally at: $ZIP_PATH"
echo "Backup uploaded to FTP: stuff/$BACKUP_NAME"
