# 複合型災難危險區域＋接送家人路線 — 實作計劃

**最後更新：2026-04-23**
**狀態：Phase 1 + mapStore 缺口已補齊，剩 DB migration + 組件 config**

---

## 概念說明

一個 `map_legend` 類型的地圖組件，針對政府官員提供：
1. 三層災難圖層疊加（淹水潛勢、道路中斷、豪雨強度）
2. 民眾/官員可在地圖點擊兩點，查詢避開淹水區的安全路線
3. 用 @turf/turf 偵測路線與淹水 polygon 的危險交叉點

**受眾**：政府官員（主）、一般民眾（次，透過浮動按鈕）
**災難組合**：颱風/豪雨 + 淹水 + 道路中斷
**路由引擎**：Mapbox Directions API（直接 fetch，不裝 SDK）

---

## 技術決策

| 議題 | 決定 |
|------|------|
| 組件類型 | `map_legend`，`chart_config.types: ["MapLegend"]` |
| 路線 UI | 浮動按鈕（左下角）→ Teleport Drawer（RoutePlannerDialog.vue） |
| 路線避險邏輯 | Mapbox Directions API + turf.lineIntersect() 偵測危險點（非自動繞路） |
| 淹水資料 | data.taipei Dataset 121550，KML 格式，需 ogr2ogr 轉換 |
| 道路中斷資料 | TDX 交通部 OAuth2 API（Phase 3） |
| 雨量資料 | CWA 中央氣象署 opendata API（Phase 3） |

---

## 檔案清單

### 已完成（Phase 1）

| 檔案 | 用途 |
|------|------|
| `db-sample-data/disaster-layers-migration.sql` | PostGIS `disaster_layers` table schema |
| `db-sample-data/import_flood_geojson.sh` | KML→GeoJSON→PostGIS 匯入腳本 |
| `BE/app/models/disasterLayer.go` | `ListDisasterLayers()` model，支援 scenario/kinds/bbox 過濾 |
| `BE/app/controllers/disaster.go` | `GET /api/v1/disaster/layers` 回傳 GeoJSON FeatureCollection |
| `BE/app/routes/router.go` | 已加入 `configureDisasterRoutes()` |
| `FE/src/components/dialogs/RoutePlannerDialog.vue` | 路線查詢 Drawer，含 Mapbox Directions API 呼叫 + Turf 危險段偵測 |
| `FE/src/components/map/MapContainer.vue` | 已加入浮動按鈕（左下角，點擊開啟 Drawer） |
| `FE/src/store/dialogStore.js` | 已加入 `routePlanner: false` |

### 待實作（Phase 2）

| 檔案 | 用途 | 說明 |
|------|------|------|
| `FE/src/store/mapStore.js` | 加入路線規劃 state + actions | 見下方規格 |
| `FE/src/assets/configs/mapbox/` | 新增組件 map_config | 三層圖層設定 |
| Dashboard 組件 config | 在 DB 新增組件記錄 | 見下方 SQL |

### 待實作（Phase 3）

| 任務 | 說明 |
|------|------|
| TDX OAuth2 串接 | 申請 token，DAG 每 15 分鐘拉道路中斷資料 |
| CWA 豪雨警報 DAG | 拉 W-A0030 豪雨特報，存進 PostGIS |
| FE 動態 fetch | mapStore 改為從 `/api/v1/disaster/layers` 動態載入替代 hardcode |

---

## Phase 2 實作規格

### 1. mapStore.js 需新增的 state 與 actions

```javascript
// state 新增（找 state: () => ({ 區塊加入）
routePlannerStart: null,   // [lng, lat] 或 null
routePlannerEnd: null,     // [lng, lat] 或 null
routeResult: null,         // GeoJSON LineString
routeDangerPoints: [],     // turf.lineIntersect 結果
disasterLayers: null,      // GeoJSON FeatureCollection（從 API 或 hardcode）

// actions 新增
setRoutePlannerPoint(lngLat) {
  // 第一次點擊設 start，第二次設 end，第三次重置
  if (!this.routePlannerStart) {
    this.routePlannerStart = lngLat
  } else if (!this.routePlannerEnd) {
    this.routePlannerEnd = lngLat
  } else {
    this.routePlannerStart = lngLat
    this.routePlannerEnd = null
    this.routeResult = null
    this.routeDangerPoints = []
  }
},

setRouteResult(routeGeojson, dangerPoints) {
  this.routeResult = routeGeojson
  this.routeDangerPoints = dangerPoints
  // 在地圖上畫路線（addRouteLayer）
  this.addRouteToMap(routeGeojson, dangerPoints)
},

clearRoutePlanner() {
  this.routePlannerStart = null
  this.routePlannerEnd = null
  this.routeResult = null
  this.routeDangerPoints = []
  // 移除地圖上的路線圖層
  if (this.map.getLayer('route-line')) this.map.removeLayer('route-line')
  if (this.map.getSource('route-source')) this.map.removeSource('route-source')
},

addRouteToMap(routeGeojson, dangerPoints) {
  // 先移除舊的
  if (this.map.getLayer('route-line')) this.map.removeLayer('route-line')
  if (this.map.getLayer('danger-points')) this.map.removeLayer('danger-points')
  if (this.map.getSource('route-source')) this.map.removeSource('route-source')
  if (this.map.getSource('danger-source')) this.map.removeSource('danger-source')

  // 畫路線（綠色）
  this.map.addSource('route-source', { type: 'geojson', data: routeGeojson })
  this.map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route-source',
    paint: { 'line-color': '#2ecc71', 'line-width': 4 }
  })

  // 畫危險點（橘色）
  if (dangerPoints.length > 0) {
    this.map.addSource('danger-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: dangerPoints }
    })
    this.map.addLayer({
      id: 'danger-points',
      type: 'circle',
      source: 'danger-source',
      paint: { 'circle-color': '#f39c12', 'circle-radius': 8, 'circle-stroke-color': 'white', 'circle-stroke-width': 2 }
    })
  }
}
```

