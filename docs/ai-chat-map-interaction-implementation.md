# AI Chat Map Interaction Implementation

## 現在要解的問題

AI Chat 是一問一答，不能假設 LLM 有長期上下文，也不能期待它自己知道目前地圖位置、GPS 或已開啟的圖層。

所以目前設計改成：每一輪使用者提問時，前端都重新準備本輪 context：

1. `/vector/component` 找相關 component。
2. `/component/{id}/chart` 取 chart data。
3. 前端 map tool 依問題決定是否要開地圖；若需要使用目前位置，必須先詢問使用者是否開啟定位。
4. 把 chart data 和 map tool result 一起放進 `/ai/chat/twai` 的 system context。
5. LLM 只根據本輪 context 回答。

這樣使用者問「哪一間急診醫院離我最近？」時，若使用者同意定位且 GPS 成功，距離會由前端工具算好並提供給 LLM；若未取得定位，LLM 會根據 `locationStatus` 提醒使用者開啟定位或提供位置。

## 地圖互動主流程

```text
ChatBox
  -> chatStore.addQueryData()
  -> /vector/component
  -> tryRunMapInteraction()
  -> router.push("/mapview")
  -> mapStore.focusMapComponentFeatures(action)
  -> /component/{id}/chart
  -> /ai/chat/twai with database context + map tool context
```

注意：目前是先跑 map tool，再問 LLM。這是為了讓 LLM 文字回答拿得到「最近醫院、距離、GPS 狀態、是否空位篩選」。需要定位的互動不能靜默使用 fallback 當作使用者位置。

## Component 開關鏈

目前 dashboard 的地圖開關鏈是：

```text
DashboardComponent.vue
  input v-model="toggleOn"
  -> emits("toggle", value, props.config.map_config)

MapView.vue
  handleToggle(value, map_config)
  -> mapStore.addToMapLayerList(map_config)
  -> mapStore.turnOffMapLayerVisibility(map_config)

mapStore.js
  addToMapLayerList()
  -> fetchLocalGeoJson()
  -> addGeojsonSource()
  -> addMapLayer()
```

AI 自動開圖層也是走同一條路：

```js
mapStore.addToMapLayerList(action.mapConfig)
```

所以 AI 沒有自己重畫醫院點位，也沒有另外建立一套 Mapbox hospital layer。

## UI Toggle 同步

原本 `MapView.vue` 的 toggle 狀態存在 local `toggleOn`：

```js
toggleOn.hasMap[arrayIdx]
toggleOn.mapLayer[arrayIdx]
toggleOn.basicLayer[arrayIdx]
```

問題是：AI 用程式呼叫 `mapStore.addToMapLayerList()` 時，Mapbox layer 會打開，但 local toggle 不一定變成 true。

目前已改成：

```js
getToggleOn(Btn, BtnIndex, map_config)
```

它會同時檢查：

1. 使用者手動切換的 local toggle。
2. `mapStore.currentVisibleLayers` 裡是否已經有這個 component 的 layer id。

因此 AI 自動開啟圖層後，清單上的開關 UI 也會顯示為開啟。

## GPS、定位授權與 fallback

目前地圖已有定位能力：

- `MapContainer.vue` mount 時會呼叫 `mapStore.setCurrentLocation()`。
- `mapStore.initializeMapBox()` 有 Mapbox `GeolocateControl`。
- `mapStore.requestCurrentLocation()` 可在 AI map action 執行前取得一次瀏覽器 GPS。

新的原則是：只要 map action 需要存取使用者位置，不限急診，都必須先問使用者要不要開啟定位。使用者同意後才呼叫 browser geolocation；使用者不同意、瀏覽器拒絕、逾時或 GPS 不可用時，不把 fallback point 當作使用者位置。

優先順序：

```text
location-required action
  -> ask user to enable location
  -> browser GPS granted
  -> run location-based interaction
```

定位失敗或未授權時：

