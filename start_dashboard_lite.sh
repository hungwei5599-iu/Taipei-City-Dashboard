#!/bin/zsh

# 台北市大數據儀表板啟動腳本 (Lite 版 - 僅開發前後端與儀表板顯示用)
# 不包含 DE (Airflow) 流程，以節省記憶體資源

echo "🚀 Starting Taipei City Dashboard (Lite Mode)..."

# 取得腳本所在的目錄
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 0. 確保網路存在
echo "🌐 Checking Docker network: br_dashboard..."
if ! docker network inspect br_dashboard >/dev/null 2>&1; then
    echo "🏗️ Creating bridge network br_dashboard..."
    docker network create --driver=bridge --subnet=192.168.128.0/24 --gateway=192.168.128.1 br_dashboard
fi

# 1. 確保前端依賴已安裝
if [ ! -x "$SCRIPT_DIR/Taipei-City-Dashboard-FE/node_modules/.bin/vite" ]; then
    echo "📦 Installing frontend dependencies..."
    cd "$SCRIPT_DIR/docker"
    docker compose -f docker-compose-init.yaml run --rm dashboard-fe-init
fi

# 2. 啟動資料庫
echo "📦 Starting Database Stack (Postgres, Redis, Qdrant)..."
cd "$SCRIPT_DIR/docker"
docker compose -f docker-compose-db.yaml up -d

# ---------------------------------------------------------
# 3. 啟動 DE (Airflow) 環境 - [Lite 版已移除]
# echo "🏗️ Starting DE (Airflow) Environment..."
# cd "$SCRIPT_DIR/Taipei-City-Dashboard-DE/docker/develop"
# docker compose up -d
# ---------------------------------------------------------

# 4. 啟動主要 Dashboard Stack
echo "📦 Starting Dashboard Core Stack (Frontend, Backend, Nginx)..."
cd "$SCRIPT_DIR/docker"
# 先強制重新啟動以套用 Nginx 與 Vite 的最新變更
docker compose down dashboard-fe nginx
docker compose up -d
docker compose restart nginx

echo "⏳ Waiting for services to start (10s)..."
sleep 10

# 驗證連線狀態
echo "🔍 Checking status..."
if curl -s -I http://localhost | grep -q "200 OK\|304 Not Modified"; then
    echo "✅ Dashboard is ONLINE at http://localhost"
else
    echo "⚠️  Dashboard is still not responding properly (might still be compiling). Please wait another minute and refresh."
fi

# 5. 使用 open 指令開啟瀏覽器 (僅開啟 Dashboard)
echo "🌐 Opening Dashboard..."
open http://localhost

echo "✅ Lite services started! (Airflow is NOT running)"
echo "鍵入任意鍵結束提示..."
read -k 1 -s
