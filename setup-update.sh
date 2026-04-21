#!/bin/bash
echo "Updating Configuration..."

# Install PM2 globally (ensure it's there)
sudo npm install -g pm2

# Setup Nginx
sudo cp scripts/nginx-app.conf /etc/nginx/sites-available/default
sudo systemctl restart nginx

echo "Restaring Application with PM2..."
pm2 delete all || true
pm2 start pm2.config.js
pm2 save
pm2 startup