# AI Chat 兩層式地圖互動規格

## 目標

目前 AI chat 的地圖互動把兩件事混在一起：

1. AI 判斷使用者在問哪個 dashboard component，並把對應 map layer 打開。
2. 若使用者問「最近」、「GPS」、「附近」、「空位」、「區域」等，才進一步做距離排序、畫線、行政區 highlight。

這兩件事需要拆開。第一層應該永遠只負責「開正確 component/map layer，並讓旁邊資訊卡能看到資料」。第二層才根據問題意圖升級成空間分析。

預期使用者問：

```txt
目前幫我找台北市最少人的醫院
```

AI 不應只回「AI 建議圖層 / 急診待診人數 / undefined | 即時資料」。它應該先知道這題對應：

```txt
急診待診人數和等候時間
```

然後第一層打開這個 component 對應 map layer。第二層再因為使用者問「最少人」而做排序或篩選；如果使用者問「最近」或「我附近」，才要求 GPS、算距離、畫線、做區域 highlight。

---

## 現況問題

目前 `chatStore.js` 已經有以下材料：

- `/vector/component` 可以找相關 dashboard component。
- `buildDatabaseContext()` 可以抓 component chart data 給 AI。
- `aiMapActionRegistry` 有急診與藥局的 map action。
- `tryRunMapInteraction()` 會依照問題決定要 `openAIMapComponent()` 或 `focusMapComponentFeatures()`。
- `mapStore.focusMapComponentFeatures()` 已經能做 GPS、找最近點、畫多條線、區域 highlight。

問題是「開圖層」和「做空間分析」的責任邊界不夠清楚：

- AI 命中 component 之後，沒有一個穩定的第一層 action contract。
- `focusMapComponentFeatures()` 同時負責開圖層、等 layer ready、定位、篩選、找最近、畫線、開 popup。
- 使用者只是問某個主題時，也可能被導向空間分析流程。
- 使用者問排序型問題，例如「最少人」、「最多」、「最低」、「最高」，不一定需要 GPS，卻需要 deterministic 排序 tool。

---

## 新架構

### Layer 1：Component / Map Layer Resolver

第一層永遠先做，責任只有：

1. 根據使用者問題找到正確 component。
2. 找到該 component 對應的 map layer。
3. 切到 map view。
4. 打開 map layer。
5. fit bounds 到 layer 資料範圍。
6. 打開旁邊 component card 或 map popup 的基本資料。
7. 回傳 layer metadata 給第二層使用。

第一層不做：

- 不要求 GPS。
- 不算最近點。
- 不畫使用者位置到目標點的線。
- 不做行政區 highlight。
- 不把「空位」、「最少人」、「最近」混在開 layer 裡。

建議函式命名：

```js
resolveGuideMapTarget(question, components)
openGuideMapLayer(target)
```

建議回傳：

```ts
type GuideMapTarget = {
  moduleKey: string;
  componentIndex: string;
  componentName: string;
  city: "taipei" | "metrotaipei";
  mapConfig: Array<object>;
  layerId: string;
  sourceId: string;
  sourceType: "geojson" | "vector";
  dataSemantics: {
    primaryNameKey: string;
    sortableMetrics: string[];
    locationKeys?: {
      lng?: string;
      lat?: string;
    };
  };
};
```

### Layer 2：Spatial / Ranking Enhancer

第二層只在問題需要時執行，責任是：

1. 排序：最少人、最多、最低、最高。
2. 空間：最近、附近、GPS、距離、路線。
3. 篩選：有空床、有空位、某行政區、台北市。
4. 視覺輔助：畫線、區域 highlight、候選清單、比較表。

建議函式命名：

```js
resolveGuideEnhancementIntent(question)
runGuideMapEnhancement(target, intent)
```

建議 intent：

```ts
type GuideEnhancementIntent = {
  needsDistance: boolean;
  needsUserLocation: boolean;
  needsAreaHighlight: boolean;
  needsRanking: boolean;
  ranking?: {
    metric: string;
    order: "asc" | "desc";
  };
  filters?: Array<{
    key: string;
    operator: "==" | "!=" | ">" | ">=" | "<" | "<=";
    value: string | number | boolean;
  }>;
};
```

---

## 目標 Component Mapping

第一層要能從使用者問題穩定對應到下列 component，而不是只回模糊的「AI 建議圖層」。

