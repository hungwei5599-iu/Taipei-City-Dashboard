# Fix 3：地圖互動改為 ui_actions 驅動

## 0. 結論

這次不要在 fix 3 之外再開一套修法。  
目前整理出的地圖互動問題，全部應該收斂到同一個主軸：

```txt
BE / AI guide 回傳 answer + ui_actions + interaction_model。
FE 不再用 mapConfig + runGuideSpatialFocus 猜使用者意圖。
FE 只負責依照 ui_actions 執行 UI 動作。
```

短期可以保留 FE fallback，先把現有 bug 修掉；但正式主流程要以 `ui_actions` 為準。  
`openGuideLayer()` 和 `runGuideSpatialFocus()` 只能保留為 legacy fallback，不能再繼續擴大。

---

## 1. 目標架構

### 1.1 BE / AI guide 的責任

BE / AI guide 必須判斷答案需要哪些 UI 動作，並回傳可執行的 action list。

最小回傳格式：

```json
{
  "answer": "目前急診待診人數最少的是 A 醫院。",
  "ui_actions": [
    {
      "type": "chart.focus_component",
      "payload": {
        "component_key": "emergency_component",
        "city": "taipei"
      }
    },
    {
      "type": "map.clear_ai_overlay",
      "payload": {
        "scope": "previous_ai_result"
      }
    },
    {
      "type": "map.fly_to",
      "payload": {
        "center": [121.5432, 25.0478],
        "zoom": 15,
        "duration": 700
      }
    },
    {
      "type": "map.open_card",
      "payload": {
        "coordinate": [121.5432, 25.0478],
        "title": "A 醫院",
        "summary": "目前急診待診人數最少。",
        "fields": [
          { "label": "待診人數", "value": "3" },
          { "label": "資料時間", "value": "2026-05-02 14:30" }
        ]
      }
    }
  ],
  "interaction_model": null
}
```

### 1.2 FE 的責任

FE 只做三件事：

1. 收到 `ui_actions` 後依序執行。
2. 如果沒有 `ui_actions`，才走舊的 fallback intent parser。
3. 把 legacy fallback 維持可用，但不再把新互動規則塞進 `runGuideSpatialFocus()`。

---

## 2. ui_actions 契約

### 2.1 `chart.focus_component`

用途：開啟對應 dashboard component。  
重點：不能只更新 store index，必須觸發 MapView 原本「手動點開組件」的完整流程。

```json
{
  "type": "chart.focus_component",
  "payload": {
    "component_id": 123,
    "component_key": "pharmacy_resource_distribution",
    "city": "metrotaipei"
  }
}
```

FE 實作要求：

```js
watch(
  () => mapStore.guideActiveComponent,
  async (payload) => {
    if (!payload?.componentIndex && !payload?.component && !payload?.component_id) {
      return;
    }

    await nextTick();

    if (payload.component) {
      openComponent(payload.component);
      return;
    }

    if (payload.component_id) {
      openComponentById(payload.component_id, payload.city);
      return;
    }

    openComponentByIndex(payload.componentIndex, payload.city);
  },
  { deep: true },
);
```

### 2.2 `map.clear_ai_overlay`

用途：清除上一輪 AI guide 造成的圖層、popup、highlight、route、候選點。  
每一輪新的 AI 地圖互動前都應該先執行。

```json
{
  "type": "map.clear_ai_overlay",
  "payload": {
    "scope": "previous_ai_result"
  }
}
```

短期 hotfix 必須讓 `mapStore` 記住 AI guide 開過哪些圖層：

```js
state: () => ({
  guideActiveComponent: null,
  guideActiveComponentIndex: null,
  guideActiveMapConfig: [],
  guideActiveLayerIds: [],
  guidePopups: [],
})
```

### 2.3 `map.fly_to`

用途：移動到單一點位。

```json
{
  "type": "map.fly_to",
  "payload": {
    "center": [121.5432, 25.0478],
    "zoom": 15,
    "duration": 700
  }
}
```

### 2.4 `map.fit_bounds`

用途：移動到一個區域或多點結果的範圍。

```json
{
  "type": "map.fit_bounds",
  "payload": {
    "bounds": [[121.51, 25.00], [121.57, 25.05]],
    "padding": 90,
    "duration": 700
  }
}
```

### 2.5 `map.open_card`

用途：主動開一個 popup / info card。  
重點：不依賴使用者點擊，也不要求先存在 points layer。

```json
{
  "type": "map.open_card",
  "payload": {
    "coordinate": [121.5432, 25.0478],
    "feature_id": "hospital_a",
    "title": "A 醫院",
    "summary": "目前急診待診 3 人。",
    "fields": [
      { "label": "待診人數", "value": "3" },
      { "label": "資料時間", "value": "2026-05-02 14:30" }
    ]
  }
}
```