1. 可以打開相關既有 component layer。
2. 可以 zoom 到非個人化的預設視角或 component 範圍。
3. 不計算「離我最近」這類依賴目前位置的結果。
4. 不畫「目前位置連到目標點」的線。
5. map tool result 要明確帶回 `locationStatus`，讓 LLM 回答使用者需要開啟定位或提供位置。

急診可以保留台北車站附近作為非個人化預設視角：

```text
[121.5175, 25.0478]
```

但它只能用於地圖初始視角或一般展示，不能用來代表「我的位置」、不能拿來算最近急診，也不能拿來畫線。不再用板橋作為台北急診問題的預設位置。

## 急診查詢邏輯

使用資料：

```text
public/mapData/hackathon_component_9_flood_risk_ready.geojson
```

主要欄位：

```text
hospital_name
patient_count
waiting_time
data_time
geometry.coordinates
```

如果使用者問：

```text
哪一間急診醫院離我最近？
```

不套用 `patient_count === 0`，而是找最近急診醫院。

如果使用者問：

```text
哪一間急診醫院有空位？
台北目前有哪些急診是空的？
```

才套用：

```js
featureFilter: { key: "patient_count", operator: "==", value: 0 }
```

並在 Mapbox layer 上使用：

```js
["==", ["to-number", ["get", "patient_count"]], 0]
```

## 行政區交叉比對

目前穩定版只有在取得使用者 GPS 後才會做：

```text
browser GPS
  -> metrotaipei_town.geojson
  -> Turf booleanPointInPolygon 找所在行政區
  -> 從同行政區 features 裡找最近點
  -> zoom 到該行政區 bounds
  -> 主動 popup 最近點
```

如果找不到行政區，會退回用所有符合條件的 features 找最近點。若沒有取得 GPS，則不進入這段最近點流程，只做非定位的圖層展示與提示。

## Map Tool Result

`mapStore.focusMapComponentFeatures(action)` 現在不只回傳 true/false，會回傳：

```js
{
  actionId,
  title,
  referencePoint,
  districtName,
  featureFilter,
  targetFeature,
  distanceMeters,
  matchedFeatureCount,
  usedDistrictFilter,
  locationStatus
}
```

`chatStore` 會整理成：

```js
{
  tool_name: "frontend_map_nearest_feature",
  location_status,
  nearest_feature: {
    name,
    patient_count,
    waiting_time,
    data_time,
    coordinates,
    distance_meters,
    distance_text
  }
}
```

沒有取得定位時，`nearest_feature` 應為 `null` 或省略，不應用 fallback 產生距離文字。

這份資料會跟 chart data 一起送進 LLM。

## 目前先不做的事

「目前位置連線到最近幾個點」技術上做得到，但只有在使用者同意定位且成功取得 GPS 後才可以做。沒有 GPS 時不使用 fallback 畫線，也不顯示從預設點出發的假路線。

這會需要新增 temporary line layer。因為前一版自畫 Mapbox layer 曾造成 lifecycle 問題，目前先不做。

現階段穩定範圍：

1. 打開既有 component layer。
2. 同步 UI toggle。
3. 有 GPS 時才算最近點；沒有 GPS 時只做非定位展示與提示。
4. 行政區比對。
5. zoom 到行政區。
6. 主動 popup。
7. 把 map tool 結果交給 LLM 回答。

## 待做

1. 若要只顯示該行政區的醫院，最好把 district 欄位預先寫進 GeoJSON，再用 Mapbox filter 篩 district。
2. 若要畫連線，下一階段應新增可清理的 temporary line layer，並確保離開 AI interaction 時完整移除；前提是使用者已同意定位且成功取得 GPS。
3. 更多 component 需要補 action registry，不能只處理急診和藥局。
4. popup 若要更完整，擴充 `MapPopup.vue` 或對應 map config 的 `property`。

## 驗證

```bash
cd Taipei-City-Dashboard-FE
npm run build
```