### 2. 地圖點擊事件（mapStore.js initializeMapBox 區塊）

在 `map.on('load', ...)` 內加入：

```javascript
map.on('click', (e) => {
  // 只有在 routePlanner dialog 開啟時才捕捉點擊
  const dialogStore = useDialogStore()
  if (!dialogStore.dialogs.routePlanner) return
  const { lng, lat } = e.lngLat
  this.setRoutePlannerPoint([lng, lat])
})
```

### 3. 組件 DB config（在 dashboard-demo.sql 或 pgAdmin 執行）

```sql
INSERT INTO components (index, name, chart_config, map_config, query_type, time_from, time_to, update_freq, update_freq_unit, source, short_desc, long_desc, use_case, links, contributors)
VALUES (
  'compound_disaster_map',
  '複合型災難風險地圖',
  '{
    "types": ["MapLegend"],
    "color": ["#1565C0", "#D32F2F", "#F57C00"]
  }',
  '[
    {
      "index": "flood_inundation_130mm",
      "type": "fill",
      "title": "淹水潛勢（130mm/h）",
      "paint": { "fill-color": "#1565C0", "fill-opacity": 0.45 }
    },
    {
      "index": "road_closure",
      "type": "line",
      "title": "道路中斷",
      "paint": { "line-color": "#D32F2F", "line-width": 4, "line-dasharray": [2, 1] }
    },
    {
      "index": "rainfall_station",
      "type": "circle",
      "title": "即時雨量",
      "paint": {
        "circle-color": "#F57C00",
        "circle-radius": ["interpolate", ["linear"], ["get", "intensity"], 0, 4, 100, 20]
      }
    }
  ]',
  'time',
  'now',
  'now',
  1,
  'day',
  '內政部水利署、TDX、CWA',
  '疊加淹水潛勢、道路中斷、即時雨量三層資料，支援避災路線查詢',
  '複合型颱風豪雨災難情境下的風險總覽與民眾接送路線規劃',
  '[]',
  '[]'
);
```

---

## 資料來源

| 資料 | 來源 | 端點 | 格式 | 狀態 |
|------|------|------|------|------|
| 淹水潛勢 130mm/h | data.taipei Dataset 121550 | `https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=2954e8d4-cb67-40c9-8ab8-019ad10b758e` | KML（需 ogr2ogr 轉 GeoJSON） | ✅ 已下載 flood_130mm.kml |
| 淹水潛勢 100mm/h | data.taipei Dataset 121550 | `rid=4b14c3a0-fcf2-48d4-9c93-e27784cae29d` | KML | ⬜ 待下載 |
| 淹水潛勢 78.8mm/h | data.taipei Dataset 121550 | `rid=173adcbe-0f2e-4941-b2bc-127c09db0391` | KML | ⬜ 待下載 |
| 道路中斷 | TDX 交通部 | `https://tdx.transportdata.tw/api/basic/v2/Road/...` | JSON | ⬜ 需申請 OAuth2 |
| 豪雨警報 | CWA 中央氣象署 | `https://opendata.cwa.gov.tw/` W-A0030 | JSON | ⬜ 需申請 API Key |

---

## 執行順序（給下一個 agent）

### Step 1：執行 DB migration
```bash
docker exec -i postgres-data psql -U postgres -d dashboard \
  < Taipei-City-Dashboard/db-sample-data/disaster-layers-migration.sql
```

### Step 2：匯入淹水資料
```bash
# flood_130mm.kml 已在專案根目錄
ogr2ogr -f GeoJSON flood_130mm.geojson flood_130mm.kml
chmod +x Taipei-City-Dashboard/db-sample-data/import_flood_geojson.sh
DB_DASHBOARD_HOST=localhost \
  ./Taipei-City-Dashboard/db-sample-data/import_flood_geojson.sh \
  flood_130mm.geojson 130mm
```

### Step 3：補 mapStore.js
依照上方「Phase 2 實作規格 §1」，在 `FE/src/store/mapStore.js` 加入：
- `routePlannerStart/End/Result/DangerPoints/disasterLayers` state
- `setRoutePlannerPoint()` / `setRouteResult()` / `clearRoutePlanner()` / `addRouteToMap()` actions
- map click 事件監聽（只在 routePlanner dialog 開啟時觸發）

### Step 4：新增組件 DB 記錄
執行上方 §3 的 SQL，將組件加入 Dashboard。

### Step 5：啟動前端驗證
```bash
cd Taipei-City-Dashboard/Taipei-City-Dashboard-FE
npm run dev
# 開啟瀏覽器，確認：
# 1. 地圖左下角有「directions」浮動按鈕
# 2. 點擊後開啟 RoutePlannerDialog Drawer
# 3. 地圖點擊兩點後能計算路線
```

---

## KPI / Demo 腳本

**政府官員視角（主）**
- 儀表板顯示台北/新北，三層災難圖層同時疊加
- 圖例可分別開關淹水/道路/雨量

**民眾路線查詢（次）**
- 點擊左下角藍色路線按鈕
- 地圖點擊 A（家）→ B（學校）
- 顯示原始最快路線（紅色危險段標示）vs 安全路線（綠色）

**政府官員 KPI 面板**
- 受影響道路條數
- 淹水面積 km²
- 危險路線交叉點數量
