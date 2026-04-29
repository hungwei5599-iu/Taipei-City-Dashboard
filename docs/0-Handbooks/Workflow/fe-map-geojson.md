# FE 地圖 GeoJSON 實作指南（C1 藝文活動地圖）

> C1 的 DB 只有 `latitude` / `longitude` 浮點欄位，沒有 `wkb_geometry`。
> 前端需要把 API 資料轉成 GeoJSON，再透過現有 mapStore 機制渲染 symbol layer。

---

## 方案選擇

| 方案 | 說明 | 建議 |
|------|------|------|
| **A：動態 API 資料** | 呼叫 `/api/v1/hackathon/cultural-events` → 轉 GeoJSON → 寫入 mapStore | ✅ 推薦 |
| B：靜態 geojson 檔案 | 放 `/public/mapData/hackathon_c1.geojson`，走現有 `source: "geojson"` 讀檔流程 | 快速 prototype 可用 |

---

## 方案 A：動態 API 資料（正式做法）

### 1. API 轉 GeoJSON 函式

新增 `src/assets/utils/culturalEventGeoJSON.js`：

```js
export function toGeoJSON(apiData) {
  return {
    type: 'FeatureCollection',
    features: apiData
      .filter(item => item.latitude && item.longitude)
      .map(item => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(item.longitude), parseFloat(item.latitude)]
        },
        properties: {
          title: item.title,
          location_name: item.location_name,
          event_time: item.event_time,
          on_sales: item.on_sales
        }
      }))
  }
}
```

### 2. mapStore 動態注入 GeoJSON

在 `mapStore.js` 裡，`addMapLayerFromData()` 函式（約第 895 行）已支援動態 GeoJSON。呼叫方式：

```js
import { toGeoJSON } from '@/assets/utils/culturalEventGeoJSON'

// 在組件 mounted 或 watch 資料後：
const res = await fetch('/api/v1/hackathon/cultural-events')
const json = await res.json()
const geojson = toGeoJSON(json.data)

// 透過 mapStore 注入（走既有流程）
mapStore.map.addSource('hackathon-c1-source', {
  type: 'geojson',
  data: geojson
})

mapStore.map.addLayer({
  id: 'hackathon-c1-symbol',
  type: 'symbol',
  source: 'hackathon-c1-source',
  layout: {
    'icon-image': 'cross_normal',    // 已在 mapStore 初始化時載入的 icon
    'icon-size': 1,
    'icon-allow-overlap': true
  }
})
```

> 可用的 icon 名稱：`bus`, `metro`, `triangle_green`, `triangle_white`, `bike_green`, `bike_orange`, `bike_red`, `cross_bold`, `cross_normal`, `cctv`, `live`（見 MapLegend.vue `returnIcon()`）

### 3. Popup 點擊

```js
mapStore.map.on('click', 'hackathon-c1-symbol', (e) => {
  const { title, location_name, event_time } = e.features[0].properties
  const [lng, lat] = e.features[0].geometry.coordinates

  new mapboxgl.Popup()
    .setLngLat([lng, lat])
    .setHTML(`
      <strong>${title}</strong><br/>
      📍 ${location_name}<br/>
      🕐 ${event_time}
    `)
    .addTo(mapStore.map)
})

mapStore.map.on('mouseenter', 'hackathon-c1-symbol', () => {
  mapStore.map.getCanvas().style.cursor = 'pointer'
})
mapStore.map.on('mouseleave', 'hackathon-c1-symbol', () => {
  mapStore.map.getCanvas().style.cursor = ''
})
```

---

## 方案 B：靜態 geojson（快速 prototype）

1. 從 DE DB export geojson：

```bash
psql -h 10.101.3.177 -p 5433 -U postgres -d dashboard -c "
COPY (
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', json_agg(
      json_build_object(
        'type', 'Feature',
        'geometry', json_build_object('type','Point','coordinates', json_build_array(longitude, latitude)),
        'properties', json_build_object('title', title, 'location_name', location_name, 'event_time', event_time)
      )
    )
  )
  FROM hackathon_component_1_event_map_ready
  WHERE latitude IS NOT NULL
) TO STDOUT;" > Taipei-City-Dashboard-FE/public/mapData/hackathon_c1.geojson
```

2. `map_config` 的 `index` 設為 `hackathon_c1`，`source` 設為 `"geojson"`，`type` 設為 `"symbol"` → 走現有讀檔流程。

---

## 注意事項

- `mapStore.map` 在 `map.on('load')` 之後才可以呼叫 `addSource` / `addLayer`
- 若 layer 已存在，需先 `removeLayer` + `removeSource` 再重新加（熱重載常見問題）
- C1 座標範圍：lat `22.0~25.1`，lng `120.2~121.8`，超出範圍的資料 DE 已過濾掉

---

*更新：2026-04-22 ｜ 參考：mapStore.js L447-673, MapLegend.vue*
