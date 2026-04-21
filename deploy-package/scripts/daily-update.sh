#!/bin/bash
# Daily Update Script - Calls the Next.js API to run the full update process
# (Logos, User Counts, FTP Backups)
# Scheduled via cron at 8am Chile time (11:00 UTC)

CRON_SECRET="daily-update-secret-key-2026"
APP_URL="http://localhost:3000"
LOG_FILE="/home/ubuntu/backups/daily-update.log"

echo "============================" >> "$LOG_FILE"
echo "  DAILY UPDATE - $(date)" >> "$LOG_FILE"
echo "============================" >> "$LOG_FILE"

# Call the API endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" \
    --max-time 300 \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "${APP_URL}/api/cron/daily-update")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "SUCCESS: $BODY" >> "$LOG_FILE"
else
    echo "FAILED (HTTP $HTTP_CODE): $BODY" >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"
