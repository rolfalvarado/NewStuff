#!/bin/bash
# SSL Setup Script for newstuff.unabase.com
# Run this on the EC2 server to install Let's Encrypt certificates

set -e

DOMAIN="newstuff.unabase.com"
EMAIL="admin@unabase.com"  # Change this to your email

echo "=========================================="
echo "  SSL Certificate Installation"
echo "=========================================="

# 1. Install Certbot
echo "[1/5] Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
else
    echo "Certbot already installed."
fi

# 2. Create webroot directory for ACME challenge
echo "[2/5] Creating ACME challenge directory..."
sudo mkdir -p /var/www/html/.well-known/acme-challenge
sudo chown -R www-data:www-data /var/www/html

# 3. Get certificate (standalone mode first, then switch to nginx)
echo "[3/5] Obtaining SSL certificate..."

# Stop nginx temporarily for standalone verification
sudo systemctl stop nginx || true

# Get the certificate
sudo certbot certonly --standalone \
    -d $DOMAIN \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    --no-eff-email

# 4. Update Nginx config
echo "[4/5] Updating Nginx configuration..."
sudo cp scripts/nginx-app.conf /etc/nginx/sites-available/default

# Test nginx config
if sudo nginx -t; then
    echo "Nginx configuration is valid."
else
    echo "ERROR: Nginx configuration is invalid!"
    exit 1
fi

# Restart nginx
sudo systemctl start nginx
sudo systemctl reload nginx

# 5. Setup auto-renewal
echo "[5/5] Setting up auto-renewal..."
if ! sudo crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (sudo crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sudo crontab -
    echo "Auto-renewal cron job added."
else
    echo "Auto-renewal already configured."
fi

echo ""
echo "=========================================="
echo "  SSL Installation Complete!"
echo "=========================================="
echo ""
echo "Your site should now be accessible at:"
echo "  https://$DOMAIN"
echo ""
echo "Certificate will auto-renew before expiry."
echo ""
