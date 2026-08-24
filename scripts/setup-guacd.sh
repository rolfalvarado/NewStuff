#!/bin/bash
# ========================================================
# Setup script for guacd (Apache Guacamole proxy daemon)
# Run this on the EC2 instance where the app is deployed
# ========================================================

set -e

echo "=== Guacamole guacd Setup ==="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker..."
    
    # Install Docker on Amazon Linux 2 / Ubuntu
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            amzn)
                sudo yum update -y
                sudo yum install -y docker
                sudo systemctl enable docker
                sudo systemctl start docker
                sudo usermod -aG docker $USER
                ;;
            ubuntu|debian)
                sudo apt-get update
                sudo apt-get install -y docker.io
                sudo systemctl enable docker
                sudo systemctl start docker
                sudo usermod -aG docker $USER
                ;;
            *)
                echo "Unsupported OS: $ID. Please install Docker manually."
                exit 1
                ;;
        esac
    fi
    
    echo "Docker installed successfully."
else
    echo "✅ Docker is already installed: $(docker --version)"
fi

# Stop and remove existing guacd container if it exists
if docker ps -a --format '{{.Names}}' | grep -q '^guacd$'; then
    echo "Stopping existing guacd container..."
    docker stop guacd 2>/dev/null || true
    docker rm guacd 2>/dev/null || true
fi

# Pull the latest guacd image
echo ""
echo "Pulling guacamole/guacd image..."
docker pull guacamole/guacd:latest

# Run guacd container
echo ""
echo "Starting guacd container..."
docker run -d \
    --name guacd \
    --restart unless-stopped \
    -p 127.0.0.1:4822:4822 \
    guacamole/guacd:latest

echo ""
echo "=== Verifying guacd ==="
sleep 2

if docker ps --format '{{.Names}}' | grep -q '^guacd$'; then
    echo "✅ guacd is running!"
    echo ""
    docker ps --filter name=guacd --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "guacd is listening on 127.0.0.1:4822 (localhost only)"
else
    echo "❌ guacd failed to start. Check logs:"
    docker logs guacd
    exit 1
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Make sure ports 3389 are accessible to/from this server to the Windows servers"
echo "  2. Start the guacamole-ws PM2 service: pm2 start pm2.config.js --only guacamole-ws"
echo "  3. If using HTTPS, configure your reverse proxy (Nginx) to proxy WebSocket on port 8081"
echo ""
echo "Nginx config example:"
echo "  location /guacamole-ws {"
echo "      proxy_pass http://127.0.0.1:8081;"
echo "      proxy_http_version 1.1;"
echo "      proxy_set_header Upgrade \$http_upgrade;"
echo "      proxy_set_header Connection \"upgrade\";"
echo "      proxy_set_header Host \$host;"
echo "      proxy_read_timeout 86400;"
echo "  }"