### 2.6 `map.open_cards`

用途：同時開多個結果 popup。  
建議只作為 optional；多結果情境優先用 `map.add_points` + `panel.open_candidate_list`。

```json
{
  "type": "map.open_cards",
  "payload": {
    "cards": [
      {
        "coordinate": [121.5432, 25.0478],
        "title": "A 醫院",
        "summary": "等待時間 5 分鐘"
      }
    ]
  }
}
```

### 2.7 `map.add_points`

用途：顯示多個點位，例如急診前 5、附近藥局、附近環保餐廳。

```json
{
  "type": "map.add_points",
  "payload": {
    "sourceId": "ai-guide-pharmacy-points",
    "layerId": "ai-guide-pharmacy-symbol",
    "cluster": true,
    "geojson": {
      "type": "FeatureCollection",
      "features": []
    }
  }
}
```

FE 判斷 `payload.cluster === true` 時使用 Mapbox cluster source：

```js
this.map.addSource(sourceId, {
  type: "geojson",
  data: geojson,
  cluster: true,
  clusterMaxZoom: 14,
  clusterRadius: 50,
});
```

原則：

```txt
急診醫院數量少，通常不需要 cluster。
藥局、環保餐廳是大量點位，需要 cluster。
```

### 2.8 `map.add_boundary`

用途：顯示行政區統計結果的 top 1 polygon。  
重點：不要把全部行政區丟進來。

```json
{
  "type": "map.add_boundary",
  "payload": {
    "sourceId": "ai-guide-boundary",
    "fillLayerId": "ai-guide-boundary-fill",
    "lineLayerId": "ai-guide-boundary-line",
    "geojson": {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "properties": {
            "district": "大安區",
            "rank": 1,
            "value": 128
          },
          "geometry": {
            "type": "Polygon",
            "coordinates": []
          }
        }
      ]
    }
  }
}
```

### 2.9 `map.add_route`

用途：使用者明確問「怎麼去」、「路線」、「導航」時才畫線。

```json
{
  "type": "map.add_route",
  "payload": {
    "route_type": "straight_line",
    "coordinates": [
      [121.5300, 25.0300],
      [121.5432, 25.0478]
    ]
  }
}
```

沒有問路線時，不要畫線。  
如果沒有實際路網服務，可以先用 `route_type = "straight_line"`。

### 2.10 `panel.open_candidate_list`

用途：多結果時開候選清單，避免同時噴太多 popup。

```json
{
  "type": "panel.open_candidate_list",
  "payload": {
    "title": "急診等待時間最短前 5 間",
    "items": [
      {
        "rank": 1,
        "title": "A 醫院",
        "summary": "等待時間 5 分鐘",
        "coordinate": [121.5432, 25.0478]
      }
    ]
  }
}
```

---

## 3. 決策表

| 使用者問題類型 | component | points layer | cluster | fly / bounds | popup | boundary | route |
|---|---:|---:|---:|---:|---:|---:|---:|
| 分布概況 / 資源概況 / 檢測概況 | yes | no | no | no | no | no | no |
| 急診人數最少哪間 | yes | no | no | yes | yes | no | no |
| 急診等待最短前 5 | yes | yes | no | yes | optional | no | no |
| 最近急診 / 最近藥局 | yes | yes | 藥局 yes | yes | yes | no | only route question |
| 哪個區最多藥局 | yes | no | no | yes | yes | yes top 1 | no |
| 每萬人藥局數最高 | yes | no | no | yes | yes | yes top 1 | no |
| 哪裡最多環保餐廳 | yes | no or yes | optional | yes | yes | yes top 1 | no |
| 顯示附近環保餐廳 | yes | yes | yes | yes | optional | no | no |
| 淨水場濁度最高 | yes | no or yes | no | yes | yes | no | no |

---

## 4. 10 個驗收案例

### 4.1 只問概況：只開 component

適用問題：

```txt
環保餐廳分布概況
藥局資源分布概況
淨水場水質檢測概況
```

正確動作：

```json
[
  {
    "type": "chart.focus_component",
    "payload": {
      "component_key": "water_quality_overview",
      "city": "metrotaipei"
    }
  }
]
```

驗收重點：

```txt
要開啟對應組件。
不要開圖層。
不要 zoom。
不要 popup。
```

### 4.2 台北市目前人數最少的急診醫院是哪間

這是單點答案，不需要 add_points。

正確動作：

```txt
chart.focus_component
map.clear_ai_overlay
map.fly_to
map.open_card
```

禁止：

```txt
不要 map.add_points
不要畫 circle
不要開整個急診圖層
```

### 4.3 台北市急診等待時間最短的前 5 間醫院

這是多點答案。

正確動作：