| 使用者語意 | component 顯示名 | componentIndex | mapLayerIndex | Layer 2 常見 enhancement |
| --- | --- | --- | --- | --- |
| 急診、醫院、待診、等候、最少人 | 急診待診人數和等候時間 | `hackathon_component_9_er_overview` | `hackathon_component_9_flood_risk_ready` | `patient_count ASC`、`waiting_time ASC`、附近、距離、區域 highlight |
| 水質、淨水場、飲用水、自來水 | 淨水場水質檢測概況 | 待補 catalog | 待補 catalog | 異常值、監測站 tooltip/card、區域篩選 |
| 環保餐廳、綠色餐廳、餐廳分布 | 環保餐廳分布概況 | 待補 catalog | 待補 catalog | 附近、cluster、行政區篩選 |
| 藥局、藥房、藥局資源 | 藥局資源分布概況 | 待補 component 或現有藥局 component | `hackathon_component_7_pharmacy_map_ready` | 附近、距離、cluster、區域缺口 |

注意：

- 急診與藥局目前已有可用 mapData。
- 淨水場與環保餐廳需要補齊 component catalog 與 map layer index；不要在程式中寫假的 index。
- 第一層 mapping 不是取代 `/vector/component`，而是補上「可互動地圖主題」的穩定 registry，避免 vector 找到 chart 但不知道要開哪個 map layer。

---

## 問題分類規則

### 只需要 Layer 1

這類問題只打開 component/map layer：

```txt
打開急診待診人數和等候時間
看一下藥局資源分布
顯示環保餐廳分布
我要看淨水場水質檢測概況
```

結果：

1. 開 map view。
2. 打開對應 layer。
3. fit bounds。
4. 旁邊 component card 顯示資料。
5. AI 用 chart/context 簡短說明目前看到什麼。

### Layer 1 + 排序

這類問題不一定需要 GPS：

```txt
台北市最少人的醫院
哪間急診等待時間最短
哪個藥局資源最少的區域
水質檢測哪個站異常最高
```

結果：

1. Layer 1 開正確 component/map layer。
2. Layer 2 用已載入 features 或後端 tool 做 deterministic 排序。
3. 開 top result card。
4. 顯示候選清單或比較表。

急診例：

```ts
ranking: {
  metric: "patient_count",
  order: "asc"
}
```

### Layer 1 + GPS / 距離 / 區域

這類問題才需要 `focusMapComponentFeatures()` 的能力：

```txt
找我附近最少人的急診
從我現在位置最近的藥局
大安區附近哪間急診等待最短
幫我標出這附近的環保餐廳
```

結果：

1. Layer 1 開正確 component/map layer。
2. Layer 2 解析定位或行政區。
3. 若是「我附近 / GPS / 目前位置」，才要求 browser location。
4. 排序候選點。
5. 畫線、fit bounds、區域 highlight。
6. 開 top result card。

---

## chatStore 建議拆法

現在：

```js
const mapAction = await tryRunMapInteraction(question, recommendComponents.value);
```

建議改成：

```js
const target = resolveGuideMapTarget(question, recommendComponents.value);

let layerOpenResult = null;
let enhancementResult = null;

if (target) {
  layerOpenResult = await openGuideMapLayer(target);

  const intent = resolveGuideEnhancementIntent(question);
  if (shouldRunGuideEnhancement(intent)) {
    enhancementResult = await runGuideMapEnhancement(target, intent);
  }
}
```

保留目前材料，但責任改成：

| 現有函式 | 新責任 |
| --- | --- |
| `resolveAIMapActionForQuestion()` | 改成 `resolveGuideMapTarget()`，只決定 component/map layer |
| `openAIMapComponent()` | Layer 1 開 layer |
| `focusMapComponentFeatures()` | Layer 2 空間分析，不再承擔一般開 layer |
| `shouldRunSpatialMapInteraction()` | 改成 `resolveGuideEnhancementIntent()` |
| `formatMapToolContext()` | 拆成 `formatLayerContext()` + `formatEnhancementContext()` |

---

## mapStore 建議拆法

目前 `focusMapComponentFeatures()` 混合了：

1. 開 component。
2. 等 map layer ready。
3. 要 GPS。
4. 套 feature filter。
5. 找行政區。
6. 找最近點。
7. 畫線。
8. highlight 區域。
9. 開 popup。

建議拆成：

```js
async openGuideLayer(target)
async getGuideLayerFeatures(target)
applyGuideFeatureFilter(layerId, filters)
rankGuideFeatures(features, ranking, referencePoint)
async runGuideSpatialFocus(target, intent)
openGuideFeatureCard(feature)
drawGuideReferenceLines(referencePoint, features)
highlightGuideArea(referencePoint)
```

Layer 1 只呼叫：

```js
openGuideLayer(target)
getGuideLayerFeatures(target)
fitMapToFeatures(features)
```

Layer 2 才呼叫：

