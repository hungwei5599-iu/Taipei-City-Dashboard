# 開組件失敗與地圖互動問題整理

## 問題總結

目前的問題不是 AI 回答錯，而是前端流程把「開組件」、「開地圖圖層」、「zoom / highlight / popup」混在同一條流程裡。

現在使用者問問題後，流程大致是：

```txt
使用者問問題
↓
searchRelatedComponents()
↓
tryRunMapInteraction()
↓
resolveGuideMapTarget()
↓
router.push("/mapview")
↓
mapStore.openGuideLayer(target)
↓
mapStore.runGuideSpatialFocus(target, intent)
↓
如果 ranked[0] 且 target.openMode === "component"
才設定 mapStore.guideActiveComponentIndex
↓
askTWCCAI()
```

核心問題是：

```js
mapStore.guideActiveComponentIndex = target.componentIndex;
```

這一行只是把 component index 存進 store，**不等於真的開組件**。

如果 UI 沒有 watcher 或 action 去監聽 `guideActiveComponentIndex`，並呼叫原本「手動點擊組件卡片」的開啟流程，那組件不會真的打開。

---

## 目前四個案例的問題

## 1.「台北市目前急診人數最少的醫院是哪間」

### 預期行為

- 不要在地圖上標點。
- 不要 highlight 急診點位。
- 不要 popup。
- 應該開急診組件。
- AI 根據 chart data 回答哪間醫院急診人數最少。

### 目前錯誤原因

這題會命中 emergency target。

而目前 `resolveGuideEnhancementIntent()` 對 emergency 有這種邏輯：

```js
const needsRanking =
  /最少|最低|最快|推薦|排序|比較|top|best|least|rank/i.test(text) ||
  target?.moduleKey === "emergency";
```

所以只要是急診，幾乎一定會讓：

```js
needsRanking = true;
```

接著在 `runGuideSpatialFocus()` 裡：

```js
if (intent.needsAreaHighlight || intent.needsRanking) {
  this.updateGuideHighlightLayer(ranked.slice(0, 5));
}
```

所以「最少」會觸發 `needsRanking`，然後呼叫 `updateGuideHighlightLayer()`，導致地圖上被畫點或 highlight。

### 應該修改

排名型問題如果沒有明確要求地圖，就應該只開組件，不要跑地圖 highlight。

---

## 2.「我附近最近的急診醫院」

### 預期行為

- 使用者 GPS 應該被啟動。
- 應該找到最近急診醫院。
- 應該畫出「使用者位置 → 最近急診醫院」的線。
- 可以 zoom 到使用者與醫院之間的範圍。
- 可以開急診組件或急診資訊卡。

### 目前錯誤原因

目前 `setCurrentLocation()` 只是用：

```js
navigator.geolocation.getCurrentPosition(...)
```

這只能拿到使用者經緯度，但不會觸發 Mapbox 的定位控制器視覺效果。

你在 `initializeMapBox()` 裡有建立：

```js
const geoLocate = new mapboxGl.GeolocateControl({
  positionOptions: {
    enableHighAccuracy: true,
  },
  trackUserLocation: true,
  showUserHeading: true,
});
```

但目前沒有把 `geoLocate` 存進 store，也沒有在附近問題時呼叫：

```js
geoLocate.trigger();
```

所以系統可以算距離，但地圖上不會像使用者按定位按鈕那樣打開 GPS 藍點。

另外，目前也沒有畫線的 function，所以不會產生「使用者位置 → 最近醫院」的路線線段。

---

## 3.「新北最多藥局的地方」

### 預期行為

- zoom 到新北藥局最多的行政區。
- 畫出該行政區框線。
- 開藥局組件。
- AI 回答哪個地方最多藥局。

### 目前錯誤原因

#### 原因一：沒有真正開組件

目前只有：

```js
this.guideActiveComponentIndex = target.componentIndex;
```

但如果 UI 沒有 watcher 去接這個值，就不會真的開藥局組件。

#### 原因二：框線沒有實作

目前 `updateGuideHighlightLayer()` 是畫 circle：

```js
this.map.addLayer({
  id: "guide-highlight-layer",
  type: "circle",
  source: "guide-highlight-source",
  paint: {
    "circle-radius": 14,
    "circle-color": "#facc15",
    "circle-opacity": 0.35,
    "circle-stroke-color": "#facc15",
    "circle-stroke-width": 2,
  },
});
```

所以它適合點位資料，不適合行政區資料。

如果藥局最多的地方是行政區，應該畫 Polygon / MultiPolygon 的 fill + line，不是 circle。

---

## 4.「哪裡最多環保餐廳」