```txt
chart.focus_component
map.clear_ai_overlay
map.add_points
map.fit_bounds
panel.open_candidate_list
interaction_model
```

建議用候選清單呈現 5 間，不要預設開 5 個 popup。

### 4.4 離我最近的藥局在哪

這題需要 user location。

正確動作：

```txt
chart.focus_component
map.clear_ai_overlay
map.add_points cluster true
map.fly_to
map.open_card
```

如果使用者有問「怎麼去」或「路線」，才加：

```txt
map.add_route
```

### 4.5 哪個區藥局最多

這是行政區統計，不是藥局點位問題。

正確動作：

```txt
chart.focus_component
map.clear_ai_overlay
map.add_boundary
map.fit_bounds
map.open_card
```

BE 必須提供 top 1 行政區的 polygon / bounds / centroid。

### 4.6 每萬人藥局數最高的是哪個區

這是 ranking by `pharmacy_per_10k`。

正確動作：

```txt
chart.focus_component
map.clear_ai_overlay
map.add_boundary
map.fit_bounds
map.open_card
```

驗收重點：

```txt
只畫 top 1 行政區。
不要 cluster 藥局點位。
不要把全部行政區都畫出來。
```

### 4.7 哪裡最多環保餐廳

這題不是 component-only。  
它需要開組件、zoom 到行政區、畫 boundary、開統計 popup。

正確動作：

```json
[
  {
    "type": "chart.focus_component",
    "payload": {
      "component_key": "eco_restaurant_distribution",
      "city": "taipei"
    }
  },
  {
    "type": "map.clear_ai_overlay",
    "payload": { "scope": "previous_ai_result" }
  },
  {
    "type": "map.add_boundary",
    "payload": {
      "sourceId": "ai-guide-boundary",
      "fillLayerId": "ai-guide-boundary-fill",
      "lineLayerId": "ai-guide-boundary-line",
      "geojson": {
        "type": "FeatureCollection",
        "features": []
      }
    }
  },
  {
    "type": "map.fit_bounds",
    "payload": {
      "bounds": [[121.51, 25.00], [121.57, 25.05]],
      "padding": 90,
      "duration": 700
    }
  },
  {
    "type": "map.open_card",
    "payload": {
      "coordinate": [121.535, 25.026],
      "title": "大安區",
      "summary": "大安區是環保餐廳最多的行政區。",
      "fields": [
        { "label": "環保餐廳數", "value": "待 BE 填入" }
      ]
    }
  }
]
```

### 4.8 顯示附近環保餐廳

這是多點附近查詢。

正確動作：

```txt
chart.focus_component
map.clear_ai_overlay
map.add_points cluster true
map.fit_bounds
panel.open_candidate_list
```

### 4.9 淨水場濁度最高

這是單一設施結果。

正確動作：

```txt
chart.focus_component
map.clear_ai_overlay
map.fly_to 或 map.fit_bounds
map.open_card
```

如果結果是多個淨水場，再改用 `map.add_points` + `panel.open_candidate_list`。

### 4.10 第二輪 AI guide 不應殘留上一輪圖層

每一輪新的地圖互動前都必須清理：

```txt
AI guide points
AI guide boundary
AI guide route
AI guide popup
AI guide highlight
上一輪 openGuideLayer 開過的 guide layer
```

驗收方式：

```txt
先問「附近藥局」。
再問「急診人數最少哪間」。
地圖上不應殘留上一輪藥局 cluster / popup / highlight。
```

---

## 5. FE 過渡實作策略

### 5.1 chatStore

短期邏輯：

```txt
如果 aiResult 有 ui_actions：
  執行 mapStore.executeUiActions(ui_actions)

如果 aiResult 沒有 ui_actions：
  才走目前 FE fallback intent parser
```

建議實作：

```js
const runAiUiActionsIfAvailable = async (aiResult) => {
  const mapStore = useMapStore();
  const actions = aiResult?.ui_actions || aiResult?.data?.ui_actions || [];
  const interactionModel =
    aiResult?.interaction_model || aiResult?.data?.interaction_model;

  if (!actions.length && !interactionModel) return false;

  if (router.currentRoute.value.name !== "mapview") {
    await router.push("/mapview");
  }

  await mapStore.waitForMapReady();

  if (actions.length) {
    await mapStore.executeUiActions(actions);
  }

  if (interactionModel) {
    mapStore.setInteractionModel(interactionModel);
  }

  return true;
};
```

在 `addQueryData()` 中：

```js
const aiResult = await askTWCCAI(
  newChatData.content,
  recommendComponents.value,
  mapToolResult,
);

await runAiUiActionsIfAvailable(aiResult);

if (aiResult?.content || aiResult?.answer || aiResult?.data?.answer) {
  addChatData({
    role: "bot",
    content: aiResult.content || aiResult.answer || aiResult.data.answer,
    relations: recommendComponents.value,
  });
}
```