```js
requestCurrentLocation()
rankGuideFeatures()
drawGuideReferenceLines()
highlightGuideArea()
openGuideFeatureCard()
```

---

## UI Action Contract

Layer 1 action：

```json
{
  "id": "cmd_open_er_layer",
  "type": "guide.open_component_layer",
  "payload": {
    "moduleKey": "emergency",
    "componentIndex": "hackathon_component_9_er_overview",
    "componentName": "急診待診人數和等候時間",
    "mapLayerIndex": "hackathon_component_9_flood_risk_ready",
    "city": "metrotaipei"
  }
}
```

Layer 2 action：

```json
{
  "id": "cmd_rank_er_lowest_patient_count",
  "type": "guide.rank_features",
  "payload": {
    "layerId": "hackathon_component_9_flood_risk_ready-symbol-metrotaipei",
    "metric": "patient_count",
    "order": "asc",
    "limit": 5,
    "filters": [
      {
        "key": "city_scope",
        "operator": "==",
        "value": "Taipei"
      }
    ]
  }
}
```

空間 enhancement action：

```json
{
  "id": "cmd_spatial_er_nearest",
  "type": "guide.spatial_focus",
  "payload": {
    "layerId": "hackathon_component_9_flood_risk_ready-symbol-metrotaipei",
    "requiresUserLocation": true,
    "ranking": {
      "metric": "distance_meters",
      "order": "asc"
    },
    "drawLines": true,
    "highlightArea": true
  }
}
```

---

## 急診範例流程

使用者問：

```txt
目前幫我找台北市最少人的醫院
```

流程：

1. `/vector/component` 找到 `急診待診人數和等候時間`。
2. `resolveGuideMapTarget()` 對應到 `hackathon_component_9_er_overview` 與 `hackathon_component_9_flood_risk_ready`。
3. Layer 1 開急診 map layer。
4. `resolveGuideEnhancementIntent()` 判斷：

```json
{
  "needsDistance": false,
  "needsUserLocation": false,
  "needsAreaHighlight": false,
  "needsRanking": true,
  "ranking": {
    "metric": "patient_count",
    "order": "asc"
  },
  "filters": [
    {
      "key": "city_scope",
      "operator": "==",
      "value": "Taipei"
    }
  ]
}
```

5. Layer 2 對急診 features 做 `patient_count ASC`。
6. 開第一名醫院 card。
7. 顯示候選清單。
8. AI 回答最少人的急診醫院與資料時間。

不需要 GPS，也不需要畫線。

使用者改問：

```txt
找我附近最少人的急診
```

差異：

```json
{
  "needsDistance": true,
  "needsUserLocation": true,
  "needsAreaHighlight": true,
  "needsRanking": true,
  "ranking": {
    "metric": "patient_count",
    "order": "asc"
  }
}
```

這時才走定位、距離、畫線和區域 highlight。

---

## 實作優先順序

1. 建立 `guideMapTargetRegistry`，先支援四個主題名稱，急診與藥局填實際 map layer，淨水場與環保餐廳先標 `pending`。
2. 把 `tryRunMapInteraction()` 拆成 Layer 1 與 Layer 2。
3. 把 `focusMapComponentFeatures()` 拆成可重用小函式，保留原功能但只給 Layer 2 用。
4. 新增 ranking intent：`最少人` -> `patient_count ASC`、`等候最短` -> `waiting_time ASC`。
5. 新增候選清單與 card payload，對齊 `互動增強_spec.md`。
6. 補 `guide.open_component_layer` / `guide.rank_features` / `guide.spatial_focus` 的 action trace，方便 chatlog debug。
7. 後端再補 deterministic tool：`rank_emergency_hospitals`，避免完全依賴前端 feature 排序。

---

## 驗收案例

| 問題 | 預期 Layer 1 | 預期 Layer 2 |
| --- | --- | --- |
| 打開急診待診人數和等候時間 | 開急診 component/map layer | 不跑 |
| 台北市最少人的醫院 | 開急診 component/map layer | `patient_count ASC` + `city_scope == Taipei` |
| 找我附近最少人的急診 | 開急診 component/map layer | GPS + 距離 + `patient_count ASC` + 畫線 |
| 顯示藥局資源分布概況 | 開藥局 component/map layer | 不跑 |
| 我附近的藥局 | 開藥局 component/map layer | GPS + 距離 + cluster 或候選清單 |
| 看淨水場水質檢測概況 | 開淨水場 component/map layer | 若 catalog pending，回待補 warning |
| 附近環保餐廳 | 開環保餐廳 component/map layer | GPS + cluster + 候選清單 |