### 預期行為

- AI 回答大安區最多。
- 地圖 zoom 到大安區。
- 畫出大安區框線。
- 開環保餐廳組件。

### 目前錯誤原因

AI 可以回答，是因為 `askTWCCAI()` 有拿到 chart data。

但是地圖沒有動，通常代表 `tryRunMapInteraction()` 沒有成功找到對應 target。

目前 `resolveGuideMapTarget()` 的 hard keyword 只處理：

```js
if (target.moduleKey === "emergency") {
  return /急診|醫院|待診|等候|emergency|hospital|er/i.test(question);
}

if (target.moduleKey === "pharmacy") {
  return /藥局|藥房|藥|pharmacy/i.test(question);
}
```

也就是只有急診與藥局有硬匹配。

如果 `guide-map-target-registry.json` 裡沒有設定「環保餐廳」target，或 keywords 沒有包含「環保餐廳」，那：

```js
const target = await resolveGuideMapTarget(question, components);
if (!target) return null;
```

就會直接 return null。

後面就不會 zoom、不會框線、不會開組件。

---

# 真正需要修的三層

## 第一層：分清楚「開組件」與「開地圖」

目前 `tryRunMapInteraction()` 把很多事情混在一起。

應該先判斷問題是：

1. 純資料 / 排名問題：開組件，不開地圖圖層。
2. 附近 / 最近 / 距離問題：開 GPS、算距離、畫線。
3. 地圖 / 顯示 / 圖層問題：開地圖圖層。
4. 行政區排名問題：zoom 到行政區，畫框線，開組件。

### 建議新增判斷

```js
const shouldOpenComponentOnly = (question, target) => {
  const text = String(question || "");

  const rankingOrAnswerQuestion =
    /哪裡|哪個|哪間|最多|最少|最高|最低|排名|排行|概況|統計/i.test(text);

  const requiresSpatialMap =
    /附近|最近|距離|定位|GPS|路線|地圖|圖層|顯示|框線|zoom|放大/i.test(text);

  return target?.openMode === "component" &&
    rankingOrAnswerQuestion &&
    !requiresSpatialMap;
};
```

---

## 第二層：做一個真正的「開組件 action」

不要只寫：

```js
mapStore.guideActiveComponentIndex = target.componentIndex;
```

應該在 mapStore 裡新增明確 action：

```js
openGuideComponent(componentIndex) {
  this.guideActiveComponentIndex = componentIndex;
}
```

然後在 UI component 裡 watch：

```js
watch(
  () => mapStore.guideActiveComponentIndex,
  (componentIndex) => {
    if (!componentIndex) return;

    // 這裡要接你原本「手動點擊推薦組件卡片」的開啟邏輯
    openComponentByIndex(componentIndex);
  },
);
```

其中 `openComponentByIndex(componentIndex)` 不要重寫一套新的。  
應該使用專案裡原本「使用者手動點 component card」時呼叫的 function。

---

## 第三層：行政區排名要畫框線，不要畫 circle

目前 ranking 會呼叫：

```js
updateGuideHighlightLayer(ranked.slice(0, 5));
```

但這個 function 畫的是 circle。

應該新增行政區框線 function。

### 建議新增

```js
updateGuideBoundaryLayer(features) {
  if (!this.map) return;

  const geojson = {
    type: "FeatureCollection",
    features: features.filter((f) =>
      ["Polygon", "MultiPolygon"].includes(f.geometry?.type)
    ),
  };

  if (!geojson.features.length) return;

  if (this.map.getSource("guide-boundary-source")) {
    this.map.getSource("guide-boundary-source").setData(geojson);
  } else {
    this.map.addSource("guide-boundary-source", {
      type: "geojson",
      data: geojson,
    });

    this.map.addLayer({
      id: "guide-boundary-fill",
      type: "fill",
      source: "guide-boundary-source",
      paint: {
        "fill-color": "#facc15",
        "fill-opacity": 0.12,
      },
    });

    this.map.addLayer({
      id: "guide-boundary-line",
      type: "line",
      source: "guide-boundary-source",
      paint: {
        "line-color": "#facc15",
        "line-width": 4,
      },
    });
  }
}
```

然後在 `runGuideSpatialFocus()` 裡分流：

```js
if (intent.needsAreaHighlight) {
  const top = ranked.slice(0, 1);

  const isAreaFeature = ["Polygon", "MultiPolygon"].includes(
    top[0]?.geometry?.type
  );

  if (isAreaFeature) {
    this.updateGuideBoundaryLayer(top);
  } else {
    this.updateGuideHighlightLayer(top);
  }
}
```