### 5.2 mapStore

mapStore 要補齊這些 public actions：

```txt
executeUiActions(actions)
executeUiAction(action)
openGuideComponent(payload)
clearAiOverlay(scope)
flyTo(payload)
fitBounds(payload)
openGuideCoordinatePopup(payload)
openGuideFeatureCards(cards)
addAiGuidePoints(payload)
addBoundary(payload)
addGuideRoute(payload)
setInteractionModel(model)
```

`runGuideSpatialFocus()` 加上註解並降級：

```js
// Legacy fallback only.
// New AI map interaction should use executeUiActions(ui_actions).
async runGuideSpatialFocus(target, intent = {}) {
  ...
}
```

### 5.3 MapView.vue

MapView 必須 watch `guideActiveComponent`，並呼叫既有的開組件流程。  
不要只 watch `guideActiveComponentIndex` 後自己拼半套 UI。

建議 payload：

```js
openGuideComponent(payload) {
  this.guideActiveComponent = payload;
  this.guideActiveComponentIndex = payload?.componentIndex;
}
```

chatStore 執行 component action 前，應盡量把推薦組件物件一起帶進 payload：

```js
const matchedComponent = findMatchedComponent(target, components);

mapStore.openGuideComponent({
  component: matchedComponent,
  componentIndex: target.componentIndex,
  componentId: matchedComponent?.id,
  city: matchedComponent?.city || target.city || "metrotaipei",
});
```

---

## 6. BE / AI guide 必備資料

### 6.1 單點結果

```json
{
  "title": "A 醫院",
  "coordinate": [121.5432, 25.0478],
  "summary": "目前急診待診 3 人。",
  "fields": []
}
```

### 6.2 多點結果

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [121.5432, 25.0478]
      },
      "properties": {
        "rank": 1,
        "name": "A 醫院",
        "tooltip_title": "A 醫院",
        "tooltip_lines": ["等待 5 分鐘"],
        "card_title": "A 醫院",
        "card_summary": "等待時間最短。",
        "card_fields": []
      }
    }
  ]
}
```

### 6.3 行政區結果

```json
{
  "district": "大安區",
  "centroid": [121.535, 25.026],
  "bounds": [[121.51, 25.00], [121.57, 25.05]],
  "polygon": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": []
    },
    "properties": {
      "district": "大安區",
      "rank": 1,
      "value": 128
    }
  }
}
```

沒有座標、bounds、polygon、centroid，FE 不可能穩定完成 zoom / popup / boundary。

---

## 7. 實作順序

### Phase 1：補 FE executor 主線

```txt
1. executeUiActions
2. chart.focus_component
3. map.clear_ai_overlay
4. map.fly_to
5. map.fit_bounds
6. map.open_card
7. MapView watcher
```

解決：

```txt
組件開不了
AI 有答案但地圖不動
popup 不跳
舊圖層 / 舊 popup 殘留
急診單點結果亂畫圖層
```

### Phase 2：補多點與 cluster

```txt
1. map.add_points
2. bindAiLayerInteractions
3. cluster option
4. panel.open_candidate_list
5. map.open_cards optional
```

解決：

```txt
急診前 5 間
附近藥局
附近環保餐廳
點位 hover / click 互動
```

### Phase 3：補行政區 polygon

```txt
1. map.add_boundary
2. map.fit_bounds for polygon
3. BE 回 top 1 district polygon / bounds / centroid
```

解決：

```txt
藥局哪一區最多
每萬人藥局數最高
哪裡最多環保餐廳
```

### Phase 4：降級 FE fallback

```txt
1. BE 有 ui_actions 時，完全不跑 runGuideSpatialFocus
2. BE 沒 ui_actions 時，才跑舊 fallback
3. 最後移除 needsRanking 觸發 spatial focus 的新規則
```

---

## 8. 最終驗收標準

```txt
1. chart.focus_component 會真的開啟組件，不只是改 store。
2. 每輪 AI 互動前會清掉上一輪 AI overlay。
3. 單點答案能主動 zoom + popup，不依賴 click event。
4. 多點答案能顯示 points，藥局 / 環保餐廳支援 cluster。
5. 行政區統計只畫 top 1 polygon，不畫全部行政區。
6. route 只在使用者明確問路線時出現。
7. BE 有 ui_actions 時，FE 不再走 runGuideSpatialFocus。
8. 沒有 ui_actions 時，舊 fallback 仍可暫時運作。
```

一句話版本：

```txt
fix 3 要把地圖互動從「FE 猜意圖」改成「BE / AI guide 明確下 ui_actions」。
這 10 個問題就是 fix 3 的驗收案例。
```
