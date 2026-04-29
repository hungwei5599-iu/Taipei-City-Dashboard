#!/bin/zsh

# 台北市大數據儀表板啟動腳本 (macOS)
# 轉換自: https://github.com/hungwei5599-iu/Taipei-City-Dashboard/blob/team/daniel/start_dashboard.bat

echo "🚀 Starting Taipei City Dashboard..."

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
echo "📦 Starting Database Stack..."
cd "$SCRIPT_DIR/docker"
docker compose -f docker-compose-db.yaml up -d

# 3. 啟動 DE (Airflow) 環境
echo "🏗️ Starting DE (Airflow) Environment..."
cd "$SCRIPT_DIR/Taipei-City-Dashboard-DE/docker/develop"
docker compose up -d

# 4. 啟動主要 Dashboard Stack
echo "📦 Starting Dashboard Core Stack..."
cd "$SCRIPT_DIR/docker"
# 先強制重新啟動以套用 Nginx 與 Vite 的設定變更
docker compose down dashboard-fe nginx
docker compose up -d
docker compose restart nginx

echo "⏳ Waiting for services to start (15s)..."
sleep 15

# 驗證連線狀態
echo "🔍 Checking status..."
if curl -s -I http://localhost | grep -q "200 OK\|304 Not Modified"; then
    echo "✅ Dashboard is ONLINE at http://localhost"
else
    echo "⚠️  Dashboard is still not responding properly (might still be compiling). Please wait another minute and refresh."
fi

# 5. 使用 open 指令開啟瀏覽器
echo "🌐 Opening Dashboard and Airflow..."
open http://localhost
open http://localhost:8090/airflow-sit

echo "✅ All services started!"
echo "鍵入任意鍵結束提示..."
read -k 1 -s
