#!/bin/bash

# Taipei City Dashboard - Robust Mac Setup Script
set -e

echo "🚀 Starting optimized setup for Taipei City Dashboard..."

# 1. Environment variables setup
if [ ! -f "docker/.env" ]; then
    echo "📄 Creating docker/.env from template..."
    cp docker/.env.template docker/.env
fi

# 2. Inject user credentials and set defaults
echo "🔑 Configuring environment variables..."
# Use | as delimiter for sed to avoid issues with tokens containing /
MAPBOX_TOKEN="YOUR_SK_MAPBOX_TOKEN"
TWCC_KEY="YOUR_TWCC_API_KEY"

# Set Mapbox
sed -i '' "s|^VITE_MAPBOXTOKEN=.*|VITE_MAPBOXTOKEN=$MAPBOX_TOKEN|" docker/.env
# Set TWCC
sed -i '' "s|^TWCC_API_KEY=.*|TWCC_API_KEY=$TWCC_KEY|" docker/.env

# Set default passwords if empty
sed -i '' 's|^DB_DASHBOARD_PASSWORD=$|DB_DASHBOARD_PASSWORD=dashboard_pass|' docker/.env
sed -i '' 's|^DB_MANAGER_PASSWORD=$|DB_MANAGER_PASSWORD=manager_pass|' docker/.env
sed -i '' 's|^PGADMIN_DEFAULT_PASSWORD=$|PGADMIN_DEFAULT_PASSWORD=admin_pass|' docker/.env
sed -i '' 's|^PGADMIN_DEFAULT_EMAIL=$|PGADMIN_DEFAULT_EMAIL=admin@example.com|' docker/.env

echo "✅ Environment configured."

# 3. Handle Docker Network
echo "🌐 Checking Docker network: br_dashboard..."
if ! docker network inspect br_dashboard >/dev/null 2>&1; then
    echo "🏗️ Creating bridge network br_dashboard..."
    docker network create --driver=bridge --subnet=192.168.128.0/24 --gateway=192.168.128.1 br_dashboard
else
    echo "✅ Network br_dashboard already exists."
fi

# 4. Start core services (Databases)
echo "🐳 Starting database services (PostgreSQL, Redis, Qdrant)..."
docker compose -f docker/docker-compose-db.yaml up -d

# 5. Initialize databases
echo "⏳ Waiting for databases to initialize..."
sleep 5

# 6. Check Dependencies
echo "🔍 Checking local development dependencies..."
if command -v go &> /dev/null; then
    echo "✅ Go found. Updating BE modules..."
    (cd Taipei-City-Dashboard-BE && go mod download)
fi

if command -v npm &> /dev/null; then
    echo "✅ npm found. Updating FE modules..."
    (cd Taipei-City-Dashboard-FE && npm install)
fi

echo "✨ Setup complete! Everything is ready."
echo "➡️  Start full app: docker compose -f docker/docker-compose.yaml up -d"