不要再因為 `needsRanking` 就 highlight：

```js
// 不要這樣
if (intent.needsAreaHighlight || intent.needsRanking) {
  this.updateGuideHighlightLayer(ranked.slice(0, 5));
}
```

---

# 最小可救版 patch

## 1. 修改 `tryRunMapInteraction()`

```js
const shouldOpenComponentOnly = (question, target) => {
  const text = String(question || "");

  const rankingOrAnswerQuestion =
    /哪裡|哪個|哪間|最多|最少|最高|最低|排名|排行|概況|統計/i.test(text);

  const requiresSpatialMap =
    /附近|最近|距離|定位|GPS|路線|地圖|圖層|顯示|框線|zoom|放大/i.test(text);

  return target?.openMode === "component" &&
    rankingOrAnswerQuestion &&
    !requiresSpatialMap;
};

const tryRunMapInteraction = async (question, components) => {
  const target = await resolveGuideMapTarget(question, components);
  if (!target) return null;

  const intent = resolveGuideEnhancementIntent(question, target);
  const mapStore = useMapStore();

  if (router.currentRoute.value.name !== "mapview") {
    await router.push("/mapview");
  }

  if (shouldOpenComponentOnly(question, target)) {
    mapStore.openGuideComponent(target.componentIndex);

    return {
      tool_name: "frontend_component_open",
      status: "component_opened",
      target: target.id,
      componentIndex: target.componentIndex,
      intent,
    };
  }

  const layerOpenResult = await mapStore.openGuideLayer(target);

  const enhancementResult = shouldRunGuideEnhancement(intent)
    ? await mapStore.runGuideSpatialFocus(target, intent)
    : {
        status: "layer_opened",
        target: target.title || target.componentName,
        count: layerOpenResult.features.length,
      };

  return {
    tool_name: "frontend_two_layer_map_interaction",
    layer_1: {
      target: target.id,
      componentIndex: target.componentIndex,
      openedLayers: layerOpenResult.mapConfig.map(
        (item) => `${item.index}-${item.type}-${item.city}`,
      ),
    },
    layer_2: {
      intent,
      result: enhancementResult,
    },
  };
};
```

---

## 2. 在 mapStore 新增 action

```js
openGuideComponent(componentIndex) {
  this.guideActiveComponentIndex = componentIndex;
}
```

---

## 3. 修改 `runGuideSpatialFocus()`

把這段：

```js
if (intent.needsAreaHighlight || intent.needsRanking) {
  this.updateGuideHighlightLayer(ranked.slice(0, 5));
}
```

改成：

```js
if (intent.needsAreaHighlight) {
  this.updateGuideHighlightLayer(ranked.slice(0, 5));
}
```

這樣 ranking 題不會再自動畫點。

---

## 4. UI 要監聽 `guideActiveComponentIndex`

在負責顯示 / 開啟組件的 Vue component 裡加：

```js
watch(
  () => mapStore.guideActiveComponentIndex,
  (componentIndex) => {
    if (!componentIndex) return;

    openComponentByIndex(componentIndex);
  },
);
```

`openComponentByIndex()` 要接你專案裡原本手動點組件卡片的邏輯。

---

# 針對四個問題的目標行為

## 台北市目前急診人數最少的醫院是哪間

```txt
應該：開急診組件 + AI 回答
不應該：畫點、highlight、popup、畫圖層
```

## 我附近最近的急診醫院

```txt
應該：開 GPS + 找最近急診 + 畫使用者到醫院的線 + zoom
不應該：只 zoom 到醫院、不顯示 GPS、不畫線
```

## 新北最多藥局的地方

```txt
應該：開藥局組件 + zoom 到該行政區 + 畫行政區框線
不應該：只 zoom、不開組件、不畫框線
```

## 哪裡最多環保餐廳

```txt
應該：開環保餐廳組件 + zoom 到大安區 + 畫行政區框線
不應該：只有 AI 回答，地圖完全不動
```

---

# 最後結論

目前不能開組件的真正原因是：

```txt
程式只設定 guideActiveComponentIndex，
但沒有確認 UI 有沒有根據 guideActiveComponentIndex 去開啟組件。
```

而且目前 `tryRunMapInteraction()` 預設會先開地圖圖層，所以很多「應該開組件」的問題，都被導去畫圖層、zoom、highlight。

要修正的方向是：

```txt
1. 純排名 / 統計問題 → 開組件
2. 附近 / 最近問題 → GPS + 距離排序 + 畫線
3. 行政區最多 / 最少問題 → 開組件 + zoom + 框線
4. 明確要求地圖 / 圖層 → 才開 map layer
```
